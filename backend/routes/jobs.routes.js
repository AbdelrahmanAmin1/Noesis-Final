'use strict';

const express = require('express');
const { requireAuth } = require('../middleware/auth');
const jobs = require('../services/jobs.service');
const { HttpError } = require('../middleware/error');

const router = express.Router();

router.get('/', requireAuth, (req, res, next) => {
  try {
    const list = jobs.listFor(req.user.id).map(j => ({
      id: j.id, kind: j.kind, status: j.status, progress: j.progress, error: j.error, createdAt: j.createdAt,
    }));
    res.json({ jobs: list });
  } catch (e) { next(e); }
});

router.get('/:id', requireAuth, (req, res, next) => {
  try {
    const j = jobs.get(req.params.id);
    if (!j) throw new HttpError(404, 'job_not_found');
    if (j.meta && j.meta.userId && j.meta.userId !== req.user.id) throw new HttpError(403, 'forbidden');
    res.json({ id: j.id, kind: j.kind, status: j.status, progress: j.progress, error: j.error, result: j.result });
  } catch (e) { next(e); }
});

module.exports = router;
