'use strict';

const express = require('express');
const { requireAuth } = require('../middleware/auth');
const leaderboards = require('../services/leaderboard.service');

const router = express.Router();

router.get('/global', requireAuth, (req, res, next) => {
  try { res.json(leaderboards.global(req.user.id, req.query.limit)); } catch (e) { next(e); }
});

router.get('/weekly', requireAuth, (req, res, next) => {
  try { res.json(leaderboards.weekly(req.user.id, req.query.limit)); } catch (e) { next(e); }
});

router.get('/friends', requireAuth, (req, res, next) => {
  try { res.json(leaderboards.friends(req.user.id, req.query.limit)); } catch (e) { next(e); }
});

module.exports = router;
