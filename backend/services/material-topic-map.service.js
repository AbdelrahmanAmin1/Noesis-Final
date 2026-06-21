'use strict';

const { getDb } = require('../config/db');
const domainDetection = require('./domain-detection.service');
const materialUnderstanding = require('./material-understanding.service');
const sourceTopicPlans = require('./source-topic-plan.service');
const sourceVisualCandidates = require('./source-visual-candidates.service');
const sourceTextQuality = require('./source-text-quality.service');

const TOPIC_MAP_VERSION = 2;

function nowIso() { return new Date().toISOString(); }

function clean(value, max = 160) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return max && text.length > max ? text.slice(0, max).trim() : text;
}

function key(value) {
  return clean(value, 0).toLowerCase().replace(/[^a-z0-9+#]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function idFor(prefix, value, index) {
  const slug = key(value).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
  return `${prefix}-${slug || index + 1}`;
}

function parseJson(value, fallback) {
  try { return value ? JSON.parse(value) : fallback; } catch (_) { return fallback; }
}

function unique(values = [], max = 50) {
  const seen = new Set();
  const out = [];
  for (const value of values || []) {
    const text = clean(value, 140);
    const k = key(text);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(text);
    if (out.length >= max) break;
  }
  return out;
}

function taxonomyTopicRules() {
  return (materialUnderstanding.DOMAIN_TOPICS || []).flatMap(family =>
    (family.topics || []).map(topic => ({
      name: topic.normalizedTopic,
      domain: family.domain,
      aliases: unique([topic.normalizedTopic, ...((topic && topic.aliases) || [])], 18),
      keyConcepts: unique((topic && topic.keyConcepts) || [], 18),
    }))
  );
}

function hasKeyPhrase(source, phrase) {
  const hay = ` ${key(source)} `;
  const needle = key(phrase);
  return !!needle && hay.includes(` ${needle} `);
}

function canonicalTopicForHeading(value) {
  const original = clean(value, 120);
  if (!original) return '';
  if (/^public\s+interface\s*\/\s*api\s+design$/i.test(original)) return 'Public Interface/API Design';
  const source = key(original);
  let best = null;
  for (const rule of taxonomyTopicRules()) {
    for (const label of rule.aliases || []) {
      const normalizedLabel = key(label);
      if (!normalizedLabel || !hasKeyPhrase(source, normalizedLabel)) continue;
      const score = normalizedLabel.split(' ').length * 100 + normalizedLabel.length;
      if (!best || score > best.score) best = { name: rule.name, score };
    }
  }
  if (best) return best.name;
  const parentMatch = source.match(/\b(?:operation|process|statement|method)\s+(?:in|for|of)\s+(.+)$/);
  if (!parentMatch) return original;
  const parent = clean(parentMatch[1], 80);
  for (const rule of taxonomyTopicRules()) {
    if ((rule.aliases || []).some(label => hasKeyPhrase(parent, label))) return rule.name;
  }
  return original;
}

function mergeTopicBundles(...bundles) {
  const merged = [];
  const seen = new Set();
  for (const bundle of bundles) {
    for (const item of bundle || []) {
      const normalized = normalizeTopicBundleItem(item);
      const name = clean(normalized && (normalized.topic || normalized.name), 100);
      const k = key(name);
      if (!k || seen.has(k) || isRejectedTopicLabel(name)) continue;
      seen.add(k);
      merged.push({ ...normalized, topic: name, name });
    }
  }
  return merged;
}

function normalizeTopicBundleItem(item = {}) {
  const original = clean(item && (item.topic || item.name), 120);
  const canonical = canonicalTopicForHeading(original) || original;
  return {
    ...item,
    topic: canonical,
    name: canonical,
    terms: unique([canonical, original, ...((item && item.terms) || [])], 16),
  };
}

function isRejectedTopicLabel(value) {
  const text = clean(value, 120);
  return !text || sourceTextQuality.isDocumentMetadata(text) || sourceTextQuality.isIncompleteLabel(text);
}

function derivedTopicsFromChunks(chunks = [], domain = '') {
  const matches = [];
  for (const rule of taxonomyTopicRules()) {
    const chunkIds = [];
    let firstIdx = Number.MAX_SAFE_INTEGER;
    let score = 0;
    for (const chunk of chunks || []) {
      const text = chunkText(chunk);
      const aliasHits = (rule.aliases || []).filter(term => hasKeyPhrase(text, term));
      const conceptHits = (rule.keyConcepts || []).filter(term => hasKeyPhrase(text, term));
      if (!aliasHits.length) continue;
      chunkIds.push(chunk.id);
      firstIdx = Math.min(firstIdx, Number(chunk.idx || chunk.id || 0));
      score += aliasHits.length * 3 + Math.min(conceptHits.length, 6);
    }
    if (!chunkIds.length) continue;
    const domainBoost = key(rule.domain) === key(domain) ? 1 : 0;
    if (score + domainBoost < 3) continue;
    const terms = unique([rule.name, ...(rule.aliases || []), ...(rule.keyConcepts || [])], 18);
    matches.push({
      topic: rule.name,
      name: rule.name,
      terms,
      chunkIds: unique(chunkIds.map(String), 40).map(Number),
      evidence: terms.slice(0, 4).join(', '),
      orderHint: firstIdx,
      score,
    });
  }
  return matches.sort((a, b) => a.orderHint - b.orderHint || b.score - a.score);
}

function storedMapMissesStrongTopics(stored = {}, chunks = [], domain = '') {
  const derived = derivedTopicsFromChunks(chunks, domain);
  if (derived.length < 2) return false;
  const storedNames = new Set((stored.topics || []).map(topic => key(topic.name || topic.topic)));
  const missing = derived.filter(topic => !storedNames.has(key(topic.name || topic.topic)));
  return missing.length > 0;
}

function sourceChunks(materialId, opts = {}) {
  const db = getDb();
  const limit = Math.max(1, Math.min(200, Number(opts.limit || 120)));
  const fields = `id, idx, text, chapter_id, source_page, chapter_title, heading,
    slide_number, slide_title, section_title, has_code, keywords_json, source_kind, source_visual_id`;
  if (opts.sourceScope === 'chapter' && Number.isInteger(Number(opts.chapterId))) {
    return db.prepare(`SELECT ${fields} FROM chunks WHERE material_id=? AND chapter_id=? ORDER BY idx LIMIT ?`)
      .all(materialId, Number(opts.chapterId), limit);
  }
  if (opts.sourceScope === 'chunk' && Number.isInteger(Number(opts.chunkId))) {
    return db.prepare(`SELECT ${fields} FROM chunks WHERE material_id=? AND id=? ORDER BY idx LIMIT 1`)
      .all(materialId, Number(opts.chunkId));
  }
  return db.prepare(`SELECT ${fields} FROM chunks WHERE material_id=? ORDER BY idx LIMIT ?`).all(materialId, limit);
}

function chunkText(chunk = {}) {
  return [
    chunk.chapter_title,
    chunk.heading,
    chunk.slide_title,
    chunk.section_title,
    chunk.keywords_json,
    chunk.text,
  ].filter(Boolean).join(' ');
}

function chunkMatchesTerms(chunk, terms = []) {
  const hay = key(chunkText(chunk));
  return terms.some(term => {
    const k = key(term);
    return k.length >= 3 && hay.includes(k);
  });
}

function chunkIdsForTopic(item, chunks) {
  const provided = Array.isArray(item && item.chunkIds) ? item.chunkIds.map(Number).filter(Number.isInteger) : [];
  if (provided.length) return provided;
  const terms = unique([item && item.topic, ...((item && item.terms) || [])], 16);
  return chunks.filter(chunk => chunkMatchesTerms(chunk, terms)).map(chunk => chunk.id);
}

function sourceRefsForChunks(chunks = []) {
  const refs = [];
  const seen = new Set();
  for (const chunk of chunks) {
    const value = chunk.slide_number != null
      ? { kind: 'slide', slideNumber: chunk.slide_number, label: `Slide ${chunk.slide_number}` }
      : chunk.source_page != null
        ? { kind: 'page', pageNumber: chunk.source_page, label: `Page ${chunk.source_page}` }
        : null;
    if (!value) continue;
    const k = `${value.kind}:${value.pageNumber || value.slideNumber}`;
    if (seen.has(k)) continue;
    seen.add(k);
    refs.push(value);
  }
  return refs;
}

function visualText(visual = {}) {
  return [
    visual.heading,
    visual.caption,
    visual.nearbyText,
    visual.ocrText,
    visual.visualTypeGuess,
    visual.metadata && JSON.stringify(visual.metadata),
  ].filter(Boolean).join(' ');
}

function visualMatchesTopic(visual, topic, chunks = []) {
  const terms = unique([topic.name, ...(topic.terms || [])], 14).map(key).filter(Boolean);
  const hay = key(visualText(visual));
  if (terms.some(term => term.length >= 3 && hay.includes(term))) return true;
  const topicChunkIds = new Set(topic.sourceChunkIds || []);
  if (!topicChunkIds.size) return false;
  return chunks.some(chunk => topicChunkIds.has(chunk.id) && Number(chunk.source_visual_id) === Number(visual.id));
}

const OPERATION_TERMS = [
  'push', 'pop', 'peek', 'enqueue', 'dequeue', 'insert', 'delete', 'remove', 'traverse',
  'search', 'sort', 'lookup', 'hash', 'collision', 'resize', 'rehash', 'front', 'rear',
  'top', 'root', 'visit', 'compare', 'dispatch', 'override', 'validate', 'classify',
  'normalize', 'authenticate', 'encrypt', 'route', 'query', 'commit', 'rollback',
];

function operationsForTopic(topic, chunks = []) {
  const hay = key([
    topic.name,
    ...(topic.terms || []),
    ...chunks.map(chunkText),
  ].join(' '));
  return unique(OPERATION_TERMS.filter(term => hay.includes(key(term))), 12);
}

function requiredVisualTypesForTopic(topic, domain) {
  const text = key([topic.name, ...(topic.terms || [])].join(' '));
  const required = [];
  if (/object oriented|oop|class|object|inheritance|polymorphism|encapsulation/.test(key(domain))) {
    if (text.includes('encapsulation')) required.push('encapsulation_boundary');
    if (text.includes('inheritance')) required.push('inheritance_uml');
    if (text.includes('polymorphism')) required.push('polymorphism_dispatch');
    required.push('class_object');
  }
  if (/data structures?/.test(key(domain)) || /(stack|queue|linked list|tree|graph|hash|heap|deque|node)/.test(text)) {
    if (/linked/.test(text)) required.push('linked_list_operation');
    if (/stack|lifo|push|pop/.test(text)) required.push('stack_operation');
    if (/queue|fifo|enqueue|dequeue|front|rear|deque/.test(text)) required.push('queue_operation');
    if (/hash|bucket|collision/.test(text)) required.push('hash_table_operation');
    if (/tree|bst|binary|heap|priority queue|graph/.test(text)) required.push('tree_visual');
    if (!required.length) required.push('process_flow');
  }
  if (/algorithm|complexity|big o|big-o|sorting|searching/.test(`${key(domain)} ${text}`)) {
    required.push(/complexity|big o|big-o|o\(/.test(text) ? 'big_o_growth' : 'process_flow');
  }
  if (/erd|entity relationship|database key|primary key|foreign key/.test(text)) {
    required.push('comparison_table');
  }
  if (/normalization|transaction|dns|routing|tcp|authentication|encryption|deployment/.test(text)) {
    required.push('process_flow');
  }
  if (/osi model|tcp ip|requirements|testing|defenses|attacks/.test(text)) {
    required.push('concept_cards');
  }
  if (/code|program|java|python|function|method|operation/.test(text) && !required.includes('code_walkthrough')) {
    required.push('code_walkthrough');
  }
  return unique(required.length ? required : ['concept_cards'], 5);
}

function normalizeVisual(visual) {
  return {
    id: visual.id,
    pageNumber: visual.pageNumber || visual.sourcePage || null,
    sourcePage: visual.sourcePage || visual.pageNumber || null,
    slideNumber: visual.slideNumber || null,
    heading: visual.heading || '',
    caption: visual.caption || '',
    visualTypeGuess: visual.visualTypeGuess || '',
    classification: visual.classification || visual.metadata && visual.metadata.classification || visual.visualTypeGuess || '',
    importanceScore: Number(visual.importanceScore || 0),
    hasImage: !!(visual.imagePath || visual.thumbnailPath || visual.imageUrl),
  };
}

function buildTopicRows({ plan, outline, chunks, visuals, domain }) {
  const planBundle = Array.isArray(plan.topicBundle) && plan.topicBundle.length
    ? plan.topicBundle
    : Array.isArray(outline.majorTopics) && outline.majorTopics.length
      ? outline.majorTopics
      : [{ topic: plan.primaryTopic || outline.mainTopic || outline.topic || 'Uploaded Material', terms: outline.keyConcepts || [] }];
  const rawBundle = mergeTopicBundles(planBundle, derivedTopicsFromChunks(chunks, domain));
  const topics = [];
  const seen = new Set();
  for (const item of rawBundle) {
    const name = clean(item && (item.topic || item.name), 100);
    const k = key(name);
    if (!k || seen.has(k) || isRejectedTopicLabel(name)) continue;
    seen.add(k);
    const sourceChunkIds = chunkIdsForTopic(item, chunks);
    const topicChunks = chunks.filter(chunk => sourceChunkIds.includes(chunk.id));
    const topic = {
      id: idFor('topic', name, topics.length),
      name,
      order: topics.length,
      weight: Math.max(1, sourceChunkIds.length || 1),
      terms: unique([name, ...((item && item.terms) || [])], 14),
      sourceChunkIds,
      sourcePageRefs: sourceRefsForChunks(topicChunks),
      sourceVisualIds: [],
      conceptIds: [],
      operationIds: [],
      requiredVisualTypes: [],
      checkpointNeeded: true,
      evidence: clean(item && item.evidence || '', 260),
    };
    topic.requiredVisualTypes = requiredVisualTypesForTopic(topic, domain);
    topic.sourceVisualIds = visuals.filter(visual => visualMatchesTopic(visual, topic, chunks)).map(visual => visual.id).filter(Boolean);
    topics.push(topic);
    if (topics.length >= 8) break;
  }
  return topics.length ? topics : [{
    id: 'topic-uploaded-material',
    name: plan.primaryTopic || outline.mainTopic || 'Uploaded Material',
    order: 0,
    weight: Math.max(1, chunks.length),
    terms: unique(outline.keyConcepts || [], 14),
    sourceChunkIds: chunks.slice(0, 8).map(chunk => chunk.id),
    sourcePageRefs: sourceRefsForChunks(chunks),
    sourceVisualIds: visuals.map(visual => visual.id).filter(Boolean).slice(0, 3),
    conceptIds: [],
    operationIds: [],
    requiredVisualTypes: ['concept_cards'],
    checkpointNeeded: true,
    evidence: '',
  }];
}

function buildConceptsAndOperations(topics, chunks) {
  const concepts = [];
  const operations = [];
  const conceptSeen = new Set();
  const operationSeen = new Set();
  for (const topic of topics) {
    const topicChunks = chunks.filter(chunk => topic.sourceChunkIds.includes(chunk.id));
    for (const term of unique([topic.name, ...(topic.terms || [])], 12)) {
      const k = key(term);
      if (!k || conceptSeen.has(k)) continue;
      conceptSeen.add(k);
      const id = idFor('concept', term, concepts.length);
      concepts.push({ id, name: term, topicId: topic.id, sourceChunkIds: topic.sourceChunkIds.slice(0, 4) });
      topic.conceptIds.push(id);
    }
    for (const op of operationsForTopic(topic, topicChunks)) {
      const k = `${topic.id}:${key(op)}`;
      if (operationSeen.has(k)) continue;
      operationSeen.add(k);
      const id = idFor('operation', `${topic.name}-${op}`, operations.length);
      operations.push({ id, name: op, topicId: topic.id, sourceChunkIds: topic.sourceChunkIds.slice(0, 4) });
      topic.operationIds.push(id);
    }
  }
  return { concepts, operations };
}

function buildCoveragePlan(topics, chunks) {
  const totalWeight = topics.reduce((sum, topic) => sum + Math.max(1, Number(topic.weight || 1)), 0) || 1;
  const targetScenes = Math.max(8, Math.min(18, topics.length * 3 + 2));
  const allocations = topics.map(topic => {
    const fairShare = Math.max(2, Math.round((Math.max(1, topic.weight) / totalWeight) * (targetScenes - 1)));
    return {
      topicId: topic.id,
      topicName: topic.name,
      order: topic.order,
      targetScenes: Math.min(4, fairShare),
      sourceChunkIds: topic.sourceChunkIds,
      sourceVisualIds: topic.sourceVisualIds,
      requiredVisualTypes: topic.requiredVisualTypes,
      checkpointNeeded: topic.checkpointNeeded,
    };
  });
  return {
    mode: topics.length >= 2 ? 'material_wide' : 'focused',
    totalTopics: topics.length,
    targetScenes,
    allocations,
    sourceChunkIds: chunks.map(chunk => chunk.id),
  };
}

function topicTitle(topics) {
  if (!topics.length) return 'Uploaded Material';
  if (topics.length === 1) return topics[0].name;
  return topics.slice(0, 4).map(topic => topic.name).join(' / ');
}

function buildTopicMapFromPartsForTest({ plan = {}, outline = {}, chunks = [], visuals = [], domain = '' } = {}) {
  const topics = buildTopicRows({ plan, outline, chunks, visuals, domain });
  return {
    title: topicTitle(topics),
    topics,
    coveragePlan: buildCoveragePlan(topics, chunks),
  };
}

function buildTopicMap(userId, materialId, opts = {}) {
  const db = getDb();
  const material = db.prepare('SELECT id, title FROM materials WHERE id=? AND user_id=?').get(materialId, userId);
  if (!material) return null;
  const chunks = sourceChunks(materialId, opts);
  const domainInfo = domainDetection.detectMaterialDomain(userId, materialId, { hint: opts.hint || material.title });
  const sourceOutline = materialUnderstanding.buildSourceOutline(chunks, {
    explicitQuery: opts.explicitTopic || undefined,
    hint: opts.hint || material.title,
    title: material.title,
    materialTitle: material.title,
    domainInfo,
  });
  const plan = sourceTopicPlans.buildSourceTopicPlan({
    materialId,
    materialTitle: material.title,
    sourceScope: opts.sourceScope || 'material',
    chapterId: opts.chapterId,
    chunkId: opts.chunkId,
    explicitTopic: opts.explicitTopic || '',
    requestedTopic: opts.hint || sourceOutline.mainTopic || material.title,
    domainInfo,
    chunks,
    sourceOutline,
    maxBalancedChunks: 80,
  });
  const visuals = sourceVisualCandidates.listForMaterial(userId, materialId, { max: 50 }) || [];
  const topics = buildTopicRows({ plan, outline: sourceOutline, chunks, visuals, domain: domainInfo.domain });
  const { concepts, operations } = buildConceptsAndOperations(topics, chunks);
  const sourceVisuals = visuals.map(visual => {
    const normalized = normalizeVisual(visual);
    normalized.topicIds = topics.filter(topic => topic.sourceVisualIds.includes(visual.id)).map(topic => topic.id);
    return normalized;
  });
  const coveragePlan = buildCoveragePlan(topics, chunks);
  return {
    version: TOPIC_MAP_VERSION,
    materialId,
    materialTitle: material.title,
    domain: domainInfo.domain || 'unknown',
    subdomain: domainInfo.subdomain || null,
    confidence: domainInfo.confidence || sourceOutline.confidence || 0,
    title: topicTitle(topics),
    topics,
    concepts,
    operations,
    sourceChunks: chunks.map(chunk => ({
      id: chunk.id,
      idx: chunk.idx,
      sourcePage: chunk.source_page || null,
      slideNumber: chunk.slide_number || null,
      heading: chunk.heading || chunk.chapter_title || chunk.slide_title || chunk.section_title || '',
      sourceVisualId: chunk.source_visual_id || null,
    })),
    sourceVisuals,
    coveragePlan,
    learningObjectives: topics.map(topic => `Explain ${topic.name} using the uploaded material.`).slice(0, 8),
    sourceOutline: {
      mainTopic: sourceOutline.mainTopic,
      keyConcepts: sourceOutline.keyConcepts,
      majorTopics: sourceOutline.majorTopics,
      meaningfulSections: sourceOutline.meaningfulSections,
    },
    generatedAt: nowIso(),
  };
}

function persist(materialId, topicMap) {
  const db = getDb();
  db.prepare(`UPDATE materials
    SET topic_map_json=?, topic_map_version=?, topic_map_updated_at=?
    WHERE id=?`).run(JSON.stringify(topicMap || {}), TOPIC_MAP_VERSION, nowIso(), materialId);
}

function getStored(userId, materialId) {
  const db = getDb();
  const row = db.prepare('SELECT id, topic_map_json, topic_map_version FROM materials WHERE id=? AND user_id=?').get(materialId, userId);
  if (!row) return null;
  const parsed = parseJson(row.topic_map_json, {});
  if (Number(row.topic_map_version || parsed.version || 0) !== TOPIC_MAP_VERSION) return null;
  if (parsed && Array.isArray(parsed.topics) && parsed.topics.length) return parsed;
  return null;
}

function getOrBuild(userId, materialId, opts = {}) {
  if (!opts.force) {
    const stored = getStored(userId, materialId);
    if (stored) {
      try {
        const chunks = sourceChunks(materialId, opts);
        const domainInfo = domainDetection.detectMaterialDomain(userId, materialId, { hint: opts.hint || stored.materialTitle || stored.title });
        if (!storedMapMissesStrongTopics(stored, chunks, domainInfo.domain || stored.domain || '')) return stored;
      } catch (_) {
        return stored;
      }
    }
  }
  const topicMap = buildTopicMap(userId, materialId, opts);
  if (topicMap) persist(materialId, topicMap);
  return topicMap;
}

function refresh(userId, materialId, opts = {}) {
  return getOrBuild(userId, materialId, { ...opts, force: true });
}

function coveragePlanForScope(topicMap = {}, sourceScope = {}) {
  const plan = topicMap.coveragePlan || { allocations: [] };
  if (!sourceScope || sourceScope.sourceScope === 'material' || sourceScope === 'material') return plan;
  const chunkId = Number(sourceScope.chunkId || sourceScope.chunk_id || 0);
  if (chunkId) {
    const allocations = (plan.allocations || []).filter(item => (item.sourceChunkIds || []).includes(chunkId));
    return { ...plan, mode: allocations.length >= 2 ? 'material_wide' : 'focused', allocations };
  }
  return plan;
}

function balancedChunksForPlan(topicMap = {}, chunks = [], max = 48) {
  const allocations = topicMap.coveragePlan && Array.isArray(topicMap.coveragePlan.allocations)
    ? topicMap.coveragePlan.allocations
    : [];
  if (!allocations.length) return chunks.slice(0, max);
  const byId = new Map((chunks || []).map(chunk => [Number(chunk.id), chunk]));
  const selected = [];
  const seen = new Set();
  const rounds = Math.max(1, Math.ceil(max / Math.max(1, allocations.length)));
  for (let round = 0; round < rounds; round += 1) {
    for (const allocation of allocations) {
      const id = (allocation.sourceChunkIds || [])[round];
      const chunk = byId.get(Number(id));
      if (chunk && !seen.has(chunk.id)) {
        selected.push(chunk);
        seen.add(chunk.id);
      }
      if (selected.length >= max) return selected;
    }
  }
  for (const chunk of chunks || []) {
    if (!seen.has(chunk.id)) {
      selected.push(chunk);
      seen.add(chunk.id);
    }
    if (selected.length >= max) break;
  }
  return selected;
}

function sourceTopicPlanForMap(topicMap = {}, chunks = [], fallbackPlan = {}) {
  const topics = Array.isArray(topicMap.topics) ? topicMap.topics : [];
  const topicBundle = topics.map(topic => ({
    topic: topic.name,
    terms: topic.terms || [],
    chunkIds: topic.sourceChunkIds || [],
    evidence: topic.evidence || '',
    sourcePages: (topic.sourcePageRefs || []).map(ref => ref.pageNumber || ref.slideNumber).filter(Boolean),
  }));
  const allowedTopics = unique([
    topicMap.title,
    ...topics.flatMap(topic => [topic.name, ...((topic.terms) || [])]),
  ], 80);
  return {
    ...fallbackPlan,
    topicMode: topics.length >= 2 ? 'material_wide' : (fallbackPlan.topicMode || 'focused'),
    primaryTopic: topicMap.title || fallbackPlan.primaryTopic || (topics[0] && topics[0].name) || 'Uploaded Material',
    topicBundle,
    allowedTopics,
    blockedTopics: fallbackPlan.blockedTopics || [],
    sourceOutline: topicMap.sourceOutline || fallbackPlan.sourceOutline || {},
    chunks,
    balancedChunks: balancedChunksForPlan(topicMap, chunks && chunks.length ? chunks : (fallbackPlan.balancedChunks || fallbackPlan.chunks || []), 48),
    hasMultipleTopics: topics.length >= 2,
    topicMap,
  };
}

module.exports = {
  TOPIC_MAP_VERSION,
  getOrBuild,
  refresh,
  coveragePlanForScope,
  balancedChunksForPlan,
  sourceTopicPlanForMap,
  _internals: {
    buildTopicMap,
    buildTopicMapFromPartsForTest,
    canonicalTopicForHeading,
    derivedTopicsFromChunks,
    operationsForTopic,
    requiredVisualTypesForTopic,
    storedMapMissesStrongTopics,
  },
};
