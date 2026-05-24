'use strict';

const { getDb } = require('../config/db');
const learningMaps = require('./learning-map.service');
const gamification = require('./gamification.service');

function nowIso() { return new Date().toISOString(); }

function parseJson(text, fallback = {}) {
  try { return text ? JSON.parse(text) : fallback; } catch (_) { return fallback; }
}

function task(type, title, minutes, successCriteria) {
  return { type, title, estimatedMinutes: minutes, successCriteria };
}

function buildPlan(userId, opts = {}) {
  const db = getDb();
  const prefs = db.prepare('SELECT * FROM user_prefs WHERE user_id=?').get(userId) || {};
  const profile = parseJson(prefs.study_profile_json, {});
  const map = learningMaps.buildLearningMap(userId, { materialId: opts.materialId });
  const daysPerWeek = Math.max(1, Math.min(7, Number(profile.daysPerWeek || profile.days_per_week || 5)));
  const minutes = Math.max(20, Math.min(180, Number(profile.minutesPerSession || prefs.daily_minutes || 45)));
  const deadline = profile.deadline || '';
  const path = (map.recommendedPath && map.recommendedPath.length ? map.recommendedPath : [map.startHere]).slice(0, Math.max(5, daysPerWeek * 2));
  const durationDays = deadline
    ? Math.max(3, Math.min(42, Math.ceil((new Date(deadline).getTime() - Date.now()) / 86400000)))
    : 14;
  const dailyPlan = [];
  for (let day = 1; day <= Math.min(durationDays, 14); day++) {
    const topic = path[(day - 1) % path.length] || map.startHere || 'Core topic';
    const isQuizDay = day % 2 === 0;
    const isReviewDay = day % 3 === 0;
    const tasks = [
      task('watch_video', `${topic} visual explanation`, Math.min(18, Math.floor(minutes * 0.4)), `Explain the visual model for ${topic}.`),
      task('read_notes', `${topic} polished notes`, Math.min(15, Math.floor(minutes * 0.3)), `Write one sentence summarizing ${topic}.`),
    ];
    if (isQuizDay) tasks.push(task('quiz', `${topic} checkpoint`, Math.min(12, Math.floor(minutes * 0.25)), `Score at least 80% or mark ${topic} weak.`));
    if (isReviewDay) tasks.push(task('flashcards', `${topic} recall cards`, 8, 'Review due cards and rate honestly.'));
    if (!isQuizDay && !isReviewDay) tasks.push(task('tutor_session', `${topic} Socratic check`, 10, 'Answer one tutor question without notes.'));
    dailyPlan.push({
      day,
      focusTopic: topic,
      estimatedMinutes: Math.min(minutes, tasks.reduce((s, t) => s + t.estimatedMinutes, 0)),
      tasks,
      successCriteria: `Finish the ${topic} tasks and identify one weak spot.`,
    });
  }
  return {
    planTitle: `${durationDays <= 14 ? '2-Week' : `${durationDays}-Day`} ${map.rootTopic || 'Study'} Plan`,
    goal: profile.goal || prefs.goal || 'deep understanding',
    durationDays,
    daysPerWeek,
    minutesPerSession: minutes,
    learningStyle: profile.learningStyle || 'mixed',
    preferredLanguage: profile.preferredLanguage || 'java',
    weakTopics: map.nodes.filter(n => n.type === 'weak').map(n => n.label).slice(0, 6),
    dailyPlan,
    learningMap: map,
  };
}

function createPlan(userId, opts = {}) {
  const db = getDb();
  const plan = buildPlan(userId, opts);
  const r = db.prepare('INSERT INTO study_plans (user_id, title, goal, status, plan_json, created_at, updated_at) VALUES (?,?,?,?,?,?,?)')
    .run(userId, plan.planTitle, plan.goal, 'draft', JSON.stringify(plan), nowIso(), nowIso());
  const taskIns = db.prepare('INSERT INTO study_plan_tasks (plan_id, day, task_order, task_json, status) VALUES (?,?,?,?,?)');
  db.transaction(() => {
    plan.dailyPlan.forEach(day => {
      day.tasks.forEach((t, index) => taskIns.run(r.lastInsertRowid, day.day, index, JSON.stringify({ ...t, focusTopic: day.focusTopic }), 'pending'));
    });
  })();
  return getPlan(userId, r.lastInsertRowid);
}

function getPlan(userId, id) {
  const db = getDb();
  const row = id
    ? db.prepare('SELECT * FROM study_plans WHERE id=? AND user_id=?').get(id, userId)
    : db.prepare("SELECT * FROM study_plans WHERE user_id=? ORDER BY CASE status WHEN 'active' THEN 0 ELSE 1 END, updated_at DESC LIMIT 1").get(userId);
  if (!row) return null;
  const tasks = db.prepare('SELECT * FROM study_plan_tasks WHERE plan_id=? ORDER BY day, task_order').all(row.id)
    .map(t => ({ ...t, task: parseJson(t.task_json, {}) }));
  return { ...row, plan: parseJson(row.plan_json, {}), tasks };
}

function approvePlan(userId, id) {
  const db = getDb();
  const row = getPlan(userId, id);
  if (!row) return null;
  db.prepare("UPDATE study_plans SET status='archived', updated_at=? WHERE user_id=? AND status='active'").run(nowIso(), userId);
  db.prepare("UPDATE study_plans SET status='active', approved_at=?, updated_at=? WHERE id=? AND user_id=?").run(nowIso(), nowIso(), id, userId);
  return getPlan(userId, id);
}

function completeTask(userId, taskId) {
  const db = getDb();
  const row = db.prepare(`
    SELECT t.id, t.plan_id, t.status, t.task_json FROM study_plan_tasks t
    JOIN study_plans p ON p.id=t.plan_id
    WHERE t.id=? AND p.user_id=?
  `).get(taskId, userId);
  if (!row) return null;
  if (row.status !== 'completed') {
    db.prepare("UPDATE study_plan_tasks SET status='completed', completed_at=? WHERE id=?").run(nowIso(), taskId);
    const taskData = parseJson(row.task_json, {});
    const reward = gamification.award(userId, 'study_task_completed', 'study_plan_task', taskId, {
      metadata: { plan_id: row.plan_id, task_type: taskData.type || '', title: taskData.title || '' },
    });
    const plan = getPlan(userId, row.plan_id);
    plan.reward = reward.awarded ? { points: reward.points, event_type: 'study_task_completed', unlocked: reward.unlocked || [] } : null;
    plan.gamification = reward.summary || null;
    return plan;
  }
  const plan = getPlan(userId, row.plan_id);
  plan.reward = null;
  plan.gamification = gamification.getSummary(userId);
  return plan;
}

module.exports = { buildPlan, createPlan, getPlan, approvePlan, completeTask };
