'use strict';

const { getDb } = require('../config/db');
const learningMaps = require('./learning-map.service');
const gamification = require('./gamification.service');
const { getGoalProfile, normalizeGoal, publicGoalProfile } = require('./goal-profile.service');

function nowIso() { return new Date().toISOString(); }

function parseJson(text, fallback = {}) {
  try { return text ? JSON.parse(text) : fallback; } catch (_) { return fallback; }
}

function task(type, title, minutes, successCriteria) {
  return { type, title, estimatedMinutes: minutes, successCriteria };
}

function goalTask(type, topic, minutes, goalId) {
  if (type === 'quiz') {
    const title = goalId === 'practice' ? `${topic} practice set` : `${topic} checkpoint`;
    const criteria = goalId === 'practice'
      ? `Attempt a short practice set and write down one mistake pattern for ${topic}.`
      : `Score at least 80% or mark ${topic} weak.`;
    return task('quiz', title, minutes, criteria);
  }
  if (type === 'flashcards') {
    const title = goalId === 'retain' ? `${topic} spaced recall` : `${topic} recall cards`;
    return task('flashcards', title, minutes, 'Review due cards and rate honestly.');
  }
  if (type === 'tutor_session') {
    const title = goalId === 'understand' ? `${topic} deep dive` : `${topic} Socratic check`;
    return task('tutor_session', title, minutes, 'Answer one tutor question without notes.');
  }
  return task('read_notes', `${topic} polished notes`, minutes, `Write one sentence summarizing ${topic}.`);
}

function goalSuccessCriteria(goalId, topic) {
  if (goalId === 'exams') return `Finish the ${topic} checkpoint and name one exam-risk weak spot.`;
  if (goalId === 'understand') return `Explain ${topic} in your own words and answer one follow-up question.`;
  if (goalId === 'retain') return `Recall ${topic} without notes, then review any shaky cards.`;
  if (goalId === 'practice') return `Attempt ${topic} practice and record one mistake to fix next time.`;
  return `Finish the ${topic} tasks and identify one weak spot.`;
}

function recentReadyMaterials(db, userId) {
  return db.prepare(`
    SELECT id, title
    FROM materials
    WHERE user_id=? AND status='ready'
    ORDER BY created_at DESC
    LIMIT 4
  `).all(userId);
}

function buildCombinedMap(userId, materials) {
  const maps = materials.map(material => learningMaps.buildLearningMap(userId, { materialId: material.id, rootTopic: material.title }));
  const nodes = [];
  const seen = new Set();
  for (const map of maps) {
    for (const node of map.nodes || []) {
      const key = String(node.label || '').toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      nodes.push({ ...node, materialId: map.materialGrounding && map.materialGrounding.materialId || null });
    }
  }
  const recommendedPath = [];
  for (const map of maps) {
    for (const topic of map.recommendedPath || []) {
      const key = String(topic || '').toLowerCase();
      if (key && !recommendedPath.some(t => String(t).toLowerCase() === key)) recommendedPath.push(topic);
    }
  }
  return {
    rootTopic: materials.length === 1 ? materials[0].title : 'Uploaded Materials',
    startHere: recommendedPath[0] || (nodes[0] && nodes[0].label) || 'Upload material',
    tree: {
      label: 'Uploaded Materials',
      children: maps.map(map => ({
        label: map.rootTopic,
        children: (map.recommendedPath || []).slice(0, 4).map(label => ({ label, children: [] })),
      })),
    },
    nodes: nodes.slice(0, 14),
    recommendedPath: recommendedPath.slice(0, 7),
    materialGrounding: {
      used: materials.length > 0,
      materialIds: materials.map(m => m.id),
      combined: true,
    },
    generatedAt: nowIso(),
  };
}

function buildPlan(userId, opts = {}) {
  const db = getDb();
  const prefs = db.prepare('SELECT * FROM user_prefs WHERE user_id=?').get(userId) || {};
  const profile = parseJson(prefs.study_profile_json, {});
  const goalProfile = getGoalProfile(profile.goal || prefs.goal);
  const goalId = normalizeGoal(goalProfile.id);
  const map = learningMaps.buildLearningMap(userId);
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
    const planBias = goalProfile.plan || {};
    const primaryType = planBias.primaryType || 'tutor_session';
    const secondaryType = planBias.secondaryType || 'quiz';
    const secondaryEvery = Math.max(2, Number(planBias.secondaryEvery || 3));
    const tasks = [
      task('watch_video', `${topic} visual explanation`, Math.max(8, Math.min(18, Math.floor(minutes * 0.35))), `Explain the visual model for ${topic}.`),
      task('read_notes', `${topic} polished notes`, Math.max(7, Math.min(15, Math.floor(minutes * 0.25))), `Write one sentence summarizing ${topic}.`),
    ];
    tasks.push(goalTask(primaryType, topic, Math.max(8, Math.min(14, Math.floor(minutes * 0.25))), goalId));
    if (day % secondaryEvery === 0 || (minutes >= 60 && day % 2 === 0)) {
      tasks.push(goalTask(secondaryType, topic, Math.max(6, Math.min(10, Math.floor(minutes * 0.15))), goalId));
    }
    dailyPlan.push({
      day,
      focusTopic: topic,
      estimatedMinutes: Math.min(minutes, tasks.reduce((s, t) => s + t.estimatedMinutes, 0)),
      tasks,
      successCriteria: goalSuccessCriteria(goalId, topic),
    });
  }
  return {
    planTitle: `${durationDays <= 14 ? '2-Week' : `${durationDays}-Day`} ${map.rootTopic || 'Study'} Plan`,
    goal: goalProfile.label,
    goalId,
    goalProfile: publicGoalProfile(goalId),
    trackId: map.track || (map.materialGrounding && map.materialGrounding.track) || 'both',
    trackLabel: map.trackLabel || map.rootTopic || 'OOP + Data Structures',
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
