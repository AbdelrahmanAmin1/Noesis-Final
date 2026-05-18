'use strict';

const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { aiLimiter } = require('../middleware/rateLimit');
const { getDb } = require('../config/db');
const env = require('../config/env');
const { HttpError } = require('../middleware/error');
const tutor = require('../services/tutor.service');

const router = express.Router();
const nowIso = () => new Date().toISOString();

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

router.post('/sessions/:id/continue', requireAuth, aiLimiter, (req, res, next) => {
  try {
    res.json(tutor.continueSession(req.user.id, parseInt(req.params.id, 10), req.body || {}));
  } catch (e) { next(e); }
});

router.post('/sessions/:id/step/:idx/answer', requireAuth, aiLimiter, (req, res, next) => {
  try {
    const result = tutor.continueSession(req.user.id, parseInt(req.params.id, 10), req.body || {});
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
