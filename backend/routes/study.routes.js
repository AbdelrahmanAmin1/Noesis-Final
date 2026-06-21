'use strict';

const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { HttpError } = require('../middleware/error');
const learningMaps = require('../services/learning-map.service');
const materialLearningMaps = require('../services/material-learning-map.service');
const studyPlans = require('../services/study-plan.service');
const jobs = require('../services/jobs.service');

const router = express.Router();

function startMaterialMapJob(userId, materialId) {
  const active = jobs.findActive('material_learning_map', { userId, materialId });
  if (active) return active;
  const job = jobs.create('material_learning_map', { userId, materialId });
  setImmediate(async () => {
    jobs.update(job.id, { status: 'running', progress: 12, stage: 'Reading material concepts...' });
    try {
      const map = await materialLearningMaps.generateAndPersist(userId, materialId);
      jobs.update(job.id, {
        status: 'completed',
        progress: 100,
        stage: 'Mind map ready.',
        result: { material_id: materialId, learning_map_id: map.id, mode: map.generation && map.generation.mode },
      });
    } catch (error) {
      jobs.update(job.id, { status: 'failed', error: String(error && error.message || error) });
    }
  });
  return job;
}

router.get('/learning-map', requireAuth, (req, res, next) => {
  try {
    const materialId = req.query.material_id ? parseInt(req.query.material_id, 10) : null;
    const map = learningMaps.buildLearningMap(req.user.id, { materialId, persist: true });
    const generationJob = materialId && materialLearningMaps.shouldRefine(map)
      ? startMaterialMapJob(req.user.id, materialId)
      : null;
    res.json({
      learning_map: map,
      generation_status: generationJob ? 'refining' : (map.generation && map.generation.status || 'ready'),
      generation_job_id: generationJob && generationJob.id || null,
    });
  } catch (e) { next(e); }
});

router.post('/learning-map/regenerate', requireAuth, (req, res, next) => {
  try {
    const materialId = parseInt(req.body && req.body.material_id, 10);
    if (!Number.isInteger(materialId) || materialId <= 0) throw new HttpError(400, 'material_id_required');
    materialLearningMaps.getOrBuild(req.user.id, materialId, { persist: true });
    const job = startMaterialMapJob(req.user.id, materialId);
    res.status(202).json({ status: job.status, job_id: job.id, material_id: materialId });
  } catch (e) { next(e); }
});

router.post('/plans', requireAuth, (req, res, next) => {
  try {
    const materialId = req.body && req.body.material_id ? parseInt(req.body.material_id, 10) : null;
    res.status(201).json({ study_plan: studyPlans.createPlan(req.user.id, { materialId }) });
  } catch (e) { next(e); }
});

router.get('/plans/active', requireAuth, (req, res, next) => {
  try {
    const plan = studyPlans.getPlan(req.user.id);
    res.json({ study_plan: plan });
  } catch (e) { next(e); }
});

router.get('/plans/:id', requireAuth, (req, res, next) => {
  try {
    const plan = studyPlans.getPlan(req.user.id, parseInt(req.params.id, 10));
    if (!plan) throw new HttpError(404, 'study_plan_not_found');
    res.json({ study_plan: plan });
  } catch (e) { next(e); }
});

router.post('/plans/:id/approve', requireAuth, (req, res, next) => {
  try {
    const plan = studyPlans.approvePlan(req.user.id, parseInt(req.params.id, 10));
    if (!plan) throw new HttpError(404, 'study_plan_not_found');
    res.json({ study_plan: plan });
  } catch (e) { next(e); }
});

router.post('/tasks/:id/complete', requireAuth, (req, res, next) => {
  try {
    const plan = studyPlans.completeTask(req.user.id, parseInt(req.params.id, 10));
    if (!plan) throw new HttpError(404, 'study_plan_task_not_found');
    res.json({ study_plan: plan });
  } catch (e) { next(e); }
});

module.exports = router;
