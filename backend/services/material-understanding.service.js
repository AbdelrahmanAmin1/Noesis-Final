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
        aliases: ['polymorphism', 'dynamic dispatch', 'late binding', 'runtime dispatch', 'method overriding'],
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
        aliases: ['linked list', 'singly linked list', 'doubly linked list', 'head pointer', 'next pointer', 'node.next'],
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
        normalizedTopic: 'Priority Queue',
        aliases: ['priority queue', 'priority queues', 'priority-queue'],
        keyConcepts: ['priority', 'heap', 'min priority', 'max priority', 'enqueue with priority', 'dequeue highest priority'],
      },
      {
        normalizedTopic: 'Deque',
        aliases: ['deque', 'double ended queue', 'double-ended queue'],
        keyConcepts: ['front', 'rear', 'insert front', 'insert rear', 'delete front', 'delete rear'],
      },
      {
        normalizedTopic: 'Hash Table',
        aliases: ['hash table', 'hash map', 'hashmap', 'hash function', 'bucket', 'collision'],
        keyConcepts: ['hash function', 'bucket', 'key', 'value', 'collision', 'chaining', 'probing', 'load factor', 'rehashing'],
      },
      {
        normalizedTopic: 'Trees',
        aliases: ['tree', 'trees', 'tree adt', 'tree data structure', 'binary tree'],
        keyConcepts: ['root', 'node', 'parent', 'child', 'children', 'leaf', 'height', 'depth', 'subtree', 'preorder', 'postorder', 'inorder traversal'],
      },
      {
        normalizedTopic: 'Binary Search Tree',
        aliases: ['binary search tree', 'bst'],
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
  {
    domain: 'Databases',
    topics: [
      {
        normalizedTopic: 'ERD',
        aliases: ['erd', 'entity relationship diagram', 'entity relationship model'],
        keyConcepts: ['entity', 'relationship', 'attribute', 'cardinality'],
      },
      {
        normalizedTopic: 'Normalization',
        aliases: ['normalization', 'normal forms', 'first normal form', 'second normal form', 'third normal form', '1nf', '2nf', '3nf'],
        keyConcepts: ['functional dependency', 'redundancy', 'update anomaly', 'insert anomaly', 'delete anomaly'],
      },
      {
        normalizedTopic: 'SQL',
        aliases: ['sql', 'sql select statement', 'select statement', 'structured query language'],
        keyConcepts: ['select', 'from', 'where', 'join', 'group by', 'query'],
      },
      {
        normalizedTopic: 'Transactions',
        aliases: ['transaction', 'transactions', 'acid properties', 'commit', 'rollback'],
        keyConcepts: ['atomicity', 'consistency', 'isolation', 'durability', 'commit', 'rollback'],
      },
      {
        normalizedTopic: 'Database Keys',
        aliases: ['database keys', 'primary key', 'foreign key', 'candidate key', 'composite key'],
        keyConcepts: ['primary key', 'foreign key', 'unique identifier', 'reference', 'candidate key'],
      },
    ],
  },
  {
    domain: 'Networks',
    topics: [
      {
        normalizedTopic: 'OSI Model',
        aliases: ['osi', 'osi model', 'network layers', 'open systems interconnection'],
        keyConcepts: ['physical layer', 'data link layer', 'network layer', 'transport layer', 'session layer', 'presentation layer', 'application layer'],
      },
      {
        normalizedTopic: 'TCP/IP',
        aliases: ['tcp/ip', 'tcp ip', 'internet protocol suite'],
        keyConcepts: ['transport layer', 'internet layer', 'application layer', 'network access layer'],
      },
      {
        normalizedTopic: 'DNS',
        aliases: ['dns', 'domain name system', 'dns resolution', 'dns resolution process'],
        keyConcepts: ['domain name', 'resolver', 'dns query', 'ip address'],
      },
      {
        normalizedTopic: 'Routing',
        aliases: ['routing', 'router', 'route selection'],
        keyConcepts: ['router', 'packet', 'route', 'next hop', 'routing table'],
      },
      {
        normalizedTopic: 'TCP',
        aliases: ['tcp', 'tcp handshake', 'tcp three way handshake', 'three way handshake'],
        keyConcepts: ['syn', 'syn ack', 'ack', 'connection establishment'],
      },
    ],
  },
  {
    domain: 'Cybersecurity',
    topics: [
      {
        normalizedTopic: 'Encryption',
        aliases: ['encryption', 'encrypt', 'decryption', 'cipher'],
        keyConcepts: ['plaintext', 'ciphertext', 'key', 'symmetric encryption', 'asymmetric encryption'],
      },
      {
        normalizedTopic: 'Authentication',
        aliases: ['authentication', 'authenticate', 'identity verification', 'multi factor authentication'],
        keyConcepts: ['credential', 'password', 'token', 'multi factor authentication', 'authorization'],
      },
      {
        normalizedTopic: 'Attacks',
        aliases: ['security attacks', 'cyber attacks', 'attack', 'threats'],
        keyConcepts: ['phishing', 'malware', 'social engineering', 'vulnerability', 'exploit'],
      },
      {
        normalizedTopic: 'Defenses',
        aliases: ['security defenses', 'defense in depth', 'mitigation', 'controls'],
        keyConcepts: ['firewall', 'patching', 'monitoring', 'least privilege', 'backup'],
      },
    ],
  },
  {
    domain: 'Software Engineering',
    topics: [
      {
        normalizedTopic: 'Requirements',
        aliases: ['requirements', 'requirements engineering', 'functional requirements', 'non functional requirements'],
        keyConcepts: ['stakeholder', 'use case', 'acceptance criteria', 'functional requirement', 'non functional requirement'],
      },
      {
        normalizedTopic: 'Design',
        aliases: ['software design', 'system design', 'architecture design'],
        keyConcepts: ['architecture', 'component', 'interface', 'design pattern', 'tradeoff'],
      },
      {
        normalizedTopic: 'Testing',
        aliases: ['software testing', 'unit testing', 'integration testing', 'system testing'],
        keyConcepts: ['test case', 'unit test', 'integration test', 'system test', 'regression test'],
      },
      {
        normalizedTopic: 'Deployment',
        aliases: ['deployment', 'software deployment', 'release', 'continuous deployment'],
        keyConcepts: ['release', 'environment', 'rollback', 'monitoring', 'continuous integration'],
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

const GENERAL_STOPWORDS = new Set([
  'about', 'above', 'after', 'again', 'against', 'because', 'before', 'between',
  'chapter', 'course', 'document', 'example', 'explain', 'first', 'following',
  'from', 'general', 'important', 'includes', 'intro', 'introduction', 'learn',
  'learning', 'lecture', 'lesson', 'material', 'module', 'notes', 'overview',
  'section', 'should', 'slide', 'source', 'study', 'summary', 'their', 'there',
  'these', 'thing', 'things', 'through', 'topic', 'uploaded', 'using', 'which',
  'while', 'with', 'within', 'without',
]);

const BOILERPLATE_LABEL_RE = /^(?:top|home|welcome|contents?|table of contents|index|appendix|acknowledgements?|references?|bibliography|copyright|license|quiz(?:zes)?|quiz answer keys?|answer keys?|answers?|review questions?|practice questions?|learning objectives?|objectives?|summary|recap|overview|introduction)$/i;
const WEAK_TITLE_RE = /^(?:document|file|material|upload|uploaded material|source|lesson|chapter\s*\d+|slide\s*\d+|section\s*\d+|unit\s*\d+|module\s*\d+|untitled|\d+|[a-z]*\d+[a-z0-9_-]*)$/i;
const TERM_STOPWORDS = new Set([
  ...GENERAL_STOPWORDS,
  'also', 'among', 'answer', 'because', 'between', 'course', 'could', 'details',
  'each', 'figure', 'given', 'however', 'include', 'includes', 'including',
  'have', 'into', 'many', 'more', 'most', 'other', 'page', 'part', 'parts', 'quiz',
  'same', 'shown', 'some', 'such', 'than', 'then', 'therefore', 'used', 'uses',
  'will', 'would',
]);

function isGenericGeneralLabel(value) {
  const text = String(value || '').replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!text) return true;
  if (topicResolver.isGenericTopic(text)) return true;
  if (BOILERPLATE_LABEL_RE.test(text)) return true;
  if (/^(document|file|material|upload|uploaded material|source|lesson|chapter\s*\d+|slide\s*\d+|section\s*\d+|page\s*\d+|unit\s*\d+|module\s*\d+|top|untitled|\d+)$/i.test(text)) return true;
  return !/\s/.test(text) && /[a-z]*\d+[a-z0-9]*/i.test(text);
}

function isWeakMaterialTitle(value) {
  const text = String(value || '').replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!text) return true;
  if (isGenericGeneralLabel(text)) return true;
  if (WEAK_TITLE_RE.test(text) && !/\s/.test(text)) return true;
  return false;
}

function titleCaseGeneralLabel(value) {
  return String(value || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, c => c.toUpperCase())
    .slice(0, 90);
}

function parseGeneralKeywords(value) {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed.filter(Boolean).map(String) : [];
  } catch (_) {
    return [];
  }
}

function generalHeadingForChunk(chunk) {
  return String(
    chunk && (chunk.chapter_title || chunk.slide_title || chunk.section_title || chunk.heading) || ''
  ).replace(/\s+/g, ' ').trim();
}

function candidateLabelsForChunk(chunk) {
  return [
    chunk && chunk.chapter_title,
    chunk && chunk.slide_title,
    chunk && chunk.section_title,
    chunk && chunk.heading,
  ].map(value => String(value || '').replace(/\s+/g, ' ').trim()).filter(Boolean);
}

function meaningfulHeadingForChunk(chunk) {
  for (const label of candidateLabelsForChunk(chunk)) {
    if (!isGenericGeneralLabel(label)) return label;
  }
  const firstLine = String(chunk && chunk.text || '')
    .split(/\n+/)
    .map(line => line.trim())
    .find(line => line.length >= 4 && line.length <= 90 && !/[.!?]$/.test(line) && !isGenericGeneralLabel(line));
  return firstLine || '';
}

function addUniqueLabel(out, seen, value, max = 12) {
  const label = titleCaseGeneralLabel(value);
  if (isGenericGeneralLabel(label)) return;
  const key = label.toLowerCase();
  if (seen.has(key)) return;
  seen.add(key);
  out.push(label);
  return out.length >= max;
}

function extractGeneralHeadings(chunks, max = 8) {
  const seen = new Set();
  const headings = [];
  for (const chunk of chunks || []) {
    if (addUniqueLabel(headings, seen, meaningfulHeadingForChunk(chunk) || generalHeadingForChunk(chunk), max)) break;
  }
  return headings;
}

function significantTermsFromText(value, max = 12) {
  const counts = new Map();
  const text = String(value || '').toLowerCase();
  const phrases = text.match(/\b[a-z][a-z0-9+-]*(?:\s+[a-z][a-z0-9+-]*){1,3}\b/g) || [];
  for (const phrase of phrases) {
    const words = phrase.split(/\s+/).filter(word => word.length >= 4 && !TERM_STOPWORDS.has(word));
    if (words.length >= 2) counts.set(words.join(' '), (counts.get(words.join(' ')) || 0) + words.length);
  }
  for (const token of text.match(/\b[a-z][a-z0-9+-]{3,}\b/g) || []) {
    if (TERM_STOPWORDS.has(token)) continue;
    counts.set(token, (counts.get(token) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, max)
    .map(([term]) => titleCaseGeneralLabel(term));
}

function extractFrequentGeneralTerms(chunks, max = 8) {
  const counts = new Map();
  const add = (value, weight = 1) => {
    const normalized = String(value || '').toLowerCase().replace(/[^a-z0-9 +#-]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!normalized || normalized.length < 4 || isGenericGeneralLabel(normalized)) return;
    if (GENERAL_STOPWORDS.has(normalized)) return;
    counts.set(normalized, (counts.get(normalized) || 0) + weight);
  };
  for (const chunk of chunks || []) {
    for (const keyword of parseGeneralKeywords(chunk && chunk.keywords_json)) add(keyword, 4);
    const heading = generalHeadingForChunk(chunk);
    if (heading) add(heading, 3);
    const words = String(chunk && chunk.text || '').toLowerCase().match(/\b[a-z][a-z0-9+#-]{3,}\b/g) || [];
    for (const word of words) {
      if (GENERAL_STOPWORDS.has(word)) continue;
      add(word, 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, max)
    .map(([term]) => titleCaseGeneralLabel(term));
}

function extractGeneralKeyConcepts(chunks, topic = '', max = 10) {
  const seen = new Set();
  const concepts = [];
  for (const heading of extractGeneralHeadings(chunks, max)) {
    if (addUniqueLabel(concepts, seen, heading, max)) return concepts;
  }
  for (const term of extractFrequentGeneralTerms(chunks, max * 2)) {
    if (addUniqueLabel(concepts, seen, term, max)) return concepts;
  }
  if (!concepts.length && !isGenericGeneralLabel(topic)) addUniqueLabel(concepts, seen, topic, max);
  return concepts.slice(0, max);
}

function sourceEvidenceFromGeneralChunks(chunks, terms = [], max = 5) {
  return (chunks || []).slice(0, max).map((chunk, index) => {
    const text = String(chunk && chunk.text || '').replace(/\s+/g, ' ').trim();
    return {
      chunkId: chunk && (chunk.id || chunk.chunk_id) || null,
      chunkIndex: chunk && chunk.idx,
      quote: sentenceQuote(text, terms, 280),
      chapterTitle: chunk && chunk.chapter_title || '',
      heading: generalHeadingForChunk(chunk),
      slideNumber: chunk && chunk.slide_number || null,
      slideTitle: chunk && chunk.slide_title || '',
      sourcePage: chunk && chunk.source_page || null,
      score: typeof (chunk && chunk.score) === 'number' ? chunk.score : null,
      ordinal: index + 1,
    };
  }).filter(item => item.quote || item.heading);
}

function normalizeSourceLine(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s\-*•\d.)]+/, '')
    .trim();
}

function lineKey(value) {
  return normalizeSourceLine(value).toLowerCase().replace(/[^a-z0-9+# ]+/g, '').replace(/\s+/g, ' ').trim();
}

function splitSourceLines(value) {
  return String(value || '')
    .replace(/\r/g, '\n')
    .split(/\n+|(?<=\.)\s+(?=[A-Z][A-Za-z ]{2,40}(?:\n|$))/)
    .map(normalizeSourceLine)
    .filter(Boolean);
}

function looksLikeNavigationLine(value) {
  const text = normalizeSourceLine(value);
  if (!text) return false;
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length > 6 || text.length > 80) return false;
  if (/[.!?]$/.test(text) && words.length > 3) return false;
  if (BOILERPLATE_LABEL_RE.test(text) || isGenericGeneralLabel(text)) return true;
  return /^[A-Z][A-Za-z0-9 +#&/-]+$/.test(text) && !/\b(is|are|means|includes|consists|because|therefore|produces|stores|supports|protects|enables)\b/i.test(text);
}

function buildRepeatedNavigationProfile(chunks = []) {
  const lineCounts = new Map();
  const chunkHits = new Map();
  for (const chunk of chunks || []) {
    const seenInChunk = new Set();
    for (const line of splitSourceLines(chunk && chunk.text || '')) {
      const key = lineKey(line);
      if (!key || key.length < 3) continue;
      lineCounts.set(key, (lineCounts.get(key) || 0) + 1);
      seenInChunk.add(key);
    }
    for (const key of seenInChunk) chunkHits.set(key, (chunkHits.get(key) || 0) + 1);
  }
  const repeated = new Map();
  const chunkCount = Math.max(1, (chunks || []).length);
  for (const [key, count] of lineCounts.entries()) {
    const chunkSpread = chunkHits.get(key) || 0;
    if (count >= 3 || (chunkCount >= 4 && chunkSpread >= 3)) {
      const sample = splitSourceLines((chunks || []).map(c => c && c.text || '').join('\n'))
        .find(line => lineKey(line) === key) || key;
      if (looksLikeNavigationLine(sample)) repeated.set(key, normalizeSourceLine(sample));
    }
  }
  return repeated;
}

function stripRepeatedNavigationText(text, repeatedProfile) {
  if (!repeatedProfile || !repeatedProfile.size) return String(text || '');
  return splitSourceLines(text)
    .filter(line => !repeatedProfile.has(lineKey(line)))
    .join('\n');
}

function cleanSourceFact(value, max = 220) {
  const text = normalizeSourceLine(value)
    .replace(/\s+([,.;:!?])/g, '$1')
    .trim();
  if (!text || text.length < 18) return '';
  if (looksLikeNavigationLine(text)) return '';
  return text.length <= max ? text : `${text.slice(0, max - 1).trim()}...`;
}

function emptySourceFacts() {
  return {
    definitions: [],
    facts: [],
    classifications: [],
    examples: [],
    numbers: [],
    relationships: [],
    processes: [],
    memoryHints: [],
    reviewQuestions: [],
  };
}

function addFact(facts, key, value, max = 8) {
  const text = cleanSourceFact(value);
  if (!text || !facts[key] || facts[key].some(item => item.toLowerCase() === text.toLowerCase())) return;
  facts[key].push(text);
  if (facts[key].length > max) facts[key] = facts[key].slice(0, max);
}

function sentenceSegments(value) {
  const raw = String(value || '').replace(/\r/g, '\n');
  const segments = [];
  for (const line of raw.split(/\n+/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/^[\-*•]\s+/.test(trimmed) || /^\d+[.)]\s+/.test(trimmed)) {
      segments.push(trimmed);
    } else {
      segments.push(...trimmed.split(/(?<=[.!?])\s+/));
    }
  }
  return segments.map(segment => cleanSourceFact(segment)).filter(Boolean);
}

function extractSourceFactsFromSection(section = {}) {
  const facts = emptySourceFacts();
  const text = String(section.text || '');
  for (const segment of sentenceSegments(text)) {
    const lower = segment.toLowerCase();
    const hasListCue = /\b(includes?|consists of|contains|made up of|composed of|types?|categories|classified|divided into|groups?)\b/.test(lower);
    const hasDefinitionCue = /\b(is|are|means|refers to|defined as|describes)\b/.test(lower);
    const hasExampleCue = /\b(for example|for instance|such as|examples? include|e\.g\.)\b/.test(lower);
    const hasProcessCue = /\b(first|second|third|then|finally|step|process|sequence|cycle|stages?|phases?)\b/.test(lower);
    const hasRelationshipCue = /\b(causes?|effects?|because|therefore|leads to|results in|allows?|enables?|supports?|protects?|stores?|produces?|connects?|depends on|related to|function)\b/.test(lower);
    if (/\?/.test(segment)) addFact(facts, 'reviewQuestions', segment, 6);
    if (hasDefinitionCue) addFact(facts, 'definitions', segment, 8);
    if (hasListCue) addFact(facts, 'classifications', segment, 8);
    if (hasExampleCue) addFact(facts, 'examples', segment, 8);
    if (hasProcessCue) addFact(facts, 'processes', segment, 8);
    if (hasRelationshipCue) addFact(facts, 'relationships', segment, 8);
    if (/\b\d+(?:\.\d+)?%?|\b(?:one|two|three|four|five|six|seven|eight|nine|ten)\b/i.test(segment)) addFact(facts, 'numbers', segment, 8);
    if (/\b(remember|mnemonic|hint|tip|key point|note that)\b/i.test(segment)) addFact(facts, 'memoryHints', segment, 5);
    if (segment.length >= 35 && !/\?$/.test(segment)) addFact(facts, 'facts', segment, 10);
  }
  return facts;
}

function mergeSourceFacts(items = []) {
  const merged = emptySourceFacts();
  for (const facts of items || []) {
    for (const key of Object.keys(merged)) {
      for (const value of (facts && facts[key]) || []) addFact(merged, key, value, key === 'facts' ? 20 : 12);
    }
  }
  return merged;
}

function chooseGeneralTopic({ hint, explicitQuery, title, scopeTitle, headings, keyConcepts }) {
  const candidates = [
    { value: explicitQuery || hint, source: 'query', confidence: 0.65 },
    { value: scopeTitle, source: 'scope_title', confidence: 0.6 },
    { value: !isWeakMaterialTitle(title) ? title : '', source: 'material_title', confidence: 0.55 },
    { value: headings && headings[0], source: 'source_heading', confidence: 0.52 },
    { value: isWeakMaterialTitle(title) ? title : '', source: 'weak_material_title', confidence: 0.35 },
  ];
  for (const candidate of candidates) {
    const topic = titleCaseGeneralLabel(candidate.value);
    if (!isGenericGeneralLabel(topic) && !isWeakMaterialTitle(topic)) return { topic, source: candidate.source, confidence: candidate.confidence };
  }
  const concepts = (keyConcepts || []).filter(value => !isGenericGeneralLabel(value)).slice(0, 3);
  if (concepts.length) {
    return { topic: concepts.join(' / '), source: 'source_terms', confidence: 0.42 };
  }
  return { topic: 'Study Notes from Uploaded Material', source: 'fallback_general', confidence: 0.3 };
}

function sectionTerms(section, max = 10) {
  const terms = [
    section.title,
    ...parseGeneralKeywords(section.keywords_json),
    ...significantTermsFromText(`${section.title} ${section.text}`, max * 2),
  ];
  const seen = new Set();
  return terms
    .map(term => titleCaseGeneralLabel(term))
    .filter(term => {
      const key = term.toLowerCase();
      if (!term || seen.has(key) || isGenericGeneralLabel(term)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, max);
}

function buildSourceOutline(chunks, opts = {}) {
  const ignoredBoilerplate = [];
  const quizSections = [];
  const sections = [];
  const repeatedProfile = buildRepeatedNavigationProfile(chunks || []);
  const cleanedChunks = (chunks || []).map(chunk => ({
    ...chunk,
    text: stripRepeatedNavigationText(chunk && chunk.text || '', repeatedProfile),
  }));
  for (const [key, label] of repeatedProfile.entries()) {
    ignoredBoilerplate.push({ label, reason: 'repeated_navigation', key });
  }
  let current = null;

  const pushCurrent = () => {
    if (!current) return;
    current.excerpt = sentenceQuote(current.text, [current.title, ...current.terms], 320);
    current.terms = sectionTerms(current, 12);
    current.sourceFacts = extractSourceFactsFromSection(current);
    if (current.isQuiz) quizSections.push(current);
    else sections.push(current);
    current = null;
  };

  for (const chunk of cleanedChunks || []) {
    const rawLabel = meaningfulHeadingForChunk(chunk) || generalHeadingForChunk(chunk);
    const title = titleCaseGeneralLabel(rawLabel || opts.title || 'Source Section');
    const isBoilerplate = isGenericGeneralLabel(title);
    const labelText = candidateLabelsForChunk(chunk).join(' ');
    const isQuiz = /quiz|answer key|review question|practice question/i.test(`${title} ${labelText}`);
    if (isBoilerplate) ignoredBoilerplate.push({ label: title, chunkId: chunk && chunk.id || null, chunkIndex: chunk && chunk.idx });
    const derivedTerms = significantTermsFromText(chunk && chunk.text || '', 3)
      .filter(term => !isGenericGeneralLabel(term));
    let sectionTitle = title;
    if (isBoilerplate && isQuiz) {
      sectionTitle = /answer key/i.test(`${title} ${labelText}`) ? 'Quiz Answer Keys' : 'Quiz / Review Questions';
    } else if (isBoilerplate && current && current.title && current.title !== 'Source Details' && derivedTerms.length) {
      sectionTitle = current.title;
    } else if (isBoilerplate && derivedTerms.length) {
      sectionTitle = derivedTerms.slice(0, 2).join(' / ');
    } else if (isBoilerplate) {
      continue;
    }
    const key = sectionTitle.toLowerCase();
    if (!current || current.key !== key || current.isQuiz !== isQuiz) {
      pushCurrent();
      current = {
        title: sectionTitle,
        key,
        isQuiz,
        startIndex: chunk && chunk.idx,
        endIndex: chunk && chunk.idx,
        chunkIds: [],
        sourcePages: [],
        keywords_json: '[]',
        text: '',
        terms: [],
      };
    }
    current.endIndex = chunk && chunk.idx;
    if (chunk && chunk.id) current.chunkIds.push(chunk.id);
    if (chunk && chunk.source_page) current.sourcePages.push(chunk.source_page);
    current.text = `${current.text}\n${chunk && chunk.text || ''}`.trim();
    const keywords = [
      ...parseGeneralKeywords(current.keywords_json),
      ...parseGeneralKeywords(chunk && chunk.keywords_json),
    ];
    current.keywords_json = JSON.stringify([...new Set(keywords)]);
  }
  pushCurrent();

  const sectionHeadings = sections.map(section => section.title).filter(title => !isGenericGeneralLabel(title));
  const frequentTerms = extractFrequentGeneralTerms(cleanedChunks || [], 18);
  const keyConcepts = [];
  const seen = new Set();
  for (const value of [...sectionHeadings, ...frequentTerms]) {
    addUniqueLabel(keyConcepts, seen, value, 14);
  }
  const selected = chooseGeneralTopic({
    hint: opts.hint,
    explicitQuery: opts.explicitQuery,
    title: opts.title || opts.materialTitle,
    scopeTitle: opts.scopeTitle,
    headings: sectionHeadings,
    keyConcepts,
  });
  const mainTopic = selected.topic;
  const terms = [mainTopic, ...keyConcepts, ...sectionHeadings].filter(Boolean);
  const sourceEvidence = sourceEvidenceFromGeneralChunks(cleanedChunks || [], terms, 8);
  const meaningfulSections = sections.slice(0, 12).map(section => ({
    title: section.title,
    startIndex: section.startIndex,
    endIndex: section.endIndex,
    chunkIds: section.chunkIds,
    sourcePages: [...new Set(section.sourcePages)].filter(Boolean),
    terms: section.terms,
    excerpt: section.excerpt,
    sourceFacts: section.sourceFacts || emptySourceFacts(),
  }));
  const sourceFacts = mergeSourceFacts(meaningfulSections.map(section => section.sourceFacts));
  const majorTopics = meaningfulSections
    .filter(section => section.title && !isGenericGeneralLabel(section.title))
    .map(section => ({
      topic: section.title,
      terms: section.terms.slice(0, 10),
      startIndex: section.startIndex,
      endIndex: section.endIndex,
      chunkIds: section.chunkIds,
      evidence: section.excerpt,
    }))
    .slice(0, 10);
  const confidence = Math.max(
    selected.confidence,
    sourceEvidence.length >= 2 && keyConcepts.length >= 3 ? 0.58 : 0,
    majorTopics.length >= 2 ? 0.62 : 0
  );
  return {
    title: opts.title || opts.materialTitle || '',
    mainTopic,
    topic: mainTopic,
    topicSource: selected.source,
    meaningfulSections,
    keyConcepts: keyConcepts.slice(0, 14),
    sourceEvidence,
    sourceFacts,
    representativeExcerpts: sourceEvidence.map(item => item.quote).filter(Boolean).slice(0, 6),
    quizSections: quizSections.slice(0, 6).map(section => ({
      title: section.title,
      chunkIds: section.chunkIds,
      excerpt: section.excerpt,
      sourceFacts: section.sourceFacts || emptySourceFacts(),
    })),
    ignoredBoilerplate,
    majorTopics,
    confidence: Math.round(Math.min(0.95, confidence) * 1000) / 1000,
  };
}

function understandGeneralFromChunks(chunks, opts = {}) {
  const sourceOutline = buildSourceOutline(chunks || [], opts);
  const headings = sourceOutline.meaningfulSections.map(section => section.title).slice(0, 10);
  const keyConcepts = sourceOutline.keyConcepts.length
    ? sourceOutline.keyConcepts
    : extractGeneralKeyConcepts(chunks || [], opts.hint || opts.title || '', 12);
  const selected = chooseGeneralTopic({
    hint: opts.hint,
    explicitQuery: opts.explicitQuery,
    title: opts.title || opts.materialTitle,
    scopeTitle: opts.scopeTitle,
    headings,
    keyConcepts,
  });
  const topic = sourceOutline.mainTopic || selected.topic;
  const terms = [topic, ...keyConcepts, ...headings].filter(Boolean);
  const sourceEvidence = sourceOutline.sourceEvidence.length
    ? sourceOutline.sourceEvidence
    : sourceEvidenceFromGeneralChunks(chunks || [], terms, 6);
  const domainInfo = opts.domainInfo || {};
  const domain = domainInfo.domain || 'general';
  const confidence = Math.max(
    Number(domainInfo.confidence || 0),
    sourceOutline.confidence,
    selected.confidence,
    sourceEvidence.length >= 2 && keyConcepts.length >= 3 ? 0.55 : 0
  );
  return {
    topic,
    normalizedTopic: topic,
    domain,
    subdomain: domainInfo.subdomain || null,
    domainInfo,
    headings,
    keyConcepts: keyConcepts.slice(0, 12),
    sourceEvidence,
    representativeExcerpts: sourceOutline.representativeExcerpts.length
      ? sourceOutline.representativeExcerpts
      : sourceEvidence.map(item => item.quote).filter(Boolean).slice(0, 5),
    sourceOutline,
    confidence: Math.round(Math.min(0.95, confidence) * 1000) / 1000,
    source: sourceOutline.topicSource || selected.source,
    alternatives: keyConcepts.slice(0, 5).map(label => ({ topic: label, score: 0.5, evidence: ['source term'] })),
    readyForGeneration: sourceEvidence.length > 0 || keyConcepts.length > 0,
  };
}

function normalizeTerm(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9+#]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function termMatchesText(text, term) {
  const normalized = normalizeTerm(term);
  if (!normalized || normalized.length < 3) return false;
  return containsPhrase(text, normalized) || normalizeTerm(text).includes(normalized);
}

function focusTermsForTopic(topic, sourceOutline = null, max = 12) {
  const base = significantTermsFromText(topic, 8);
  const outline = sourceOutline || {};
  const topicDef = taxonomyForTopic(topic);
  const taxonomyTerms = topicDef
    ? [topicDef.normalizedTopic, ...(topicDef.aliases || []), ...(topicDef.keyConcepts || [])]
    : [];
  const topicWords = [...base, ...taxonomyTerms].map(normalizeTerm);
  const matching = (outline.majorTopics || []).filter(item => {
    const hay = normalizeTerm([item.topic, ...(item.terms || [])].join(' '));
    return topicWords.some(word => word && hay.includes(word)) || termMatchesText(item.topic, topic);
  });
  const terms = [
    topic,
    ...base,
    ...taxonomyTerms,
    ...matching.flatMap(item => [item.topic, ...(item.terms || [])]),
  ];
  const seen = new Set();
  return terms.map(titleCaseGeneralLabel).filter(term => {
    const key = normalizeTerm(term);
    if (!key || seen.has(key) || isGenericGeneralLabel(term)) return false;
    seen.add(key);
    return true;
  }).slice(0, max);
}

function competingTermsForTopic(topic, sourceOutline = null, max = 24) {
  const outline = sourceOutline || {};
  const focus = new Set(focusTermsForTopic(topic, outline, 18).map(normalizeTerm));
  const out = [];
  const seen = new Set();
  for (const item of outline.majorTopics || []) {
    const itemTerms = [item.topic, ...(item.terms || [])].map(titleCaseGeneralLabel);
    const overlapsFocus = itemTerms.some(term => focus.has(normalizeTerm(term)));
    if (overlapsFocus) continue;
    for (const term of itemTerms) {
      const key = normalizeTerm(term);
      if (!key || seen.has(key) || isGenericGeneralLabel(term)) continue;
      seen.add(key);
      out.push(term);
      if (out.length >= max) return out;
    }
  }
  return out;
}

function countTermHits(text, terms = []) {
  const lower = String(text || '').toLowerCase();
  let hits = 0;
  const matched = [];
  for (const term of terms) {
    if (termMatchesText(lower, term)) {
      hits += 1;
      matched.push(term);
    }
  }
  return { hits, matched };
}

function detectTopicDrift(text, opts = {}) {
  const focusTopic = opts.focusTopic || opts.topic || '';
  const sourceOutline = opts.sourceOutline || null;
  const focusTerms = Array.isArray(opts.focusTerms)
    ? opts.focusTerms
    : focusTermsForTopic(focusTopic, sourceOutline, 14);
  const competingTerms = Array.isArray(opts.competingTerms)
    ? opts.competingTerms
    : competingTermsForTopic(focusTopic, sourceOutline, 28);
  const focus = countTermHits(text, focusTerms);
  const competing = countTermHits(text, competingTerms);
  const drifted = competing.hits >= 3 && competing.hits >= focus.hits + 2;
  return {
    drifted,
    focusHits: focus.hits,
    competingHits: competing.hits,
    focusTerms: focus.matched,
    competingTerms: competing.matched,
  };
}

function generalRowsFromDb(userId, materialId, opts = {}) {
  const db = getDb();
  const material = materialId
    ? db.prepare('SELECT id, title FROM materials WHERE id=? AND user_id=?').get(materialId, userId)
    : null;
  if (!material) return { material: null, chunks: [] };
  let rows;
  if (opts.sourceScope === 'chapter' && Number.isInteger(opts.chapterId)) {
    rows = db.prepare(`SELECT id, idx, text, chapter_id, source_page, chapter_title, heading,
        slide_number, slide_title, section_title, has_code, keywords_json
      FROM chunks WHERE material_id=? AND chapter_id=? ORDER BY idx LIMIT ?`)
      .all(materialId, opts.chapterId, opts.limit || 32);
  } else if (opts.sourceScope === 'chunk' && Number.isInteger(opts.chunkId)) {
    rows = db.prepare(`SELECT id, idx, text, chapter_id, source_page, chapter_title, heading,
        slide_number, slide_title, section_title, has_code, keywords_json
      FROM chunks WHERE material_id=? AND id=? ORDER BY idx LIMIT 1`)
      .all(materialId, opts.chunkId);
  } else {
    rows = db.prepare(`SELECT id, idx, text, chapter_id, source_page, chapter_title, heading,
        slide_number, slide_title, section_title, has_code, keywords_json
      FROM chunks WHERE material_id=? ORDER BY idx LIMIT ?`).all(materialId, opts.limit || 32);
  }
  return { material, chunks: rows };
}

function understandGeneralFromDb(userId, materialId, opts = {}) {
  const { material, chunks } = generalRowsFromDb(userId, materialId, opts);
  return understandGeneralFromChunks(chunks, {
    ...opts,
    title: opts.title || (material && material.title),
    materialTitle: opts.materialTitle || (material && material.title),
  });
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
  understandGeneralFromChunks,
  understandGeneralFromDb,
  buildSourceOutline,
  focusTermsForTopic,
  competingTermsForTopic,
  detectTopicDrift,
  _internals: {
    buildSourceEvidence,
    buildSourceOutline,
    buildRepeatedNavigationProfile,
    competingTermsForTopic,
    detectKeyConcepts,
    detectLanguage,
    detectTopicDrift,
    extractSourceFactsFromSection,
    extractGeneralHeadings,
    extractGeneralKeyConcepts,
    extractFrequentGeneralTerms,
    focusTermsForTopic,
    isGenericGeneralLabel,
    isWeakMaterialTitle,
    mergeSourceFacts,
    readinessFor,
    sourceEvidenceFromGeneralChunks,
    stripRepeatedNavigationText,
    taxonomyForTopic,
  },
};
