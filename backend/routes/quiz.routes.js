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
const { retrieveLessonContext, groundingTier: computeGroundingTier } = require('../services/rag.service');
const educationalContext = require('../services/educational-context.service');
const domainDetection = require('../services/domain-detection.service');
const materialUnderstanding = require('../services/material-understanding.service');
const { recordConceptOutcome } = require('../services/mastery.service');
const log = require('../utils/logger');
const gamification = require('../services/gamification.service');

const router = express.Router();
const nowIso = () => new Date().toISOString();
const PLACEHOLDER_RE = /\b(what is this topic|define the concept|true or false:?\s*this is important|example here|definition goes here|placeholder|todo|lorem ipsum)\b/i;

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
      SELECT c.title
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
      SELECT ch.heading, ch.chapter_title, ch.section_title, ch.slide_title
      FROM chunks ch
      JOIN materials m ON m.id = ch.material_id
      WHERE ch.id=? AND ch.material_id=? AND m.user_id=?
    `).get(scope.chunkId, materialId, userId);
    if (!row) throw new HttpError(404, 'chunk_not_found');
    return { title: row.heading || row.section_title || row.slide_title || row.chapter_title || 'Selected section' };
  }
  return { title: null };
}

const QuizSchema = z.object({
  questions: z.array(z.object({
    question: z.string().min(1),
    options: z.array(z.string()).length(4),
    correct_idx: z.number().int().min(0).max(3),
    explanation: z.string().optional().default(''),
    difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
    topic: z.string().optional(),
    concept: z.string().optional().default(''),
  })).min(1),
});

function fallbackQuizFromChunks(chunks, count, difficulty) {
  const facts = chunks
    .flatMap(c => String(c.text || '').split(/[\n.?!]+/))
    .map(s => s.replace(/\s+/g, ' ').trim())
    .filter(s => s.length >= 18 && s.length <= 180)
    .slice(0, 24);
  const sourceFacts = facts.length ? facts : ['The uploaded material did not provide enough extractable detail for a stronger question.'];
  const genericDistractors = [
    'The uploaded material does not state this relationship.',
    'This option is not supported by the extracted source text.',
    'The source material points to a different operation or concept.',
  ];
  const questions = [];
  for (let i = 0; i < count; i++) {
    const correct = sourceFacts[i % sourceFacts.length];
    const topic = inferTopic(correct);
    const distractors = sourceFacts.filter(f => f !== correct).slice(i + 1, i + 4);
    while (distractors.length < 3) distractors.push(genericDistractors[distractors.length]);
    const correctIdx = i % 4;
    const options = distractors.slice(0, 3);
    options.splice(correctIdx, 0, correct);
    questions.push({
      question: `According to the uploaded material, which statement best describes ${topic}?`,
      options,
      correct_idx: correctIdx,
      explanation: `This answer is grounded in the extracted source text: "${correct}"`,
      difficulty,
      topic,
    });
  }
  return { questions };
}

function stripInternalRefs(value) {
  return String(value || '')
    .replace(/\[chunk\s*:\s*\d+\]/gi, '')
    .replace(/\[source[_\s-]*chunk\s*:\s*\d+\]/gi, '')
    .replace(/"?source[_\s-]*chunk[_\s-]*id"?\s*:?\s*\d+/gi, '')
    .replace(/\bchunk\s*id\s*#?\s*\d+\b/gi, '')
    .replace(/sourceChunkIds?\s*:\s*\[[^\]]*\]/gi, '')
    .replace(/\b(debug|trace|raw curated json|internal metadata)\s*:\s*/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function optionKey(value) {
  return stripInternalRefs(value).toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function sanitizeQuestion(question, difficulty) {
  if (!question || typeof question !== 'object') return null;
  const prompt = stripInternalRefs(question.question);
  const explanation = stripInternalRefs(question.explanation);
  const options = Array.isArray(question.options)
    ? question.options.map(stripInternalRefs).filter(Boolean).slice(0, 4)
    : [];
  const optionKeys = new Set(options.map(optionKey).filter(Boolean));
  const correctIdx = Number(question.correct_idx);
  if (prompt.length < 12 || PLACEHOLDER_RE.test(prompt)) return null;
  if (explanation.length < 12 || PLACEHOLDER_RE.test(explanation)) return null;
  if (options.length !== 4 || optionKeys.size !== 4) return null;
  if (!Number.isInteger(correctIdx) || correctIdx < 0 || correctIdx > 3) return null;
  const topic = stripInternalRefs(question.topic || question.concept || inferTopic(prompt));
  return {
    question: prompt,
    options,
    correct_idx: correctIdx,
    explanation,
    difficulty: ['easy', 'medium', 'hard'].includes(question.difficulty) ? question.difficulty : difficulty,
    topic: topic || inferTopic(prompt),
    concept: stripInternalRefs(question.concept || topic),
  };
}

function ensureQuizCount(data, chunks, count, difficulty) {
  const questions = [];
  const seen = new Set();
  for (const raw of Array.isArray(data && data.questions) ? data.questions : []) {
    if (questions.length >= count) break;
    const question = sanitizeQuestion(raw, difficulty);
    if (!question) continue;
    const key = question.question.toLowerCase();
    if (seen.has(key)) continue;
    questions.push(question);
    seen.add(key);
  }
  if (questions.length >= count) return { questions };
  const fallback = fallbackQuizFromChunks(chunks, count, difficulty).questions;
  for (const raw of fallback) {
    if (questions.length >= count) break;
    const q = sanitizeQuestion(raw, difficulty);
    if (!q) continue;
    const key = q.question.toLowerCase();
    if (seen.has(key)) continue;
    questions.push(q);
    seen.add(key);
  }
  return { questions };
}

function inferTopic(text) {
  const cleaned = String(text || '').replace(/[^A-Za-z0-9 +#-]/g, ' ');
  const known = ['Big O', 'Array', 'Arrays', 'Stack', 'Stacks', 'Queue', 'Queues', 'Class', 'Object', 'Inheritance', 'Polymorphism', 'Encapsulation', 'Tree', 'Graph', 'Hash'];
  const hit = known.find(k => new RegExp(`\\b${k}\\b`, 'i').test(cleaned));
  if (hit) return hit;
  const words = cleaned.split(/\s+/).filter(w => w.length > 3).slice(0, 3);
  return words.length ? words.join(' ') : 'this concept';
}

router.post('/generate', requireAuth, aiLimiter, async (req, res, next) => {
  try {
    const { material_id, count, difficulty } = req.body || {};
    if (!material_id) throw new HttpError(400, 'missing_material_id');
    const scope = generationScope(req.body || {});
    const n = Math.min(20, Math.max(2, parseInt(count || 6, 10)));
    const diff = ['easy', 'medium', 'hard'].includes(difficulty) ? difficulty : 'medium';
    const db = getDb();
    const m = db.prepare('SELECT id, title FROM materials WHERE id=? AND user_id=?').get(material_id, req.user.id);
    if (!m) throw new HttpError(404, 'material_not_found');
    const scopeInfo = validateScope(db, req.user.id, material_id, scope);
    let topicQuery = stripInternalRefs((req.body && req.body.topic) || scopeInfo.title || m.title);
    const sourceUnderstanding = materialUnderstanding.understandGeneralFromDb(req.user.id, material_id, {
      explicitQuery: topicQuery,
      scopeTitle: scopeInfo.title,
      title: m.title,
      sourceScope: scope.sourceScope,
      chapterId: scope.chapterId,
      chunkId: scope.chunkId,
    });
    topicQuery = stripInternalRefs(sourceUnderstanding.topic || topicQuery || m.title);
    const domainInfo = domainDetection.detectMaterialDomain(req.user.id, material_id, { hint: topicQuery });
    const focusTerms = materialUnderstanding.focusTermsForTopic(topicQuery, sourceUnderstanding.sourceOutline || null);
    const avoidTerms = materialUnderstanding.competingTermsForTopic(topicQuery, sourceUnderstanding.sourceOutline || null);
    const ragResult = await retrieveLessonContext(material_id, topicQuery, {
      feature: 'quiz',
      k: 8,
      minScore: 0.08,
      maxMerged: 12,
      sourceScope: scope.sourceScope,
      chapterId: scope.chapterId,
      chunkId: scope.chunkId,
      focusTopic: topicQuery,
      focusTerms,
      avoidTerms,
      includeSystem: domainDetection.shouldUseCuratedCs(domainInfo),
    });
    const uploadedChunks = (ragResult.uploaded && ragResult.uploaded.chunks) || [];
    const context = educationalContext.buildEducationalContext({
      userId: req.user.id,
      materialId: material_id,
      topic: m.title,
      query: topicQuery,
      feature: 'quiz',
      ragResult,
      retrievedChunks: ragResult.chunks,
      domainInfo,
      audienceLevel: 'beginner',
    });
    const educationalContextPrompt = educationalContext.formatPracticeEducationalContextForPrompt(context, { feature: 'quiz' });
    const tier = computeGroundingTier(ragResult.uploaded || ragResult);
    let data;
    try {
      const raw = await ai.generate(prompts.QUIZ_MCQ(uploadedChunks, n, diff, {
        educationalContext: educationalContextPrompt,
        groundingTier: tier,
      }), { format: 'json', temperature: 0.4 });
      data = await parseJsonSafe(raw, QuizSchema, async (txt) => ai.generate(prompts.REPAIR_JSON(txt), { temperature: 0 }));
    } catch (e) {
      log.warn('quiz_generation_fallback', e.message || e);
      data = fallbackQuizFromChunks(uploadedChunks, n, diff);
    }
    data = ensureQuizCount(data, uploadedChunks, n, diff);

    const qIns = db.prepare(`INSERT INTO quizzes (user_id, material_id, title, difficulty, created_at) VALUES (?,?,?,?,?)`);
    const qqIns = db.prepare(`INSERT INTO quiz_questions (quiz_id, idx, question, options_json, correct_idx, explanation, concept) VALUES (?,?,?,?,?,?,?)`);
    const questions = data.questions.slice(0, n);
    let quizId;
    db.transaction(() => {
      const qr = qIns.run(req.user.id, material_id, m.title + ' Quiz', diff, nowIso());
      quizId = qr.lastInsertRowid;
      questions.forEach((q, i) => {
        qqIns.run(quizId, i, q.question, JSON.stringify(q.options), q.correct_idx, q.explanation || '', q.topic || q.concept || '');
      });
    })();
    res.json({
      quiz_id: quizId,
      count: questions.length,
      source_scope: scope.sourceScope,
      source_label: ragResult.sourceLabel,
      chapter_id: scope.chapterId,
      chunk_id: scope.chunkId,
      domain: domainInfo,
    });
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
             qa.selected_idx, q.id AS quiz_id, q.title AS quiz_title, q.difficulty
      FROM quiz_answers qa
      JOIN quiz_questions qq ON qq.id = qa.question_id
      JOIN quiz_attempts at ON at.id = qa.attempt_id
      JOIN quizzes q ON q.id = at.quiz_id
      WHERE at.user_id=? AND qa.is_correct=0
      ORDER BY at.started_at DESC
      LIMIT 50`).all(req.user.id);
    res.json({ wrong: rows.map(r => ({ ...r, topic: r.concept, options: JSON.parse(r.options_json) })) });
  } catch (e) { next(e); }
});

router.get('/:id', requireAuth, (req, res, next) => {
  try {
    const db = getDb();
    const id = parseInt(req.params.id, 10);
    const q = db.prepare('SELECT * FROM quizzes WHERE id=? AND user_id=?').get(id, req.user.id);
    if (!q) throw new HttpError(404, 'quiz_not_found');
    const qs = db.prepare('SELECT id, idx, question, options_json, concept FROM quiz_questions WHERE quiz_id=? ORDER BY idx').all(id);
    res.json({ quiz: q, questions: qs.map(qq => ({ ...qq, topic: qq.concept, difficulty: q.difficulty, options: JSON.parse(qq.options_json) })) });
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
    const at = db.prepare('SELECT id, quiz_id, finished_at FROM quiz_attempts WHERE id=? AND user_id=?').get(attemptId, req.user.id);
    if (!at) throw new HttpError(404, 'attempt_not_found');
    if (at.finished_at) throw new HttpError(409, 'attempt_already_finished');
    const qq = db.prepare('SELECT correct_idx, explanation FROM quiz_questions WHERE id=? AND quiz_id=?').get(questionId, at.quiz_id);
    if (!qq) throw new HttpError(404, 'question_not_found');
    const isCorrect = selected === qq.correct_idx;
    const existing = db.prepare('SELECT id FROM quiz_answers WHERE attempt_id=? AND question_id=? ORDER BY id DESC LIMIT 1').get(attemptId, questionId);
    if (existing) throw new HttpError(409, 'answer_already_submitted');
    db.prepare('INSERT INTO quiz_answers (attempt_id, question_id, selected_idx, is_correct) VALUES (?,?,?,?)')
      .run(attemptId, questionId, selected, isCorrect ? 1 : 0);
    res.json({ is_correct: isCorrect, correct_idx: qq.correct_idx, explanation: qq.explanation });
  } catch (e) { next(e); }
});

router.post('/attempts/:id/finish', requireAuth, (req, res, next) => {
  try {
    const attemptId = parseInt(req.params.id, 10);
    const db = getDb();
    const at = db.prepare('SELECT id, finished_at FROM quiz_attempts WHERE id=? AND user_id=?').get(attemptId, req.user.id);
    if (!at) throw new HttpError(404, 'attempt_not_found');
    if (at.finished_at) throw new HttpError(409, 'attempt_already_finished');
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
    const outcomes = db.prepare(`SELECT qq.concept, qa.is_correct
                                 FROM quiz_answers qa JOIN quiz_questions qq ON qq.id=qa.question_id
                                 WHERE qa.attempt_id=?
                                   AND qa.id IN (SELECT MAX(id) FROM quiz_answers WHERE attempt_id=? GROUP BY question_id)`).all(attemptId, attemptId);
    for (const o of outcomes) {
      if (o.concept) recordConceptOutcome(req.user.id, o.concept, !!o.is_correct, { correctDelta: 8, incorrectDelta: -6 });
    }
    const finishReward = gamification.award(req.user.id, 'quiz_finished', 'quiz_attempt', attemptId, {
      metadata: { score, total: stats.total, correct: stats.correct },
    });
    const highReward = score >= 80
      ? gamification.award(req.user.id, 'quiz_high_score', 'quiz_attempt', attemptId, {
        metadata: { score, total: stats.total, correct: stats.correct },
      })
      : null;
    res.json({
      score,
      total: stats.total,
      correct: stats.correct,
      wrong: wrong.map(w => ({ ...w, options: JSON.parse(w.options_json) })),
      reward: {
        points: (finishReward.awarded ? finishReward.points : 0) + (highReward && highReward.awarded ? highReward.points : 0),
        events: [finishReward, highReward].filter(r => r && r.awarded).map(r => r.event.event_type),
        unlocked: [...(finishReward.unlocked || []), ...((highReward && highReward.unlocked) || [])],
      },
      gamification: (highReward && highReward.summary) || finishReward.summary || null,
    });
  } catch (e) { next(e); }
});

module.exports = router;
