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

const router = express.Router();
const nowIso = () => new Date().toISOString();

const QuizSchema = z.object({
  questions: z.array(z.object({
    question: z.string().min(1),
    options: z.array(z.string()).length(4),
    correct_idx: z.number().int().min(0).max(3),
    explanation: z.string().optional().default(''),
    concept: z.string().optional().default(''),
  })).min(1),
});

router.post('/generate', requireAuth, aiLimiter, async (req, res, next) => {
  try {
    const { material_id, count, difficulty } = req.body || {};
    if (!material_id) throw new HttpError(400, 'missing_material_id');
    const n = Math.min(20, Math.max(2, parseInt(count || 6, 10)));
    const diff = ['easy', 'medium', 'hard'].includes(difficulty) ? difficulty : 'medium';
    const db = getDb();
    const m = db.prepare('SELECT id, title FROM materials WHERE id=? AND user_id=?').get(material_id, req.user.id);
    if (!m) throw new HttpError(404, 'material_not_found');
    const chunks = await retrieve(material_id, m.title, 8);
    const raw = await ai.generate(prompts.QUIZ_MCQ(chunks, n, diff), { format: 'json', temperature: 0.4 });
    const data = await parseJsonSafe(raw, QuizSchema, async (txt) => ai.generate(prompts.REPAIR_JSON(txt), { temperature: 0 }));

    const qIns = db.prepare(`INSERT INTO quizzes (user_id, material_id, title, difficulty, created_at) VALUES (?,?,?,?,?)`);
    const qqIns = db.prepare(`INSERT INTO quiz_questions (quiz_id, idx, question, options_json, correct_idx, explanation, concept) VALUES (?,?,?,?,?,?,?)`);
    let quizId;
    db.transaction(() => {
      const qr = qIns.run(req.user.id, material_id, m.title + ' Quiz', diff, nowIso());
      quizId = qr.lastInsertRowid;
      data.questions.forEach((q, i) => {
        qqIns.run(quizId, i, q.question, JSON.stringify(q.options), q.correct_idx, q.explanation || '', q.concept || '');
      });
    })();
    res.json({ quiz_id: quizId, count: data.questions.length });
  } catch (e) { next(e); }
});

router.get('/', requireAuth, (req, res, next) => {
  try {
    const db = getDb();
    const rows = db.prepare(`
      SELECT q.id, q.title, q.difficulty, q.created_at,
             (SELECT COUNT(*) FROM quiz_questions qq WHERE qq.quiz_id = q.id) AS question_count,
             (SELECT score FROM quiz_attempts a WHERE a.quiz_id = q.id AND a.user_id = q.user_id ORDER BY a.id DESC LIMIT 1) AS last_score
      FROM quizzes q WHERE q.user_id=? ORDER BY q.created_at DESC LIMIT 50
    `).all(req.user.id);
    res.json({ quizzes: rows });
  } catch (e) { next(e); }
});

router.get('/wrong-answers', requireAuth, (req, res, next) => {
  try {
    const db = getDb();
    const rows = db.prepare(`
      SELECT qa.attempt_id, qq.id AS question_id, qq.question, qq.options_json, qq.correct_idx, qq.explanation, qq.concept,
             qa.selected_idx, q.id AS quiz_id, q.title AS quiz_title
      FROM quiz_answers qa
      JOIN quiz_questions qq ON qq.id = qa.question_id
      JOIN quiz_attempts at ON at.id = qa.attempt_id
      JOIN quizzes q ON q.id = at.quiz_id
      WHERE at.user_id=? AND qa.is_correct=0
      ORDER BY at.started_at DESC
      LIMIT 50`).all(req.user.id);
    res.json({ wrong: rows.map(r => ({ ...r, options: JSON.parse(r.options_json) })) });
  } catch (e) { next(e); }
});

router.get('/:id', requireAuth, (req, res, next) => {
  try {
    const db = getDb();
    const id = parseInt(req.params.id, 10);
    const q = db.prepare('SELECT * FROM quizzes WHERE id=? AND user_id=?').get(id, req.user.id);
    if (!q) throw new HttpError(404, 'quiz_not_found');
    const qs = db.prepare('SELECT id, idx, question, options_json, concept FROM quiz_questions WHERE quiz_id=? ORDER BY idx').all(id);
    res.json({ quiz: q, questions: qs.map(qq => ({ ...qq, options: JSON.parse(qq.options_json) })) });
  } catch (e) { next(e); }
});

router.post('/:id/attempt', requireAuth, (req, res, next) => {
  try {
    const db = getDb();
    const id = parseInt(req.params.id, 10);
    const q = db.prepare('SELECT id FROM quizzes WHERE id=? AND user_id=?').get(id, req.user.id);
    if (!q) throw new HttpError(404, 'quiz_not_found');
    const r = db.prepare('INSERT INTO quiz_attempts (quiz_id, user_id, started_at) VALUES (?,?,?)').run(id, req.user.id, nowIso());
    res.json({ attempt_id: r.lastInsertRowid });
  } catch (e) { next(e); }
});

router.post('/attempts/:id/answer', requireAuth, (req, res, next) => {
  try {
    const attemptId = parseInt(req.params.id, 10);
    const { question_id, selected_idx } = req.body || {};
    const selected = parseInt(selected_idx, 10);
    const questionId = parseInt(question_id, 10);
    if (!questionId || Number.isNaN(selected) || selected < 0 || selected > 3) throw new HttpError(400, 'invalid_answer');
    const db = getDb();
    const at = db.prepare('SELECT id, quiz_id FROM quiz_attempts WHERE id=? AND user_id=?').get(attemptId, req.user.id);
    if (!at) throw new HttpError(404, 'attempt_not_found');
    const qq = db.prepare('SELECT correct_idx, explanation FROM quiz_questions WHERE id=? AND quiz_id=?').get(questionId, at.quiz_id);
    if (!qq) throw new HttpError(404, 'question_not_found');
    const isCorrect = selected === qq.correct_idx;
    const existing = db.prepare('SELECT id FROM quiz_answers WHERE attempt_id=? AND question_id=? ORDER BY id DESC LIMIT 1').get(attemptId, questionId);
    if (existing) {
      db.prepare('UPDATE quiz_answers SET selected_idx=?, is_correct=? WHERE id=?').run(selected, isCorrect ? 1 : 0, existing.id);
    } else {
      db.prepare('INSERT INTO quiz_answers (attempt_id, question_id, selected_idx, is_correct) VALUES (?,?,?,?)')
        .run(attemptId, questionId, selected, isCorrect ? 1 : 0);
    }
    res.json({ is_correct: isCorrect, correct_idx: qq.correct_idx, explanation: qq.explanation });
  } catch (e) { next(e); }
});

router.post('/attempts/:id/finish', requireAuth, (req, res, next) => {
  try {
    const attemptId = parseInt(req.params.id, 10);
    const db = getDb();
    const at = db.prepare('SELECT id FROM quiz_attempts WHERE id=? AND user_id=?').get(attemptId, req.user.id);
    if (!at) throw new HttpError(404, 'attempt_not_found');
    const stats = db.prepare(`
      SELECT COUNT(*) AS total, COALESCE(SUM(is_correct), 0) AS correct
      FROM quiz_answers
      WHERE attempt_id=? AND id IN (SELECT MAX(id) FROM quiz_answers WHERE attempt_id=? GROUP BY question_id)
    `).get(attemptId, attemptId);
    const score = stats.total ? Math.round((stats.correct / stats.total) * 100) : 0;
    db.prepare('UPDATE quiz_attempts SET finished_at=?, score=? WHERE id=?').run(nowIso(), score, attemptId);
    db.prepare(`INSERT INTO study_events (user_id, kind, ref_id, duration_s, occurred_at) VALUES (?,?,?,?,?)`)
      .run(req.user.id, 'quiz', attemptId, 600, nowIso());
    const wrong = db.prepare(`SELECT qq.question, qq.options_json, qq.correct_idx, qq.explanation, qa.selected_idx
                              FROM quiz_answers qa JOIN quiz_questions qq ON qq.id=qa.question_id
                              WHERE qa.attempt_id=? AND qa.is_correct=0
                                AND qa.id IN (SELECT MAX(id) FROM quiz_answers WHERE attempt_id=? GROUP BY question_id)`).all(attemptId, attemptId);
    res.json({ score, total: stats.total, correct: stats.correct, wrong: wrong.map(w => ({ ...w, options: JSON.parse(w.options_json) })) });
  } catch (e) { next(e); }
});

module.exports = router;
