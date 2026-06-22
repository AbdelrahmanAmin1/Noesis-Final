'use strict';

const crypto = require('crypto');
const { getDb } = require('../config/db');
const { HttpError } = require('../middleware/error');
const gamification = require('./gamification.service');
const activity = require('./activity.service');

function nowIso() { return new Date().toISOString(); }

function parseJson(text, fallback = {}) {
  try { return text ? JSON.parse(text) : fallback; } catch (_) { return fallback; }
}

function clean(value, max = 200) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function generateInviteCode(db) {
  for (let i = 0; i < 20; i++) {
    const code = crypto.randomBytes(4).toString('hex').toUpperCase();
    if (!db.prepare('SELECT id FROM study_rooms WHERE invite_code=?').get(code)) return code;
  }
  throw new HttpError(500, 'invite_code_generation_failed');
}

function publicRoom(row, userId) {
  if (!row) return null;
  return {
    id: row.id,
    owner_id: row.owner_id,
    name: row.name,
    description: row.description || '',
    subject: row.subject || '',
    room_type: row.room_type,
    invite_code: row.invite_code,
    created_at: row.created_at,
    updated_at: row.updated_at,
    archived_at: row.archived_at || null,
    member_count: Number(row.member_count || 0),
    user_role: row.user_role || null,
    is_owner: row.owner_id === userId,
  };
}

function requireMembership(userId, roomId) {
  const member = getDb().prepare(`
    SELECT m.role, r.*
    FROM study_room_members m
    JOIN study_rooms r ON r.id=m.room_id
    WHERE m.room_id=? AND m.user_id=? AND r.archived_at IS NULL
  `).get(roomId, userId);
  if (!member) throw new HttpError(403, 'room_membership_required');
  return member;
}

function roomExists(roomId) {
  return getDb().prepare('SELECT * FROM study_rooms WHERE id=? AND archived_at IS NULL').get(roomId);
}

function createRoom(userId, payload = {}) {
  gamification.ensureUser(userId);
  const name = clean(payload.name, 100);
  if (name.length < 2) throw new HttpError(400, 'room_name_required');
  const roomType = ['public', 'private', 'invite-only'].includes(payload.room_type || payload.roomType)
    ? (payload.room_type || payload.roomType)
    : 'public';
  const description = clean(payload.description, 500);
  const subject = clean(payload.subject, 80);
  const db = getDb();
  const now = nowIso();
  const code = generateInviteCode(db);
  let id;
  db.transaction(() => {
    const info = db.prepare(`
      INSERT INTO study_rooms (owner_id, name, description, subject, room_type, invite_code, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?)
    `).run(userId, name, description, subject, roomType, code, now, now);
    id = info.lastInsertRowid;
    db.prepare('INSERT INTO study_room_members (room_id, user_id, role, joined_at, last_seen_at) VALUES (?,?,?,?,?)')
      .run(id, userId, 'owner', now, now);
  })();
  activity.addRoomActivity(id, userId, 'room_created', `${name} was created.`, { relatedType: 'room', relatedId: id });
  gamification.checkAchievements(userId);
  return getRoom(userId, id);
}

function listRooms(userId) {
  gamification.ensureUser(userId);
  const rows = getDb().prepare(`
    SELECT r.*,
           (SELECT COUNT(*) FROM study_room_members m WHERE m.room_id=r.id) AS member_count,
           (SELECT role FROM study_room_members m WHERE m.room_id=r.id AND m.user_id=?) AS user_role
    FROM study_rooms r
    WHERE r.archived_at IS NULL
      AND (r.room_type='public' OR EXISTS (
        SELECT 1 FROM study_room_members m WHERE m.room_id=r.id AND m.user_id=?
      ))
    ORDER BY user_role IS NULL, r.updated_at DESC
    LIMIT 80
  `).all(userId, userId);
  return rows.map(row => publicRoom(row, userId));
}

function sharedNotes(roomId) {
  return getDb().prepare(`
    SELECT sn.id, sn.note_id, sn.shared_by, sn.title_snapshot, sn.body_md_snapshot, sn.created_at,
           p.display_name
    FROM study_room_shared_notes sn
    JOIN user_profiles p ON p.user_id=sn.shared_by
    WHERE sn.room_id=?
    ORDER BY sn.created_at DESC, sn.id DESC
    LIMIT 30
  `).all(roomId);
}

function sharedQuizzes(roomId) {
  return getDb().prepare(`
    SELECT sq.id, sq.quiz_id, sq.shared_by, sq.title_snapshot, sq.metadata_json, sq.created_at,
           p.display_name
    FROM study_room_shared_quizzes sq
    JOIN user_profiles p ON p.user_id=sq.shared_by
    WHERE sq.room_id=?
    ORDER BY sq.created_at DESC, sq.id DESC
    LIMIT 30
  `).all(roomId).map(row => ({ ...row, metadata: parseJson(row.metadata_json, {}) }));
}

function getRoom(userId, roomId) {
  gamification.ensureUser(userId);
  const db = getDb();
  const room = db.prepare(`
    SELECT r.*,
           (SELECT COUNT(*) FROM study_room_members m WHERE m.room_id=r.id) AS member_count,
           (SELECT role FROM study_room_members m WHERE m.room_id=r.id AND m.user_id=?) AS user_role
    FROM study_rooms r
    WHERE r.id=? AND r.archived_at IS NULL
  `).get(userId, roomId);
  if (!room) throw new HttpError(404, 'room_not_found');
  if (room.room_type !== 'public' && !room.user_role) throw new HttpError(403, 'room_membership_required');
  return {
    room: publicRoom(room, userId),
    members: room.user_role ? listMembers(userId, roomId).members : [],
    activity: room.user_role ? activity.listRoomActivity(roomId, 20) : [],
    shared_notes: room.user_role ? sharedNotes(roomId) : [],
    shared_quizzes: room.user_role ? sharedQuizzes(roomId) : [],
  };
}

function joinRoom(userId, roomId, opts = {}) {
  gamification.ensureUser(userId);
  const id = parseInt(roomId, 10);
  const db = getDb();
  const room = roomExists(id);
  if (!room) throw new HttpError(404, 'room_not_found');
  if (!opts.byCode && room.room_type !== 'public') throw new HttpError(403, 'invite_code_required');
  const now = nowIso();
  const info = db.prepare('INSERT OR IGNORE INTO study_room_members (room_id, user_id, role, joined_at, last_seen_at) VALUES (?,?,?,?,?)')
    .run(id, userId, 'member', now, now);
  if (info.changes) {
    activity.addRoomActivity(id, userId, 'member_joined', 'A learner joined the room.', { relatedType: 'member', relatedId: userId });
    gamification.checkAchievements(userId);
  }
  return getRoom(userId, id);
}

function joinByCode(userId, code) {
  const normalized = String(code || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  if (normalized.length < 4) throw new HttpError(400, 'invalid_invite_code');
  const room = getDb().prepare('SELECT id FROM study_rooms WHERE invite_code=? AND archived_at IS NULL').get(normalized);
  if (!room) throw new HttpError(404, 'room_not_found');
  return joinRoom(userId, room.id, { byCode: true });
}

function leaveRoom(userId, roomId) {
  const id = parseInt(roomId, 10);
  const member = requireMembership(userId, id);
  const db = getDb();
  const now = nowIso();
  if (member.owner_id === userId || member.role === 'owner') {
    db.prepare('UPDATE study_rooms SET archived_at=?, updated_at=? WHERE id=? AND owner_id=?').run(now, now, id, userId);
    activity.addRoomActivity(id, userId, 'room_archived', `${member.name} was archived.`, { relatedType: 'room', relatedId: id });
    return { ok: true, archived: true };
  }
  db.prepare('DELETE FROM study_room_members WHERE room_id=? AND user_id=?').run(id, userId);
  activity.addRoomActivity(id, userId, 'member_left', 'A learner left the room.', { relatedType: 'member', relatedId: userId });
  return { ok: true };
}

function listMembers(userId, roomId) {
  requireMembership(userId, roomId);
  const rows = getDb().prepare(`
    SELECT m.user_id, m.role, m.joined_at, m.last_seen_at, p.display_name,
           COALESCE(ux.total_xp, 0) AS total_xp,
           COALESCE(s.current_streak, 0) AS streak
    FROM study_room_members m
    JOIN user_profiles p ON p.user_id=m.user_id
    LEFT JOIN user_xp ux ON ux.user_id=m.user_id
    LEFT JOIN user_streaks s ON s.user_id=m.user_id
    WHERE m.room_id=?
    ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'moderator' THEN 1 ELSE 2 END, p.display_name ASC
  `).all(roomId);
  return {
    members: rows.map(row => ({
      user_id: row.user_id,
      display_name: row.display_name,
      role: row.role,
      joined_at: row.joined_at,
      last_seen_at: row.last_seen_at,
      level: gamification.levelFromXp(Number(row.total_xp || 0)),
      total_xp: Number(row.total_xp || 0),
      streak: Number(row.streak || 0),
    })),
  };
}

function listActivity(userId, roomId, limit) {
  requireMembership(userId, roomId);
  return { activity: activity.listRoomActivity(roomId, limit) };
}

function listMessages(userId, roomId, limit = 50) {
  requireMembership(userId, roomId);
  const rows = getDb().prepare(`
    SELECT msg.id, msg.room_id, msg.user_id, msg.body, msg.created_at, p.display_name
    FROM study_room_messages msg
    JOIN user_profiles p ON p.user_id=msg.user_id
    WHERE msg.room_id=?
    ORDER BY msg.created_at DESC, msg.id DESC
    LIMIT ?
  `).all(roomId, Math.min(100, Math.max(1, parseInt(limit || 50, 10))));
  return { messages: rows.reverse() };
}

function postMessage(userId, roomId, payload = {}) {
  requireMembership(userId, roomId);
  const body = String(payload.body || payload.message || '').trim();
  if (!body) throw new HttpError(400, 'missing_message');
  if (body.length > 1000) throw new HttpError(400, 'message_too_long');
  const db = getDb();
  const info = db.prepare('INSERT INTO study_room_messages (room_id, user_id, body, created_at) VALUES (?,?,?,?)')
    .run(roomId, userId, body, nowIso());
  return { message: db.prepare('SELECT * FROM study_room_messages WHERE id=?').get(info.lastInsertRowid) };
}

function shareNote(userId, roomId, noteId) {
  requireMembership(userId, roomId);
  const db = getDb();
  const note = db.prepare('SELECT id, title, body_md FROM notes WHERE id=? AND user_id=?').get(parseInt(noteId, 10), userId);
  if (!note) throw new HttpError(404, 'note_not_found');
  const info = db.prepare(`
    INSERT INTO study_room_shared_notes (room_id, note_id, shared_by, title_snapshot, body_md_snapshot, created_at)
    VALUES (?,?,?,?,?,?)
  `).run(roomId, note.id, userId, note.title, note.body_md || '', nowIso());
  activity.addRoomActivity(roomId, userId, 'note_shared', `Shared note: ${note.title}`, { relatedType: 'shared_note', relatedId: info.lastInsertRowid });
  gamification.award(userId, 'note_shared', 'shared_note', info.lastInsertRowid, {
    roomId,
    metadata: { note_id: note.id, title: note.title },
  });
  return { id: info.lastInsertRowid };
}

function shareQuiz(userId, roomId, quizId) {
  requireMembership(userId, roomId);
  const db = getDb();
  const quiz = db.prepare(`
    SELECT q.id, q.title, q.difficulty,
           (SELECT COUNT(*) FROM quiz_questions qq WHERE qq.quiz_id=q.id) AS question_count
    FROM quizzes q
    WHERE q.id=? AND q.user_id=?
  `).get(parseInt(quizId, 10), userId);
  if (!quiz) throw new HttpError(404, 'quiz_not_found');
  const info = db.prepare(`
    INSERT INTO study_room_shared_quizzes (room_id, quiz_id, shared_by, title_snapshot, metadata_json, created_at)
    VALUES (?,?,?,?,?,?)
  `).run(roomId, quiz.id, userId, quiz.title, JSON.stringify({
    difficulty: quiz.difficulty,
    question_count: quiz.question_count,
  }), nowIso());
  activity.addRoomActivity(roomId, userId, 'quiz_shared', `Shared quiz: ${quiz.title}`, { relatedType: 'shared_quiz', relatedId: info.lastInsertRowid });
  gamification.award(userId, 'quiz_shared', 'shared_quiz', info.lastInsertRowid, {
    roomId,
    metadata: { quiz_id: quiz.id, title: quiz.title },
  });
  return { id: info.lastInsertRowid };
}

function startSharedQuiz(userId, roomId, shareId) {
  requireMembership(userId, roomId);
  const db = getDb();
  const shared = db.prepare('SELECT * FROM study_room_shared_quizzes WHERE id=? AND room_id=?').get(parseInt(shareId, 10), roomId);
  if (!shared) throw new HttpError(404, 'shared_quiz_not_found');
  const original = db.prepare('SELECT * FROM quizzes WHERE id=?').get(shared.quiz_id);
  if (!original) throw new HttpError(404, 'quiz_not_found');
  const questions = db.prepare('SELECT * FROM quiz_questions WHERE quiz_id=? ORDER BY idx').all(original.id);
  let quizId;
  db.transaction(() => {
    const q = db.prepare('INSERT INTO quizzes (user_id, material_id, title, difficulty, created_at) VALUES (?,?,?,?,?)')
      .run(userId, original.material_id || null, `${shared.title_snapshot} Challenge`, original.difficulty || 'medium', nowIso());
    quizId = q.lastInsertRowid;
    const ins = db.prepare('INSERT INTO quiz_questions (quiz_id, idx, question, options_json, correct_idx, explanation, concept, source_chunk_ids_json) VALUES (?,?,?,?,?,?,?,?)');
    questions.forEach(row => ins.run(quizId, row.idx, row.question, row.options_json, row.correct_idx, row.explanation || '', row.concept || '', row.source_chunk_ids_json || '[]'));
  })();
  activity.addRoomActivity(roomId, userId, 'challenge_started', `Started quiz challenge: ${shared.title_snapshot}`, { relatedType: 'quiz', relatedId: quizId });
  return { quiz_id: quizId };
}

module.exports = {
  createRoom,
  getRoom,
  joinByCode,
  joinRoom,
  leaveRoom,
  listActivity,
  listMembers,
  listMessages,
  listRooms,
  postMessage,
  requireMembership,
  shareNote,
  shareQuiz,
  startSharedQuiz,
};
