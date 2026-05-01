'use strict';

const express = require('express');
const { z } = require('zod');
const { requireAuth } = require('../middleware/auth');
const { aiLimiter } = require('../middleware/rateLimit');
const { getDb } = require('../config/db');
const { HttpError } = require('../middleware/error');
const ai = require('../services/ai.service');
const prompts = require('../utils/prompts');
const { parseJsonSafe } = require('../utils/jsonSafe');
const { retrieve } = require('../services/rag.service');
const log = require('../utils/logger');

const router = express.Router();
const nowIso = () => new Date().toISOString();

const PlanSchema = z.object({
  steps: z.array(z.object({
    t: z.string().min(1),
    q: z.string().min(1),
    options: z.array(z.string()).length(4),
    correct_idx: z.number().int().min(0).max(3),
    explanation: z.string().optional().default(''),
  })).length(5),
});

function fallbackTutorPlan(concept, mode, chunks) {
  const facts = chunks
    .flatMap(c => String(c.text || '').split(/[\n.?!]+/))
    .map(s => s.replace(/\s+/g, ' ').trim())
    .filter(s => s.length >= 18 && s.length <= 180)
    .slice(0, 20);
  const sourceFacts = facts.length ? facts : [`The uploaded material has limited extractable detail about ${concept}.`];
  const titles = ['Warm-up', 'Intuition', 'Core idea', 'Formalize', 'Apply'];
  const promptsByMode = {
    socratic: 'Which statement is best supported by the source material?',
    explain: 'Which explanation matches the source material?',
    example: 'Which example or rule is grounded in the source material?',
  };
  const steps = titles.map((title, i) => {
    const correct = sourceFacts[i % sourceFacts.length];
    const distractors = sourceFacts.filter(f => f !== correct).slice(i + 1, i + 4);
    while (distractors.length < 3) {
      distractors.push([
        'This is not stated by the extracted material.',
        'This contradicts the source emphasis.',
        'This is unrelated to the selected concept.',
      ][distractors.length]);
    }
    const correctIdx = i % 4;
    const options = distractors.slice(0, 3);
    options.splice(correctIdx, 0, correct);
    return {
      t: title,
      q: `${title}: ${promptsByMode[mode] || promptsByMode.socratic} (${concept})`,
      options,
      correct_idx: correctIdx,
      explanation: `Grounded source point: "${correct}"`,
    };
  });
  return { steps };
}

router.get('/sessions', requireAuth, (req, res, next) => {
  try {
    const db = getDb();
    const rows = db.prepare(`SELECT id, concept, mode, current_step, started_at, ended_at, material_id
                             FROM tutor_sessions WHERE user_id=? ORDER BY started_at DESC LIMIT 30`).all(req.user.id);
    res.json({ sessions: rows });
  } catch (e) { next(e); }
});

router.post('/sessions', requireAuth, aiLimiter, async (req, res, next) => {
  try {
    const { material_id, concept, mode } = req.body || {};
    if (!concept) throw new HttpError(400, 'missing_concept');
    const m = mode && ['socratic', 'explain', 'example'].includes(mode) ? mode : 'socratic';
    const db = getDb();
    let chunks = [];
    if (material_id) {
      const mat = db.prepare('SELECT id FROM materials WHERE id=? AND user_id=?').get(material_id, req.user.id);
      if (!mat) throw new HttpError(404, 'material_not_found');
      chunks = await retrieve(material_id, concept, 6);
    }
    if (!chunks.length) {
      // No user material (or empty result) — fall back to the seeded system curriculum.
      chunks = await retrieve('system', concept, 6);
    }
    let plan;
    try {
      const raw = await ai.generate(prompts.TUTOR_PLAN(concept, m, chunks), { format: 'json', temperature: 0.5 });
      plan = await parseJsonSafe(raw, PlanSchema, async (txt) => ai.generate(prompts.REPAIR_JSON(txt), { temperature: 0 }));
    } catch (e) {
      log.warn('tutor_plan_fallback', e.message || e);
      plan = fallbackTutorPlan(concept, m, chunks);
    }

    const ins = db.prepare(`INSERT INTO tutor_sessions (user_id, material_id, concept, mode, plan_json, current_step, started_at) VALUES (?,?,?,?,?,?,?)`);
    const r = ins.run(req.user.id, material_id || null, concept, m, JSON.stringify(plan), 0, nowIso());
    const stepsIns = db.prepare(`INSERT INTO tutor_steps (session_id, idx, kind, prompt) VALUES (?,?,?,?)`);
    db.transaction(() => {
      plan.steps.forEach((s, i) => stepsIns.run(r.lastInsertRowid, i, 'mcq', JSON.stringify(s)));
    })();

    res.json({ session_id: r.lastInsertRowid, concept, mode: m, plan });
  } catch (e) { next(e); }
});

router.get('/sessions/:id', requireAuth, (req, res, next) => {
  try {
    const db = getDb();
    const s = db.prepare('SELECT * FROM tutor_sessions WHERE id=? AND user_id=?').get(parseInt(req.params.id, 10), req.user.id);
    if (!s) throw new HttpError(404, 'session_not_found');
    s.plan = JSON.parse(s.plan_json);
    delete s.plan_json;
    const notes = db.prepare('SELECT id, body, flashcard_worthy, created_at FROM tutor_notes WHERE session_id=? ORDER BY created_at').all(s.id);
    res.json({ session: s, notes });
  } catch (e) { next(e); }
});

router.post('/sessions/:id/step/:idx/answer', requireAuth, async (req, res, next) => {
  try {
    const db = getDb();
    const sessionId = parseInt(req.params.id, 10);
    const idx = parseInt(req.params.idx, 10);
    const s = db.prepare('SELECT * FROM tutor_sessions WHERE id=? AND user_id=?').get(sessionId, req.user.id);
    if (!s) throw new HttpError(404, 'session_not_found');
    const plan = JSON.parse(s.plan_json);
    if (!plan.steps[idx]) throw new HttpError(400, 'invalid_step');
    const step = plan.steps[idx];
    const { choice, text } = req.body || {};
    let correct = false;
    let userAnswerText = text || '';
    if (typeof choice === 'number' && step.options) {
      correct = choice === step.correct_idx;
      userAnswerText = step.options[choice] || String(choice);
    }
    const feedback = await ai.generate(prompts.TUTOR_FEEDBACK(s.concept, step, userAnswerText, correct), { temperature: 0.5 });
    db.prepare('UPDATE tutor_steps SET answer_json=?, feedback_md=? WHERE session_id=? AND idx=?')
      .run(JSON.stringify({ choice, text }), feedback, sessionId, idx);
    if (idx + 1 > s.current_step) {
      db.prepare('UPDATE tutor_sessions SET current_step=? WHERE id=?').run(idx + 1, sessionId);
    }
    res.json({ correct, correct_idx: step.correct_idx, explanation: step.explanation, feedback });
  } catch (e) { next(e); }
});

router.post('/sessions/:id/notes', requireAuth, (req, res, next) => {
  try {
    const sessionId = parseInt(req.params.id, 10);
    const db = getDb();
    const s = db.prepare('SELECT id FROM tutor_sessions WHERE id=? AND user_id=?').get(sessionId, req.user.id);
    if (!s) throw new HttpError(404, 'session_not_found');
    const { body, flashcard_worthy } = req.body || {};
    if (!body) throw new HttpError(400, 'missing_body');
    const r = db.prepare(`INSERT INTO tutor_notes (session_id, user_id, body, flashcard_worthy, created_at) VALUES (?,?,?,?,?)`)
      .run(sessionId, req.user.id, body, flashcard_worthy ? 1 : 0, nowIso());
    res.json({ id: r.lastInsertRowid });
  } catch (e) { next(e); }
});

router.post('/sessions/:id/finish', requireAuth, (req, res, next) => {
  try {
    const sessionId = parseInt(req.params.id, 10);
    const db = getDb();
    const s = db.prepare('SELECT id, started_at FROM tutor_sessions WHERE id=? AND user_id=?').get(sessionId, req.user.id);
    if (!s) throw new HttpError(404, 'session_not_found');
    db.prepare('UPDATE tutor_sessions SET ended_at=? WHERE id=?').run(nowIso(), sessionId);
    const dur = Math.max(60, Math.floor((Date.now() - new Date(s.started_at).getTime()) / 1000));
    db.prepare(`INSERT INTO study_events (user_id, kind, ref_id, duration_s, occurred_at) VALUES (?,?,?,?,?)`)
      .run(req.user.id, 'tutor', sessionId, dur, nowIso());
    res.json({ ok: true, duration_s: dur });
  } catch (e) { next(e); }
});

module.exports = router;
