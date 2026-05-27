'use strict';

const fs = require('fs');
const path = require('path');
const { expandQuery } = require('../utils/concept-synonyms');

const KNOWLEDGE_ROOT = path.join(__dirname, '..', 'knowledge');
const PROMPT_MAX_CHARS = 20000;

let cache = null;

function normalizeKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function unique(values) {
  const seen = new Set();
  const out = [];
  for (const value of values || []) {
    const text = String(value || '').trim();
    const key = normalizeKey(text);
    if (!text || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out;
}

function listKnowledgeFiles(root = KNOWLEDGE_ROOT) {
  const out = [];
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (
        entry.isFile() &&
        entry.name.endsWith('.json') &&
        entry.name !== 'schema.json'
      ) {
        out.push(full);
      }
    }
  };
  walk(root);
  return out.sort();
}

function enrichTopic(topic, file) {
  const topicName = String(topic.topic || topic.id || path.basename(file, '.json')).trim();
  const id = topic.id || normalizeKey(topicName).replace(/-/g, '_');
  const aliases = unique([...(topic.aliases || []), topicName, id.replace(/_/g, ' ')]);
  return {
    ...topic,
    id,
    topic: topicName,
    aliases,
    _file: file,
    _relativeFile: path.relative(KNOWLEDGE_ROOT, file).replace(/\\/g, '/'),
  };
}

function loadTopics(options = {}) {
  if (cache && !options.refresh) return cache;
  const topics = [];
  const errors = [];
  for (const file of listKnowledgeFiles()) {
    try {
      const json = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (json && typeof json === 'object' && !Array.isArray(json)) {
        topics.push(enrichTopic(json, file));
      }
    } catch (err) {
      errors.push({ file, message: err.message });
    }
  }
  cache = { topics, errors, loadedAt: new Date().toISOString() };
  return cache;
}

function clearCache() {
  cache = null;
}

function topicTerms(topic) {
  return unique([
    topic.id,
    topic.topic,
    ...(topic.aliases || []),
  ]);
}

function termMatchesQuery(term, query) {
  const termKey = normalizeKey(term);
  const queryKey = normalizeKey(query);
  if (!termKey || !queryKey) return false;
  return termKey === queryKey || queryKey.includes(termKey) || termKey.includes(queryKey);
}

function topicScore(topic, query) {
  const qKey = normalizeKey(query);
  const qText = normalizeText(query);
  if (!qKey) return 0;

  let best = 0;
  for (const term of topicTerms(topic)) {
    const key = normalizeKey(term);
    const text = normalizeText(term);
    if (!key) continue;
    if (key === qKey) best = Math.max(best, 100);
    else if (key.includes(qKey) || qKey.includes(key)) best = Math.max(best, 80);
    else {
      const queryTokens = qText.split(' ').filter(Boolean);
      const termTokens = text.split(' ').filter(Boolean);
      const overlap = queryTokens.filter(token => termTokens.includes(token)).length;
      if (overlap) best = Math.max(best, 20 + overlap * 10);
    }
  }
  return best;
}

function matchTopic(query, options = {}) {
  const includeReason = options.includeReason !== false;
  const minScore = Number.isFinite(options.minScore) ? options.minScore : 80;
  const rawQuery = String(query || '').trim();
  if (!rawQuery) return includeReason ? { topic: null, score: 0, reason: 'empty_query', matched: '' } : null;

  const topics = listTopics(options);
  const expanded = expandQuery(rawQuery);
  const queryVariants = unique([rawQuery, expanded]).filter(Boolean);

  const scoreForTopic = (topic) => {
    const idTerms = [topic.id];
    const topicTermsOnly = [topic.topic];
    const aliasTerms = topic.aliases || [];
    for (const variant of queryVariants) {
      if (idTerms.some(term => normalizeKey(term) === normalizeKey(variant))) {
        return { topic, score: 100, reason: 'exact_id', matched: topic.id };
      }
      if (topicTermsOnly.some(term => normalizeKey(term) === normalizeKey(variant))) {
        return { topic, score: 100, reason: 'exact_topic', matched: topic.topic };
      }
      const alias = aliasTerms.find(term => normalizeKey(term) === normalizeKey(variant));
      if (alias) return { topic, score: 100, reason: 'exact_alias', matched: alias };
    }
    for (const variant of queryVariants) {
      const alias = aliasTerms.find(term => termMatchesQuery(term, variant));
      if (alias) return { topic, score: 90, reason: 'alias_contains_query', matched: alias };
      if (topicTermsOnly.some(term => termMatchesQuery(term, variant))) {
        return { topic, score: 88, reason: 'topic_contains_query', matched: topic.topic };
      }
    }
    const fuzzy = Math.max(...queryVariants.map(variant => topicScore(topic, variant)), 0);
    return { topic, score: fuzzy, reason: fuzzy >= minScore ? 'fuzzy_topic_match' : 'below_threshold', matched: '' };
  };

  const best = topics
    .map(scoreForTopic)
    .sort((a, b) => b.score - a.score || a.topic.topic.localeCompare(b.topic.topic))[0] || { topic: null, score: 0, reason: 'no_topics', matched: '' };

  if (!best.topic || best.score < minScore) {
    return includeReason ? { topic: null, score: best.score || 0, reason: best.reason || 'no_match', matched: best.matched || '' } : null;
  }
  return includeReason ? best : best.topic;
}

function listTopics(options = {}) {
  const { topics } = loadTopics(options);
  return topics.slice();
}

function getTopic(topicOrAlias, options = {}) {
  if (topicOrAlias && typeof topicOrAlias === 'object') return topicOrAlias;
  const query = String(topicOrAlias || '').trim();
  if (!query) return null;
  const matches = searchTopics(query, { ...options, limit: 1 });
  return matches.length ? matches[0] : null;
}

function searchTopics(query, options = {}) {
  const limit = Number.isInteger(options.limit) ? options.limit : 10;
  return listTopics(options)
    .map(topic => ({ topic, score: topicScore(topic, query) }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score || a.topic.topic.localeCompare(b.topic.topic))
    .slice(0, limit)
    .map(item => item.topic);
}

function getRelatedTopics(topicOrAlias) {
  const topic = getTopic(topicOrAlias);
  if (!topic) return { prerequisites: [], nextTopics: [] };
  return {
    prerequisites: unique(topic.prerequisites || []).map(label => ({
      label,
      topic: getTopic(label),
    })),
    nextTopics: unique(topic.nextTopics || []).map(label => ({
      label,
      topic: getTopic(label),
    })),
  };
}

function getVisualTemplate(topicOrAlias) {
  const topic = getTopic(topicOrAlias);
  if (!topic) return null;
  const templates = Array.isArray(topic.visualTemplates) ? topic.visualTemplates : [];
  return templates.length ? templates[0] : null;
}

function getCodeExample(topicOrAlias, language) {
  const topic = getTopic(topicOrAlias);
  if (!topic || !Array.isArray(topic.codeExamples)) return null;
  if (!language) return topic.codeExamples[0] || null;
  const wanted = normalizeKey(language);
  return topic.codeExamples.find(example => normalizeKey(example.language) === wanted) || topic.codeExamples[0] || null;
}

function getCommonMistakes(topicOrAlias) {
  const topic = getTopic(topicOrAlias);
  if (!topic || !Array.isArray(topic.commonMistakes)) return [];
  return topic.commonMistakes;
}

function truncateText(value, max) {
  const text = String(value || '');
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 3)).trim()}...`;
}

function compactPromptPayload(payload) {
  return {
    ...payload,
    deepExplanation: truncateText(payload.deepExplanation, 1200),
    whyItMatters: truncateText(payload.whyItMatters, 500),
    analogy: truncateText(payload.analogy, 500),
    codeExamples: (payload.codeExamples || []).slice(0, 2).map(example => ({
      ...example,
      code: truncateText(example.code || example.content, 2500),
      walkthrough: (example.walkthrough || example.explanation || []).slice(0, 5),
    })),
    diagrams: (payload.diagrams || []).slice(0, 2),
    commonMistakes: (payload.commonMistakes || []).slice(0, 4),
    bestPractices: (payload.bestPractices || []).slice(0, 6),
    miniQuiz: (payload.miniQuiz || []).slice(0, 3),
    flashcards: (payload.flashcards || []).slice(0, 4),
    _truncatedForPrompt: true,
  };
}

function stringifyPromptPayload(payload) {
  const full = JSON.stringify(payload, null, 2);
  if (full.length <= PROMPT_MAX_CHARS) return full;
  const compact = JSON.stringify(compactPromptPayload(payload), null, 2);
  if (compact.length <= PROMPT_MAX_CHARS) return compact;
  return JSON.stringify({
    ...compactPromptPayload(payload),
    codeExamples: (payload.codeExamples || []).slice(0, 1).map(example => ({
      language: example.language || 'text',
      title: example.title || 'Code example',
      code: truncateText(example.code || example.content, 1200),
      walkthrough: (example.walkthrough || example.explanation || []).slice(0, 3),
    })),
    diagrams: (payload.diagrams || []).slice(0, 1),
  }, null, 2);
}

function topicToPromptContext(topicOrAlias) {
  const topic = getTopic(topicOrAlias);
  if (!topic) return '(No curated local topic file matched. Use standard CS knowledge carefully.)';
  const payload = {
    id: topic.id,
    domain: topic.domain || '',
    topic: topic.topic,
    aliases: topic.aliases || [],
    difficulty: topic.difficulty || '',
    prerequisites: topic.prerequisites || [],
    nextTopics: topic.nextTopics || [],
    definition: topic.definition || '',
    deepExplanation: topic.deepExplanation || '',
    whyItMatters: topic.whyItMatters || '',
    analogy: topic.analogy || '',
    codeExamples: topic.codeExamples || [],
    diagrams: topic.diagrams || [],
    commonMistakes: topic.commonMistakes || [],
    bestPractices: topic.bestPractices || [],
    complexity: topic.complexity || {},
    miniQuiz: topic.miniQuiz || topic.practiceQuestions || [],
    flashcards: topic.flashcards || [],
    visualTemplates: topic.visualTemplates || [],
  };
  return stringifyPromptPayload(payload);
}

module.exports = {
  KNOWLEDGE_ROOT,
  normalizeKey,
  listKnowledgeFiles,
  listTopics,
  loadTopics,
  clearCache,
  matchTopic,
  getTopic,
  searchTopics,
  getRelatedTopics,
  getVisualTemplate,
  getCodeExample,
  getCommonMistakes,
  topicToPromptContext,
};
