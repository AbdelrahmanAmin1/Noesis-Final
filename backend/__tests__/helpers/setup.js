'use strict';

const path = require('path');
const fs = require('fs');

const workerId = process.env.VITEST_POOL_ID || process.env.VITEST_WORKER_ID || process.pid || 'main';
const TEST_DB_PATH = path.join(__dirname, '..', '..', 'data', `test-${workerId}.sqlite`);

function setupTestEnv() {
  process.env.NODE_ENV = 'test';
  process.env.PORT = '0';
  process.env.JWT_SECRET = 'test-secret-key-for-vitest';
  process.env.DB_PATH = TEST_DB_PATH;
  process.env.OLLAMA_BASE_URL = 'http://localhost:11434';
  process.env.TTS_ENGINE = 'silence';
  process.env.NOESIS_ALLOW_SILENT_TTS = 'true';
  try {
    const env = require('../../config/env');
    env.NODE_ENV = process.env.NODE_ENV;
    env.PORT = 0;
    env.JWT_SECRET = process.env.JWT_SECRET;
    env.DB_PATH = TEST_DB_PATH;
    env.TTS_ENGINE = process.env.TTS_ENGINE;
  } catch (_) {}
}

function cleanupTestDb() {
  try {
    const { closeDbForTests } = require('../../config/db');
    if (typeof closeDbForTests === 'function') closeDbForTests();
  } catch (_) {}
  try { fs.unlinkSync(TEST_DB_PATH); } catch (_) {}
  try { fs.unlinkSync(TEST_DB_PATH + '-wal'); } catch (_) {}
  try { fs.unlinkSync(TEST_DB_PATH + '-shm'); } catch (_) {}
}

function getTestApp() {
  setupTestEnv();
  cleanupTestDb();
  const { migrate, getDb } = require('../../config/db');
  migrate();
  const express = require('express');
  const cookieParser = require('cookie-parser');
  const { notFound, errorHandler } = require('../../middleware/error');
  const app = express();
  app.use(cookieParser());
  app.use(express.json({ limit: '2mb' }));
  app.use('/api/auth', require('../../routes/auth.routes'));
  app.use(notFound);
  app.use(errorHandler);
  return { app, db: getDb() };
}

async function createTestUser(app, request) {
  const res = await request(app)
    .post('/api/auth/signup')
    .send({ email: `test${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`, password: 'TestPass123!', name: 'Test User' });
  return { user: res.body.user, token: res.body.token };
}

module.exports = { setupTestEnv, cleanupTestDb, getTestApp, createTestUser, TEST_DB_PATH };
