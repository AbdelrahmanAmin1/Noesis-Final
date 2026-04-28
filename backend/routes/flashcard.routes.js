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

const router = express.Router();
const nowIso = () => new Date().toISOString();

const FlashSchema = z.object({
  cards: z.array(z.object({
    question: z.string().min(1),
    answer: z.string().min(1),
    source_chunk_id: z.number().int().nullable().optional(),
  })).min(1),
});

router.get('/due', requireAuth, (req, res, next) => {
  try {
    const db = getDb();
    const now = nowIso();
    // Cards with no review yet are immediately "due"
    const rows = db.prepare(`
      SELECT f.id, f.deck, f.question, f.answer, f.material_id,
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
    const chunks = await retrieve(material_id, m.title, 8);
    const raw = await ai.generate(prompts.FLASHCARDS(chunks, n), { format: 'json', temperature: 0.4 });
    const data = await parseJsonSafe(raw, FlashSchema, async (txt) => ai.generate(prompts.REPAIR_JSON(txt), { temperature: 0 }));
    const ins = db.prepare(`INSERT INTO flashcards (user_id, material_id, deck, question, answer, source_chunk_id, created_at)
                            VALUES (?,?,?,?,?,?,?)`);
    const ids = [];
    db.transaction(() => {
      for (const c of data.cards) {
        const r = ins.run(req.user.id, material_id, m.title, c.question, c.answer, c.source_chunk_id || null, nowIso());
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
