'use strict';

const express = require('express');
const cookieParser = require('cookie-parser');
const request = require('supertest');
const { setupTestEnv, cleanupTestDb, createTestUser } = require('./helpers/setup');
const { migrate, getDb } = require('../config/db');
const { notFound, errorHandler } = require('../middleware/error');

function getTutorTestApp() {
  setupTestEnv();
  process.env.TUTOR_ASYNC_START = 'true';
  process.env.TUTOR_PROVIDER = 'ollama';
  cleanupTestDb();
  migrate();
  const app = express();
  app.use(cookieParser());
  app.use(express.json({ limit: '2mb' }));
  app.use('/api/auth', require('../routes/auth.routes'));
  app.use('/api/materials', require('../routes/material.routes'));
  app.use('/api/tutor', require('../routes/tutor.routes'));
  app.use('/api/jobs', require('../routes/jobs.routes'));
  app.use(notFound);
  app.use(errorHandler);
  return { app, db: getDb() };
}

function seedPolymorphismMaterial(db, userId) {
  const now = new Date().toISOString();
  const materialId = db.prepare(`INSERT INTO materials (user_id, title, type, file_path, mime, size_bytes, status, progress, created_at)
    VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(userId, '15', 'pdf', 'test.pdf', 'application/pdf', 100, 'ready', 100, now).lastInsertRowid;
  const chapterId = db.prepare('INSERT INTO chapters (material_id, idx, title, char_start, char_end) VALUES (?,?,?,?,?)')
    .run(materialId, 0, 'Chapter 10', 0, 1000).lastInsertRowid;
  db.prepare(`INSERT INTO chunks
    (material_id, chapter_id, idx, text, token_count, chapter_title, heading, has_code, keywords_json)
    VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(materialId, chapterId, 0, [
      'Chapter 10',
      'What is polymorphism?',
      'A superclass reference can be aimed at a subclass object.',
      'The type of the actual referenced object, not the reference, determines which method is called.',
      'Dynamic dispatch chooses Circle.draw or Rectangle.draw at runtime.',
    ].join('\n'), 80, 'Chapter 10', 'Polymorphism', 1, '[]');
  return materialId;
}

async function waitForReady(app, token, sessionId) {
  for (let i = 0; i < 80; i += 1) {
    const res = await request(app)
      .get(`/api/tutor/sessions/${sessionId}/status`)
      .set('Authorization', `Bearer ${token}`);
    if (res.body.status === 'ready') return res.body;
    if (res.body.status === 'failed') throw new Error(res.body.error || 'failed');
    await new Promise(resolve => setTimeout(resolve, 75));
  }
  throw new Error('session_not_ready');
}

describe('AI tutor routes', () => {
  let app, db, token, user, materialId;

  beforeEach(async () => {
    const setup = getTutorTestApp();
    app = setup.app;
    db = setup.db;
    const created = await createTestUser(app, request);
    user = created.user;
    token = created.token;
    materialId = seedPolymorphismMaterial(db, user.id);
  });

  afterEach(() => {
    cleanupTestDb();
  });

  it('returns a useful material display title instead of numeric filename', async () => {
    const res = await request(app)
      .get('/api/materials')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const material = res.body.materials.find(m => m.id === materialId);
    expect(material.title).toBe('15');
    expect(material.display_title).toBe('Chapter 10 — Polymorphism');
  });

  it('starts an async structured tutor session and continues to the next step', async () => {
    const start = await request(app)
      .post('/api/tutor/sessions')
      .set('Authorization', `Bearer ${token}`)
      .send({ material_id: materialId, concept: '15', mode: 'socratic' });

    expect(start.status).toBe(202);
    expect(start.body.session_id).toBeDefined();

    await waitForReady(app, token, start.body.session_id);

    const sessionRes = await request(app)
      .get(`/api/tutor/sessions/${start.body.session_id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(sessionRes.status).toBe(200);
    expect(sessionRes.body.topic).toBe('Polymorphism');
    expect(sessionRes.body.steps[0].content).toMatch(/runtime object/i);
    expect(JSON.stringify(sessionRes.body.steps)).not.toContain('...');
    expect(sessionRes.body.sources[0].heading).toMatch(/Polymorphism|Chapter 10/i);
    expect(sessionRes.body.trace.provider).toBeDefined();

    const confused = await request(app)
      .post(`/api/tutor/sessions/${start.body.session_id}/continue`)
      .set('Authorization', `Bearer ${token}`)
      .send({ intent: 'confused' });

    expect(confused.status).toBe(200);
    expect(confused.body.currentStepIndex).toBe(0);
    expect(confused.body.stay).toBe(true);
    expect(confused.body.professorCue).toBeDefined();
    expect(confused.body.followUpQuestion).toBeDefined();

    const cont = await request(app)
      .post(`/api/tutor/sessions/${start.body.session_id}/continue`)
      .set('Authorization', `Bearer ${token}`)
      .send({ answer: 'The runtime Circle object decides which draw method is called.', intent: 'check' });

    expect(cont.status).toBe(200);
    expect(cont.body.currentStepIndex).toBe(1);
    expect(cont.body.nextStep.label).toBe('Intuition');
    expect(cont.body.feedback).toMatch(/Nice|keep going/i);
    expect(cont.body.stay).toBe(false);
  });

  it('does not rate-limit normal rapid guided tutor turns with the generic AI limiter', async () => {
    const start = await request(app)
      .post('/api/tutor/sessions')
      .set('Authorization', `Bearer ${token}`)
      .send({ material_id: materialId, concept: '15', mode: 'example' });

    expect(start.status).toBe(202);
    await waitForReady(app, token, start.body.session_id);

    for (let i = 0; i < 20; i += 1) {
      const res = await request(app)
        .post(`/api/tutor/sessions/${start.body.session_id}/continue`)
        .set('Authorization', `Bearer ${token}`)
        .send({ action: 'give_example', mode: 'example' });

      expect(res.status).toBe(200);
      expect(res.body.feedback).toMatch(/Shape s = new Circle|```java|Circle\.draw/i);
      expect(JSON.stringify(res.body)).not.toContain('rate_limited_ai');
    }
  });
});
