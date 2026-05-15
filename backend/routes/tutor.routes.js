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
const { recordConceptOutcome } = require('../services/mastery.service');
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

const ConceptExtractSchema = z.object({
  concepts: z.array(z.string().min(1)).min(1).max(8),
});

function isGenericConcept(concept) {
  const c = String(concept || '').trim().toLowerCase();
  return !c ||
    c === 'document' ||
    c === 'untitled' ||
    /^chapter\s*\d+$/i.test(c) ||
    /^section\s*\d+$/i.test(c) ||
    /^slide\s*\d+$/i.test(c);
}

function fallbackConceptFromChunks(chunks, fallback) {
  for (const chunk of chunks || []) {
    const lines = String(chunk.text || '').split('\n')
      .map(line => line.replace(/\s+/g, ' ').trim())
      .filter(line => line.length >= 4 && line.length <= 80);
    const useful = lines.find(line => !isGenericConcept(line));
    if (useful) return useful;
  }
  return fallback || 'Object-Oriented Programming basics';
}

async function deriveConceptFromChunks(chunks, fallback) {
  if (!chunks || chunks.length === 0) return fallbackConceptFromChunks(chunks, fallback);
  try {
    const raw = await ai.generate(prompts.CONCEPT_EXTRACT(chunks), { format: 'json', temperature: 0.2 });
    const parsed = await parseJsonSafe(raw, ConceptExtractSchema, async (txt) => ai.generate(prompts.REPAIR_JSON(txt), { temperature: 0 }));
    const best = (parsed.concepts || []).map(c => c.trim()).find(c => c && !isGenericConcept(c));
    return best || fallbackConceptFromChunks(chunks, fallback);
  } catch (e) {
    log.warn('tutor_concept_extract_fallback', e.message || e);
    return fallbackConceptFromChunks(chunks, fallback);
  }
}

function sourceChunksForClient(chunks) {
  return (chunks || []).map(c => ({
    id: c.id,
    idx: c.idx,
    chapter_id: c.chapter_id || null,
    score: typeof c.score === 'number' ? c.score : null,
    text: String(c.text || '').slice(0, 1200),
  }));
}

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
    const requestedConcept = String(concept).trim();
    const materialId = material_id ? parseInt(material_id, 10) : null;
    if (material_id && !Number.isInteger(materialId)) throw new HttpError(400, 'invalid_material_id');
    const m = mode && ['socratic', 'explain', 'example'].includes(mode) ? mode : 'socratic';
    const db = getDb();
    let chunks = [];
    let effectiveConcept = requestedConcept;
    if (materialId) {
      const mat = db.prepare('SELECT id, title FROM materials WHERE id=? AND user_id=?').get(materialId, req.user.id);
      if (!mat) throw new HttpError(404, 'material_not_found');
      if (isGenericConcept(requestedConcept)) {
        const seedChunks = db.prepare('SELECT id, idx, text, chapter_id FROM chunks WHERE material_id=? ORDER BY idx LIMIT 6').all(materialId);
        effectiveConcept = await deriveConceptFromChunks(seedChunks, mat.title || requestedConcept);
      }
      chunks = await retrieve(materialId, effectiveConcept, { feature: 'tutor' });
    }
    if (!chunks.length) {
      chunks = await retrieve('system', effectiveConcept, { feature: 'tutor' });
    }
    let plan;
    try {
      const raw = await ai.generate(prompts.TUTOR_PLAN(effectiveConcept, m, chunks), { format: 'json', temperature: 0.5 });
      plan = await parseJsonSafe(raw, PlanSchema, async (txt) => ai.generate(prompts.REPAIR_JSON(txt), { temperature: 0 }));
    } catch (e) {
      log.warn('tutor_plan_fallback', e.message || e);
      plan = fallbackTutorPlan(effectiveConcept, m, chunks);
    }

    const sourceChunks = sourceChunksForClient(chunks);
    const storedPlan = { ...plan, source_chunks: sourceChunks };
    const startedAt = nowIso();
    const ins = db.prepare(`INSERT INTO tutor_sessions (user_id, material_id, concept, mode, plan_json, current_step, started_at) VALUES (?,?,?,?,?,?,?)`);
    const r = ins.run(req.user.id, materialId || null, effectiveConcept, m, JSON.stringify(storedPlan), 0, startedAt);
    const stepsIns = db.prepare(`INSERT INTO tutor_steps (session_id, idx, kind, prompt) VALUES (?,?,?,?)`);
    db.transaction(() => {
      plan.steps.forEach((s, i) => stepsIns.run(r.lastInsertRowid, i, 'mcq', JSON.stringify(s)));
    })();

    res.json({ session_id: r.lastInsertRowid, material_id: materialId || null, concept: effectiveConcept, requested_concept: requestedConcept, mode: m, plan: storedPlan, source_chunks: sourceChunks, started_at: startedAt });
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

router.patch('/sessions/:id/mode', requireAuth, (req, res, next) => {
  try {
    const sessionId = parseInt(req.params.id, 10);
    const nextMode = req.body && req.body.mode;
    if (!['socratic', 'explain', 'example'].includes(nextMode)) throw new HttpError(400, 'invalid_mode');
    const db = getDb();
    const s = db.prepare('SELECT id FROM tutor_sessions WHERE id=? AND user_id=?').get(sessionId, req.user.id);
    if (!s) throw new HttpError(404, 'session_not_found');
    db.prepare('UPDATE tutor_sessions SET mode=? WHERE id=?').run(nextMode, sessionId);
    res.json({ ok: true, mode: nextMode });
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
    const feedback = await ai.generate(prompts.TUTOR_FEEDBACK(s.concept, step, userAnswerText, correct, plan.source_chunks || []), { temperature: 0.5 });
    db.prepare('UPDATE tutor_steps SET answer_json=?, feedback_md=? WHERE session_id=? AND idx=?')
      .run(JSON.stringify({ choice, text }), feedback, sessionId, idx);
    if (idx + 1 > s.current_step) {
      db.prepare('UPDATE tutor_sessions SET current_step=? WHERE id=?').run(idx + 1, sessionId);
    }
    recordConceptOutcome(req.user.id, s.concept, correct, { correctDelta: 5, incorrectDelta: -4 });
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
