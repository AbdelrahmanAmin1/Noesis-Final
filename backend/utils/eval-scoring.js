'use strict';

const fs = require('fs');
const path = require('path');
const { z } = require('zod');
const { extractJson } = require('./jsonSafe');

const VALID_FEATURES = new Set(['tutor', 'notes', 'video', 'quiz', 'flashcards']);
const DEFAULT_BANNED = [
  'We will define',
  'Code sketch',
  'Trace example',
  'Apply main rule',
  'Example here',
  'Definition goes here',
  'Teaching goal',
  'sourceChunkIds',
  'raw curated JSON',
  '[chunk:',
];

const MODEL_QUALITY_FAILURES = new Set([
  'PROMPT_FAILURE',
  'SCHEMA_FAILURE',
  'PARSING_FAILURE',
  'RAG_CONTEXT_FAILURE',
  'CURATED_KNOWLEDGE_GAP',
  'MODEL_CAPABILITY_FAILURE',
]);

const PROVIDER_RUNTIME_FAILURES = new Set([
  'PROVIDER_ERROR',
  'TOKEN_LIMIT_FAILURE',
  'TIMEOUT',
  'EVAL_RUNNER_FAILURE',
]);

const TERM_SYNONYMS = Object.freeze(Object.assign(Object.create(null), {
  'growth rate': [
    'growth rate',
    'rate of growth',
    'growth curve',
    'growth curves',
    'how work grows',
    'how the work grows',
    'how resource usage grows',
    'grows as the input',
    'grows with input',
    'requirements grow',
  ],
  'not exact seconds': [
    'not exact seconds',
    'not exact runtime',
    'not exact running time',
    'does not tell you how many seconds',
    'does not tell how many seconds',
    'does not tell you the number of seconds',
    'not tell you how many seconds',
    'not about exact seconds',
    'wall-clock time',
    'actual seconds',
  ],
  'runtime seconds misconception': [
    'runtime seconds misconception',
    'confusing runtime seconds',
    'confuse runtime seconds',
    'confusing big-o with seconds',
    'big-o is not seconds',
    'not exact seconds',
    'wall-clock time',
  ],
}));

class EvalScoringError extends Error {
  constructor(code, message, details = {}) {
    super(message || code);
    this.code = code;
    this.details = details;
  }
}

const EvalItemSchema = z.object({
  id: z.string().min(1),
  domain: z.string().min(1),
  topic: z.string().min(1),
  feature: z.enum(['tutor', 'notes', 'video', 'quiz', 'flashcards']),
  taskType: z.string().min(1),
  difficulty: z.string().min(1),
  prompt: z.string().min(1),
  expectedMustInclude: z.array(z.string().min(1)).default([]),
  expectedShouldInclude: z.array(z.string().min(1)).default([]),
  mustNotInclude: z.array(z.string().min(1)).default([]),
  expectedOutputType: z.string().min(1),
  rubric: z.record(z.union([z.number(), z.string()])).default({}),
  source: z.object({
    type: z.string().min(1),
    name: z.string().min(1),
    license: z.string().min(1),
  }).passthrough(),
  sampleInput: z.unknown().optional(),
}).passthrough();

function parseJsonlText(text, options = {}) {
  const filePath = options.filePath || '<inline>';
  const records = [];
  String(text || '').split(/\r?\n/).forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    let parsed;
    try {
      parsed = JSON.parse(trimmed);
    } catch (err) {
      throw new EvalScoringError('invalid_jsonl', `${filePath}:${index + 1} is not valid JSON`, {
        filePath,
        line: index + 1,
        error: err.message,
      });
    }
    records.push(validateEvalItem(parsed, { filePath, line: index + 1 }));
  });
  return records;
}

function loadJsonlFile(filePath) {
  return parseJsonlText(fs.readFileSync(filePath, 'utf8'), { filePath });
}

function listEvalFiles(evalDir) {
  if (!fs.existsSync(evalDir)) return [];
  return fs.readdirSync(evalDir)
    .filter(name => name.endsWith('.jsonl'))
    .sort()
    .map(name => path.join(evalDir, name));
}

function loadEvalDataset(evalDir, options = {}) {
  const feature = options.feature || 'all';
  const files = listEvalFiles(evalDir);
  const items = [];
  for (const file of files) {
    for (const item of loadJsonlFile(file)) {
      items.push({ ...item, evalFile: path.relative(evalDir, file) });
    }
  }
  return filterEvalItems(items, feature);
}

function validateEvalItem(item, location = {}) {
  const result = EvalItemSchema.safeParse(item);
  if (!result.success) {
    throw new EvalScoringError('invalid_eval_item', `${location.filePath || '<inline>'}:${location.line || '?'} failed eval item schema`, {
      filePath: location.filePath,
      line: location.line,
      errors: result.error.errors,
    });
  }
  return result.data;
}

function filterEvalItems(items, feature = 'all') {
  if (!feature || feature === 'all') return items.slice();
  if (!VALID_FEATURES.has(feature)) {
    throw new EvalScoringError('invalid_feature', `Unsupported eval feature "${feature}"`, { feature });
  }
  return items.filter(item => item.feature === feature);
}

function normalizeText(value) {
  return String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function words(value) {
  return normalizeText(value).split(/[^a-z0-9+#]+/i).filter(Boolean);
}

function normalizeSynonymValue(value, term) {
  if (value == null) return [];
  if (Array.isArray(value)) {
    return value.map(item => String(item || '').trim()).filter(Boolean);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : [];
  }
  if (typeof value === 'object') {
    const key = normalizeText(term);
    if (!key || !Object.prototype.hasOwnProperty.call(value, key)) return [];
    return normalizeSynonymValue(value[key], key);
  }
  return [];
}

function synonymsForTerm(term, source = TERM_SYNONYMS) {
  return normalizeSynonymValue(source, term);
}

function termVariants(term, synonymSource = TERM_SYNONYMS) {
  const raw = String(term || '');
  const variants = raw.split(/\s+or\s+|\/|\|/i).map(v => v.trim()).filter(Boolean);
  const synonyms = synonymsForTerm(raw, synonymSource);
  return [...new Set([...variants, ...synonyms])];
}

function termMatchDetail(output, term) {
  const text = normalizeText(output);
  const variants = termVariants(term);
  for (const variant of variants) {
    const normalized = normalizeText(variant);
    if (!normalized) continue;
    if (text.includes(normalized)) {
      return {
        matched: true,
        term,
        variant,
        matchType: normalizeText(term) === normalized ? 'literal' : 'semantic',
      };
    }
    const outputWords = new Set(words(text));
    const termWords = words(normalized).filter(w => w.length > 2);
    if (!termWords.length) continue;
    if (termWords.every(termWord => [...outputWords].some(outWord => outWord === termWord || outWord.startsWith(termWord) || termWord.startsWith(outWord)))) {
      return {
        matched: true,
        term,
        variant,
        matchType: normalizeText(term) === normalized ? 'word' : 'semantic_word',
      };
    }
  }
  return { matched: false, term, variant: null, matchType: 'missing' };
}

function termMatches(output, term) {
  return termMatchDetail(output, term).matched;
}

function findTerms(output, terms = []) {
  const found = [];
  const missing = [];
  const notes = [];
  for (const term of terms || []) {
    const detail = termMatchDetail(output, term);
    (detail.matched ? found : missing).push(term);
    notes.push(detail);
  }
  return { found, missing, notes };
}

function coverageScore(found, total) {
  if (!total) return 3;
  const ratio = found / total;
  if (ratio >= 0.9) return 3;
  if (ratio >= 0.6) return 2;
  if (ratio > 0) return 1;
  return 0;
}

function findBanned(output, terms = []) {
  const text = normalizeText(output);
  const all = [...DEFAULT_BANNED, ...(terms || [])];
  return [...new Set(all.filter(term => text.includes(normalizeText(term))))];
}

function normalizeEvalError(error = {}) {
  const code = String(error.code || '').trim();
  const message = String(error.message || error || '').trim();
  const status = error.status == null ? null : Number(error.status);
  const text = `${code} ${status || ''} ${message}`.toLowerCase();

  let failureCategory = 'EVAL_RUNNER_FAILURE';
  let retryable = false;

  if (/rate limit|tpm|tokens per minute|try again in|retry after|too many requests/.test(text)) {
    failureCategory = 'TOKEN_LIMIT_FAILURE';
    retryable = true;
  } else if (code === 'ai_timeout' || /timeout|timed out|did not respond before the timeout/.test(text)) {
    failureCategory = 'TIMEOUT';
    retryable = true;
  } else if (/failed to (generate|validate) json|json validation failed|json mode|json_object|response[_ -]?format(?: error)?|schema/.test(text)) {
    failureCategory = 'SCHEMA_FAILURE';
    retryable = true;
  } else if (/no_json_found|parse|invalid json/.test(text)) {
    failureCategory = 'PARSING_FAILURE';
    retryable = true;
  } else if (/ai_|provider|groq|ollama|network|unavailable|request failed|auth|model_missing|model missing|not reachable/.test(text)) {
    failureCategory = 'PROVIDER_ERROR';
    retryable = /unavailable|request failed|not reachable|5\d\d/.test(text);
  }

  return {
    failureCategory,
    providerErrorCode: code || null,
    providerStatus: Number.isFinite(status) ? status : null,
    retryable,
    excludedFromModelQuality: PROVIDER_RUNTIME_FAILURES.has(failureCategory)
      || failureCategory === 'SCHEMA_FAILURE'
      || failureCategory === 'PARSING_FAILURE',
  };
}

function isExcludedFromModelQuality(result = {}) {
  if (result.excludedFromModelQuality) return true;
  if (result.status === 'error') {
    const normalized = normalizeEvalError(result.error || {});
    return normalized.excludedFromModelQuality;
  }
  return false;
}

function parseExpectedJson(output, expectedOutputType) {
  const expected = /json/i.test(String(expectedOutputType || ''));
  if (!expected) return { expected: false, valid: true, value: null, error: null };
  const candidate = extractJson(output);
  if (!candidate) return { expected: true, valid: false, value: null, error: 'no_json_found' };
  try {
    return { expected: true, valid: true, value: JSON.parse(candidate), error: null };
  } catch (err) {
    return { expected: true, valid: false, value: null, error: err.message };
  }
}

function getSlidesOrScenes(value) {
  if (!value || typeof value !== 'object') return [];
  if (Array.isArray(value.scenes)) return value.scenes;
  if (Array.isArray(value.slides)) return value.slides;
  if (value.storyboard && Array.isArray(value.storyboard.scenes)) return value.storyboard.scenes;
  if (value.video && Array.isArray(value.video.slides)) return value.video.slides;
  return [];
}

function featureChecks(item, output, json) {
  const type = item.expectedOutputType;
  const text = String(output || '');
  const lower = normalizeText(text);
  const checks = [];
  const add = (name, passed, detail = '') => checks.push({ name, passed: !!passed, detail });

  if (item.feature === 'quiz') {
    const questions = json && json.value && Array.isArray(json.value.questions) ? json.value.questions : [];
    add('quiz_has_questions', questions.length > 0, `${questions.length} question(s)`);
    add('quiz_options_valid', questions.every(q => Array.isArray(q.options) && q.options.length === 4 && new Set(q.options.map(o => normalizeText(o))).size === 4), '4 unique options each');
    add('quiz_answer_index_valid', questions.every(q => Number.isInteger(q.correct_idx) && q.correct_idx >= 0 && q.correct_idx <= 3), 'correct_idx 0-3');
    add('quiz_explanations_present', questions.every(q => String(q.explanation || '').trim().length >= 12), 'non-empty explanations');
  } else if (item.feature === 'flashcards') {
    const cards = json && json.value && Array.isArray(json.value.cards) ? json.value.cards : [];
    add('flashcards_present', cards.length > 0, `${cards.length} card(s)`);
    add('flashcard_front_back_clear', cards.every(c => String(c.question || c.front || '').trim().length >= 10 && String(c.answer || c.back || '').trim().length >= 12), 'front/back minimum length');
  } else if (item.feature === 'notes') {
    const sections = json && json.value && Array.isArray(json.value.sections) ? json.value.sections : [];
    add('notes_sections_present', !/json/i.test(type) || sections.length >= 3, `${sections.length} section(s)`);
    add('notes_no_raw_chunk_ids', !/\[chunk:\d+\]|sourceChunkIds/i.test(text), 'no raw ids');
  } else if (item.feature === 'video') {
    const scenes = json && json.value ? getSlidesOrScenes(json.value) : [];
    add('video_scenes_present', !/json/i.test(type) || scenes.length >= 3, `${scenes.length} scene/slide(s)`);
    add('video_visual_specific', !/("definition"\s*,\s*"rule"\s*,\s*"example")|generic mindmap nodes/i.test(text), 'not generic-only visual nodes');
  } else if (item.feature === 'tutor') {
    add('tutor_markdown_answer', lower.length >= 80, `${text.length} chars`);
    add('tutor_followup_present', /check yourself|checkpoint|try answering|what would/i.test(lower), 'interactive follow-up');
  }

  return checks;
}

function codeQualityScore(output) {
  const text = String(output || '');
  if (/```[a-z]*\s+[\s\S]*?```/.test(text)) return 3;
  if (/\b(class|public|private|void|new|extends|interface)\b/.test(text)) return 2;
  if (/\bcode|method|field|node|pointer|loop\b/i.test(text)) return 1;
  return 0;
}

function diagramQualityScore(output) {
  const text = normalizeText(output);
  if (/mermaid|classdiagram|class_diagram|nodes|edges|head\s*->|uml|tree diagram|growth curve/.test(text)) return 3;
  if (/diagram|visual|mindmap|chart|head|root|front|rear|top pointer/.test(text)) return 2;
  if (/example|model|picture/.test(text)) return 1;
  return 0;
}

function lengthScore(output) {
  const len = String(output || '').trim().length;
  if (len >= 500) return 3;
  if (len >= 180) return 2;
  if (len >= 60) return 1;
  return 0;
}

function scoreOutput(item, output, options = {}) {
  const json = parseExpectedJson(output, item.expectedOutputType);
  const must = findTerms(output, item.expectedMustInclude);
  const should = findTerms(output, item.expectedShouldInclude);
  const banned = findBanned(output, item.mustNotInclude);
  const feature = featureChecks(item, output, json);
  const featureFailures = feature.filter(check => !check.passed);
  const scoringNotes = [
    ...must.notes.map(note => ({ scope: 'mustInclude', ...note })),
    ...should.notes.map(note => ({ scope: 'shouldInclude', ...note })),
  ];
  if (json.expected && !json.valid) scoringNotes.push({ scope: 'json', matched: false, matchType: 'schema', term: 'valid JSON', variant: json.error });
  for (const hit of banned) scoringNotes.push({ scope: 'banned', matched: true, matchType: 'policy', term: hit, variant: hit });

  const base = {
    correctness: coverageScore(must.found.length, item.expectedMustInclude.length),
    depth: coverageScore(should.found.length, item.expectedShouldInclude.length),
    clarity: lengthScore(output),
    codeQuality: codeQualityScore(output),
    diagramQuality: diagramQualityScore(output),
    grounding: banned.length ? 1 : coverageScore(must.found.length + should.found.length, item.expectedMustInclude.length + item.expectedShouldInclude.length),
    specificity: coverageScore(must.found.length + should.found.length, item.expectedMustInclude.length + item.expectedShouldInclude.length),
    noPlaceholders: banned.length ? 0 : 3,
    schemaValidity: json.valid && !featureFailures.length ? 3 : (json.valid ? 2 : 0),
    teachingClarity: lengthScore(output),
  };
  const rubricKeys = Object.keys(item.rubric || {}).length
    ? Object.keys(item.rubric)
    : ['correctness', 'depth', 'clarity', 'specificity', 'noPlaceholders'];
  const dimensions = {};
  for (const key of rubricKeys) dimensions[key] = base[key] == null ? 2 : base[key];
  const values = Object.values(dimensions);
  const averageScore = values.length ? Math.round((values.reduce((sum, n) => sum + n, 0) / values.length) * 1000) / 1000 : 0;
  const pass = averageScore >= (options.passThreshold || 2)
    && !banned.length
    && must.missing.length === 0
    && json.valid
    && featureFailures.length === 0;
  return {
    itemId: item.id,
    feature: item.feature,
    topic: item.topic,
    averageScore,
    pass,
    dimensions,
    checks: {
      mustInclude: { ...must, score: base.correctness },
      shouldInclude: { ...should, score: base.depth },
      banned: { hits: banned },
      json,
      feature,
    },
    scoringNotes,
  };
}

function summarizeResults(results = []) {
  const evaluated = results.filter(r => r.status !== 'dry_run');
  const scored = evaluated.filter(r => r.scoring);
  const contentScored = scored.filter(r => !isExcludedFromModelQuality(r));
  const errors = evaluated.filter(r => r.status === 'error');
  const averageScore = scored.length
    ? Math.round((scored.reduce((sum, r) => sum + r.scoring.averageScore, 0) / scored.length) * 1000) / 1000
    : null;
  const contentAverageScore = contentScored.length
    ? Math.round((contentScored.reduce((sum, r) => sum + r.scoring.averageScore, 0) / contentScored.length) * 1000) / 1000
    : null;
  const passRate = scored.length
    ? Math.round((scored.filter(r => r.scoring.pass).length / scored.length) * 1000) / 1000
    : null;
  const jsonItems = scored.filter(r => r.scoring.checks.json.expected);
  const placeholderFailures = scored.filter(r => (r.scoring.checks.banned.hits || []).length);
  const byTopic = new Map();
  for (const result of contentScored) {
    const key = result.item.topic;
    const arr = byTopic.get(key) || [];
    arr.push(result.scoring.averageScore);
    byTopic.set(key, arr);
  }
  const weakestTopics = [...byTopic.entries()]
    .map(([topic, scores]) => ({ topic, averageScore: Math.round((scores.reduce((s, n) => s + n, 0) / scores.length) * 1000) / 1000 }))
    .sort((a, b) => a.averageScore - b.averageScore)
    .slice(0, 5);
  return {
    itemCount: results.length,
    evaluatedCount: evaluated.length,
    averageScore,
    overallAverageScore: averageScore,
    contentAverageScore,
    contentEvaluatedCount: contentScored.length,
    passRate,
    jsonValidityRate: jsonItems.length ? Math.round((jsonItems.filter(r => r.scoring.checks.json.valid).length / jsonItems.length) * 1000) / 1000 : null,
    placeholderFailureRate: scored.length ? Math.round((placeholderFailures.length / scored.length) * 1000) / 1000 : null,
    averageResponseTimeMs: evaluated.length ? Math.round(evaluated.reduce((sum, r) => sum + (r.responseTimeMs || 0), 0) / evaluated.length) : null,
    errorRate: evaluated.length ? Math.round((errors.length / evaluated.length) * 1000) / 1000 : null,
    failureBreakdown: failureBreakdownByCategory(evaluated),
    failedItemIds: scored.filter(r => !r.scoring.pass).map(r => r.item.id),
    errorItemIds: errors.map(r => r.item && r.item.id).filter(Boolean),
    byFeature: summarizeGroups(results, r => r.item && r.item.feature),
    byTopic: summarizeGroups(results, r => r.item && r.item.topic),
    jsonValidityByFeature: jsonValidityByFeature(scored),
    fineTuningCandidates: fineTuningCandidates(scored),
    modelCapabilityCandidateIds: modelCapabilityCandidates(scored).map(r => r.item.id),
    weakestTopics,
  };
}

function failureCategoryForResult(result = {}) {
  if (result.failureCategory) return result.failureCategory;
  if (result.status === 'error') return normalizeEvalError(result.error || {}).failureCategory;
  if (result.scoring && (result.scoring.checks.banned.hits || []).length) return 'PROMPT_FAILURE';
  if (result.scoring && result.scoring.checks.json.expected && !result.scoring.checks.json.valid) return 'PARSING_FAILURE';
  if (result.scoring && (result.scoring.checks.mustInclude.missing || []).length) return 'PROMPT_FAILURE';
  return null;
}

function failureBreakdownByCategory(results = []) {
  const out = {};
  for (const result of results) {
    const category = failureCategoryForResult(result);
    if (!category) continue;
    out[category] = (out[category] || 0) + 1;
  }
  return out;
}

function summarizeGroups(results = [], keyFn) {
  const groups = new Map();
  for (const result of results) {
    const key = keyFn(result);
    if (!key) continue;
    const arr = groups.get(key) || [];
    arr.push(result);
    groups.set(key, arr);
  }
  const out = {};
  for (const [key, group] of [...groups.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0])))) {
    const evaluated = group.filter(r => r.status !== 'dry_run');
    const scored = evaluated.filter(r => r.scoring);
    const contentScored = scored.filter(r => !isExcludedFromModelQuality(r));
    const jsonItems = scored.filter(r => r.scoring.checks.json.expected);
    const placeholderFailures = scored.filter(r => (r.scoring.checks.banned.hits || []).length);
    const averageScore = scored.length ? Math.round((scored.reduce((sum, r) => sum + r.scoring.averageScore, 0) / scored.length) * 1000) / 1000 : null;
    out[key] = {
      itemCount: group.length,
      evaluatedCount: evaluated.length,
      averageScore,
      overallAverageScore: averageScore,
      contentAverageScore: contentScored.length ? Math.round((contentScored.reduce((sum, r) => sum + r.scoring.averageScore, 0) / contentScored.length) * 1000) / 1000 : null,
      contentEvaluatedCount: contentScored.length,
      passRate: scored.length ? Math.round((scored.filter(r => r.scoring.pass).length / scored.length) * 1000) / 1000 : null,
      jsonValidityRate: jsonItems.length ? Math.round((jsonItems.filter(r => r.scoring.checks.json.valid).length / jsonItems.length) * 1000) / 1000 : null,
      placeholderFailureRate: scored.length ? Math.round((placeholderFailures.length / scored.length) * 1000) / 1000 : null,
      errorRate: evaluated.length ? Math.round((evaluated.filter(r => r.status === 'error').length / evaluated.length) * 1000) / 1000 : null,
      failureBreakdown: failureBreakdownByCategory(evaluated),
      failedItemIds: scored.filter(r => !r.scoring.pass).map(r => r.item.id),
    };
  }
  return out;
}

function jsonValidityByFeature(scored = []) {
  const out = {};
  const groups = new Map();
  for (const result of scored) {
    if (!result.scoring || !result.scoring.checks.json.expected) continue;
    const key = result.item.feature;
    const arr = groups.get(key) || [];
    arr.push(result);
    groups.set(key, arr);
  }
  for (const [feature, group] of groups.entries()) {
    out[feature] = Math.round((group.filter(r => r.scoring.checks.json.valid).length / group.length) * 1000) / 1000;
  }
  return out;
}

function issueTypesForResult(result) {
  const issues = [];
  if (!result || !result.scoring) return ['no_scoring'];
  const category = failureCategoryForResult(result);
  if (category && result.status === 'error') issues.push(category.toLowerCase());
  if ((result.scoring.checks.banned.hits || []).length) issues.push('placeholder_or_internal_leak');
  if (!result.scoring.checks.json.valid) issues.push('schema_or_json_failure');
  if ((result.scoring.checks.mustInclude.missing || []).length) issues.push('missing_required_concepts');
  if ((result.scoring.dimensions.depth || 0) <= 1) issues.push('shallow_depth');
  if ((result.scoring.dimensions.codeQuality || 0) <= 1 && /code/i.test(String(result.item.taskType || result.item.expectedOutputType || ''))) issues.push('weak_code_explanation');
  if ((result.scoring.dimensions.diagramQuality || 0) <= 1 && /video|storyboard|diagram|notes/i.test(String(result.item.feature || result.item.taskType || ''))) issues.push('weak_visual_or_diagram');
  return issues.length ? issues : ['low_score'];
}

function modelCapabilityCandidates(scored = []) {
  return scored.filter(result => {
    if (!result.scoring || result.scoring.pass) return false;
    if (result.status === 'error' || isExcludedFromModelQuality(result)) return false;
    const category = failureCategoryForResult(result);
    return !category || MODEL_QUALITY_FAILURES.has(category);
  });
}

function fineTuningCandidates(scored = []) {
  return modelCapabilityCandidates(scored)
    .map(result => ({
      id: result.item.id,
      feature: result.item.feature,
      topic: result.item.topic,
      taskType: result.item.taskType,
      averageScore: result.scoring.averageScore,
      missingMustInclude: result.scoring.checks.mustInclude.missing,
      bannedHits: result.scoring.checks.banned.hits,
      issueTypes: issueTypesForResult(result),
      recommendation: (result.scoring.dimensions.depth || 0) <= 1
        ? 'candidate_for_reviewed_pilot_instruction_example'
        : 'fix_prompt_or_rag_before_training',
    }));
}

function fineTuningReadiness(results = [], dryRun = false) {
  if (dryRun) {
    return {
      needed: false,
      recommendation: 'Dry run only. Run a live provider evaluation before deciding on fine-tuning.',
      likelyIssues: ['dataset_validation_only'],
    };
  }
  const scored = results.filter(r => r.scoring);
  const contentScored = scored.filter(r => !isExcludedFromModelQuality(r));
  if (!contentScored.length) {
    return { needed: false, recommendation: 'No scored outputs were produced.', likelyIssues: ['no_outputs'] };
  }
  const failures = contentScored.filter(r => !r.scoring.pass);
  const providerFailures = results
    .filter(r => r.status === 'error' && isExcludedFromModelQuality(r))
    .map(r => failureCategoryForResult(r))
    .filter(Boolean);
  const placeholder = failures.filter(r => r.scoring.checks.banned.hits.length).length;
  const schema = failures.filter(r => !r.scoring.checks.json.valid).length;
  const missingMust = failures.filter(r => r.scoring.checks.mustInclude.missing.length).length;
  const lowDepth = failures.filter(r => (r.scoring.dimensions.depth || 0) <= 1).length;
  const likelyIssues = [];
  if (placeholder) likelyIssues.push('prompt_policy_or_sanitization');
  if (schema) likelyIssues.push('schema_or_json_instruction');
  if (missingMust) likelyIssues.push('rag_or_prompt_context_gap');
  if (lowDepth) likelyIssues.push('model_depth_or_teaching_pattern');
  if (providerFailures.length) likelyIssues.push(...providerFailures.map(category => category.toLowerCase()));
  const needed = failures.length / contentScored.length >= 0.35 && lowDepth >= Math.ceil(failures.length / 2);
  return {
    needed,
    recommendation: needed
      ? 'Collect failed cases as reviewed pilot examples before any LoRA/QLoRA experiment.'
      : 'Do not fine-tune yet. Address prompt, RAG, schema, or coverage failures first.',
    likelyIssues: likelyIssues.length ? [...new Set(likelyIssues)] : ['none_detected'],
  };
}

function buildReport({ provider = 'dry-run', model = 'none', feature = 'all', dryRun = false, results = [], startedAt, endedAt, preflight = null, filters = null } = {}) {
  return {
    createdAt: new Date().toISOString(),
    startedAt,
    endedAt,
    provider,
    model,
    feature,
    dryRun,
    evaluationPath: filters && filters.evaluationPath || 'prompt',
    filters,
    preflight,
    summary: summarizeResults(results),
    fineTuningReadiness: fineTuningReadiness(results, dryRun),
    results,
  };
}

function renderMarkdownReport(report) {
  const summary = report.summary || {};
  const readiness = report.fineTuningReadiness || {};
  const lines = [
    '# Noesis Evaluation Summary',
    '',
    `- Provider: ${report.provider}`,
    `- Model: ${report.model}`,
    `- Feature: ${report.feature}`,
    `- Dry run: ${report.dryRun ? 'yes' : 'no'}`,
    `- Items: ${summary.itemCount}`,
    `- Evaluated: ${summary.evaluatedCount}`,
    `- Overall average score: ${summary.overallAverageScore == null ? summary.averageScore == null ? 'n/a' : summary.averageScore : summary.overallAverageScore}`,
    `- Content average score: ${summary.contentAverageScore == null ? 'n/a' : summary.contentAverageScore}`,
    `- Pass rate: ${summary.passRate == null ? 'n/a' : summary.passRate}`,
    `- JSON validity rate: ${summary.jsonValidityRate == null ? 'n/a' : summary.jsonValidityRate}`,
    `- Placeholder/internal leak failure rate: ${summary.placeholderFailureRate == null ? 'n/a' : summary.placeholderFailureRate}`,
    `- Error rate: ${summary.errorRate == null ? 'n/a' : summary.errorRate}`,
    `- Average response time: ${summary.averageResponseTimeMs == null ? 'n/a' : `${summary.averageResponseTimeMs}ms`}`,
    '',
    ...(String(report.provider || '').toLowerCase() === 'groq'
      ? ['> Warning: Groq on-demand tiers may require 60–90 seconds between eval items.', '']
      : []),
    '## Fine-Tuning Readiness',
    '',
    `- Needed now: ${readiness.needed ? 'yes' : 'no'}`,
    `- Recommendation: ${readiness.recommendation || 'n/a'}`,
    `- Likely issues: ${(readiness.likelyIssues || []).join(', ') || 'n/a'}`,
    '',
    '## Weakest Topics',
    '',
  ];
  if (!summary.weakestTopics || !summary.weakestTopics.length) lines.push('- n/a');
  else for (const item of summary.weakestTopics) lines.push(`- ${item.topic}: ${item.averageScore}`);
  lines.push('', '## Feature Breakdown', '');
  const byFeature = summary.byFeature || {};
  const features = Object.keys(byFeature);
  if (!features.length) lines.push('- n/a');
  else for (const feature of features) {
    const row = byFeature[feature];
    lines.push(`- ${feature}: overall=${row.overallAverageScore == null ? row.averageScore == null ? 'n/a' : row.averageScore : row.overallAverageScore}, content=${row.contentAverageScore == null ? 'n/a' : row.contentAverageScore}, pass=${row.passRate == null ? 'n/a' : row.passRate}, errors=${row.errorRate == null ? 'n/a' : row.errorRate}`);
  }
  lines.push('', '## Failure Breakdown', '');
  const breakdown = summary.failureBreakdown || {};
  const categories = Object.keys(breakdown);
  if (!categories.length) lines.push('- n/a');
  else for (const category of categories.sort()) lines.push(`- ${category}: ${breakdown[category]}`);
  lines.push('', '## Future Training Candidates', '');
  const candidates = summary.fineTuningCandidates || [];
  if (!candidates.length) lines.push('- n/a');
  else for (const item of candidates.slice(0, 10)) {
    lines.push(`- ${item.id} (${item.feature}/${item.topic}): ${item.issueTypes.join(', ')}`);
  }
  return `${lines.join('\n')}\n`;
}

module.exports = {
  EvalScoringError,
  EvalItemSchema,
  parseJsonlText,
  loadJsonlFile,
  listEvalFiles,
  loadEvalDataset,
  validateEvalItem,
  filterEvalItems,
  normalizeEvalError,
  isExcludedFromModelQuality,
  scoreOutput,
  buildReport,
  renderMarkdownReport,
  fineTuningReadiness,
  _internals: {
    normalizeSynonymValue,
    synonymsForTerm,
    termVariants,
    termMatches,
    findTerms,
    findBanned,
    termMatchDetail,
    failureCategoryForResult,
    failureBreakdownByCategory,
    parseExpectedJson,
    featureChecks,
    summarizeResults,
    summarizeGroups,
    jsonValidityByFeature,
    fineTuningCandidates,
    modelCapabilityCandidates,
    issueTypesForResult,
  },
};
