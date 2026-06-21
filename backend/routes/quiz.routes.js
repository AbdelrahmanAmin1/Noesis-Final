'use strict';

const express = require('express');
const { z } = require('zod');
const { requireAuth } = require('../middleware/auth');
const { aiLimiter } = require('../middleware/rateLimit');
const { getDb } = require('../config/db');
const env = require('../config/env');
const { HttpError } = require('../middleware/error');
const ai = require('../services/ai.service');
const prompts = require('../utils/prompts');
const { parseJsonSafe } = require('../utils/jsonSafe');
const { retrieveLessonContext, groundingTier: computeGroundingTier } = require('../services/rag.service');
const educationalContext = require('../services/educational-context.service');
const domainDetection = require('../services/domain-detection.service');
const materialUnderstanding = require('../services/material-understanding.service');
const sourceGroundingJudge = require('../services/source-grounding-judge.service');
const sourceTopicPlans = require('../services/source-topic-plan.service');
const materialTopicMap = require('../services/material-topic-map.service');
const { recordConceptOutcome } = require('../services/mastery.service');
const log = require('../utils/logger');
const gamification = require('../services/gamification.service');
const materials = require('../services/material.service');
const sourceTextQuality = require('../services/source-text-quality.service');

const router = express.Router();
const nowIso = () => new Date().toISOString();
const PLACEHOLDER_RE = /\b(what is this topic|define the concept|true or false:?\s*this is important|example here|definition goes here|placeholder|todo|lorem ipsum)\b/i;
const GENERIC_QUIZ_RE = /\b(?:according to|based on|from|in) (?:the )?(?:uploaded|provided|source|course|study) (?:material|document|text|content|notes?)\b|\bwhich statement (?:best )?(?:describes|summarizes)\b|\bwhat (?:is|does) (?:this|the) (?:document|material|handout|file|slide deck)\b/i;
const DOCUMENT_REFERENCE_RE = /\b(?:uploaded|provided|source) (?:material|document|text|content|file|pdf|notes?)\b|\b(?:document|file) (?:name|title)\b|\b(?:handout|syllabus|slide deck|lecture notes|course notes|worksheet)\b/i;
const COURSE_CODE_RE = /\b[A-Z]{2,6}\s*[-_]?\s*\d{2,4}[A-Z]?\b/i;
const TERM_DATE_RE = /\b(?:fall|spring|summer|winter|semester|term)\s*[,:'-]?\s*(?:19|20)\d{2}(?:\s*[-/]\s*\d{2,4})?\b/i;
const CREDIT_RE = /\b(?:thanks|credit|courtesy) to\b|\b(?:prepared|written|created|compiled|presented) by\b|\b(?:author|instructor|professor|copyright|all rights reserved)\b/i;
const FILE_NAME_RE = /\b[^\s]+\.(?:pdf|pptx?|docx?|txt|md)\b/i;
const NUMBERED_HEADING_RE = /^(?:chapter|lecture|lesson|module|unit|part|section|slide|page)\s*#?\s*\d+\b|^[^.!?]{2,80}\s+#\s*\d+\b/i;
const FILELIKE_TITLE_RE = /^\d{1,4}[-_ ]*[A-Za-z][A-Za-z0-9_-]{3,}$|[_]{1,}|\b(?:notes?|handout|slides?|lecture|chapter|module|worksheet|syllabus)\b/i;
const QUESTION_TYPES = new Set(['concept', 'scenario', 'code_design', 'misconception', 'tradeoff']);
const GENERIC_TOPIC_RE = /^(?:object|objects|class|classes|data|code|design|hash|general|miscellaneous|this concept)$/i;
const GENERIC_STEM_RE = /^(?:how does [^?]{1,45} work|what is true about [^?]+|which (?:idea|detail) is correct)\?$/i;

function generationScope(body = {}) {
  const sourceScope = String(body.sourceScope || body.source_scope || 'material').toLowerCase();
  if (!['material', 'chapter', 'chunk'].includes(sourceScope)) throw new HttpError(400, 'invalid_source_scope');
  return {
    sourceScope,
    chapterId: body.chapter_id ? parseInt(body.chapter_id, 10) : null,
    chunkId: body.chunk_id ? parseInt(body.chunk_id, 10) : null,
  };
}

function validateScope(db, userId, materialId, scope) {
  if (scope.sourceScope === 'chapter') {
    if (!Number.isInteger(scope.chapterId)) throw new HttpError(400, 'missing_chapter_id');
    const row = db.prepare(`
      SELECT c.title
      FROM chapters c
      JOIN materials m ON m.id = c.material_id
      WHERE c.id=? AND c.material_id=? AND m.user_id=?
    `).get(scope.chapterId, materialId, userId);
    if (!row) throw new HttpError(404, 'chapter_not_found');
    return { title: row.title };
  }
  if (scope.sourceScope === 'chunk') {
    if (!Number.isInteger(scope.chunkId)) throw new HttpError(400, 'missing_chunk_id');
    const row = db.prepare(`
      SELECT ch.heading, ch.chapter_title, ch.section_title, ch.slide_title
      FROM chunks ch
      JOIN materials m ON m.id = ch.material_id
      WHERE ch.id=? AND ch.material_id=? AND m.user_id=?
    `).get(scope.chunkId, materialId, userId);
    if (!row) throw new HttpError(404, 'chunk_not_found');
    return { title: row.heading || row.section_title || row.slide_title || row.chapter_title || 'Selected section' };
  }
  return { title: null };
}

// Model output is intentionally parsed loosely here. Individual questions are
// normalized and validated below so one malformed item cannot discard the
// otherwise useful, grounded questions in the same response.
const QuizBatchSchema = z.object({
  questions: z.array(z.record(z.unknown())).min(1),
}).passthrough();

const QUIZ_MIN_QUESTIONS = 2;
const QUIZ_ATTEMPT_TIMEOUT_MS = 45000;
const NON_RETRYABLE_PROVIDER_ERRORS = new Set([
  'ai_auth_failed',
  'ai_model_missing',
  'ai_rate_limited',
  'ai_unavailable',
  'ai_timeout',
]);

function normalizeMetadata(value) {
  return stripInternalRefs(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function isDocumentMetadata(value, metadataPhrases = []) {
  const text = stripInternalRefs(value);
  if (!text) return true;
  if (DOCUMENT_REFERENCE_RE.test(text) || COURSE_CODE_RE.test(text) || TERM_DATE_RE.test(text)) return true;
  if (CREDIT_RE.test(text) || FILE_NAME_RE.test(text) || NUMBERED_HEADING_RE.test(text)) return true;
  const normalized = normalizeMetadata(text);
  return metadataPhrases.some(phrase => normalized.includes(phrase));
}

function buildMetadataPhrases(materialTitle, chunks = []) {
  const candidates = [
    materialTitle,
    ...chunks.flatMap(c => [c.heading, c.chapter_title, c.section_title, c.slide_title]),
  ];
  return [...new Set(candidates
    .map(stripInternalRefs)
    .filter(text => text && (
      FILELIKE_TITLE_RE.test(text)
      || COURSE_CODE_RE.test(text)
      || TERM_DATE_RE.test(text)
      || NUMBERED_HEADING_RE.test(text)
      || CREDIT_RE.test(text)
    ))
    .map(normalizeMetadata)
    .filter(text => text.length >= 4))];
}

function stripInternalRefs(value) {
  const stripped = String(value || '')
    .replace(/\[chunk\s*:\s*\d+\]/gi, '')
    .replace(/\[source[_\s-]*chunk\s*:\s*\d+\]/gi, '')
    .replace(/"?source[_\s-]*chunk[_\s-]*id"?\s*:?\s*\d+/gi, '')
    .replace(/\bchunk\s*id\s*#?\s*\d+\b/gi, '')
    .replace(/sourceChunkIds?\s*:\s*\[[^\]]*\]/gi, '')
    .replace(/\b(debug|trace|raw curated json|internal metadata)\s*:\s*/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  return sourceTextQuality.stripSourceNoise(stripped, { preserveNewlines: false })
    .replace(/\s+/g, ' ')
    .trim();
}

function optionKey(value) {
  return stripInternalRefs(value).toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function sanitizeQuestion(question, difficulty, metadataPhrases = []) {
  if (!question || typeof question !== 'object') return null;
  const prompt = stripInternalRefs(question.question);
  const explanation = stripInternalRefs(question.explanation);
  const options = Array.isArray(question.options)
    ? question.options.map(stripInternalRefs).filter(Boolean).slice(0, 4)
    : [];
  const optionKeys = new Set(options.map(optionKey).filter(Boolean));
  const correctIdx = Number(question.correct_idx);
  if (prompt.length < 12 || PLACEHOLDER_RE.test(prompt) || GENERIC_QUIZ_RE.test(prompt) || isDocumentMetadata(prompt, metadataPhrases)) return null;
  if (explanation.length < 12 || PLACEHOLDER_RE.test(explanation) || isDocumentMetadata(explanation, metadataPhrases)) return null;
  if (sourceTextQuality.hasBrokenWordArtifact(prompt) || sourceTextQuality.hasBrokenWordArtifact(explanation)) return null;
  if (options.length !== 4 || optionKeys.size !== 4) return null;
  if (!Number.isInteger(correctIdx) || correctIdx < 0 || correctIdx > 3) return null;
  if (options.some(option => isDocumentMetadata(option, metadataPhrases))) return null;
  if (options.some(option => sourceTextQuality.hasBrokenWordArtifact(option))) return null;
  const topic = stripInternalRefs(question.topic || question.concept || inferTopic(prompt));
  if (isDocumentMetadata(topic, metadataPhrases)) return null;
  return {
    question: prompt,
    options,
    correct_idx: correctIdx,
    explanation,
    difficulty: ['easy', 'medium', 'hard'].includes(question.difficulty) ? question.difficulty : difficulty,
    topic: topic || inferTopic(prompt),
    concept: stripInternalRefs(question.concept || topic),
    question_type: stripInternalRefs(question.question_type),
    source_chunk_ids: Array.isArray(question.source_chunk_ids)
      ? [...new Set(question.source_chunk_ids.map(Number).filter(Number.isInteger))].slice(0, 3)
      : [],
  };
}

function normalizedWordForms(value) {
  const token = String(value || '').toLowerCase();
  const forms = new Set([token]);
  if (/^[a-z]{4,}ies$/.test(token)) forms.add(`${token.slice(0, -3)}y`);
  if (/^[a-z]{4,}es$/.test(token)) forms.add(token.slice(0, -2));
  if (/^[a-z]{4,}s$/.test(token) && !token.endsWith('ss')) forms.add(token.slice(0, -1));
  if (/^[a-z]{5,}ing$/.test(token)) forms.add(token.slice(0, -3));
  if (/^[a-z]{4,}ed$/.test(token)) forms.add(token.slice(0, -2));
  return forms;
}

function significantWords(value) {
  const stop = new Set([
    'about', 'after', 'because', 'before', 'being', 'could', 'does', 'from', 'have', 'into',
    'should', 'their', 'there', 'these', 'they', 'this', 'through', 'using', 'what', 'when',
    'where', 'which', 'while', 'with', 'would', 'the', 'and', 'for', 'are', 'that', 'you',
  ]);
  const rawTokens = String(value || '').match(/[A-Za-z][A-Za-z0-9+#]*(?:\([^\s()]{1,12}\))?|\d+(?:\.\d+)?/g) || [];
  const words = new Set();
  for (const raw of rawTokens) {
    const normalized = raw.toLowerCase();
    const meaningful = normalized.length >= 2 || /^\d/.test(normalized) || /^o\(/.test(normalized);
    if (!meaningful || stop.has(normalized)) continue;
    for (const form of normalizedWordForms(normalized)) words.add(form);
  }
  return words;
}

function validateGeneratedQuiz(data, chunks, count, difficulty, metadataPhrases = []) {
  const errors = [];
  const warnings = [];
  const rejected = [];
  const rawQuestions = Array.isArray(data && data.questions) ? data.questions : [];
  const chunkById = new Map((chunks || []).map(chunk => [Number(chunk.id), chunk]));
  if (rawQuestions.length !== count) warnings.push(`expected_${count}_questions_got_${rawQuestions.length}`);
  const questions = [];
  const seen = new Set();

  rawQuestions.slice(0, count).forEach((raw, index) => {
    const number = index + 1;
    const questionErrors = [];
    const question = sanitizeQuestion(raw, difficulty, metadataPhrases);
    if (!question) {
      const reason = `question_${number}_failed_basic_validation`;
      errors.push(reason);
      rejected.push({ index, raw, errors: [reason] });
      return;
    }
    if (!QUESTION_TYPES.has(question.question_type)) questionErrors.push(`question_${number}_missing_question_type`);
    if (!question.question.endsWith('?')) questionErrors.push(`question_${number}_must_end_with_question_mark`);
    if (GENERIC_STEM_RE.test(question.question)) questionErrors.push(`question_${number}_generic_stem`);
    if (GENERIC_TOPIC_RE.test(question.topic) || sourceTextQuality.isIncompleteLabel(question.topic)) questionErrors.push(`question_${number}_generic_topic`);
    if (question.explanation.length < 28) questionErrors.push(`question_${number}_weak_explanation`);
    // Concise domain terms (Pop, LIFO, O(1), x, pH) can be excellent options.
    // Basic sanitization already enforces four non-empty, unique choices.
    if (question.options.some(option => option.length > 220)) questionErrors.push(`question_${number}_option_length`);
    if (question.options.some(option => /\b(?:all|none) of the above\b|not (?:stated|mentioned|supported)\b/i.test(option))) {
      questionErrors.push(`question_${number}_implausible_option`);
    }
    const key = optionKey(question.question);
    if (seen.has(key)) questionErrors.push(`question_${number}_duplicate`);

    const sourceChunks = question.source_chunk_ids.map(id => chunkById.get(id)).filter(Boolean);
    if (!question.source_chunk_ids.length || sourceChunks.length !== question.source_chunk_ids.length) {
      questionErrors.push(`question_${number}_invalid_source_chunk_ids`);
    } else {
      const evidenceWords = significantWords(sourceChunks.map(chunk => chunk.text).join(' '));
      const answerWords = significantWords(`${question.question} ${question.options[question.correct_idx]} ${question.explanation} ${question.topic}`);
      const overlap = [...answerWords].filter(word => evidenceWords.has(word));
      if (overlap.length < 2) questionErrors.push(`question_${number}_weak_source_support`);
    }
    if (questionErrors.length) {
      errors.push(...questionErrors);
      rejected.push({ index, raw, errors: questionErrors });
      return;
    }
    seen.add(key);
    questions.push(question);
  });

  if (questions.length !== count) warnings.push('not_enough_valid_questions');
  if (count >= 6 && questions.length) {
    const counts = questions.reduce((acc, question) => {
      acc[question.question_type] = (acc[question.question_type] || 0) + 1;
      return acc;
    }, {});
    if ((counts.scenario || 0) + (counts.code_design || 0) < 2) warnings.push('need_two_scenario_or_code_design_questions');
    if (!(counts.misconception >= 1)) warnings.push('need_misconception_question');
    if (!(counts.tradeoff >= 1)) warnings.push('need_tradeoff_question');
    if ((counts.concept || 0) > 2) warnings.push('too_many_direct_concept_questions');
  }
  return {
    ok: questions.length === count,
    errors: [...new Set(errors)],
    warnings: [...new Set(warnings)],
    questions,
    rejected,
  };
}

function compactFailureReasons(rejected = []) {
  return [...new Set(rejected.flatMap(item => item.errors || []))].slice(0, 12);
}

function missingQuestionTypes(questions = [], count = 0) {
  if (count < 6) return [];
  const counts = questions.reduce((acc, question) => {
    acc[question.question_type] = (acc[question.question_type] || 0) + 1;
    return acc;
  }, {});
  const missing = [];
  const applied = (counts.scenario || 0) + (counts.code_design || 0);
  if (applied < 2) missing.push('scenario or code_design');
  if (!(counts.misconception >= 1)) missing.push('misconception');
  if (!(counts.tradeoff >= 1)) missing.push('tradeoff');
  return missing;
}

function targetedQuizGuidance({ accepted, rejected, requestedCount }) {
  const remaining = Math.max(1, requestedCount - accepted.length);
  const acceptedStems = accepted.map(question => question.question).slice(0, 12);
  const missingTypes = missingQuestionTypes(accepted, requestedCount);
  return [
    'The previous response failed quality validation for one or more questions; valid questions were preserved.',
    `Generate exactly ${remaining} NEW questions only. Do not regenerate accepted questions.`,
    acceptedStems.length ? `Do not repeat these accepted questions: ${acceptedStems.join(' | ')}` : '',
    missingTypes.length ? `When the source supports them, prefer these missing question types: ${missingTypes.join(', ')}.` : '',
    compactFailureReasons(rejected).length ? `Fix these validation failures: ${compactFailureReasons(rejected).join(', ')}.` : '',
    'Every new question must cite 1-3 source_chunk_ids from the supplied excerpts and be directly supported by those chunks.',
  ].filter(Boolean).join('\n');
}

function storedMetadataPhrases(db, materialId, materialTitle) {
  const chunks = db.prepare(`
    SELECT heading, chapter_title, section_title, slide_title
    FROM chunks
    WHERE material_id=?
  `).all(materialId);
  return buildMetadataPhrases(materialTitle, chunks);
}

function readStoredQuizQuestions(db, quiz) {
  if (quiz.material_id != null) {
    let diagnostics = {};
    try { diagnostics = JSON.parse(quiz.extraction_diagnostics_json || '{}'); } catch (_) {}
    if (Number(diagnostics.extractionPipelineVersion || 0) < materials.EXTRACTION_PIPELINE_VERSION) return null;
  }
  const rows = db.prepare(`
    SELECT id, idx, question, options_json, correct_idx, explanation, concept
    FROM quiz_questions
    WHERE quiz_id=?
    ORDER BY idx
  `).all(quiz.id);
  const metadataPhrases = storedMetadataPhrases(db, quiz.material_id, quiz.material_title || quiz.title);
  const questions = [];
  for (const row of rows) {
    let options;
    try {
      options = JSON.parse(row.options_json);
    } catch (_) {
      return null;
    }
    if (quiz.material_id == null) {
      if (!Array.isArray(options) || options.length !== 4 || !Number.isInteger(Number(row.correct_idx))) return null;
      questions.push({ row, options });
      continue;
    }
    const sanitized = sanitizeQuestion({ ...row, options, topic: row.concept }, quiz.difficulty, metadataPhrases);
    if (!sanitized) return null;
    if (GENERIC_STEM_RE.test(sanitized.question) || GENERIC_TOPIC_RE.test(sanitized.topic) || sourceTextQuality.isIncompleteLabel(sanitized.topic)) return null;
    questions.push({ row, options });
  }
  return questions.length >= 2 ? questions : null;
}

function quizTitleFromQuestions(questions) {
  const counts = new Map();
  for (const question of questions) {
    const topic = stripInternalRefs(question.topic || question.concept || (question.row && question.row.concept));
    if (!topic || topic.length > 48 || /^(?:this concept|general|miscellaneous)$/i.test(topic)) continue;
    counts.set(topic, (counts.get(topic) || 0) + 1);
  }
  const topic = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  return topic ? `${topic.replace(/\s+quiz$/i, '')} Quiz` : 'Concept Review Quiz';
}

function inferTopic(text) {
  const cleaned = String(text || '').replace(/[^A-Za-z0-9 +#-]/g, ' ');
  if (/\bencapsulat/i.test(cleaned)) return 'Encapsulation';
  const known = ['Big O', 'Array', 'Arrays', 'Stack', 'Stacks', 'Queue', 'Queues', 'Class', 'Object', 'Inheritance', 'Polymorphism', 'Encapsulation', 'Tree', 'Graph', 'Hash'];
  const hit = known.find(k => new RegExp(`\\b${k}\\b`, 'i').test(cleaned));
  if (hit) return hit;
  const words = cleaned.split(/\s+/).filter(w => w.length > 3).slice(0, 3);
  return words.length ? words.join(' ') : 'this concept';
}

function quizVerifierText(data) {
  return sourceGroundingJudge.practiceQuizText((data && data.questions) || []);
}

router.post('/generate', requireAuth, aiLimiter, async (req, res, next) => {
  try {
    const { material_id, count, difficulty } = req.body || {};
    if (!material_id) throw new HttpError(400, 'missing_material_id');
    const scope = generationScope(req.body || {});
    const n = Math.min(20, Math.max(2, parseInt(count || 6, 10)));
    const diff = ['easy', 'medium', 'hard'].includes(difficulty) ? difficulty : 'medium';
    const db = getDb();
    const m = db.prepare('SELECT id, title FROM materials WHERE id=? AND user_id=?').get(material_id, req.user.id);
    if (!m) throw new HttpError(404, 'material_not_found');
    const reindex = materials.queueReindex(req.user.id, material_id);
    if (reindex.needed) {
      return res.status(202).json({
        status: 'reindexing',
        job_id: reindex.job.id,
        material_id: Number(material_id),
      });
    }
    const scopeInfo = validateScope(db, req.user.id, material_id, scope);
    const requestedTopic = stripInternalRefs((req.body && req.body.topic) || scopeInfo.title || m.title);
    let topicQuery = requestedTopic;
    let sourceUnderstanding = materialUnderstanding.understandGeneralFromDb(req.user.id, material_id, {
      explicitQuery: topicQuery,
      scopeTitle: scopeInfo.title,
      title: m.title,
      sourceScope: scope.sourceScope,
      chapterId: scope.chapterId,
      chunkId: scope.chunkId,
    });
    topicQuery = stripInternalRefs(sourceUnderstanding.topic || topicQuery || m.title);
    let domainInfo = domainDetection.detectMaterialDomain(req.user.id, material_id, { hint: topicQuery });
    let sourceTopicPlan = sourceTopicPlans.buildSourceTopicPlan({
      materialId: material_id,
      materialTitle: m.title,
      sourceScope: scope.sourceScope,
      chapterId: scope.chapterId,
      chunkId: scope.chunkId,
      explicitTopic: (req.body && req.body.topic) || '',
      requestedTopic: topicQuery,
      domainInfo,
      sourceOutline: sourceUnderstanding.sourceOutline || null,
      maxBalancedChunks: 48,
    });
    let topicMode = sourceTopicPlan.topicMode;
    if (topicMode === 'material_wide') {
      const topicMap = materialTopicMap.getOrBuild(req.user.id, material_id, { hint: topicQuery, sourceScope: scope.sourceScope, chapterId: scope.chapterId, chunkId: scope.chunkId });
      if (topicMap && Array.isArray(topicMap.topics) && topicMap.topics.length >= 2) {
        sourceTopicPlan = materialTopicMap.sourceTopicPlanForMap(topicMap, sourceTopicPlan.balancedChunks || sourceTopicPlan.chunks || [], sourceTopicPlan);
        topicQuery = sourceTopicPlan.primaryTopic;
        sourceUnderstanding = { ...sourceUnderstanding, topic: topicQuery, normalizedTopic: topicQuery, sourceOutline: sourceTopicPlan.sourceOutline, sourceTopicPlan, topicMap };
        topicMode = sourceTopicPlan.topicMode;
      } else if (sourceTopicPlan.primaryTopic) {
        topicQuery = sourceTopicPlan.primaryTopic;
        sourceUnderstanding = { ...sourceUnderstanding, topic: topicQuery, normalizedTopic: topicQuery, sourceOutline: sourceTopicPlan.sourceOutline, sourceTopicPlan };
      }
    }
    let preVerifier = sourceGroundingJudge.judge({
      feature: 'quiz',
      stage: 'pre_generation',
      materialId: material_id,
      resolvedTopic: topicQuery,
      requestedTopic,
      domainInfo,
      sourceOutline: sourceUnderstanding.sourceOutline || null,
      materialUnderstanding: sourceUnderstanding,
      sourceTopicPlan,
      topicMode,
      attempt: 0,
    });
    if (preVerifier.decision === sourceGroundingJudge.DECISIONS.RETRY && preVerifier.correctedTopic) {
      topicQuery = stripInternalRefs(preVerifier.correctedTopic);
      sourceUnderstanding = materialUnderstanding.understandGeneralFromDb(req.user.id, material_id, {
        explicitQuery: topicQuery,
        scopeTitle: scopeInfo.title,
        title: m.title,
        sourceScope: scope.sourceScope,
        chapterId: scope.chapterId,
        chunkId: scope.chunkId,
      });
      topicQuery = stripInternalRefs(sourceUnderstanding.topic || topicQuery || m.title);
      domainInfo = domainDetection.detectMaterialDomain(req.user.id, material_id, { hint: topicQuery });
      sourceTopicPlan = sourceTopicPlans.buildSourceTopicPlan({
        materialId: material_id,
        materialTitle: m.title,
        sourceScope: scope.sourceScope,
        chapterId: scope.chapterId,
        chunkId: scope.chunkId,
        explicitTopic: (req.body && req.body.topic) || '',
        requestedTopic: topicQuery,
        domainInfo,
        sourceOutline: sourceUnderstanding.sourceOutline || null,
        maxBalancedChunks: 48,
      });
      if (topicMode === 'material_wide') {
        const topicMap = materialTopicMap.getOrBuild(req.user.id, material_id, { hint: topicQuery, sourceScope: scope.sourceScope, chapterId: scope.chapterId, chunkId: scope.chunkId });
        if (topicMap && Array.isArray(topicMap.topics) && topicMap.topics.length >= 2) {
          sourceTopicPlan = materialTopicMap.sourceTopicPlanForMap(topicMap, sourceTopicPlan.balancedChunks || sourceTopicPlan.chunks || [], sourceTopicPlan);
          topicQuery = sourceTopicPlan.primaryTopic;
          sourceUnderstanding = { ...sourceUnderstanding, topic: topicQuery, normalizedTopic: topicQuery, sourceOutline: sourceTopicPlan.sourceOutline, sourceTopicPlan, topicMap };
          topicMode = sourceTopicPlan.topicMode;
        }
      }
      preVerifier = sourceGroundingJudge.judge({
        feature: 'quiz',
        stage: 'pre_generation_retry',
        materialId: material_id,
        resolvedTopic: topicQuery,
        requestedTopic,
        domainInfo,
        sourceOutline: sourceUnderstanding.sourceOutline || null,
        materialUnderstanding: sourceUnderstanding,
        sourceTopicPlan,
        topicMode,
        attempt: 1,
      });
    }
    if (preVerifier.decision === sourceGroundingJudge.DECISIONS.BLOCK) {
      throw new HttpError(422, 'insufficient_quiz_content', 'The source could not be resolved into reliable concept-level quiz content.');
    }
    const focusTerms = topicMode === 'material_wide'
      ? sourceTopicPlans.focusTerms(sourceTopicPlan, topicQuery)
      : materialUnderstanding.focusTermsForTopic(topicQuery, sourceUnderstanding.sourceOutline || null);
    const avoidTerms = topicMode === 'material_wide'
      ? []
      : materialUnderstanding.competingTermsForTopic(topicQuery, sourceUnderstanding.sourceOutline || null);
    const ragResult = await retrieveLessonContext(material_id, topicQuery, {
      feature: 'quiz',
      k: 8,
      minScore: 0.08,
      maxMerged: 12,
      sourceScope: scope.sourceScope,
      chapterId: scope.chapterId,
      chunkId: scope.chunkId,
      focusTopic: topicQuery,
      focusTerms,
      avoidTerms,
      includeSystem: domainDetection.shouldUseCuratedCs(domainInfo),
    });
    let uploadedChunks = (ragResult.uploaded && ragResult.uploaded.chunks) || [];
    if (topicMode === 'material_wide' && sourceTopicPlan.balancedChunks.length) {
      uploadedChunks = sourceTopicPlan.balancedChunks.slice(0, 12);
      ragResult.uploaded = { ...(ragResult.uploaded || {}), chunks: uploadedChunks };
    }
    const metadataPhrases = buildMetadataPhrases(m.title, uploadedChunks);
    const context = educationalContext.buildEducationalContext({
      userId: req.user.id,
      materialId: material_id,
      topic: m.title,
      query: topicQuery,
      feature: 'quiz',
      ragResult,
      retrievedChunks: ragResult.chunks,
      domainInfo,
      audienceLevel: 'beginner',
    });
    const educationalContextPrompt = [
      educationalContext.formatPracticeEducationalContextForPrompt(context, { feature: 'quiz' }),
      sourceGroundingJudge.topicLockPrompt(topicQuery, preVerifier),
      sourceTopicPlans.formatSourceTopicPlanForPrompt(sourceTopicPlan),
    ].filter(Boolean).join('\n\n');
    const tier = computeGroundingTier(ragResult.uploaded || ragResult);
    if (uploadedChunks.length < 1) {
      throw new HttpError(422, 'insufficient_quiz_content', 'Not enough clean source content was available to generate a useful quiz.');
    }

    const primaryProvider = String(env.QUIZ_PROVIDER || 'groq').toLowerCase();
    const providerNames = [...new Set([primaryProvider, env.QUIZ_FALLBACK_PROVIDER].map(value => String(value || '').toLowerCase()).filter(Boolean))]
      .filter(provider => provider !== 'groq' || !!env.GROQ_API_KEY);
    if (!providerNames.length) {
      throw new HttpError(503, 'quiz_generation_failed', 'No configured quiz provider is currently available.');
    }

    const generationStartedAt = Date.now();
    const generationDeadline = generationStartedAt + env.QUIZ_GENERATION_TIMEOUT_MS;
    const acceptedQuestions = [];
    const acceptedKeys = new Set();
    const acceptedProviders = new Set();
    const failedProviders = new Set();
    let modelResponseSeen = false;
    const failureReasons = [];
    const qualityWarnings = [];
    const attemptPlan = [
      { provider: providerNames[0], phase: 'initial' },
      { provider: providerNames[0], phase: 'repair' },
      ...(providerNames[1] ? [{ provider: providerNames[1], phase: 'fallback' }] : []),
    ];
    let lastRejected = [];

    for (const [attempt, plan] of attemptPlan.entries()) {
      if (acceptedQuestions.length >= n) break;
      if (failedProviders.has(plan.provider)) continue;
      const remainingMs = generationDeadline - Date.now();
      if (remainingMs < 1000) {
        failureReasons.push('quiz_generation_deadline_exceeded');
        qualityWarnings.push('generation_deadline_reached');
        break;
      }
      const requestedThisAttempt = plan.phase === 'initial' ? n : Math.max(1, n - acceptedQuestions.length);
      const retryGuidance = plan.phase === 'initial' ? '' : targetedQuizGuidance({
        accepted: acceptedQuestions,
        rejected: lastRejected,
        requestedCount: n,
      });
      const attemptStartedAt = Date.now();
      try {
        const raw = await ai.generate(prompts.QUIZ_MCQ(uploadedChunks, requestedThisAttempt, diff, {
          educationalContext: [educationalContextPrompt, retryGuidance].filter(Boolean).join('\n\n'),
          groundingTier: tier,
        }), {
          provider: plan.provider,
          feature: 'quiz',
          format: 'json',
          temperature: plan.phase === 'initial' ? 0.35 : 0.25,
          num_ctx: 4096,
          num_predict: Math.min(1800, 360 + requestedThisAttempt * 180),
          timeoutMs: Math.min(QUIZ_ATTEMPT_TIMEOUT_MS, remainingMs),
        });
        modelResponseSeen = true;
        const parsed = await parseJsonSafe(raw, QuizBatchSchema, async (txt) => {
          const repairRemainingMs = generationDeadline - Date.now();
          if (repairRemainingMs < 1000) {
            const timeout = new Error('Quiz JSON repair exceeded the generation deadline.');
            timeout.code = 'ai_timeout';
            throw timeout;
          }
          return ai.generate(prompts.REPAIR_JSON(txt), {
            provider: plan.provider,
            feature: 'quiz',
            format: 'json',
            temperature: 0,
            num_predict: Math.min(900, 240 + requestedThisAttempt * 130),
            timeoutMs: Math.min(QUIZ_ATTEMPT_TIMEOUT_MS, repairRemainingMs),
          });
        });
        const quality = validateGeneratedQuiz(parsed, uploadedChunks, requestedThisAttempt, diff, metadataPhrases);
        lastRejected = quality.rejected;
        qualityWarnings.push(...quality.warnings);
        failureReasons.push(...quality.errors.map(reason => `${plan.provider}:${reason}`));
        let added = 0;
        for (const question of quality.questions) {
          const itemVerifier = sourceGroundingJudge.judge({
            feature: 'quiz',
            stage: 'candidate_validation',
            materialId: material_id,
            resolvedTopic: topicQuery,
            requestedTopic,
            domainInfo,
            sourceOutline: sourceUnderstanding.sourceOutline || null,
            materialUnderstanding: sourceUnderstanding,
            chunks: uploadedChunks,
            sourceTopicPlan,
            topicMode,
            outputText: quizVerifierText({ questions: [question] }),
            outputJson: { questions: [question] },
            attempt: 1,
          });
          const itemGroundingFailures = (itemVerifier.reasonCodes || []).filter(reason => /topic_drift|unsupported_topic/i.test(reason));
          if (itemGroundingFailures.length) {
            failureReasons.push(...itemGroundingFailures.map(reason => `${plan.provider}:${reason}`));
            lastRejected.push({ errors: itemGroundingFailures });
            continue;
          }
          const key = optionKey(question.question);
          if (acceptedKeys.has(key)) {
            qualityWarnings.push('duplicate_across_attempts');
            continue;
          }
          acceptedKeys.add(key);
          acceptedQuestions.push(question);
          acceptedProviders.add(plan.provider);
          added += 1;
          if (acceptedQuestions.length >= n) break;
        }
        log.info('quiz_generation_attempt', {
          materialId: material_id,
          provider: plan.provider,
          phase: plan.phase,
          requested: requestedThisAttempt,
          returned: Array.isArray(parsed.questions) ? parsed.questions.length : 0,
          accepted: added,
          accumulated: acceptedQuestions.length,
          rejectedReasons: compactFailureReasons(quality.rejected),
          elapsedMs: Date.now() - attemptStartedAt,
        });
      } catch (error) {
        const errorCode = error.code || 'generation_failed';
        failureReasons.push(`${plan.provider}:${errorCode}`);
        log.warn('quiz_provider_attempt_failed', {
          materialId: material_id,
          provider: plan.provider,
          phase: plan.phase,
          error: errorCode,
          status: error.status || null,
          model: error.model || null,
          elapsedMs: Date.now() - attemptStartedAt,
        });
        if (NON_RETRYABLE_PROVIDER_ERRORS.has(errorCode)) failedProviders.add(plan.provider);
      }
    }

    if (acceptedQuestions.length < QUIZ_MIN_QUESTIONS) {
      const code = modelResponseSeen ? 'quiz_quality_failed' : 'quiz_generation_failed';
      throw new HttpError(503, code, modelResponseSeen
        ? 'The configured models could not produce a high-quality grounded quiz. Please retry.'
        : 'Quiz generation providers are currently unavailable. Please retry.', {
        reasons: failureReasons.slice(0, 12),
      });
    }
    const data = { questions: acceptedQuestions.slice(0, n) };
    const postVerifier = sourceGroundingJudge.judge({
      feature: 'quiz',
      stage: 'post_generation_accumulated',
      materialId: material_id,
      resolvedTopic: topicQuery,
      requestedTopic,
      domainInfo,
      sourceOutline: sourceUnderstanding.sourceOutline || null,
      materialUnderstanding: sourceUnderstanding,
      chunks: uploadedChunks,
      sourceTopicPlan,
      topicMode,
      outputText: quizVerifierText(data),
      outputJson: data,
      attempt: 1,
    });
    if (postVerifier.decision !== sourceGroundingJudge.DECISIONS.ACCEPT) {
      const reasons = postVerifier.reasonCodes || ['source_grounding_failed'];
      log.warn('quiz_grounding_rejected', { materialId: material_id, stage: 'accumulated', reasons });
      throw new HttpError(503, 'quiz_quality_failed', 'The configured models could not produce a high-quality grounded quiz. Please retry.', {
        reasons: [...failureReasons, ...reasons].slice(0, 12),
      });
    }
    const fallbackProviderUsed = [...acceptedProviders].find(provider => provider !== primaryProvider);
    const providerUsed = fallbackProviderUsed || [...acceptedProviders][0] || providerNames[0];
    const providerFallbackUsed = !!fallbackProviderUsed || providerUsed !== primaryProvider;
    const fallback = providerFallbackUsed;
    const fallbackReason = providerFallbackUsed ? 'provider_fallback' : null;

    const qIns = db.prepare(`INSERT INTO quizzes (user_id, material_id, title, difficulty, created_at) VALUES (?,?,?,?,?)`);
    const qqIns = db.prepare(`INSERT INTO quiz_questions (quiz_id, idx, question, options_json, correct_idx, explanation, concept) VALUES (?,?,?,?,?,?,?)`);
    const questions = data.questions.slice(0, n);
    const quizTitle = quizTitleFromQuestions(questions);
    let quizId;
    db.transaction(() => {
      const qr = qIns.run(req.user.id, material_id, quizTitle, diff, nowIso());
      quizId = qr.lastInsertRowid;
      questions.forEach((q, i) => {
        qqIns.run(quizId, i, q.question, JSON.stringify(q.options), q.correct_idx, q.explanation || '', q.topic || q.concept || '');
      });
    })();
    res.json({
      quiz_id: quizId,
      count: questions.length,
      requested_count: n,
      partial: questions.length < n,
      quality_warnings: [...new Set([
        ...qualityWarnings,
        ...(questions.length < n ? [`requested_${n}_generated_${questions.length}`] : []),
      ])],
      source_scope: scope.sourceScope,
      source_label: ragResult.sourceLabel,
      chapter_id: scope.chapterId,
      chunk_id: scope.chunkId,
      domain: domainInfo,
      provider: providerUsed,
      fallback,
      fallback_reason: fallbackReason,
      provider_fallback: providerFallbackUsed,
      configured_provider: env.QUIZ_PROVIDER,
      configured_fallback_provider: env.QUIZ_FALLBACK_PROVIDER,
    });
  } catch (e) { next(e); }
});

router.get('/', requireAuth, (req, res, next) => {
  try {
    const db = getDb();
    const rows = db.prepare(`
      SELECT q.id, q.material_id, m.title AS material_title, m.extraction_diagnostics_json,
             q.title, q.difficulty, q.created_at,
             (SELECT COUNT(*) FROM quiz_questions qq WHERE qq.quiz_id = q.id) AS question_count,
             (SELECT score FROM quiz_attempts a WHERE a.quiz_id = q.id AND a.user_id = q.user_id ORDER BY a.id DESC LIMIT 1) AS last_score
      FROM quizzes q
      LEFT JOIN materials m ON m.id = q.material_id
      WHERE q.user_id=? ORDER BY q.created_at DESC LIMIT 50
    `).all(req.user.id);
    const quizzes = rows.flatMap((row) => {
      const storedQuestions = readStoredQuizQuestions(db, row);
      if (!storedQuestions) return [];
      const { material_title, extraction_diagnostics_json, ...visible } = row;
      return [{ ...visible, title: quizTitleFromQuestions(storedQuestions) }];
    });
    res.json({ quizzes });
  } catch (e) { next(e); }
});

router.get('/wrong-answers', requireAuth, (req, res, next) => {
  try {
    const db = getDb();
    const rows = db.prepare(`
      SELECT qa.attempt_id, qq.id AS question_id, qq.question, qq.options_json, qq.correct_idx, qq.explanation, qq.concept,
             qa.selected_idx, q.id AS quiz_id, q.material_id, m.title AS material_title,
             m.extraction_diagnostics_json, q.title AS quiz_title, q.difficulty
      FROM quiz_answers qa
      JOIN quiz_questions qq ON qq.id = qa.question_id
      JOIN quiz_attempts at ON at.id = qa.attempt_id
      JOIN quizzes q ON q.id = at.quiz_id
      LEFT JOIN materials m ON m.id = q.material_id
      WHERE at.user_id=? AND qa.is_correct=0
      ORDER BY at.started_at DESC
      LIMIT 50`).all(req.user.id);
    const metadataCache = new Map();
    const wrong = [];
    for (const row of rows) {
      let diagnostics = {};
      try { diagnostics = JSON.parse(row.extraction_diagnostics_json || '{}'); } catch (_) {}
      if (row.material_id != null && Number(diagnostics.extractionPipelineVersion || 0) < materials.EXTRACTION_PIPELINE_VERSION) continue;
      if (!metadataCache.has(row.material_id)) {
        metadataCache.set(row.material_id, storedMetadataPhrases(db, row.material_id, row.material_title));
      }
      let options;
      try {
        options = JSON.parse(row.options_json);
      } catch (_) {
        continue;
      }
      const sanitized = sanitizeQuestion({ ...row, options, topic: row.concept }, row.difficulty, metadataCache.get(row.material_id));
      if (!sanitized || GENERIC_STEM_RE.test(sanitized.question) || GENERIC_TOPIC_RE.test(sanitized.topic) || sourceTextQuality.isIncompleteLabel(sanitized.topic)) continue;
      const { material_title, extraction_diagnostics_json, ...visible } = row;
      wrong.push({ ...visible, topic: row.concept, options });
    }
    res.json({ wrong });
  } catch (e) { next(e); }
});

router.get('/:id', requireAuth, (req, res, next) => {
  try {
    const db = getDb();
    const id = parseInt(req.params.id, 10);
    const q = db.prepare(`
      SELECT q.*, m.title AS material_title, m.extraction_diagnostics_json
      FROM quizzes q
      LEFT JOIN materials m ON m.id = q.material_id
      WHERE q.id=? AND q.user_id=?
    `).get(id, req.user.id);
    if (!q) throw new HttpError(404, 'quiz_not_found');
    const storedQuestions = readStoredQuizQuestions(db, q);
    if (!storedQuestions) {
      throw new HttpError(409, 'quiz_requires_regeneration', 'This saved quiz contains document metadata instead of concept questions. Generate a new quiz.');
    }
    const { material_title, extraction_diagnostics_json, ...quiz } = q;
    quiz.title = quizTitleFromQuestions(storedQuestions);
    res.json({
      quiz,
      questions: storedQuestions.map(({ row, options }) => ({
        id: row.id,
        idx: row.idx,
        question: row.question,
        concept: row.concept,
        topic: row.concept,
        difficulty: q.difficulty,
        options,
      })),
    });
  } catch (e) { next(e); }
});

router.post('/:id/attempt', requireAuth, (req, res, next) => {
  try {
    const db = getDb();
    const id = parseInt(req.params.id, 10);
    const q = db.prepare(`
      SELECT q.id, q.material_id, q.title, q.difficulty, m.title AS material_title,
             m.extraction_diagnostics_json
      FROM quizzes q
      LEFT JOIN materials m ON m.id = q.material_id
      WHERE q.id=? AND q.user_id=?
    `).get(id, req.user.id);
    if (!q) throw new HttpError(404, 'quiz_not_found');
    if (!readStoredQuizQuestions(db, q)) {
      throw new HttpError(409, 'quiz_requires_regeneration', 'This saved quiz contains document metadata instead of concept questions. Generate a new quiz.');
    }
    const r = db.prepare('INSERT INTO quiz_attempts (quiz_id, user_id, started_at) VALUES (?,?,?)').run(id, req.user.id, nowIso());
    res.json({ attempt_id: r.lastInsertRowid });
  } catch (e) { next(e); }
});

router.post('/attempts/:id/answer', requireAuth, (req, res, next) => {
  try {
    const attemptId = parseInt(req.params.id, 10);
    const { question_id, selected_idx } = req.body || {};
    const selected = parseInt(selected_idx, 10);
    const questionId = parseInt(question_id, 10);
    if (!questionId || Number.isNaN(selected) || selected < 0 || selected > 3) throw new HttpError(400, 'invalid_answer');
    const db = getDb();
    const at = db.prepare('SELECT id, quiz_id, finished_at FROM quiz_attempts WHERE id=? AND user_id=?').get(attemptId, req.user.id);
    if (!at) throw new HttpError(404, 'attempt_not_found');
    if (at.finished_at) throw new HttpError(409, 'attempt_already_finished');
    const qq = db.prepare('SELECT correct_idx, explanation FROM quiz_questions WHERE id=? AND quiz_id=?').get(questionId, at.quiz_id);
    if (!qq) throw new HttpError(404, 'question_not_found');
    const isCorrect = selected === qq.correct_idx;
    const existing = db.prepare('SELECT id FROM quiz_answers WHERE attempt_id=? AND question_id=? ORDER BY id DESC LIMIT 1').get(attemptId, questionId);
    if (existing) throw new HttpError(409, 'answer_already_submitted');
    db.prepare('INSERT INTO quiz_answers (attempt_id, question_id, selected_idx, is_correct) VALUES (?,?,?,?)')
      .run(attemptId, questionId, selected, isCorrect ? 1 : 0);
    res.json({ is_correct: isCorrect, correct_idx: qq.correct_idx, explanation: qq.explanation });
  } catch (e) { next(e); }
});

router.post('/attempts/:id/finish', requireAuth, (req, res, next) => {
  try {
    const attemptId = parseInt(req.params.id, 10);
    const db = getDb();
    const at = db.prepare('SELECT id, finished_at FROM quiz_attempts WHERE id=? AND user_id=?').get(attemptId, req.user.id);
    if (!at) throw new HttpError(404, 'attempt_not_found');
    if (at.finished_at) throw new HttpError(409, 'attempt_already_finished');
    const stats = db.prepare(`
      SELECT COUNT(*) AS total, COALESCE(SUM(is_correct), 0) AS correct
      FROM quiz_answers
      WHERE attempt_id=? AND id IN (SELECT MAX(id) FROM quiz_answers WHERE attempt_id=? GROUP BY question_id)
    `).get(attemptId, attemptId);
    const score = stats.total ? Math.round((stats.correct / stats.total) * 100) : 0;
    db.prepare('UPDATE quiz_attempts SET finished_at=?, score=? WHERE id=?').run(nowIso(), score, attemptId);
    db.prepare(`INSERT INTO study_events (user_id, kind, ref_id, duration_s, occurred_at) VALUES (?,?,?,?,?)`)
      .run(req.user.id, 'quiz', attemptId, 600, nowIso());
    const wrong = db.prepare(`SELECT qq.question, qq.options_json, qq.correct_idx, qq.explanation, qa.selected_idx
                              FROM quiz_answers qa JOIN quiz_questions qq ON qq.id=qa.question_id
                              WHERE qa.attempt_id=? AND qa.is_correct=0
                                AND qa.id IN (SELECT MAX(id) FROM quiz_answers WHERE attempt_id=? GROUP BY question_id)`).all(attemptId, attemptId);
    const outcomes = db.prepare(`SELECT qq.concept, qa.is_correct
                                 FROM quiz_answers qa JOIN quiz_questions qq ON qq.id=qa.question_id
                                 WHERE qa.attempt_id=?
                                   AND qa.id IN (SELECT MAX(id) FROM quiz_answers WHERE attempt_id=? GROUP BY question_id)`).all(attemptId, attemptId);
    for (const o of outcomes) {
      if (o.concept) recordConceptOutcome(req.user.id, o.concept, !!o.is_correct, { correctDelta: 8, incorrectDelta: -6 });
    }
    const finishReward = gamification.award(req.user.id, 'quiz_finished', 'quiz_attempt', attemptId, {
      metadata: { score, total: stats.total, correct: stats.correct },
    });
    const highReward = score >= 80
      ? gamification.award(req.user.id, 'quiz_high_score', 'quiz_attempt', attemptId, {
        metadata: { score, total: stats.total, correct: stats.correct },
      })
      : null;
    res.json({
      score,
      total: stats.total,
      correct: stats.correct,
      wrong: wrong.map(w => ({ ...w, options: JSON.parse(w.options_json) })),
      reward: {
        points: (finishReward.awarded ? finishReward.points : 0) + (highReward && highReward.awarded ? highReward.points : 0),
        events: [finishReward, highReward].filter(r => r && r.awarded).map(r => r.event.event_type),
        unlocked: [...(finishReward.unlocked || []), ...((highReward && highReward.unlocked) || [])],
      },
      gamification: (highReward && highReward.summary) || finishReward.summary || null,
    });
  } catch (e) { next(e); }
});

module.exports = router;
