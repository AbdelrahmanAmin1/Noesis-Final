'use strict';

const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { HttpError } = require('../middleware/error');
const learningMaps = require('../services/learning-map.service');
const studyPlans = require('../services/study-plan.service');

const router = express.Router();

router.get('/learning-map', requireAuth, (req, res, next) => {
  try {
    const materialId = req.query.material_id ? parseInt(req.query.material_id, 10) : null;
    res.json({ learning_map: learningMaps.buildLearningMap(req.user.id, { materialId, persist: true }) });
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
