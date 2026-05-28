'use strict';

const rateLimit = require('express-rate-limit');
const env = require('../config/env');

function limiter(options) {
  return rateLimit({
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => !env.RATE_LIMITS_ENABLED,
    ...options,
  });
}

const globalLimiter = limiter({
  windowMs: 15 * 60 * 1000,
  max: env.GLOBAL_RATE_LIMIT_PER_15_MIN,
  message: {
    error: 'rate_limited_global',
    message: 'Too many requests in a short time. Please wait a moment and try again.',
  },
});

const aiLimiter = limiter({
  windowMs: 60 * 1000,
  max: env.AI_RATE_LIMIT_PER_MIN,
  skipFailedRequests: env.NOESIS_DEMO_MODE,
  message: {
    error: 'rate_limited_ai',
    message: 'Too many AI requests in a short time. Please wait a moment and try again.',
  },
});

const tutorTurnLimiter = limiter({
  windowMs: 60 * 1000,
  max: env.TUTOR_TURN_RATE_LIMIT_PER_MIN,
  skipFailedRequests: env.NOESIS_DEMO_MODE,
  message: {
    error: 'rate_limited_tutor_turn',
    message: 'The tutor is catching up. Please wait a few seconds and try again.',
  },
});

const videoLimiter = limiter({
  windowMs: 60 * 1000,
  max: env.VIDEO_RATE_LIMIT_PER_MIN,
  skipFailedRequests: env.NOESIS_DEMO_MODE,
  message: {
    error: 'rate_limited_video',
    message: 'Video and storyboard generation is cooling down. Please wait a few seconds and try again.',
  },
});

const authLimiter = limiter({
  windowMs: 15 * 60 * 1000,
  max: env.AUTH_RATE_LIMIT_PER_15_MIN,
  message: {
    error: 'rate_limited_auth',
    message: 'Too many sign-in attempts. Please wait a moment and try again.',
  },
});

const uploadLimiter = limiter({
  windowMs: 60 * 1000,
  max: env.UPLOAD_RATE_LIMIT_PER_MIN,
  message: {
    error: 'rate_limited_upload',
    message: 'Too many uploads in a short time. Please wait a moment and try again.',
  },
});

const ttsLimiter = limiter({
  windowMs: 60 * 1000,
  max: env.TTS_RATE_LIMIT_PER_MIN,
  skipFailedRequests: env.NOESIS_DEMO_MODE,
  message: {
    error: 'rate_limited_tts',
    message: 'Audio generation is cooling down. Please wait a few seconds and try again.',
  },
});

module.exports = { globalLimiter, aiLimiter, tutorTurnLimiter, videoLimiter, authLimiter, uploadLimiter, ttsLimiter };
