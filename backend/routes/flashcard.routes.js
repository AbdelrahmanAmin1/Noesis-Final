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
const srs = require('../services/srs.service');
const log = require('../utils/logger');
const gamification = require('../services/gamification.service');

const router = express.Router();
const nowIso = () => new Date().toISOString();
const PLACEHOLDER_RE = /\b(what is this topic|define the concept|true or false:?\s*this is important|example here|definition goes here|placeholder|todo|lorem ipsum)\b/i;
const HARD_MAX_FLASHCARDS = 10;

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

const FlashSchema = z.object({
  cards: z.array(z.object({
    question: z.string().min(1),
    answer: z.string().min(1),
    difficulty: z.preprocess((value) => {
      const normalized = String(value || 'medium').toLowerCase();
      return ['easy', 'medium', 'hard'].includes(normalized) ? normalized : 'medium';
    }, z.enum(['easy', 'medium', 'hard'])).optional().default('medium'),
    topic: z.string().optional().default('General'),
    source_chunk_id: z.preprocess((value) => {
      if (value === null || value === undefined || value === '') return null;
      const n = Number(value);
      return Number.isInteger(n) ? n : null;
    }, z.number().int().nullable()).optional().default(null),
  })).min(1),
});

function cleanSourceText(text) {
  return String(text || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\[[^\]]+\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function inferTopic(text, fallback) {
  const cleaned = cleanSourceText(text)
    .replace(/^[^A-Za-z0-9]+/, '')
    .split(/[.:;-]/)[0]
    .trim();
  const words = cleaned.split(/\s+/).filter(Boolean).slice(0, 5).join(' ');
  return words || fallback || 'General';
}

function stripInternalRefs(value) {
  return String(value || '')
    .replace(/\[chunk\s*:\s*\d+\]/gi, '')
    .replace(/\[source[_\s-]*chunk\s*:\s*\d+\]/gi, '')
    .replace(/"?source[_\s-]*chunk[_\s-]*id"?\s*:?\s*\d+/gi, '')
    .replace(/\bchunk\s*id\s*#?\s*\d+\b/gi, '')
    .replace(/sourceChunkIds?\s*:\s*\[[^\]]*\]/gi, '')
    .replace(/\b(debug|trace|raw curated json|internal metadata)\s*:\s*/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseCardCount(value) {
  const min = Math.max(1, Number(env.FLASHCARD_MIN_CARDS || 6));
  const max = Math.min(HARD_MAX_FLASHCARDS, Math.max(min, Number(env.FLASHCARD_MAX_CARDS || 8)));
  const fallback = Math.min(max, Math.max(min, Number(env.FLASHCARD_DEFAULT_CARDS || max)));
  const parsed = parseInt(value || fallback, 10);
  const safe = Number.isInteger(parsed) ? parsed : fallback;
  return Math.min(max, Math.max(min, safe));
}

function truncateText(value, max = 700) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 3).trim()}...` : text;
}

function compactChunks(chunks, limit, maxChars) {
  return (chunks || []).slice(0, limit).map(chunk => ({
    ...chunk,
    text: truncateText(chunk.text, maxChars),
  }));
}

function extractText(value) {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return '';
  return value.text || value.answer || value.correctAnswer || value.back || value.front || value.mistake || value.correction || '';
}

function addFallbackCard(cards, seen, card, count) {
  if (cards.length >= count) return;
  const question = stripInternalRefs(card.question);
  const answer = stripInternalRefs(card.answer);
  const key = question.toLowerCase();
  if (question.length < 10 || answer.length < 12 || PLACEHOLDER_RE.test(question) || PLACEHOLDER_RE.test(answer) || seen.has(key)) return;
  seen.add(key);
  cards.push({
    question,
    answer,
    difficulty: ['easy', 'medium', 'hard'].includes(card.difficulty) ? card.difficulty : 'medium',
    topic: stripInternalRefs(card.topic || 'General') || 'General',
    source_chunk_id: Number.isInteger(Number(card.source_chunk_id)) ? Number(card.source_chunk_id) : null,
  });
}

function fallbackFlashcardsFromContext(context, chunks, count, deckTitle) {
  const cards = [];
  const seen = new Set();
  const curated = context && context.curatedKnowledge;
  const topic = (curated && curated.topic) || deckTitle || 'General';

  if (curated) {
    if (curated.definition) {
      addFallbackCard(cards, seen, {
        question: `What is the core idea of ${topic}?`,
        answer: curated.definition,
        difficulty: 'easy',
        topic,
      }, count);
    }
    for (const item of curated.flashcards || []) {
      addFallbackCard(cards, seen, {
        question: item.front || item.question,
        answer: item.back || item.answer,
        difficulty: 'medium',
        topic,
      }, count);
    }
    for (const mistake of curated.commonMistakes || []) {
      const mistakeText = stripInternalRefs(extractText(mistake.mistake || mistake));
      const correctionText = stripInternalRefs(extractText(mistake.correction || mistake.whyItHappens));
      if (mistakeText) {
        addFallbackCard(cards, seen, {
          question: `What common mistake should you avoid in ${topic}?`,
          answer: correctionText ? `${mistakeText} Fix: ${correctionText}` : mistakeText,
          difficulty: 'medium',
          topic,
        }, count);
      }
    }
    if (curated.complexity) {
      addFallbackCard(cards, seen, {
        question: `What complexity detail should you remember for ${topic}?`,
        answer: typeof curated.complexity === 'string' ? curated.complexity : JSON.stringify(curated.complexity),
        difficulty: 'medium',
        topic,
      }, count);
    }
    const codeExample = (curated.codeExamples || [])[0];
    if (codeExample && (codeExample.title || codeExample.code)) {
      const walkthrough = (codeExample.walkthrough || []).map(extractText).filter(Boolean).join(' ');
      addFallbackCard(cards, seen, {
        question: `What does the ${codeExample.title || topic + ' code example'} show?`,
        answer: truncateText(walkthrough || codeExample.code, 360),
        difficulty: 'medium',
        topic,
      }, count);
    }
  }

  const chunkFallback = fallbackFlashcardsFromChunks(chunks, count - cards.length, deckTitle).cards;
  for (const card of chunkFallback) addFallbackCard(cards, seen, card, count);

  return { cards };
}

function fallbackFlashcardsFromChunks(chunks, count, deckTitle) {
  const candidates = [];
  for (const chunk of chunks || []) {
    const text = cleanSourceText(chunk.text);
    const sentences = text
      .split(/(?<=[.!?])\s+/)
      .map(s => s.trim())
      .filter(s => s.length >= 35 && s.length <= 260);
    const sourceSentences = sentences.length ? sentences : (text ? [text.slice(0, 260)] : []);
    for (const sentence of sourceSentences) {
      candidates.push({ sentence, chunkId: chunk.id });
      if (candidates.length >= count * 2) break;
    }
    if (candidates.length >= count * 2) break;
  }
  if (!candidates.length && deckTitle) {
    candidates.push({ sentence: `The uploaded material is about ${deckTitle}. Review the extracted source text for the most important definitions, relationships, and examples.`, chunkId: null });
  }
  const stems = [
    topic => `What should you remember about ${topic}?`,
    topic => `Which source detail explains ${topic}?`,
    topic => `How would you summarize ${topic} from the uploaded material?`,
    topic => `What is one exam-ready fact about ${topic}?`,
  ];
  const cards = [];
  let idx = 0;
  while (cards.length < count && candidates.length) {
    const item = candidates[idx % candidates.length];
    const topic = inferTopic(item.sentence, deckTitle);
    const stem = stems[Math.floor(idx / candidates.length) % stems.length];
    cards.push({
      question: stem(topic),
      answer: item.sentence,
      difficulty: cards.length < 2 ? 'easy' : 'medium',
      topic,
      source_chunk_id: item.chunkId,
    });
    idx += 1;
    if (idx > count * Math.max(4, candidates.length)) break;
  }
  return { cards };
}

function existingFlashcards(db, userId, materialId, topic, count) {
  const topicRows = db.prepare(`
    SELECT id, material_id, deck, question, answer, difficulty, topic, source_chunk_id, created_at
    FROM flashcards
    WHERE user_id=? AND material_id=?
      AND (? IS NULL OR LOWER(COALESCE(topic, deck, '')) = LOWER(?) OR LOWER(COALESCE(deck, '')) = LOWER(?))
    ORDER BY created_at DESC
    LIMIT ?
  `).all(userId, materialId, topic || null, topic || '', topic || '', count);
  if (topicRows.length >= count) return topicRows;
  return db.prepare(`
    SELECT id, material_id, deck, question, answer, difficulty, topic, source_chunk_id, created_at
    FROM flashcards
    WHERE user_id=? AND material_id=?
    ORDER BY created_at DESC
    LIMIT ?
  `).all(userId, materialId, count);
}

function usableProvider(provider) {
  const name = String(provider || '').toLowerCase();
  if (!name) return false;
  if (name === 'groq') return !!env.GROQ_API_KEY;
  return true;
}

function providerList() {
  const names = [];
  for (const name of [env.FLASHCARD_PROVIDER, env.FLASHCARD_FALLBACK_PROVIDER]) {
    const normalized = String(name || '').toLowerCase();
    if (normalized && !names.includes(normalized) && usableProvider(normalized)) names.push(normalized);
  }
  return names;
}

function timeoutError(provider, timeoutMs) {
  const err = new Error(`${provider} flashcard generation timed out after ${timeoutMs}ms`);
  err.code = 'flashcard_timeout';
  err.provider = provider;
  return err;
}

function withTimeout(promise, timeoutMs, provider) {
  let timer;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(timeoutError(provider, timeoutMs)), timeoutMs);
    }),
  ]);
}

async function generateFlashcardsJson(prompt, n) {
  const providers = providerList();
  let lastErr = null;
  for (const provider of providers) {
    try {
      const raw = await withTimeout(ai.generate(prompt, {
        provider,
        feature: 'flashcards',
        format: 'json',
        temperature: 0.35,
        num_ctx: 2048,
        num_predict: Math.min(900, 160 + n * 80),
      }), env.FLASHCARD_TIMEOUT_MS, provider);
      return { raw, provider };
    } catch (err) {
      lastErr = err;
      log.warn('flashcard_provider_failed', {
        provider,
        code: err && err.code,
        message: err && err.message,
      });
    }
  }
  if (lastErr) throw lastErr;
  throw new HttpError(503, 'flashcard_provider_unavailable', 'No flashcard AI provider is configured.');
}

function sanitizeCards(cards, chunks, count, deckTitle) {
  const validChunkIds = new Set((chunks || []).map(c => Number(c.id)).filter(Number.isInteger));
  const seen = new Set();
  const cleaned = [];
  for (const card of cards || []) {
    const question = stripInternalRefs(card.question);
    const answer = stripInternalRefs(card.answer);
    const topic = stripInternalRefs(card.topic || deckTitle || 'General');
    if (question.length < 10 || answer.length < 12) continue;
    if (PLACEHOLDER_RE.test(question) || PLACEHOLDER_RE.test(answer)) continue;
    const key = question.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const sourceId = Number(card.source_chunk_id);
    cleaned.push({
      question,
      answer,
      difficulty: ['easy', 'medium', 'hard'].includes(card.difficulty) ? card.difficulty : 'medium',
      topic: topic || deckTitle || 'General',
      source_chunk_id: Number.isInteger(sourceId) && validChunkIds.has(sourceId) ? sourceId : null,
    });
    if (cleaned.length >= count) break;
  }
  return cleaned;
}

function topUpFlashcards(cards, context, chunks, count, deckTitle) {
  if ((cards || []).length >= count) return cards.slice(0, count);
  const seen = new Set((cards || []).map(card => String(card.question || '').toLowerCase()));
  const topped = [...(cards || [])];
  const fallback = fallbackFlashcardsFromContext(context, chunks, count, deckTitle).cards;
  for (const raw of sanitizeCards(fallback, chunks, count, deckTitle)) {
    if (topped.length >= count) break;
    const key = String(raw.question || '').toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    topped.push(raw);
  }
  return topped.slice(0, count);
}

function flashcardVerifierText(cards) {
  return sourceGroundingJudge.practiceFlashcardText(cards || []);
}

router.get('/', requireAuth, (req, res, next) => {
  try {
    const db = getDb();
    const materialId = req.query.material_id ? parseInt(req.query.material_id, 10) : null;
    if (materialId) {
      const m = db.prepare('SELECT id FROM materials WHERE id=? AND user_id=?').get(materialId, req.user.id);
      if (!m) throw new HttpError(404, 'material_not_found');
    }
    const rows = materialId
      ? db.prepare(`SELECT id, material_id, deck, question, answer, difficulty, topic, source_chunk_id, created_at
                    FROM flashcards WHERE user_id=? AND material_id=? ORDER BY created_at DESC`).all(req.user.id, materialId)
      : db.prepare(`SELECT id, material_id, deck, question, answer, difficulty, topic, source_chunk_id, created_at
                    FROM flashcards WHERE user_id=? ORDER BY created_at DESC LIMIT 200`).all(req.user.id);
    res.json({ cards: rows });
  } catch (e) { next(e); }
});

router.get('/due', requireAuth, (req, res, next) => {
  try {
    const db = getDb();
    const now = nowIso();
    // Cards with no review yet are immediately "due"
    const rows = db.prepare(`
      SELECT f.id, f.deck, f.question, f.answer, f.material_id, f.difficulty, f.topic,
             (SELECT due_at FROM flashcard_reviews r WHERE r.card_id=f.id ORDER BY reviewed_at DESC LIMIT 1) AS due_at,
             (SELECT ease FROM flashcard_reviews r WHERE r.card_id=f.id ORDER BY reviewed_at DESC LIMIT 1) AS ease
      FROM flashcards f
      WHERE f.user_id=?
      ORDER BY due_at IS NULL DESC, due_at ASC
      LIMIT 50
    `).all(req.user.id);
    const due = rows.filter(r => !r.due_at || r.due_at <= now);
    res.json({ cards: due, total_due: due.length });
  } catch (e) { next(e); }
});

router.post('/generate', requireAuth, aiLimiter, async (req, res, next) => {
  try {
    const { material_id, count, regenerate } = req.body || {};
    if (!material_id) throw new HttpError(400, 'missing_material_id');
    const scope = generationScope(req.body || {});
    const n = parseCardCount(count);
    const db = getDb();
    const m = db.prepare('SELECT id, title FROM materials WHERE id=? AND user_id=?').get(material_id, req.user.id);
    if (!m) throw new HttpError(404, 'material_not_found');
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
      feature: 'flashcards',
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
        feature: 'flashcards',
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
    const verifierFallbackOnly = preVerifier.decision === sourceGroundingJudge.DECISIONS.BLOCK;
    const focusTerms = topicMode === 'material_wide'
      ? sourceTopicPlans.focusTerms(sourceTopicPlan, topicQuery)
      : materialUnderstanding.focusTermsForTopic(topicQuery, sourceUnderstanding.sourceOutline || null);
    const avoidTerms = topicMode === 'material_wide'
      ? []
      : materialUnderstanding.competingTermsForTopic(topicQuery, sourceUnderstanding.sourceOutline || null);
    if (!regenerate && scope.sourceScope === 'material') {
      const existing = existingFlashcards(db, req.user.id, material_id, topicQuery, n);
      if (existing.length >= n) {
        return res.json({
          created: 0,
          ids: existing.map(card => card.id),
          cards: existing,
          reused: true,
          fallback: false,
          message: `Using ${existing.length} existing flashcard${existing.length === 1 ? '' : 's'} for this material.`,
        });
      }
    }

    const ragResult = await retrieveLessonContext(material_id, topicQuery, {
      feature: 'flashcards',
      k: env.FLASHCARD_TOP_K_CHUNKS,
      minScore: 0.08,
      maxMerged: env.FLASHCARD_TOP_K_CHUNKS,
      sourceScope: scope.sourceScope,
      chapterId: scope.chapterId,
      chunkId: scope.chunkId,
      focusTopic: topicQuery,
      focusTerms,
      avoidTerms,
      includeSystem: domainDetection.shouldUseCuratedCs(domainInfo),
    });
    let uploadedChunks = compactChunks(
      (ragResult.uploaded && ragResult.uploaded.chunks) || [],
      env.FLASHCARD_TOP_K_CHUNKS,
      700
    );
    if (topicMode === 'material_wide' && sourceTopicPlan.balancedChunks.length) {
      uploadedChunks = compactChunks(sourceTopicPlan.balancedChunks, Math.max(env.FLASHCARD_TOP_K_CHUNKS, 8), 700);
      ragResult.uploaded = { ...(ragResult.uploaded || {}), chunks: uploadedChunks };
    }
    const context = educationalContext.buildEducationalContext({
      userId: req.user.id,
      materialId: material_id,
      topic: m.title,
      query: topicQuery,
      feature: 'flashcards',
      ragResult,
      retrievedChunks: ragResult.chunks,
      domainInfo,
      audienceLevel: 'beginner',
    });
    const educationalContextPrompt = educationalContext.formatPracticeEducationalContextForPrompt(context, {
      feature: 'flashcards',
      maxChars: Math.min(2500, env.FLASHCARD_MAX_CONTEXT_CHARS),
    });
    const tier = computeGroundingTier(ragResult.uploaded || ragResult);
    const buildPrompt = (extraInstruction = '') => prompts.FLASHCARDS(uploadedChunks, n, {
      educationalContext: [
        educationalContextPrompt,
        sourceGroundingJudge.topicLockPrompt(topicQuery, preVerifier),
        sourceTopicPlans.formatSourceTopicPlanForPrompt(sourceTopicPlan),
        extraInstruction,
      ].filter(Boolean).join('\n\n'),
      groundingTier: tier,
    });
    let data;
    let fallback = false;
    let fallbackReason = null;
    let providerUsed = null;
    let generatedByAi = false;
    if (verifierFallbackOnly) {
      log.warn('flashcard_verifier_fallback', {
        materialId: material_id,
        stage: 'pre_generation',
        reasonCodes: preVerifier.reasonCodes,
      });
      fallback = true;
      fallbackReason = 'verifier_pre_generation';
      data = fallbackFlashcardsFromContext(context, uploadedChunks, n, m.title);
    } else {
      try {
        const generated = await generateFlashcardsJson(buildPrompt(), n);
        providerUsed = generated.provider;
        data = await parseJsonSafe(generated.raw, FlashSchema, async (txt) => withTimeout(ai.generate(prompts.REPAIR_JSON(txt), {
          provider: generated.provider,
          feature: 'flashcards',
          temperature: 0,
          num_predict: 500,
        }), Math.min(env.FLASHCARD_TIMEOUT_MS, 20000), generated.provider));
        generatedByAi = true;
      } catch (e) {
        log.warn('flashcard_json_fallback', e.message || e);
        fallback = true;
        fallbackReason = ((e && e.code === 'flashcard_timeout') || (e && e.code === 'ai_timeout'))
          ? 'ai_timeout'
          : 'ai_failed';
        data = fallbackFlashcardsFromContext(context, uploadedChunks, n, m.title);
      }
    }
    let cards = sanitizeCards(data.cards, uploadedChunks, n, m.title);
    if (cards.length < n) {
      fallback = true;
      fallbackReason = fallbackReason || (cards.length ? 'ai_output_topped_up' : 'empty_ai_output');
      cards = topUpFlashcards(cards, context, uploadedChunks, n, m.title);
    }
    let postVerifier = sourceGroundingJudge.judge({
      feature: 'flashcards',
      stage: 'post_generation',
      materialId: material_id,
      resolvedTopic: topicQuery,
      requestedTopic,
      domainInfo,
      sourceOutline: sourceUnderstanding.sourceOutline || null,
      materialUnderstanding: sourceUnderstanding,
      chunks: uploadedChunks,
      sourceTopicPlan,
      topicMode,
      outputText: flashcardVerifierText(cards),
      outputJson: { cards },
      attempt: 0,
    });
    if (generatedByAi && postVerifier.decision === sourceGroundingJudge.DECISIONS.RETRY) {
      log.warn('flashcard_verifier_retry', {
        materialId: material_id,
        reasonCodes: postVerifier.reasonCodes,
        correctedTopic: postVerifier.correctedTopic,
      });
      try {
        const retryPrompt = buildPrompt([
          postVerifier.retryGuidance,
          sourceGroundingJudge.topicLockPrompt(postVerifier.correctedTopic || topicQuery, postVerifier, { strict: true }),
        ].filter(Boolean).join('\n\n'));
        const generated = await generateFlashcardsJson(retryPrompt, n);
        providerUsed = generated.provider;
        const retryData = await parseJsonSafe(generated.raw, FlashSchema, async (txt) => withTimeout(ai.generate(prompts.REPAIR_JSON(txt), {
          provider: generated.provider,
          feature: 'flashcards',
          temperature: 0,
          num_predict: 500,
        }), Math.min(env.FLASHCARD_TIMEOUT_MS, 20000), generated.provider));
        cards = topUpFlashcards(sanitizeCards(retryData.cards, uploadedChunks, n, m.title), context, uploadedChunks, n, m.title);
        postVerifier = cards.length
          ? sourceGroundingJudge.judge({
            feature: 'flashcards',
            stage: 'post_generation_retry',
            materialId: material_id,
            resolvedTopic: postVerifier.correctedTopic || topicQuery,
            requestedTopic,
            domainInfo,
            sourceOutline: sourceUnderstanding.sourceOutline || null,
            materialUnderstanding: sourceUnderstanding,
            chunks: uploadedChunks,
            sourceTopicPlan,
            topicMode,
            outputText: flashcardVerifierText(cards),
            outputJson: { cards },
            attempt: 1,
          })
          : { decision: sourceGroundingJudge.DECISIONS.BLOCK, reasonCodes: ['empty_retry_output'] };
        if (postVerifier.decision === sourceGroundingJudge.DECISIONS.ACCEPT) {
          fallback = false;
          fallbackReason = null;
        }
      } catch (e) {
        log.warn('flashcard_json_fallback', e.message || e);
        postVerifier = { decision: sourceGroundingJudge.DECISIONS.BLOCK, reasonCodes: ['retry_generation_failed'] };
      }
    }
    if (postVerifier.decision !== sourceGroundingJudge.DECISIONS.ACCEPT) {
      log.warn('flashcard_verifier_fallback', {
        materialId: material_id,
        stage: postVerifier.decision === sourceGroundingJudge.DECISIONS.BLOCK ? 'post_generation_block' : 'post_generation',
        reasonCodes: postVerifier.reasonCodes,
      });
      fallback = true;
      fallbackReason = 'verifier_failed';
      cards = topUpFlashcards([], context, uploadedChunks, n, m.title);
    }
    if (!cards.length) throw new HttpError(502, 'flashcard_generation_empty', 'Could not create flashcards from the available source text.');
    const ins = db.prepare(`INSERT INTO flashcards (user_id, material_id, deck, question, answer, difficulty, topic, source_chunk_id, created_at)
                            VALUES (?,?,?,?,?,?,?,?,?)`);
    const ids = [];
    db.transaction(() => {
      for (const c of cards) {
        const r = ins.run(req.user.id, material_id, m.title, c.question, c.answer, c.difficulty || 'medium', c.topic || m.title, c.source_chunk_id, nowIso());
        ids.push(r.lastInsertRowid);
      }
    })();
    res.json({
      created: ids.length,
      ids,
      reused: false,
      fallback,
      fallback_reason: fallbackReason,
      requested_count: n,
      provider: providerUsed,
      message: fallback
        ? `Created ${ids.length} source-derived fallback flashcard${ids.length === 1 ? '' : 's'} from the uploaded material.`
        : `Generated ${ids.length} flashcard${ids.length === 1 ? '' : 's'}.`,
      source_scope: scope.sourceScope,
      source_label: ragResult.sourceLabel,
      chapter_id: scope.chapterId,
      chunk_id: scope.chunkId,
      domain: domainInfo,
    });
  } catch (e) { next(e); }
});

router.post('/:id/review', requireAuth, (req, res, next) => {
  try {
    const cardId = parseInt(req.params.id, 10);
    const rating = parseInt((req.body || {}).rating, 10);
    if (!cardId || !rating || rating < 1 || rating > 4) throw new HttpError(400, 'invalid_rating');
    const db = getDb();
    const card = db.prepare('SELECT id FROM flashcards WHERE id=? AND user_id=?').get(cardId, req.user.id);
    if (!card) throw new HttpError(404, 'card_not_found');
    const prev = db.prepare('SELECT ease, interval_days, reps FROM flashcard_reviews WHERE card_id=? AND user_id=? ORDER BY reviewed_at DESC LIMIT 1').get(cardId, req.user.id);
    const sched = srs.nextSchedule(prev, rating);
    const r = db.prepare(`INSERT INTO flashcard_reviews (card_id, user_id, rating, ease, interval_days, reps, due_at, reviewed_at)
                          VALUES (?,?,?,?,?,?,?,?)`)
      .run(cardId, req.user.id, rating, sched.ease, sched.interval_days, sched.reps, sched.due_at, nowIso());
    db.prepare(`INSERT INTO study_events (user_id, kind, ref_id, duration_s, occurred_at) VALUES (?,?,?,?,?)`)
      .run(req.user.id, 'flashcard', cardId, 30, nowIso());
    const reward = gamification.award(req.user.id, 'flashcard_reviewed', 'flashcard_review', r.lastInsertRowid, {
      metadata: { card_id: cardId, rating },
    });
    res.json({
      review_id: r.lastInsertRowid,
      ...sched,
      reward: reward.awarded ? { points: reward.points, event_type: 'flashcard_reviewed', unlocked: reward.unlocked || [] } : null,
      gamification: reward.summary || null,
    });
  } catch (e) { next(e); }
});

module.exports = router;
