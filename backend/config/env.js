'use strict';

const path = require('path');

const ROOT = path.resolve(__dirname, '..');
require('dotenv').config({ path: path.join(ROOT, '.env') });
require('dotenv').config();

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

const DEMO_MODE = boolEnv('NOESIS_DEMO_MODE', true);

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

  RATE_LIMITS_ENABLED: boolEnv('RATE_LIMITS_ENABLED', true),
  GLOBAL_RATE_LIMIT_PER_15_MIN: numberEnv('GLOBAL_RATE_LIMIT_PER_15_MIN', DEMO_MODE ? 1000 : 300, 1, 100000),
  AI_RATE_LIMIT_PER_MIN: numberEnv('AI_RATE_LIMIT_PER_MIN', DEMO_MODE ? 120 : 10, 1, 10000),
  VIDEO_RATE_LIMIT_PER_MIN: numberEnv('VIDEO_RATE_LIMIT_PER_MIN', DEMO_MODE ? 60 : 3, 1, 10000),
  AUTH_RATE_LIMIT_PER_15_MIN: numberEnv('AUTH_RATE_LIMIT_PER_15_MIN', 30, 1, 10000),
  UPLOAD_RATE_LIMIT_PER_MIN: numberEnv('UPLOAD_RATE_LIMIT_PER_MIN', DEMO_MODE ? 30 : 5, 1, 10000),
  TTS_RATE_LIMIT_PER_MIN: numberEnv('TTS_RATE_LIMIT_PER_MIN', DEMO_MODE ? 60 : 20, 1, 10000),
  TUTOR_TURN_RATE_LIMIT_PER_MIN: numberEnv('TUTOR_TURN_RATE_LIMIT_PER_MIN', DEMO_MODE ? 120 : 90, 20, 10000),

  OCR_ENABLED: boolEnv('OCR_ENABLED', false),
  OCR_PROVIDER: (process.env.OCR_PROVIDER || 'ocrmypdf').toLowerCase(),
  OCR_MIN_TEXT_CHARS_PER_PAGE: numberEnv('OCR_MIN_TEXT_CHARS_PER_PAGE', 250, 0, 5000),
  OCR_TIMEOUT_MS: numberEnv('OCR_TIMEOUT_MS', 180000, 1000, 1800000),
  OCR_MAX_PAGES: numberEnv('OCR_MAX_PAGES', 40, 1, 1000),
  OCR_TESSERACT_LANG: process.env.OCR_TESSERACT_LANG || 'eng',
  SOURCE_VISUALS_MAX_PER_MATERIAL: numberEnv('SOURCE_VISUALS_MAX_PER_MATERIAL', 8, 0, 50),

  AI_PROVIDER: process.env.AI_PROVIDER || 'ollama',
  EMBEDDING_PROVIDER: (process.env.EMBEDDING_PROVIDER || 'ollama').toLowerCase(),
  NOTES_PROVIDER: (process.env.NOTES_PROVIDER || process.env.AI_PROVIDER || 'ollama').toLowerCase(),
  SUMMARY_PROVIDER: (process.env.SUMMARY_PROVIDER || process.env.NOTES_PROVIDER || process.env.AI_PROVIDER || 'ollama').toLowerCase(),
  VIDEO_SCRIPT_PROVIDER: (process.env.VIDEO_SCRIPT_PROVIDER || 'ollama').toLowerCase(),
  VIDEO_SCRIPT_GROQ_FALLBACK_ON_WEAK: boolEnv('VIDEO_SCRIPT_GROQ_FALLBACK_ON_WEAK', false),
  VIDEO_SCRIPT_MIN_QUALITY_SCORE: numberEnv('VIDEO_SCRIPT_MIN_QUALITY_SCORE', 0.75, 0, 1),
  VIDEO_SCRIPT_USE_LOCAL_IF_GROQ_FAILS: boolEnv('VIDEO_SCRIPT_USE_LOCAL_IF_GROQ_FAILS', true),
  TUTOR_PROVIDER: (process.env.TUTOR_PROVIDER || 'groq').toLowerCase(),
  TUTOR_FALLBACK_PROVIDER: (process.env.TUTOR_FALLBACK_PROVIDER || 'ollama').toLowerCase(),
  QUIZ_PROVIDER: (process.env.QUIZ_PROVIDER || 'groq').toLowerCase(),
  QUIZ_FALLBACK_PROVIDER: (process.env.QUIZ_FALLBACK_PROVIDER || 'ollama').toLowerCase(),
  QUIZ_GENERATION_TIMEOUT_MS: numberEnv('QUIZ_GENERATION_TIMEOUT_MS', 90000, 10000, 180000),
  FLASHCARD_PROVIDER: (process.env.FLASHCARD_PROVIDER || 'groq').toLowerCase(),
  FLASHCARD_FALLBACK_PROVIDER: (process.env.FLASHCARD_FALLBACK_PROVIDER || 'ollama').toLowerCase(),
  FLASHCARD_MIN_CARDS: numberEnv('FLASHCARD_MIN_CARDS', 6, 1, 10),
  FLASHCARD_MAX_CARDS: numberEnv('FLASHCARD_MAX_CARDS', 8, 1, 10),
  FLASHCARD_DEFAULT_CARDS: numberEnv('FLASHCARD_DEFAULT_CARDS', 8, 1, 10),
  FLASHCARD_TOP_K_CHUNKS: numberEnv('FLASHCARD_TOP_K_CHUNKS', 3, 1, 10),
  FLASHCARD_MAX_CONTEXT_CHARS: numberEnv('FLASHCARD_MAX_CONTEXT_CHARS', 4000, 1000, 8000),
  FLASHCARD_TIMEOUT_MS: numberEnv('FLASHCARD_TIMEOUT_MS', 60000, 1000, 180000),
  NOTES_AUDIO_PROVIDER: (process.env.NOTES_AUDIO_PROVIDER || process.env.NOTES_PROVIDER || process.env.AI_PROVIDER || 'ollama').toLowerCase(),
  TUTOR_STRICT_QUALITY: boolEnv('TUTOR_STRICT_QUALITY', boolEnv('NOESIS_DEMO_MODE', true)),
  TUTOR_ASYNC_START: boolEnv('TUTOR_ASYNC_START', true),
  TUTOR_VOICE_DEFAULT: boolEnv('TUTOR_VOICE_DEFAULT', true),
  TUTOR_CACHE_TTL_MS: parseInt(process.env.TUTOR_CACHE_TTL_MS || '900000', 10),
  KNOWLEDGE_CONTEXT_ENABLED: boolEnv('KNOWLEDGE_CONTEXT_ENABLED', true),
  KNOWLEDGE_CONTEXT_MAX_CHARS: numberEnv('KNOWLEDGE_CONTEXT_MAX_CHARS', 6000, 1000, 20000),
  KNOWLEDGE_USE_FOR_TUTOR: boolEnv('KNOWLEDGE_USE_FOR_TUTOR', true),
  KNOWLEDGE_USE_FOR_NOTES: boolEnv('KNOWLEDGE_USE_FOR_NOTES', true),
  KNOWLEDGE_USE_FOR_VIDEO: boolEnv('KNOWLEDGE_USE_FOR_VIDEO', true),
  SOURCE_GROUNDING_JUDGE_ENABLED: boolEnv('SOURCE_GROUNDING_JUDGE_ENABLED', true),
  SOURCE_GROUNDING_JUDGE_MODE: (process.env.SOURCE_GROUNDING_JUDGE_MODE || 'deterministic').toLowerCase(),
  SOURCE_GROUNDING_JUDGE_RETRY_LIMIT: numberEnv('SOURCE_GROUNDING_JUDGE_RETRY_LIMIT', 1, 0, 3),
  SOURCE_GROUNDING_JUDGE_BLOCK_ON_TOPIC_DRIFT: boolEnv('SOURCE_GROUNDING_JUDGE_BLOCK_ON_TOPIC_DRIFT', true),
  SOURCE_REPAIR_SAVE_SAFE_FALLBACK: boolEnv('SOURCE_REPAIR_SAVE_SAFE_FALLBACK', true),

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
  NOESIS_DEMO_MODE: DEMO_MODE,
  VIDEO_RENDERER: (process.env.VIDEO_RENDERER || 'canvas').toLowerCase(),
  VIDEO_RENDERER_EXPLICIT: !!process.env.VIDEO_RENDERER,
  REMOTION_BROWSER_EXECUTABLE: process.env.REMOTION_BROWSER_EXECUTABLE || '',
  STORYBOARD_REVIEW_REQUIRED: boolEnv('STORYBOARD_REVIEW_REQUIRED', false),
  STRICT_QUALITY_GATES: boolEnv('STRICT_QUALITY_GATES', false),
  VIDEO_RENDER_STRICT: boolEnv('VIDEO_RENDER_STRICT', boolEnv('STRICT_QUALITY_GATES', false)),
  LEARNING_MAP_LAYOUT: (process.env.LEARNING_MAP_LAYOUT || process.env.LEARNING_MAP_ORIENTATION || 'hybrid').toLowerCase(),
  LEARNING_MAP_ORIENTATION: (process.env.LEARNING_MAP_ORIENTATION || process.env.LEARNING_MAP_LAYOUT || 'hybrid').toLowerCase(),

  TTS_ENGINE: process.env.TTS_ENGINE || 'piper',
  TTS_BIN: process.env.TTS_BIN || 'piper',
  TTS_VOICE_PATH: process.env.TTS_VOICE_PATH || './tts-models/en_US-lessac-medium.onnx',
  TTS_SAPI_VOICE: process.env.TTS_SAPI_VOICE || '',
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
