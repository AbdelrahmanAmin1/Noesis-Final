'use strict';

const env = require('../config/env');
const { getDb } = require('../config/db');
const topicResolver = require('./topic-resolver.service');
const materialUnderstanding = require('./material-understanding.service');

const CS_DOMAINS = new Set(['cs', 'Object-Oriented Programming', 'Data Structures', 'Algorithms']);
const DECISIONS = {
  ACCEPT: 'accept',
  RETRY: 'retry',
  BLOCK: 'block',
};

function cleanText(value, max = 12000) {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim()
    .slice(0, max);
}

function normalizeTopic(value) {
  const exact = topicResolver.exactKnownTopic(value);
  return exact || topicResolver._internals.normalizeTopic(value || '');
}

function topicKey(value) {
  return normalizeTopic(value).toLowerCase();
}

function phraseRegex(phrase) {
  const escaped = String(phrase || '').trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i');
}

function containsPhrase(text, phrase) {
  const normalized = String(phrase || '').toLowerCase().trim();
  if (!normalized) return false;
  return phraseRegex(normalized).test(String(text || '').toLowerCase());
}

function textFromChunks(chunks = []) {
  return (chunks || []).map(chunk => [
    chunk && chunk.chapter_title,
    chunk && chunk.heading,
    chunk && chunk.slide_title,
    chunk && chunk.section_title,
    chunk && chunk.text,
  ].filter(Boolean).join(' ')).join('\n');
}

function loadMaterialChunks(materialId, limit = 80) {
  if (!materialId) return [];
  try {
    const db = getDb();
    return db.prepare(`SELECT id, idx, text, chapter_id, source_page, chapter_title, heading,
        slide_number, slide_title, section_title, has_code, keywords_json, source_kind, source_visual_id
      FROM chunks WHERE material_id=? ORDER BY idx LIMIT ?`).all(materialId, limit);
  } catch (_) {
    return [];
  }
}

function allSourceChunks(opts = {}) {
  const passed = Array.isArray(opts.chunks) ? opts.chunks.filter(Boolean) : [];
  const loaded = loadMaterialChunks(opts.materialId);
  if (!loaded.length) return passed;
  const seen = new Set();
  const out = [];
  for (const chunk of [...passed, ...loaded]) {
    const key = chunk && chunk.id != null ? `id:${chunk.id}` : cleanText(chunk && chunk.text, 160);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(chunk);
  }
  return out;
}

function explicitBstRequested(opts = {}) {
  return ['requestedTopic', 'query', 'hint']
    .some(key => topicResolver.exactKnownTopic(opts[key]) === 'Binary Search Tree');
}

function treeEvidenceStrong(text) {
  const terms = [
    'tree adt',
    'tree data structure',
    'binary tree',
    'tree traversal',
    'root node',
    'parent',
    'children',
    'leaf',
    'height',
    'depth',
    'subtree',
    'preorder',
    'postorder',
    'inorder',
  ];
  return terms.filter(term => containsPhrase(text, term)).length >= 4;
}

function sourceOutlineTerms(sourceOutline = {}) {
  return [
    sourceOutline.mainTopic,
    sourceOutline.topic,
    ...(sourceOutline.keyConcepts || []),
    ...((sourceOutline.majorTopics || []).flatMap(item => [item && item.topic, ...((item && item.terms) || [])])),
    ...((sourceOutline.meaningfulSections || []).flatMap(item => [item && item.title, ...((item && item.terms) || [])])),
  ].filter(Boolean);
}

function sourcePlanTerms(plan = {}) {
  return [
    plan.primaryTopic,
    ...((plan.allowedTopics || [])),
    ...((plan.topicBundle || []).flatMap(item => [item && item.topic, ...((item && item.terms) || [])])),
  ].filter(Boolean);
}

function sourceTopicFrom(opts = {}, chunks = []) {
  const sourceText = textFromChunks(chunks);
  const ranked = topicResolver.rankTopicsFromChunks(chunks);
  let topic = ranked.topic || '';
  let confidence = Number(ranked.confidence || 0);
  let source = topic ? 'source_ranked_chunks' : '';

  if (topic === 'Binary Search Tree' && !explicitBstRequested(opts) && treeEvidenceStrong(sourceText)) {
    topic = 'Trees';
    confidence = Math.max(confidence, 0.72);
    source = 'source_ranked_chunks_tree_parent';
  }

  const domain = opts.domainInfo && opts.domainInfo.domain;
  if (topic && knownTopicFor(topic) && domain && !CS_DOMAINS.has(domain)) {
    const outlineTopic = normalizeTopic((opts.sourceOutline && (opts.sourceOutline.mainTopic || opts.sourceOutline.topic)) || '');
    if (outlineTopic && !topicResolver.isGenericTopic(outlineTopic)) {
      topic = outlineTopic;
      confidence = Math.max(Number(opts.sourceOutline && opts.sourceOutline.confidence || 0.5), 0.5);
      source = 'source_outline_non_cs';
    } else {
      topic = '';
      confidence = 0;
      source = '';
    }
  }

  if (!topic) {
    const outlineTopic = normalizeTopic((opts.sourceOutline && (opts.sourceOutline.mainTopic || opts.sourceOutline.topic)) || '');
    if (outlineTopic && !topicResolver.isGenericTopic(outlineTopic)) {
      topic = outlineTopic;
      confidence = Number(opts.sourceOutline && opts.sourceOutline.confidence || 0.5);
      source = 'source_outline';
    }
  }

  if (!topic) {
    const understandingTopic = normalizeTopic(opts.materialUnderstanding && (
      opts.materialUnderstanding.normalizedTopic || opts.materialUnderstanding.topic
    ));
    if (understandingTopic && !topicResolver.isGenericTopic(understandingTopic)) {
      topic = understandingTopic;
      confidence = Number(opts.materialUnderstanding && opts.materialUnderstanding.confidence || 0.45);
      source = 'material_understanding';
    }
  }

  return {
    topic,
    normalizedTopic: normalizeTopic(topic),
    confidence: Math.max(0, Math.min(1, confidence || 0)),
    source,
    candidates: ranked.candidates || [],
  };
}

function topicsCompatible(resolvedTopic, sourceTopic, opts = {}) {
  const resolved = topicKey(resolvedTopic);
  const source = topicKey(sourceTopic);
  if (!resolved || !source) return true;
  if (resolved === source) return true;
  if (resolved.includes(source) || source.includes(resolved)) return true;
  if (source === 'trees' && resolved === 'binary search tree') return explicitBstRequested(opts);
  if (source === 'binary search tree' && resolved === 'trees') return true;
  return false;
}

function isMaterialWide(opts = {}) {
  return String(opts.topicMode || opts.topic_mode || opts.sourceTopicPlan && opts.sourceTopicPlan.topicMode || '').toLowerCase() === 'material_wide';
}

function outlineHasMultipleSourceTopics(sourceOutline = {}) {
  const majors = Array.isArray(sourceOutline.majorTopics)
    ? sourceOutline.majorTopics.filter(item => item && item.topic)
    : [];
  const sections = Array.isArray(sourceOutline.meaningfulSections)
    ? sourceOutline.meaningfulSections.filter(item => item && item.title)
    : [];
  return majors.length >= 2 || sections.length >= 3;
}

function hasMultipleSourceTopics(opts = {}) {
  const planBundle = opts.sourceTopicPlan && Array.isArray(opts.sourceTopicPlan.topicBundle)
    ? opts.sourceTopicPlan.topicBundle.filter(item => item && item.topic)
    : [];
  return planBundle.length >= 2 || outlineHasMultipleSourceTopics(opts.sourceOutline || {});
}

function sourceWideTopicCompatible(sourceTopic, opts = {}) {
  if (!isMaterialWide(opts) || !hasMultipleSourceTopics(opts)) return false;
  if (!knownTopicFor(sourceTopic)) return false;
  if (sourceLooksNonCs(opts.domainInfo || {}, sourceTopic)) return false;
  return true;
}

function knownTopicFor(value) {
  return topicResolver.exactKnownTopic(value) || null;
}

function sourceLooksNonCs(domainInfo = {}, sourceTopic = '') {
  const domain = domainInfo.domain || '';
  if (CS_DOMAINS.has(domain)) return false;
  return !knownTopicFor(sourceTopic);
}

function riskyAlias(alias, topic) {
  const a = String(alias || '').toLowerCase().trim();
  if (a.length < 4) return false;
  if (a.includes(' ')) return true;
  return /^(encapsulation|polymorphism|inheritance|abstraction|interface|interfaces|linkedlist|bst|heap|graph|stack|queue|hashmap)$/.test(a)
    || ['Stack', 'Queue', 'Heap', 'Graph'].includes(topic);
}

function allowedTopicKeys(sourceTopic, opts = {}) {
  const allowed = new Set();
  const add = (topic) => {
    const key = topicKey(topic);
    if (key) allowed.add(key);
  };
  add(sourceTopic);
  if (explicitBstRequested(opts)) add('Binary Search Tree');
  if (topicKey(sourceTopic) === 'trees') add('Binary Search Tree');
  for (const topic of (opts.sourceTopicPlan && opts.sourceTopicPlan.allowedTopics) || []) add(topic);
  for (const item of (opts.sourceTopicPlan && opts.sourceTopicPlan.topicBundle) || []) add(item && item.topic);
  for (const item of (opts.sourceOutline && opts.sourceOutline.majorTopics) || []) add(knownTopicFor(item && item.topic));
  for (const candidate of (opts.materialUnderstanding && opts.materialUnderstanding.alternatives) || []) add(candidate && candidate.topic);
  return allowed;
}

function unsupportedTopicHits(outputText, sourceText, sourceTopic, opts = {}) {
  const output = cleanText(outputText).toLowerCase();
  const source = cleanText(sourceText).toLowerCase();
  const outlineText = sourceOutlineTerms(opts.sourceOutline || {}).join(' ').toLowerCase();
  const allowed = allowedTopicKeys(sourceTopic, opts);
  const hits = [];

  for (const family of materialUnderstanding.DOMAIN_TOPICS || []) {
    for (const topicDef of family.topics || []) {
      const topic = topicDef.normalizedTopic;
      const key = topicKey(topic);
      if (!key || allowed.has(key)) continue;
      for (const alias of [topic, ...(topicDef.aliases || [])]) {
        if (!riskyAlias(alias, topic)) continue;
        if (topic === 'Recursion' && /\b(tree|trees|bst|binary tree|traversal|preorder|inorder|postorder)\b/.test(`${source} ${outlineText}`)) continue;
        if (!containsPhrase(output, alias)) continue;
        if (containsPhrase(source, alias)) continue;
        hits.push({ topic, alias });
        break;
      }
    }
  }

  return hits.slice(0, 8);
}

function sourceTerms(opts = {}, chunks = []) {
  const terms = [
    ...sourcePlanTerms(opts.sourceTopicPlan || {}),
    ...sourceOutlineTerms(opts.sourceOutline || {}),
    ...((opts.materialUnderstanding && opts.materialUnderstanding.keyConcepts) || []),
    ...((opts.materialUnderstanding && opts.materialUnderstanding.sourceEvidence) || []).flatMap(item => [
      item && item.heading,
      item && item.chapterTitle,
      item && item.slideTitle,
    ]),
    ...((opts.sourceVisuals || []).flatMap(item => [item && item.heading, item && item.visualTypeGuess])),
  ];
  if (!terms.length) {
    const ranked = topicResolver.rankTopicsFromChunks(chunks);
    terms.push(ranked.topic, ...((ranked.candidates || []).slice(0, 3).map(item => item.topic)));
  }
  const seen = new Set();
  return terms
    .map(term => normalizeTopic(term))
    .filter(term => term && !topicResolver.isGenericTopic(term))
    .filter(term => {
      const key = term.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 20);
}

function bundleCoverageScore(outputText, plan = {}) {
  const bundle = Array.isArray(plan.topicBundle) ? plan.topicBundle.filter(item => item && item.topic) : [];
  if (!bundle.length) return { covered: 0, available: 0, matched: [] };
  const text = cleanText(outputText).toLowerCase();
  const matched = [];
  for (const item of bundle) {
    const terms = [item.topic, ...((item.terms || []).slice(0, 6))].filter(Boolean);
    if (terms.some(term => containsPhrase(text, term))) matched.push(item.topic);
  }
  return { covered: matched.length, available: bundle.length, matched };
}

function coverageScore(outputText, terms = []) {
  const text = cleanText(outputText).toLowerCase();
  const matched = terms.filter(term => containsPhrase(text, term));
  const denominator = Math.max(1, Math.min(6, terms.length));
  return {
    score: Math.round(Math.min(1, matched.length / denominator) * 1000) / 1000,
    matched,
  };
}

function practiceQuizText(input = []) {
  const questions = Array.isArray(input) ? input : (Array.isArray(input && input.questions) ? input.questions : []);
  return questions
    .filter(question => question && typeof question === 'object')
    .map((question, index) => [
      `Question ${index + 1}: ${question.question || ''}`,
      Array.isArray(question.options) && Number.isInteger(Number(question.correct_idx))
        ? `Correct answer: ${question.options[Number(question.correct_idx)] || ''}`
        : '',
      question.explanation ? `Explanation: ${question.explanation}` : '',
      question.topic || question.concept ? `Topic: ${question.topic || question.concept}` : '',
    ].filter(Boolean).join('\n'))
    .join('\n\n');
}

function practiceFlashcardText(input = []) {
  const cards = Array.isArray(input) ? input : (Array.isArray(input && input.cards) ? input.cards : []);
  return cards
    .filter(card => card && typeof card === 'object')
    .map((card, index) => [
      `Card ${index + 1}: ${card.question || ''}`,
      `Answer: ${card.answer || ''}`,
      card.topic ? `Topic: ${card.topic}` : '',
    ].filter(Boolean).join('\n'))
    .join('\n\n');
}

function retryOrBlock(reasonCodes, opts, data = {}) {
  const retryLimit = Number.isFinite(Number(env.SOURCE_GROUNDING_JUDGE_RETRY_LIMIT))
    ? Number(env.SOURCE_GROUNDING_JUDGE_RETRY_LIMIT)
    : 1;
  const attempt = Math.max(0, Number(opts.attempt || 0));
  const decision = attempt < retryLimit ? DECISIONS.RETRY : DECISIONS.BLOCK;
  return {
    decision,
    reasonCodes,
    correctedTopic: data.correctedTopic || null,
    retryGuidance: retryGuidance({ reasonCodes, correctedTopic: data.correctedTopic, evidence: data.evidence }),
  };
}

function retryGuidance(verdict = {}) {
  const evidence = verdict.evidence || {};
  const parts = [
    'Verifier retry guidance:',
    'Use the uploaded material as the source of truth.',
  ];
  if (verdict.correctedTopic) parts.push(`Use this source topic: ${verdict.correctedTopic}.`);
  if (evidence.sourceTerms && evidence.sourceTerms.length) {
    parts.push(`Anchor on source terms: ${evidence.sourceTerms.slice(0, 8).join(', ')}.`);
  }
  if (evidence.unsupportedTopics && evidence.unsupportedTopics.length) {
    parts.push(`Avoid unsupported topics: ${evidence.unsupportedTopics.map(item => item.topic).join(', ')}.`);
  }
  parts.push('Do not replace the uploaded material with a neighboring curated topic.');
  return parts.join('\n');
}

function topicLockPrompt(topic, verdict = {}, opts = {}) {
  const evidence = verdict.evidence || {};
  const resolvedTopic = normalizeTopic(topic || verdict.correctedTopic || evidence.sourceTopic || evidence.resolvedTopic || '');
  const sourceTermsList = (evidence.sourceTerms || []).slice(0, 8);
  const unsupportedTopics = [...new Set((evidence.unsupportedTopics || []).map(item => item && item.topic).filter(Boolean))];
  const label = opts.strict ? 'Strict topic lock' : 'Topic lock';
  return [
    `${label}: Generate only about ${resolvedTopic || 'the resolved source topic'} using these uploaded source facts.`,
    sourceTermsList.length ? `Use source terms such as: ${sourceTermsList.join(', ')}.` : '',
    unsupportedTopics.length
      ? `Do not switch to unsupported topics: ${unsupportedTopics.join(', ')}.`
      : 'Do not switch to neighboring OOP, Data Structures, Algorithms, or unrelated subject topics unless they appear in the uploaded source.',
  ].filter(Boolean).join('\n');
}

function safeSourceFallbackAllowed(verdict = {}) {
  const codes = new Set((verdict.reasonCodes || []).map(code => String(code || '').toLowerCase()));
  const unsupported = verdict.evidence && Array.isArray(verdict.evidence.unsupportedTopics)
    ? verdict.evidence.unsupportedTopics
    : [];
  if (unsupported.length) return false;
  for (const code of codes) {
    if (
      code.includes('unsupported') ||
      code.includes('topic_mismatch') ||
      code.includes('topic_drift') ||
      code.includes('low_source_coverage') ||
      code.includes('low_topic_bundle_coverage')
    ) return false;
  }
  return true;
}

function sourceRepairSafe(verdict = {}) {
  if (!verdict) return false;
  const codes = new Set((verdict.reasonCodes || []).map(code => String(code || '').toLowerCase()));
  const unsupported = verdict.evidence && Array.isArray(verdict.evidence.unsupportedTopics)
    ? verdict.evidence.unsupportedTopics
    : [];
  if (unsupported.length) return false;
  for (const code of codes) {
    if (code.includes('unsupported') || code.includes('topic_mismatch')) return false;
  }
  const scores = verdict.scores || {};
  const evidence = verdict.evidence || {};
  const bundle = evidence.topicBundleCoverage || {};
  return (scores.sourceCoverage || 0) > 0 ||
    (bundle.covered || 0) > 0 ||
    ((evidence.sourceCoverageMatches || []).length > 0);
}

function sourceLimitedTutorFallback(verdict = {}, sources = []) {
  const topic = verdict.correctedTopic || (verdict.evidence && verdict.evidence.sourceTopic) || 'the uploaded material';
  const source = (sources || []).find(item => item && (item.excerpt || item.text || item.heading));
  const detail = source
    ? `The safest source cue I found is ${source.location ? `${source.location}: ` : ''}${cleanText(source.heading || source.excerpt || source.text, 180)}.`
    : 'I do not have enough reliable source evidence for the answer I was about to give.';
  return [
    '### Answer',
    `I should stay grounded in ${topic}. ${detail}`,
    '',
    '### Check yourself',
    `Which source section or page should we use to focus the explanation of ${topic}?`,
  ].join('\n');
}

function judge(opts = {}) {
  const enabled = env.SOURCE_GROUNDING_JUDGE_ENABLED !== false;
  const featureName = String(opts.feature || '').toLowerCase();
  const chunks = allSourceChunks(opts);
  const sourceText = textFromChunks(chunks);
  const outputText = cleanText(opts.outputText || (opts.outputJson ? JSON.stringify(opts.outputJson) : ''), 24000);
  const sourceTopic = sourceTopicFrom(opts, chunks);
  const resolvedTopic = normalizeTopic(opts.resolvedTopic || opts.topic || '');
  const requestedTopic = normalizeTopic(opts.requestedTopic || opts.query || opts.hint || '');
  const terms = sourceTerms(opts, chunks);
  const coverage = outputText ? coverageScore(outputText, terms) : { score: 0, matched: [] };
  const relaxMaterialWideDrift = isMaterialWide(opts) && hasMultipleSourceTopics(opts);
  const drift = outputText && !relaxMaterialWideDrift
    ? materialUnderstanding.detectTopicDrift(outputText, {
      focusTopic: sourceTopic.topic || resolvedTopic,
      sourceOutline: opts.sourceOutline || null,
    })
    : { drifted: false, relaxed: !!outputText && relaxMaterialWideDrift, focusHits: 0, competingHits: 0, focusTerms: [], competingTerms: [] };
  const unsupportedTopics = outputText
    ? unsupportedTopicHits(outputText, sourceText, sourceTopic.topic || resolvedTopic, opts)
    : [];
  const bundleCoverage = outputText ? bundleCoverageScore(outputText, opts.sourceTopicPlan || {}) : { covered: 0, available: 0, matched: [] };

  const evidence = {
    sourceTopic: sourceTopic.topic || null,
    sourceTopicSource: sourceTopic.source || null,
    resolvedTopic: resolvedTopic || null,
    requestedTopic: requestedTopic || null,
    sourceTerms: terms,
    sourceCoverageMatches: coverage.matched,
    unsupportedTopics,
    drift,
    topicBundleCoverage: bundleCoverage,
  };

  const scores = {
    sourceTopicConfidence: Math.round(sourceTopic.confidence * 1000) / 1000,
    sourceCoverage: coverage.score,
    driftFocusHits: drift.focusHits || 0,
    driftCompetingHits: drift.competingHits || 0,
    topicBundleCoverage: bundleCoverage.available ? Math.round((bundleCoverage.covered / bundleCoverage.available) * 1000) / 1000 : null,
  };

  if (!enabled) {
    return { enabled: false, mode: 'disabled', decision: DECISIONS.ACCEPT, reasonCodes: ['judge_disabled'], correctedTopic: null, scores, evidence };
  }

  const confidentSourceTopic = sourceTopic.topic && sourceTopic.confidence >= 0.45;
  const resolvedKnown = knownTopicFor(resolvedTopic);
  const sourceKnown = knownTopicFor(sourceTopic.topic);
  const nonCsSourceWithCsResolved = sourceLooksNonCs(opts.domainInfo || {}, sourceTopic.topic)
    && resolvedKnown
    && sourceTopic.confidence >= 0.45;
  const topicMismatch = confidentSourceTopic
    && !topicsCompatible(resolvedTopic, sourceTopic.topic, opts)
    && !sourceWideTopicCompatible(sourceTopic.topic, opts)
    && (sourceKnown || nonCsSourceWithCsResolved);

  if (topicMismatch) {
    const correctedTopic = sourceTopic.topic;
    const retry = retryOrBlock(['topic_mismatch'], opts, { correctedTopic, evidence });
    return { enabled: true, mode: env.SOURCE_GROUNDING_JUDGE_MODE || 'deterministic', ...retry, scores, evidence };
  }

  const reasonCodes = [];
  if (outputText && drift.drifted && env.SOURCE_GROUNDING_JUDGE_BLOCK_ON_TOPIC_DRIFT !== false) {
    reasonCodes.push('topic_drift');
  }
  if (outputText && unsupportedTopics.length) {
    reasonCodes.push(sourceLooksNonCs(opts.domainInfo || {}, sourceTopic.topic) ? 'unsupported_curated_topic' : 'unsupported_topic_drift');
  }
  const needsCoverage = outputText
    && ['notes', 'video', 'storyboard', 'quiz', 'flashcards'].includes(featureName)
    && chunks.length > 0
    && terms.length >= 3;
  if (needsCoverage && coverage.matched.length === 0) {
    reasonCodes.push('low_source_coverage');
  }
  if (isMaterialWide(opts) && bundleCoverage.available >= 2 && bundleCoverage.covered === 0) {
    reasonCodes.push('low_topic_bundle_coverage');
  }

  if (reasonCodes.length) {
    const retry = retryOrBlock([...new Set(reasonCodes)], opts, {
      correctedTopic: sourceTopic.topic || resolvedTopic || null,
      evidence,
    });
    return { enabled: true, mode: env.SOURCE_GROUNDING_JUDGE_MODE || 'deterministic', ...retry, scores, evidence };
  }

  return {
    enabled: true,
    mode: env.SOURCE_GROUNDING_JUDGE_MODE || 'deterministic',
    decision: DECISIONS.ACCEPT,
    reasonCodes: [],
    correctedTopic: null,
    retryGuidance: '',
    scores,
    evidence,
  };
}

module.exports = {
  DECISIONS,
  judge,
  practiceQuizText,
  practiceFlashcardText,
  retryGuidance,
  topicLockPrompt,
  safeSourceFallbackAllowed,
  sourceRepairSafe,
  sourceLimitedTutorFallback,
  _internals: {
    allSourceChunks,
    bundleCoverageScore,
    coverageScore,
    practiceQuizText,
    practiceFlashcardText,
    sourceTopicFrom,
    safeSourceFallbackAllowed,
    sourceRepairSafe,
    topicLockPrompt,
    topicsCompatible,
    unsupportedTopicHits,
  },
};
