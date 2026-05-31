'use strict';

const { getDb } = require('../config/db');

const AMBIGUOUS_CS_TERMS = new Set(['interface', 'interfaces', 'stack', 'stacks', 'queue', 'queues', 'search', 'searching']);

const CS_SIGNALS = [
  'class', 'object', 'constructor', 'inheritance', 'polymorphism', 'encapsulation',
  'abstraction', 'implements', 'extends', 'method', 'attribute', 'java', 'python',
  'algorithm', 'data structure', 'linked list', 'binary search tree', 'hash table',
  'big o', 'big-o', 'time complexity', 'space complexity', 'push', 'pop', 'lifo',
  'enqueue', 'dequeue', 'fifo', 'node', 'pointer', 'recursion', 'array',
  'tree', 'trees', 'bst', 'heap', 'graph',
];

const DATA_STRUCTURE_SIGNALS = [
  'data structure', 'array', 'linked list', 'stack', 'queue', 'binary search tree',
  'bst', 'tree', 'trees', 'hash table', 'hash map', 'heap', 'graph', 'node',
  'root', 'leaf', 'subtree', 'traversal', 'bucket', 'collision',
];

const BUSINESS_SIGNALS = [
  'marketing', 'market', 'product', 'price', 'place', 'promotion',
  'customer', 'consumer', 'brand', 'sales', 'campaign', 'distribution',
  'advertising', 'target market', 'segmentation', 'positioning',
  'segmentation', 'targeting', 'positioning', 'brand', 'consumer', 'customer',
  'sales', 'campaign', 'distribution', 'business', 'strategy', 'value proposition',
  'management', 'organization', 'company', 'revenue', 'market share', 'manager',
  'leadership', 'planning', 'operations', 'economics', 'supply', 'demand', 'cost',
  'profit', 'pricing', 'competitive advantage',
];

const SCIENCE_SIGNALS = [
  'biology', 'cell', 'cells', 'organism', 'ecosystem', 'photosynthesis', 'respiration',
  'chemistry', 'molecule', 'atom', 'reaction', 'physics', 'force', 'energy', 'mass',
  'experiment', 'hypothesis', 'evolution', 'genetics', 'dna', 'protein', 'climate',
  'anatomy', 'skeletal system', 'skeleton', 'bone', 'bones', 'skull', 'vertebrae',
  'vertebral', 'axial skeleton', 'appendicular skeleton', 'limb', 'muscle', 'tissue',
  'organ', 'mineral storage', 'red blood cell', 'cartilage', 'joint',
];

const HUMANITIES_SIGNALS = [
  'history', 'historical', 'civilization', 'empire', 'revolution', 'war', 'treaty',
  'literature', 'poetry', 'novel', 'philosophy', 'ethics', 'art', 'religion',
  'culture', 'colonial', 'renaissance', 'ancient', 'medieval',
];

const SOCIAL_SCIENCE_SIGNALS = [
  'psychology', 'sociology', 'politics', 'government', 'policy', 'society',
  'social', 'behavior', 'institution', 'anthropology', 'communication', 'education',
  'law', 'democracy', 'public opinion', 'identity',
];

const DATABASE_SIGNALS = [
  'database', 'databases', 'erd', 'entity relationship', 'normalization', 'normal form',
  'sql', 'select statement', 'transaction', 'transactions', 'acid properties',
  'primary key', 'foreign key', 'candidate key', 'commit', 'rollback',
];

const NETWORK_SIGNALS = [
  'network', 'networks', 'osi model', 'tcp/ip', 'tcp ip', 'dns', 'domain name system',
  'routing', 'router', 'packet', 'network layer', 'transport layer', 'tcp handshake',
];

const CYBERSECURITY_SIGNALS = [
  'cybersecurity', 'cyber security', 'encryption', 'decryption', 'authentication',
  'authorization', 'phishing', 'malware', 'firewall', 'vulnerability', 'exploit',
  'least privilege', 'defense in depth',
];

const SOFTWARE_ENGINEERING_SIGNALS = [
  'software engineering', 'requirements engineering', 'functional requirements',
  'non functional requirements', 'software design', 'software architecture',
  'unit testing', 'integration testing', 'system testing', 'software deployment',
  'continuous integration', 'continuous deployment', 'release management',
];

function normalize(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9+#().]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function containsPhrase(text, phrase) {
  const hay = ` ${normalize(text)} `;
  const needle = normalize(phrase);
  if (!needle) return false;
  return hay.includes(` ${needle} `) || (needle.length > 4 && hay.includes(needle));
}

function countSignals(text, signals) {
  const evidence = [];
  for (const signal of signals) {
    if (containsPhrase(text, signal)) evidence.push(signal);
  }
  return evidence;
}

function ambiguousEvidence(text) {
  const normalized = normalize(text);
  const tokens = normalized.split(/\s+/);
  const evidence = [];
  for (const term of AMBIGUOUS_CS_TERMS) {
    if (!tokens.includes(term)) continue;
    if ((term === 'interface' || term === 'interfaces') && /\b(class|implements|abstract|method|api|java|type|polymorphism|inheritance)\b/.test(normalized)) {
      evidence.push(term);
    }
    if ((term === 'stack' || term === 'stacks') && /\b(push|pop|peek|lifo|call stack|recursion|top)\b/.test(normalized)) {
      evidence.push(term);
    }
    if ((term === 'queue' || term === 'queues') && /\b(enqueue|dequeue|fifo|front|rear|priority queue)\b/.test(normalized)) {
      evidence.push(term);
    }
    if ((term === 'search' || term === 'searching') && /\b(algorithm|linear search|binary search|sorted array|middle index|time complexity|data structure)\b/.test(normalized)) {
      evidence.push(term);
    }
  }
  return evidence;
}

function classifyText(text) {
  const business = countSignals(text, BUSINESS_SIGNALS);
  const science = countSignals(text, SCIENCE_SIGNALS);
  const humanities = countSignals(text, HUMANITIES_SIGNALS);
  const socialScience = countSignals(text, SOCIAL_SCIENCE_SIGNALS);
  const databases = countSignals(text, DATABASE_SIGNALS);
  const networks = countSignals(text, NETWORK_SIGNALS);
  const cybersecurity = countSignals(text, CYBERSECURITY_SIGNALS);
  const softwareEngineering = countSignals(text, SOFTWARE_ENGINEERING_SIGNALS);
  const csRaw = countSignals(text, CS_SIGNALS);
  const cs = [
    ...csRaw.filter(signal => !AMBIGUOUS_CS_TERMS.has(signal)),
    ...ambiguousEvidence(text),
  ];
  const uniqueCs = [...new Set(cs)];
  const uniqueBusiness = [...new Set(business)];
  const candidates = [
    { domain: 'business', evidence: uniqueBusiness },
    { domain: 'science', evidence: [...new Set(science)] },
    { domain: 'humanities', evidence: [...new Set(humanities)] },
    { domain: 'social_science', evidence: [...new Set(socialScience)] },
    { domain: 'databases', evidence: [...new Set(databases)] },
    { domain: 'networks', evidence: [...new Set(networks)] },
    { domain: 'cybersecurity', evidence: [...new Set(cybersecurity)] },
    { domain: 'software_engineering', evidence: [...new Set(softwareEngineering)] },
  ].sort((a, b) => b.evidence.length - a.evidence.length);
  const bestNonCs = candidates[0] || { domain: 'general', evidence: [] };
  const nonCsCount = bestNonCs.evidence.length;
  if (uniqueCs.length >= 2 && uniqueCs.length > nonCsCount) {
    return { domain: 'cs', confidence: Math.min(0.95, 0.5 + uniqueCs.length * 0.08), evidence: uniqueCs };
  }
  if (nonCsCount >= 2 && nonCsCount >= uniqueCs.length) {
    return { domain: bestNonCs.domain, confidence: Math.min(0.95, 0.5 + nonCsCount * 0.08), evidence: bestNonCs.evidence };
  }
  if (uniqueCs.length === 1 && nonCsCount === 0) {
    return { domain: 'unknown', confidence: 0.35, evidence: uniqueCs };
  }
  if (nonCsCount === 1) return { domain: bestNonCs.domain, confidence: 0.45, evidence: bestNonCs.evidence };
  return { domain: 'general', confidence: 0.3, evidence: [] };
}

function detectMaterialDomain(userId, materialId, opts = {}) {
  const db = getDb();
  const material = materialId
    ? db.prepare('SELECT id, title FROM materials WHERE id=? AND user_id=?').get(materialId, userId)
    : null;
  if (!material) return { domain: 'unknown', subdomain: null, confidence: 0, evidence: [], source: 'missing_material' };
  const rows = db.prepare(`
    SELECT text, chapter_title, heading, slide_title, section_title, keywords_json
    FROM chunks
    WHERE material_id=?
    ORDER BY idx
    LIMIT ?
  `).all(materialId, opts.limit || 16);
  const text = [
    material.title,
    opts.hint,
    ...rows.map(row => [
      row.chapter_title,
      row.heading,
      row.slide_title,
      row.section_title,
      row.keywords_json,
      row.text,
    ].filter(Boolean).join(' ')),
  ].filter(Boolean).join(' ');
  const result = classifyText(text);
  const subdomain = result.domain === 'cs'
    ? (DATA_STRUCTURE_SIGNALS.some(signal => containsPhrase(text, signal)) ? 'data_structures' : 'oop_or_programming')
    : (result.domain === 'unknown' || result.domain === 'general' ? null : result.domain);
  return {
    domain: result.domain,
    subdomain,
    confidence: Number(result.confidence.toFixed(2)),
    evidence: result.evidence.slice(0, 8),
    chunkCount: rows.length,
    source: 'material',
  };
}

function shouldUseCuratedCs(domainInfo) {
  return !!domainInfo
    && domainInfo.domain === 'cs'
    && Number(domainInfo.confidence || 0) >= 0.62
    && Array.isArray(domainInfo.evidence)
    && domainInfo.evidence.length >= 2;
}

module.exports = {
  classifyText,
  detectMaterialDomain,
  shouldUseCuratedCs,
  _internals: {
    ambiguousEvidence,
    containsPhrase,
    countSignals,
    BUSINESS_SIGNALS,
    SCIENCE_SIGNALS,
    HUMANITIES_SIGNALS,
    SOCIAL_SCIENCE_SIGNALS,
    DATABASE_SIGNALS,
    NETWORK_SIGNALS,
    CYBERSECURITY_SIGNALS,
    SOFTWARE_ENGINEERING_SIGNALS,
    CS_SIGNALS,
    DATA_STRUCTURE_SIGNALS,
  },
};
