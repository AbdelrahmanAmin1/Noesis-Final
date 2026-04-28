'use strict';

const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { upload } = require('../middleware/upload');
const { uploadLimiter } = require('../middleware/rateLimit');
const matSvc = require('../services/material.service');
const jobs = require('../services/jobs.service');

const router = express.Router();

router.get('/', requireAuth, (req, res, next) => {
  try { res.json({ materials: matSvc.listForUser(req.user.id) }); } catch (e) { next(e); }
});

router.post('/', requireAuth, uploadLimiter, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'missing_file' });
    const courseId = req.body && req.body.course_id ? parseInt(req.body.course_id, 10) : null;
    const m = matSvc.createPending(req.user.id, req.file, courseId);
    const job = jobs.create('material_ingest', { userId: req.user.id, materialId: m.id });
    setImmediate(() => matSvc.processMaterial(m.id, job.id));
    res.status(202).json({ material_id: m.id, title: m.title, job_id: job.id });
  } catch (e) { next(e); }
});

router.get('/:id', requireAuth, (req, res, next) => {
  try { res.json(matSvc.getOwned(req.user.id, parseInt(req.params.id, 10))); } catch (e) { next(e); }
});

router.get('/:id/chunks', requireAuth, (req, res, next) => {
  try {
    const chapterId = req.query.chapter ? parseInt(req.query.chapter, 10) : null;
    res.json({ chunks: matSvc.getChunks(req.user.id, parseInt(req.params.id, 10), chapterId) });
  } catch (e) { next(e); }
});

router.delete('/:id', requireAuth, (req, res, next) => {
  try { res.json(matSvc.deleteMaterial(req.user.id, parseInt(req.params.id, 10))); } catch (e) { next(e); }
});

module.exports = router;
