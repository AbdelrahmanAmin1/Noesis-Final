'use strict';

const sourceTextQuality = require('./source-text-quality.service');

const STOP_WORDS = new Set([
  'about', 'after', 'also', 'because', 'before', 'between', 'could', 'does', 'from', 'have',
  'into', 'material', 'source', 'that', 'their', 'there', 'these', 'this', 'through', 'using',
  'what', 'when', 'where', 'which', 'while', 'with', 'would', 'uploaded', 'provided',
  'college', 'engineering', 'department', 'school', 'faculty', 'introduction', 'overview',
  'different', 'quicker', 'easier', 'data', 'structure', 'structures',
]);

const SOURCE_METADATA_RE = /\b(?:handout|syllabus|course notes|lecture notes|prepared by|written by|thanks to|copyright|all rights reserved|professor|instructor|semester|fall|spring|summer|winter|college of|department of|school of|faculty of)\b|\b[A-Z]{2,6}\s*[-_]?\s*\d{2,4}[A-Z]?\b|#\s*\d+|\bdesign\s*#\s*\d+\b/i;
const INSTITUTION_PREFIX_RE = /^(?:college|department|school|faculty)\s+of\s+[A-Za-z&,\s]{3,90}\s+/i;
const SOURCE_VERB_RE = /\b(?:is|are|means|uses|contains|includes|allows|requires|stores|supports|prevents|refers|occurs|happens|works|provides|represents|defines|consists|follows|adds|removes|reads|keeps|exposes|validates|protects|organizes|describes|controls|changes|connects|depends|compares|trades|causes|creates|returns|illustrates|shows)\b/i;
const DEFINITION_START_RE = /\b(?:a|an|the)\s+[A-Za-z][A-Za-z0-9+#-]{2,}(?:\s+[A-Za-z][A-Za-z0-9+#-]{2,}){0,5}\s+(?:is|are|means|refers|consists|contains|uses|follows|allows|provides|represents|defines)\b/i;
const TITLE_INTRO_PREFIX_RE = /^[A-Za-z][A-Za-z0-9+#&/()'.,\s-]{2,80}\s*[-\u2013\u2014:]\s*(?:introduction|overview)\s+/i;
const LEADING_INTRO_RE = /^(?:introduction|overview)\s*[-\u2013\u2014:]\s*/i;

function clean(value, max = 260) {
  const text = sourceTextQuality.stripSourceNoise(String(value || ''), { preserveNewlines: false })
    .replace(/\s+/g, ' ')
    .replace(/^[-\u2022*\d.)\s]+/, '')
    .trim();
  return text.length > max ? `${text.slice(0, max - 3).trim()}...` : text;
}

function stripLeadingSourceLabels(value, max = 260) {
  let text = clean(value, max)
    .replace(INSTITUTION_PREFIX_RE, '')
    .replace(LEADING_INTRO_RE, '')
    .trim();
  const definition = text.match(DEFINITION_START_RE);
  if (definition && definition.index > 0 && definition.index <= 110) {
    const prefix = text.slice(0, definition.index);
    if (!/[.!?]/.test(prefix)) text = text.slice(definition.index).trim();
  }
  return text.replace(TITLE_INTRO_PREFIX_RE, '').trim();
}

function safeLabel(value) {
  const label = stripLeadingSourceLabels(value, 72)
    .replace(/\b(?:chapter|lecture|lesson|module|unit|part|section|slide|page)\s*#?\s*\d+\b/gi, '')
    .replace(/\b(?:college|department|school|faculty)\s+of\s+[A-Za-z&,\s]{3,90}\b/gi, '')
    .replace(/\b[A-Z]{2,6}\s*[-_]?\s*\d{2,4}[A-Z]?\b/g, '')
    .replace(/[_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!label || label.length < 3 || /^\d+$/.test(label)) return '';
  if (SOURCE_METADATA_RE.test(label) || sourceTextQuality.isWeakHeading(label)) return '';
  return label;
}

function parseKeywords(value) {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed.map(safeLabel).filter(Boolean) : [];
  } catch (_) {
    return [];
  }
}

function sentenceCandidates(text) {
  const normalized = String(text || '')
    .replace(/\r\n/g, '\n')
    .split(/\n+/)
    .map(line => stripLeadingSourceLabels(line, 500))
    .filter(line => line && !(line.length < 32 && sourceTextQuality.isWeakHeading(line)))
    .join(' ');
  const sentences = clean(normalized, 3000)
    .split(/(?<=[.!?])\s+|\s*[;\u2022]\s*/)
    .map(value => stripLeadingSourceLabels(value, 220))
    .filter(value => value.length >= 32 && value.length <= 220)
    .filter(value => !SOURCE_METADATA_RE.test(value))
    .filter(value => SOURCE_VERB_RE.test(value));
  if (sentences.length) return sentences;
  const fallback = stripLeadingSourceLabels(normalized, 220);
  if (SOURCE_METADATA_RE.test(fallback) || sourceTextQuality.isWeakHeading(fallback)) return [];
  return fallback.length >= 32 && SOURCE_VERB_RE.test(fallback) ? [fallback] : [];
}

function importantTerms(value, max = 8) {
  const words = String(value || '').match(/[A-Za-z][A-Za-z0-9+#-]{3,}/g) || [];
  const out = [];
  const seen = new Set();
  for (const word of words) {
    const key = word.toLowerCase();
    if (STOP_WORDS.has(key) || seen.has(key)) continue;
    seen.add(key);
    out.push(word);
    if (out.length >= max) break;
  }
  return out;
}

function factsFromChunks(chunks = []) {
  const facts = [];
  const seen = new Set();
  for (const chunk of chunks) {
    const chunkId = Number(chunk && chunk.id);
    if (!Number.isInteger(chunkId)) continue;
    const labels = [
      ...parseKeywords(chunk.keywords_json),
      chunk.heading,
      chunk.section_title,
      chunk.slide_title,
      chunk.chapter_title,
    ].map(safeLabel).filter(Boolean);
    for (const sentence of sentenceCandidates(chunk.text)) {
      const key = sentence.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const terms = importantTerms(sentence, 8);
      facts.push({
        chunkId,
        sentence,
        label: labels[0] || terms.slice(0, 3).join(' '),
        terms: [...new Set([...labels.slice(0, 3), ...terms])].filter(Boolean),
      });
    }
  }
  return facts;
}

function uniqueOptions(values, max = 4) {
  const out = [];
  const seen = new Set();
  for (const raw of values) {
    const value = stripLeadingSourceLabels(raw, 190);
    const key = value.toLowerCase().replace(/[^a-z0-9]+/g, '');
    if (!value || key.length < 2 || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
    if (out.length >= max) break;
  }
  return out;
}

function uniqueSentenceOptions(values, max = 4) {
  return uniqueOptions(values, max)
    .filter(value => value.length >= 32)
    .filter(value => SOURCE_VERB_RE.test(value))
    .filter(value => !SOURCE_METADATA_RE.test(value));
}

function uniqueTermOptions(values, max = 4) {
  return uniqueOptions(values, max)
    .filter(value => value.length >= 3 && value.length <= 48)
    .filter(value => value.split(/\s+/).length <= 5)
    .filter(value => !SOURCE_METADATA_RE.test(value))
    .filter(value => !sourceTextQuality.isIncompleteLabel(value));
}

function rotateCorrectFirst(options, index) {
  const shift = index % 4;
  if (!shift) return { options, correct_idx: 0 };
  const rotated = [...options.slice(shift), ...options.slice(0, shift)];
  return { options: rotated, correct_idx: (4 - shift) % 4 };
}

function sentenceDistractors(fact, facts) {
  return facts.filter(item => item !== fact).map(item => item.sentence);
}

function statementOptionsFor(fact, facts) {
  return uniqueSentenceOptions([fact.sentence, ...sentenceDistractors(fact, facts)], 4);
}

function factQuestion(fact, facts, index, difficulty) {
  const label = safeLabel(fact.label) || importantTerms(fact.sentence, 3).join(' ');
  if (!label) return null;
  const options = statementOptionsFor(fact, facts);
  if (options.length !== 4) return null;
  const positioned = rotateCorrectFirst(options, index);
  return {
    question: `Which source statement best describes ${label}?`,
    options: positioned.options,
    correct_idx: positioned.correct_idx,
    explanation: fact.sentence,
    difficulty,
    topic: label,
    concept: label,
    question_type: 'concept',
    source_chunk_ids: [fact.chunkId],
  };
}

function appliedQuestion(fact, facts, index, difficulty) {
  const label = safeLabel(fact.label) || importantTerms(fact.sentence, 3).join(' ');
  if (!label) return null;
  const options = statementOptionsFor(fact, facts);
  if (options.length !== 4) return null;
  const positioned = rotateCorrectFirst(options, index + 3);
  return {
    question: `Which source statement would help you apply ${label}?`,
    options: positioned.options,
    correct_idx: positioned.correct_idx,
    explanation: fact.sentence,
    difficulty,
    topic: label,
    concept: label,
    question_type: 'scenario',
    source_chunk_ids: [fact.chunkId],
  };
}

function misconceptionQuestion(fact, facts, index, difficulty) {
  const label = safeLabel(fact.label) || importantTerms(fact.sentence, 3).join(' ');
  if (!label) return null;
  const options = statementOptionsFor(fact, facts);
  if (options.length !== 4) return null;
  const positioned = rotateCorrectFirst(options, index + 1);
  return {
    question: `Which source statement helps avoid a misconception about ${label}?`,
    options: positioned.options,
    correct_idx: positioned.correct_idx,
    explanation: fact.sentence,
    difficulty,
    topic: label,
    concept: label,
    question_type: 'misconception',
    source_chunk_ids: [fact.chunkId],
  };
}

function tradeoffQuestion(fact, facts, index, difficulty) {
  const label = safeLabel(fact.label) || importantTerms(fact.sentence, 3).join(' ');
  if (!label) return null;
  const options = statementOptionsFor(fact, facts);
  if (options.length !== 4) return null;
  const positioned = rotateCorrectFirst(options, index + 2);
  return {
    question: `Which source statement gives the best reason or tradeoff for ${label}?`,
    options: positioned.options,
    correct_idx: positioned.correct_idx,
    explanation: fact.sentence,
    difficulty,
    topic: label,
    concept: label,
    question_type: 'tradeoff',
    source_chunk_ids: [fact.chunkId],
  };
}

function reverseQuestion(fact, facts, index, difficulty) {
  const labels = uniqueTermOptions([
    safeLabel(fact.label),
    ...facts.filter(item => item !== fact).flatMap(item => [safeLabel(item.label), ...(item.terms || [])]),
  ], 4);
  if (labels.length !== 4 || !labels[0]) return null;
  const positioned = rotateCorrectFirst(labels, index + 1);
  return {
    question: `Which concept is most directly connected to this source detail: "${clean(fact.sentence, 150)}"?`,
    options: positioned.options,
    correct_idx: positioned.correct_idx,
    explanation: fact.sentence,
    difficulty,
    topic: labels[0],
    concept: labels[0],
    question_type: 'concept',
    source_chunk_ids: [fact.chunkId],
  };
}

function clozeQuestion(fact, facts, term, index, difficulty) {
  if (!term || term.length < 4) return null;
  const pattern = new RegExp(`\\b${String(term).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
  if (!pattern.test(fact.sentence)) return null;
  const incomplete = clean(fact.sentence.replace(pattern, '_____'), 170);
  const distractors = facts.flatMap(item => item.terms || []).filter(item => item.toLowerCase() !== term.toLowerCase());
  const options = uniqueTermOptions([term, ...distractors], 4);
  if (options.length !== 4) return null;
  const positioned = rotateCorrectFirst(options, index + 2);
  return {
    question: `Which term completes this source-backed statement: "${incomplete}"?`,
    options: positioned.options,
    correct_idx: positioned.correct_idx,
    explanation: fact.sentence,
    difficulty,
    topic: safeLabel(fact.label) || term,
    concept: term,
    question_type: 'concept',
    source_chunk_ids: [fact.chunkId],
  };
}

function buildDeterministicQuiz(chunks = [], count = 6, difficulty = 'medium') {
  const facts = factsFromChunks(chunks);
  const questions = [];
  const seen = new Set();
  const maxQuestions = facts.length < 2 ? Math.min(count, facts.length * 2) : count;
  const add = (question) => {
    if (!question) return;
    const key = question.question.toLowerCase().replace(/[^a-z0-9]+/g, '');
    if (!key || seen.has(key)) return;
    seen.add(key);
    questions.push(question);
  };
  for (let index = 0; index < facts.length && questions.length < maxQuestions; index += 1) {
    add(factQuestion(facts[index], facts, index, difficulty));
  }
  for (let index = 0; index < facts.length && questions.length < maxQuestions; index += 1) {
    add(appliedQuestion(facts[index], facts, index, difficulty));
  }
  for (let index = 0; index < facts.length && questions.length < maxQuestions; index += 1) {
    add(misconceptionQuestion(facts[index], facts, index, difficulty));
  }
  for (let index = 0; index < facts.length && questions.length < maxQuestions; index += 1) {
    add(tradeoffQuestion(facts[index], facts, index, difficulty));
  }
  for (let index = 0; index < facts.length && questions.length < maxQuestions; index += 1) {
    add(reverseQuestion(facts[index], facts, index, difficulty));
  }
  for (let factIndex = 0; factIndex < facts.length && questions.length < maxQuestions; factIndex += 1) {
    const fact = facts[factIndex];
    for (let termIndex = 0; termIndex < fact.terms.length && questions.length < maxQuestions; termIndex += 1) {
      add(clozeQuestion(fact, facts, fact.terms[termIndex], factIndex + termIndex, difficulty));
    }
  }
  return { questions: questions.slice(0, count), factCount: facts.length };
}

module.exports = {
  buildDeterministicQuiz,
  factsFromChunks,
};
