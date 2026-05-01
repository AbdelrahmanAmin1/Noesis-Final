'use strict';

require('dotenv').config();
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

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

  OLLAMA_BASE_URL: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
  OLLAMA_GEN_MODEL: process.env.OLLAMA_GEN_MODEL || 'llama3.2:3b',
  OLLAMA_EMBED_MODEL: process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text',
  OLLAMA_TIMEOUT_MS: parseInt(process.env.OLLAMA_TIMEOUT_MS || '180000', 10),

  TTS_ENGINE: process.env.TTS_ENGINE || 'piper',
  TTS_BIN: process.env.TTS_BIN || 'piper',
  TTS_VOICE_PATH: process.env.TTS_VOICE_PATH || '',
  FFMPEG_PATH: process.env.FFMPEG_PATH || 'ffmpeg',
  FFPROBE_PATH: process.env.FFPROBE_PATH || 'ffprobe',
};

if (env.NODE_ENV === 'production' && (!process.env.JWT_SECRET || env.JWT_SECRET === 'noesis-dev-secret-change-me' || env.JWT_SECRET.length < 32)) {
  throw new Error('JWT_SECRET must be set to a strong secret in production');
}

module.exports = env;
