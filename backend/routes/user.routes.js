'use strict';

const express = require('express');
const { requireAuth } = require('../middleware/auth');
const authSvc = require('../services/auth.service');

const router = express.Router();

router.get('/prefs', requireAuth, (req, res, next) => {
  try { res.json(authSvc.getPrefs(req.user.id)); } catch (e) { next(e); }
});

router.put('/prefs', requireAuth, (req, res, next) => {
  try { res.json(authSvc.updatePrefs(req.user.id, req.body || {})); } catch (e) { next(e); }
});

module.exports = router;
