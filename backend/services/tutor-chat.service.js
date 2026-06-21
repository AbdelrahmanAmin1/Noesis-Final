'use strict';

const { getDb } = require('../config/db');
const env = require('../config/env');
const ai = require('./ai.service');
const rag = require('./rag.service');
const prompts = require('../utils/prompts');
const educationalContext = require('./educational-context.service');
const domainDetection = require('./domain-detection.service');
const { HttpError } = require('../middleware/error');
const { sourceChunksForClient } = require('./tutor.service');
const sourceVisualCandidates = require('./source-visual-candidates.service');
const sourceGroundingJudge = require('./source-grounding-judge.service');
const sourceTopicPlans = require('./source-topic-plan.service');
const materialUnderstanding = require('./material-understanding.service');
const materialTopicMap = require('./material-topic-map.service');
const sourceTextQuality = require('./source-text-quality.service');

const CHAT_ACTIONS = {
  explain_deeper: {
    label: 'Explain deeper',
    message: 'Explain the last concept in more depth with an analogy.',
    instructions: 'Deepen the most recent concept from the conversation. Add one beginner-friendly analogy, one concrete example from the subject, and one common misconception to avoid. Use code only when the uploaded material is actually about programming.',
  },
  quiz_me: {
    label: 'Quiz me',
    message: 'Give me a quick quiz question about what we just discussed.',
    instructions: 'Ask exactly one quick quiz question about the most recent concept. Include the answer and explanation after the student-facing question.',
    structured: 'Also include a structured quiz block:\n[QUIZ]\n{"type":"short_answer|multiple_choice","question":"...","options":["..."],"correct_idx":0,"expectedAnswer":"...","explanation":"...","topic":"..."}\n[/QUIZ]',
  },
  summarize: {
    label: 'Summarize',
    message: 'Summarize our conversation so far into key points.',
    instructions: 'Summarize the conversation so far into 4-6 crisp study bullets. Separate source-grounded facts from extra tutor guidance when relevant.',
  },
  give_example: {
    label: 'Give example',
    message: 'Show me a concrete example for the last topic.',
    instructions: 'Give one compact code example only when the topic is code-related. Otherwise give a concrete scenario, case, or worked example from the subject. Explain it step by step and tie it back to the uploaded material.',
  },
  compare_concepts: {
    label: 'Compare concepts',
    message: 'Compare this concept with a related one.',
    instructions: 'Compare the current concept with the closest related concept. Use a small table with differences, when to use each one, and one trap students confuse.',
  },
  make_flashcards: {
    label: 'Make flashcards',
    message: 'Create 3 flashcards from what we discussed.',
    instructions: 'Create exactly 3 atomic study flashcards from the current conversation and source excerpts. Keep each card focused on one fact, definition, or contrast.',
    structured: 'Also include a structured flashcard block:\n[FLASHCARDS]\n{"cards":[{"question":"...","answer":"...","difficulty":"easy|medium|hard","topic":"...","source_chunk_id":1}]}\n[/FLASHCARDS]',
  },
};

function nowIso() { return new Date().toISOString(); }

function parseJson(value, fallback) {
  try { return value ? JSON.parse(value) : fallback; } catch (_) { return fallback; }
}

function cleanText(value, max = 4000) {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim()
    .slice(0, max);
}

const STRUCTURED_REPLY_KEYS = [
  'type',
  'title',
  'explanation',
  'answer',
  'content',
  'summary',
  'question',
  'checkpoint',
  'hint',
  'example',
  'code',
  'visual',
  'key_points',
  'keyPoints',
  'bullets',
  'steps',
];

function decodeJsonishString(value) {
  let text = String(value || '').trim();
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    try {
      const parsed = JSON.parse(text);
      if (typeof parsed === 'string') text = parsed.trim();
    } catch (_) {
      text = text.slice(1, -1).trim();
    }
  }
  if (/\\[nrti"]/.test(text)) {
    text = text
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '')
      .replace(/\\t/g, '  ')
      .replace(/\\"/g, '"');
  }
  return text;
}

function stripJsonFence(value) {
  const text = decodeJsonishString(value);
  const fullFence = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fullFence) return fullFence[1].trim();
  return text;
}

function parseJsonCandidate(candidate) {
  const text = stripJsonFence(candidate);
  const attempts = [text];
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) attempts.push(fence[1].trim());
  const firstObject = text.indexOf('{');
  const lastObject = text.lastIndexOf('}');
  if (firstObject >= 0 && lastObject > firstObject) attempts.push(text.slice(firstObject, lastObject + 1));
  const firstArray = text.indexOf('[');
  const lastArray = text.lastIndexOf(']');
  if (firstArray >= 0 && lastArray > firstArray) attempts.push(text.slice(firstArray, lastArray + 1));

  for (const raw of attempts) {
    const attempt = raw.trim();
    if (!/^[{\[]/.test(attempt)) continue;
    try {
      const parsed = JSON.parse(attempt);
      if (typeof parsed === 'string') return parseJsonCandidate(parsed);
      return parsed;
    } catch (_) {}
  }
  return null;
}

function hasStructuredReplyShape(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return STRUCTURED_REPLY_KEYS.some(key => value[key] != null);
}

function jsonField(text, key) {
  const re = new RegExp(`"${key}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`, 'i');
  const match = String(text || '').match(re);
  if (!match) return '';
  return decodeJsonishString(match[1]);
}

function parseMalformedStructuredReply(value) {
  const text = stripJsonFence(value);
  if (!/[{"]\s*(explanation|answer|question|hint|example|code|visual)["\s]*:/i.test(text)) return null;
  const out = {};
  for (const key of ['title', 'type', 'explanation', 'answer', 'content', 'summary', 'question', 'checkpoint', 'hint', 'example', 'visual']) {
    const field = jsonField(text, key);
    if (field) out[key] = field;
  }
  const code = jsonField(text, 'code');
  if (code) out.code = code;
  return hasStructuredReplyShape(out) ? out : null;
}

function arrayish(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(v => cleanText(typeof v === 'string' ? v : v && (v.text || v.content || v.title), 500)).filter(Boolean);
  if (typeof value === 'string') {
    return value
      .split(/\n+|;\s+/)
      .map(item => cleanText(item.replace(/^[-*\u2022\d.)\s]+/, ''), 500))
      .filter(Boolean);
  }
  return [];
}

function markdownCode(code) {
  if (!code) return '';
  if (typeof code === 'string') return code.trim();
  return String(code.content || code.text || code.code || '').trim();
}

function stringifyExample(example) {
  if (!example) return '';
  if (typeof example === 'string') return cleanText(example, 1400);
  const parts = [];
  for (const key of ['scenario', 'setup', 'calculation', 'result', 'explanation', 'content', 'text']) {
    if (example[key]) parts.push(cleanText(example[key], 700));
  }
  return parts.join('\n\n').trim();
}

function sanitizeSourceReferences(text, sourceCount = 0) {
  return String(text || '')
    .replace(/\[(?:chunk|source_chunk)\s*:?\s*\d+\]/gi, '')
    .replace(/\(?\bSource\s+(\d+)\)?/gi, (match, n) => {
      const sourceNum = Number(n);
      if (sourceNum >= 1 && sourceNum <= sourceCount) return `[Source ${sourceNum}]`;
      return '';
    })
    .replace(/\s+([.,;:!?])/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function structuredReplyObject(value) {
  const parsed = parseJsonCandidate(value);
  if (hasStructuredReplyShape(parsed)) return parsed;
  const malformed = parseMalformedStructuredReply(value);
  return hasStructuredReplyShape(malformed) ? malformed : null;
}

function structuredReplyToMarkdown(obj, opts = {}) {
  const sourceCount = Array.isArray(opts.sources) ? opts.sources.length : 0;
  const title = cleanText(obj.title || (obj.type ? String(obj.type).replace(/_/g, ' ') : ''), 120);
  const answer = cleanText(obj.explanation || obj.answer || obj.content || obj.summary || '', 1800);
  const keyPoints = arrayish(obj.key_points || obj.keyPoints || obj.bullets || obj.steps).slice(0, 6);
  const example = stringifyExample(obj.example);
  const hint = cleanText(obj.hint, 800);
  const question = cleanText(obj.question || obj.checkpoint || obj.checkpointQuestion, 800);
  const code = markdownCode(obj.code);
  const language = obj.code && typeof obj.code === 'object' ? cleanText(obj.code.language || 'text', 40) : 'text';
  const visual = typeof obj.visual === 'string'
    ? cleanText(obj.visual, 900)
    : obj.visual && typeof obj.visual === 'object'
      ? cleanText(obj.visual.caption || obj.visual.description || obj.visual.type || '', 900)
      : '';
  const sections = [];
  if (title) sections.push(`### ${title}`);
  sections.push(`### Answer\n${answer || 'Here is the clearest useful version of the answer.'}`);
  if (keyPoints.length) sections.push(`### Key points\n${keyPoints.map(item => `- ${item}`).join('\n')}`);
  if (example) sections.push(`### Example\n${example}`);
  if (code) sections.push(`### Code\n\`\`\`${language || 'text'}\n${code}\n\`\`\``);
  if (visual) sections.push(`### Visual\n${visual}`);
  if (hint) sections.push(`### Hint\n${hint}`);
  if (question) sections.push(`### Check yourself\n${question}`);
  return sourceTextQuality.stripSourceNoise(sanitizeSourceReferences(sections.join('\n\n'), sourceCount));
}

function responseMetadataFromStructured(obj) {
  if (!obj) return null;
  return {
    structured: true,
    type: cleanText(obj.type || '', 80),
    title: cleanText(obj.title || '', 120),
    fields: STRUCTURED_REPLY_KEYS.filter(key => obj[key] != null),
  };
}

function replyLooksBadForDisplay(reply) {
  const text = String(reply || '').trim();
  if (!text) return true;
  if (/^```json/i.test(text) || /^[{\[]/.test(text)) return true;
  if (/"(explanation|question|hint|example|code)"\s*:/.test(text)) return true;
  if (text.length > 1000 && !/\n\s*(#{2,3}\s+|[-*]\s+)/.test(text)) return true;
  return false;
}

function readableFallback(reply, message) {
  const text = cleanText(
    decodeJsonishString(reply)
      .replace(/[{}]/g, ' ')
      .replace(/"([a-zA-Z_]+)"\s*:/g, '\n### $1\n')
      .replace(/",\s*"/g, '\n')
      .replace(/^"+|"+$/g, ''),
    1800,
  );
  const answer = text && !/^###\s*$/m.test(text) ? text : `I can help with that. The key is to connect your question to the main concept and then test it with a small example.`;
  return [
    '### Answer',
    answer,
    '',
    '### Check yourself',
    `Can you restate the main idea behind "${cleanText(message, 90) || 'this topic'}" in one sentence?`,
  ].join('\n');
}

function normalizeTutorChatReply(reply, opts = {}) {
  const structured = structuredReplyObject(reply);
  if (structured) {
    const markdown = structuredReplyToMarkdown(structured, opts);
    return {
      reply: cleanText(markdown, 8000),
      response: responseMetadataFromStructured(structured),
    };
  }
  let text = sanitizeSourceReferences(cleanText(decodeJsonishString(reply), 8000), Array.isArray(opts.sources) ? opts.sources.length : 0);
  if (replyLooksBadForDisplay(text)) text = readableFallback(text, opts.message || '');
  text = sourceTextQuality.stripSourceNoise(text);
  return {
    reply: cleanText(text, 8000),
    response: null,
  };
}

function materialForUser(db, userId, materialId) {
  if (!materialId) return null;
  const row = db.prepare('SELECT id, title FROM materials WHERE id=? AND user_id=?').get(materialId, userId);
  if (!row) throw new HttpError(404, 'material_not_found');
  return row;
}

function parseId(value, fieldName) {
  if (value == null || value === '') return null;
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, `invalid_${fieldName || 'id'}`);
  return id;
}

function conversationForUser(db, userId, conversationId) {
  const row = db.prepare('SELECT * FROM tutor_conversations WHERE id=? AND user_id=?').get(conversationId, userId);
  if (!row) throw new HttpError(404, 'conversation_not_found');
  return row;
}

function titleFromMessage(message, material) {
  const compact = cleanText(message, 80).replace(/\s+/g, ' ');
  if (compact) return compact.length > 70 ? `${compact.slice(0, 67)}...` : compact;
  return material && material.title ? `Chat about ${material.title}` : 'Tutor chat';
}

function createConversation(userId, materialId, title = '') {
  const db = getDb();
  const material = materialForUser(db, userId, materialId || null);
  const conversationTitle = cleanText(title || (material && material.title) || 'Tutor chat', 120);
  const r = db.prepare(`
    INSERT INTO tutor_conversations (user_id, material_id, title, status, created_at, updated_at)
    VALUES (?,?,?,?,?,?)
  `).run(userId, material ? material.id : null, conversationTitle, 'active', nowIso(), nowIso());
  return db.prepare('SELECT * FROM tutor_conversations WHERE id=?').get(r.lastInsertRowid);
}

function formatHistory(rows) {
  const recent = (rows || []).slice(-8);
  if (!recent.length) return '(No previous chat turns.)';
  return recent.map(row => {
    const label = row.role === 'assistant' ? 'Tutor' : 'Student';
    return `${label}: ${cleanText(row.content, 900)}`;
  }).join('\n\n');
}

function parseSuggestions(raw) {
  const text = String(raw || '');
  const match = text.match(/\[SUGGESTIONS\]([\s\S]*?)\[\/SUGGESTIONS\]/i);
  if (!match) return {
    reply: cleanText(text, 4000),
    suggestions: [],
  };
  const suggestions = match[1]
    .split(/\n+/)
    .map(line => line.replace(/^[-*•\d.\s]+/, '').trim())
    .filter(Boolean)
    .slice(0, 3);
  const reply = cleanText(text.replace(match[0], ''), 4000);
  return { reply, suggestions };
}

function fallbackSuggestions(message) {
  const m = String(message || '').toLowerCase();
  if (/code|java|example/.test(m)) return ['Walk me through the code', 'Quiz me on this', 'Show a common mistake'];
  if (/why|intuition|explain/.test(m)) return ['Give me an analogy', 'Show a concrete example', 'Summarize the key idea'];
  return ['Can you give an example?', 'Quiz me on this', 'Explain it more simply'];
}

function groundingSummary(tier, sources = []) {
  const normalized = tier || 'moderate';
  const sourceCount = Array.isArray(sources) ? sources.length : 0;
  if (normalized === 'strong') {
    return {
      tier: 'strong',
      label: 'Strong grounding',
      message: 'This answer is primarily grounded in the uploaded material.',
      sourceCount,
    };
  }
  if (normalized === 'weak') {
    return {
      tier: 'weak',
      label: 'Weak grounding',
      message: 'I could not find strong support for this in your uploaded material; any extra explanation is general subject help.',
      sourceCount,
    };
  }
  return {
    tier: 'moderate',
    label: 'Moderate grounding',
    message: 'This answer uses the uploaded material plus standard subject explanation.',
    sourceCount,
  };
}

function ensureGroundingDisclosure(reply, grounding) {
  const text = cleanText(reply, 8000);
  if (!grounding || grounding.tier !== 'weak') return text;
  const head = text.slice(0, 500).toLowerCase();
  if (
    head.includes('could not find strong support')
    || head.includes('not find this in your uploaded material')
    || head.includes('not enough support in your uploaded material')
    || head.includes('general cs explanation')
    || head.includes('general subject explanation')
  ) {
    return text;
  }
  return cleanText(`${grounding.message}\n\nGeneral subject explanation: ${text}`, 8000);
}

function normalizeAction(action) {
  const key = String(action || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  if (!key) return null;
  if (!CHAT_ACTIONS[key]) throw new HttpError(400, 'invalid_chat_action');
  return key;
}

function dedupeChunks(chunks) {
  const seen = new Set();
  const out = [];
  for (const chunk of chunks || []) {
    const key = `${chunk.corpus || ''}:${chunk.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(chunk);
  }
  return out;
}

function storeMessage(db, conversationId, role, content, opts = {}) {
  const r = db.prepare(`
    INSERT INTO tutor_chat_messages
      (conversation_id, role, content, sources_json, suggestions_json, grounding_tier, trace_json, created_at)
    VALUES (?,?,?,?,?,?,?,?)
  `).run(
    conversationId,
    role,
    cleanText(content, role === 'assistant' ? 8000 : 4000),
    JSON.stringify(opts.sources || []),
    JSON.stringify(opts.suggestions || []),
    opts.groundingTier || null,
    JSON.stringify(opts.trace || {}),
    nowIso()
  );
  return r.lastInsertRowid;
}

function stripTaggedBlock(text, tag) {
  return String(text || '').replace(new RegExp(`\\[${tag}\\][\\s\\S]*?\\[\\/${tag}\\]`, 'ig'), '').trim();
}

function parseTaggedJson(text, tag) {
  const match = String(text || '').match(new RegExp(`\\[${tag}\\]([\\s\\S]*?)\\[\\/${tag}\\]`, 'i'));
  if (!match) return null;
  try {
    return JSON.parse(match[1].trim());
  } catch (_) {
    const objectMatch = match[1].match(/\{[\s\S]*\}/);
    if (!objectMatch) return null;
    try { return JSON.parse(objectMatch[0]); } catch (e) { return null; }
  }
}

function parseActionArtifacts(raw, actionKey) {
  let text = String(raw || '');
  const artifacts = {};
  if (actionKey === 'make_flashcards') {
    const parsed = parseTaggedJson(text, 'FLASHCARDS');
    if (parsed && Array.isArray(parsed.cards)) artifacts.flashcards = parsed.cards;
    text = stripTaggedBlock(text, 'FLASHCARDS');
  }
  if (actionKey === 'quiz_me') {
    const parsed = parseTaggedJson(text, 'QUIZ');
    if (parsed && parsed.question) artifacts.quiz = parsed;
    text = stripTaggedBlock(text, 'QUIZ');
  }
  return { text, artifacts };
}

function sanitizeFlashcards(cards, chunks, topicFallback) {
  const validChunkIds = new Set((chunks || []).map(c => Number(c.id)).filter(Number.isInteger));
  return (cards || [])
    .map(card => {
      const difficulty = String(card && card.difficulty || 'medium').toLowerCase();
      const sourceId = Number(card && card.source_chunk_id);
      return {
        question: cleanText(sourceTextQuality.stripSourceNoise(card && card.question), 280),
        answer: cleanText(sourceTextQuality.stripSourceNoise(card && card.answer), 900),
        difficulty: ['easy', 'medium', 'hard'].includes(difficulty) ? difficulty : 'medium',
        topic: cleanText(sourceTextQuality.stripSourceNoise(card && card.topic || topicFallback || 'Tutor chat'), 120),
        source_chunk_id: Number.isInteger(sourceId) && validChunkIds.has(sourceId) ? sourceId : null,
      };
    })
    .filter(card => card.question && card.answer)
    .slice(0, 3);
}

function fallbackFlashcards(reply, chunks, topicFallback) {
  const sentences = cleanText(reply, 2400)
    .replace(/\[[^\]]+\]/g, '')
    .split(/(?<=[.!?])\s+/)
    .map(s => cleanText(s, 260))
    .filter(s => s.length >= 30);
  const firstChunk = (chunks || []).find(c => c && c.id);
  return sentences.slice(0, 3).map((sentence, index) => ({
    question: `What should you remember about ${topicFallback || 'this concept'}?`,
    answer: sentence,
    difficulty: index === 0 ? 'easy' : 'medium',
    topic: topicFallback || 'Tutor chat',
    source_chunk_id: firstChunk ? firstChunk.id : null,
  }));
}

function persistFlashcards(db, userId, conversation, material, cards) {
  if (!cards.length) return { type: 'flashcards', created: 0, ids: [] };
  const ins = db.prepare(`INSERT INTO flashcards (user_id, material_id, deck, question, answer, difficulty, topic, source_chunk_id, created_at)
                          VALUES (?,?,?,?,?,?,?,?,?)`);
  const deck = material && material.title ? `${material.title} - Tutor chat` : 'Tutor chat';
  const ids = [];
  db.transaction(() => {
    for (const card of cards) {
      const r = ins.run(
        userId,
        conversation.material_id || null,
        deck,
        card.question,
        card.answer,
        card.difficulty || 'medium',
        card.topic || deck,
        card.source_chunk_id || null,
        nowIso()
      );
      ids.push(r.lastInsertRowid);
    }
  })();
  return { type: 'flashcards', created: ids.length, ids, cards };
}

function normalizeQuiz(quiz, reply, topicFallback) {
  if (quiz && quiz.question) {
    const options = Array.isArray(quiz.options) ? quiz.options.map(o => cleanText(sourceTextQuality.stripSourceNoise(o), 180)).filter(Boolean).slice(0, 4) : [];
    const correctIdx = Number(quiz.correct_idx);
    return {
      type: options.length >= 2 ? 'multiple_choice' : 'short_answer',
      question: cleanText(sourceTextQuality.stripSourceNoise(quiz.question), 400),
      options,
      correct_idx: Number.isInteger(correctIdx) && correctIdx >= 0 && correctIdx < options.length ? correctIdx : null,
      expectedAnswer: cleanText(sourceTextQuality.stripSourceNoise(quiz.expectedAnswer || quiz.answer), 600),
      explanation: cleanText(sourceTextQuality.stripSourceNoise(quiz.explanation), 900),
      topic: cleanText(sourceTextQuality.stripSourceNoise(quiz.topic || topicFallback || 'Tutor chat'), 120),
    };
  }
  const firstSentence = cleanText(reply, 1000).split(/(?<=[.!?])\s+/).find(s => s.length > 20) || 'Review the tutor explanation and state the key idea in your own words.';
  return {
    type: 'short_answer',
    question: `In one sentence, explain the key idea about ${topicFallback || 'this concept'}.`,
    options: [],
    correct_idx: null,
    expectedAnswer: sourceTextQuality.stripSourceNoise(firstSentence),
    explanation: 'A strong answer should match the source-grounded explanation from the tutor reply.',
    topic: sourceTextQuality.stripSourceNoise(topicFallback || 'Tutor chat'),
  };
}

function getConversationMessages(db, conversationId, limit = 12) {
  return db.prepare(`
    SELECT id, role, content, sources_json, suggestions_json, grounding_tier, trace_json, created_at
    FROM tutor_chat_messages
    WHERE conversation_id=?
    ORDER BY created_at DESC, id DESC
    LIMIT ?
  `).all(conversationId, limit).reverse();
}

function friendlyAiMessage(err) {
  const code = err && err.code;
  if (code === 'ai_model_missing') return 'The selected tutor model is unavailable. I tried the configured fallback, but no model was ready.';
  if (code === 'ai_auth_failed') return 'The tutor provider rejected the API key. Check the provider credentials or switch to a local model.';
  if (code === 'ai_rate_limited') return 'The tutor provider is rate limited right now. Please try again shortly.';
  if (code === 'ai_timeout') return 'The tutor provider did not respond before the timeout. Please try a shorter question or use the fallback provider.';
  return 'The tutor service is unavailable right now. Check provider settings or try again in a moment.';
}

function formatSourceVisualsForPrompt(candidates = []) {
  const lines = (candidates || []).slice(0, 4).map((candidate) => {
    const heading = sourceTextQuality.sourceLabel(candidate.heading || candidate.visualTypeGuess || 'source visual', 'Source visual');
    const evidence = sourceTextQuality.stripSourceNoise(candidate.nearbyText || candidate.evidence || '', { preserveNewlines: false });
    return `- ${heading}${evidence ? ` (${String(evidence).slice(0, 180)})` : ''}`;
  });
  if (!lines.length) return '';
  return [
    'Source visuals available from the uploaded material:',
    ...lines,
    'Use these only when they directly support the answer. Do not mention page numbers, slide numbers, or lecture numbers.',
  ].join('\n');
}

async function sendMessage(userId, payload = {}) {
  const db = getDb();
  const actionKey = normalizeAction(payload.action);
  const actionDef = actionKey ? CHAT_ACTIONS[actionKey] : null;
  const message = cleanText(payload.message || (actionDef && actionDef.message), 4000);
  if (!message) throw new HttpError(400, 'missing_message');

  let conversation;
  let material = null;
  if (payload.conversation_id) {
    conversation = conversationForUser(db, userId, parseId(payload.conversation_id, 'conversation_id'));
    material = conversation.material_id ? materialForUser(db, userId, conversation.material_id) : null;
  } else {
    const materialId = parseId(payload.material_id, 'material_id');
    material = materialForUser(db, userId, materialId);
    conversation = createConversation(userId, materialId, titleFromMessage(message, material));
  }

  const historyRows = getConversationMessages(db, conversation.id, 10);
  const retrievalStart = Date.now();
  const retrievalMaterialId = conversation.material_id || 'system';
  const domainInfo = conversation.material_id
    ? domainDetection.detectMaterialDomain(userId, conversation.material_id, { hint: message })
    : { domain: 'general', confidence: 0.3, evidence: [], source: 'system' };
  const context = await rag.retrieveLessonContext(retrievalMaterialId, message, {
    feature: 'tutor',
    k: 6,
    maxMerged: 10,
    includeSystem: !conversation.material_id || domainDetection.shouldUseCuratedCs(domainInfo),
  });
  context.chunks = dedupeChunks(context.chunks);
  const retrievalMs = Date.now() - retrievalStart;
  const tier = rag.groundingTier(context);
  const sources = sourceChunksForClient(context.chunks, material ? material.title : 'Noesis tutor corpus');
  const sourceVisuals = conversation.material_id
    ? sourceVisualCandidates.forPrompt(conversation.material_id, { max: Math.min(4, env.SOURCE_VISUALS_MAX_PER_MATERIAL || 4), minScore: 0.45 })
    : [];
  const uploadedChunks = context.uploaded && Array.isArray(context.uploaded.chunks)
    ? context.uploaded.chunks
    : context.chunks.filter(chunk => !chunk.corpus || chunk.corpus === 'uploaded');
  const sourceOutline = conversation.material_id
    ? materialUnderstanding.buildSourceOutline(uploadedChunks, {
      explicitQuery: message,
      hint: message,
      title: material && material.title,
      materialTitle: material && material.title,
      domainInfo,
    })
    : null;
  let sourceTopicPlan = conversation.material_id
    ? sourceTopicPlans.buildSourceTopicPlan({
      materialId: conversation.material_id,
      materialTitle: material && material.title,
      sourceScope: 'material',
      explicitTopic: message,
      requestedTopic: message,
      domainInfo,
      chunks: uploadedChunks,
      sourceOutline,
      maxBalancedChunks: 24,
    })
    : null;
  if (conversation.material_id && sourceTopicPlan && sourceTopicPlan.topicMode === 'material_wide') {
    const topicMap = materialTopicMap.getOrBuild(userId, conversation.material_id, { hint: message, sourceScope: 'material' });
    if (topicMap && Array.isArray(topicMap.topics) && topicMap.topics.length >= 2) {
      sourceTopicPlan = materialTopicMap.sourceTopicPlanForMap(topicMap, uploadedChunks, sourceTopicPlan);
    }
  }
  const grounding = groundingSummary(tier, sources);

  storeMessage(db, conversation.id, 'user', message);

  const conversationHistory = actionKey
    ? formatHistory(historyRows.slice(-6))
    : formatHistory(historyRows);
  const education = env.KNOWLEDGE_CONTEXT_ENABLED && env.KNOWLEDGE_USE_FOR_TUTOR
    ? educationalContext.buildEducationalContext({
      userId,
      materialId: conversation.material_id,
      topic: [message, conversationHistory].filter(Boolean).join('\n'),
      query: message,
      feature: 'tutor',
      ragResult: context,
      domainInfo,
      audienceLevel: 'beginner',
    })
    : null;
  const baseEducationalContextPrompt = education
    ? educationalContext.formatEducationalContextForPrompt(education, { maxChars: env.KNOWLEDGE_CONTEXT_MAX_CHARS })
    : '(Curated knowledge context is disabled.)';
  const visualContextPrompt = formatSourceVisualsForPrompt(sourceVisuals);
  const educationalContextPrompt = [
    baseEducationalContextPrompt,
    visualContextPrompt,
    sourceTopicPlans.formatSourceTopicPlanForPrompt(sourceTopicPlan),
  ].filter(Boolean).join('\n\n');
  const prompt = actionKey
    ? prompts.TUTOR_CHAT_ACTION(context.chunks, message, {
      groundingTier: tier,
      conversationHistory,
      actionLabel: actionDef.label,
      actionInstructions: actionDef.instructions,
      structuredOutputInstructions: actionDef.structured || '',
      educationalContext: educationalContextPrompt,
    })
    : prompts.TUTOR_CHAT(context.chunks, message, {
      groundingTier: tier,
      conversationHistory,
      educationalContext: educationalContextPrompt,
    });

  const generationStart = Date.now();
  let generation = null;
  try {
    generation = await ai.generateWithFallback(prompt, { feature: 'tutor', temperature: 0.35, domain: domainInfo.domain });
  } catch (err) {
    if (err && ['ai_model_missing', 'ai_unavailable', 'ai_timeout', 'ai_rate_limited', 'ai_auth_failed'].includes(err.code)) {
      throw new HttpError(err.status || 503, err.code, friendlyAiMessage(err), err.details);
    }
    throw err;
  }
  let raw = String(generation.text || '').replace(/[\u2010-\u2015]/g, '-');
  const generationMs = Date.now() - generationStart;
  let parsedAction = parseActionArtifacts(raw, actionKey);
  let { reply, suggestions } = parseSuggestions(parsedAction.text);
  if (!reply) reply = 'I could not form a useful answer from the available context. Try asking the question in a more specific way.';
  let normalizedReply = normalizeTutorChatReply(reply, { sources, message, grounding });
  reply = normalizedReply.reply;
  reply = ensureGroundingDisclosure(reply, grounding);
  if (!suggestions.length) suggestions = fallbackSuggestions(message);
  const skipVerifier = actionKey === 'quiz_me' || actionKey === 'make_flashcards';
  let verifier = skipVerifier
    ? { enabled: true, mode: 'deterministic', decision: 'accept', reasonCodes: ['action_artifact_unchanged'], correctedTopic: null, scores: {}, evidence: {} }
    : sourceGroundingJudge.judge({
      feature: 'tutor',
      stage: 'post_generation_chat',
      materialId: conversation.material_id,
      resolvedTopic: null,
      requestedTopic: message,
      domainInfo,
      sourceOutline,
      chunks: uploadedChunks,
      sourceVisuals,
      sourceTopicPlan,
      outputText: reply,
      attempt: 0,
    });
  if (!skipVerifier && verifier.decision === sourceGroundingJudge.DECISIONS.RETRY) {
    const retryPrompt = [
      prompt,
      sourceGroundingJudge.retryGuidance(verifier),
    ].filter(Boolean).join('\n\n');
    try {
      const retryGeneration = await ai.generateWithFallback(retryPrompt, { feature: 'tutor', temperature: 0.25, domain: domainInfo.domain });
      raw = String(retryGeneration.text || '').replace(/[\u2010-\u2015]/g, '-');
      generation = { ...retryGeneration, fallbackUsed: generation.fallbackUsed || retryGeneration.fallbackUsed };
      parsedAction = parseActionArtifacts(raw, actionKey);
      ({ reply, suggestions } = parseSuggestions(parsedAction.text));
      if (!reply) reply = 'I could not form a useful answer from the available context. Try asking the question in a more specific way.';
      normalizedReply = normalizeTutorChatReply(reply, { sources, message, grounding });
      reply = ensureGroundingDisclosure(normalizedReply.reply, grounding);
      if (!suggestions.length) suggestions = fallbackSuggestions(message);
      verifier = sourceGroundingJudge.judge({
        feature: 'tutor',
        stage: 'post_generation_chat',
        materialId: conversation.material_id,
        resolvedTopic: verifier.correctedTopic || null,
        requestedTopic: message,
        domainInfo,
        sourceOutline,
        chunks: uploadedChunks,
        sourceVisuals,
        sourceTopicPlan,
        outputText: reply,
        attempt: 1,
      });
    } catch (_) {
      verifier = {
        ...verifier,
        decision: sourceGroundingJudge.DECISIONS.BLOCK,
        reasonCodes: [...new Set([...(verifier.reasonCodes || []), 'retry_generation_failed'])],
      };
    }
  }
  const verifierBlocked = verifier.decision !== sourceGroundingJudge.DECISIONS.ACCEPT;
  if (verifierBlocked) {
    reply = sourceGroundingJudge.sourceLimitedTutorFallback(verifier, sources);
    suggestions = fallbackSuggestions(message);
    parsedAction = { text: reply, artifacts: {} };
    normalizedReply = { reply, response: { structured: false, type: 'source_grounding_fallback', title: 'Source grounding fallback', fields: [] } };
  }

  let actionResult = null;
  const topicFallback = material && material.title || (historyRows.find(row => row.role === 'assistant') || {}).content || 'Tutor chat';
  if (!verifierBlocked && actionKey === 'make_flashcards') {
    let cards = sanitizeFlashcards(parsedAction.artifacts.flashcards, context.chunks, topicFallback);
    if (!cards.length) cards = sanitizeFlashcards(fallbackFlashcards(reply, context.chunks, topicFallback), context.chunks, topicFallback);
    actionResult = persistFlashcards(db, userId, conversation, material, cards);
  }
  if (!verifierBlocked && actionKey === 'quiz_me') {
    actionResult = {
      type: 'quiz',
      quiz: normalizeQuiz(parsedAction.artifacts.quiz, reply, topicFallback),
    };
  }

  const trace = {
    provider: generation.provider || env.TUTOR_PROVIDER || env.AI_PROVIDER,
    fallbackUsed: !!generation.fallbackUsed,
    model: (env.TUTOR_PROVIDER === 'groq' ? env.GROQ_MODEL : env.OLLAMA_GEN_MODEL),
    retrievalMs,
    generationMs,
    maxScore: context.maxScore,
    meanScore: context.meanScore,
    chunkCount: context.chunks.length,
    action: actionKey || null,
    grounding,
    response: normalizedReply.response,
    educationalContext: education && education.trace || null,
    sourceVisuals,
    sourceOutline: sourceOutline ? {
      mainTopic: sourceOutline.mainTopic,
      keyConcepts: sourceOutline.keyConcepts,
      meaningfulSections: sourceOutline.meaningfulSections,
    } : null,
    verifier,
    domain: domainInfo,
  };
  const assistantMessageId = storeMessage(db, conversation.id, 'assistant', reply, {
    sources,
    sourceVisuals,
    suggestions,
    groundingTier: tier,
    trace: actionResult ? { ...trace, actionResult } : trace,
  });
  db.prepare('UPDATE tutor_conversations SET updated_at=? WHERE id=?').run(nowIso(), conversation.id);

  return {
    conversation_id: conversation.id,
    message_id: assistantMessageId,
    reply,
    sources,
    suggestions,
    groundingTier: tier,
    grounding,
    action: actionKey,
    actionResult,
    response: normalizedReply.response,
    usedExtraExplanation: tier === 'weak',
    trace,
  };
}

function getMessages(userId, conversationId, limit = 50, offset = 0) {
  const db = getDb();
  const conversation = conversationForUser(db, userId, parseId(conversationId, 'conversation_id'));
  const rows = db.prepare(`
    SELECT id, role, content, sources_json, suggestions_json, grounding_tier, trace_json, created_at
    FROM tutor_chat_messages
    WHERE conversation_id=?
    ORDER BY created_at ASC, id ASC
    LIMIT ? OFFSET ?
  `).all(conversation.id, Math.min(Math.max(Number(limit) || 50, 1), 100), Math.max(Number(offset) || 0, 0));
  return {
    conversation,
    messages: rows.map(row => {
      const trace = parseJson(row.trace_json, {});
      return {
        id: row.id,
        role: row.role,
        content: row.content,
        sources: parseJson(row.sources_json, []),
        suggestions: parseJson(row.suggestions_json, []),
        groundingTier: row.grounding_tier || null,
        grounding: trace.grounding || groundingSummary(row.grounding_tier || null, parseJson(row.sources_json, [])),
        trace,
        actionResult: trace.actionResult || null,
        response: trace.response || null,
        created_at: row.created_at,
      };
    }),
  };
}

function getConversations(userId) {
  const db = getDb();
  return db.prepare(`
    SELECT c.id, c.material_id, c.title, c.status, c.created_at, c.updated_at,
           m.title AS material_title,
           (SELECT COUNT(*) FROM tutor_chat_messages msg WHERE msg.conversation_id=c.id) AS message_count
    FROM tutor_conversations c
    LEFT JOIN materials m ON m.id=c.material_id
    WHERE c.user_id=?
    ORDER BY c.updated_at DESC
    LIMIT 50
  `).all(userId);
}

function deleteConversation(userId, conversationId) {
  const db = getDb();
  const conversation = conversationForUser(db, userId, parseId(conversationId, 'conversation_id'));
  db.prepare('DELETE FROM tutor_conversations WHERE id=?').run(conversation.id);
  return { ok: true };
}

module.exports = {
  createConversation,
  sendMessage,
  getMessages,
  getConversations,
  deleteConversation,
  _internals: { parseSuggestions, formatHistory, cleanText, normalizeAction, parseActionArtifacts, sanitizeFlashcards, normalizeQuiz, groundingSummary, ensureGroundingDisclosure, normalizeTutorChatReply, structuredReplyObject },
};
