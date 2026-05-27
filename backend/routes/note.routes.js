'use strict';

const express = require('express');
const { z } = require('zod');
const { requireAuth } = require('../middleware/auth');
const { aiLimiter } = require('../middleware/rateLimit');
const { getDb } = require('../config/db');
const env = require('../config/env');
const { HttpError } = require('../middleware/error');
const ai = require('../services/ai.service');
const { retrieveLessonContext, groundingTier } = require('../services/rag.service');
const lessons = require('../services/lesson.service');
const educationalContext = require('../services/educational-context.service');
const domainDetection = require('../services/domain-detection.service');
const materialUnderstanding = require('../services/material-understanding.service');
const topicResolver = require('../services/topic-resolver.service');
const learningMaps = require('../services/learning-map.service');
const notesAudio = require('../services/notes-audio.service');
const gamification = require('../services/gamification.service');

const router = express.Router();
const nowIso = () => new Date().toISOString();

function generationScope(body = {}) {
  const sourceScope = String(body.sourceScope || body.source_scope || 'material').toLowerCase();
  if (!['material', 'chapter', 'chunk'].includes(sourceScope)) throw new HttpError(400, 'invalid_source_scope');
  return {
    sourceScope,
    chapterId: body.chapter_id ? parseInt(body.chapter_id, 10) : null,
    chunkId: body.chunk_id ? parseInt(body.chunk_id, 10) : null,
  };
}

function validateScope(db, userId, materialId, scope) {
  if (scope.sourceScope === 'chapter') {
    if (!Number.isInteger(scope.chapterId)) throw new HttpError(400, 'missing_chapter_id');
    const row = db.prepare(`
      SELECT c.id, c.title
      FROM chapters c
      JOIN materials m ON m.id = c.material_id
      WHERE c.id=? AND c.material_id=? AND m.user_id=?
    `).get(scope.chapterId, materialId, userId);
    if (!row) throw new HttpError(404, 'chapter_not_found');
    return { title: row.title };
  }
  if (scope.sourceScope === 'chunk') {
    if (!Number.isInteger(scope.chunkId)) throw new HttpError(400, 'missing_chunk_id');
    const row = db.prepare(`
      SELECT ch.id, ch.heading, ch.chapter_title, ch.section_title, ch.slide_title
      FROM chunks ch
      JOIN materials m ON m.id = ch.material_id
      WHERE ch.id=? AND ch.material_id=? AND m.user_id=?
    `).get(scope.chunkId, materialId, userId);
    if (!row) throw new HttpError(404, 'chunk_not_found');
    return { title: row.heading || row.section_title || row.slide_title || row.chapter_title || 'Selected section' };
  }
  return { title: null };
}

function cleanTopic(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 100);
}

function isGenericTopic(value) {
  return topicResolver.isGenericTopic(value) || /^\d+$/.test(String(value || '').trim());
}

function parseKeywords(value) {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed.filter(Boolean).map(String) : [];
  } catch (_) {
    return [];
  }
}

function scopedTopicRows(db, materialId, scope) {
  if (scope.sourceScope === 'chapter' && Number.isInteger(scope.chapterId)) {
    return db.prepare(`SELECT text, chapter_title, heading, slide_title, section_title, keywords_json
                       FROM chunks WHERE material_id=? AND chapter_id=? ORDER BY idx LIMIT 12`)
      .all(materialId, scope.chapterId);
  }
  if (scope.sourceScope === 'chunk' && Number.isInteger(scope.chunkId)) {
    return db.prepare(`SELECT text, chapter_title, heading, slide_title, section_title, keywords_json
                       FROM chunks WHERE material_id=? AND id=? ORDER BY idx LIMIT 1`)
      .all(materialId, scope.chunkId);
  }
  return db.prepare(`SELECT text, chapter_title, heading, slide_title, section_title, keywords_json
                     FROM chunks WHERE material_id=? ORDER BY idx LIMIT 16`).all(materialId);
}

function sourceDerivedTopic(userId, material, scope, explicitQuery, scopeTitle) {
  const understanding = materialUnderstanding.understandGeneralFromDb(userId, material.id, {
    explicitQuery,
    scopeTitle,
    title: material && material.title,
    sourceScope: scope.sourceScope,
    chapterId: scope.chapterId,
    chunkId: scope.chunkId,
  });
  return {
    topic: understanding.topic || 'Study Notes from Uploaded Material',
    source: understanding.source || 'fallback_general',
    confidence: understanding.confidence || 0.3,
    understanding,
  };
}

router.get('/', requireAuth, (req, res, next) => {
  try {
    const db = getDb();
    const folder = req.query.folder;
    const rows = folder
      ? db.prepare('SELECT id, material_id, folder, title, body_md, lesson_json, source_map_json, tags_json, updated_at FROM notes WHERE user_id=? AND folder=? ORDER BY updated_at DESC').all(req.user.id, folder)
      : db.prepare('SELECT id, material_id, folder, title, body_md, lesson_json, source_map_json, tags_json, updated_at FROM notes WHERE user_id=? ORDER BY updated_at DESC').all(req.user.id);
    const folders = db.prepare('SELECT folder, COUNT(*) AS count FROM notes WHERE user_id=? GROUP BY folder').all(req.user.id);
    res.json({ notes: rows.map(lessons.prepareStoredNote), folders });
  } catch (e) { next(e); }
});

router.post('/', requireAuth, (req, res, next) => {
  try {
    const { title, body_md, folder, tags, material_id } = req.body || {};
    if (!title) throw new HttpError(400, 'missing_title');
    const db = getDb();
    let ownedMaterialId = null;
    if (material_id) {
      const m = db.prepare('SELECT id FROM materials WHERE id=? AND user_id=?').get(material_id, req.user.id);
      if (!m) throw new HttpError(404, 'material_not_found');
      ownedMaterialId = m.id;
    }
    const cleanBody = lessons.extractMarkdownFromModelOutput(body_md || '');
    const r = db.prepare(`INSERT INTO notes (user_id, material_id, folder, title, body_md, lesson_json, source_map_json, tags_json, created_at, updated_at)
                          VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
      req.user.id, ownedMaterialId, folder || 'General',
      title, cleanBody, null, null, JSON.stringify(tags || []), nowIso(), nowIso()
    );
    res.json({ id: r.lastInsertRowid });
  } catch (e) { next(e); }
});

router.post('/:id/audio', requireAuth, aiLimiter, (req, res, next) => {
  try {
    const noteId = parseInt(req.params.id, 10);
    if (!Number.isInteger(noteId)) throw new HttpError(400, 'invalid_note_id');
    const job = notesAudio.createNoteAudioJob(req.user.id, noteId, {
      style: req.body && req.body.style || 'brief',
      voice: req.body && req.body.voice || 'default',
      speed: req.body && req.body.speed || 'normal',
      regenerate: !!(req.body && req.body.regenerate),
    });
    res.status(202).json({
      job_id: job.id,
      status: job.status,
      progress: job.progress,
      message: 'Generating note audio...',
    });
  } catch (e) { next(e); }
});

router.get('/:id/audio', requireAuth, (req, res, next) => {
  try {
    const noteId = parseInt(req.params.id, 10);
    if (!Number.isInteger(noteId)) throw new HttpError(400, 'invalid_note_id');
    const wantsMeta = req.query.meta === '1' || req.query.meta === 'true';
    const row = notesAudio.latestAudio(req.user.id, noteId, req.query.style || 'brief');
    if (!row && wantsMeta) {
      const db = getDb();
      const note = db.prepare('SELECT id FROM notes WHERE id=? AND user_id=?').get(noteId, req.user.id);
      if (!note) throw new HttpError(404, 'note_not_found');
      res.json({
        note_id: noteId,
        style: String(req.query.style || 'brief').toLowerCase(),
        status: 'missing',
        message: 'No audio generated yet.',
      });
      return;
    }
    if (!row) throw new HttpError(404, 'audio_not_found', 'No audio has been generated for this note yet.');
    if (wantsMeta) {
      res.json(notesAudio.publicAudioResult(row));
      return;
    }
    res.setHeader('Content-Type', 'audio/wav');
    res.sendFile(row.audio_path);
  } catch (e) { next(e); }
});

router.get('/:id', requireAuth, (req, res, next) => {
  try {
    const db = getDb();
    const n = db.prepare('SELECT * FROM notes WHERE id=? AND user_id=?').get(parseInt(req.params.id, 10), req.user.id);
    if (!n) throw new HttpError(404, 'not_found');
    res.json(lessons.prepareStoredNote(n));
  } catch (e) { next(e); }
});

router.put('/:id', requireAuth, (req, res, next) => {
  try {
    const db = getDb();
    const n = db.prepare('SELECT id FROM notes WHERE id=? AND user_id=?').get(parseInt(req.params.id, 10), req.user.id);
    if (!n) throw new HttpError(404, 'not_found');
    const { title, body_md, folder, tags } = req.body || {};
    const hasBody = Object.prototype.hasOwnProperty.call(req.body || {}, 'body_md');
    const cleanBody = hasBody ? lessons.extractMarkdownFromModelOutput(body_md || '') : null;
    db.prepare(`UPDATE notes
                SET title=COALESCE(?,title),
                    body_md=COALESCE(?,body_md),
                    lesson_json=CASE WHEN ? THEN NULL ELSE lesson_json END,
                    source_map_json=CASE WHEN ? THEN NULL ELSE source_map_json END,
                    folder=COALESCE(?,folder),
                    tags_json=COALESCE(?,tags_json),
                    updated_at=?
                WHERE id=?`)
      .run(title || null, cleanBody, hasBody ? 1 : 0, hasBody ? 1 : 0, folder || null, tags ? JSON.stringify(tags) : null, nowIso(), n.id);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.delete('/:id', requireAuth, (req, res, next) => {
  try {
    const db = getDb();
    const r = db.prepare('DELETE FROM notes WHERE id=? AND user_id=?').run(parseInt(req.params.id, 10), req.user.id);
    res.json({ ok: r.changes > 0 });
  } catch (e) { next(e); }
});

router.post('/generate', requireAuth, aiLimiter, async (req, res, next) => {
  try {
    const { material_id, query } = req.body || {};
    if (!material_id) throw new HttpError(400, 'missing_material_id');
    const scope = generationScope(req.body || {});
    const db = getDb();
    const m = db.prepare('SELECT id, title FROM materials WHERE id=? AND user_id=?').get(material_id, req.user.id);
    if (!m) throw new HttpError(404, 'material_not_found');
    const scopeInfo = validateScope(db, req.user.id, material_id, scope);
    const requestedTopicInfo = sourceDerivedTopic(req.user.id, m, scope, query, scopeInfo.title);
    const requestedTopic = requestedTopicInfo.topic;
    const domainInfo = domainDetection.detectMaterialDomain(req.user.id, material_id, { hint: requestedTopic });
    await ai.assertModelsAvailable({ generation: true, embedding: true, feature: 'notes' });
    let topicInfo = { topic: requestedTopic, confidence: requestedTopicInfo.confidence || domainInfo.confidence || 0.5, source: requestedTopicInfo.source || 'material_title', alternatives: [] };
    if (domainDetection.shouldUseCuratedCs(domainInfo)) {
      topicInfo = await topicResolver.resolveTopic({
        materialId: material_id,
        hint: requestedTopic,
        feature: 'notes',
        minConfidence: 0.24,
      });
      if (!topicInfo.topic || topicInfo.confidence < 0.24) {
        throw new HttpError(422, 'topic_resolution_low_confidence', 'I could not safely identify the real topic from this material. Please choose a topic and try again.', {
          rejected_topic: topicInfo.rejectedHint || requestedTopic || null,
          candidates: topicInfo.alternatives || [],
          source_title: scopeInfo.title || m.title,
        });
      }
    }
    const resolvedTopic = topicInfo.topic || requestedTopic;
    const preRagOutline = requestedTopicInfo.understanding && requestedTopicInfo.understanding.sourceOutline || null;
    const focusTerms = materialUnderstanding.focusTermsForTopic(resolvedTopic, preRagOutline);
    const avoidTerms = materialUnderstanding.competingTermsForTopic(resolvedTopic, preRagOutline);
    const rag = await retrieveLessonContext(material_id, resolvedTopic, {
      feature: 'notes',
      sourceScope: scope.sourceScope,
      chapterId: scope.chapterId,
      chunkId: scope.chunkId,
      focusTopic: resolvedTopic,
      focusTerms,
      avoidTerms,
      includeSystem: domainDetection.shouldUseCuratedCs(domainInfo),
    });
    const tier = groundingTier(rag.uploaded || rag);
    const uploadedChunks = rag.uploaded && Array.isArray(rag.uploaded.chunks) ? rag.uploaded.chunks : [];
    const sourceOutline = materialUnderstanding.buildSourceOutline(uploadedChunks, {
      explicitQuery: query || resolvedTopic,
      hint: resolvedTopic,
      title: m.title,
      materialTitle: m.title,
      scopeTitle: scopeInfo.title,
      domainInfo,
    });
    const education = env.KNOWLEDGE_CONTEXT_ENABLED && env.KNOWLEDGE_USE_FOR_NOTES
      ? educationalContext.buildEducationalContext({
        userId: req.user.id,
        materialId: material_id,
        topic: resolvedTopic,
        query: resolvedTopic,
        feature: 'notes',
        ragResult: rag,
        domainInfo,
        audienceLevel: 'beginner',
      })
      : null;
    const educationalContextPrompt = education
      ? educationalContext.formatEducationalContextForPrompt(education, { maxChars: env.KNOWLEDGE_CONTEXT_MAX_CHARS })
      : '(Curated educational context is disabled.)';
    let lesson = await lessons.generateEducationalLesson({
      topic: resolvedTopic,
      title: scopeInfo.title || m.title,
      materialTitle: m.title,
      chunks: uploadedChunks,
      groundingTier: tier,
      educationalContextPrompt,
      curatedTopicId: education && education.curatedKnowledge && education.curatedKnowledge.id,
      domainInfo,
      domain: domainInfo.domain,
      sourceOutline,
      focusTerms,
      avoidTerms,
    });
    lesson.topic = resolvedTopic;
    lesson.sourceMaterial = lesson.sourceMaterial || {};
    lesson.sourceMaterial.title = scopeInfo.title || m.title;
    let quality = lessons.scoreLesson(lesson, { domainInfo, topic: resolvedTopic, chunks: uploadedChunks, sourceOutline });
    let drift = materialUnderstanding.detectTopicDrift(lessons.lessonToMarkdown(lesson), {
      focusTopic: resolvedTopic,
      sourceOutline,
      focusTerms,
      competingTerms: avoidTerms,
    });
    if (!quality.passed || quality.genericFailure || drift.drifted) {
      const fallback = lessons.generalMaterialLesson(
        resolvedTopic,
        scopeInfo.title || m.title,
        tier,
        uploadedChunks.map(c => c.id).filter(Boolean),
        uploadedChunks,
        { domainInfo, topic: resolvedTopic, sourceOutline, focusTerms, avoidTerms, materialTitle: m.title }
      );
      fallback.topic = resolvedTopic;
      fallback.sourceMaterial = fallback.sourceMaterial || {};
      fallback.sourceMaterial.title = scopeInfo.title || m.title;
      const fallbackQuality = lessons.scoreLesson(fallback, { domainInfo, topic: resolvedTopic, chunks: uploadedChunks, sourceOutline });
      const fallbackDrift = materialUnderstanding.detectTopicDrift(lessons.lessonToMarkdown(fallback), {
        focusTopic: resolvedTopic,
        sourceOutline,
        focusTerms,
        competingTerms: avoidTerms,
      });
      if (fallbackQuality.passed && !fallbackQuality.genericFailure && !fallbackDrift.drifted) {
        lesson = fallback;
        quality = fallbackQuality;
        drift = fallbackDrift;
      }
    }
    if (!quality.passed || quality.genericFailure || drift.drifted) {
      throw new HttpError(502, 'lesson_quality_failed', 'The generated lesson was too generic, so I did not save it. Try again with a more specific topic.', {
        resolved_topic: resolvedTopic,
        quality,
        drift,
        candidates: topicInfo.alternatives || [],
      });
    }
    const md = lessons.lessonToMarkdown(lesson);
    if (!md) throw new HttpError(502, 'ai_empty_response', 'The AI returned an empty note. Try again.');
    const lessonJson = JSON.stringify(lesson);
    const sourceMapJson = JSON.stringify({
      ...lessons.collectSourceMap(lesson),
      resolved_topic: resolvedTopic,
      topic_confidence: topicInfo.confidence,
      topic_source: topicInfo.topic_source || topicInfo.source,
      source_title: scopeInfo.title || m.title,
      source_scope: scope.sourceScope,
      chapter_id: scope.chapterId,
      chunk_id: scope.chunkId,
      source_label: rag.sourceLabel,
      domain: domainInfo,
      candidates: topicInfo.alternatives || [],
      educational_context: education && education.trace || null,
      curated_topic: education && education.curatedKnowledge && education.curatedKnowledge.id || null,
      uploaded_chunk_count: uploadedChunks.length,
      system_chunk_count: rag.system && Array.isArray(rag.system.chunks) ? rag.system.chunks.length : 0,
      source_outline: {
        mainTopic: sourceOutline.mainTopic,
        keyConcepts: sourceOutline.keyConcepts,
        meaningfulSections: sourceOutline.meaningfulSections,
      },
      drift,
    });
    const r = db.prepare(`INSERT INTO notes (user_id, material_id, folder, title, body_md, lesson_json, source_map_json, tags_json, created_at, updated_at)
                          VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
      req.user.id, material_id, m.title,
      resolvedTopic, md, lessonJson, sourceMapJson, JSON.stringify(['ai-generated', 'lesson']), nowIso(), nowIso()
    );
    db.prepare(`INSERT INTO study_events (user_id, kind, ref_id, duration_s, occurred_at) VALUES (?,?,?,?,?)`)
      .run(req.user.id, 'reading', r.lastInsertRowid, 60, nowIso());
    const reward = gamification.award(req.user.id, 'notes_generated', 'note', r.lastInsertRowid, {
      idempotencyKey: `${req.user.id}:notes_generated:material:${material_id}:scope:${scope.sourceScope}:chapter:${scope.chapterId || 'all'}:chunk:${scope.chunkId || 'all'}`,
      metadata: { material_id, chapter_id: scope.chapterId || null, chunk_id: scope.chunkId || null, source_scope: scope.sourceScope, title: resolvedTopic },
    });
    res.json({
      id: r.lastInsertRowid,
      title: resolvedTopic,
      body_md: md,
      lesson_json: lessonJson,
      source_map_json: sourceMapJson,
      resolved_topic: resolvedTopic,
      topic_confidence: topicInfo.confidence,
      topic_source: topicInfo.topic_source || topicInfo.source,
      source_title: scopeInfo.title || m.title,
      source_scope: scope.sourceScope,
      source_label: rag.sourceLabel,
      chapter_id: scope.chapterId,
      chunk_id: scope.chunkId,
      domain: domainInfo,
      gamification: reward.summary || null,
      reward: reward.awarded ? { points: reward.points, event_type: 'notes_generated', unlocked: reward.unlocked || [] } : null,
      learning_map: learningMaps.buildLearningMap(req.user.id, { materialId: material_id, rootTopic: resolvedTopic, persist: true }),
    });
  } catch (e) { next(e); }
});

module.exports = router;
