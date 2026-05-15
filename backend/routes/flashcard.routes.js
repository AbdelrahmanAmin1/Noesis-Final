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
const srs = require('../services/srs.service');
const log = require('../utils/logger');

const router = express.Router();
const nowIso = () => new Date().toISOString();

const FlashSchema = z.object({
  cards: z.array(z.object({
    question: z.string().min(1),
    answer: z.string().min(1),
    difficulty: z.preprocess((value) => {
      const normalized = String(value || 'medium').toLowerCase();
      return ['easy', 'medium', 'hard'].includes(normalized) ? normalized : 'medium';
    }, z.enum(['easy', 'medium', 'hard'])).optional().default('medium'),
    topic: z.string().optional().default('General'),
    source_chunk_id: z.preprocess((value) => {
      if (value === null || value === undefined || value === '') return null;
      const n = Number(value);
      return Number.isInteger(n) ? n : null;
    }, z.number().int().nullable()).optional().default(null),
  })).min(1),
});

function cleanSourceText(text) {
  return String(text || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\[[^\]]+\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function inferTopic(text, fallback) {
  const cleaned = cleanSourceText(text)
    .replace(/^[^A-Za-z0-9]+/, '')
    .split(/[.:;-]/)[0]
    .trim();
  const words = cleaned.split(/\s+/).filter(Boolean).slice(0, 5).join(' ');
  return words || fallback || 'General';
}

function fallbackFlashcardsFromChunks(chunks, count, deckTitle) {
  const candidates = [];
  for (const chunk of chunks || []) {
    const text = cleanSourceText(chunk.text);
    const sentences = text
      .split(/(?<=[.!?])\s+/)
      .map(s => s.trim())
      .filter(s => s.length >= 35 && s.length <= 260);
    const sourceSentences = sentences.length ? sentences : (text ? [text.slice(0, 260)] : []);
    for (const sentence of sourceSentences) {
      candidates.push({ sentence, chunkId: chunk.id });
      if (candidates.length >= count * 2) break;
    }
    if (candidates.length >= count * 2) break;
  }
  const cards = candidates.slice(0, count).map((item, idx) => {
    const topic = inferTopic(item.sentence, deckTitle);
    return {
      question: `What should you remember about ${topic}?`,
      answer: `${item.sentence} [chunk:${item.chunkId}]`,
      difficulty: idx < 2 ? 'easy' : 'medium',
      topic,
      source_chunk_id: item.chunkId,
    };
  });
  return { cards };
}

function sanitizeCards(cards, chunks, count, deckTitle) {
  const validChunkIds = new Set((chunks || []).map(c => Number(c.id)).filter(Number.isInteger));
  return (cards || [])
    .map((card) => {
      const question = String(card.question || '').replace(/\s+/g, ' ').trim();
      const answer = String(card.answer || '').replace(/\s+/g, ' ').trim();
      const topic = String(card.topic || deckTitle || 'General').replace(/\s+/g, ' ').trim();
      const sourceId = Number(card.source_chunk_id);
      return {
        question,
        answer,
        difficulty: ['easy', 'medium', 'hard'].includes(card.difficulty) ? card.difficulty : 'medium',
        topic: topic || deckTitle || 'General',
        source_chunk_id: Number.isInteger(sourceId) && validChunkIds.has(sourceId) ? sourceId : null,
      };
    })
    .filter(card => card.question && card.answer)
    .slice(0, count);
}

router.get('/', requireAuth, (req, res, next) => {
  try {
    const db = getDb();
    const materialId = req.query.material_id ? parseInt(req.query.material_id, 10) : null;
    if (materialId) {
      const m = db.prepare('SELECT id FROM materials WHERE id=? AND user_id=?').get(materialId, req.user.id);
      if (!m) throw new HttpError(404, 'material_not_found');
    }
    const rows = materialId
      ? db.prepare(`SELECT id, material_id, deck, question, answer, difficulty, topic, source_chunk_id, created_at
                    FROM flashcards WHERE user_id=? AND material_id=? ORDER BY created_at DESC`).all(req.user.id, materialId)
      : db.prepare(`SELECT id, material_id, deck, question, answer, difficulty, topic, source_chunk_id, created_at
                    FROM flashcards WHERE user_id=? ORDER BY created_at DESC LIMIT 200`).all(req.user.id);
    res.json({ cards: rows });
  } catch (e) { next(e); }
});

router.get('/due', requireAuth, (req, res, next) => {
  try {
    const db = getDb();
    const now = nowIso();
    // Cards with no review yet are immediately "due"
    const rows = db.prepare(`
      SELECT f.id, f.deck, f.question, f.answer, f.material_id, f.difficulty, f.topic,
             (SELECT due_at FROM flashcard_reviews r WHERE r.card_id=f.id ORDER BY reviewed_at DESC LIMIT 1) AS due_at,
             (SELECT ease FROM flashcard_reviews r WHERE r.card_id=f.id ORDER BY reviewed_at DESC LIMIT 1) AS ease
      FROM flashcards f
      WHERE f.user_id=?
      ORDER BY due_at IS NULL DESC, due_at ASC
      LIMIT 50
    `).all(req.user.id);
    const due = rows.filter(r => !r.due_at || r.due_at <= now);
    res.json({ cards: due, total_due: due.length });
  } catch (e) { next(e); }
});

router.post('/generate', requireAuth, aiLimiter, async (req, res, next) => {
  try {
    const { material_id, count } = req.body || {};
    if (!material_id) throw new HttpError(400, 'missing_material_id');
    const n = Math.min(20, Math.max(1, parseInt(count || 6, 10)));
    const db = getDb();
    const m = db.prepare('SELECT id, title FROM materials WHERE id=? AND user_id=?').get(material_id, req.user.id);
    if (!m) throw new HttpError(404, 'material_not_found');
    await ai.assertModelsAvailable({ generation: true, embedding: true });
    const chunks = await retrieve(material_id, m.title, { feature: 'flashcards' });
    const raw = await ai.generate(prompts.FLASHCARDS(chunks, n), {
      format: 'json',
      temperature: 0.35,
      num_ctx: 2048,
      num_predict: Math.min(1100, 180 + n * 90),
    });
    let data;
    try {
      data = await parseJsonSafe(raw, FlashSchema, async (txt) => ai.generate(prompts.REPAIR_JSON(txt), { temperature: 0, num_predict: 700 }));
    } catch (e) {
      log.warn('flashcard_json_fallback', e.message || e);
      data = fallbackFlashcardsFromChunks(chunks, n, m.title);
    }
    let cards = sanitizeCards(data.cards, chunks, n, m.title);
    if (!cards.length) cards = sanitizeCards(fallbackFlashcardsFromChunks(chunks, n, m.title).cards, chunks, n, m.title);
    if (!cards.length) throw new HttpError(502, 'flashcard_generation_empty', 'Could not create flashcards from the available source text.');
    const ins = db.prepare(`INSERT INTO flashcards (user_id, material_id, deck, question, answer, difficulty, topic, source_chunk_id, created_at)
                            VALUES (?,?,?,?,?,?,?,?,?)`);
    const ids = [];
    db.transaction(() => {
      for (const c of cards) {
        const r = ins.run(req.user.id, material_id, m.title, c.question, c.answer, c.difficulty || 'medium', c.topic || m.title, c.source_chunk_id, nowIso());
        ids.push(r.lastInsertRowid);
      }
    })();
    res.json({ created: ids.length, ids });
  } catch (e) { next(e); }
});

router.post('/:id/review', requireAuth, (req, res, next) => {
  try {
    const cardId = parseInt(req.params.id, 10);
    const rating = parseInt((req.body || {}).rating, 10);
    if (!cardId || !rating || rating < 1 || rating > 4) throw new HttpError(400, 'invalid_rating');
    const db = getDb();
    const card = db.prepare('SELECT id FROM flashcards WHERE id=? AND user_id=?').get(cardId, req.user.id);
    if (!card) throw new HttpError(404, 'card_not_found');
    const prev = db.prepare('SELECT ease, interval_days, reps FROM flashcard_reviews WHERE card_id=? AND user_id=? ORDER BY reviewed_at DESC LIMIT 1').get(cardId, req.user.id);
    const sched = srs.nextSchedule(prev, rating);
    const r = db.prepare(`INSERT INTO flashcard_reviews (card_id, user_id, rating, ease, interval_days, reps, due_at, reviewed_at)
                          VALUES (?,?,?,?,?,?,?,?)`)
      .run(cardId, req.user.id, rating, sched.ease, sched.interval_days, sched.reps, sched.due_at, nowIso());
    db.prepare(`INSERT INTO study_events (user_id, kind, ref_id, duration_s, occurred_at) VALUES (?,?,?,?,?)`)
      .run(req.user.id, 'flashcard', cardId, 30, nowIso());
    res.json({ review_id: r.lastInsertRowid, ...sched });
  } catch (e) { next(e); }
});

module.exports = router;
