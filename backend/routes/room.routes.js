'use strict';

const express = require('express');
const { requireAuth } = require('../middleware/auth');
const rooms = require('../services/room.service');
const leaderboards = require('../services/leaderboard.service');

const router = express.Router();

router.post('/', requireAuth, (req, res, next) => {
  try { res.status(201).json(rooms.createRoom(req.user.id, req.body || {})); } catch (e) { next(e); }
});

router.get('/', requireAuth, (req, res, next) => {
  try { res.json({ rooms: rooms.listRooms(req.user.id) }); } catch (e) { next(e); }
});

router.post('/join-by-code', requireAuth, (req, res, next) => {
  try { res.json(rooms.joinByCode(req.user.id, (req.body || {}).code)); } catch (e) { next(e); }
});

router.get('/:roomId', requireAuth, (req, res, next) => {
  try { res.json(rooms.getRoom(req.user.id, parseInt(req.params.roomId, 10))); } catch (e) { next(e); }
});

router.post('/:roomId/join', requireAuth, (req, res, next) => {
  try { res.json(rooms.joinRoom(req.user.id, parseInt(req.params.roomId, 10))); } catch (e) { next(e); }
});

router.post('/:roomId/leave', requireAuth, (req, res, next) => {
  try { res.json(rooms.leaveRoom(req.user.id, parseInt(req.params.roomId, 10))); } catch (e) { next(e); }
});

router.get('/:roomId/members', requireAuth, (req, res, next) => {
  try { res.json(rooms.listMembers(req.user.id, parseInt(req.params.roomId, 10))); } catch (e) { next(e); }
});

router.get('/:roomId/activity', requireAuth, (req, res, next) => {
  try { res.json(rooms.listActivity(req.user.id, parseInt(req.params.roomId, 10), req.query.limit)); } catch (e) { next(e); }
});

router.get('/:roomId/messages', requireAuth, (req, res, next) => {
  try { res.json(rooms.listMessages(req.user.id, parseInt(req.params.roomId, 10), req.query.limit)); } catch (e) { next(e); }
});

router.post('/:roomId/messages', requireAuth, (req, res, next) => {
  try { res.status(201).json(rooms.postMessage(req.user.id, parseInt(req.params.roomId, 10), req.body || {})); } catch (e) { next(e); }
});

router.post('/:roomId/share-note', requireAuth, (req, res, next) => {
  try { res.status(201).json(rooms.shareNote(req.user.id, parseInt(req.params.roomId, 10), (req.body || {}).note_id)); } catch (e) { next(e); }
});

router.post('/:roomId/share-quiz', requireAuth, (req, res, next) => {
  try { res.status(201).json(rooms.shareQuiz(req.user.id, parseInt(req.params.roomId, 10), (req.body || {}).quiz_id)); } catch (e) { next(e); }
});

router.post('/:roomId/shared-quizzes/:shareId/start', requireAuth, (req, res, next) => {
  try { res.status(201).json(rooms.startSharedQuiz(req.user.id, parseInt(req.params.roomId, 10), req.params.shareId)); } catch (e) { next(e); }
});

router.get('/:roomId/leaderboard', requireAuth, (req, res, next) => {
  try { res.json(leaderboards.room(req.user.id, parseInt(req.params.roomId, 10), req.query.limit)); } catch (e) { next(e); }
});

module.exports = router;
