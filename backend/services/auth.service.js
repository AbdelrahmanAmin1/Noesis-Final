'use strict';

const bcrypt = require('bcryptjs');
const { getDb } = require('../config/db');
const { signToken } = require('../middleware/auth');
const { HttpError } = require('../middleware/error');

const TIMING_SAFE_BCRYPT_HASH = '$2a$12$C0sGEj9xD2l2i4uE8.n1uO4m8XsOQ0vlX61e/1kvT2uVdxV.NgUKG';
const MAX_PASSWORD_LENGTH = 256;

function nowIso() { return new Date().toISOString(); }

const SEED_CONCEPTS = [
  'Encapsulation', 'Inheritance', 'Polymorphism', 'Interfaces', 'SOLID Principles',
  'Arrays', 'Linked Lists', 'Stacks', 'Queues', 'Hash Tables',
  'Trees', 'Heaps', 'Graphs',
];

async function signup({ email, password, name }) {
  if (!email || !password || !name) throw new HttpError(400, 'missing_fields');
  if (password.length < 8) throw new HttpError(400, 'password_too_short');
  if (password.length > MAX_PASSWORD_LENGTH) throw new HttpError(400, 'password_too_long');
  const lcEmail = String(email).toLowerCase().trim();
  if (lcEmail === 'system@noesis.local') throw new HttpError(400, 'reserved_email');
  const db = getDb();
  const existing = db.prepare('SELECT id FROM users WHERE email=?').get(lcEmail);
  if (existing) throw new HttpError(409, 'email_exists');
  const hash = await bcrypt.hash(password, 12);
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

function me(userId) {
  const db = getDb();
  const u = db.prepare('SELECT id, email, name, major FROM users WHERE id=?').get(userId);
  if (!u) throw new HttpError(404, 'user_not_found');
  const prefs = db.prepare('SELECT * FROM user_prefs WHERE user_id=?').get(userId) || {};
  return { user: u, prefs };
}

function saveOnboarding(userId, payload) {
  const { subject, courses, goal, daily_minutes } = payload || {};
  const db = getDb();
  db.prepare(`UPDATE user_prefs SET subject=?, goal=?, daily_minutes=? WHERE user_id=?`)
    .run(subject || null, goal || null, parseInt(daily_minutes || 45, 10), userId);
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
  return me(userId);
}

function updatePrefs(userId, patch) {
  const db = getDb();
  const cur = getPrefs(userId) || {};
  const next = {
    subject: patch.subject ?? cur.subject,
    goal: patch.goal ?? cur.goal,
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
  };
}

module.exports = { signup, signin, me, saveOnboarding, getPrefs, updatePrefs, updateProfile, deleteAccount, exportData, SEED_CONCEPTS };
