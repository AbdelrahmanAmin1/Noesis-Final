'use strict';

const { getDb } = require('../config/db');

function nowIso() { return new Date().toISOString(); }

function parseJson(text, fallback = {}) {
  try { return text ? JSON.parse(text) : fallback; } catch (_) { return fallback; }
}

function addRoomActivity(roomId, userId, activityType, summary, opts = {}) {
  const db = getDb();
  const info = db.prepare(`
    INSERT INTO study_room_activity
      (room_id, user_id, activity_type, related_type, related_id, summary, metadata_json, created_at)
    VALUES (?,?,?,?,?,?,?,?)
  `).run(
    roomId,
    userId || null,
    activityType,
    opts.relatedType || null,
    opts.relatedId == null ? null : opts.relatedId,
    String(summary || '').replace(/\s+/g, ' ').trim().slice(0, 240),
    JSON.stringify(opts.metadata || {}),
    opts.createdAt || nowIso()
  );
  return db.prepare('SELECT * FROM study_room_activity WHERE id=?').get(info.lastInsertRowid);
}

function listRoomActivity(roomId, limit = 40) {
  const n = Math.min(100, Math.max(1, parseInt(limit || 40, 10)));
  const rows = getDb().prepare(`
    SELECT a.id, a.room_id, a.user_id, a.activity_type, a.related_type, a.related_id,
           a.summary, a.metadata_json, a.created_at,
           COALESCE(p.display_name, u.name, 'Someone') AS display_name
    FROM study_room_activity a
    LEFT JOIN users u ON u.id=a.user_id
    LEFT JOIN user_profiles p ON p.user_id=a.user_id
    WHERE a.room_id=?
    ORDER BY a.created_at DESC, a.id DESC
    LIMIT ?
  `).all(roomId, n);
  return rows.map(row => ({
    id: row.id,
    room_id: row.room_id,
    user_id: row.user_id,
    display_name: row.display_name,
    activity_type: row.activity_type,
    related_type: row.related_type,
    related_id: row.related_id,
    summary: row.summary,
    metadata: parseJson(row.metadata_json, {}),
    created_at: row.created_at,
  }));
}

module.exports = { addRoomActivity, listRoomActivity };
