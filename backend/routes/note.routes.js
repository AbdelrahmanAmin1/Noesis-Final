'use strict';

const express = require('express');
const { z } = require('zod');
const { requireAuth } = require('../middleware/auth');
const { aiLimiter } = require('../middleware/rateLimit');
const { getDb } = require('../config/db');
const { HttpError } = require('../middleware/error');
const ai = require('../services/ai.service');
const { retrieveLessonContext, groundingTier } = require('../services/rag.service');
const lessons = require('../services/lesson.service');
const topicResolver = require('../services/topic-resolver.service');
const learningMaps = require('../services/learning-map.service');
const notesAudio = require('../services/notes-audio.service');
const gamification = require('../services/gamification.service');

const router = express.Router();
const nowIso = () => new Date().toISOString();

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
    const { material_id, chapter_id, query } = req.body || {};
    if (!material_id) throw new HttpError(400, 'missing_material_id');
    const db = getDb();
    const m = db.prepare('SELECT id, title FROM materials WHERE id=? AND user_id=?').get(material_id, req.user.id);
    if (!m) throw new HttpError(404, 'material_not_found');
    const chapterTitle = chapter_id ? (db.prepare(`
      SELECT c.title
      FROM chapters c
      JOIN materials m ON m.id = c.material_id
      WHERE c.id=? AND c.material_id=? AND m.user_id=?
    `).get(chapter_id, material_id, req.user.id) || {}).title : null;
    if (chapter_id && !chapterTitle) throw new HttpError(404, 'chapter_not_found');
    const requestedTopic = query || chapterTitle || m.title;
    await ai.assertModelsAvailable({ generation: true, embedding: true, feature: 'notes' });
    const topicInfo = await topicResolver.resolveTopic({
      materialId: material_id,
      hint: requestedTopic,
      feature: 'notes',
      minConfidence: 0.24,
    });
    if (!topicInfo.topic || topicInfo.confidence < 0.24) {
      throw new HttpError(422, 'topic_resolution_low_confidence', 'I could not safely identify the real CS topic from this material. Please choose a topic and try again.', {
        rejected_topic: topicInfo.rejectedHint || requestedTopic || null,
        candidates: topicInfo.alternatives || [],
        source_title: chapterTitle || m.title,
      });
    }
    const resolvedTopic = topicInfo.topic;
    const rag = await retrieveLessonContext(material_id, resolvedTopic, { feature: 'notes' });
    const tier = groundingTier(rag.uploaded || rag);
    const lesson = await lessons.generateEducationalLesson({
      topic: resolvedTopic,
      title: chapterTitle || m.title,
      materialTitle: m.title,
      chunks: rag.chunks,
      groundingTier: tier,
    });
    lesson.topic = resolvedTopic;
    lesson.sourceMaterial = lesson.sourceMaterial || {};
    lesson.sourceMaterial.title = chapterTitle || m.title;
    const quality = lessons.scoreLesson(lesson);
    if (!quality.passed || quality.genericFailure) {
      throw new HttpError(502, 'lesson_quality_failed', 'The generated lesson was too generic, so I did not save it. Try again with a more specific topic.', {
        resolved_topic: resolvedTopic,
        quality,
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
      source_title: chapterTitle || m.title,
      candidates: topicInfo.alternatives || [],
    });
    const r = db.prepare(`INSERT INTO notes (user_id, material_id, folder, title, body_md, lesson_json, source_map_json, tags_json, created_at, updated_at)
                          VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
      req.user.id, material_id, m.title,
      resolvedTopic, md, lessonJson, sourceMapJson, JSON.stringify(['ai-generated', 'lesson']), nowIso(), nowIso()
    );
    db.prepare(`INSERT INTO study_events (user_id, kind, ref_id, duration_s, occurred_at) VALUES (?,?,?,?,?)`)
      .run(req.user.id, 'reading', r.lastInsertRowid, 60, nowIso());
    const reward = gamification.award(req.user.id, 'notes_generated', 'note', r.lastInsertRowid, {
      idempotencyKey: `${req.user.id}:notes_generated:material:${material_id}:chapter:${chapter_id || 'all'}`,
      metadata: { material_id, chapter_id: chapter_id || null, title: resolvedTopic },
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
      source_title: chapterTitle || m.title,
      gamification: reward.summary || null,
      reward: reward.awarded ? { points: reward.points, event_type: 'notes_generated', unlocked: reward.unlocked || [] } : null,
      learning_map: learningMaps.buildLearningMap(req.user.id, { materialId: material_id, rootTopic: resolvedTopic, persist: true }),
    });
  } catch (e) { next(e); }
});

module.exports = router;
