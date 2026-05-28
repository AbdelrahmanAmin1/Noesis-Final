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
    const renderer = require('./services/renderer.service').status();
    const ocr = require('./services/ocr.service').status();
    const demo = {
      enabled: env.NOESIS_DEMO_MODE,
      renderer: env.VIDEO_RENDERER,
      storyboardReviewRequired: env.NOESIS_DEMO_MODE || env.STORYBOARD_REVIEW_REQUIRED,
      strictQualityGates: env.NOESIS_DEMO_MODE || env.STRICT_QUALITY_GATES || env.VIDEO_RENDER_STRICT,
      groqReady: !!env.GROQ_API_KEY && env.NOTES_PROVIDER === 'groq' && env.VIDEO_SCRIPT_PROVIDER === 'groq',
      piperReady: ttsStatus && ttsStatus.configured_engine === 'piper' && ttsStatus.active_engine === 'piper',
      rendererReady: renderer.ok,
      ocrReady: !env.OCR_ENABLED || !!ocr.available,
      tutorProvider: env.TUTOR_PROVIDER,
      tutorFallbackProvider: env.TUTOR_FALLBACK_PROVIDER,
      tutorGroqReady: env.TUTOR_PROVIDER !== 'groq' || !!env.GROQ_API_KEY,
      tutorStrictQuality: env.TUTOR_STRICT_QUALITY,
      tutorAsyncStart: env.TUTOR_ASYNC_START,
      tutorVoiceDefault: env.TUTOR_VOICE_DEFAULT,
      learningMapLayout: env.LEARNING_MAP_LAYOUT,
    };
    demo.ok = !demo.enabled || (demo.groqReady && demo.piperReady && demo.rendererReady && demo.storyboardReviewRequired && demo.tutorGroqReady);
    _healthCache = { at: now, data: { ai: aiHealth, tts: ttsStatus, renderer, ocr, demo } };
  }
  const hc = _healthCache.data || {};
  const aiOk = hc.ai && hc.ai.generation && hc.ai.generation.ok;
  res.json({ ok: aiOk && (!hc.demo || hc.demo.ok !== false), provider: env.AI_PROVIDER, ai: hc.ai, tts: hc.tts, renderer: hc.renderer, ocr: hc.ocr, demo: hc.demo, env: env.NODE_ENV });
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
app.use('/api/study', require('./routes/study.routes'));
app.use('/api/gamification', require('./routes/gamification.routes'));
app.use('/api/leaderboards', require('./routes/leaderboard.routes'));
app.use('/api/users', require('./routes/user-search.routes'));
app.use('/api/friends', require('./routes/friend.routes'));
app.use('/api/rooms', require('./routes/room.routes'));
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
