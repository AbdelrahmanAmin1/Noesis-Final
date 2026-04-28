'use strict';

const jwt = require('jsonwebtoken');
const env = require('../config/env');

const COOKIE_NAME = 'noesis_session';
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function readToken(req) {
  if (req.cookies && req.cookies[COOKIE_NAME]) return req.cookies[COOKIE_NAME];
  const h = req.headers.authorization || '';
  const parts = h.trim().split(/\s+/);
  return parts.length === 2 && /^Bearer$/i.test(parts[0]) ? parts[1] : null;
}

function requireAuth(req, res, next) {
  const token = readToken(req);
  if (!token) return res.status(401).json({ error: 'missing_token' });
  try {
    const payload = jwt.verify(token, env.JWT_SECRET);
    req.user = { id: payload.uid, email: payload.email };
    next();
  } catch (e) {
    return res.status(401).json({ error: 'invalid_token' });
  }
}

function signToken(user) {
  return jwt.sign({ uid: user.id, email: user.email }, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN });
}

function setSessionCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.NODE_ENV === 'production',
    path: '/',
    maxAge: SEVEN_DAYS_MS,
  });
}

function clearSessionCookie(res) {
  res.clearCookie(COOKIE_NAME, { path: '/' });
}

module.exports = { requireAuth, signToken, setSessionCookie, clearSessionCookie, COOKIE_NAME };
