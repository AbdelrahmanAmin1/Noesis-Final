'use strict';

const { getDb } = require('../config/db');
const { HttpError } = require('../middleware/error');
const gamification = require('./gamification.service');

function nowIso() { return new Date().toISOString(); }

function profileRow(row) {
  if (!row) return null;
  return {
    user_id: row.user_id || row.id,
    display_name: row.display_name || row.name || `Student ${row.user_id || row.id}`,
    level: gamification.levelFromXp(Number(row.total_xp || 0)),
    total_xp: Number(row.total_xp || 0),
    badges_count: Number(row.badges_count || 0),
    relationship: row.relationship || null,
  };
}

function friendshipExists(userId, friendId) {
  return !!getDb().prepare('SELECT 1 FROM friendships WHERE user_id=? AND friend_id=?').get(userId, friendId);
}

function pendingRequestBetween(a, b) {
  return getDb().prepare(`
    SELECT *
    FROM friend_requests
    WHERE status='pending'
      AND ((requester_id=? AND recipient_id=?) OR (requester_id=? AND recipient_id=?))
    ORDER BY created_at DESC
    LIMIT 1
  `).get(a, b, b, a);
}

function searchUsers(userId, query) {
  gamification.ensureUser(userId);
  const q = String(query || '').trim();
  if (q.length < 2) return [];
  const like = `%${q.toLowerCase()}%`;
  const rows = getDb().prepare(`
    SELECT u.id, p.display_name, COALESCE(ux.total_xp, 0) AS total_xp,
           COUNT(DISTINCT ua.id) AS badges_count,
           CASE
             WHEN f.friend_id IS NOT NULL THEN 'friend'
             WHEN fr_out.id IS NOT NULL THEN 'request_sent'
             WHEN fr_in.id IS NOT NULL THEN 'request_received'
             ELSE 'none'
           END AS relationship
    FROM users u
    JOIN user_profiles p ON p.user_id=u.id
    LEFT JOIN user_xp ux ON ux.user_id=u.id
    LEFT JOIN user_achievements ua ON ua.user_id=u.id
    LEFT JOIN friendships f ON f.user_id=? AND f.friend_id=u.id
    LEFT JOIN friend_requests fr_out ON fr_out.requester_id=? AND fr_out.recipient_id=u.id AND fr_out.status='pending'
    LEFT JOIN friend_requests fr_in ON fr_in.recipient_id=? AND fr_in.requester_id=u.id AND fr_in.status='pending'
    WHERE u.id <> ?
      AND (lower(p.display_name) LIKE ? OR lower(u.email) LIKE ?)
    GROUP BY u.id
    ORDER BY relationship <> 'friend', p.display_name ASC
    LIMIT 12
  `).all(userId, userId, userId, userId, like, like);
  return rows.map(profileRow);
}

function sendRequest(userId, recipientId) {
  gamification.ensureUser(userId);
  gamification.ensureUser(recipientId);
  const targetId = parseInt(recipientId, 10);
  if (!targetId) throw new HttpError(400, 'invalid_recipient');
  if (targetId === userId) throw new HttpError(400, 'cannot_friend_self');
  const db = getDb();
  const recipient = db.prepare('SELECT id FROM users WHERE id=?').get(targetId);
  if (!recipient) throw new HttpError(404, 'user_not_found');
  if (friendshipExists(userId, targetId)) throw new HttpError(409, 'already_friends');
  if (pendingRequestBetween(userId, targetId)) throw new HttpError(409, 'friend_request_pending');
  const info = db.prepare(`
    INSERT INTO friend_requests (requester_id, recipient_id, status, created_at)
    VALUES (?,?,?,?)
  `).run(userId, targetId, 'pending', nowIso());
  return { id: info.lastInsertRowid, requester_id: userId, recipient_id: targetId, status: 'pending' };
}

function listRequests(userId) {
  gamification.ensureUser(userId);
  const db = getDb();
  const incoming = db.prepare(`
    SELECT fr.*, p.display_name, COALESCE(ux.total_xp, 0) AS total_xp
    FROM friend_requests fr
    JOIN user_profiles p ON p.user_id=fr.requester_id
    LEFT JOIN user_xp ux ON ux.user_id=fr.requester_id
    WHERE fr.recipient_id=? AND fr.status='pending'
    ORDER BY fr.created_at DESC
  `).all(userId).map(row => ({ ...row, requester: profileRow({ user_id: row.requester_id, display_name: row.display_name, total_xp: row.total_xp }) }));
  const outgoing = db.prepare(`
    SELECT fr.*, p.display_name, COALESCE(ux.total_xp, 0) AS total_xp
    FROM friend_requests fr
    JOIN user_profiles p ON p.user_id=fr.recipient_id
    LEFT JOIN user_xp ux ON ux.user_id=fr.recipient_id
    WHERE fr.requester_id=? AND fr.status='pending'
    ORDER BY fr.created_at DESC
  `).all(userId).map(row => ({ ...row, recipient: profileRow({ user_id: row.recipient_id, display_name: row.display_name, total_xp: row.total_xp }) }));
  return { incoming, outgoing };
}

function acceptRequest(userId, requestId) {
  gamification.ensureUser(userId);
  const db = getDb();
  const id = parseInt(requestId, 10);
  const req = db.prepare('SELECT * FROM friend_requests WHERE id=?').get(id);
  if (!req) throw new HttpError(404, 'friend_request_not_found');
  if (req.recipient_id !== userId) throw new HttpError(403, 'not_request_recipient');
  if (req.status !== 'pending') throw new HttpError(409, 'friend_request_not_pending');
  const acceptedAt = nowIso();
  db.transaction(() => {
    db.prepare("UPDATE friend_requests SET status='accepted', responded_at=? WHERE id=?").run(acceptedAt, id);
    db.prepare('INSERT OR IGNORE INTO friendships (user_id, friend_id, created_at) VALUES (?,?,?)')
      .run(req.requester_id, req.recipient_id, acceptedAt);
    db.prepare('INSERT OR IGNORE INTO friendships (user_id, friend_id, created_at) VALUES (?,?,?)')
      .run(req.recipient_id, req.requester_id, acceptedAt);
  })();
  gamification.checkAchievements(req.requester_id);
  gamification.checkAchievements(req.recipient_id);
  return { ok: true };
}

function rejectRequest(userId, requestId) {
  gamification.ensureUser(userId);
  const id = parseInt(requestId, 10);
  const db = getDb();
  const req = db.prepare('SELECT * FROM friend_requests WHERE id=?').get(id);
  if (!req) throw new HttpError(404, 'friend_request_not_found');
  if (req.recipient_id !== userId) throw new HttpError(403, 'not_request_recipient');
  if (req.status !== 'pending') throw new HttpError(409, 'friend_request_not_pending');
  db.prepare("UPDATE friend_requests SET status='rejected', responded_at=? WHERE id=?").run(nowIso(), id);
  return { ok: true };
}

function listFriends(userId) {
  gamification.ensureUser(userId);
  const rows = getDb().prepare(`
    SELECT f.friend_id AS user_id, f.created_at, p.display_name, COALESCE(ux.total_xp, 0) AS total_xp,
           COUNT(DISTINCT ua.id) AS badges_count
    FROM friendships f
    JOIN user_profiles p ON p.user_id=f.friend_id
    LEFT JOIN user_xp ux ON ux.user_id=f.friend_id
    LEFT JOIN user_achievements ua ON ua.user_id=f.friend_id
    WHERE f.user_id=?
    GROUP BY f.friend_id
    ORDER BY p.display_name ASC
  `).all(userId);
  return rows.map(row => ({ ...profileRow(row), created_at: row.created_at }));
}

function removeFriend(userId, friendId) {
  const targetId = parseInt(friendId, 10);
  if (!targetId) throw new HttpError(400, 'invalid_friend');
  const db = getDb();
  const info = db.transaction(() => {
    const a = db.prepare('DELETE FROM friendships WHERE user_id=? AND friend_id=?').run(userId, targetId);
    const b = db.prepare('DELETE FROM friendships WHERE user_id=? AND friend_id=?').run(targetId, userId);
    return a.changes + b.changes;
  })();
  return { ok: info > 0 };
}

module.exports = {
  acceptRequest,
  listFriends,
  listRequests,
  rejectRequest,
  removeFriend,
  searchUsers,
  sendRequest,
};
