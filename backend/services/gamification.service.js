'use strict';

const { getDb } = require('../config/db');

const XP_RULES = {
  material_uploaded: 10,
  notes_generated: 10,
  flashcard_reviewed: 3,
  quiz_finished: 20,
  quiz_high_score: 30,
  wrong_answers_reviewed: 20,
  ai_tutor_session_completed: 25,
  study_task_completed: 20,
  daily_streak: 15,
  note_shared: 10,
  quiz_shared: 10,
  weak_topic_improved: 20,
  room_help: 10,
};

const FLASHCARD_DAILY_CAP = 15;

function nowIso() { return new Date().toISOString(); }

function dayKey(value = Date.now()) {
  return new Date(value).toISOString().slice(0, 10);
}

function addDaysKey(key, delta) {
  const d = new Date(`${key}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function startOfWeekIso() {
  const now = new Date();
  const utcMidnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const day = new Date(utcMidnight).getUTCDay();
  const monOffset = (day + 6) % 7;
  return new Date(utcMidnight - monOffset * 86400000).toISOString();
}

function levelFromXp(totalXp) {
  return Math.floor(Math.sqrt(Math.max(0, totalXp) / 100)) + 1;
}

function levelProgress(totalXp) {
  const level = levelFromXp(totalXp);
  const currentFloor = Math.pow(level - 1, 2) * 100;
  const nextFloor = Math.pow(level, 2) * 100;
  const span = Math.max(1, nextFloor - currentFloor);
  return {
    level,
    total_xp: totalXp,
    current_level_xp: Math.max(0, totalXp - currentFloor),
    next_level_xp: nextFloor,
    xp_to_next_level: Math.max(0, nextFloor - totalXp),
    progress_pct: Math.min(100, Math.round(((totalXp - currentFloor) / span) * 100)),
  };
}

function parseJson(text, fallback) {
  try { return text ? JSON.parse(text) : fallback; } catch (_) { return fallback; }
}

function ensureUser(userId) {
  if (!userId) return null;
  const db = getDb();
  const user = db.prepare('SELECT id, name, created_at FROM users WHERE id=?').get(userId);
  if (!user) return null;
  const now = nowIso();
  db.prepare(`
    INSERT OR IGNORE INTO user_profiles (user_id, display_name, leaderboard_opt_out, created_at, updated_at)
    VALUES (?,?,?,?,?)
  `).run(userId, cleanDisplayName(user.name, userId), 0, user.created_at || now, now);
  db.prepare('INSERT OR IGNORE INTO user_xp (user_id, total_xp, level, updated_at) VALUES (?,?,?,?)')
    .run(userId, 0, 1, now);
  db.prepare('INSERT OR IGNORE INTO user_streaks (user_id, current_streak, best_streak, last_activity_date, updated_at) VALUES (?,?,?,?,?)')
    .run(userId, 0, 0, null, now);
  recomputeUserXp(userId);
  ensureDailyGoal(userId);
  return true;
}

function cleanDisplayName(name, userId) {
  const value = String(name || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  return value || `Student ${userId}`;
}

function syncProfileName(userId, name) {
  ensureUser(userId);
  const display = cleanDisplayName(name, userId);
  getDb().prepare('UPDATE user_profiles SET display_name=?, updated_at=? WHERE user_id=?')
    .run(display, nowIso(), userId);
  return { display_name: display };
}

function recomputeUserXp(userId) {
  const db = getDb();
  const row = db.prepare('SELECT COALESCE(SUM(points), 0) AS total FROM xp_events WHERE user_id=?').get(userId) || {};
  const total = Number(row.total || 0);
  const level = levelFromXp(total);
  db.prepare('UPDATE user_xp SET total_xp=?, level=?, updated_at=? WHERE user_id=?')
    .run(total, level, nowIso(), userId);
  return { total_xp: total, level };
}

function eventDateRange(date = dayKey()) {
  return { start: `${date}T00:00:00.000Z`, end: `${date}T23:59:59.999Z` };
}

function dailyGoalTasks(userId) {
  const db = getDb();
  const active = db.prepare("SELECT id FROM study_plans WHERE user_id=? AND status='active' ORDER BY updated_at DESC LIMIT 1").get(userId);
  if (!active) return [];
  return db.prepare(`
    SELECT id, day, task_order, task_json, status
    FROM study_plan_tasks
    WHERE plan_id=?
    ORDER BY CASE status WHEN 'completed' THEN 1 ELSE 0 END, day, task_order
    LIMIT 5
  `).all(active.id).map(row => ({
    id: row.id,
    day: row.day,
    status: row.status,
    task: parseJson(row.task_json, {}),
  }));
}

function ensureDailyGoal(userId, date = dayKey()) {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM daily_goals WHERE user_id=? AND goal_date=?').get(userId, date);
  if (existing) return publicDailyGoal(existing);
  const tasks = dailyGoalTasks(userId);
  const targetTasks = tasks.length ? Math.min(3, tasks.length) : 3;
  const targetXp = tasks.length ? 60 : 50;
  db.prepare(`
    INSERT INTO daily_goals (user_id, goal_date, target_xp, target_tasks, completed_xp, completed_tasks, status, tasks_json)
    VALUES (?,?,?,?,?,?,?,?)
  `).run(userId, date, targetXp, targetTasks, 0, 0, 'active', JSON.stringify(tasks));
  return publicDailyGoal(db.prepare('SELECT * FROM daily_goals WHERE user_id=? AND goal_date=?').get(userId, date));
}

function publicDailyGoal(row) {
  if (!row) return null;
  return {
    ...row,
    tasks: parseJson(row.tasks_json, []),
    xp_progress_pct: Math.min(100, Math.round((Number(row.completed_xp || 0) / Math.max(1, Number(row.target_xp || 1))) * 100)),
    task_progress_pct: Math.min(100, Math.round((Number(row.completed_tasks || 0) / Math.max(1, Number(row.target_tasks || 1))) * 100)),
  };
}

function updateDailyGoal(userId, points, taskLike, date = dayKey()) {
  ensureDailyGoal(userId, date);
  const db = getDb();
  const row = db.prepare('SELECT * FROM daily_goals WHERE user_id=? AND goal_date=?').get(userId, date);
  if (!row) return null;
  const completedXp = Number(row.completed_xp || 0) + Math.max(0, Number(points || 0));
  const completedTasks = Number(row.completed_tasks || 0) + (taskLike ? 1 : 0);
  const status = completedXp >= Number(row.target_xp || 0) || completedTasks >= Number(row.target_tasks || 0)
    ? 'completed'
    : 'active';
  db.prepare('UPDATE daily_goals SET completed_xp=?, completed_tasks=?, status=? WHERE id=?')
    .run(completedXp, completedTasks, status, row.id);
  return publicDailyGoal(db.prepare('SELECT * FROM daily_goals WHERE id=?').get(row.id));
}

function baseIdempotencyKey(userId, eventType, relatedType, relatedId, date) {
  if (eventType === 'daily_streak') return `${userId}:${eventType}:${date || dayKey()}`;
  return `${userId}:${eventType}:${relatedType || 'none'}:${relatedId == null ? 'none' : relatedId}`;
}

function resolvePoints(userId, eventType, requestedPoints, date) {
  const base = Number.isFinite(requestedPoints) ? requestedPoints : XP_RULES[eventType];
  if (!base || base <= 0) return 0;
  if (eventType !== 'flashcard_reviewed') return base;
  const db = getDb();
  const range = eventDateRange(date);
  const row = db.prepare(`
    SELECT COALESCE(SUM(points), 0) AS points
    FROM xp_events
    WHERE user_id=? AND event_type='flashcard_reviewed' AND created_at BETWEEN ? AND ?
  `).get(userId, range.start, range.end) || {};
  const remaining = Math.max(0, FLASHCARD_DAILY_CAP - Number(row.points || 0));
  return Math.min(base, remaining);
}

function isTaskLike(eventType) {
  return [
    'material_uploaded',
    'notes_generated',
    'flashcard_reviewed',
    'quiz_finished',
    'ai_tutor_session_completed',
    'study_task_completed',
    'weak_topic_improved',
    'note_shared',
    'quiz_shared',
  ].includes(eventType);
}

function award(userId, eventType, relatedType, relatedId, opts = {}) {
  if (!userId || userId <= 0) return { awarded: false, skipped: true };
  ensureUser(userId);
  const date = opts.date || dayKey();
  const idempotencyKey = opts.idempotencyKey || baseIdempotencyKey(userId, eventType, relatedType, relatedId, date);
  const db = getDb();
  const existing = db.prepare('SELECT * FROM xp_events WHERE idempotency_key=?').get(idempotencyKey);
  if (existing) {
    return { awarded: false, duplicate: true, event: existing, summary: getSummary(userId) };
  }
  const points = resolvePoints(userId, eventType, opts.points, date);
  if (!points) {
    return { awarded: false, capped: true, summary: getSummary(userId) };
  }
  const createdAt = opts.createdAt || nowIso();
  const info = db.prepare(`
    INSERT INTO xp_events (user_id, event_type, points, related_type, related_id, room_id, idempotency_key, metadata_json, created_at)
    VALUES (?,?,?,?,?,?,?,?,?)
  `).run(
    userId,
    eventType,
    points,
    relatedType || null,
    relatedId == null ? null : relatedId,
    opts.roomId || null,
    idempotencyKey,
    JSON.stringify(opts.metadata || {}),
    createdAt
  );
  const xp = recomputeUserXp(userId);
  updateDailyGoal(userId, points, isTaskLike(eventType), date);
  if (!opts.skipStreak && eventType !== 'daily_streak') updateStreakForActivity(userId, date);
  const unlocked = checkAchievements(userId);
  return {
    awarded: true,
    event: db.prepare('SELECT * FROM xp_events WHERE id=?').get(info.lastInsertRowid),
    points,
    xp,
    unlocked,
    summary: getSummary(userId),
  };
}

function updateStreakForActivity(userId, date = dayKey()) {
  ensureUser(userId);
  const db = getDb();
  const row = db.prepare('SELECT * FROM user_streaks WHERE user_id=?').get(userId);
  const last = row && row.last_activity_date;
  if (last === date) return row;
  let current = 1;
  if (last && addDaysKey(last, 1) === date) current = Number(row.current_streak || 0) + 1;
  const best = Math.max(Number(row && row.best_streak || 0), current);
  db.prepare('UPDATE user_streaks SET current_streak=?, best_streak=?, last_activity_date=?, updated_at=? WHERE user_id=?')
    .run(current, best, date, nowIso(), userId);
  if (current > 1) {
    award(userId, 'daily_streak', 'date', null, {
      date,
      idempotencyKey: `${userId}:daily_streak:${date}`,
      metadata: { streak: current },
      skipStreak: true,
    });
  }
  return db.prepare('SELECT * FROM user_streaks WHERE user_id=?').get(userId);
}

function unlockAchievement(userId, code, metadata = {}) {
  const db = getDb();
  const achievement = db.prepare('SELECT id, code, name, description, category, icon FROM achievements WHERE code=? AND active=1').get(code);
  if (!achievement) return null;
  const info = db.prepare(`
    INSERT OR IGNORE INTO user_achievements (user_id, achievement_id, unlocked_at, metadata_json)
    VALUES (?,?,?,?)
  `).run(userId, achievement.id, nowIso(), JSON.stringify(metadata));
  if (!info.changes) return null;
  return { ...achievement, unlocked_at: nowIso(), metadata };
}

function countEvent(userId, eventType) {
  return (getDb().prepare('SELECT COUNT(*) AS c FROM xp_events WHERE user_id=? AND event_type=?').get(userId, eventType) || {}).c || 0;
}

function checkAchievements(userId) {
  ensureUser(userId);
  const db = getDb();
  const unlocked = [];
  const maybe = (code, ok, metadata) => {
    if (!ok) return;
    const item = unlockAchievement(userId, code, metadata);
    if (item) unlocked.push(item);
  };
  const streak = db.prepare('SELECT current_streak FROM user_streaks WHERE user_id=?').get(userId) || {};
  const reviewCount = (db.prepare('SELECT COUNT(*) AS c FROM flashcard_reviews WHERE user_id=?').get(userId) || {}).c || 0;
  const wrongCount = (db.prepare(`
    SELECT COUNT(*) AS c
    FROM quiz_answers qa
    JOIN quiz_attempts at ON at.id=qa.attempt_id
    WHERE at.user_id=? AND qa.is_correct=0
  `).get(userId) || {}).c || 0;
  const friendCount = (db.prepare('SELECT COUNT(*) AS c FROM friendships WHERE user_id=?').get(userId) || {}).c || 0;
  const ownedRooms = (db.prepare('SELECT COUNT(*) AS c FROM study_rooms WHERE owner_id=?').get(userId) || {}).c || 0;
  const topicRows = db.prepare('SELECT name, mastery_pct FROM concepts WHERE user_id=? AND mastery_pct > 0').all(userId);
  const topicText = topicRows.map(r => r.name).join(' ').toLowerCase();

  maybe('first_upload', countEvent(userId, 'material_uploaded') > 0, {});
  maybe('quiz_starter', countEvent(userId, 'quiz_finished') > 0, {});
  maybe('flashcard_grinder', reviewCount >= 10, { reviews: reviewCount });
  maybe('comeback_learner', countEvent(userId, 'weak_topic_improved') > 0, {});
  maybe('seven_day_streak', Number(streak.current_streak || 0) >= 7, { streak: streak.current_streak });
  maybe('oop_explorer', /(object|class|inheritance|polymorphism|encapsulation|abstraction|interface|solid)/i.test(topicText), {});
  maybe('data_structures_climber', /(array|linked|stack|queue|tree|graph|hash|heap|big-o|complexity)/i.test(topicText), {});
  maybe('bug_hunter', wrongCount > 0, { wrong_answers: wrongCount });
  maybe('study_buddy', friendCount > 0, { friends: friendCount });
  maybe('room_leader', ownedRooms > 0, { rooms_owned: ownedRooms });
  return unlocked;
}

function listEvents(userId, limit = 30) {
  ensureUser(userId);
  const n = Math.min(100, Math.max(1, parseInt(limit || 30, 10)));
  return getDb().prepare(`
    SELECT id, event_type, points, related_type, related_id, room_id, metadata_json, created_at
    FROM xp_events
    WHERE user_id=?
    ORDER BY created_at DESC, id DESC
    LIMIT ?
  `).all(userId, n).map(row => ({ ...row, metadata: parseJson(row.metadata_json, {}) }));
}

function listAchievements(userId) {
  ensureUser(userId);
  const rows = getDb().prepare(`
    SELECT a.id, a.code, a.name, a.description, a.category, a.icon, a.criteria_json,
           ua.unlocked_at, ua.metadata_json
    FROM achievements a
    LEFT JOIN user_achievements ua ON ua.achievement_id=a.id AND ua.user_id=?
    WHERE a.active=1
    ORDER BY ua.unlocked_at IS NULL, ua.unlocked_at DESC, a.id ASC
  `).all(userId);
  return rows.map(row => ({
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    category: row.category,
    icon: row.icon,
    criteria: parseJson(row.criteria_json, {}),
    unlocked_at: row.unlocked_at || null,
    unlocked: !!row.unlocked_at,
    metadata: parseJson(row.metadata_json, {}),
  }));
}

function getSummary(userId) {
  ensureUser(userId);
  const db = getDb();
  const xp = db.prepare('SELECT total_xp, level, updated_at FROM user_xp WHERE user_id=?').get(userId) || { total_xp: 0, level: 1 };
  const progress = levelProgress(Number(xp.total_xp || 0));
  const streak = db.prepare('SELECT current_streak, best_streak, last_activity_date FROM user_streaks WHERE user_id=?').get(userId) || {};
  const achievements = listAchievements(userId);
  const unlocked = achievements.filter(a => a.unlocked);
  const weekStart = startOfWeekIso();
  const weekly = db.prepare('SELECT COALESCE(SUM(points), 0) AS xp FROM xp_events WHERE user_id=? AND created_at >= ?')
    .get(userId, weekStart) || {};
  const todayGoal = ensureDailyGoal(userId);
  const rank = db.prepare(`
    SELECT COUNT(*) + 1 AS rank
    FROM user_xp other
    JOIN user_profiles p ON p.user_id=other.user_id
    WHERE COALESCE(p.leaderboard_opt_out, 0)=0
      AND (other.total_xp > ? OR (other.total_xp = ? AND other.user_id < ?))
  `).get(xp.total_xp || 0, xp.total_xp || 0, userId) || {};
  return {
    xp: {
      total_xp: Number(xp.total_xp || 0),
      level: progress.level,
      current_level_xp: progress.current_level_xp,
      next_level_xp: progress.next_level_xp,
      xp_to_next_level: progress.xp_to_next_level,
      progress_pct: progress.progress_pct,
      weekly_xp: Number(weekly.xp || 0),
      rank: Number(rank.rank || 1),
    },
    streak: {
      current_streak: Number(streak.current_streak || 0),
      best_streak: Number(streak.best_streak || 0),
      last_activity_date: streak.last_activity_date || null,
    },
    daily_goal: todayGoal,
    achievements: {
      unlocked_count: unlocked.length,
      total_count: achievements.length,
      recent: unlocked.slice(0, 5),
      all: achievements,
    },
    recent_events: listEvents(userId, 8),
  };
}

module.exports = {
  XP_RULES,
  award,
  checkAchievements,
  cleanDisplayName,
  ensureDailyGoal,
  ensureUser,
  getSummary,
  levelFromXp,
  levelProgress,
  listAchievements,
  listEvents,
  syncProfileName,
  updateStreakForActivity,
};
