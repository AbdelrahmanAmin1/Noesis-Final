'use strict';

const express = require('express');
const { requireAuth } = require('../middleware/auth');
const friends = require('../services/friend.service');

const router = express.Router();

router.get('/search', requireAuth, (req, res, next) => {
  try { res.json({ users: friends.searchUsers(req.user.id, req.query.q || '') }); } catch (e) { next(e); }
});

module.exports = router;
