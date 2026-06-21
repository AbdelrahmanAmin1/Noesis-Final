'use strict';

const bcrypt = require('bcryptjs');
const { getDb } = require('../config/db');
const { signToken } = require('../middleware/auth');
const { HttpError } = require('../middleware/error');
const gamification = require('./gamification.service');
const { normalizeGoal } = require('./goal-profile.service');

const TIMING_SAFE_BCRYPT_HASH = '$2a$12$C0sGEj9xD2l2i4uE8.n1uO4m8XsOQ0vlX61e/1kvT2uVdxV.NgUKG';
const MAX_PASSWORD_LENGTH = 256;
const PASSWORD_REQUIREMENTS_MESSAGE = 'Password must be at least 8 characters long and include at least one uppercase letter and one number.';

function validatePasswordRequirements(password) {
  const value = String(password);
  if (value.length < 8 || !/[A-Z]/.test(value) || !/\d/.test(value)) {
    throw new HttpError(400, 'password_requirements_not_met', PASSWORD_REQUIREMENTS_MESSAGE);
  }
}

function nowIso() { return new Date().toISOString(); }

const SEED_CONCEPTS = [
  'Encapsulation', 'Inheritance', 'Polymorphism', 'Interfaces', 'SOLID Principles',
  'Arrays', 'Linked Lists', 'Stacks', 'Queues', 'Hash Tables',
  'Trees', 'Heaps', 'Graphs',
];

async function signup({ email, password, name }) {
  if (!email || !password || !name) throw new HttpError(400, 'missing_fields');
  if (String(password).length > MAX_PASSWORD_LENGTH) throw new HttpError(400, 'password_too_long');
  validatePasswordRequirements(password);
  const lcEmail = String(email).toLowerCase().trim();
  if (lcEmail === 'system@noesis.local') throw new HttpError(400, 'reserved_email');
  const db = getDb();
  const existing = db.prepare('SELECT id FROM users WHERE email=?').get(lcEmail);
  if (existing) throw new HttpError(409, 'email_exists');
  const hash = await bcrypt.hash(String(password), 12);
  const info = db.prepare(
    'INSERT INTO users (email, password_hash, name, created_at) VALUES (?,?,?,?)'
  ).run(lcEmail, hash, name, nowIso());
  db.prepare('INSERT INTO user_prefs (user_id) VALUES (?)').run(info.lastInsertRowid);
  // Seed canonical curriculum concepts at mastery 0 so the dashboard map renders day one.
  const insConcept = db.prepare('INSERT OR IGNORE INTO concepts (user_id, name, mastery_pct) VALUES (?,?,0)');
  db.transaction(() => {
    for (const c of SEED_CONCEPTS) insConcept.run(info.lastInsertRowid, c);
  })();
  const user = db.prepare('SELECT id, email, name, major FROM users WHERE id=?').get(info.lastInsertRowid);
  gamification.ensureUser(user.id);
  return { user, token: signToken(user) };
}

async function signin({ email, password }) {
  if (!email || !password) throw new HttpError(400, 'missing_fields');
  if (password.length > MAX_PASSWORD_LENGTH) throw new HttpError(400, 'password_too_long');
  const db = getDb();
  const u = db.prepare('SELECT * FROM users WHERE email=?').get(email.toLowerCase());
  const ok = await bcrypt.compare(password, u ? u.password_hash : TIMING_SAFE_BCRYPT_HASH);
  if (!u || !ok) throw new HttpError(401, 'invalid_credentials');
  const user = { id: u.id, email: u.email, name: u.name, major: u.major };
  return { user, token: signToken(user) };
}

async function changePassword(userId, payload) {
  const current = payload.current_password ?? payload.currentPassword;
  const next = payload.new_password ?? payload.newPassword;
  if (!current || !next) throw new HttpError(400, 'missing_fields');
  if (String(next).length > MAX_PASSWORD_LENGTH) throw new HttpError(400, 'password_too_long');
  if (String(current).length > MAX_PASSWORD_LENGTH) throw new HttpError(400, 'password_too_long');
  validatePasswordRequirements(next);
  const db = getDb();
  const u = db.prepare('SELECT id, password_hash FROM users WHERE id=?').get(userId);
  const ok = await bcrypt.compare(String(current), u ? u.password_hash : TIMING_SAFE_BCRYPT_HASH);
  if (!u || !ok) throw new HttpError(401, 'invalid_current_password');
  const hash = await bcrypt.hash(String(next), 12);
  db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hash, userId);
  return { ok: true };
}

function me(userId) {
  const db = getDb();
  const u = db.prepare('SELECT id, email, name, major FROM users WHERE id=?').get(userId);
  if (!u) throw new HttpError(404, 'user_not_found');
  const prefs = db.prepare('SELECT * FROM user_prefs WHERE user_id=?').get(userId) || {};
  return { user: u, prefs };
}

function saveOnboarding(userId, payload) {
  const {
    subject,
    courses,
    goal,
    daily_minutes,
    current_level,
    deadline,
    days_per_week,
    minutes_per_session,
    learning_style,
    weak_topics,
    preferred_language,
    confidence,
  } = payload || {};
  const db = getDb();
  const normalizedGoal = normalizeGoal(goal);
  const profile = {
    currentLevel: current_level || payload.currentLevel || 'beginner',
    deadline: deadline || '',
    daysPerWeek: parseInt(days_per_week || payload.daysPerWeek || 5, 10),
    minutesPerSession: parseInt(minutes_per_session || payload.minutesPerSession || daily_minutes || 45, 10),
    learningStyle: learning_style || payload.learningStyle || 'mixed',
    weakTopics: Array.isArray(weak_topics || payload.weakTopics) ? (weak_topics || payload.weakTopics).slice(0, 12) : [],
    preferredLanguage: preferred_language || payload.preferredLanguage || 'java',
    confidence: confidence || payload.confidence || 'medium',
    goal: normalizedGoal,
  };
  db.prepare(`UPDATE user_prefs SET subject=?, goal=?, daily_minutes=?, study_profile_json=? WHERE user_id=?`)
    .run(subject || null, normalizedGoal, parseInt(daily_minutes || profile.minutesPerSession || 45, 10), JSON.stringify(profile), userId);
  if (Array.isArray(courses)) {
    const ins = db.prepare('INSERT INTO courses (user_id, code, title, professor) VALUES (?,?,?,?)');
    const tx = db.transaction((items) => {
      for (const c of items) ins.run(userId, c.code || c.id || '', c.title || c.label || '', c.professor || c.prof || '');
    });
    tx(courses);
  }
  return me(userId);
}

function getPrefs(userId) {
  const db = getDb();
  return db.prepare('SELECT * FROM user_prefs WHERE user_id=?').get(userId) || null;
}

function updateProfile(userId, patch) {
  const db = getDb();
  const name = patch.name == null ? null : String(patch.name).trim();
  const major = patch.major == null ? null : String(patch.major).trim();
  if (name !== null && name.length < 2) throw new HttpError(400, 'name_too_short');
  if (name !== null && name.length > 120) throw new HttpError(400, 'name_too_long');
  db.prepare('UPDATE users SET name=COALESCE(?, name), major=COALESCE(?, major) WHERE id=?')
    .run(name || null, major || null, userId);
  if (name) gamification.syncProfileName(userId, name);
  return me(userId);
}

function updatePrefs(userId, patch) {
  const db = getDb();
  const cur = getPrefs(userId) || {};
  const next = {
    subject: patch.subject ?? cur.subject,
    goal: patch.goal == null ? (cur.goal || 'exams') : normalizeGoal(patch.goal),
    daily_minutes: patch.daily_minutes ?? cur.daily_minutes ?? 45,
    theme: patch.theme ?? cur.theme ?? 'dark',
    default_tutor_mode: patch.default_tutor_mode ?? cur.default_tutor_mode ?? 'socratic',
    srs_aggression: patch.srs_aggression ?? cur.srs_aggression ?? 'balanced',
  };
  db.prepare(`UPDATE user_prefs SET subject=?, goal=?, daily_minutes=?, theme=?, default_tutor_mode=?, srs_aggression=? WHERE user_id=?`)
    .run(next.subject, next.goal, next.daily_minutes, next.theme, next.default_tutor_mode, next.srs_aggression, userId);
  return next;
}

function deleteAccount(userId) {
  if (!userId || userId === 0) throw new HttpError(400, 'invalid_user');
  const db = getDb();
  // ON DELETE CASCADE will remove dependent rows defined with FKs.
  const r = db.prepare('DELETE FROM users WHERE id=?').run(userId);
  return { ok: r.changes > 0 };
}

function exportData(userId) {
  const db = getDb();
  const get = (sql, ...args) => db.prepare(sql).all(userId, ...args);
  return {
    exported_at: nowIso(),
    user: db.prepare('SELECT id, email, name, major, created_at FROM users WHERE id=?').get(userId),
    prefs: db.prepare('SELECT * FROM user_prefs WHERE user_id=?').get(userId),
    courses: get('SELECT * FROM courses WHERE user_id=?'),
    materials: get('SELECT id, title, type, status, created_at FROM materials WHERE user_id=?'),
    notes: get('SELECT * FROM notes WHERE user_id=?'),
    flashcards: get('SELECT * FROM flashcards WHERE user_id=?'),
    flashcard_reviews: get('SELECT * FROM flashcard_reviews WHERE user_id=?'),
    quizzes: get('SELECT * FROM quizzes WHERE user_id=?'),
    quiz_attempts: get('SELECT * FROM quiz_attempts WHERE user_id=?'),
    tutor_sessions: get('SELECT id, concept, mode, started_at, ended_at FROM tutor_sessions WHERE user_id=?'),
    concepts: get('SELECT * FROM concepts WHERE user_id=?'),
    study_events: get('SELECT * FROM study_events WHERE user_id=?'),
    user_profile: db.prepare('SELECT * FROM user_profiles WHERE user_id=?').get(userId),
    user_xp: db.prepare('SELECT * FROM user_xp WHERE user_id=?').get(userId),
    xp_events: get('SELECT * FROM xp_events WHERE user_id=?'),
    user_achievements: get('SELECT * FROM user_achievements WHERE user_id=?'),
    user_streak: db.prepare('SELECT * FROM user_streaks WHERE user_id=?').get(userId),
    daily_goals: get('SELECT * FROM daily_goals WHERE user_id=?'),
    friendships: get('SELECT * FROM friendships WHERE user_id=?'),
    friend_requests_sent: get('SELECT * FROM friend_requests WHERE requester_id=?'),
    friend_requests_received: get('SELECT * FROM friend_requests WHERE recipient_id=?'),
  };
}

module.exports = { signup, signin, changePassword, me, saveOnboarding, getPrefs, updatePrefs, updateProfile, deleteAccount, exportData, SEED_CONCEPTS };
