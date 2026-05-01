'use strict';

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const env = require('./config/env');
const { migrate } = require('./config/db');
const { notFound, errorHandler } = require('./middleware/error');
const { globalLimiter } = require('./middleware/rateLimit');
const log = require('./utils/logger');

migrate();

// Optional: seed the system corpus on boot (idempotent).
try {
  const seed = require('./scripts/seed-tutor-corpus');
  seed.runIfNeeded().catch(err => log.warn('seed_skipped', err.message || err));
} catch (e) {
  log.warn('seed_module_unavailable', e.message || e);
}

const app = express();
app.disable('x-powered-by');
app.use(cors({
  origin: env.CORS_ORIGIN === '*' ? true : env.CORS_ORIGIN,
  credentials: true,
}));
app.use(cookieParser());
app.use(express.json({ limit: '2mb' }));
app.use(globalLimiter);

let _healthCache = { at: 0, ollama: false };
app.get('/', (req, res) => {
  res.json({
    ok: true,
    name: 'Noesis API',
    health: '/api/health',
    frontend: 'http://localhost:5173/Noesis.html',
  });
});

app.get('/api/health', async (req, res) => {
  const now = Date.now();
  if (now - _healthCache.at > 5000) {
    const ai = require('./services/ai.service');
    _healthCache = { at: now, ollama: await ai.ping() };
  }
  res.json({ ok: true, ollama: _healthCache.ollama, env: env.NODE_ENV });
});

app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/user', require('./routes/user.routes'));
app.use('/api/courses', require('./routes/courses.routes'));
app.use('/api/materials', require('./routes/material.routes'));
app.use('/api/notes', require('./routes/note.routes'));
app.use('/api/flashcards', require('./routes/flashcard.routes'));
app.use('/api/quizzes', require('./routes/quiz.routes'));
app.use('/api/tutor', require('./routes/tutor.routes'));
app.use('/api/dashboard', require('./routes/dashboard.routes'));
app.use('/api/videos', require('./routes/video.routes'));
app.use('/api/jobs', require('./routes/jobs.routes'));

app.use(notFound);
app.use(errorHandler);

app.listen(env.PORT, () => {
  log.info(`Noesis API listening on http://localhost:${env.PORT}`);
  log.info(`Ollama: ${env.OLLAMA_BASE_URL} (gen=${env.OLLAMA_GEN_MODEL}, embed=${env.OLLAMA_EMBED_MODEL})`);
});
