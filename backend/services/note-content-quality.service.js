'use strict';

const sourceTextQuality = require('./source-text-quality.service');

const ALLOWED_CONCEPTS = new Set([
  'data structure',
  'data structures',
  'tree',
  'trees',
  'tree adt',
  'root',
  'root node',
  'node',
  'edge',
  'parent',
  'child',
  'children',
  'sibling',
  'siblings',
  'degree',
  'internal node',
  'leaf',
  'leaf node',
  'level',
  'height',
  'depth',
  'subtree',
  'forest',
  'binary tree',
  'binary trees',
  'binary search tree',
  'binary search trees',
  'bst',
  'traversal',
  'preorder',
  'inorder',
  'postorder',
  'search',
  'insertion',
  'insert',
  'deletion',
  'delete',
  'hash',
  'hashing',
  'hash table',
  'hash tables',
  'hash function',
  'collision',
  'collisions',
  'bucket',
  'buckets',
  'chaining',
  'probing',
  'load factor',
  'rehashing',
]);

const ACADEMIC_METADATA_RE = /\b(?:assistant professor|associate professor|professor|lecturer|instructor|college|university|institute|department|school of|faculty of|copyright|all rights reserved|prepared by|presented by|compiled by|author|watermark)\b/i;
const PAGE_OR_UNIT_RE = /^(?:unit|page|slide|chapter|lecture|module|section|p\.)\s*#?\s*\d*[a-z]?$/i;
const PERSON_LINE_RE = /^(?:dr\.?\s+|prof\.?\s+)?[A-Z][A-Z.'-]*(?:\s+[A-Z][A-Z.'-]*){1,4}$/;
const ALL_CAPS_RE = /^[A-Z0-9&.'()/-]+(?:\s+[A-Z0-9&.'()/-]+){1,8}$/;
const TOKEN_STOPWORDS = new Set(['and', 'the', 'of', 'for', 'with', 'from', 'data', 'structures', 'structure']);

function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalize(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9+#]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function isAllowedConcept(value) {
  const key = normalize(value);
  if (!key) return false;
  if (ALLOWED_CONCEPTS.has(key)) return true;
  return /\b(?:tree|bst|binary search|hash|traversal|root|leaf|height|depth|subtree|forest|collision|bucket|chaining|probing)\b/.test(key);
}

function splitLines(value) {
  return String(value || '')
    .replace(/\r/g, '\n')
    .split(/\n+|(?<=\.)\s+(?=[A-Z][A-Za-z .'-]{2,80}(?:\n|$))/)
    .map(line => line.replace(/^[\s\-*.:;#\d)]+/, '').trim())
    .filter(Boolean);
}

function isMetadataLine(value) {
  const text = clean(value);
  const key = normalize(text);
  if (!text || isAllowedConcept(text)) return false;
  if (ACADEMIC_METADATA_RE.test(text)) return true;
  if (PAGE_OR_UNIT_RE.test(text)) return true;
  if (sourceTextQuality.isDocumentMetadata(text)) return true;
  if (PERSON_LINE_RE.test(text) && !/\b(?:TREE|NODE|HASH|BST|SEARCH|INSERT|DELETE|TRAVERSAL)\b/.test(text)) return true;
  return false;
}

function addMetadataTerm(profile, value, reason = 'metadata') {
  const text = clean(value);
  const key = normalize(text);
  if (!key || key.length < 3 || isAllowedConcept(key)) return;
  profile.terms.add(key);
  profile.reasons[key] = reason;
  if (/\b(?:professor|college|university|institute|department|school|prepared by|presented by|author)\b/i.test(text) || PERSON_LINE_RE.test(text)) {
    for (const token of key.split(/\s+/)) {
      if (token.length >= 4 && !TOKEN_STOPWORDS.has(token) && !isAllowedConcept(token)) {
        profile.terms.add(token);
        profile.reasons[token] = `${reason}_token`;
      }
    }
  }
}

function lineKey(value) {
  return normalize(value);
}

function collectTextPieces({ chunks = [], materialTitle = '', sourceVisuals = [] } = {}) {
  const pieces = [materialTitle];
  for (const chunk of chunks || []) {
    pieces.push(chunk && chunk.heading, chunk && chunk.chapter_title, chunk && chunk.section_title, chunk && chunk.slide_title, chunk && chunk.text);
    try {
      const keywords = JSON.parse(chunk && chunk.keywords_json || '[]');
      if (Array.isArray(keywords)) pieces.push(...keywords);
    } catch (_) {}
  }
  for (const visual of sourceVisuals || []) {
    pieces.push(
      visual && (visual.heading || visual.heading_text),
      visual && (visual.caption || visual.visualTypeGuess || visual.visual_type_guess),
      visual && (visual.nearbyText || visual.nearby_text),
      visual && (visual.ocrText || visual.ocr_text),
      visual && visual.evidence
    );
  }
  return pieces.filter(Boolean).map(String);
}

function buildMetadataProfile(opts = {}) {
  const profile = { terms: new Set(), repeated: new Set(), reasons: {} };
  const pieces = collectTextPieces(opts);
  const counts = new Map();
  for (const piece of pieces) {
    for (const line of splitLines(piece)) {
      const key = lineKey(line);
      if (!key || key.length < 3) continue;
      counts.set(key, (counts.get(key) || 0) + 1);
      if (isMetadataLine(line)) addMetadataTerm(profile, line, 'academic_metadata');
    }
  }
  for (const piece of pieces) {
    for (const line of splitLines(piece)) {
      const key = lineKey(line);
      if (!key || isAllowedConcept(key)) continue;
      const count = counts.get(key) || 0;
      if (count >= 3 && (ALL_CAPS_RE.test(line) || sourceTextQuality.isDocumentMetadata(line) || PAGE_OR_UNIT_RE.test(line))) {
        profile.repeated.add(key);
        addMetadataTerm(profile, line, 'repeated_header');
      }
    }
  }
  return profile;
}

function containsMetadata(value, profile) {
  const text = clean(value);
  const key = normalize(text);
  if (!text || isAllowedConcept(text)) return false;
  if (isMetadataLine(text)) return true;
  if (profile && profile.repeated && profile.repeated.has(key)) return true;
  if (!profile || !profile.terms) return false;
  for (const term of profile.terms) {
    if (!term || isAllowedConcept(term)) continue;
    const re = new RegExp(`(^|[^a-z0-9])${escapeRegExp(term).replace(/\\ /g, '\\s+')}([^a-z0-9]|$)`, 'i');
    if (re.test(key)) return true;
  }
  return false;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function removeMetadataTerms(value, profile) {
  let text = String(value || '');
  if (!text) return '';
  text = sourceTextQuality.stripSourceNoise(text);
  const lines = splitLines(text).filter(line => !containsMetadata(line, profile));
  if (lines.length && lines.join(' ').length >= Math.max(8, clean(text).length * 0.35)) text = lines.join('\n');
  if (profile && profile.terms) {
    const terms = [...profile.terms].filter(term => term.length >= 3 && !isAllowedConcept(term)).sort((a, b) => b.length - a.length);
    for (const term of terms) {
      const escaped = escapeRegExp(term).replace(/\\ /g, '\\s+');
      text = text.replace(new RegExp(`(^|[^a-zA-Z0-9])${escaped}(?=[^a-zA-Z0-9]|$)`, 'gi'), '$1');
    }
  }
  return text
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/([,;:/|-]\s*){2,}/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function cleanLabel(value, profile, fallback = '') {
  const raw = clean(value);
  if (!raw) return fallback;
  const cleaned = clean(removeMetadataTerms(raw, profile));
  if (!cleaned || containsMetadata(cleaned, profile) || sourceTextQuality.isWeakHeading(cleaned)) return fallback;
  return cleaned;
}

function sanitizeKeywordsJson(value, profile) {
  try {
    const parsed = JSON.parse(value || '[]');
    if (!Array.isArray(parsed)) return value;
    return JSON.stringify(parsed.map(item => cleanLabel(item, profile)).filter(Boolean).slice(0, 12));
  } catch (_) {
    return value;
  }
}

function sanitizeChunks(chunks = [], profile = buildMetadataProfile({ chunks })) {
  return (chunks || []).map(chunk => ({
    ...chunk,
    text: removeMetadataTerms(chunk && chunk.text, profile),
    heading: cleanLabel(chunk && chunk.heading, profile, ''),
    chapter_title: cleanLabel(chunk && chunk.chapter_title, profile, ''),
    section_title: cleanLabel(chunk && chunk.section_title, profile, ''),
    slide_title: cleanLabel(chunk && chunk.slide_title, profile, ''),
    keywords_json: sanitizeKeywordsJson(chunk && chunk.keywords_json, profile),
  }));
}

function cleanStringList(values, profile, max = 8) {
  const seen = new Set();
  const out = [];
  for (const value of values || []) {
    const text = cleanLabel(value, profile);
    const key = normalize(text);
    if (!text || !key || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= max) break;
  }
  return out;
}

function cleanCards(cards = [], profile, max = 8) {
  return (cards || [])
    .map(card => ({
      ...card,
      title: cleanLabel(card && card.title, profile, ''),
      text: removeMetadataTerms(card && card.text, profile),
    }))
    .filter(card => card.title || card.text)
    .slice(0, max);
}

function cleanQuiz(quiz = [], profile) {
  return (quiz || [])
    .map(item => {
      const options = cleanStringList(item && item.options, profile, 5);
      const answer = cleanLabel(item && (item.answer || item.correctAnswer), profile, '');
      return {
        ...item,
        question: removeMetadataTerms(item && item.question, profile),
        options,
        answer: answer || options[0] || '',
        explanation: removeMetadataTerms(item && item.explanation, profile),
      };
    })
    .filter(item => item.question && !containsMetadata(item.question, profile))
    .slice(0, 3);
}

function cleanDiagram(diagram, profile) {
  if (!diagram || typeof diagram !== 'object') return diagram;
  const nodes = (diagram.nodes || [])
    .map(node => {
      if (typeof node === 'string') return cleanLabel(node, profile, '');
      if (!node || typeof node !== 'object') return node;
      const label = cleanLabel(node.label || node.name || node.id, profile, '');
      return label ? { ...node, label, name: node.name ? label : node.name, id: node.id ? label : node.id } : null;
    })
    .filter(Boolean)
    .slice(0, 10);
  const nodeLabels = new Set(nodes.map(node => normalize(typeof node === 'string' ? node : (node.label || node.name || node.id))));
  const edges = (diagram.edges || []).filter(edge => {
    if (!Array.isArray(edge) || edge.length < 2) return true;
    const a = normalize(edge[0]);
    const b = normalize(edge[1]);
    return (!a || nodeLabels.has(a)) && (!b || nodeLabels.has(b));
  });
  return {
    ...diagram,
    nodes,
    edges,
    operations: cleanStringList(diagram.operations || [], profile, 8),
    caption: removeMetadataTerms(diagram.caption || '', profile),
  };
}

function sanitizeSourceVisuals(sourceVisuals = [], profile) {
  return (sourceVisuals || []).map(visual => ({
    ...visual,
    heading: cleanLabel(visual && visual.heading, profile, 'Source visual'),
    caption: cleanLabel(visual && visual.caption, profile, 'Source visual'),
    nearbyText: removeMetadataTerms(visual && (visual.nearbyText || visual.nearby_text), profile),
    ocrText: removeMetadataTerms(visual && (visual.ocrText || visual.ocr_text), profile),
    evidence: removeMetadataTerms(visual && visual.evidence, profile),
    explanation: removeMetadataTerms(visual && visual.explanation, profile),
  }));
}

function fallbackTitleFromSource({ sourceOutline, chunks = [], fallbackTopic = '' } = {}) {
  const terms = [
    sourceOutline && sourceOutline.mainTopic,
    ...((sourceOutline && sourceOutline.keyConcepts) || []),
    ...((sourceOutline && sourceOutline.majorTopics) || []).flatMap(item => [item && item.topic, ...((item && item.terms) || [])]),
  ].map(clean).filter(Boolean);
  const hay = [...terms, ...(chunks || []).flatMap(chunk => [chunk && chunk.heading, chunk && chunk.text])].join(' ').toLowerCase();
  const hasTree = /\b(tree|trees|root|leaf|subtree|binary tree)\b/.test(hay);
  const hasBst = /\b(binary search tree|bst|left subtree|right subtree)\b/.test(hay);
  const hasHash = /\b(hash|hashing|hash table|hash function|collision)\b/.test(hay);
  if (hasBst && hasTree && hasHash) return 'Binary Search Trees, Tree Terminology, and Hashing';
  if (hasBst && hasTree) return 'Binary Search Trees and Tree Terminology';
  if (hasHash) return 'Hashing and Hash Tables';
  if (hasBst) return 'Binary Search Trees';
  if (hasTree) return 'Trees and Tree Terminology';
  const cleanTerms = cleanStringList(terms, buildMetadataProfile({ chunks }), 3);
  if (cleanTerms.length >= 2) return cleanTerms.join(' / ');
  return cleanTerms[0] || clean(fallbackTopic) || 'Study Notes from Uploaded Material';
}

function safeTitle(value, opts = {}) {
  const profile = opts.profile || buildMetadataProfile({ chunks: opts.chunks, materialTitle: opts.materialTitle, sourceVisuals: opts.sourceVisuals });
  const cleaned = cleanLabel(value, profile, '');
  if (cleaned && !containsMetadata(cleaned, profile) && !/^study notes from uploaded material$/i.test(cleaned)) return cleaned;
  return fallbackTitleFromSource({ sourceOutline: opts.sourceOutline, chunks: opts.chunks, fallbackTopic: opts.fallbackTopic });
}

function sanitizeLesson(lesson, opts = {}) {
  const profile = opts.profile || buildMetadataProfile({ chunks: opts.chunks, materialTitle: opts.materialTitle, sourceVisuals: opts.sourceVisuals });
  if (!lesson || typeof lesson !== 'object') return lesson;
  const sourceOutline = opts.sourceOutline || {};
  const topic = safeTitle(lesson.topic || opts.fallbackTopic, {
    profile,
    sourceOutline,
    chunks: opts.chunks,
    fallbackTopic: opts.fallbackTopic,
    materialTitle: opts.materialTitle,
    sourceVisuals: opts.sourceVisuals,
  });
  const sections = (lesson.sections || [])
    .map(section => ({
      ...section,
      title: cleanLabel(section && section.title, profile, section && section.type ? String(section.type).replace(/_/g, ' ') : ''),
      content: removeMetadataTerms(section && section.content, profile),
      cards: cleanCards(section && section.cards, profile, 8),
      code: section && section.code,
      diagram: cleanDiagram(section && section.diagram, profile),
      callouts: (section && section.callouts || []).map(callout => ({ ...callout, text: removeMetadataTerms(callout && callout.text, profile) })).filter(callout => callout.text),
      quiz: cleanQuiz(section && section.quiz, profile),
      sourceVisuals: sanitizeSourceVisuals(section && section.sourceVisuals || [], profile),
    }))
    .filter(section => section.title && !containsMetadata(section.title, profile));
  const studyGuide = lesson.studyGuide || {};
  return {
    ...lesson,
    topic,
    learningObjectives: cleanStringList(lesson.learningObjectives || [], profile, 6),
    prerequisites: cleanStringList(lesson.prerequisites || [], profile, 6),
    studyGuide: {
      ...studyGuide,
      whatYouWillLearn: cleanStringList(studyGuide.whatYouWillLearn || [], profile, 6),
      keyConcepts: cleanStringList(studyGuide.keyConcepts || [], profile, 8),
      suggestedOrder: cleanStringList(studyGuide.suggestedOrder || [], profile, 8),
      prerequisites: cleanStringList(studyGuide.prerequisites || [], profile, 6),
      commonMistakes: (studyGuide.commonMistakes || []).map(item => ({
        mistake: cleanLabel(item && (item.mistake || item.title), profile, ''),
        correction: removeMetadataTerms(item && (item.correction || item.text), profile),
      })).filter(item => item.mistake || item.correction).slice(0, 5),
      checkpoints: cleanStringList(studyGuide.checkpoints || [], profile, 6),
    },
    sections,
    relatedTopics: cleanStringList(lesson.relatedTopics || [], profile, 6),
    sourceVisuals: sanitizeSourceVisuals(lesson.sourceVisuals || [], profile),
  };
}

function collectVisibleFields(lesson) {
  const fields = [];
  const push = (path, value) => {
    if (typeof value === 'string' && value.trim()) fields.push({ path, value });
  };
  push('topic', lesson && lesson.topic);
  for (const [i, value] of (lesson && lesson.learningObjectives || []).entries()) push(`learningObjectives.${i}`, value);
  const guide = lesson && lesson.studyGuide || {};
  for (const key of ['whatYouWillLearn', 'keyConcepts', 'suggestedOrder', 'prerequisites', 'checkpoints']) {
    for (const [i, value] of (guide[key] || []).entries()) push(`studyGuide.${key}.${i}`, value);
  }
  for (const [i, item] of (guide.commonMistakes || []).entries()) {
    push(`studyGuide.commonMistakes.${i}.mistake`, item && item.mistake);
    push(`studyGuide.commonMistakes.${i}.correction`, item && item.correction);
  }
  for (const [i, section] of (lesson && lesson.sections || []).entries()) {
    push(`sections.${i}.title`, section && section.title);
    push(`sections.${i}.content`, section && section.content);
    for (const [ci, card] of (section && section.cards || []).entries()) {
      push(`sections.${i}.cards.${ci}.title`, card && card.title);
      push(`sections.${i}.cards.${ci}.text`, card && card.text);
    }
    for (const [ni, node] of ((section && section.diagram && section.diagram.nodes) || []).entries()) {
      push(`sections.${i}.diagram.nodes.${ni}`, typeof node === 'string' ? node : (node && (node.label || node.name || node.id)));
    }
    for (const [qi, q] of (section && section.quiz || []).entries()) {
      push(`sections.${i}.quiz.${qi}.question`, q && q.question);
      for (const [oi, opt] of (q && q.options || []).entries()) push(`sections.${i}.quiz.${qi}.options.${oi}`, opt);
      push(`sections.${i}.quiz.${qi}.answer`, q && q.answer);
    }
  }
  for (const [i, value] of (lesson && lesson.relatedTopics || []).entries()) push(`relatedTopics.${i}`, value);
  return fields;
}

function validateLesson(lesson, opts = {}) {
  const profile = opts.profile || buildMetadataProfile({ chunks: opts.chunks, materialTitle: opts.materialTitle, sourceVisuals: opts.sourceVisuals });
  const hits = collectVisibleFields(lesson).filter(field => containsMetadata(field.value, profile));
  const keyFields = hits.filter(hit => /^(topic|studyGuide\.keyConcepts|sections\.\d+\.quiz|sections\.\d+\.diagram|relatedTopics)/.test(hit.path));
  return {
    passed: hits.length === 0 && keyFields.length === 0,
    hits,
    keyFields,
    reasonCodes: hits.length ? ['note_metadata_contamination'] : [],
  };
}

function slug(value) {
  return normalize(value).replace(/\s+/g, '-').replace(/^-+|-+$/g, '');
}

function tagsForLesson(lesson, opts = {}) {
  const profile = opts.profile || buildMetadataProfile({ chunks: opts.chunks, materialTitle: opts.materialTitle, sourceVisuals: opts.sourceVisuals });
  const fields = [
    lesson && lesson.topic,
    ...((lesson && lesson.studyGuide && lesson.studyGuide.keyConcepts) || []),
    ...((opts.sourceOutline && opts.sourceOutline.keyConcepts) || []),
  ];
  const hay = fields.join(' ').toLowerCase();
  const tags = [];
  const add = (value) => {
    const cleanValue = cleanLabel(value, profile, '');
    const item = slug(cleanValue);
    if (!item || tags.includes(item) || containsMetadata(cleanValue, profile)) return;
    tags.push(item);
  };
  if (/\b(tree|bst|binary search)\b/.test(hay)) add('trees');
  if (/\b(binary search tree|bst)\b/.test(hay)) add('binary search tree');
  if (/\b(hash|hashing|collision)\b/.test(hay)) add('hashing');
  if (/\b(traversal|preorder|inorder|postorder)\b/.test(hay)) add('traversal');
  if ((lesson && lesson.lessonType) === 'data_structure' || /\b(data structure|tree|hash|stack|queue|list)\b/.test(hay)) add('data structures');
  for (const field of fields) add(field);
  return tags.slice(0, 6);
}

function retryGuidance(validation) {
  const examples = (validation && validation.hits || []).slice(0, 8).map(hit => `${hit.path}: ${hit.value}`).join('\n');
  return [
    'Strict Notes metadata repair:',
    '- Rewrite the note using only academic learning concepts.',
    '- Remove author names, professor names, college/university names, department names, page headers, watermarks, dates, and isolated unit/page labels from every visible field.',
    '- Do not use metadata as title text, tags, key concepts, diagram nodes, question options, answers, related topics, or next steps.',
    '- For Trees/BST/Hashing, focus on tree terminology, binary trees, BST operations/traversal, and hashing concepts.',
    examples ? `Rejected visible metadata examples:\n${examples}` : '',
  ].filter(Boolean).join('\n');
}

module.exports = {
  ALLOWED_CONCEPTS,
  buildMetadataProfile,
  containsMetadata,
  removeMetadataTerms,
  cleanLabel,
  sanitizeChunks,
  sanitizeSourceVisuals,
  sanitizeLesson,
  safeTitle,
  validateLesson,
  tagsForLesson,
  retryGuidance,
  _internals: {
    normalize,
    isMetadataLine,
    isAllowedConcept,
  },
};
