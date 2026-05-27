'use strict';

const express = require('express');
const cookieParser = require('cookie-parser');
const request = require('supertest');
const { setupTestEnv, cleanupTestDb, createTestUser } = require('./helpers/setup');

setupTestEnv();

const ai = require('../services/ai.service');
const env = require('../config/env');
const { migrate, getDb } = require('../config/db');
const { notFound, errorHandler } = require('../middleware/error');

function getPracticeApp() {
  setupTestEnv();
  cleanupTestDb();
  migrate();
  const app = express();
  app.use(cookieParser());
  app.use(express.json({ limit: '2mb' }));
  app.use('/api/auth', require('../routes/auth.routes'));
  app.use('/api/quizzes', require('../routes/quiz.routes'));
  app.use('/api/flashcards', require('../routes/flashcard.routes'));
  app.use(notFound);
  app.use(errorHandler);
  return { app, db: getDb() };
}

function seedMaterial(db, userId, title = 'Encapsulation Notes') {
  const now = new Date().toISOString();
  const materialId = db.prepare(`INSERT INTO materials (user_id, title, type, file_path, mime, size_bytes, status, progress, created_at)
    VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(userId, title, 'pdf', 'encapsulation.pdf', 'application/pdf', 100, 'ready', 100, now).lastInsertRowid;
  const chapterId = db.prepare('INSERT INTO chapters (material_id, idx, title, char_start, char_end) VALUES (?,?,?,?,?)')
    .run(materialId, 0, 'OOP Basics', 0, 1000).lastInsertRowid;
  db.prepare(`INSERT INTO chunks
    (material_id, chapter_id, idx, text, token_count, chapter_title, heading, has_code, keywords_json)
    VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(materialId, chapterId, 0, [
      'Encapsulation keeps fields private and exposes validated public methods.',
      'The instructor uses a BankAccount example with private balance and deposit or withdraw methods.',
      'A common mistake is making balance public or using setters without validation.',
    ].join('\n'), 80, 'OOP Basics', 'Encapsulation', 1, '["encapsulation","data hiding","BankAccount"]');
  return materialId;
}

describe('quiz and flashcard generation routes with educational context', () => {
  let app, db, token, user, materialId;

  beforeEach(async () => {
    vi.restoreAllMocks();
    vi.spyOn(ai, 'embed').mockRejectedValue(new Error('embedding skipped in practice route tests'));
    vi.spyOn(ai, 'assertModelsAvailable').mockResolvedValue(undefined);
    vi.spyOn(ai, 'generate').mockResolvedValue('{}');
    env.FLASHCARD_PROVIDER = 'ollama';
    env.FLASHCARD_FALLBACK_PROVIDER = 'ollama';
    env.FLASHCARD_MAX_CARDS = 6;
    env.FLASHCARD_TOP_K_CHUNKS = 3;
    env.FLASHCARD_MAX_CONTEXT_CHARS = 4000;
    env.FLASHCARD_TIMEOUT_MS = 60000;
    env.GROQ_API_KEY = '';

    const setup = getPracticeApp();
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

  it('passes curated context to quiz generation while preserving stored quiz fields', async () => {
    ai.generate.mockResolvedValueOnce(JSON.stringify({
      questions: [{
        question: 'Why should BankAccount.balance be private?',
        options: [
          'So updates can be validated through public methods',
          'So any class can change it directly',
          'So inheritance is disabled',
          'So dynamic dispatch chooses deposit',
        ],
        correct_idx: 0,
        explanation: 'Private balance protects the account from invalid changes and forces controlled access.',
        difficulty: 'medium',
        topic: 'Encapsulation',
      }],
    }));

    const res = await request(app)
      .post('/api/quizzes/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({ material_id: materialId, count: 1, difficulty: 'medium' });

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(2);
    const promptSeen = ai.generate.mock.calls[0][0];
    expect(promptSeen).toContain('Educational context');
    expect(promptSeen).toContain('BankAccount');
    expect(promptSeen).toContain('Uploaded excerpts are the course-specific source of truth');
    expect(promptSeen).toContain('correct_idx');

    const stored = db.prepare('SELECT question, options_json, correct_idx, explanation, concept FROM quiz_questions WHERE quiz_id=? ORDER BY idx').all(res.body.quiz_id);
    expect(stored.length).toBe(2);
    expect(stored[0].question).toMatch(/BankAccount\.balance/i);
    expect(JSON.parse(stored[0].options_json)).toHaveLength(4);
    expect(stored[0].correct_idx).toBe(0);
    expect(stored[0].concept).toBe('Encapsulation');
  });

  it('passes curated context to flashcard generation and strips visible chunk ids', async () => {
    ai.generate.mockResolvedValueOnce(JSON.stringify({
      cards: [{
        question: 'Why should balance be private in BankAccount?',
        answer: 'Because validated public methods prevent invalid account changes. [chunk:1]',
        difficulty: 'easy',
        topic: 'Encapsulation',
        source_chunk_id: 1,
      }],
    }));

    const res = await request(app)
      .post('/api/flashcards/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({ material_id: materialId, count: 1 });

    expect(res.status).toBe(200);
    expect(res.body.created).toBe(1);
    const promptSeen = ai.generate.mock.calls[0][0];
    expect(promptSeen).toContain('Educational context');
    expect(promptSeen).toContain('BankAccount');
    expect(promptSeen).toContain('Do not put raw chunk IDs');

    const stored = db.prepare('SELECT question, answer, topic, source_chunk_id FROM flashcards WHERE id=?').get(res.body.ids[0]);
    expect(stored.question).toMatch(/balance/i);
    expect(stored.answer).not.toMatch(/\[chunk:/i);
    expect(stored.topic).toBe('Encapsulation');
    expect(stored.source_chunk_id === null || Number.isInteger(stored.source_chunk_id)).toBe(true);
  });

  it('uses Groq first for flashcards when configured', async () => {
    env.FLASHCARD_PROVIDER = 'groq';
    env.FLASHCARD_FALLBACK_PROVIDER = 'ollama';
    env.GROQ_API_KEY = 'test-groq-key';
    ai.generate.mockResolvedValueOnce(JSON.stringify({
      cards: [{
        question: 'What does encapsulation protect?',
        answer: 'It protects object state by keeping fields private and using validated public methods.',
        difficulty: 'easy',
        topic: 'Encapsulation',
        source_chunk_id: 1,
      }],
    }));

    const res = await request(app)
      .post('/api/flashcards/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({ material_id: materialId, count: 1 });

    expect(res.status).toBe(200);
    expect(res.body.fallback).toBe(false);
    expect(ai.generate.mock.calls[0][1].provider).toBe('groq');
    expect(ai.generate.mock.calls[0][1].feature).toBe('flashcards');
  });

  it('falls back to deterministic flashcards when Ollama times out', async () => {
    env.FLASHCARD_PROVIDER = 'groq';
    env.FLASHCARD_FALLBACK_PROVIDER = 'ollama';
    env.GROQ_API_KEY = '';
    env.FLASHCARD_TIMEOUT_MS = 1;
    ai.generate.mockImplementationOnce(() => new Promise(() => {}));

    const res = await request(app)
      .post('/api/flashcards/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({ material_id: materialId, count: 3, regenerate: true });

    expect(res.status).toBe(200);
    expect(res.body.fallback).toBe(true);
    expect(res.body.fallback_reason).toBe('ai_timeout');
    expect(res.body.created).toBeGreaterThan(0);
    expect(res.body.created).toBeLessThanOrEqual(3);

    const stored = db.prepare('SELECT question, answer FROM flashcards WHERE user_id=? ORDER BY id').all(user.id);
    expect(stored.length).toBe(res.body.created);
    for (const card of stored) {
      expect(card.question).not.toMatch(/\[chunk:/i);
      expect(card.answer).not.toMatch(/\[chunk:|sourceChunkIds|debug|trace/i);
    }
  });

  it('limits flashcard count to ten', async () => {
    ai.generate.mockResolvedValueOnce(JSON.stringify({
      cards: Array.from({ length: 12 }, (_, idx) => ({
        question: `What is encapsulation card ${idx + 1}?`,
        answer: `Encapsulation card ${idx + 1} keeps state controlled through validated methods.`,
        difficulty: 'easy',
        topic: 'Encapsulation',
        source_chunk_id: 1,
      })),
    }));

    const res = await request(app)
      .post('/api/flashcards/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({ material_id: materialId, count: 99, regenerate: true });

    expect(res.status).toBe(200);
    expect(res.body.created).toBe(10);
  });

  it('reuses existing flashcards unless regeneration is requested', async () => {
    const existingId = db.prepare(`INSERT INTO flashcards
      (user_id, material_id, deck, question, answer, difficulty, topic, source_chunk_id, created_at)
      VALUES (?,?,?,?,?,?,?,?,?)`)
      .run(user.id, materialId, 'Encapsulation Notes', 'Why private fields?', 'They prevent invalid direct state changes.', 'easy', 'Encapsulation Notes', null, new Date().toISOString()).lastInsertRowid;

    const res = await request(app)
      .post('/api/flashcards/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({ material_id: materialId, count: 6 });

    expect(res.status).toBe(200);
    expect(res.body.reused).toBe(true);
    expect(res.body.created).toBe(0);
    expect(res.body.ids).toEqual([existingId]);
    expect(ai.generate).not.toHaveBeenCalled();
  });
});
