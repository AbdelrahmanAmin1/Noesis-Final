'use strict';

const express = require('express');
const { requireAuth } = require('../middleware/auth');
const gamification = require('../services/gamification.service');

const router = express.Router();

router.get('/summary', requireAuth, (req, res, next) => {
  try { res.json(gamification.getSummary(req.user.id)); } catch (e) { next(e); }
});

router.get('/events', requireAuth, (req, res, next) => {
  try { res.json({ events: gamification.listEvents(req.user.id, req.query.limit) }); } catch (e) { next(e); }
});

router.get('/achievements', requireAuth, (req, res, next) => {
  try { res.json({ achievements: gamification.listAchievements(req.user.id) }); } catch (e) { next(e); }
});

module.exports = router;
