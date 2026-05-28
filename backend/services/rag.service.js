'use strict';

const { getDb } = require('../config/db');
const ai = require('./ai.service');
const { expandQuery } = require('../utils/concept-synonyms');

const VALID_SOURCE_SCOPES = new Set(['material', 'chapter', 'chunk']);

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
  const title = `${row.chapter_title || ''} ${row.slide_title || ''} ${row.section_title || ''}`.toLowerCase();
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

function siblingPenalty(row, query) {
  const lowerQuery = String(query || '').toLowerCase();
  const text = `${row.chapter_title || ''} ${row.heading || ''} ${row.slide_title || ''} ${row.text || ''}`.toLowerCase();
  const siblings = {
    inheritance: ['polymorphism', 'dynamic dispatch', 'overloading'],
    polymorphism: ['encapsulation', 'composition'],
    encapsulation: ['inheritance', 'polymorphism'],
    'linked list': ['stack', 'queue', 'tree'],
    stack: ['queue', 'linked list'],
    queue: ['stack', 'linked list'],
  };
  for (const [topic, negatives] of Object.entries(siblings)) {
    if (!lowerQuery.includes(topic)) continue;
    let penalty = 0;
    for (const term of negatives) if (text.includes(term)) penalty += 0.08;
    return Math.min(penalty, 0.24);
  }
  return 0;
}

function exactTopicBoost(row, query) {
  const q = String(query || '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (!q) return 0;
  const hay = `${row.chapter_title || ''} ${row.heading || ''} ${row.slide_title || ''} ${row.section_title || ''} ${row.keywords_json || ''}`.toLowerCase();
  let boost = 0;
  if (hay.includes(q)) boost += 0.20;
  for (const part of q.split(/\W+/).filter(t => t.length > 2)) {
    if (hay.includes(part)) boost += 0.03;
  }
  return Math.min(boost, 0.30);
}

function normalizeTerm(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9+#]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function optionTerms(opts = {}, query = '') {
  const terms = [
    opts.focusTopic,
    ...(Array.isArray(opts.focusTerms) ? opts.focusTerms : []),
  ].filter(Boolean);
  if (!terms.length) terms.push(query);
  const seen = new Set();
  return terms
    .flatMap(value => String(value || '').toLowerCase().split(/[^a-z0-9+#]+/).filter(term => term.length >= 3))
    .filter(term => {
      const key = normalizeTerm(term);
      if (!key || seen.has(key) || /^(the|and|for|with|from|this|that|chapter|section|material|document|study|notes)$/.test(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 16);
}

function textForRow(row) {
  return `${row.chapter_title || ''} ${row.heading || ''} ${row.slide_title || ''} ${row.section_title || ''} ${row.keywords_json || ''} ${row.text || ''}`.toLowerCase();
}

function focusBoost(row, opts = {}, query = '') {
  const terms = optionTerms(opts, query);
  if (!terms.length) return 0;
  const hay = textForRow(row);
  let hits = 0;
  for (const term of terms) {
    if (hay.includes(term)) hits += 1;
  }
  const headingHay = `${row.chapter_title || ''} ${row.heading || ''} ${row.slide_title || ''} ${row.section_title || ''}`.toLowerCase();
  const headingHits = terms.filter(term => headingHay.includes(term)).length;
  return Math.min(0.42, hits * 0.035 + headingHits * 0.10);
}

function avoidTermsFor(opts = {}, query = '') {
  const explicit = Array.isArray(opts.avoidTerms) ? opts.avoidTerms : [];
  return [...new Set(explicit.map(normalizeTerm).filter(Boolean))];
}

function focusPenalty(row, opts = {}, query = '') {
  const avoid = avoidTermsFor(opts, query);
  if (!avoid.length) return 0;
  const focus = optionTerms(opts, query);
  const hay = textForRow(row);
  const avoidHits = avoid.filter(term => hay.includes(term)).length;
  if (!avoidHits) return 0;
  const focusHits = focus.filter(term => hay.includes(term)).length;
  if (focusHits >= avoidHits) return 0;
  return Math.min(0.36, (avoidHits - focusHits) * 0.09);
}

const FEATURE_K = {
  notes: 8,
  flashcards: 6,
  quiz: 6,
  video: 10,
  tutor: 6,
  default: 6,
};

function parseSourceScope(opts = {}) {
  const sourceScope = String(opts.sourceScope || opts.source_scope || 'material').toLowerCase();
  if (!VALID_SOURCE_SCOPES.has(sourceScope)) {
    const err = new Error('invalid_source_scope');
    err.code = 'invalid_source_scope';
    err.status = 400;
    throw err;
  }
  const chapterId = opts.chapterId || opts.chapter_id || null;
  const chunkId = opts.chunkId || opts.chunk_id || null;
  return {
    sourceScope,
    chapterId: chapterId ? Number(chapterId) : null,
    chunkId: chunkId ? Number(chunkId) : null,
  };
}

function sourceScopeLabel(scope) {
  if (!scope || scope.sourceScope === 'material') return 'Entire material';
  if (scope.sourceScope === 'chapter') return 'Current chapter';
  if (scope.sourceScope === 'chunk') return 'Current section';
  return 'Entire material';
}

function scopeWhereClause(scope) {
  if (!scope || scope.sourceScope === 'material') return { sql: '', params: [] };
  if (scope.sourceScope === 'chapter') {
    if (!Number.isInteger(scope.chapterId)) {
      const err = new Error('missing_chapter_id');
      err.code = 'missing_chapter_id';
      err.status = 400;
      throw err;
    }
    return { sql: ' AND chapter_id=?', params: [scope.chapterId] };
  }
  if (scope.sourceScope === 'chunk') {
    if (!Number.isInteger(scope.chunkId)) {
      const err = new Error('missing_chunk_id');
      err.code = 'missing_chunk_id';
      err.status = 400;
      throw err;
    }
    return { sql: ' AND id=?', params: [scope.chunkId] };
  }
  return { sql: '', params: [] };
}

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
  const scope = parseSourceScope(typeof kOrOpts === 'object' ? kOrOpts : {});
  if (materialId === 'system') {
    rows = db.prepare(`SELECT c.id, c.idx, c.text, c.embedding, c.chapter_id,
                              c.source_page, c.chapter_title, c.heading,
                              c.slide_number, c.slide_title, c.section_title, c.has_code, c.keywords_json,
                              c.source_kind, c.source_visual_id
                       FROM chunks c JOIN materials m ON m.id = c.material_id
                       WHERE m.user_id = 0`).all();
  } else {
    const where = scopeWhereClause(scope);
    rows = db.prepare(`SELECT id, idx, text, embedding, chapter_id,
                              source_page, chapter_title, heading,
                              slide_number, slide_title, section_title, has_code, keywords_json,
                              source_kind, source_visual_id
                       FROM chunks WHERE material_id=?${where.sql}`).all(materialId, ...where.params);
  }
  if (rows.length === 0) return { chunks: [], maxScore: 0, meanScore: 0, sourceScope: scope.sourceScope, sourceLabel: sourceScopeLabel(scope) };

  const expanded = expandQuery(query);
  const queryTerms = expanded.toLowerCase().split(/\W+/).filter(t => t && t.length > 1);

  let qv;
  try { qv = await ai.embed(query); } catch (_) { qv = null; }

  let scored;
  const hasEmbeddings = rows.some(r => r.embedding);
  if (qv && hasEmbeddings) {
    scored = rows.map(r => {
      const base = cosine(qv, bufToFloat32(r.embedding));
      const boost = titleBoost(r, queryTerms) + exactTopicBoost(r, query) + focusBoost(r, kOrOpts, query);
      return { ...r, score: base + boost - siblingPenalty(r, query) - focusPenalty(r, kOrOpts, query) };
    });
    const embeddingMinScore = minScore;
    if (!scored.some(s => s.score >= embeddingMinScore)) {
      scored = keywordScore(rows, expanded).map(r => ({
        ...r,
        score: Number(r.score || 0) + focusBoost(r, kOrOpts, query) - focusPenalty(r, kOrOpts, query),
      }));
    }
  } else {
    scored = keywordScore(rows, expanded).map(r => ({
      ...r,
      score: Number(r.score || 0) + focusBoost(r, kOrOpts, query) - focusPenalty(r, kOrOpts, query),
    }));
  }

  let picked = scored
    .sort((a, b) => b.score - a.score)
    .filter(s => s.score >= (qv && hasEmbeddings ? minScore : 0.05) || !qv || !hasEmbeddings)
    .slice(0, k);
  const focusTerms = optionTerms(kOrOpts, query);
  if (focusTerms.length && !picked.some(row => focusTerms.some(term => textForRow(row).includes(term)))) {
    const focusedRows = scored.filter(row => focusTerms.some(term => textForRow(row).includes(term))).slice(0, k);
    if (focusedRows.length) picked = focusedRows;
  }

  const chunks = (picked.length ? picked : rows.slice(0, k).map(r => ({ ...r, score: 0 })))
    .map(({ embedding, ...rest }) => rest);
  const scores = chunks.map(c => Number(c.score) || 0);
  const maxScore = scores.length ? Math.max(...scores) : 0;
  const meanScore = scores.length ? scores.reduce((s, n) => s + n, 0) / scores.length : 0;
  return { chunks, maxScore, meanScore, sourceScope: scope.sourceScope, sourceLabel: sourceScopeLabel(scope) };
}

async function retrieveLessonContext(materialId, query, opts = {}) {
  const k = opts.k || FEATURE_K[opts.feature || 'notes'] || FEATURE_K.notes;
  const sourceScope = parseSourceScope(opts);
  const systemOnly = !materialId || materialId === 'system';
  const source = systemOnly
    ? { chunks: [], maxScore: 0, meanScore: 0 }
    : await retrieveWithMeta(materialId, query, { ...opts, ...sourceScope, k, minScore: opts.minScore ?? 0.08 });
  let system = { chunks: [], maxScore: 0, meanScore: 0 };
  if (opts.includeSystem !== false) {
    try {
      system = await retrieveWithMeta('system', query, { ...opts, sourceScope: 'material', k: Math.max(3, Math.ceil(k / 2)), minScore: 0.03 });
    } catch (_) {}
  }
  const merged = [
    ...(source.chunks || []).map(c => ({ ...c, corpus: 'uploaded' })),
    ...(system.chunks || []).map(c => ({ ...c, corpus: 'system' })),
  ]
    .sort((a, b) => Number(b.score || 0) - Number(a.score || 0))
    .slice(0, opts.maxMerged || (k + 4));
  const scores = merged.map(c => Number(c.score) || 0);
  return {
    chunks: merged,
    uploaded: source,
    system,
    sourceScope: sourceScope.sourceScope,
    sourceLabel: sourceScopeLabel(sourceScope),
    chapterId: sourceScope.chapterId,
    chunkId: sourceScope.chunkId,
    maxScore: scores.length ? Math.max(...scores) : 0,
    meanScore: scores.length ? scores.reduce((s, n) => s + n, 0) / scores.length : 0,
  };
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

module.exports = { embedAndStore, retrieve, retrieveWithMeta, retrieveLessonContext, groundingTier, cosine, float32ToBuf, bufToFloat32, FEATURE_K, parseSourceScope, sourceScopeLabel };
