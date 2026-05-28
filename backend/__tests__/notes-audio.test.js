'use strict';

const express = require('express');
const cookieParser = require('cookie-parser');
const request = require('supertest');
const { setupTestEnv, cleanupTestDb, createTestUser } = require('./helpers/setup');
const { migrate, getDb } = require('../config/db');
const { notFound, errorHandler } = require('../middleware/error');

function getNotesAudioApp() {
  setupTestEnv();
  cleanupTestDb();
  migrate();
  const app = express();
  app.use(cookieParser());
  app.use(express.json({ limit: '2mb' }));
  app.use('/api/auth', require('../routes/auth.routes'));
  app.use('/api/notes', require('../routes/note.routes'));
  app.use('/api/jobs', require('../routes/jobs.routes'));
  app.use(notFound);
  app.use(errorHandler);
  return { app, db: getDb() };
}

function insertNote(db, userId, title = 'Encapsulation') {
  const now = new Date().toISOString();
  return db.prepare(`INSERT INTO notes (user_id, folder, title, body_md, tags_json, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?)`)
    .run(userId, 'Generated', title, 'Encapsulation keeps private state behind public methods. Use validation to protect invariants.', '[]', now, now)
    .lastInsertRowid;
}

async function waitForJob(app, token, jobId) {
  for (let i = 0; i < 240; i += 1) {
    const res = await request(app).get(`/api/jobs/${jobId}`).set('Authorization', `Bearer ${token}`);
    if (res.body.status === 'completed' || res.body.status === 'failed') return res;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('job_timeout');
}

beforeEach(() => {
  setupTestEnv();
});

afterEach(() => {
  cleanupTestDb();
});

describe('notes audio quality helpers', () => {
  it('builds distinct brief and detailed educational fallback scripts', () => {
    const notesAudio = require('../services/notes-audio.service');
    const note = {
      id: 1,
      title: 'Encapsulation',
      body_md: 'Encapsulation keeps private state behind public methods. Use validation to protect invariants.',
      lesson_json: '',
      updated_at: new Date().toISOString(),
    };

    const brief = notesAudio._internals.fallbackScript(note, 'brief');
    const detailed = notesAudio._internals.fallbackScript(note, 'detailed');

    expect(brief).toMatch(/Brief explanation/);
    expect(detailed).toMatch(/Detailed walkthrough/);
    expect(detailed.length).toBeGreaterThan(brief.length);
    expect(notesAudio._internals.scriptLooksEducational(brief, note, 'brief')).toBe(true);
    expect(notesAudio._internals.scriptLooksEducational(detailed, note, 'detailed')).toBe(true);
  });

  it('rejects raw note reading as an audio script', () => {
    const notesAudio = require('../services/notes-audio.service');
    const note = {
      id: 1,
      title: 'Hash Table',
      body_md: 'Hash tables map a key to a bucket. Collisions must be handled by chaining or probing.',
      lesson_json: '',
      updated_at: new Date().toISOString(),
    };

    expect(notesAudio._internals.scriptLooksEducational(note.body_md, note, 'brief')).toBe(false);
  });
});

describe('notes audio routes', () => {
  it('returns missing metadata instead of 404 before audio is generated', async () => {
    const { app, db } = getNotesAudioApp();
    const created = await createTestUser(app, request);
    const noteId = insertNote(db, created.user.id);

    const res = await request(app)
      .get(`/api/notes/${noteId}/audio?meta=1&style=brief`)
      .set('Authorization', `Bearer ${created.token}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('missing');
    expect(res.body.note_id).toBe(noteId);
  });

  it('generates brief audio and serves the completed wav', async () => {
    const { app, db } = getNotesAudioApp();
    const created = await createTestUser(app, request);
    const noteId = insertNote(db, created.user.id);

    const start = await request(app)
      .post(`/api/notes/${noteId}/audio`)
      .set('Authorization', `Bearer ${created.token}`)
      .send({ style: 'brief', voice: 'default', speed: 'normal' });

    expect(start.status).toBe(202);
    const job = await waitForJob(app, created.token, start.body.job_id);
    expect(job.body.status).toBe('completed');
    expect(job.body.result.status).toBe('completed');

    const audio = await request(app)
      .get(`/api/notes/${noteId}/audio?style=brief`)
      .set('Authorization', `Bearer ${created.token}`);

    expect(audio.status).toBe(200);
    expect(audio.headers['content-type']).toMatch(/audio\/wav/);
  });
});
