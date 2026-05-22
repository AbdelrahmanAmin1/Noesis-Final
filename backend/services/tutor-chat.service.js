'use strict';

const { getDb } = require('../config/db');
const env = require('../config/env');
const ai = require('./ai.service');
const rag = require('./rag.service');
const prompts = require('../utils/prompts');
const { HttpError } = require('../middleware/error');
const { sourceChunksForClient } = require('./tutor.service');

const CHAT_ACTIONS = {
  explain_deeper: {
    label: 'Explain deeper',
    message: 'Explain the last concept in more depth with an analogy.',
    instructions: 'Deepen the most recent concept from the conversation. Add one beginner-friendly analogy, one concrete CS example, and one common misconception to avoid.',
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
    message: 'Show me a concrete code example for the last topic.',
    instructions: 'Give one compact code example when the topic is code-related. Explain the example line by line and tie it back to the uploaded material.',
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
      message: 'I could not find strong support for this in your uploaded material; any extra explanation is general CS help.',
      sourceCount,
    };
  }
  return {
    tier: 'moderate',
    label: 'Moderate grounding',
    message: 'This answer uses the uploaded material plus standard CS explanation.',
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
  ) {
    return text;
  }
  return cleanText(`${grounding.message}\n\nGeneral CS explanation: ${text}`, 8000);
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
        question: cleanText(card && card.question, 280),
        answer: cleanText(card && card.answer, 900),
        difficulty: ['easy', 'medium', 'hard'].includes(difficulty) ? difficulty : 'medium',
        topic: cleanText(card && card.topic || topicFallback || 'Tutor chat', 120),
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
    const options = Array.isArray(quiz.options) ? quiz.options.map(o => cleanText(o, 180)).filter(Boolean).slice(0, 4) : [];
    const correctIdx = Number(quiz.correct_idx);
    return {
      type: options.length >= 2 ? 'multiple_choice' : 'short_answer',
      question: cleanText(quiz.question, 400),
      options,
      correct_idx: Number.isInteger(correctIdx) && correctIdx >= 0 && correctIdx < options.length ? correctIdx : null,
      expectedAnswer: cleanText(quiz.expectedAnswer || quiz.answer, 600),
      explanation: cleanText(quiz.explanation, 900),
      topic: cleanText(quiz.topic || topicFallback || 'Tutor chat', 120),
    };
  }
  const firstSentence = cleanText(reply, 1000).split(/(?<=[.!?])\s+/).find(s => s.length > 20) || 'Review the tutor explanation and state the key idea in your own words.';
  return {
    type: 'short_answer',
    question: `In one sentence, explain the key idea about ${topicFallback || 'this concept'}.`,
    options: [],
    correct_idx: null,
    expectedAnswer: firstSentence,
    explanation: 'A strong answer should match the source-grounded explanation from the tutor reply.',
    topic: topicFallback || 'Tutor chat',
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
  const context = await rag.retrieveLessonContext(retrievalMaterialId, message, { feature: 'tutor', k: 6, maxMerged: 10 });
  context.chunks = dedupeChunks(context.chunks);
  const retrievalMs = Date.now() - retrievalStart;
  const tier = rag.groundingTier(context);
  const sources = sourceChunksForClient(context.chunks, material ? material.title : 'Noesis tutor corpus');
  const grounding = groundingSummary(tier, sources);

  storeMessage(db, conversation.id, 'user', message);

  const conversationHistory = actionKey
    ? formatHistory(historyRows.slice(-6))
    : formatHistory(historyRows);
  const prompt = actionKey
    ? prompts.TUTOR_CHAT_ACTION(context.chunks, message, {
      groundingTier: tier,
      conversationHistory,
      actionLabel: actionDef.label,
      actionInstructions: actionDef.instructions,
      structuredOutputInstructions: actionDef.structured || '',
    })
    : prompts.TUTOR_CHAT(context.chunks, message, {
      groundingTier: tier,
      conversationHistory,
    });

  const generationStart = Date.now();
  const raw = await ai.generate(prompt, { feature: 'tutor', temperature: 0.35 });
  const generationMs = Date.now() - generationStart;
  const parsedAction = parseActionArtifacts(raw, actionKey);
  let { reply, suggestions } = parseSuggestions(parsedAction.text);
  if (!reply) reply = 'I could not form a useful answer from the available context. Try asking the question in a more specific way.';
  reply = ensureGroundingDisclosure(reply, grounding);
  if (!suggestions.length) suggestions = fallbackSuggestions(message);

  let actionResult = null;
  const topicFallback = material && material.title || (historyRows.find(row => row.role === 'assistant') || {}).content || 'Tutor chat';
  if (actionKey === 'make_flashcards') {
    let cards = sanitizeFlashcards(parsedAction.artifacts.flashcards, context.chunks, topicFallback);
    if (!cards.length) cards = sanitizeFlashcards(fallbackFlashcards(reply, context.chunks, topicFallback), context.chunks, topicFallback);
    actionResult = persistFlashcards(db, userId, conversation, material, cards);
  }
  if (actionKey === 'quiz_me') {
    actionResult = {
      type: 'quiz',
      quiz: normalizeQuiz(parsedAction.artifacts.quiz, reply, topicFallback),
    };
  }

  const trace = {
    provider: env.TUTOR_PROVIDER || env.AI_PROVIDER,
    model: (env.TUTOR_PROVIDER === 'groq' ? env.GROQ_MODEL : env.OLLAMA_GEN_MODEL),
    retrievalMs,
    generationMs,
    maxScore: context.maxScore,
    meanScore: context.meanScore,
    chunkCount: context.chunks.length,
    action: actionKey || null,
    grounding,
  };
  const assistantMessageId = storeMessage(db, conversation.id, 'assistant', reply, {
    sources,
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
  _internals: { parseSuggestions, formatHistory, cleanText, normalizeAction, parseActionArtifacts, sanitizeFlashcards, normalizeQuiz, groundingSummary, ensureGroundingDisclosure },
};
