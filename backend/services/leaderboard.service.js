'use strict';

const { getDb } = require('../config/db');
const gamification = require('./gamification.service');
const { HttpError } = require('../middleware/error');

function startOfWeekIso() {
  const now = new Date();
  const utcMidnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const day = new Date(utcMidnight).getUTCDay();
  const monOffset = (day + 6) % 7;
  return new Date(utcMidnight - monOffset * 86400000).toISOString();
}

function rankRows(rows, currentUserId, xpKey = 'xp') {
  return rows
    .sort((a, b) => Number(b[xpKey] || 0) - Number(a[xpKey] || 0) || a.user_id - b.user_id)
    .map((row, index) => ({
      rank: index + 1,
      user_id: row.user_id,
      display_name: row.display_name || `Student ${row.user_id}`,
      level: gamification.levelFromXp(Number(row.total_xp || row.xp || 0)),
      xp: Number(row[xpKey] || 0),
      total_xp: Number(row.total_xp || row.xp || 0),
      streak: Number(row.streak || 0),
      badges_count: Number(row.badges_count || 0),
      is_current_user: row.user_id === currentUserId,
    }));
}

function global(userId, limit = 20) {
  gamification.ensureUser(userId);
  const rows = getDb().prepare(`
    SELECT ux.user_id, ux.total_xp AS xp, ux.total_xp, p.display_name,
           COALESCE(s.current_streak, 0) AS streak,
           COUNT(ua.id) AS badges_count
    FROM user_xp ux
    JOIN user_profiles p ON p.user_id=ux.user_id
    LEFT JOIN user_streaks s ON s.user_id=ux.user_id
    LEFT JOIN user_achievements ua ON ua.user_id=ux.user_id
    WHERE COALESCE(p.leaderboard_opt_out, 0)=0
    GROUP BY ux.user_id
    ORDER BY ux.total_xp DESC, ux.user_id ASC
    LIMIT ?
  `).all(Math.min(100, Math.max(1, parseInt(limit || 20, 10))));
  return { leaderboard: rankRows(rows, userId), scope: 'global' };
}

function weekly(userId, limit = 20) {
  gamification.ensureUser(userId);
  const weekStart = startOfWeekIso();
  const rows = getDb().prepare(`
    SELECT u.id AS user_id, COALESCE(wx.weekly_xp, 0) AS weekly_xp,
           COALESCE(ux.total_xp, 0) AS total_xp, p.display_name,
           COALESCE(s.current_streak, 0) AS streak,
           COALESCE(b.badges_count, 0) AS badges_count
    FROM users u
    JOIN user_profiles p ON p.user_id=u.id
    LEFT JOIN user_xp ux ON ux.user_id=u.id
    LEFT JOIN user_streaks s ON s.user_id=u.id
    LEFT JOIN (
      SELECT user_id, SUM(points) AS weekly_xp
      FROM xp_events
      WHERE created_at >= ?
      GROUP BY user_id
    ) wx ON wx.user_id=u.id
    LEFT JOIN (
      SELECT user_id, COUNT(*) AS badges_count
      FROM user_achievements
      GROUP BY user_id
    ) b ON b.user_id=u.id
    WHERE COALESCE(p.leaderboard_opt_out, 0)=0
      AND (COALESCE(wx.weekly_xp, 0) > 0 OR u.id=?)
    ORDER BY weekly_xp DESC, u.id ASC
    LIMIT ?
  `).all(weekStart, userId, Math.min(100, Math.max(1, parseInt(limit || 20, 10))));
  return {
    leaderboard: rankRows(rows.map(r => ({ ...r, xp: r.weekly_xp })), userId),
    scope: 'weekly',
    week_start: weekStart,
  };
}

function friends(userId, limit = 20) {
  gamification.ensureUser(userId);
  const rows = getDb().prepare(`
    SELECT ux.user_id, ux.total_xp AS xp, ux.total_xp, p.display_name,
           COALESCE(s.current_streak, 0) AS streak,
           COUNT(ua.id) AS badges_count
    FROM user_xp ux
    JOIN user_profiles p ON p.user_id=ux.user_id
    LEFT JOIN user_streaks s ON s.user_id=ux.user_id
    LEFT JOIN user_achievements ua ON ua.user_id=ux.user_id
    WHERE ux.user_id=? OR ux.user_id IN (SELECT friend_id FROM friendships WHERE user_id=?)
    GROUP BY ux.user_id
    ORDER BY ux.total_xp DESC, ux.user_id ASC
    LIMIT ?
  `).all(userId, userId, Math.min(100, Math.max(1, parseInt(limit || 20, 10))));
  return { leaderboard: rankRows(rows, userId), scope: 'friends' };
}

function room(userId, roomId, limit = 50) {
  gamification.ensureUser(userId);
  const db = getDb();
  const member = db.prepare('SELECT role FROM study_room_members WHERE room_id=? AND user_id=?').get(roomId, userId);
  if (!member) throw new HttpError(403, 'room_membership_required');
  const rows = db.prepare(`
    SELECT m.user_id, p.display_name,
           COALESCE(rx.room_xp, 0) AS room_xp,
           COALESCE(ux.total_xp, 0) AS total_xp,
           COALESCE(s.current_streak, 0) AS streak,
           COALESCE(b.badges_count, 0) AS badges_count
    FROM study_room_members m
    JOIN user_profiles p ON p.user_id=m.user_id
    LEFT JOIN user_xp ux ON ux.user_id=m.user_id
    LEFT JOIN user_streaks s ON s.user_id=m.user_id
    LEFT JOIN (
      SELECT user_id, SUM(points) AS room_xp
      FROM xp_events
      WHERE room_id=?
      GROUP BY user_id
    ) rx ON rx.user_id=m.user_id
    LEFT JOIN (
      SELECT user_id, COUNT(*) AS badges_count
      FROM user_achievements
      GROUP BY user_id
    ) b ON b.user_id=m.user_id
    WHERE m.room_id=?
    ORDER BY room_xp DESC, ux.total_xp DESC, m.user_id ASC
    LIMIT ?
  `).all(roomId, roomId, Math.min(100, Math.max(1, parseInt(limit || 50, 10))));
  return { leaderboard: rankRows(rows.map(r => ({ ...r, xp: r.room_xp })), userId), scope: 'room', room_id: roomId };
}

module.exports = { friends, global, room, weekly };
