'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const { requireAuth } = require('../middleware/auth');
const { videoLimiter } = require('../middleware/rateLimit');
const { HttpError } = require('../middleware/error');
const videoSvc = require('../services/video.service');
const { getDb } = require('../config/db');
const env = require('../config/env');

const router = express.Router();

router.post('/', requireAuth, videoLimiter, async (req, res, next) => {
  try {
    const { material_id, concept } = req.body || {};
    if (!material_id || !concept) throw new HttpError(400, 'missing_fields');
    const db = getDb();
    const m = db.prepare('SELECT id FROM materials WHERE id=? AND user_id=?').get(material_id, req.user.id);
    if (!m) throw new HttpError(404, 'material_not_found');
    const { videoId, jobId } = await videoSvc.generateVideo({ userId: req.user.id, materialId: material_id, concept });
    res.status(202).json({ video_id: videoId, job_id: jobId, status: 'queued' });
  } catch (e) { next(e); }
});

router.get('/:id', requireAuth, (req, res, next) => {
  try {
    const v = videoSvc.getVideo(req.user.id, parseInt(req.params.id, 10));
    if (!v) throw new HttpError(404, 'video_not_found');
    res.json(v);
  } catch (e) { next(e); }
});

router.get('/:id/file', requireAuth, (req, res, next) => {
  try {
    const v = videoSvc.getVideo(req.user.id, parseInt(req.params.id, 10));
    if (!v || !v.output_path || !fs.existsSync(v.output_path)) throw new HttpError(404, 'file_not_found');
    const videosDir = path.resolve(env.UPLOAD_DIR, 'videos');
    const resolved = path.resolve(v.output_path);
    if (!resolved.startsWith(videosDir + path.sep)) throw new HttpError(403, 'forbidden_path');
    res.setHeader('Content-Type', 'video/mp4');
    fs.createReadStream(resolved).pipe(res);
  } catch (e) { next(e); }
});

module.exports = router;
