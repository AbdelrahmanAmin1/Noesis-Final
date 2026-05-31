'use strict';

const fs = require('fs');
const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const request = require('supertest');
const { setupTestEnv, cleanupTestDb, createTestUser } = require('./helpers/setup');

let app;
let db;
let owner;
let stranger;
let captionsPath;
let outsidePath;

beforeAll(async () => {
  setupTestEnv();
  cleanupTestDb();
  const { migrate, getDb } = require('../config/db');
  const { notFound, errorHandler } = require('../middleware/error');
  const env = require('../config/env');
  migrate();
  db = getDb();
  app = express();
  app.use(cookieParser());
  app.use(express.json({ limit: '2mb' }));
  app.use('/api/auth', require('../routes/auth.routes'));
  app.use('/api/videos', require('../routes/video.routes'));
  app.use(notFound);
  app.use(errorHandler);
  owner = await createTestUser(app, request);
  stranger = await createTestUser(app, request);
  const captionsDir = path.join(env.UPLOAD_DIR, 'videos', 'caption-route-tests');
  fs.mkdirSync(captionsDir, { recursive: true });
  captionsPath = path.join(captionsDir, 'captions.en.vtt');
  outsidePath = path.join(env.UPLOAD_DIR, 'caption-route-outside.vtt');
  fs.writeFileSync(captionsPath, 'WEBVTT\n\n1\n00:00:00.000 --> 00:00:01.000\nHello\n', 'utf8');
  fs.writeFileSync(outsidePath, 'WEBVTT\n', 'utf8');
});

afterAll(() => {
  try { fs.rmSync(path.dirname(captionsPath), { recursive: true, force: true }); } catch (_) {}
  try { fs.unlinkSync(outsidePath); } catch (_) {}
  cleanupTestDb();
});

function insertVideo(userId, subtitlePath) {
  return db.prepare('INSERT INTO videos (user_id, status, subtitle_path, created_at) VALUES (?,?,?,?)')
    .run(userId, 'ready', subtitlePath, new Date().toISOString()).lastInsertRowid;
}

describe('GET /api/videos/:id/captions.vtt', () => {
  it('serves English captions to the video owner', async () => {
    const videoId = insertVideo(owner.user.id, captionsPath);
    const res = await request(app)
      .get(`/api/videos/${videoId}/captions.vtt`)
      .set('Authorization', `Bearer ${owner.token}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^text\/vtt/);
    expect(res.text).toContain('Hello');
  });

  it('returns not found when captions are missing', async () => {
    const videoId = insertVideo(owner.user.id, null);
    const res = await request(app)
      .get(`/api/videos/${videoId}/captions.vtt`)
      .set('Authorization', `Bearer ${owner.token}`);

    expect(res.status).toBe(404);
  });

  it('does not expose another users captions', async () => {
    const videoId = insertVideo(owner.user.id, captionsPath);
    const res = await request(app)
      .get(`/api/videos/${videoId}/captions.vtt`)
      .set('Authorization', `Bearer ${stranger.token}`);

    expect(res.status).toBe(404);
  });

  it('rejects caption paths outside the videos directory', async () => {
    const videoId = insertVideo(owner.user.id, outsidePath);
    const res = await request(app)
      .get(`/api/videos/${videoId}/captions.vtt`)
      .set('Authorization', `Bearer ${owner.token}`);

    expect(res.status).toBe(403);
  });
});
