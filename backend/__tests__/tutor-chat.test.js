'use strict';

const express = require('express');
const cookieParser = require('cookie-parser');
const fs = require('fs');
const request = require('supertest');
const { setupTestEnv, cleanupTestDb, createTestUser } = require('./helpers/setup');

setupTestEnv();

const ai = require('../services/ai.service');
const tts = require('../services/tts.service');
const { migrate, getDb } = require('../config/db');
const { notFound, errorHandler } = require('../middleware/error');

function getTutorChatTestApp() {
  setupTestEnv();
  process.env.TUTOR_PROVIDER = 'ollama';
  process.env.TTS_ENGINE = 'silence';
  process.env.NOESIS_ALLOW_SILENT_TTS = 'true';
  cleanupTestDb();
  migrate();
  const app = express();
  app.use(cookieParser());
  app.use(express.json({ limit: '2mb' }));
  app.use('/api/auth', require('../routes/auth.routes'));
  app.use('/api/tutor', require('../routes/tutor.routes'));
  app.use(notFound);
  app.use(errorHandler);
  return { app, db: getDb() };
}

function seedMaterial(db, userId, title = 'Polymorphism Lecture') {
  const now = new Date().toISOString();
  const materialId = db.prepare(`INSERT INTO materials (user_id, title, type, file_path, mime, size_bytes, status, progress, created_at)
    VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(userId, title, 'pdf', 'poly.pdf', 'application/pdf', 100, 'ready', 100, now).lastInsertRowid;
  const chapterId = db.prepare('INSERT INTO chapters (material_id, idx, title, char_start, char_end) VALUES (?,?,?,?,?)')
    .run(materialId, 0, 'Chapter 10', 0, 1000).lastInsertRowid;
  db.prepare(`INSERT INTO chunks
    (material_id, chapter_id, idx, text, token_count, chapter_title, heading, has_code, keywords_json)
    VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(materialId, chapterId, 0, [
      'What is polymorphism?',
      'A superclass reference can point at a subclass object.',
      'The runtime object determines which overridden method is called.',
      'Dynamic dispatch chooses Circle.draw or Rectangle.draw at runtime.',
    ].join('\n'), 80, 'Chapter 10', 'Polymorphism', 1, '["polymorphism","dynamic dispatch"]');
  return materialId;
}

function seedSystemCorpus(db) {
  const now = new Date().toISOString();
  db.prepare(`INSERT OR IGNORE INTO users (id, email, password_hash, name, created_at)
    VALUES (?,?,?,?,?)`).run(0, 'system@noesis.local', 'system', 'Noesis System', now);
  const materialId = db.prepare(`INSERT INTO materials (user_id, title, type, file_path, mime, size_bytes, status, progress, created_at)
    VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(0, 'Core Tutor Corpus', 'seed', 'system.md', 'text/markdown', 100, 'ready', 100, now).lastInsertRowid;
  const chapterId = db.prepare('INSERT INTO chapters (material_id, idx, title, char_start, char_end) VALUES (?,?,?,?,?)')
    .run(materialId, 0, 'Core CS', 0, 1000).lastInsertRowid;
  db.prepare(`INSERT INTO chunks
    (material_id, chapter_id, idx, text, token_count, chapter_title, heading, has_code, keywords_json)
    VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(materialId, chapterId, 0, 'Big-O describes how runtime grows as input size increases.', 40, 'Core CS', 'Big-O', 0, '["big-o"]');
  return materialId;
}

function mockGeneration(text) {
  ai.generate.mockResolvedValueOnce(text);
}

describe('free-form tutor chat routes', () => {
  let app, db, token, user, materialId;

  beforeEach(async () => {
    vi.restoreAllMocks();
    vi.spyOn(ai, 'embed').mockRejectedValue(new Error('embedding skipped in chat tests'));
    vi.spyOn(ai, 'generate').mockResolvedValue([
      'Polymorphism lets one reference call behavior chosen by the runtime object [Source 1].',
      '',
      '[SUGGESTIONS]',
      '- Show a code example',
      '- Quiz me on this',
      '[/SUGGESTIONS]',
    ].join('\n'));
    vi.spyOn(tts, 'synthesize').mockImplementation(async (_text, outPath) => {
      fs.writeFileSync(outPath, Buffer.from('RIFF$\0\0\0WAVEfmt \x10\0\0\0\x01\0\x01\0D\xac\0\0\x88X\x01\0\x02\0\x10\0data\0\0\0\0', 'binary'));
      return outPath;
    });

    const setup = getTutorChatTestApp();
    app = setup.app;
    db = setup.db;
    const created = await createTestUser(app, request);
    user = created.user;
    token = created.token;
    materialId = seedMaterial(db, user.id);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    cleanupTestDb();
  });

  it('creates a grounded conversation with sources, suggestions, and persistence', async () => {
    const res = await request(app)
      .post('/api/tutor/chat')
      .set('Authorization', `Bearer ${token}`)
      .send({ material_id: materialId, message: 'What is polymorphism?' });

    expect(res.status).toBe(200);
    expect(res.body.conversation_id).toBeDefined();
    expect(res.body.reply).toMatch(/runtime object/i);
    expect(res.body.sources.length).toBeGreaterThanOrEqual(1);
    expect(res.body.sources[0].heading).toMatch(/Polymorphism/i);
    expect(res.body.suggestions).toContain('Show a code example');
    expect(res.body.groundingTier).toMatch(/strong|moderate|weak/);
    expect(res.body.grounding.label).toMatch(/grounding/i);
    expect(res.body.trace.educationalContext.curatedMatched).toBe(true);

    const promptSeen = ai.generate.mock.calls[0][0];
    expect(promptSeen).toContain('Educational context');
    expect(promptSeen).toContain('Polymorphism');
    expect(promptSeen).toContain('Shape');
    expect(promptSeen).toContain('Circle');
    expect(promptSeen).toContain('uploaded material');

    const stored = db.prepare('SELECT role, content FROM tutor_chat_messages WHERE conversation_id=? ORDER BY id').all(res.body.conversation_id);
    expect(stored.map(row => row.role)).toEqual(['user', 'assistant']);
  });

  it('sanitizes page and lecture labels from free chat replies before returning and storing', async () => {
    mockGeneration([
      '### Answer',
      'Page 1 CS 2110 September 18, 2025 Lecture 8: Polymorphism lets the runtime object choose the overridden method [Source 1].',
      '',
      '[SUGGESTIONS]',
      '- Show a code example',
      '- Quiz me',
      '[/SUGGESTIONS]',
    ].join('\n'));

    const res = await request(app)
      .post('/api/tutor/chat')
      .set('Authorization', `Bearer ${token}`)
      .send({ material_id: materialId, message: 'What is polymorphism?' });

    expect(res.status).toBe(200);
    expect(res.body.reply).toMatch(/runtime object/i);
    expect(res.body.reply).not.toMatch(/\b(Page|Lecture|Slide)\s*\d+\b/i);
    expect(res.body.reply).not.toMatch(/\bCS\s*2110\b|September\s+18,\s+2025/i);
    const stored = db.prepare('SELECT content FROM tutor_chat_messages WHERE id=?').get(res.body.message_id);
    expect(stored.content).not.toMatch(/\b(Page|Lecture|Slide)\s*\d+\b/i);
  });

  it('normalizes raw JSON tutor replies into readable markdown', async () => {
    mockGeneration(JSON.stringify({
      explanation: 'Polymorphism lets a superclass reference call behavior chosen by the runtime object [Source 1].',
      question: 'Who decides which overridden method runs?',
      hint: 'Look at the actual object created at runtime.',
      example: 'Shape s = new Circle(); s.draw(); calls Circle.draw().',
      code: { language: 'java', content: 'Shape s = new Circle();\ns.draw();' },
    }));

    const res = await request(app)
      .post('/api/tutor/chat')
      .set('Authorization', `Bearer ${token}`)
      .send({ material_id: materialId, message: 'Explain polymorphism.' });

    expect(res.status).toBe(200);
    expect(res.body.reply).toMatch(/### Answer/);
    expect(res.body.reply).toMatch(/### Example/);
    expect(res.body.reply).not.toMatch(/^\s*[\{\[]/);
    expect(res.body.response.structured).toBe(true);

    const stored = db.prepare('SELECT content, trace_json FROM tutor_chat_messages WHERE id=?').get(res.body.message_id);
    expect(stored.content).toMatch(/runtime object/i);
    expect(stored.content).not.toMatch(/"explanation"\s*:/);
    expect(JSON.parse(stored.trace_json).response.structured).toBe(true);
  });

  it('normalizes fenced JSON tutor replies', async () => {
    mockGeneration([
      '```json',
      '{"title":"Polymorphism check","explanation":"Dynamic dispatch chooses the overridden method from the runtime object.","question":"Why does the runtime object matter?"}',
      '```',
    ].join('\n'));

    const res = await request(app)
      .post('/api/tutor/chat')
      .set('Authorization', `Bearer ${token}`)
      .send({ material_id: materialId, message: 'Quiz me on dynamic dispatch.' });

    expect(res.status).toBe(200);
    expect(res.body.reply).toMatch(/Polymorphism check/);
    expect(res.body.reply).toMatch(/### Check yourself/);
    expect(res.body.reply).not.toMatch(/```json/);
  });

  it('recovers malformed JSON-like tutor replies without exposing braces', async () => {
    const svc = require('../services/tutor-chat.service');
    const out = svc._internals.normalizeTutorChatReply(
      '{"explanation":"A node stores data and a next pointer.","question":"What does next reference?", "hint":"Follow the pointer to the next node."',
      { sources: [], message: 'What is a node?' },
    );

    expect(out.reply).toMatch(/### Answer/);
    expect(out.reply).toMatch(/next pointer/i);
    expect(out.reply).not.toMatch(/^\s*[\{\[]/);
    expect(out.reply).not.toMatch(/"explanation"\s*:/);
  });

  it('appends to an existing conversation and returns messages in chronological order', async () => {
    const first = await request(app)
      .post('/api/tutor/chat')
      .set('Authorization', `Bearer ${token}`)
      .send({ material_id: materialId, message: 'What is polymorphism?' });

    mockGeneration([
      'Dynamic dispatch means the object type wins over the reference type [Source 1].',
      '',
      '[SUGGESTIONS]',
      '- Compare this with overloading',
      '- Give me a quiz',
      '[/SUGGESTIONS]',
    ].join('\n'));

    const second = await request(app)
      .post('/api/tutor/chat')
      .set('Authorization', `Bearer ${token}`)
      .send({ conversation_id: first.body.conversation_id, message: 'What decides the draw method?' });

    expect(second.status).toBe(200);
    expect(second.body.conversation_id).toBe(first.body.conversation_id);

    const messages = await request(app)
      .get(`/api/tutor/chat/${first.body.conversation_id}/messages`)
      .set('Authorization', `Bearer ${token}`);

    expect(messages.status).toBe(200);
    expect(messages.body.messages).toHaveLength(4);
    expect(messages.body.messages.map(m => m.role)).toEqual(['user', 'assistant', 'user', 'assistant']);
    expect(messages.body.messages[1].sources.length).toBeGreaterThan(0);

    const conversations = await request(app)
      .get('/api/tutor/chat/conversations')
      .set('Authorization', `Bearer ${token}`);

    expect(conversations.status).toBe(200);
    expect(conversations.body.conversations[0].message_count).toBe(4);
  });

  it('can answer from the system corpus when no material is selected', async () => {
    seedSystemCorpus(db);
    mockGeneration([
      'Big-O explains how work grows with input size [Source 1].',
      '',
      '[SUGGESTIONS]',
      '- Show growth examples',
      '- Quiz me',
      '[/SUGGESTIONS]',
    ].join('\n'));

    const res = await request(app)
      .post('/api/tutor/chat')
      .set('Authorization', `Bearer ${token}`)
      .send({ message: 'What is Big-O?' });

    expect(res.status).toBe(200);
    expect(res.body.sources[0].materialTitle).toBe('Noesis tutor corpus');
    expect(res.body.sources).toHaveLength(1);
    expect(res.body.sources[0].corpus).toBe('system');
    expect(res.body.reply).toMatch(/Big-O/i);
  });

  it('rejects invalid material ids before generation', async () => {
    const res = await request(app)
      .post('/api/tutor/chat')
      .set('Authorization', `Bearer ${token}`)
      .send({ material_id: 999999, message: 'What is this?' });

    expect(res.status).toBe(404);
    expect(ai.generate).not.toHaveBeenCalled();
  });

  it('enforces conversation ownership', async () => {
    const first = await request(app)
      .post('/api/tutor/chat')
      .set('Authorization', `Bearer ${token}`)
      .send({ material_id: materialId, message: 'What is polymorphism?' });

    const other = await createTestUser(app, request);
    const blocked = await request(app)
      .get(`/api/tutor/chat/${first.body.conversation_id}/messages`)
      .set('Authorization', `Bearer ${other.token}`);

    expect(blocked.status).toBe(404);
  });

  it('returns structured quiz data for the quiz action chip', async () => {
    mockGeneration([
      'Here is a quick check grounded in the material [Source 1].',
      '',
      '[SUGGESTIONS]',
      '- Explain the answer',
      '- Give another quiz',
      '[/SUGGESTIONS]',
      '[QUIZ]',
      '{"type":"multiple_choice","question":"Page 2 Lecture 8: Who decides which overridden method runs?","options":["The compiler only","Slide 4: The runtime object","The file name"],"correct_idx":1,"expectedAnswer":"Lecture 8: The runtime object","explanation":"Lecture 8 says dynamic dispatch chooses the method from the actual object.","topic":"Lecture 8: Polymorphism"}',
      '[/QUIZ]',
    ].join('\n'));

    const res = await request(app)
      .post('/api/tutor/chat')
      .set('Authorization', `Bearer ${token}`)
      .send({ material_id: materialId, message: 'Quiz me', action: 'quiz_me' });

    expect(res.status).toBe(200);
    expect(res.body.action).toBe('quiz_me');
    expect(res.body.actionResult.type).toBe('quiz');
    expect(res.body.actionResult.quiz.question).toMatch(/overridden method/i);
    expect(res.body.actionResult.quiz.correct_idx).toBe(1);
    expect(JSON.stringify(res.body.actionResult.quiz)).not.toMatch(/\b(Page|Lecture|Slide)\s*\d+\b/i);
    expect(res.body.actionResult.quiz.topic).toBe('Polymorphism');
  });

  it('creates flashcards from the flashcard action chip', async () => {
    mockGeneration([
      'Page 1 CS 2110 Lecture 8: I made three focused flashcards from the current concept [Source 1].',
      '',
      '[SUGGESTIONS]',
      '- Review these cards',
      '- Quiz me',
      '[/SUGGESTIONS]',
      '[FLASHCARDS]',
      '{"cards":[{"question":"Page 1 Lecture 8: What is dynamic dispatch?","answer":"Lecture 8 says runtime method selection is based on the actual object.","difficulty":"medium","topic":"Lecture 8: Polymorphism","source_chunk_id":1},{"question":"What can a superclass reference point to?","answer":"A subclass object.","difficulty":"easy","topic":"Polymorphism","source_chunk_id":1},{"question":"Why is polymorphism useful?","answer":"It lets shared code call behavior implemented differently by subclasses.","difficulty":"medium","topic":"Polymorphism","source_chunk_id":1}]}',
      '[/FLASHCARDS]',
    ].join('\n'));

    const res = await request(app)
      .post('/api/tutor/chat')
      .set('Authorization', `Bearer ${token}`)
      .send({ material_id: materialId, message: 'Make flashcards', action: 'make_flashcards' });

    expect(res.status).toBe(200);
    expect(res.body.reply).not.toMatch(/\b(Page|Lecture|Slide)\s*\d+\b/i);
    expect(res.body.actionResult.type).toBe('flashcards');
    expect(res.body.actionResult.created).toBe(3);
    const count = db.prepare('SELECT COUNT(*) AS n FROM flashcards WHERE user_id=?').get(user.id).n;
    expect(count).toBe(3);
    const stored = db.prepare('SELECT question, answer, topic FROM flashcards WHERE user_id=? ORDER BY id LIMIT 1').get(user.id);
    expect(`${stored.question} ${stored.answer} ${stored.topic}`).not.toMatch(/\b(Page|Lecture|Slide)\s*\d+\b/i);
    expect(stored.question).toMatch(/dynamic dispatch/i);
    expect(stored.topic).toBe('Polymorphism');
  });

  it('streams tutor TTS audio and validates text length', async () => {
    const wav = await request(app)
      .post('/api/tutor/tts')
      .set('Authorization', `Bearer ${token}`)
      .send({ text: 'Polymorphism lets objects answer through a shared reference.' });

    expect(wav.status).toBe(200);
    expect(wav.headers['content-type']).toMatch(/audio\/wav/);
    expect(wav.body.length).toBeGreaterThan(8);

    const empty = await request(app)
      .post('/api/tutor/tts')
      .set('Authorization', `Bearer ${token}`)
      .send({ text: '' });
    expect(empty.status).toBe(400);

    const tooLong = await request(app)
      .post('/api/tutor/tts')
      .set('Authorization', `Bearer ${token}`)
      .send({ text: 'x'.repeat(4001) });
    expect(tooLong.status).toBe(400);
  });
});
