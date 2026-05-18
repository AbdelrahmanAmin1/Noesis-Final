'use strict';

require('dotenv').config();
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function boolEnv(name, fallback) {
  const raw = process.env[name];
  if (raw == null || raw === '') return fallback;
  return /^(1|true|yes|on)$/i.test(raw);
}

function numberEnv(name, fallback, min = null, max = null) {
  const raw = process.env[name];
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min == null ? n : min, Math.min(max == null ? n : max, n));
}

const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '3001', 10),
  JWT_SECRET: process.env.JWT_SECRET || 'noesis-dev-secret-change-me',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',

  CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:5173',

  ROOT_DIR: ROOT,
  DATA_DIR: path.resolve(ROOT, process.env.DATA_DIR || 'data'),
  UPLOAD_DIR: path.resolve(ROOT, process.env.UPLOAD_DIR || 'uploads'),
  DB_PATH: path.resolve(ROOT, process.env.DB_PATH || 'data/noesis.sqlite'),
  MAX_UPLOAD_MB: parseInt(process.env.MAX_UPLOAD_MB || '25', 10),

  AI_PROVIDER: process.env.AI_PROVIDER || 'ollama',
  NOTES_PROVIDER: (process.env.NOTES_PROVIDER || process.env.AI_PROVIDER || 'ollama').toLowerCase(),
  VIDEO_SCRIPT_PROVIDER: (process.env.VIDEO_SCRIPT_PROVIDER || 'ollama').toLowerCase(),
  VIDEO_SCRIPT_GROQ_FALLBACK_ON_WEAK: boolEnv('VIDEO_SCRIPT_GROQ_FALLBACK_ON_WEAK', false),
  VIDEO_SCRIPT_MIN_QUALITY_SCORE: numberEnv('VIDEO_SCRIPT_MIN_QUALITY_SCORE', 0.75, 0, 1),
  VIDEO_SCRIPT_USE_LOCAL_IF_GROQ_FAILS: boolEnv('VIDEO_SCRIPT_USE_LOCAL_IF_GROQ_FAILS', true),

  OLLAMA_BASE_URL: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
  OLLAMA_GEN_MODEL: process.env.OLLAMA_GEN_MODEL || 'llama3.2:3b',
  OLLAMA_EMBED_MODEL: process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text',
  OLLAMA_TIMEOUT_MS: parseInt(process.env.OLLAMA_TIMEOUT_MS || '180000', 10),

  GROQ_BASE_URL: process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1',
  GROQ_API_KEY: process.env.GROQ_API_KEY || '',
  GROQ_MODEL: process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
  GROQ_VIDEO_MAX_OUTPUT_TOKENS: parseInt(process.env.GROQ_VIDEO_MAX_OUTPUT_TOKENS || '4000', 10),
  GROQ_VIDEO_TOP_K_CHUNKS: parseInt(process.env.GROQ_VIDEO_TOP_K_CHUNKS || '6', 10),
  GROQ_VIDEO_MAX_CHUNK_CHARS: parseInt(process.env.GROQ_VIDEO_MAX_CHUNK_CHARS || '1200', 10),
  GROQ_VIDEO_MAX_INPUT_CHARS: parseInt(process.env.GROQ_VIDEO_MAX_INPUT_CHARS || '16000', 10),
  GROQ_NOTES_MAX_OUTPUT_TOKENS: parseInt(process.env.GROQ_NOTES_MAX_OUTPUT_TOKENS || '2000', 10),

  TTS_ENGINE: process.env.TTS_ENGINE || 'piper',
  TTS_BIN: process.env.TTS_BIN || 'piper',
  TTS_VOICE_PATH: process.env.TTS_VOICE_PATH || '',
  TTS_PAUSE_MS_SENTENCE: parseInt(process.env.TTS_PAUSE_MS_SENTENCE || '250', 10),
  TTS_PAUSE_MS_SECTION: parseInt(process.env.TTS_PAUSE_MS_SECTION || '600', 10),
  VIDEO_SLIDE_MAX_BULLETS: parseInt(process.env.VIDEO_SLIDE_MAX_BULLETS || '5', 10),
  VIDEO_AUDIO_NORMALIZE: boolEnv('VIDEO_AUDIO_NORMALIZE', true),
  FFMPEG_PATH: process.env.FFMPEG_PATH || 'ffmpeg',
  FFPROBE_PATH: process.env.FFPROBE_PATH || 'ffprobe',
};

const usesDefaultJwtSecret = !process.env.JWT_SECRET || env.JWT_SECRET === 'noesis-dev-secret-change-me';
if (usesDefaultJwtSecret && env.NODE_ENV !== 'development') {
  console.warn('[noesis] JWT_SECRET is using the development default outside development. Set a strong JWT_SECRET before deploying.');
}

if (env.NODE_ENV === 'production' && (!process.env.JWT_SECRET || env.JWT_SECRET === 'noesis-dev-secret-change-me' || env.JWT_SECRET.length < 32)) {
  throw new Error('JWT_SECRET must be set to a strong secret in production');
}

module.exports = env;
