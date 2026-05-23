'use strict';

const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { requireAuth } = require('../middleware/auth');
const { aiLimiter, tutorTurnLimiter, ttsLimiter } = require('../middleware/rateLimit');
const { getDb } = require('../config/db');
const env = require('../config/env');
const { HttpError } = require('../middleware/error');
const tutor = require('../services/tutor.service');
const tutorChat = require('../services/tutor-chat.service');
const tts = require('../services/tts.service');

const router = express.Router();
const nowIso = () => new Date().toISOString();

router.post('/tts', requireAuth, ttsLimiter, async (req, res, next) => {
  let outPath = '';
  let cleanupDone = false;
  const cleanup = () => {
    if (cleanupDone || !outPath) return;
    cleanupDone = true;
    fs.unlink(outPath, () => {});
  };

  try {
    const text = String((req.body && req.body.text) || '').replace(/\s+/g, ' ').trim();
    if (!text) throw new HttpError(400, 'missing_text');
    if (text.length > 4000) throw new HttpError(400, 'tts_text_too_long');

    const audioDir = path.join(env.UPLOAD_DIR, 'audio');
    fs.mkdirSync(audioDir, { recursive: true });
    outPath = path.join(audioDir, `tts-${req.user.id}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.wav`);

    await tts.synthesize(text, outPath);

    res.setHeader('Content-Type', 'audio/wav');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Disposition', 'inline; filename="noesis-tutor.wav"');

    res.on('finish', cleanup);
    res.on('close', cleanup);

    fs.createReadStream(outPath)
      .on('error', (err) => {
        cleanup();
        next(err);
      })
      .pipe(res);
  } catch (e) {
    cleanup();
    next(e);
  }
});

router.post('/chat', requireAuth, aiLimiter, async (req, res, next) => {
  try {
    res.json(await tutorChat.sendMessage(req.user.id, req.body || {}));
  } catch (e) { next(e); }
});

router.get('/chat/conversations', requireAuth, (req, res, next) => {
  try {
    res.json({ conversations: tutorChat.getConversations(req.user.id) });
  } catch (e) { next(e); }
});

router.get('/chat/:id/messages', requireAuth, (req, res, next) => {
  try {
    res.json(tutorChat.getMessages(
      req.user.id,
      parseInt(req.params.id, 10),
      req.query.limit,
      req.query.offset
    ));
  } catch (e) { next(e); }
});

router.delete('/chat/:id', requireAuth, (req, res, next) => {
  try {
    res.json(tutorChat.deleteConversation(req.user.id, parseInt(req.params.id, 10)));
  } catch (e) { next(e); }
});

router.get('/sessions', requireAuth, (req, res, next) => {
  try {
    const db = getDb();
    const rows = db.prepare(`SELECT id, concept, topic, mode, status, current_step, started_at, ended_at, material_id, source_title
                             FROM tutor_sessions WHERE user_id=? ORDER BY started_at DESC LIMIT 30`).all(req.user.id);
    res.json({ sessions: rows });
  } catch (e) { next(e); }
});

router.post('/sessions', requireAuth, aiLimiter, async (req, res, next) => {
  try {
    const payload = req.body || {};
    const skeleton = tutor.createSkeletonSession(req.user.id, payload);
    if (env.TUTOR_ASYNC_START) {
      const job = tutor.createStartJob(req.user.id, skeleton.sessionId);
      return res.status(202).json({
        session_id: skeleton.sessionId,
        sessionId: skeleton.sessionId,
        job_id: job.id,
        jobId: job.id,
        status: 'starting',
        progress: 10,
        message: 'Starting tutor session...',
      });
    }
    const session = await tutor.runStartJob(req.user.id, skeleton.sessionId, null);
    res.json(session);
  } catch (e) { next(e); }
});

router.get('/sessions/:id/status', requireAuth, (req, res, next) => {
  try {
    res.json(tutor.getStatus(req.user.id, parseInt(req.params.id, 10)));
  } catch (e) { next(e); }
});

router.get('/sessions/:id', requireAuth, (req, res, next) => {
  try {
    const session = tutor.getSession(req.user.id, parseInt(req.params.id, 10));
    res.json({ ...session, session, notes: session.notes });
  } catch (e) { next(e); }
});

router.get('/sessions/:id/sources', requireAuth, (req, res, next) => {
  try {
    const session = tutor.getSession(req.user.id, parseInt(req.params.id, 10));
    res.json({ sources: session.sources });
  } catch (e) { next(e); }
});

router.get('/sessions/:id/trace', requireAuth, (req, res, next) => {
  try {
    const session = tutor.getSession(req.user.id, parseInt(req.params.id, 10));
    res.json({ trace: session.trace });
  } catch (e) { next(e); }
});

router.patch('/sessions/:id/mode', requireAuth, (req, res, next) => {
  try {
    const sessionId = parseInt(req.params.id, 10);
    const nextMode = req.body && req.body.mode;
    if (!['socratic', 'explain', 'example'].includes(nextMode)) throw new HttpError(400, 'invalid_mode');
    const db = getDb();
    const s = db.prepare('SELECT id FROM tutor_sessions WHERE id=? AND user_id=?').get(sessionId, req.user.id);
    if (!s) throw new HttpError(404, 'session_not_found');
    db.prepare('UPDATE tutor_sessions SET mode=?, updated_at=? WHERE id=?').run(nextMode, nowIso(), sessionId);
    res.json({ ok: true, mode: nextMode });
  } catch (e) { next(e); }
});

router.post('/sessions/:id/continue', requireAuth, tutorTurnLimiter, async (req, res, next) => {
  try {
    res.json(await tutor.continueSession(req.user.id, parseInt(req.params.id, 10), req.body || {}));
  } catch (e) { next(e); }
});

router.post('/sessions/:id/step/:idx/answer', requireAuth, tutorTurnLimiter, async (req, res, next) => {
  try {
    const result = await tutor.continueSession(req.user.id, parseInt(req.params.id, 10), req.body || {});
    res.json({
      correct: result.correct,
      correct_idx: null,
      explanation: result.feedback,
      feedback: result.feedback,
      nextStep: result.nextStep,
      steps: result.steps,
      currentStepIndex: result.currentStepIndex,
    });
  } catch (e) { next(e); }
});

router.post('/sessions/:id/notes', requireAuth, (req, res, next) => {
  try {
    const sessionId = parseInt(req.params.id, 10);
    const db = getDb();
    const s = db.prepare('SELECT id FROM tutor_sessions WHERE id=? AND user_id=?').get(sessionId, req.user.id);
    if (!s) throw new HttpError(404, 'session_not_found');
    const { body, flashcard_worthy, stepId, noteKind, sourceRefs } = req.body || {};
    if (!body) throw new HttpError(400, 'missing_body');
    const r = db.prepare(`INSERT INTO tutor_notes
      (session_id, user_id, body, flashcard_worthy, created_at, step_id, note_kind, source_refs_json)
      VALUES (?,?,?,?,?,?,?,?)`)
      .run(
        sessionId,
        req.user.id,
        String(body).trim(),
        flashcard_worthy ? 1 : 0,
        nowIso(),
        stepId || null,
        noteKind || 'manual',
        JSON.stringify(Array.isArray(sourceRefs) ? sourceRefs : [])
      );
    res.json({ id: r.lastInsertRowid });
  } catch (e) { next(e); }
});

router.post('/sessions/:id/finish', requireAuth, (req, res, next) => {
  try {
    const sessionId = parseInt(req.params.id, 10);
    const db = getDb();
    const s = db.prepare('SELECT id, started_at FROM tutor_sessions WHERE id=? AND user_id=?').get(sessionId, req.user.id);
    if (!s) throw new HttpError(404, 'session_not_found');
    db.prepare('UPDATE tutor_sessions SET ended_at=?, status=?, updated_at=? WHERE id=?').run(nowIso(), 'completed', nowIso(), sessionId);
    const dur = Math.max(60, Math.floor((Date.now() - new Date(s.started_at).getTime()) / 1000));
    db.prepare(`INSERT INTO study_events (user_id, kind, ref_id, duration_s, occurred_at) VALUES (?,?,?,?,?)`)
      .run(req.user.id, 'tutor', sessionId, dur, nowIso());
    res.json({ ok: true, duration_s: dur });
  } catch (e) { next(e); }
});

module.exports = router;
