'use strict';

const { getDb } = require('../config/db');
const materialUnderstanding = require('./material-understanding.service');
const topicResolver = require('./topic-resolver.service');

function clean(value, max = 140) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function key(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9+#]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function isGeneric(value) {
  const text = clean(value);
  if (!text || /^\d+$/.test(text)) return true;
  if (/^((info\s+)?material concepts?|computer science|cs|data structures?|object[-\s]?oriented programming|oop|algorithms?)$/i.test(text)) return true;
  return topicResolver.isGenericTopic(text) ||
    (materialUnderstanding._internals && materialUnderstanding._internals.isGenericGeneralLabel
      ? materialUnderstanding._internals.isGenericGeneralLabel(text)
      : /^(document|file|material|chapter|source|details)$/i.test(text));
}

function unique(items, max = 50) {
  const seen = new Set();
  const out = [];
  for (const item of items || []) {
    const value = clean(item);
    const k = key(value);
    if (!k || seen.has(k) || isGeneric(value)) continue;
    seen.add(k);
    out.push(value);
    if (out.length >= max) break;
  }
  return out;
}

const EXTRA_DS_TOPICS = [
  {
    normalizedTopic: 'Priority Queue',
    aliases: ['priority queue', 'priority queues', 'priority-queue'],
    keyConcepts: ['priority', 'heap', 'min priority', 'max priority', 'enqueue with priority', 'dequeue highest priority'],
  },
  {
    normalizedTopic: 'Deque',
    aliases: ['deque', 'double ended queue', 'double-ended queue', 'double ended queues', 'double-ended queues'],
    keyConcepts: ['front', 'rear', 'insert front', 'insert rear', 'delete front', 'delete rear'],
  },
];

function allDomainTopicDefs() {
  return [
    ...(materialUnderstanding.DOMAIN_TOPICS || []).flatMap(family => family.topics || []),
    ...EXTRA_DS_TOPICS,
  ];
}

function termRegex(term) {
  const escaped = key(term).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  return escaped ? new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'gi') : null;
}

function countTermHits(source, term) {
  const re = termRegex(term);
  if (!re) return 0;
  return (source.match(re) || []).length;
}

function compactEvidenceForTopic(topic, chunks = []) {
  const terms = [topic.normalizedTopic, ...(topic.aliases || []), ...(topic.keyConcepts || [])].map(key).filter(Boolean);
  for (const chunk of chunks || []) {
    const text = [
      chunk.heading,
      chunk.chapter_title,
      chunk.section_title,
      chunk.slide_title,
      chunk.text,
    ].filter(Boolean).join(' ');
    const lower = key(text);
    if (terms.some(term => term.length >= 3 && lower.includes(term))) {
      return clean(text, 260);
    }
  }
  return '';
}

function scopedChunks(materialId, opts = {}) {
  if (Array.isArray(opts.chunks) && opts.chunks.length) return opts.chunks.filter(Boolean);
  if (!materialId) return [];
  const db = getDb();
  const limit = Math.max(1, Math.min(120, Number(opts.limit || 80)));
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
  return db.prepare(`SELECT ${fields} FROM chunks WHERE material_id=? ORDER BY idx LIMIT ?`)
    .all(materialId, limit);
}

function chunkIdsForBundleItem(item, chunks) {
  const ids = new Set((item && item.chunkIds || []).map(Number).filter(Number.isInteger));
  if (ids.size) return [...ids];
  const terms = [item && item.topic, ...((item && item.terms) || [])].map(key).filter(Boolean);
  const found = [];
  for (const chunk of chunks || []) {
    const text = key([chunk.heading, chunk.chapter_title, chunk.section_title, chunk.slide_title, chunk.text].filter(Boolean).join(' '));
    if (terms.some(term => term.length >= 3 && text.includes(term))) found.push(chunk.id);
  }
  return found.filter(Number.isInteger);
}

function sourceLabelForItem(item) {
  const pages = Array.isArray(item && item.sourcePages) ? item.sourcePages.filter(Boolean) : [];
  if (pages.length) return `page ${pages[0]}`;
  return '';
}

function bundleFromOutline(outline = {}, chunks = []) {
  const raw = Array.isArray(outline.majorTopics) && outline.majorTopics.length
    ? outline.majorTopics
    : (outline.meaningfulSections || []).map(section => ({
      topic: section.title,
      terms: section.terms || [],
      chunkIds: section.chunkIds || [],
      sourcePages: section.sourcePages || [],
      evidence: section.excerpt || '',
    }));
  const seen = new Set();
  const bundle = [];
  for (const item of raw) {
    const topic = clean(item && item.topic);
    const k = key(topic);
    if (!k || seen.has(k) || isGeneric(topic)) continue;
    const chunkIds = chunkIdsForBundleItem(item, chunks);
    seen.add(k);
    bundle.push({
      topic,
      terms: unique([topic, ...((item && item.terms) || [])], 12),
      chunkIds,
      evidence: clean(item && item.evidence || item && item.excerpt || '', 260),
      sourcePages: Array.isArray(item && item.sourcePages) ? [...new Set(item.sourcePages)].filter(Boolean) : [],
      sourceLabel: sourceLabelForItem(item),
    });
    if (bundle.length >= 8) break;
  }
  return bundle;
}

function knownTopicBundleFromChunks(chunks = [], outline = {}, existingBundle = []) {
  const existingKeys = new Set((existingBundle || []).map(item => key(item && item.topic)).filter(Boolean));
  const source = [
    outline.mainTopic,
    outline.topic,
    ...(outline.keyConcepts || []),
    ...(outline.meaningfulSections || []).map(section => [section.title, ...(section.terms || [])].join(' ')),
    ...chunks.map(chunk => [
      chunk.heading,
      chunk.chapter_title,
      chunk.section_title,
      chunk.slide_title,
      chunk.text,
      chunk.keywords_json,
    ].filter(Boolean).join(' ')),
  ].join('\n').toLowerCase();
  const rows = [];
  for (const topic of allDomainTopicDefs()) {
    const normalizedTopic = clean(topic && topic.normalizedTopic);
    const topicKey = key(normalizedTopic);
    if (!topicKey || isGeneric(normalizedTopic) || existingKeys.has(topicKey)) continue;
    const plural = /s$/i.test(normalizedTopic) ? '' : `${normalizedTopic}s`;
    const exactTerms = unique([normalizedTopic, plural, ...((topic && topic.aliases) || [])], 10);
    const aliases = unique([...exactTerms, ...((topic && topic.keyConcepts) || [])], 14);
    const exactHits = countTermHits(source, normalizedTopic);
    const aliasHits = exactTerms.reduce((sum, term) => sum + countTermHits(source, term), 0);
    const operationHits = ((topic && topic.keyConcepts) || []).reduce((sum, term) => sum + countTermHits(source, term), 0);
    const score = exactHits * 3 + aliasHits + Math.min(operationHits, 6);
    const chunkIds = chunkIdsForBundleItem({ topic: normalizedTopic, terms: aliases }, chunks);
    if (aliasHits < 1) continue;
    if (score < 2 && chunkIds.length < 2) continue;
    rows.push({
      topic: normalizedTopic,
      terms: aliases,
      chunkIds,
      evidence: compactEvidenceForTopic(topic, chunks),
      sourcePages: [...new Set((chunks || [])
        .filter(chunk => chunkIds.includes(chunk.id))
        .map(chunk => chunk.source_page || chunk.slide_number)
        .filter(Boolean))],
      score,
    });
  }
  const hasPriorityQueue = rows.some(item => key(item.topic) === 'priority queue');
  return rows
    .filter(item => !(hasPriorityQueue && key(item.topic) === 'heap'))
    .sort((a, b) => b.score - a.score || a.topic.localeCompare(b.topic))
    .slice(0, 8);
}

function mergeTopicBundles(primary = [], discovered = [], max = 8) {
  const seen = new Set();
  const out = [];
  for (const item of [...(primary || []), ...(discovered || [])]) {
    const topic = clean(item && item.topic);
    const k = key(topic);
    if (!k || seen.has(k) || isGeneric(topic)) continue;
    seen.add(k);
    out.push({
      ...item,
      topic,
      terms: unique([topic, ...((item && item.terms) || [])], 14),
      chunkIds: Array.isArray(item && item.chunkIds) ? item.chunkIds : [],
      evidence: clean(item && item.evidence || '', 260),
      sourcePages: Array.isArray(item && item.sourcePages) ? [...new Set(item.sourcePages)].filter(Boolean) : [],
      sourceLabel: sourceLabelForItem(item),
    });
    if (out.length >= max) break;
  }
  return out;
}

function knownTopicsInSource(chunks = [], outline = {}, bundle = []) {
  const source = [
    outline.mainTopic,
    outline.topic,
    ...(outline.keyConcepts || []),
    ...bundle.flatMap(item => [item.topic, ...(item.terms || [])]),
    ...chunks.map(chunk => [chunk.heading, chunk.chapter_title, chunk.section_title, chunk.slide_title, chunk.text].filter(Boolean).join(' ')),
  ].join('\n').toLowerCase();
  const allowed = [];
  for (const family of [{ topics: allDomainTopicDefs() }]) {
    for (const topic of family.topics || []) {
      const labels = [topic.normalizedTopic, ...(topic.aliases || [])];
      if (labels.some(label => {
        const k = key(label);
        return k && source.includes(k);
      })) allowed.push(topic.normalizedTopic);
    }
  }
  return unique(allowed, 20);
}

function allKnownTopics() {
  return unique(allDomainTopicDefs().map(topic => topic.normalizedTopic), 100);
}

function pickPrimaryTopic({ topicMode, explicitTopic, requestedTopic, materialTitle, outline, bundle, chunks }) {
  if (topicMode === 'focused') {
    const exact = topicResolver.exactKnownTopic(explicitTopic || requestedTopic);
    if (exact) return exact;
    const focused = clean(outline.mainTopic || outline.topic || explicitTopic || requestedTopic || materialTitle);
    return !isGeneric(focused) ? focused : 'Uploaded Material';
  }
  if (bundle.length >= 2) return bundle.slice(0, 3).map(item => item.topic).join(' / ');
  const ranked = topicResolver.rankTopicsFromChunks(chunks || []);
  if (ranked.topic && ranked.confidence >= 0.45) return ranked.topic;
  const main = clean(outline.mainTopic || outline.topic || materialTitle);
  return !isGeneric(main) ? main : 'Uploaded Material';
}

function balancedChunksForBundle(chunks = [], bundle = [], max = 48) {
  if (!bundle.length) return chunks.slice(0, max);
  const byId = new Map((chunks || []).map(chunk => [Number(chunk.id), chunk]));
  const selected = [];
  const seen = new Set();
  const rounds = Math.max(1, Math.min(4, Math.ceil(max / Math.max(1, bundle.length))));
  for (let round = 0; round < rounds; round++) {
    for (const item of bundle) {
      const id = (item.chunkIds || [])[round];
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

function buildSourceTopicPlan(opts = {}) {
  const chunks = scopedChunks(opts.materialId, opts);
  const explicitTopic = clean(opts.explicitTopic || opts.query || opts.concept || '');
  const topicMode = (opts.sourceScope || 'material') === 'material' && !explicitTopic ? 'material_wide' : 'focused';
  const domain = opts.domainInfo && opts.domainInfo.domain || '';
  const csDomain = /^(cs|object-oriented programming|data structures|algorithms)$/i.test(String(domain || ''));
  const sourceOutline = opts.sourceOutline || materialUnderstanding.buildSourceOutline(chunks, {
    explicitQuery: explicitTopic || undefined,
    hint: explicitTopic || opts.requestedTopic || opts.materialTitle,
    title: opts.materialTitle,
    materialTitle: opts.materialTitle,
    scopeTitle: opts.scopeTitle,
    domainInfo: opts.domainInfo,
  });
  const outlineBundle = bundleFromOutline(sourceOutline, chunks);
  const discoveredBundle = csDomain ? knownTopicBundleFromChunks(chunks, sourceOutline, outlineBundle) : [];
  const topicBundle = topicMode === 'material_wide'
    ? mergeTopicBundles(outlineBundle, discoveredBundle, 8)
    : outlineBundle;
  const primaryTopic = pickPrimaryTopic({
    topicMode,
    explicitTopic,
    requestedTopic: opts.requestedTopic,
    materialTitle: opts.materialTitle,
    outline: sourceOutline,
    bundle: topicBundle,
    chunks,
  });
  const allowedTopics = unique([
    primaryTopic,
    sourceOutline.mainTopic,
    sourceOutline.topic,
    ...topicBundle.flatMap(item => [item.topic, ...(item.terms || [])]),
    ...(csDomain ? knownTopicsInSource(chunks, sourceOutline, topicBundle) : []),
  ], 40);
  const blockedTopics = csDomain
    ? allKnownTopics().filter(topic => !allowedTopics.some(allowed => key(allowed) === key(topic)))
    : [];
  const balancedChunks = topicMode === 'material_wide'
    ? balancedChunksForBundle(chunks, topicBundle, opts.maxBalancedChunks || 48)
    : chunks.slice(0, opts.maxBalancedChunks || 24);
  return {
    topicMode,
    primaryTopic,
    topicBundle,
    allowedTopics,
    blockedTopics,
    sourceOutline,
    domain,
    chunks,
    balancedChunks,
    hasMultipleTopics: topicBundle.length >= 2,
  };
}

function focusTerms(plan = {}, fallbackTopic = '') {
  return unique([
    plan.primaryTopic || fallbackTopic,
    ...((plan.sourceOutline && plan.sourceOutline.keyConcepts) || []),
    ...((plan.topicBundle || []).flatMap(item => [item.topic, ...(item.terms || [])])),
  ], 28);
}

function formatSourceTopicPlanForPrompt(plan = {}) {
  if (!plan || !plan.primaryTopic) return '';
  const topics = (plan.topicBundle || []).slice(0, 8).map((item, index) => {
    const terms = (item.terms || []).slice(0, 5).join(', ');
    const evidence = item.evidence ? ` Evidence: ${item.evidence}` : '';
    return `${index + 1}. ${item.topic}${terms ? ` (${terms})` : ''}.${evidence}`;
  });
  const topicNames = topics.length >= 2 ? topics.map(t => t.replace(/^\d+\.\s*/, '').split(' (')[0].trim()).filter(Boolean) : [];
  const multiTopicInstruction = topics.length >= 2
    ? [
      '- IMPORTANT: This material covers multiple topics. Distribute your output evenly across ALL listed topics. Do not focus only on the first or primary topic — every topic in the list must receive comparable coverage.',
      `- MANDATORY: Create at least 1-2 dedicated scenes/sections for EACH of these topics: ${topicNames.join(', ')}. If you cover only one topic, the output will be rejected and regenerated.`,
    ].join('\n')
    : '';
  return [
    'Source topic plan:',
    `- Mode: ${plan.topicMode || 'focused'}`,
    `- Primary source topic: ${plan.primaryTopic}`,
    topics.length ? '- Material-wide topics to cover:\n' + topics.join('\n') : '',
    multiTopicInstruction,
    plan.allowedTopics && plan.allowedTopics.length ? `- Allowed source topics: ${plan.allowedTopics.slice(0, 12).join(', ')}` : '',
    plan.blockedTopics && plan.blockedTopics.length ? `- Do not drift into unsupported neighboring topics such as: ${plan.blockedTopics.slice(0, 10).join(', ')}` : '',
  ].filter(Boolean).join('\n');
}

module.exports = {
  buildSourceTopicPlan,
  formatSourceTopicPlanForPrompt,
  focusTerms,
  _internals: {
    balancedChunksForBundle,
    bundleFromOutline,
    knownTopicBundleFromChunks,
    mergeTopicBundles,
    scopedChunks,
  },
};
