'use strict';

const crypto = require('crypto');
const { z } = require('zod');
const { getDb } = require('../config/db');
const { HttpError } = require('../middleware/error');
const ai = require('./ai.service');
const materialTopicMaps = require('./material-topic-map.service');
const sourceTextQuality = require('./source-text-quality.service');
const { extractJson } = require('../utils/jsonSafe');
const log = require('../utils/logger');

const MAP_VERSION = 3;
const AI_TIMEOUT_MS = 45000;
const MAX_NODES = 24;
const RETRY_AFTER_MS = 10 * 60 * 1000;

const ChildSchema = z.object({
  label: z.string().min(1).max(90),
  summary: z.string().min(1).max(360),
  relationship: z.string().max(90).optional().default('supports'),
  source_chunk_ids: z.array(z.coerce.number().int().positive()).min(1).max(8),
}).passthrough();

const BranchSchema = ChildSchema.extend({
  children: z.array(ChildSchema).max(5).optional().default([]),
});

const MaterialMapSchema = z.object({
  root_topic: z.string().min(1).max(120),
  root_summary: z.string().min(1).max(420),
  branches: z.array(BranchSchema).min(2).max(8),
}).passthrough();

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'because', 'by', 'for', 'from', 'how', 'in',
  'is', 'it', 'of', 'on', 'or', 'that', 'the', 'their', 'this', 'to', 'uses', 'using', 'with',
]);

function nowIso() { return new Date().toISOString(); }

function clean(value, max = 0) {
  const text = sourceTextQuality.cleanVisible(value);
  return max && text.length > max ? `${text.slice(0, Math.max(1, max - 1)).trim()}...` : text;
}

function splitCompactTitle(value) {
  return String(value || '')
    .replace(/\.[a-z0-9]{2,5}$/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/^\s*(?:\d+\s*){1,3}/, '')
    .replace(/\b(?:unit|chapter|lecture|lec|slide|deck|pdf|pptx?|docx?)\b/gi, ' ')
    .replace(/\b(?:cs|ds)\s*\d{2,4}\b/gi, ' ')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b(?:lecture|slides?|chapter|unit|module|handout)\b\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isCodeLikeTitle(value) {
  const text = String(value || '').trim();
  return !text
    || (/[_-]|\d/.test(text) && !/\s/.test(text))
    || /^(?:[A-Z]{2,6}|\d+)(?:[-_\s]+(?:[A-Z]{2,6}|\d+))*$/.test(text);
}

function cleanRootTitle(materialTitle, topicTitle) {
  const materialClean = clean(materialTitle, 110).replace(/\b(?:lecture|slides?|chapter|unit|module|handout)\b\s*$/i, '').trim();
  const topicClean = clean(topicTitle, 110).replace(/\b(?:lecture|slides?|chapter|unit|module|handout)\b\s*$/i, '').trim();
  const compact = splitCompactTitle(materialTitle);
  const materialGeneric = !materialClean || sourceTextQuality.isWeakHeading(materialClean) || isCodeLikeTitle(materialTitle);
  const candidates = materialGeneric ? [topicClean, compact, materialClean] : [materialClean, topicClean, compact];
  return candidates.find(candidate => candidate && !sourceTextQuality.isWeakHeading(candidate)) || topicClean || compact || materialClean || 'Uploaded material';
}

function normalize(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9+#().]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function idFor(prefix, value, index = 0) {
  const slug = normalize(value).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 52);
  return `${prefix}-${slug || index + 1}`;
}

function uniqueNumbers(values = [], allowed = null) {
  const out = [];
  const seen = new Set();
  for (const value of values || []) {
    const n = Number(value);
    if (!Number.isInteger(n) || n <= 0 || seen.has(n) || (allowed && !allowed.has(n))) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

function uniqueStrings(values = [], max = 50) {
  const out = [];
  const seen = new Set();
  for (const value of values || []) {
    const text = clean(value, 100);
    const key = normalize(text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= max) break;
  }
  return out;
}

function materialRow(userId, materialId) {
  const db = getDb();
  const row = db.prepare('SELECT id, title, topic_map_updated_at FROM materials WHERE id=? AND user_id=?').get(materialId, userId);
  if (!row) throw new HttpError(404, 'material_not_found');
  return row;
}

function sourceChunks(materialId, limit = 120) {
  return getDb().prepare(`
    SELECT id, idx, text, chapter_title, heading, slide_title, section_title, keywords_json
    FROM chunks
    WHERE material_id=?
    ORDER BY idx
    LIMIT ?
  `).all(materialId, Math.max(1, Math.min(200, Number(limit || 120))));
}

function sourceFingerprint(chunks = []) {
  const hash = crypto.createHash('sha256');
  for (const chunk of chunks) {
    hash.update(String(chunk.id || ''));
    hash.update(':');
    hash.update(clean(chunk.text, 600));
    hash.update('|');
  }
  return hash.digest('hex').slice(0, 24);
}

function chunkText(chunk = {}) {
  return clean([
    chunk.heading,
    chunk.section_title,
    chunk.chapter_title,
    chunk.slide_title,
    chunk.text,
  ].filter(Boolean).join(' — '), 1600);
}

function excerptForIds(ids = [], chunkById, terms = []) {
  const needles = uniqueStrings(terms, 10).map(normalize).filter(Boolean);
  for (const id of ids) {
    const chunk = chunkById.get(Number(id));
    if (!chunk) continue;
    const text = chunkText(chunk);
    const sentences = text.split(/(?<=[.!?])\s+/).map(item => clean(item, 300)).filter(Boolean);
    const matched = sentences.find(sentence => needles.some(term => normalize(sentence).includes(term)));
    if (matched) return matched;
    if (sentences[0]) return sentences[0];
  }
  return '';
}

function masteryIndex(userId) {
  const rows = getDb().prepare('SELECT name, mastery_pct FROM concepts WHERE user_id=?').all(userId);
  return new Map(rows.map(row => [normalize(row.name), Number(row.mastery_pct || 0)]));
}

function statusFor(label, mastery) {
  const score = mastery.get(normalize(label));
  if (!Number.isFinite(score)) return 'not_started';
  if (score >= 80) return 'mastered';
  if (score >= 45) return 'in_progress';
  return 'weak';
}

function annotateNode(node, mastery, depth = 0) {
  const score = mastery.get(normalize(node.label));
  node.depth = depth;
  node.mastery = Number.isFinite(score) ? score : 0;
  node.status = statusFor(node.label, mastery);
  node.type = depth === 0 ? 'root' : (depth === 1 ? 'core' : 'detail');
  for (const child of node.children || []) annotateNode(child, mastery, depth + 1);
  return node;
}

function flattenTree(node, out = []) {
  out.push({
    id: node.id,
    label: node.label,
    summary: node.summary || '',
    relationship: node.relationship || '',
    kind: node.kind || node.type || 'concept',
    type: node.type,
    status: node.status,
    mastery: node.mastery || 0,
    grounded: true,
    sourceChunkIds: node.sourceChunkIds || [],
  });
  for (const child of node.children || []) flattenTree(child, out);
  return out;
}

function pruneTreeToNodeLimit(root, maxNodes = MAX_NODES) {
  let remaining = Math.max(1, Number(maxNodes || MAX_NODES)) - 1;
  const branches = [];
  for (const branch of root.children || []) {
    if (remaining <= 0) break;
    remaining -= 1;
    const children = [];
    for (const child of branch.children || []) {
      if (remaining <= 0) break;
      children.push(child);
      remaining -= 1;
    }
    branches.push({ ...branch, children });
  }
  root.children = branches;
  return root;
}

function fallbackChildrenForTopic(topic, topicMap, chunks, chunkById) {
  const concepts = (topicMap.concepts || []).filter(item => item.topicId === topic.id);
  const operations = (topicMap.operations || []).filter(item => item.topicId === topic.id);
  const labels = uniqueStrings([
    ...concepts.map(item => item.name),
    ...operations.map(item => item.name),
    ...(topic.terms || []),
  ], 12).filter(label => normalize(label) !== normalize(topic.name));
  return labels.slice(0, 4).map((label, index) => {
    const concept = concepts.find(item => normalize(item.name) === normalize(label));
    const operation = operations.find(item => normalize(item.name) === normalize(label));
    const sourceIds = uniqueNumbers(
      (concept && concept.sourceChunkIds) || (operation && operation.sourceChunkIds) || topic.sourceChunkIds || [],
      new Set(chunks.map(chunk => Number(chunk.id)))
    ).slice(0, 6);
    return {
      id: idFor(`detail-${topic.id || 'topic'}`, label, index),
      label,
      summary: excerptForIds(sourceIds, chunkById, [label, topic.name]) || `A supporting idea connected to ${topic.name}.`,
      relationship: operation ? 'operation within' : 'supports',
      kind: operation ? 'operation' : 'concept',
      sourceChunkIds: sourceIds,
      children: [],
    };
  });
}

function buildSourceFallback(userId, materialId, opts = {}) {
  const material = opts.material || materialRow(userId, materialId);
  const chunks = opts.chunks || sourceChunks(materialId);
  const topicMap = opts.topicMap || materialTopicMaps.getOrBuild(userId, materialId, { hint: material.title, limit: 120 });
  const allowedIds = new Set(chunks.map(chunk => Number(chunk.id)));
  const chunkById = new Map(chunks.map(chunk => [Number(chunk.id), chunk]));
  const topics = Array.isArray(topicMap && topicMap.topics) ? topicMap.topics : [];
  const children = topics.slice(0, 8).map((topic, index) => {
    const sourceIds = uniqueNumbers(topic.sourceChunkIds || [], allowedIds).slice(0, 8);
    const label = clean(topic.name, 90) || `Topic ${index + 1}`;
    return {
      id: idFor('topic', label, index),
      label,
      summary: clean(topic.evidence, 320) || excerptForIds(sourceIds, chunkById, [label, ...(topic.terms || [])]) || `A major idea developed in this material.`,
      relationship: 'major topic',
      kind: 'topic',
      sourceChunkIds: sourceIds,
      children: fallbackChildrenForTopic(topic, topicMap || {}, chunks, chunkById),
    };
  });
  const safeChildren = children.length ? children : [{
    id: 'topic-core-ideas',
    label: 'Core ideas',
    summary: excerptForIds(chunks.slice(0, 2).map(chunk => chunk.id), chunkById) || 'Key ideas extracted from the uploaded material.',
    relationship: 'main focus',
    kind: 'topic',
    sourceChunkIds: chunks.slice(0, 4).map(chunk => Number(chunk.id)),
    children: [],
  }];
  const materialTitle = clean(material.title, 110);
  const topicTitle = clean(topicMap && (topicMap.title || topicMap.materialTitle), 110);
  const rootLabel = cleanRootTitle(materialTitle, topicTitle);
  const rootSourceIds = uniqueNumbers(safeChildren.flatMap(child => child.sourceChunkIds), allowedIds).slice(0, 20);
  const root = pruneTreeToNodeLimit({
    id: idFor('material', rootLabel),
    label: rootLabel,
    summary: excerptForIds(rootSourceIds, chunkById, [rootLabel]) || `A source-grounded map of ${rootLabel}.`,
    relationship: '',
    kind: 'material',
    sourceChunkIds: rootSourceIds,
    children: safeChildren,
  });
  const visibleChildren = root.children;
  annotateNode(root, masteryIndex(userId));
  const nodes = flattenTree(root);
  return {
    version: MAP_VERSION,
    rootTopic: rootLabel,
    startHere: visibleChildren[0] && visibleChildren[0].label || rootLabel,
    tree: root,
    nodes,
    recommendedPath: visibleChildren.slice(0, 7).map(child => child.label),
    materialGrounding: {
      materialId,
      used: chunks.length > 0,
      chunkCount: chunks.length,
      groundedConcepts: nodes.slice(1).map(node => node.label).slice(0, 20),
      groundedBranches: visibleChildren.map(child => child.label),
      specificEnough: visibleChildren.length >= 1,
      prunedUngroundedBranches: true,
    },
    generation: {
      mode: 'source_fallback',
      status: 'ready',
      provider: null,
      generatedAt: nowIso(),
      lastAttemptAt: opts.lastAttemptAt || null,
      failureCode: opts.failureCode || null,
    },
    sourceFingerprint: sourceFingerprint(chunks),
    generatedAt: nowIso(),
  };
}

function significantTokens(value) {
  return normalize(value).split(/\s+/).filter(token => token.length >= 2 && !STOP_WORDS.has(token));
}

function labelIsGrounded(label, ids, chunkById, allowedTerms) {
  const normalized = normalize(label);
  if (!normalized || sourceTextQuality.isDocumentMetadata(label) || sourceTextQuality.isIncompleteLabel(label)) return false;
  if (allowedTerms.has(normalized)) return true;
  const tokens = significantTokens(label);
  if (!tokens.length) return false;
  const evidence = ids.map(id => normalize(chunkText(chunkById.get(Number(id))))).join(' ');
  const matched = tokens.filter(token => evidence.includes(token));
  return matched.length >= Math.max(1, Math.ceil(tokens.length * 0.6));
}

function normalizeAiMap(userId, materialId, parsed, fallback, chunks, topicMap, provider) {
  const allowedIds = new Set(chunks.map(chunk => Number(chunk.id)));
  const chunkById = new Map(chunks.map(chunk => [Number(chunk.id), chunk]));
  const allowedTerms = new Set(uniqueStrings([
    fallback.rootTopic,
    ...((topicMap && topicMap.topics) || []).flatMap(topic => [topic.name, ...(topic.terms || [])]),
    ...((topicMap && topicMap.concepts) || []).map(item => item.name),
    ...((topicMap && topicMap.operations) || []).map(item => item.name),
  ], 120).map(normalize));
  const seen = new Set();
  let nodeCount = 1;
  const branches = [];

  for (const rawBranch of parsed.branches || []) {
    if (nodeCount >= MAX_NODES) break;
    const label = clean(rawBranch.label, 90);
    const ids = uniqueNumbers(rawBranch.source_chunk_ids, allowedIds);
    const labelKey = normalize(label);
    if (!ids.length || seen.has(labelKey) || !labelIsGrounded(label, ids, chunkById, allowedTerms)) continue;
    seen.add(labelKey);
    const branch = {
      id: idFor('topic', label, branches.length),
      label,
      summary: clean(rawBranch.summary, 340) || excerptForIds(ids, chunkById, [label]),
      relationship: clean(rawBranch.relationship, 80) || 'major topic',
      kind: 'topic',
      sourceChunkIds: ids,
      children: [],
    };
    nodeCount += 1;
    for (const rawChild of rawBranch.children || []) {
      if (nodeCount >= MAX_NODES || branch.children.length >= 5) break;
      const childLabel = clean(rawChild.label, 90);
      const childIds = uniqueNumbers(rawChild.source_chunk_ids, allowedIds);
      const childKey = normalize(childLabel);
      if (!childIds.length || seen.has(childKey) || !labelIsGrounded(childLabel, childIds, chunkById, allowedTerms)) continue;
      seen.add(childKey);
      branch.children.push({
        id: idFor(`detail-${branch.id}`, childLabel, branch.children.length),
        label: childLabel,
        summary: clean(rawChild.summary, 340) || excerptForIds(childIds, chunkById, [childLabel, label]),
        relationship: clean(rawChild.relationship, 80) || 'supports',
        kind: 'concept',
        sourceChunkIds: childIds,
        children: [],
      });
      nodeCount += 1;
    }
    branches.push(branch);
  }

  if (branches.length < 2) return null;
  const rootLabel = clean(parsed.root_topic, 110);
  const safeRootLabel = labelIsGrounded(rootLabel, chunks.slice(0, 12).map(chunk => chunk.id), chunkById, allowedTerms)
    ? rootLabel
    : fallback.rootTopic;
  const root = {
    id: idFor('material', safeRootLabel),
    label: safeRootLabel,
    summary: clean(parsed.root_summary, 380) || fallback.tree.summary,
    relationship: '',
    kind: 'material',
    sourceChunkIds: uniqueNumbers(branches.flatMap(branch => branch.sourceChunkIds), allowedIds).slice(0, 20),
    children: branches,
  };
  annotateNode(root, masteryIndex(userId));
  const nodes = flattenTree(root).slice(0, MAX_NODES);
  return {
    ...fallback,
    rootTopic: safeRootLabel,
    startHere: branches[0].label,
    tree: root,
    nodes,
    recommendedPath: branches.slice(0, 7).map(branch => branch.label),
    materialGrounding: {
      ...fallback.materialGrounding,
      groundedConcepts: nodes.slice(1).map(node => node.label),
      groundedBranches: branches.map(branch => branch.label),
      specificEnough: true,
    },
    generation: {
      mode: 'ai',
      status: 'ready',
      provider,
      generatedAt: nowIso(),
      lastAttemptAt: nowIso(),
      failureCode: null,
    },
    generatedAt: nowIso(),
  };
}

function balancedPromptChunks(topicMap, chunks, max = 18) {
  const byId = new Map(chunks.map(chunk => [Number(chunk.id), chunk]));
  const selected = [];
  const seen = new Set();
  const topicIds = ((topicMap && topicMap.topics) || []).map(topic => topic.sourceChunkIds || []);
  for (let round = 0; selected.length < max; round += 1) {
    let added = false;
    for (const ids of topicIds) {
      const chunk = byId.get(Number(ids[round]));
      if (chunk && !seen.has(chunk.id)) {
        seen.add(chunk.id);
        selected.push(chunk);
        added = true;
        if (selected.length >= max) break;
      }
    }
    if (!added) break;
  }
  for (const chunk of chunks) {
    if (!seen.has(chunk.id)) selected.push(chunk);
    if (selected.length >= max) break;
  }
  return selected;
}

function generationPrompt(material, topicMap, chunks) {
  const allowedTopics = uniqueStrings([
    ...((topicMap && topicMap.topics) || []).flatMap(topic => [topic.name, ...(topic.terms || [])]),
    ...((topicMap && topicMap.concepts) || []).map(item => item.name),
    ...((topicMap && topicMap.operations) || []).map(item => item.name),
  ], 90);
  const excerpts = balancedPromptChunks(topicMap, chunks, 18)
    .map(chunk => `[chunk:${chunk.id}] ${chunkText(chunk).slice(0, 1200)}`)
    .join('\n\n');
  return `Create a compact, source-grounded mind map for one uploaded study material.

Material title: ${clean(material.title, 120)}
Allowed concepts: ${allowedTopics.join(' | ')}

Return one JSON object with exactly this shape:
{"root_topic":"...","root_summary":"...","branches":[{"label":"...","summary":"...","relationship":"major topic","source_chunk_ids":[1],"children":[{"label":"...","summary":"...","relationship":"supports","source_chunk_ids":[1]}]}]}

Rules:
- Create 3-7 distinct major branches and 1-4 useful child concepts per branch when the source supports them.
- Use only concepts present in the uploaded excerpts or Allowed concepts. Do not add outside knowledge.
- Every branch and child must cite one or more real chunk IDs from the excerpts in source_chunk_ids.
- Labels must be concise concepts, not sentences, filenames, page numbers, slide numbers, lecture numbers, course codes, dates, instructors, or document metadata.
- Summaries must explain the concept itself without saying page, slide, lecture, chapter, chunk, source ID, or uploaded document.
- Never expose [chunk:id] labels in visible text fields.
- Keep the hierarchy at exactly three levels: root, branch, child.
- Return strict JSON only.

Source excerpts:
${excerpts}`;
}

function parseAiResponse(raw) {
  const candidate = extractJson(raw);
  if (!candidate) return null;
  try {
    const parsed = JSON.parse(candidate);
    const checked = MaterialMapSchema.safeParse(parsed);
    return checked.success ? checked.data : null;
  } catch (_) {
    return null;
  }
}

function persist(userId, materialId, map) {
  materialRow(userId, materialId);
  const db = getDb();
  const existing = db.prepare('SELECT id FROM learning_maps WHERE user_id=? AND material_id=? ORDER BY id DESC LIMIT 1').get(userId, materialId);
  if (existing) {
    db.prepare('UPDATE learning_maps SET root_topic=?, map_json=?, updated_at=? WHERE id=?')
      .run(map.rootTopic, JSON.stringify(map), nowIso(), existing.id);
    return { id: existing.id, ...map };
  }
  const result = db.prepare(`
    INSERT INTO learning_maps (user_id, material_id, root_topic, map_json, created_at, updated_at)
    VALUES (?,?,?,?,?,?)
  `).run(userId, materialId, map.rootTopic, JSON.stringify(map), nowIso(), nowIso());
  return { id: result.lastInsertRowid, ...map };
}

function getStored(userId, materialId, fingerprint = '') {
  const row = getDb().prepare('SELECT id, map_json FROM learning_maps WHERE user_id=? AND material_id=? ORDER BY id DESC LIMIT 1').get(userId, materialId);
  if (!row) return null;
  try {
    const map = JSON.parse(row.map_json || '{}');
    if (Number(map.version || 0) !== MAP_VERSION || !map.tree || (fingerprint && map.sourceFingerprint !== fingerprint)) return null;
    return { id: row.id, ...map };
  } catch (_) {
    return null;
  }
}

function getOrBuild(userId, materialId, opts = {}) {
  const material = materialRow(userId, materialId);
  const chunks = opts.chunks || sourceChunks(materialId);
  const fingerprint = sourceFingerprint(chunks);
  if (!opts.force) {
    const stored = getStored(userId, materialId, fingerprint);
    if (stored) return stored;
  }
  const fallback = buildSourceFallback(userId, materialId, { material, chunks, topicMap: opts.topicMap });
  return opts.persist === false ? fallback : persist(userId, materialId, fallback);
}

async function generateAndPersist(userId, materialId, opts = {}) {
  const material = materialRow(userId, materialId);
  const chunks = sourceChunks(materialId);
  const topicMap = opts.topicMap || materialTopicMaps.getOrBuild(userId, materialId, { hint: material.title, limit: 120, force: !!opts.forceTopicMap });
  const fallback = buildSourceFallback(userId, materialId, { material, chunks, topicMap });
  if (!chunks.length) return persist(userId, materialId, fallback);
  try {
    const generated = await ai.generateWithFallback(generationPrompt(material, topicMap, chunks), {
      feature: 'summary',
      format: 'json',
      temperature: 0.2,
      num_predict: 1800,
      timeoutMs: Number(opts.timeoutMs || AI_TIMEOUT_MS),
    });
    const parsed = parseAiResponse(generated.text);
    const normalized = parsed && normalizeAiMap(userId, materialId, parsed, fallback, chunks, topicMap, generated.provider);
    if (!normalized) throw Object.assign(new Error('learning_map_output_invalid'), { code: 'learning_map_output_invalid' });
    return persist(userId, materialId, normalized);
  } catch (error) {
    const failureCode = String(error && (error.code || error.message) || 'learning_map_generation_failed').slice(0, 120);
    log.warn('material_learning_map_fallback', { materialId, failureCode });
    fallback.generation.lastAttemptAt = nowIso();
    fallback.generation.failureCode = failureCode;
    return persist(userId, materialId, fallback);
  }
}

function shouldRefine(map) {
  if (!map || !map.generation || map.generation.mode === 'ai') return false;
  const attempted = Date.parse(map.generation.lastAttemptAt || '');
  return !Number.isFinite(attempted) || Date.now() - attempted >= RETRY_AFTER_MS;
}

module.exports = {
  MAP_VERSION,
  AI_TIMEOUT_MS,
  MAX_NODES,
  buildSourceFallback,
  generateAndPersist,
  getOrBuild,
  getStored,
  persist,
  shouldRefine,
  _internals: {
    generationPrompt,
    labelIsGrounded,
    normalizeAiMap,
    parseAiResponse,
    sourceFingerprint,
  },
};
