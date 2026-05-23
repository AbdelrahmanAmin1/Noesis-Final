'use strict';

const rateLimit = require('express-rate-limit');

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
});

const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'rate_limited_ai',
    message: 'Too many AI requests in a short time. Please wait a moment and try again.',
  },
});

const tutorTurnLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Math.max(20, parseInt(process.env.TUTOR_TURN_RATE_LIMIT_PER_MIN || '90', 10) || 90),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'rate_limited_tutor_turn',
    message: 'The tutor is catching up. Please wait a few seconds and try again.',
  },
});

const videoLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'rate_limited_video' },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'rate_limited_auth' },
});

const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'rate_limited_upload' },
});

const ttsLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'rate_limited_tts' },
});

module.exports = { globalLimiter, aiLimiter, tutorTurnLimiter, videoLimiter, authLimiter, uploadLimiter, ttsLimiter };
