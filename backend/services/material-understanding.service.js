'use strict';

const { getDb } = require('../config/db');
const topicResolver = require('./topic-resolver.service');

const NORMAL_CONFIDENCE_THRESHOLD = 0.65;
const MIN_KEY_CONCEPTS = 3;
const MIN_SOURCE_EVIDENCE = 2;

const DOMAIN_TOPICS = [
  {
    domain: 'Object-Oriented Programming',
    topics: [
      {
        normalizedTopic: 'Classes and Objects',
        aliases: ['class', 'classes', 'object', 'objects', 'classes and objects', 'instance', 'constructor'],
        keyConcepts: ['class', 'object', 'instance', 'state', 'behavior', 'field', 'method', 'constructor', 'blueprint'],
      },
      {
        normalizedTopic: 'Encapsulation',
        aliases: ['encapsulation', 'information hiding', 'data hiding', 'private fields', 'getters', 'setters'],
        keyConcepts: ['class', 'object', 'state', 'behavior', 'private fields', 'public methods', 'getter', 'setter', 'access modifier', 'invariant', 'validation'],
      },
      {
        normalizedTopic: 'Inheritance',
        aliases: ['inheritance', 'extends', 'superclass', 'subclass', 'parent class', 'child class'],
        keyConcepts: ['superclass', 'subclass', 'extends', 'is-a relationship', 'method overriding', 'base class', 'derived class'],
      },
      {
        normalizedTopic: 'Polymorphism',
        aliases: ['polymorphism', 'dynamic dispatch', 'late binding', 'runtime dispatch'],
        keyConcepts: ['superclass reference', 'subclass object', 'overriding', 'dynamic dispatch', 'runtime binding', 'interface', 'abstract class'],
      },
      {
        normalizedTopic: 'Abstraction',
        aliases: ['abstraction', 'abstract class', 'abstract method', 'implementation details', 'hide complexity'],
        keyConcepts: ['abstract class', 'abstract method', 'interface', 'contract', 'implementation details', 'hide complexity'],
      },
      {
        normalizedTopic: 'Interfaces',
        aliases: ['interface', 'interfaces', 'implements', 'contract'],
        keyConcepts: ['interface', 'implements', 'contract', 'method signature', 'implementation', 'polymorphism'],
      },
    ],
  },
  {
    domain: 'Data Structures',
    topics: [
      {
        normalizedTopic: 'Linked List',
        aliases: ['linked list', 'singly linked list', 'doubly linked list', 'nodes', 'next pointer'],
        keyConcepts: ['node', 'head', 'next pointer', 'tail', 'traversal', 'insert', 'delete', 'null reference'],
      },
      {
        normalizedTopic: 'Stack',
        aliases: ['stack', 'lifo'],
        keyConcepts: ['LIFO', 'push', 'pop', 'peek', 'top', 'underflow', 'overflow'],
      },
      {
        normalizedTopic: 'Queue',
        aliases: ['queue', 'fifo'],
        keyConcepts: ['FIFO', 'enqueue', 'dequeue', 'front', 'rear', 'underflow'],
      },
      {
        normalizedTopic: 'Hash Table',
        aliases: ['hash table', 'hash map', 'hashmap', 'hash function', 'bucket', 'collision'],
        keyConcepts: ['hash function', 'bucket', 'key', 'value', 'collision', 'chaining', 'probing', 'load factor', 'rehashing'],
      },
      {
        normalizedTopic: 'Binary Search Tree',
        aliases: ['binary search tree', 'bst', 'tree', 'trees'],
        keyConcepts: ['root', 'node', 'left subtree', 'right subtree', 'leaf', 'insert', 'search', 'in-order traversal'],
      },
      {
        normalizedTopic: 'Heap',
        aliases: ['heap', 'min heap', 'max heap', 'priority queue'],
        keyConcepts: ['root', 'parent', 'child', 'heap property', 'min heap', 'max heap', 'insert', 'extract'],
      },
      {
        normalizedTopic: 'Graph',
        aliases: ['graph', 'graphs', 'vertex', 'edge', 'adjacency list', 'adjacency matrix'],
        keyConcepts: ['vertex', 'edge', 'neighbor', 'path', 'adjacency list', 'adjacency matrix', 'directed graph', 'weighted graph'],
      },
    ],
  },
  {
    domain: 'Algorithms',
    topics: [
      {
        normalizedTopic: 'Big-O Complexity',
        aliases: ['big-o', 'big o', 'time complexity', 'space complexity', 'asymptotic complexity'],
        keyConcepts: ['O(1)', 'O(log n)', 'O(n)', 'O(n log n)', 'O(n^2)', 'time complexity', 'space complexity', 'input size'],
      },
      {
        normalizedTopic: 'Sorting Algorithms',
        aliases: ['sorting', 'sort', 'selection sort', 'insertion sort', 'merge sort', 'quick sort', 'quicksort'],
        keyConcepts: ['comparison', 'swap', 'partition', 'merge', 'stable sort', 'in-place sort', 'time complexity'],
      },
      {
        normalizedTopic: 'Searching Algorithms',
        aliases: ['searching', 'search', 'linear search', 'binary search'],
        keyConcepts: ['target', 'linear search', 'binary search', 'middle index', 'sorted array', 'comparison'],
      },
      {
        normalizedTopic: 'Recursion',
        aliases: ['recursion', 'recursive', 'base case', 'recursive case'],
        keyConcepts: ['base case', 'recursive case', 'call stack', 'subproblem', 'return value'],
      },
      {
        normalizedTopic: 'Dynamic Programming',
        aliases: ['dynamic programming', 'dp', 'memoization', 'tabulation'],
        keyConcepts: ['overlapping subproblems', 'optimal substructure', 'memoization', 'tabulation', 'state transition'],
      },
      {
        normalizedTopic: 'Greedy Algorithms',
        aliases: ['greedy', 'greedy algorithm', 'local optimum', 'greedy choice'],
        keyConcepts: ['greedy choice', 'local optimum', 'global optimum', 'exchange argument', 'feasible choice'],
      },
    ],
  },
];

const TOPIC_LOOKUP = new Map();
for (const family of DOMAIN_TOPICS) {
  for (const topic of family.topics) {
    TOPIC_LOOKUP.set(topic.normalizedTopic.toLowerCase(), { ...topic, domain: family.domain });
    for (const alias of topic.aliases || []) {
      TOPIC_LOOKUP.set(String(alias).toLowerCase(), { ...topic, domain: family.domain });
    }
  }
}

function normalizeTopic(value) {
  return topicResolver._internals.normalizeTopic(value);
}

function comparable(value) {
  return normalizeTopic(value).toLowerCase();
}

function phraseRegex(phrase) {
  const escaped = String(phrase || '').trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i');
}

function containsPhrase(text, phrase) {
  if (!phrase) return false;
  return phraseRegex(String(phrase).toLowerCase()).test(String(text || '').toLowerCase());
}

function taxonomyForTopic(value) {
  const exact = topicResolver.exactKnownTopic(value) || normalizeTopic(value);
  const key = comparable(exact);
  if (!key || topicResolver.isGenericTopic(key)) return null;
  if (TOPIC_LOOKUP.has(key)) return TOPIC_LOOKUP.get(key);
  for (const [alias, topic] of TOPIC_LOOKUP.entries()) {
    if (key.includes(alias) || alias.includes(key)) return topic;
  }
  return null;
}

function chunkText(chunk) {
  return [
    chunk && chunk.chapter_title,
    chunk && chunk.heading,
    chunk && chunk.slide_title,
    chunk && chunk.section_title,
    chunk && chunk.text,
  ].filter(Boolean).join(' ');
}

function fullText(chunks) {
  return (chunks || []).map(chunkText).join('\n').toLowerCase();
}

function detectLanguage(chunks) {
  const text = fullText(chunks);
  if (/\bpublic\s+class\b|\bprivate\s+(?:int|double|float|string|boolean|char|long)\b|\bSystem\.out\b|\bnew\s+[A-Z][A-Za-z0-9_]*\s*\(/.test(text)) return 'Java';
  if (/\bdef\s+\w+\s*\(|\bself\b|:\s*\n\s+/.test(text)) return 'Python';
  if (/\b#include\b|\bstd::|\bcout\b|\btemplate\s*</.test(text)) return 'C++';
  if (/\bfunction\s+\w+\s*\(|\bconst\s+\w+\s*=|=>/.test(text)) return 'JavaScript';
  return null;
}

function displayTopic(normalizedTopic, domain, chunks) {
  const language = detectLanguage(chunks);
  if (language === 'Java' && domain === 'Object-Oriented Programming') return `${normalizedTopic} in Java`;
  return normalizedTopic || 'Unresolved CS Topic';
}

function scoreChunkForTopic(chunk, topicDef) {
  const text = chunkText(chunk).toLowerCase();
  let score = 0;
  for (const alias of [topicDef.normalizedTopic, ...(topicDef.aliases || [])]) {
    if (containsPhrase(text, alias)) score += alias === topicDef.normalizedTopic ? 5 : 4;
  }
  for (const concept of topicDef.keyConcepts || []) {
    if (containsPhrase(text, concept)) score += 1.5;
  }
  if (chunk && chunk.score) score += Math.max(0, Math.min(1, Number(chunk.score))) * 2;
  return Math.round(score * 100) / 100;
}

function sentenceQuote(text, terms, max = 260) {
  const cleaned = String(text || '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';
  const sentences = cleaned.split(/(?<=[.!?])\s+|\n+/).map(s => s.trim()).filter(Boolean);
  const lowerTerms = (terms || []).map(t => String(t).toLowerCase()).filter(Boolean);
  const match = sentences.find(sentence => lowerTerms.some(term => containsPhrase(sentence, term)));
  const selected = match || sentences[0] || cleaned;
  return selected.length <= max ? selected : `${selected.slice(0, max - 1).trim()}...`;
}

function detectKeyConcepts(chunks, topicDef) {
  if (!topicDef) return [];
  const text = fullText(chunks);
  const concepts = [];
  for (const concept of topicDef.keyConcepts || []) {
    if (containsPhrase(text, concept)) concepts.push(concept);
  }
  return [...new Set(concepts)].slice(0, 12);
}

function buildSourceEvidence(chunks, topicDef) {
  if (!topicDef) return [];
  const terms = [topicDef.normalizedTopic, ...(topicDef.aliases || []), ...(topicDef.keyConcepts || [])];
  return (chunks || [])
    .map(chunk => ({ chunk, score: scoreChunkForTopic(chunk, topicDef) }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score || Number(a.chunk.idx || 0) - Number(b.chunk.idx || 0))
    .slice(0, 6)
    .map(item => ({
      chunkId: item.chunk.id || null,
      chunkIndex: item.chunk.idx,
      quote: sentenceQuote(item.chunk.text, terms),
      score: item.score,
      chapterTitle: item.chunk.chapter_title || '',
      heading: item.chunk.heading || '',
      slideNumber: item.chunk.slide_number || null,
      slideTitle: item.chunk.slide_title || '',
      sourcePage: item.chunk.source_page || null,
    }));
}

function normalizeAlternatives(alternatives) {
  return (alternatives || []).slice(0, 5).map(item => {
    const topicDef = taxonomyForTopic(item.topic);
    return {
      topic: topicDef ? topicDef.normalizedTopic : normalizeTopic(item.topic),
      domain: topicDef ? topicDef.domain : null,
      score: item.score,
      evidence: item.evidence || [],
    };
  });
}

function readinessFor(understanding) {
  const issues = [];
  if (!understanding.normalizedTopic || topicResolver.isGenericTopic(understanding.normalizedTopic)) issues.push('generic_or_missing_topic');
  if (!understanding.domain) issues.push('unsupported_domain');
  if (Number(understanding.confidence || 0) < NORMAL_CONFIDENCE_THRESHOLD) issues.push('low_confidence');
  if ((understanding.keyConcepts || []).length < MIN_KEY_CONCEPTS) issues.push('insufficient_key_concepts');
  if ((understanding.sourceEvidence || []).length < MIN_SOURCE_EVIDENCE) issues.push('insufficient_source_evidence');
  return {
    status: issues.length ? 'needs_review' : 'ready',
    readyForGeneration: issues.length === 0,
    issues,
  };
}

function reasonFor(understanding) {
  if (!understanding.normalizedTopic) return 'No specific supported CS topic could be identified from the uploaded material.';
  const concepts = (understanding.keyConcepts || []).slice(0, 6).join(', ');
  const evidenceCount = (understanding.sourceEvidence || []).length;
  const base = `The material points to ${understanding.normalizedTopic}${understanding.domain ? ` in ${understanding.domain}` : ''}`;
  const conceptPart = concepts ? ` through concepts such as ${concepts}` : '';
  const evidencePart = evidenceCount ? ` across ${evidenceCount} source chunk${evidenceCount === 1 ? '' : 's'}` : '';
  const issuePart = understanding.issues && understanding.issues.length ? ` Needs review because: ${understanding.issues.join(', ')}.` : '.';
  return `${base}${conceptPart}${evidencePart}${issuePart}`;
}

function understandFromChunks(chunks, opts = {}) {
  const ranked = topicResolver.rankTopicsFromChunks(chunks || []);
  const resolvedDef = taxonomyForTopic(opts.resolvedTopic);
  const rankedDef = taxonomyForTopic(ranked.topic);
  const hintDef = taxonomyForTopic(opts.hint);
  const topicDef = resolvedDef || rankedDef || hintDef;
  const normalizedTopic = topicDef ? topicDef.normalizedTopic : normalizeTopic(opts.resolvedTopic || ranked.topic || opts.hint || '');
  const domain = topicDef ? topicDef.domain : null;
  const sourceEvidence = buildSourceEvidence(chunks || [], topicDef);
  const keyConcepts = detectKeyConcepts(chunks || [], topicDef);
  const rankMatches = topicDef && rankedDef && rankedDef.normalizedTopic === topicDef.normalizedTopic;
  const resolverConfidence = Number(opts.resolverConfidence);
  const confidence = Number.isFinite(resolverConfidence) ? Math.max(0, Math.min(1, resolverConfidence)) : 0;
  const fallbackConfidence = rankMatches ? ranked.confidence : 0;
  const finalConfidence = Math.round(Math.max(confidence || 0, fallbackConfidence || 0) * 1000) / 1000;
  const base = {
    domain,
    topic: displayTopic(normalizedTopic, domain, chunks || []),
    normalizedTopic,
    confidence: finalConfidence,
    keyConcepts,
    sourceEvidence,
    reason: '',
    alternatives: normalizeAlternatives(opts.alternatives || ranked.candidates || []),
    source: opts.source || null,
  };
  const readiness = readinessFor(base);
  const understanding = { ...base, ...readiness };
  return { ...understanding, reason: reasonFor(understanding) };
}

function fallbackChunks(materialId) {
  const db = getDb();
  return db.prepare(`SELECT id, idx, text, chapter_id, source_page, chapter_title, heading,
      slide_number, slide_title, section_title, has_code, keywords_json
    FROM chunks WHERE material_id=? ORDER BY idx LIMIT 32`).all(materialId);
}

async function resolveMaterialUnderstanding(opts = {}) {
  const topicInfo = await topicResolver.resolveTopic({
    materialId: opts.materialId,
    hint: opts.hint,
    feature: opts.feature || 'video',
    minConfidence: opts.minConfidence == null ? 0.22 : opts.minConfidence,
  });
  const chunks = topicInfo.chunks && topicInfo.chunks.length ? topicInfo.chunks : fallbackChunks(opts.materialId);
  const understanding = understandFromChunks(chunks, {
    hint: opts.hint,
    resolvedTopic: topicInfo.topic,
    resolverConfidence: topicInfo.confidence,
    source: topicInfo.source || topicInfo.topic_source,
    alternatives: topicInfo.alternatives,
  });
  return {
    ...understanding,
    resolver: {
      topic: topicInfo.topic || null,
      confidence: topicInfo.confidence || 0,
      source: topicInfo.source || topicInfo.topic_source || null,
      rejectedHint: topicInfo.rejectedHint || null,
    },
  };
}

module.exports = {
  DOMAIN_TOPICS,
  NORMAL_CONFIDENCE_THRESHOLD,
  MIN_KEY_CONCEPTS,
  MIN_SOURCE_EVIDENCE,
  resolveMaterialUnderstanding,
  understandFromChunks,
  _internals: {
    buildSourceEvidence,
    detectKeyConcepts,
    detectLanguage,
    readinessFor,
    taxonomyForTopic,
  },
};
