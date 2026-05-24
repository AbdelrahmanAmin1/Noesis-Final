'use strict';

const express = require('express');
const { requireAuth } = require('../middleware/auth');
const friends = require('../services/friend.service');

const router = express.Router();

router.post('/request', requireAuth, (req, res, next) => {
  try { res.status(201).json(friends.sendRequest(req.user.id, (req.body || {}).recipient_id)); } catch (e) { next(e); }
});

router.get('/requests', requireAuth, (req, res, next) => {
  try { res.json(friends.listRequests(req.user.id)); } catch (e) { next(e); }
});

router.post('/requests/:id/accept', requireAuth, (req, res, next) => {
  try { res.json(friends.acceptRequest(req.user.id, req.params.id)); } catch (e) { next(e); }
});

router.post('/requests/:id/reject', requireAuth, (req, res, next) => {
  try { res.json(friends.rejectRequest(req.user.id, req.params.id)); } catch (e) { next(e); }
});

router.get('/', requireAuth, (req, res, next) => {
  try { res.json({ friends: friends.listFriends(req.user.id) }); } catch (e) { next(e); }
});

router.delete('/:friendId', requireAuth, (req, res, next) => {
  try { res.json(friends.removeFriend(req.user.id, req.params.friendId)); } catch (e) { next(e); }
});

module.exports = router;
