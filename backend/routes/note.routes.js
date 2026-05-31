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
const sourceVisualCandidates = require('../services/source-visual-candidates.service');
const sourceGroundingJudge = require('../services/source-grounding-judge.service');
const sourceTopicPlans = require('../services/source-topic-plan.service');
const materialTopicMap = require('../services/material-topic-map.service');

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

function materialDisplayTitle(value) {
  return cleanTopic(String(value || '')
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[_-]+/g, ' '));
}

function hasExplicitQuery(value) {
  return cleanTopic(value).length > 0;
}

function noteTopicMode(scope, query) {
  return scope.sourceScope === 'material' && !hasExplicitQuery(query) ? 'material_wide' : 'focused';
}

function sourceOutlineHasMultipleMajorTopics(sourceOutline = {}) {
  const majors = Array.isArray(sourceOutline.majorTopics)
    ? sourceOutline.majorTopics.filter(item => item && item.topic && !isGenericTopic(item.topic))
    : [];
  const sections = Array.isArray(sourceOutline.meaningfulSections)
    ? sourceOutline.meaningfulSections.filter(item => item && item.title && !isGenericTopic(item.title))
    : [];
  return majors.length >= 2 || sections.length >= 3;
}

function normalizedLabel(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9+#]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function majorTopicMatches(topic, major, focusTerms = []) {
  const hay = normalizedLabel([major && major.topic, ...((major && major.terms) || [])].join(' '));
  if (!hay) return false;
  const topicKey = normalizedLabel(topic);
  if (topicKey && hay.includes(topicKey)) return true;
  return (focusTerms || []).some(term => {
    const key = normalizedLabel(term);
    return key.length >= 4 && hay.includes(key);
  });
}

function dominantSourceTopic(chunks = [], sourceOutline = {}, materialTitle = '') {
  const ranked = topicResolver.rankTopicsFromChunks(chunks || []);
  const topic = cleanTopic(ranked && ranked.topic);
  if (!topic || !topicResolver.exactKnownTopic(topic)) return null;
  const candidates = Array.isArray(ranked.candidates) ? ranked.candidates : [];
  const topScore = Number(candidates[0] && candidates[0].score || 0);
  const nextScore = Number(candidates[1] && candidates[1].score || 0);
  const confidence = Number(ranked.confidence || 0);
  const topicKey = normalizedLabel(topic);
  const titleAndOutline = normalizedLabel([
    materialTitle,
    sourceOutline && sourceOutline.mainTopic,
    ...((sourceOutline && sourceOutline.keyConcepts) || []).slice(0, 12),
    ...((sourceOutline && sourceOutline.majorTopics) || []).slice(0, 8).map(item => item && item.topic),
  ].filter(Boolean).join(' '));
  const mentionedInSourceLabels = topicKey && titleAndOutline.includes(topicKey);
  const dominantByScore = topScore >= 16 && topScore >= Math.max(1, nextScore) * 1.35;
  const dominantByConfidence = confidence >= 0.72 && topScore >= 16;
  if (mentionedInSourceLabels || dominantByScore || dominantByConfidence) {
    return {
      topic,
      confidence,
      source: 'dominant_source_topic',
      alternatives: candidates,
    };
  }
  return null;
}

function materialWideResolvedTopic(sourceOutline = {}, materialTitle = '', fallback = '', chunks = []) {
  const dominant = dominantSourceTopic(chunks, sourceOutline, materialTitle);
  if (dominant && dominant.topic) return dominant.topic;
  const mainTopic = cleanTopic(sourceOutline.mainTopic || sourceOutline.topic || fallback);
  const majors = Array.isArray(sourceOutline.majorTopics)
    ? sourceOutline.majorTopics.filter(item => item && item.topic && !isGenericTopic(item.topic))
    : [];
  const title = materialDisplayTitle(materialTitle);
  if (majors.length >= 2 && topicResolver.exactKnownTopic(mainTopic)) {
    const focusTerms = materialUnderstanding.focusTermsForTopic(mainTopic, sourceOutline, 16);
    const relatedCount = majors.filter(major => majorTopicMatches(mainTopic, major, focusTerms)).length;
    if (relatedCount <= 1 && title && !isGenericTopic(title)) return title;
    if (relatedCount <= 1) return majors.slice(0, 3).map(item => item.topic).join(' / ');
  }
  if (mainTopic && !isGenericTopic(mainTopic)) return mainTopic;
  if (title && !isGenericTopic(title)) return title;
  if (majors.length >= 2) return majors.slice(0, 3).map(item => item.topic).join(' / ');
  return 'Study Notes from Uploaded Material';
}

function materialWideFocusTerms(sourceOutline = {}, topic = '') {
  const terms = [
    topic,
    sourceOutline.mainTopic,
    ...(sourceOutline.keyConcepts || []),
    ...((sourceOutline.majorTopics || []).flatMap(item => [item && item.topic, ...((item && item.terms) || [])])),
  ];
  const seen = new Set();
  return terms
    .map(cleanTopic)
    .filter(term => {
      const key = normalizedLabel(term);
      if (!key || seen.has(key) || isGenericTopic(term)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 20);
}

function noteFocusTerms(topic, sourceOutline, topicMode) {
  if (topicMode === 'material_wide') return materialWideFocusTerms(sourceOutline, topic);
  return materialUnderstanding.focusTermsForTopic(topic, sourceOutline);
}

function noteAvoidTerms(topic, sourceOutline, topicMode) {
  if (topicMode === 'material_wide') return [];
  return materialUnderstanding.competingTermsForTopic(topic, sourceOutline);
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

function scopedSourceChunks(db, materialId, scope, limit = 40) {
  if (scope.sourceScope === 'chapter' && Number.isInteger(scope.chapterId)) {
    return db.prepare(`SELECT id, idx, text, chapter_id, source_page, chapter_title, heading,
                              slide_number, slide_title, section_title, has_code, keywords_json,
                              source_kind, source_visual_id
                       FROM chunks WHERE material_id=? AND chapter_id=? ORDER BY idx LIMIT ?`)
      .all(materialId, scope.chapterId, limit);
  }
  if (scope.sourceScope === 'chunk' && Number.isInteger(scope.chunkId)) {
    return db.prepare(`SELECT id, idx, text, chapter_id, source_page, chapter_title, heading,
                              slide_number, slide_title, section_title, has_code, keywords_json,
                              source_kind, source_visual_id
                       FROM chunks WHERE material_id=? AND id=? ORDER BY idx LIMIT 1`)
      .all(materialId, scope.chunkId);
  }
  return db.prepare(`SELECT id, idx, text, chapter_id, source_page, chapter_title, heading,
                            slide_number, slide_title, section_title, has_code, keywords_json,
                            source_kind, source_visual_id
                     FROM chunks WHERE material_id=? ORDER BY idx LIMIT ?`).all(materialId, limit);
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

function evaluateNoteLesson(lesson, opts = {}) {
  const outputText = lessons.lessonToMarkdown(lesson);
  const qualityTopicMode = lesson && lesson.sourceRepair ? 'source_repair' : opts.topicMode;
  const quality = lessons.scoreLesson(lesson, {
    domainInfo: opts.domainInfo,
    topic: opts.resolvedTopic,
    chunks: opts.uploadedChunks,
    sourceOutline: opts.sourceOutline,
    topicMode: qualityTopicMode,
    sourceRepair: !!(lesson && lesson.sourceRepair),
  });
  const drift = materialUnderstanding.detectTopicDrift(outputText, {
    focusTopic: opts.resolvedTopic,
    sourceOutline: opts.sourceOutline,
    focusTerms: opts.focusTerms,
    competingTerms: opts.topicMode === 'material_wide' ? [] : opts.avoidTerms,
  });
  const verifier = sourceGroundingJudge.judge({
    feature: 'notes',
    stage: opts.stage || 'post_generation',
    materialId: opts.materialId,
    resolvedTopic: opts.resolvedTopic,
    requestedTopic: opts.requestedTopic,
    query: opts.query,
    domainInfo: opts.domainInfo,
    sourceOutline: opts.sourceOutline,
    chunks: opts.uploadedChunks,
    sourceVisuals: opts.sourceVisuals,
    sourceTopicPlan: opts.sourceTopicPlan,
    outputText,
    outputJson: lesson,
    topicMode: opts.topicMode,
    attempt: opts.attempt || 0,
  });
  return { outputText, quality, drift, verifier, sourceRepair: !!(lesson && lesson.sourceRepair), topicMode: opts.topicMode };
}

function noteLessonAccepted(result) {
  const polishedAccepted = result
    && result.quality
    && result.quality.passed
    && !result.quality.genericFailure
    && result.drift
    && !result.drift.drifted
    && result.verifier
    && result.verifier.decision === sourceGroundingJudge.DECISIONS.ACCEPT;
  if (polishedAccepted) return true;
  if (!env.SOURCE_REPAIR_SAVE_SAFE_FALLBACK || !result || !result.sourceRepair) return false;
  const safeSourceRepair = sourceGroundingJudge.sourceRepairSafe(result.verifier);
  const driftOk = result.drift && (!result.drift.drifted || result.topicMode === 'material_wide' || safeSourceRepair);
  return result.quality
    && !result.quality.hasPlaceholders
    && !result.quality.hasGenericChapterText
    && !result.quality.generalInstructionalFailure
    && driftOk
    && result.verifier
    && (result.verifier.decision === sourceGroundingJudge.DECISIONS.ACCEPT || safeSourceRepair);
}

function sourceRepairLesson(opts = {}) {
  const repairTopic = opts.topicMode === 'material_wide'
    ? materialWideResolvedTopic(opts.sourceOutline || {}, opts.materialTitle, opts.resolvedTopic, opts.uploadedChunks || [])
    : opts.resolvedTopic;
  const lesson = lessons.generalMaterialLesson(
    repairTopic,
    opts.sourceTitle || opts.materialTitle,
    opts.tier,
    (opts.uploadedChunks || []).map(c => c.id).filter(Boolean),
    opts.uploadedChunks || [],
    {
      domainInfo: opts.domainInfo,
      topic: repairTopic,
      sourceOutline: opts.sourceOutline,
      focusTerms: opts.focusTerms,
      avoidTerms: opts.topicMode === 'material_wide' ? [] : opts.avoidTerms,
      materialTitle: opts.materialTitle,
      sourceVisualCandidates: opts.sourceVisuals,
      topicMode: opts.topicMode,
      sourceTopicPlan: opts.sourceTopicPlan,
    }
  );
  lesson.topic = repairTopic;
  lesson.topicMode = opts.topicMode;
  lesson.sourceRepair = true;
  lesson.sourceMaterial = lesson.sourceMaterial || {};
  lesson.sourceMaterial.title = opts.sourceTitle || opts.materialTitle;
  return lesson;
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
    const topicMode = noteTopicMode(scope, query);
    const explicitQuery = hasExplicitQuery(query) ? cleanTopic(query) : '';
    const scopedChunksForOutline = scopedSourceChunks(db, material_id, scope, topicMode === 'material_wide' ? 48 : 24);
    const requestedTopicInfo = sourceDerivedTopic(req.user.id, m, scope, query, scopeInfo.title);
    const requestedTopic = requestedTopicInfo.topic;
    const domainInfo = domainDetection.detectMaterialDomain(req.user.id, material_id, { hint: requestedTopic });
    await ai.assertModelsAvailable({ generation: true, embedding: true, feature: 'notes' });
    const preRagOutline = scopedChunksForOutline.length
      ? materialUnderstanding.buildSourceOutline(scopedChunksForOutline, {
        explicitQuery: explicitQuery || undefined,
        hint: requestedTopic,
        title: m.title,
        materialTitle: m.title,
        scopeTitle: scopeInfo.title,
        domainInfo,
      })
      : (requestedTopicInfo.understanding && requestedTopicInfo.understanding.sourceOutline || null);
    const materialWideMultiple = topicMode === 'material_wide' && sourceOutlineHasMultipleMajorTopics(preRagOutline || {});
    let topicInfo = { topic: requestedTopic, confidence: requestedTopicInfo.confidence || domainInfo.confidence || 0.5, source: requestedTopicInfo.source || 'material_title', alternatives: [] };
    if (topicMode === 'material_wide') {
      topicInfo = {
        ...topicInfo,
        topic: materialWideResolvedTopic(preRagOutline || {}, m.title, requestedTopic, scopedChunksForOutline),
        source: materialWideMultiple ? 'material_wide_outline' : (topicInfo.source || 'material_outline'),
      };
    }
    if (domainDetection.shouldUseCuratedCs(domainInfo) && !materialWideMultiple) {
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
    let resolvedTopic = topicInfo.topic || requestedTopic;
    if (topicMode === 'material_wide') resolvedTopic = materialWideResolvedTopic(preRagOutline || {}, m.title, resolvedTopic, scopedChunksForOutline);
    let focusTerms = noteFocusTerms(resolvedTopic, preRagOutline, topicMode);
    let avoidTerms = noteAvoidTerms(resolvedTopic, preRagOutline, topicMode);
    let rag = await retrieveLessonContext(material_id, resolvedTopic, {
      feature: 'notes',
      sourceScope: scope.sourceScope,
      chapterId: scope.chapterId,
      chunkId: scope.chunkId,
      k: topicMode === 'material_wide' ? 12 : undefined,
      focusTopic: resolvedTopic,
      focusTerms,
      avoidTerms,
      includeSystem: domainDetection.shouldUseCuratedCs(domainInfo),
    });
    let tier = groundingTier(rag.uploaded || rag);
    let uploadedChunks = rag.uploaded && Array.isArray(rag.uploaded.chunks) ? rag.uploaded.chunks : [];
    if (topicMode === 'material_wide' && scopedChunksForOutline.length) {
      uploadedChunks = scopedChunksForOutline;
      rag.uploaded = { ...(rag.uploaded || {}), chunks: uploadedChunks };
      rag.chunks = [
        ...uploadedChunks.map(chunk => ({ ...chunk, corpus: 'uploaded' })),
        ...((rag.system && rag.system.chunks) || []).map(chunk => ({ ...chunk, corpus: 'system' })),
      ].slice(0, 16);
      tier = groundingTier(rag.uploaded || rag);
    }
    let sourceVisuals = sourceVisualCandidates.forPrompt(material_id, {
      max: env.SOURCE_VISUALS_MAX_PER_MATERIAL,
      minScore: 0.45,
    });
    let sourceOutline = materialUnderstanding.buildSourceOutline(uploadedChunks, {
      explicitQuery: explicitQuery || undefined,
      hint: resolvedTopic,
      title: m.title,
      materialTitle: m.title,
      scopeTitle: scopeInfo.title,
      domainInfo,
    });
    if (topicMode === 'material_wide') {
      resolvedTopic = materialWideResolvedTopic(sourceOutline, m.title, resolvedTopic, uploadedChunks);
      focusTerms = noteFocusTerms(resolvedTopic, sourceOutline, topicMode);
      avoidTerms = noteAvoidTerms(resolvedTopic, sourceOutline, topicMode);
    }
    let sourceTopicPlan = sourceTopicPlans.buildSourceTopicPlan({
      materialId: material_id,
      materialTitle: m.title,
      sourceScope: scope.sourceScope,
      chapterId: scope.chapterId,
      chunkId: scope.chunkId,
      explicitTopic: explicitQuery,
      requestedTopic: resolvedTopic,
      domainInfo,
      chunks: uploadedChunks,
      sourceOutline,
      maxBalancedChunks: topicMode === 'material_wide' ? 48 : 24,
    });
    if (topicMode === 'material_wide') {
      const topicMap = materialTopicMap.getOrBuild(req.user.id, material_id, { hint: resolvedTopic, sourceScope: scope.sourceScope, chapterId: scope.chapterId, chunkId: scope.chunkId });
      if (topicMap && Array.isArray(topicMap.topics) && topicMap.topics.length >= 2) {
        sourceTopicPlan = materialTopicMap.sourceTopicPlanForMap(topicMap, uploadedChunks.length ? uploadedChunks : sourceTopicPlan.balancedChunks, sourceTopicPlan);
      }
    }
    if (topicMode === 'material_wide' && sourceTopicPlan.balancedChunks.length) {
      uploadedChunks = sourceTopicPlan.balancedChunks;
      sourceOutline = sourceTopicPlan.sourceOutline || sourceOutline;
      resolvedTopic = sourceTopicPlan.primaryTopic || resolvedTopic;
      focusTerms = sourceTopicPlans.focusTerms(sourceTopicPlan, resolvedTopic);
      avoidTerms = [];
    }
    let preVerifier = sourceGroundingJudge.judge({
      feature: 'notes',
      stage: 'pre_generation',
      materialId: material_id,
      resolvedTopic,
      requestedTopic,
      query,
      domainInfo,
      sourceOutline,
      materialUnderstanding: requestedTopicInfo.understanding || null,
      chunks: uploadedChunks,
      sourceVisuals,
      sourceTopicPlan,
      topicMode,
      attempt: 0,
    });
    if (preVerifier.decision === sourceGroundingJudge.DECISIONS.RETRY && preVerifier.correctedTopic) {
      resolvedTopic = preVerifier.correctedTopic;
      if (topicMode === 'material_wide') resolvedTopic = materialWideResolvedTopic(sourceOutline || preRagOutline || {}, m.title, resolvedTopic, uploadedChunks.length ? uploadedChunks : scopedChunksForOutline);
      focusTerms = noteFocusTerms(resolvedTopic, sourceOutline || preRagOutline, topicMode);
      avoidTerms = noteAvoidTerms(resolvedTopic, sourceOutline || preRagOutline, topicMode);
      rag = await retrieveLessonContext(material_id, resolvedTopic, {
        feature: 'notes',
        sourceScope: scope.sourceScope,
        chapterId: scope.chapterId,
        chunkId: scope.chunkId,
        k: topicMode === 'material_wide' ? 12 : undefined,
        focusTopic: resolvedTopic,
        focusTerms,
        avoidTerms,
        includeSystem: domainDetection.shouldUseCuratedCs(domainInfo),
      });
      tier = groundingTier(rag.uploaded || rag);
      uploadedChunks = rag.uploaded && Array.isArray(rag.uploaded.chunks) ? rag.uploaded.chunks : [];
      if (topicMode === 'material_wide' && scopedChunksForOutline.length) {
        uploadedChunks = scopedChunksForOutline;
        rag.uploaded = { ...(rag.uploaded || {}), chunks: uploadedChunks };
        rag.chunks = [
          ...uploadedChunks.map(chunk => ({ ...chunk, corpus: 'uploaded' })),
          ...((rag.system && rag.system.chunks) || []).map(chunk => ({ ...chunk, corpus: 'system' })),
        ].slice(0, 16);
        tier = groundingTier(rag.uploaded || rag);
      }
      sourceVisuals = sourceVisualCandidates.forPrompt(material_id, {
        max: env.SOURCE_VISUALS_MAX_PER_MATERIAL,
        minScore: 0.45,
      });
      sourceOutline = materialUnderstanding.buildSourceOutline(uploadedChunks, {
        explicitQuery: explicitQuery || undefined,
        hint: resolvedTopic,
        title: m.title,
        materialTitle: m.title,
        scopeTitle: scopeInfo.title,
        domainInfo,
      });
      if (topicMode === 'material_wide') {
        resolvedTopic = materialWideResolvedTopic(sourceOutline, m.title, resolvedTopic, uploadedChunks);
        focusTerms = noteFocusTerms(resolvedTopic, sourceOutline, topicMode);
        avoidTerms = noteAvoidTerms(resolvedTopic, sourceOutline, topicMode);
      }
      sourceTopicPlan = sourceTopicPlans.buildSourceTopicPlan({
        materialId: material_id,
        materialTitle: m.title,
        sourceScope: scope.sourceScope,
        chapterId: scope.chapterId,
        chunkId: scope.chunkId,
        explicitTopic: explicitQuery,
        requestedTopic: resolvedTopic,
        domainInfo,
        chunks: uploadedChunks,
        sourceOutline,
        maxBalancedChunks: topicMode === 'material_wide' ? 48 : 24,
      });
      if (topicMode === 'material_wide') {
        const topicMap = materialTopicMap.getOrBuild(req.user.id, material_id, { hint: resolvedTopic, sourceScope: scope.sourceScope, chapterId: scope.chapterId, chunkId: scope.chunkId });
        if (topicMap && Array.isArray(topicMap.topics) && topicMap.topics.length >= 2) {
          sourceTopicPlan = materialTopicMap.sourceTopicPlanForMap(topicMap, uploadedChunks.length ? uploadedChunks : sourceTopicPlan.balancedChunks, sourceTopicPlan);
        }
      }
      if (topicMode === 'material_wide' && sourceTopicPlan.balancedChunks.length) {
        uploadedChunks = sourceTopicPlan.balancedChunks;
        sourceOutline = sourceTopicPlan.sourceOutline || sourceOutline;
        resolvedTopic = sourceTopicPlan.primaryTopic || resolvedTopic;
        focusTerms = sourceTopicPlans.focusTerms(sourceTopicPlan, resolvedTopic);
        avoidTerms = [];
      }
      preVerifier = sourceGroundingJudge.judge({
        feature: 'notes',
        stage: 'pre_generation',
        materialId: material_id,
        resolvedTopic,
        requestedTopic,
        query,
        domainInfo,
        sourceOutline,
        materialUnderstanding: requestedTopicInfo.understanding || null,
        chunks: uploadedChunks,
        sourceVisuals,
        sourceTopicPlan,
        topicMode,
        attempt: 1,
      });
    }
    if (preVerifier.decision === sourceGroundingJudge.DECISIONS.BLOCK) {
      throw new HttpError(422, 'generation_verifier_blocked', 'The selected topic did not match the uploaded material closely enough to generate safe notes.', {
        verifier: preVerifier,
        candidates: topicInfo.alternatives || [],
      });
    }
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
    const sourceTopicPlanPrompt = sourceTopicPlans.formatSourceTopicPlanForPrompt(sourceTopicPlan);
    const educationalContextPrompt = [
      education
        ? educationalContext.formatEducationalContextForPrompt(education, { maxChars: env.KNOWLEDGE_CONTEXT_MAX_CHARS })
        : '(Curated educational context is disabled.)',
      sourceTopicPlanPrompt,
    ].filter(Boolean).join('\n\n');
    let repairPath = 'ai_initial';
    const repairTrace = [];
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
      lessonType: topicMode === 'material_wide' ? 'general' : undefined,
      sourceOutline,
      focusTerms,
      avoidTerms,
      sourceVisualCandidates: sourceVisuals,
      topicMode,
      sourceTopicPlan,
    });
    lesson.topic = resolvedTopic;
    lesson.topicMode = topicMode;
    lesson.sourceMaterial = lesson.sourceMaterial || {};
    lesson.sourceMaterial.title = scopeInfo.title || m.title;
    let evaluation = evaluateNoteLesson(lesson, {
      materialId: material_id,
      resolvedTopic,
      requestedTopic,
      query,
      domainInfo,
      sourceOutline,
      uploadedChunks,
      sourceVisuals,
      sourceTopicPlan,
      focusTerms,
      avoidTerms,
      topicMode,
      attempt: 0,
    });
    if (!noteLessonAccepted(evaluation) && (evaluation.quality.genericFailure || !evaluation.quality.passed || evaluation.drift.drifted)) {
      const fallback = sourceRepairLesson({
        resolvedTopic,
        materialTitle: m.title,
        sourceTitle: scopeInfo.title || m.title,
        tier,
        uploadedChunks,
        sourceOutline,
        focusTerms,
        avoidTerms,
        domainInfo,
        sourceVisuals,
        sourceTopicPlan,
        topicMode,
      });
      const fallbackEvaluation = evaluateNoteLesson(fallback, {
        materialId: material_id,
        resolvedTopic: fallback.topic || resolvedTopic,
        requestedTopic,
        query,
        domainInfo,
        sourceOutline,
        uploadedChunks,
        sourceVisuals,
        sourceTopicPlan,
        focusTerms: noteFocusTerms(fallback.topic || resolvedTopic, sourceOutline, topicMode),
        avoidTerms: noteAvoidTerms(fallback.topic || resolvedTopic, sourceOutline, topicMode),
        topicMode,
        attempt: 0,
      });
      repairTrace.push({
        stage: 'quality_repair',
        accepted: noteLessonAccepted(fallbackEvaluation),
        before: { quality: evaluation.quality, drift: evaluation.drift, verifier: evaluation.verifier },
        after: { quality: fallbackEvaluation.quality, drift: fallbackEvaluation.drift, verifier: fallbackEvaluation.verifier },
      });
      if (noteLessonAccepted(fallbackEvaluation)) {
        lesson = fallback;
        resolvedTopic = lesson.topic || resolvedTopic;
        focusTerms = noteFocusTerms(resolvedTopic, sourceOutline, topicMode);
        avoidTerms = noteAvoidTerms(resolvedTopic, sourceOutline, topicMode);
        evaluation = fallbackEvaluation;
        repairPath = 'source_outline_quality_repair';
      }
    }
    let { quality, drift, verifier: postVerifier } = evaluation;
    if (!noteLessonAccepted(evaluation) && postVerifier.decision === sourceGroundingJudge.DECISIONS.RETRY) {
      const retryTopic = postVerifier.correctedTopic || resolvedTopic;
      if (retryTopic !== resolvedTopic) resolvedTopic = retryTopic;
      if (topicMode === 'material_wide') resolvedTopic = materialWideResolvedTopic(sourceOutline, m.title, resolvedTopic, uploadedChunks);
      focusTerms = noteFocusTerms(resolvedTopic, sourceOutline, topicMode);
      avoidTerms = noteAvoidTerms(resolvedTopic, sourceOutline, topicMode);
      const retryEducationalContextPrompt = [
        educationalContextPrompt,
        sourceGroundingJudge.retryGuidance(postVerifier),
      ].filter(Boolean).join('\n\n');
      lesson = await lessons.generateEducationalLesson({
        topic: resolvedTopic,
        title: scopeInfo.title || m.title,
        materialTitle: m.title,
        chunks: uploadedChunks,
        groundingTier: tier,
        educationalContextPrompt: retryEducationalContextPrompt,
        curatedTopicId: education && education.curatedKnowledge && education.curatedKnowledge.id,
        domainInfo,
        domain: domainInfo.domain,
        lessonType: topicMode === 'material_wide' ? 'general' : undefined,
        sourceOutline,
        focusTerms,
        avoidTerms,
        sourceVisualCandidates: sourceVisuals,
        topicMode,
        sourceTopicPlan,
      });
      lesson.topic = resolvedTopic;
      lesson.topicMode = topicMode;
      lesson.sourceMaterial = lesson.sourceMaterial || {};
      lesson.sourceMaterial.title = scopeInfo.title || m.title;
      evaluation = evaluateNoteLesson(lesson, {
        materialId: material_id,
        resolvedTopic,
        requestedTopic,
        query,
        domainInfo,
        sourceOutline,
        uploadedChunks,
        sourceVisuals,
        sourceTopicPlan,
        focusTerms,
        avoidTerms,
        topicMode,
        attempt: 1,
      });
      quality = evaluation.quality;
      drift = evaluation.drift;
      postVerifier = evaluation.verifier;
      repairTrace.push({
        stage: 'ai_retry',
        accepted: noteLessonAccepted(evaluation),
        verifier: postVerifier,
        quality,
        drift,
      });
      if (noteLessonAccepted(evaluation)) repairPath = 'ai_retry';
    }
    if (!noteLessonAccepted(evaluation)) {
      const fallback = sourceRepairLesson({
        resolvedTopic,
        materialTitle: m.title,
        sourceTitle: scopeInfo.title || m.title,
        tier,
        uploadedChunks,
        sourceOutline,
        focusTerms,
        avoidTerms,
        domainInfo,
        sourceVisuals,
        sourceTopicPlan,
        topicMode,
      });
      const fallbackTopic = fallback.topic || resolvedTopic;
      const fallbackEvaluation = evaluateNoteLesson(fallback, {
        materialId: material_id,
        resolvedTopic: fallbackTopic,
        requestedTopic,
        query,
        domainInfo,
        sourceOutline,
        uploadedChunks,
        sourceVisuals,
        sourceTopicPlan,
        focusTerms: noteFocusTerms(fallbackTopic, sourceOutline, topicMode),
        avoidTerms: noteAvoidTerms(fallbackTopic, sourceOutline, topicMode),
        topicMode,
        attempt: 1,
      });
      repairTrace.push({
        stage: 'final_source_repair',
        accepted: noteLessonAccepted(fallbackEvaluation),
        before: { quality, drift, verifier: postVerifier },
        after: { quality: fallbackEvaluation.quality, drift: fallbackEvaluation.drift, verifier: fallbackEvaluation.verifier },
      });
      if (noteLessonAccepted(fallbackEvaluation)) {
        lesson = fallback;
        resolvedTopic = fallbackTopic;
        focusTerms = noteFocusTerms(resolvedTopic, sourceOutline, topicMode);
        avoidTerms = noteAvoidTerms(resolvedTopic, sourceOutline, topicMode);
        evaluation = fallbackEvaluation;
        quality = fallbackEvaluation.quality;
        drift = fallbackEvaluation.drift;
        postVerifier = fallbackEvaluation.verifier;
        repairPath = 'deterministic_source_repair';
      }
    }
    if (!noteLessonAccepted(evaluation)) {
      throw new HttpError(502, 'generation_verifier_blocked', 'The generated notes drifted away from the uploaded material, so I did not save them.', {
        resolved_topic: resolvedTopic,
        verifier: postVerifier,
        quality,
        drift,
        repair: repairTrace,
      });
    }
    lesson.sourceVisuals = sourceVisuals;
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
      topic_mode: topicMode,
      chapter_id: scope.chapterId,
      chunk_id: scope.chunkId,
      source_label: rag.sourceLabel,
      domain: domainInfo,
      candidates: topicInfo.alternatives || [],
      educational_context: education && education.trace || null,
      curated_topic: education && education.curatedKnowledge && education.curatedKnowledge.id || null,
      uploaded_chunk_count: uploadedChunks.length,
      source_visuals: sourceVisuals,
      system_chunk_count: rag.system && Array.isArray(rag.system.chunks) ? rag.system.chunks.length : 0,
      source_outline: {
        mainTopic: sourceOutline.mainTopic,
        keyConcepts: sourceOutline.keyConcepts,
        meaningfulSections: sourceOutline.meaningfulSections,
      },
      source_topic_plan: {
        topicMode: sourceTopicPlan.topicMode,
        primaryTopic: sourceTopicPlan.primaryTopic,
        topicBundle: sourceTopicPlan.topicBundle,
        allowedTopics: sourceTopicPlan.allowedTopics,
      },
      drift,
      verifier: {
        pre: preVerifier,
        post: postVerifier,
        repair_path: repairPath,
        repaired: repairPath !== 'ai_initial',
        repairs: repairTrace,
      },
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
      topic_mode: topicMode,
      source_label: rag.sourceLabel,
      chapter_id: scope.chapterId,
      chunk_id: scope.chunkId,
      domain: domainInfo,
      verifier_repaired: repairPath !== 'ai_initial',
      repair_path: repairPath,
      gamification: reward.summary || null,
      reward: reward.awarded ? { points: reward.points, event_type: 'notes_generated', unlocked: reward.unlocked || [] } : null,
      learning_map: learningMaps.buildLearningMap(req.user.id, { materialId: material_id, rootTopic: resolvedTopic, persist: true }),
    });
  } catch (e) { next(e); }
});

module.exports = router;
