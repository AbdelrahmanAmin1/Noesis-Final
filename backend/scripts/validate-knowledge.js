'use strict';

const fs = require('fs');
const path = require('path');
const knowledge = require('../services/knowledge.service');

const strict = process.argv.includes('--strict');
const errors = [];
const warnings = [];
const ids = new Map();
const placeholderPattern = /\b(todo|tbd|placeholder|lorem ipsum|replace this|coming soon)\b/i;
const complexityDomains = new Set(['data-structures', 'algorithms', 'big-o']);

function rel(file) {
  return path.relative(path.join(__dirname, '..'), file).replace(/\\/g, '/');
}

function fail(file, message) {
  errors.push(`${rel(file)}: ${message}`);
}

function warn(file, message) {
  warnings.push(`${rel(file)}: ${message}`);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function ensureString(file, topic, field, min = 1) {
  if (!isNonEmptyString(topic[field]) || topic[field].trim().length < min) {
    fail(file, `missing or too-short "${field}"`);
  }
}

function ensureArray(file, topic, field, min = 1) {
  if (!Array.isArray(topic[field]) || topic[field].length < min) {
    fail(file, `missing or empty "${field}"`);
  }
}

function hasPlaceholder(value) {
  if (typeof value === 'string') return placeholderPattern.test(value);
  if (Array.isArray(value)) return value.some(hasPlaceholder);
  if (value && typeof value === 'object') return Object.values(value).some(hasPlaceholder);
  return false;
}

function validateCodeExamples(file, topic) {
  ensureArray(file, topic, 'codeExamples');
  for (const [index, example] of (topic.codeExamples || []).entries()) {
    if (!example || typeof example !== 'object') {
      fail(file, `codeExamples[${index}] must be an object`);
      continue;
    }
    if (!isNonEmptyString(example.language)) fail(file, `codeExamples[${index}] missing language`);
    if (!isNonEmptyString(example.title)) fail(file, `codeExamples[${index}] missing title`);
    if (!isNonEmptyString(example.code) && !isNonEmptyString(example.content)) {
      fail(file, `codeExamples[${index}] missing code`);
    }
    if (topic.schemaVersion === 1 || strict) {
      if (!Array.isArray(example.walkthrough) || !example.walkthrough.length) {
        fail(file, `codeExamples[${index}] missing walkthrough`);
      } else {
        for (const [walkIndex, step] of example.walkthrough.entries()) {
          if (!step || typeof step !== 'object') {
            fail(file, `codeExamples[${index}].walkthrough[${walkIndex}] must be an object`);
            continue;
          }
          if (!isNonEmptyString(step.lineRange)) fail(file, `codeExamples[${index}].walkthrough[${walkIndex}] missing lineRange`);
          if (!isNonEmptyString(step.text)) fail(file, `codeExamples[${index}].walkthrough[${walkIndex}] missing text`);
        }
      }
    }
  }
}

function validEdge(edge) {
  if (Array.isArray(edge)) return edge.length >= 2 && isNonEmptyString(edge[0]) && isNonEmptyString(edge[1]);
  if (edge && typeof edge === 'object') {
    return isNonEmptyString(edge.from || edge.source) && isNonEmptyString(edge.to || edge.target);
  }
  return false;
}

function validateDiagrams(file, topic) {
  ensureArray(file, topic, 'diagrams');
  for (const [index, diagram] of (topic.diagrams || []).entries()) {
    if (!diagram || typeof diagram !== 'object') {
      fail(file, `diagrams[${index}] must be an object`);
      continue;
    }
    if (!isNonEmptyString(diagram.type)) fail(file, `diagrams[${index}] missing type`);
    if (topic.schemaVersion === 1 || strict) {
      if (!isNonEmptyString(diagram.title)) fail(file, `diagrams[${index}] missing title`);
    }
    if (!Array.isArray(diagram.nodes) || !diagram.nodes.length) fail(file, `diagrams[${index}] missing nodes`);
    if (!Array.isArray(diagram.edges)) fail(file, `diagrams[${index}] missing edges array`);
    for (const [edgeIndex, edge] of (diagram.edges || []).entries()) {
      if (!validEdge(edge)) fail(file, `diagrams[${index}].edges[${edgeIndex}] must connect two nodes`);
    }
    if (!isNonEmptyString(diagram.caption)) fail(file, `diagrams[${index}] missing caption`);
  }
}

function validateMistakes(file, topic) {
  ensureArray(file, topic, 'commonMistakes');
  for (const [index, mistake] of (topic.commonMistakes || []).entries()) {
    if (typeof mistake === 'string') {
      if (mistake.trim().length < 10) fail(file, `commonMistakes[${index}] too short`);
    } else if (mistake && typeof mistake === 'object') {
      if (!isNonEmptyString(mistake.mistake)) fail(file, `commonMistakes[${index}] missing mistake`);
      if (!isNonEmptyString(mistake.correction)) fail(file, `commonMistakes[${index}] missing correction`);
    } else {
      fail(file, `commonMistakes[${index}] must be a string or object`);
    }
  }
}

function validateQuiz(file, topic) {
  ensureArray(file, topic, 'miniQuiz');
  for (const [index, item] of (topic.miniQuiz || []).entries()) {
    if (!item || typeof item !== 'object') {
      fail(file, `miniQuiz[${index}] must be an object`);
      continue;
    }
    if (!isNonEmptyString(item.question)) fail(file, `miniQuiz[${index}] missing question`);
    if (!isNonEmptyString(item.answer)) fail(file, `miniQuiz[${index}] missing answer`);
    if (!isNonEmptyString(item.explanation)) fail(file, `miniQuiz[${index}] missing explanation`);
  }
}

function validateFlashcards(file, topic) {
  ensureArray(file, topic, 'flashcards');
  for (const [index, card] of (topic.flashcards || []).entries()) {
    if (!card || typeof card !== 'object') {
      fail(file, `flashcards[${index}] must be an object`);
      continue;
    }
    if (!isNonEmptyString(card.front)) fail(file, `flashcards[${index}] missing front`);
    if (!isNonEmptyString(card.back)) fail(file, `flashcards[${index}] missing back`);
  }
}

function validateSource(file, topic, legacy = false) {
  if (!topic.source || typeof topic.source !== 'object') {
    legacy ? warn(file, 'legacy topic missing source metadata') : fail(file, 'missing source metadata');
    return;
  }
  if (!isNonEmptyString(topic.source.type)) fail(file, 'source missing type');
  if (!isNonEmptyString(topic.source.license)) fail(file, 'source missing license');
}

function validateV1(file, topic) {
  const requiredStrings = ['id', 'domain', 'topic', 'difficulty', 'definition', 'deepExplanation', 'whyItMatters', 'analogy'];
  const requiredArrays = ['aliases', 'prerequisites', 'nextTopics', 'bestPractices', 'visualTemplates'];

  if (topic.schemaVersion !== 1) fail(file, 'schemaVersion must be 1');
  for (const field of requiredStrings) ensureString(file, topic, field);
  for (const field of requiredArrays) ensureArray(file, topic, field, field === 'prerequisites' ? 0 : 1);
  validateCodeExamples(file, topic);
  validateDiagrams(file, topic);
  validateMistakes(file, topic);
  validateQuiz(file, topic);
  validateFlashcards(file, topic);
  validateSource(file, topic);

  if (complexityDomains.has(topic.domain)) {
    if (!topic.complexity || typeof topic.complexity !== 'object' || !Object.keys(topic.complexity).length) {
      fail(file, `${topic.domain} topic requires non-empty complexity`);
    }
  } else if (!Object.prototype.hasOwnProperty.call(topic, 'complexity')) {
    fail(file, 'missing complexity field; use null for OOP topics');
  }
}

function validateLegacy(file, topic) {
  ensureString(file, topic, 'topic');
  ensureArray(file, topic, 'aliases');
  ensureString(file, topic, 'definition', 20);
  ensureString(file, topic, 'deepExplanation', 40);
  validateCodeExamples(file, topic);
  validateDiagrams(file, topic);
  validateMistakes(file, topic);
  validateSource(file, topic, true);
  if (!Array.isArray(topic.miniQuiz) && !Array.isArray(topic.practiceQuestions)) {
    warn(file, 'legacy topic should have miniQuiz or practiceQuestions');
  }
}

function validateTopic(file, topic) {
  if (hasPlaceholder(topic)) fail(file, 'contains placeholder text');

  const id = topic.id || knowledge.normalizeKey(topic.topic).replace(/-/g, '_');
  if (!id) fail(file, 'missing id/topic identifier');
  if (ids.has(id)) fail(file, `duplicate topic id "${id}" also used by ${rel(ids.get(id))}`);
  ids.set(id, file);

  if (strict || topic.schemaVersion === 1) validateV1(file, topic);
  else validateLegacy(file, topic);
}

function main() {
  const files = knowledge.listKnowledgeFiles();
  if (!files.length) {
    console.error('No knowledge topic files found.');
    process.exit(1);
  }

  for (const file of files) {
    try {
      const topic = JSON.parse(fs.readFileSync(file, 'utf8'));
      validateTopic(file, topic);
    } catch (err) {
      fail(file, `invalid JSON: ${err.message}`);
    }
  }

  for (const item of warnings) console.warn(`WARN ${item}`);
  if (errors.length) {
    for (const item of errors) console.error(`ERROR ${item}`);
    console.error(`Knowledge validation failed: ${errors.length} error(s), ${warnings.length} warning(s).`);
    process.exit(1);
  }

  console.log(`Knowledge validation passed: ${files.length} file(s), ${warnings.length} warning(s), strict=${strict}.`);
}

main();
