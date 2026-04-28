'use strict';

const { getDb } = require('../config/db');
const ai = require('./ai.service');

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
  const terms = String(query || '').toLowerCase().split(/\W+/).filter(Boolean);
  return rows.map(r => {
    const t = (r.text || '').toLowerCase();
    let score = 0;
    for (const term of terms) if (term && t.includes(term)) score += 1;
    return { ...r, score: terms.length ? score / terms.length : 0 };
  });
}

async function retrieve(materialId, query, k = 6, minScore = 0.05) {
  const db = getDb();
  let rows;
  if (materialId === 'system') {
    rows = db.prepare(`SELECT c.id, c.idx, c.text, c.embedding, c.chapter_id
                       FROM chunks c JOIN materials m ON m.id = c.material_id
                       WHERE m.user_id = 0`).all();
  } else {
    rows = db.prepare('SELECT id, idx, text, embedding, chapter_id FROM chunks WHERE material_id=?').all(materialId);
  }
  if (rows.length === 0) return [];
  let qv;
  try { qv = await ai.embed(query); } catch (_) { qv = null; }
  let scored;
  const hasEmbeddings = rows.some(r => r.embedding);
  if (qv && hasEmbeddings) {
    scored = rows.map(r => ({ ...r, score: cosine(qv, bufToFloat32(r.embedding)) }));
    if (!scored.some(s => s.score >= minScore)) scored = keywordScore(rows, query);
  } else {
    scored = keywordScore(rows, query);
  }
  const picked = scored
    .sort((a, b) => b.score - a.score)
    .filter(s => s.score >= minScore || !qv || !hasEmbeddings)
    .slice(0, k);
  return (picked.length ? picked : rows.slice(0, k).map(r => ({ ...r, score: 0 })))
    .map(({ embedding, ...rest }) => rest);
}

module.exports = { embedAndStore, retrieve, cosine, float32ToBuf, bufToFloat32 };
