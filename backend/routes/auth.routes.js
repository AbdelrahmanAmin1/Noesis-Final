'use strict';

const express = require('express');
const { authLimiter } = require('../middleware/rateLimit');
const { requireAuth, setSessionCookie, clearSessionCookie } = require('../middleware/auth');
const authSvc = require('../services/auth.service');

const router = express.Router();

router.post('/signup', authLimiter, async (req, res, next) => {
  try {
    const out = await authSvc.signup(req.body || {});
    setSessionCookie(res, out.token);
    res.json(out);
  } catch (e) { next(e); }
});

router.post('/signin', authLimiter, async (req, res, next) => {
  try {
    const out = await authSvc.signin(req.body || {});
    setSessionCookie(res, out.token);
    res.json(out);
  } catch (e) { next(e); }
});

router.post('/signout', (req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

router.post('/onboarding', requireAuth, (req, res, next) => {
  try { res.json(authSvc.saveOnboarding(req.user.id, req.body || {})); } catch (e) { next(e); }
});

router.get('/me', requireAuth, (req, res, next) => {
  try { res.json(authSvc.me(req.user.id)); } catch (e) { next(e); }
});

router.delete('/me', requireAuth, (req, res, next) => {
  try {
    authSvc.deleteAccount(req.user.id);
    clearSessionCookie(res);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.get('/export', requireAuth, (req, res, next) => {
  try {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="noesis-export.json"');
    res.json(authSvc.exportData(req.user.id));
  } catch (e) { next(e); }
});

module.exports = router;
