'use strict';

const path = require('path');
const { getDb } = require('../config/db');
const { retrieveWithMeta } = require('./rag.service');
const ai = require('./ai.service');
const prompts = require('../utils/prompts');
const { parseJsonSafe } = require('../utils/jsonSafe');
const log = require('../utils/logger');

const GENERIC_TOPIC_RE = /^(?:document|file|material|upload|uploaded material|source|lesson|chapter\s*\d+|ch(?:apter)?\.?\s*\d+|module\s*\d+|unit\s*\d+|\d+)$/i;
const FILE_EXT_RE = /\.(?:pdf|pptx?|docx?|txt|md|html?|mp4|mov)$/i;

const KNOWN_CONCEPTS = [
  {
    topic: 'Polymorphism',
    aliases: ['polymorphism', 'dynamic dispatch', 'late binding'],
    terms: [
      ['polymorphism', 8],
      ['polymorphic', 8],
      ['polymorphic behavior', 9],
      ['polymorphic payroll', 8],
      ['virtual functions', 4],
      ['dynamic dispatch', 7],
      ['runtime behavior', 5],
      ['same method call', 5],
      ['superclass reference', 6],
      ['subclass object', 6],
      ['programming in the general', 5],
      ['overriding vs overloading', 5],
      ['method overriding', 3],
      ['overloading', 2],
      ['abstract class', 2],
      ['interface', 2],
      ['final methods', 2],
      ['static methods', 2],
    ],
  },
  {
    topic: 'Inheritance',
    aliases: ['inheritance', 'extends', 'superclass', 'subclass'],
    terms: [
      ['inheritance', 8],
      ['extends', 3],
      ['superclass', 1.5],
      ['subclass', 1.5],
      ['parent class', 5],
      ['child class', 5],
      ['is-a relationship', 4],
      ['base class', 3],
      ['derived class', 3],
      ['method overriding', 2],
    ],
  },
  {
    topic: 'Encapsulation',
    aliases: ['encapsulation', 'information hiding', 'getters', 'setters'],
    terms: [
      ['encapsulation', 8],
      ['information hiding', 6],
      ['private fields', 5],
      ['private variables', 4],
      ['getter', 4],
      ['setter', 4],
      ['access modifier', 4],
      ['public methods', 3],
      ['protect data', 3],
    ],
  },
  {
    topic: 'Abstraction',
    aliases: ['abstraction', 'abstract class', 'interface'],
    terms: [
      ['abstraction', 8],
      ['abstract class', 5],
      ['abstract method', 5],
      ['interface', 5],
      ['implementation details', 4],
      ['hide complexity', 3],
      ['contract', 3],
    ],
  },
  {
    topic: 'Linked List',
    aliases: ['linked list', 'singly linked list', 'nodes', 'next pointer'],
    terms: [
      ['linked list', 8],
      ['singly linked list', 8],
      ['node', 4],
      ['head pointer', 6],
      ['head', 3],
      ['next reference', 6],
      ['next pointer', 6],
      ['traversal', 4],
      ['insert', 3],
      ['delete', 3],
      ['null', 2],
    ],
  },
  {
    topic: 'Stack',
    aliases: ['stack', 'lifo'],
    terms: [
      ['stack', 8],
      ['lifo', 7],
      ['push', 5],
      ['pop', 5],
      ['peek', 4],
      ['underflow', 5],
      ['top of stack', 4],
    ],
  },
  {
    topic: 'Queue',
    aliases: ['queue', 'fifo'],
    terms: [
      ['queue', 8],
      ['fifo', 7],
      ['enqueue', 5],
      ['dequeue', 5],
      ['front', 3],
      ['rear', 3],
      ['underflow', 2],
    ],
  },
  {
    topic: 'Binary Search Tree',
    aliases: ['binary search tree', 'bst'],
    terms: [
      ['binary search tree', 9],
      ['bst', 7],
      ['left subtree', 5],
      ['right subtree', 5],
      ['in-order traversal', 5],
      ['inorder traversal', 5],
      ['search tree', 4],
      ['insert', 2],
      ['delete', 2],
    ],
  },
  {
    topic: 'Big-O Complexity',
    aliases: ['big-o', 'big o', 'time complexity', 'space complexity'],
    terms: [
      ['big-o', 8],
      ['big o', 8],
      ['time complexity', 7],
      ['space complexity', 6],
      ['o(1)', 4],
      ['o(log n)', 4],
      ['o(n)', 4],
      ['o(n log n)', 4],
      ['o(n^2)', 4],
      ['asymptotic', 4],
    ],
  },
];

function normalizeTopic(value) {
  return String(value || '')
    .replace(/\\n/g, ' ')
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function comparable(value) {
  return normalizeTopic(value).toLowerCase();
}

function stripFileName(value) {
  const raw = String(value || '').trim();
  const base = path.basename(raw).replace(FILE_EXT_RE, '');
  return normalizeTopic(base);
}

function isGenericTopic(value, material = null) {
  const text = normalizeTopic(value);
  if (!text) return true;
  if (GENERIC_TOPIC_RE.test(text)) return true;
  const noExt = stripFileName(text);
  if (GENERIC_TOPIC_RE.test(noExt)) return true;
  if (material && material.title) {
    const materialTitle = normalizeTopic(material.title);
    if (comparable(text) === comparable(materialTitle) && GENERIC_TOPIC_RE.test(stripFileName(materialTitle))) return true;
    if (comparable(text) === comparable(stripFileName(material.file_path || ''))) return true;
  }
  return false;
}

function exactKnownTopic(value) {
  const text = comparable(value);
  if (!text || isGenericTopic(text)) return null;
  for (const concept of KNOWN_CONCEPTS) {
    if (comparable(concept.topic) === text) return concept.topic;
    if ((concept.aliases || []).some(alias => comparable(alias) === text)) return concept.topic;
  }
  return null;
}

function countPhrase(text, phrase) {
  const escaped = String(phrase || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`\\b${escaped}\\b`, 'gi');
  return (text.match(re) || []).length;
}

function textFromChunks(chunks) {
  return (chunks || [])
    .map(chunk => [
      chunk.chapter_title,
      chunk.heading,
      chunk.slide_title,
      chunk.section_title,
      chunk.text,
    ].filter(Boolean).join(' '))
    .join('\n')
    .toLowerCase();
}

function rankTopicsFromChunks(chunks) {
  const text = textFromChunks(chunks);
  const earlyText = (chunks || []).slice(0, 2).map(c => String(c.text || '').slice(0, 1200)).join(' ').toLowerCase();
  const headingText = (chunks || []).map(c => [c.heading, c.slide_title, c.section_title].filter(Boolean).join(' ')).join(' ').toLowerCase();
  const ranked = KNOWN_CONCEPTS.map((concept) => {
    let score = 0;
    const hits = [];
    for (const [term, weight] of concept.terms) {
      const count = countPhrase(text, term);
      if (!count) continue;
      const termScore = count * weight;
      score += termScore;
      hits.push({ term, count, score: termScore });
    }
    for (const alias of [concept.topic, ...(concept.aliases || [])]) {
      const aliasText = comparable(alias);
      if (!aliasText) continue;
      if (earlyText.includes(`what is ${aliasText}`) || earlyText.includes(`what you will learn ${aliasText}`)) {
        score += 45;
        hits.push({ term: `objective:${aliasText}`, count: 1, score: 45 });
      }
      if (headingText.includes(aliasText)) {
        score += 18;
        hits.push({ term: `heading:${aliasText}`, count: 1, score: 18 });
      }
    }
    if (score && text.includes(comparable(concept.topic))) score += 5;
    return { topic: concept.topic, score, hits };
  })
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score);

  const best = ranked[0] || null;
  const second = ranked[1] || null;
  if (!best) return { topic: null, confidence: 0, candidates: [] };
  const margin = best.score - (second ? second.score : 0);
  const confidence = Math.max(0.18, Math.min(0.96, (best.score + margin) / (best.score + (second ? second.score : 0) + 10)));
  return {
    topic: best.topic,
    confidence: Math.round(confidence * 1000) / 1000,
    candidates: ranked.slice(0, 5).map(item => ({
      topic: item.topic,
      score: Math.round(item.score * 100) / 100,
      evidence: item.hits.slice(0, 4).map(hit => hit.term),
    })),
  };
}

async function aiResolveTopic(chunks, hint) {
  if (!prompts.VIDEO_CONCEPT_EXTRACT || !chunks || !chunks.length) return null;
  try {
    const raw = await ai.generate(prompts.VIDEO_CONCEPT_EXTRACT(chunks.slice(0, 8), { rejectedHint: hint || '' }), {
      feature: 'video',
      format: 'json',
      temperature: 0,
      num_ctx: 4096,
      max_tokens: 160,
      num_predict: 160,
    });
    const parsed = await parseJsonSafe(raw, null);
    const concept = exactKnownTopic(parsed && (parsed.concept || parsed.topic)) || normalizeTopic(parsed && (parsed.concept || parsed.topic));
    if (!concept || isGenericTopic(concept)) return null;
    return {
      topic: concept,
      confidence: Math.max(0.3, Math.min(0.9, Number(parsed.confidence || 0.45))),
      source: 'resolver',
    };
  } catch (err) {
    log.warn('topic_resolver_ai_fallback', err.message || err);
    return null;
  }
}

function materialSourceTitle(material, fallback) {
  return normalizeTopic((material && material.title) || fallback || '');
}

async function resolveTopic(opts = {}) {
  const { materialId, hint, feature = 'notes', minConfidence = 0.26 } = opts;
  const db = getDb();
  const material = materialId
    ? db.prepare('SELECT id, title, file_path FROM materials WHERE id=?').get(materialId)
    : null;

  const explicit = exactKnownTopic(hint);
  if (explicit && !isGenericTopic(hint, material)) {
    return {
      topic: explicit,
      confidence: 1,
      source: 'query',
      topic_source: 'query',
      sourceTitle: materialSourceTitle(material, hint),
      rejectedHint: null,
      alternatives: [{ topic: explicit, score: 1, evidence: ['user query'] }],
      chunks: [],
    };
  }

  const rejectedHint = isGenericTopic(hint, material) ? normalizeTopic(hint) : null;
  const seedQuery = explicit || (!rejectedHint && normalizeTopic(hint)) || 'object oriented programming data structures algorithms concepts';
  let rag = { chunks: [], maxScore: 0, meanScore: 0 };
  if (materialId) {
    try {
      rag = await retrieveWithMeta(materialId, seedQuery, { feature, k: 12, minScore: 0 });
    } catch (err) {
      log.warn('topic_resolver_retrieval_failed', err.message || err);
    }
  }

  const ranked = rankTopicsFromChunks(rag.chunks || []);
  if (ranked.topic && ranked.confidence >= minConfidence) {
    return {
      topic: ranked.topic,
      confidence: ranked.confidence,
      source: 'resolver',
      topic_source: 'resolver',
      sourceTitle: materialSourceTitle(material, hint),
      rejectedHint,
      alternatives: ranked.candidates,
      chunks: rag.chunks || [],
    };
  }

  const aiTopic = await aiResolveTopic(rag.chunks || [], hint);
  if (aiTopic && aiTopic.topic && !isGenericTopic(aiTopic.topic, material)) {
    return {
      ...aiTopic,
      topic_source: aiTopic.source,
      sourceTitle: materialSourceTitle(material, hint),
      rejectedHint,
      alternatives: ranked.candidates,
      chunks: rag.chunks || [],
    };
  }

  if (!rejectedHint && normalizeTopic(hint)) {
    return {
      topic: normalizeTopic(hint),
      confidence: 0.45,
      source: 'query',
      topic_source: 'query',
      sourceTitle: materialSourceTitle(material, hint),
      rejectedHint: null,
      alternatives: ranked.candidates,
      chunks: rag.chunks || [],
    };
  }

  return {
    topic: null,
    confidence: ranked.confidence || 0,
    source: 'low_confidence',
    topic_source: 'low_confidence',
    sourceTitle: materialSourceTitle(material, hint),
    rejectedHint,
    alternatives: ranked.candidates,
    chunks: rag.chunks || [],
  };
}

module.exports = {
  resolveTopic,
  isGenericTopic,
  rankTopicsFromChunks,
  exactKnownTopic,
  _internals: {
    KNOWN_CONCEPTS,
    normalizeTopic,
    comparable,
    textFromChunks,
  },
};
