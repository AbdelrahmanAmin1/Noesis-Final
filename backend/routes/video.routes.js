'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const { requireAuth } = require('../middleware/auth');
const { videoLimiter } = require('../middleware/rateLimit');
const { HttpError } = require('../middleware/error');
const videoSvc = require('../services/video.service');
const storyboardSvc = require('../services/storyboard.service');
const { getDb } = require('../config/db');
const env = require('../config/env');

const router = express.Router();

function generationScope(body = {}) {
  const sourceScope = String(body.sourceScope || body.source_scope || 'material').toLowerCase();
  if (!['material', 'chapter', 'chunk'].includes(sourceScope)) throw new HttpError(400, 'invalid_source_scope');
  return {
    sourceScope,
    chapterId: body.chapter_id ? parseInt(body.chapter_id, 10) : null,
    chunkId: body.chunk_id ? parseInt(body.chunk_id, 10) : null,
  };
}

function validateScope(db, userId, materialId, scope) {
  if (scope.sourceScope === 'chapter') {
    if (!Number.isInteger(scope.chapterId)) throw new HttpError(400, 'missing_chapter_id');
    const row = db.prepare(`
      SELECT c.id
      FROM chapters c
      JOIN materials m ON m.id = c.material_id
      WHERE c.id=? AND c.material_id=? AND m.user_id=?
    `).get(scope.chapterId, materialId, userId);
    if (!row) throw new HttpError(404, 'chapter_not_found');
  }
  if (scope.sourceScope === 'chunk') {
    if (!Number.isInteger(scope.chunkId)) throw new HttpError(400, 'missing_chunk_id');
    const row = db.prepare(`
      SELECT ch.id
      FROM chunks ch
      JOIN materials m ON m.id = ch.material_id
      WHERE ch.id=? AND ch.material_id=? AND m.user_id=?
    `).get(scope.chunkId, materialId, userId);
    if (!row) throw new HttpError(404, 'chunk_not_found');
  }
}

router.post('/', requireAuth, videoLimiter, async (req, res, next) => {
  try {
    if (env.NOESIS_DEMO_MODE || env.STORYBOARD_REVIEW_REQUIRED) {
      throw new HttpError(409, 'storyboard_review_required', 'Generate and approve a storyboard before rendering MP4.');
    }
    const { material_id, concept } = req.body || {};
    if (!material_id) throw new HttpError(400, 'missing_fields');
    const scope = generationScope(req.body || {});
    const db = getDb();
    const m = db.prepare('SELECT id FROM materials WHERE id=? AND user_id=?').get(material_id, req.user.id);
    if (!m) throw new HttpError(404, 'material_not_found');
    validateScope(db, req.user.id, material_id, scope);
    const { videoId, jobId } = await videoSvc.generateVideo({ userId: req.user.id, materialId: material_id, concept, ...scope });
    res.status(202).json({ video_id: videoId, job_id: jobId, status: 'queued' });
  } catch (e) { next(e); }
});

router.post('/storyboard', requireAuth, videoLimiter, async (req, res, next) => {
  try {
    const { material_id, concept } = req.body || {};
    if (!material_id) throw new HttpError(400, 'missing_fields');
    const scope = generationScope(req.body || {});
    const db = getDb();
    const m = db.prepare('SELECT id FROM materials WHERE id=? AND user_id=?').get(material_id, req.user.id);
    if (!m) throw new HttpError(404, 'material_not_found');
    validateScope(db, req.user.id, material_id, scope);
    const out = await storyboardSvc.generateStoryboard({ userId: req.user.id, materialId: material_id, concept, ...scope });
    res.status(201).json({ storyboard: out });
  } catch (e) { next(e); }
});

router.get('/storyboard', requireAuth, (req, res, next) => {
  try {
    const materialId = req.query.material_id ? parseInt(req.query.material_id, 10) : null;
    res.json({ storyboards: storyboardSvc.listStoryboards(req.user.id, materialId) });
  } catch (e) { next(e); }
});

router.get('/storyboard/:id', requireAuth, (req, res, next) => {
  try {
    const out = storyboardSvc.getStoryboard(req.user.id, parseInt(req.params.id, 10));
    if (!out) throw new HttpError(404, 'storyboard_not_found');
    res.json({ storyboard: out });
  } catch (e) { next(e); }
});

router.patch('/storyboard/:id/scene/:sceneId', requireAuth, (req, res, next) => {
  try {
    const out = storyboardSvc.updateScene(req.user.id, parseInt(req.params.id, 10), req.params.sceneId, req.body || {});
    if (!out) throw new HttpError(404, 'storyboard_not_found');
    res.json({ storyboard: out });
  } catch (e) { next(e); }
});

router.post('/storyboard/:id/regenerate-scene', requireAuth, async (req, res, next) => {
  try {
    const { scene_id, instructions, fixType, targetVisualType } = req.body || {};
    if (!scene_id) throw new HttpError(400, 'missing_scene_id');
    if (fixType) {
      const out = storyboardSvc.fixScene(req.user.id, parseInt(req.params.id, 10), scene_id, fixType, { targetVisualType });
      if (!out) throw new HttpError(404, 'storyboard_not_found');
      return res.json({ storyboard: out });
    }
    const patch = instructions
      ? { narration: String(instructions).slice(0, 1200) }
      : { teachingGoal: 'Explain this scene with a concrete visual and one learner action.' };
    const out = storyboardSvc.updateScene(req.user.id, parseInt(req.params.id, 10), scene_id, patch);
    if (!out) throw new HttpError(404, 'storyboard_not_found');
    res.json({ storyboard: out });
  } catch (e) { next(e); }
});

router.post('/storyboard/:id/fix-scene', requireAuth, (req, res, next) => {
  try {
    const { sceneId, fixType, targetVisualType } = req.body || {};
    if (!sceneId) throw new HttpError(400, 'missing_scene_id');
    if (!fixType) throw new HttpError(400, 'missing_fix_type');
    const out = storyboardSvc.fixScene(req.user.id, parseInt(req.params.id, 10), sceneId, fixType, { targetVisualType });
    if (!out) throw new HttpError(404, 'storyboard_not_found');
    res.json({ storyboard: out });
  } catch (e) { next(e); }
});

router.post('/storyboard/:id/fix', requireAuth, (req, res, next) => {
  try {
    const out = storyboardSvc.fixStoryboardIssue(req.user.id, parseInt(req.params.id, 10), req.body || {});
    if (!out) throw new HttpError(404, 'storyboard_not_found');
    res.json(out);
  } catch (e) { next(e); }
});

router.post('/storyboard/:id/recheck', requireAuth, (req, res, next) => {
  try {
    const result = storyboardSvc.recheckStoryboard(req.user.id, parseInt(req.params.id, 10));
    if (!result) throw new HttpError(404, 'storyboard_not_found');
    res.json({ quality: result });
  } catch (e) { next(e); }
});

router.post('/storyboard/:id/approve', requireAuth, (req, res, next) => {
  try {
    const { force } = req.body || {};
    const out = storyboardSvc.approveStoryboard(req.user.id, parseInt(req.params.id, 10), { force: !!force });
    if (!out) throw new HttpError(404, 'storyboard_not_found');
    res.json({ storyboard: out });
  } catch (e) { next(e); }
});

router.post('/storyboard/:id/render', requireAuth, async (req, res, next) => {
  try {
    const { videoId, jobId, status } = await videoSvc.generateVideoFromStoryboard({ userId: req.user.id, storyboardId: parseInt(req.params.id, 10) });
    res.status(jobId ? 202 : 200).json({ video_id: videoId, job_id: jobId, status: jobId ? (status || 'queued') : 'ready' });
  } catch (e) { next(e); }
});

router.get('/storyboard/:id/scene/:sceneId/preview', requireAuth, async (req, res, next) => {
  try {
    const out = await storyboardSvc.renderScenePreview(req.user.id, parseInt(req.params.id, 10), req.params.sceneId);
    if (!out || !fs.existsSync(out)) throw new HttpError(404, 'preview_not_found');
    res.setHeader('Content-Type', out.endsWith('.svg') ? 'image/svg+xml' : 'image/png');
    fs.createReadStream(out).pipe(res);
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
    if (/(^|[\\/])\.\.([\\/]|$)/.test(String(v.output_path))) throw new HttpError(403, 'forbidden_path');
    const videosDir = path.resolve(env.UPLOAD_DIR, 'videos');
    const resolved = path.resolve(v.output_path);
    if (!resolved.startsWith(videosDir + path.sep)) throw new HttpError(403, 'forbidden_path');
    res.setHeader('Content-Type', 'video/mp4');
    fs.createReadStream(resolved).pipe(res);
  } catch (e) { next(e); }
});

module.exports = router;
