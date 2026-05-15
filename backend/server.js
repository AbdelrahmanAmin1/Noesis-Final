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

let _healthCache = { at: 0, data: null };
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
    const tts = require('./services/tts.service');
    const aiHealth = await ai.healthCheck();
    const ttsStatus = typeof tts.detectTTS === 'function' ? tts.detectTTS() : { engine: env.TTS_ENGINE };
    _healthCache = { at: now, data: { ai: aiHealth, tts: ttsStatus } };
  }
  const hc = _healthCache.data || {};
  const aiOk = hc.ai && hc.ai.generation && hc.ai.generation.ok;
  res.json({ ok: aiOk, provider: env.AI_PROVIDER, ai: hc.ai, tts: hc.tts, env: env.NODE_ENV });
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
  log.info(`AI provider: ${env.AI_PROVIDER}`);
  if (env.AI_PROVIDER === 'groq') {
    log.info(`Groq model: ${env.GROQ_MODEL} | Embeddings: Ollama ${env.OLLAMA_EMBED_MODEL} (local)`);
  } else {
    log.info(`Ollama: ${env.OLLAMA_BASE_URL} (gen=${env.OLLAMA_GEN_MODEL}, embed=${env.OLLAMA_EMBED_MODEL})`);
  }
  const ai = require('./services/ai.service');
  ai.healthCheck().then((hc) => {
    const gen = hc.generation || {};
    if (gen.ok) {
      log.info(`AI ready — provider=${hc.provider}, model=${gen.model}`);
    } else {
      log.warn(`AI not ready — provider=${hc.provider}`, gen.details || gen);
    }
  }).catch(err => log.warn('AI health check skipped', err.message || err));
});
