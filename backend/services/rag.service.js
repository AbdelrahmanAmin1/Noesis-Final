'use strict';

const { getDb } = require('../config/db');
const ai = require('./ai.service');
const { expandQuery } = require('../utils/concept-synonyms');

function bufToFloat32(buf) {
  if (!buf) return null;
  if (buf instanceof Float32Array) return buf;
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  return new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4);
}

function float32ToBuf(arr) {
  const f = arr instanceof Float32Array ? arr : Float32Array.from(arr);
  return Buffer.from(f.buffer, f.byteOffset, f.byteLength);
}

function cosine(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

async function embedAndStore(materialId, chunks) {
  const db = getDb();
  const upd = db.prepare('UPDATE chunks SET embedding=? WHERE id=?');
  for (const c of chunks) {
    try {
      const e = await ai.embed(c.text);
      upd.run(float32ToBuf(e), c.id);
    } catch (err) {
      // continue; partial embeddings still useful
    }
  }
}

function keywordScore(rows, query) {
  const terms = String(query || '').toLowerCase().split(/\W+/).filter(t => t && t.length > 1);
  return rows.map(r => {
    const t = (r.text || '').toLowerCase();
    let score = 0;
    for (const term of terms) if (term && t.includes(term)) score += 1;
    return { ...r, score: terms.length ? score / terms.length : 0 };
  });
}

function titleBoost(row, queryTerms) {
  const title = (row.chapter_title || '').toLowerCase();
  const heading = (row.heading || '').toLowerCase();
  if (!title && !heading) return 0;
  let boost = 0;
  for (const term of queryTerms) {
    if (term.length < 2) continue;
    if (title.includes(term)) boost += 0.10;
    if (heading.includes(term)) boost += 0.08;
  }
  return Math.min(boost, 0.20);
}

const FEATURE_K = {
  notes: 8,
  flashcards: 6,
  quiz: 6,
  video: 10,
  tutor: 6,
  default: 6,
};

async function retrieveWithMeta(materialId, query, kOrOpts = 6, minScore = 0.05) {
  let k, feature;
  if (typeof kOrOpts === 'object') {
    feature = kOrOpts.feature || 'default';
    k = kOrOpts.k || FEATURE_K[feature] || FEATURE_K.default;
    minScore = kOrOpts.minScore ?? 0.10;
  } else {
    k = kOrOpts;
    feature = 'default';
  }

  const db = getDb();
  let rows;
  if (materialId === 'system') {
    rows = db.prepare(`SELECT c.id, c.idx, c.text, c.embedding, c.chapter_id,
                              c.source_page, c.chapter_title, c.heading
                       FROM chunks c JOIN materials m ON m.id = c.material_id
                       WHERE m.user_id = 0`).all();
  } else {
    rows = db.prepare(`SELECT id, idx, text, embedding, chapter_id,
                              source_page, chapter_title, heading
                       FROM chunks WHERE material_id=?`).all(materialId);
  }
  if (rows.length === 0) return { chunks: [], maxScore: 0, meanScore: 0 };

  const expanded = expandQuery(query);
  const queryTerms = expanded.toLowerCase().split(/\W+/).filter(t => t && t.length > 1);

  let qv;
  try { qv = await ai.embed(query); } catch (_) { qv = null; }

  let scored;
  const hasEmbeddings = rows.some(r => r.embedding);
  if (qv && hasEmbeddings) {
    scored = rows.map(r => {
      const base = cosine(qv, bufToFloat32(r.embedding));
      const boost = titleBoost(r, queryTerms);
      return { ...r, score: base + boost };
    });
    const embeddingMinScore = minScore;
    if (!scored.some(s => s.score >= embeddingMinScore)) {
      scored = keywordScore(rows, expanded);
    }
  } else {
    scored = keywordScore(rows, expanded);
  }

  const picked = scored
    .sort((a, b) => b.score - a.score)
    .filter(s => s.score >= (qv && hasEmbeddings ? minScore : 0.05) || !qv || !hasEmbeddings)
    .slice(0, k);

  const chunks = (picked.length ? picked : rows.slice(0, k).map(r => ({ ...r, score: 0 })))
    .map(({ embedding, ...rest }) => rest);
  const scores = chunks.map(c => Number(c.score) || 0);
  const maxScore = scores.length ? Math.max(...scores) : 0;
  const meanScore = scores.length ? scores.reduce((s, n) => s + n, 0) / scores.length : 0;
  return { chunks, maxScore, meanScore };
}

function groundingTier(result) {
  const { chunks, maxScore } = result;
  const count = (chunks || []).length;
  if (count >= 3 && maxScore > 0.40) return 'strong';
  if (count >= 2 && maxScore > 0.16) return 'moderate';
  return 'weak';
}

async function retrieve(materialId, query, kOrOpts = 6, minScore = 0.05) {
  const result = await retrieveWithMeta(materialId, query, kOrOpts, minScore);
  return result.chunks;
}

module.exports = { embedAndStore, retrieve, retrieveWithMeta, groundingTier, cosine, float32ToBuf, bufToFloat32, FEATURE_K };
