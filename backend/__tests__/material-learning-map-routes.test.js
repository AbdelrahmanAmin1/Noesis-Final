'use strict';

const express = require('express');
const cookieParser = require('cookie-parser');
const request = require('supertest');
const { setupTestEnv, cleanupTestDb } = require('./helpers/setup');

setupTestEnv();

const { migrate, getDb } = require('../config/db');
const { notFound, errorHandler } = require('../middleware/error');
const ai = require('../services/ai.service');
const jobs = require('../services/jobs.service');

function appForTest() {
  const app = express();
  app.use(cookieParser());
  app.use(express.json());
  app.use('/api/auth', require('../routes/auth.routes'));
  app.use('/api/study', require('../routes/study.routes'));
  app.use('/api/jobs', require('../routes/jobs.routes'));
  app.use(notFound);
  app.use(errorHandler);
  return app;
}

async function waitForJob(jobId) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const job = jobs.get(jobId);
    if (job && ['completed', 'failed'].includes(job.status)) return job;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error('job_timeout');
}

describe('material learning-map routes', () => {
  let app;
  let db;
  let token;
  let userId;
  let materialId;

  beforeAll(() => {
    cleanupTestDb();
    migrate();
    db = getDb();
    app = appForTest();
  });

  beforeEach(async () => {
    vi.restoreAllMocks();
    db.exec('DELETE FROM learning_maps; DELETE FROM chunks; DELETE FROM materials; DELETE FROM user_prefs; DELETE FROM users;');
    const signup = await request(app).post('/api/auth/signup').send({
      email: `map-route-${Date.now()}-${Math.random()}@test.com`, password: 'TestPass123!', name: 'Map Route User',
    });
    token = signup.body.token;
    userId = signup.body.user.id;
    materialId = db.prepare(`INSERT INTO materials
      (user_id, course_id, title, type, file_path, mime, size_bytes, status, progress, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)`)
      .run(userId, null, 'Stacks', 'pdf', '/tmp/stacks.pdf', 'application/pdf', 1000, 'ready', 100, new Date().toISOString())
      .lastInsertRowid;
    db.prepare(`INSERT INTO chunks
      (material_id, chapter_id, idx, text, token_count, chapter_title, heading, has_code, keywords_json)
      VALUES (?,?,?,?,?,?,?,?,?)`)
      .run(materialId, null, 0, 'A stack follows LIFO order. Push adds an item and pop removes the top item.', 25, 'Stacks', 'Push and Pop', 0, '["stack","LIFO","push","pop"]');
    vi.spyOn(ai, 'generateWithFallback').mockResolvedValue({ provider: 'groq', text: 'invalid' });
  });

  afterAll(() => cleanupTestDb());

  it('returns a fallback immediately and refines through a pollable job', async () => {
    const first = await request(app)
      .get(`/api/study/learning-map?material_id=${materialId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(first.status).toBe(200);
    expect(first.body.learning_map.rootTopic).toBe('Stacks');
    expect(first.body.learning_map.generation.mode).toBe('source_fallback');
    expect(first.body.generation_status).toBe('refining');
    expect(first.body.generation_job_id).toBeTruthy();

    const completed = await waitForJob(first.body.generation_job_id);
    expect(completed.status).toBe('completed');
    expect(completed.result.material_id).toBe(materialId);

    const second = await request(app)
      .get(`/api/study/learning-map?material_id=${materialId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(second.status).toBe(200);
    expect(second.body.generation_job_id).toBeNull();
  });

  it('starts manual regeneration and enforces material ownership', async () => {
    const response = await request(app)
      .post('/api/study/learning-map/regenerate')
      .set('Authorization', `Bearer ${token}`)
      .send({ material_id: materialId });
    expect(response.status).toBe(202);
    expect(response.body.job_id).toBeTruthy();
    expect((await waitForJob(response.body.job_id)).status).toBe('completed');

    const missing = await request(app)
      .post('/api/study/learning-map/regenerate')
      .set('Authorization', `Bearer ${token}`)
      .send({ material_id: 999999 });
    expect(missing.status).toBe(404);
  });
});
