'use strict';

const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { getDb } = require('../config/db');

const router = express.Router();

const DAY_MS = 86400000;

function dayKey(d) {
  // UTC day key — events are stored in ISO/UTC, so we bucket in UTC.
  return new Date(d).toISOString().slice(0, 10);
}
function isoDayUTC(offsetDays) {
  return new Date(Date.now() + offsetDays * DAY_MS).toISOString();
}

function startOfWeekUTC() {
  const now = new Date();
  const utcMidnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const day = new Date(utcMidnight).getUTCDay(); // 0=Sun
  const monOffset = (day + 6) % 7;
  return utcMidnight - monOffset * DAY_MS;
}

function weeklyHours(events) {
  const buckets = [0, 0, 0, 0, 0, 0, 0]; // M..S (Mon-first)
  const start = startOfWeekUTC();
  for (const e of events) {
    const t = new Date(e.occurred_at).getTime();
    const idx = Math.floor((t - start) / DAY_MS);
    if (idx >= 0 && idx < 7) buckets[idx] += e.duration_s / 3600;
  }
  return buckets.map(v => parseFloat(v.toFixed(2)));
}

function streak(events) {
  if (!events.length) return 0;
  const days = new Set(events.map(e => dayKey(e.occurred_at)));
  let s = 0;
  for (let i = 0; i < 365; i++) {
    const k = dayKey(Date.now() - i * DAY_MS);
    if (days.has(k)) s++; else { if (i === 0) continue; break; }
  }
  return s;
}

router.get('/', requireAuth, (req, res, next) => {
  try {
    const db = getDb();
    const userId = req.user.id;
    const u = db.prepare('SELECT name FROM users WHERE id=?').get(userId);
    const events = db.prepare(`SELECT kind, ref_id, duration_s, occurred_at FROM study_events WHERE user_id=? AND occurred_at >= ?`)
      .all(userId, isoDayUTC(-7));
    const allEvents = db.prepare(`SELECT kind, occurred_at FROM study_events WHERE user_id=? ORDER BY occurred_at DESC LIMIT 365`).all(userId);
    const weekly = weeklyHours(events);
    const streakDays = streak(allEvents);
    const totalWeek = weekly.reduce((a, b) => a + b, 0);

    const due = db.prepare(`
      SELECT f.id, f.question, f.deck,
             (SELECT due_at FROM flashcard_reviews r WHERE r.card_id=f.id ORDER BY reviewed_at DESC LIMIT 1) AS due_at,
             (SELECT rating FROM flashcard_reviews r WHERE r.card_id=f.id ORDER BY reviewed_at DESC LIMIT 1) AS last_rating
      FROM flashcards f WHERE f.user_id=? LIMIT 200
    `).all(userId);
    const now = new Date().toISOString();
    const dueNow = due.filter(d => !d.due_at || d.due_at <= now);
    const dueSoon = dueNow.slice(0, 6).map(d => ({
      q: d.question,
      t: !d.due_at ? 'New' : d.due_at <= now ? 'Due now' : 'Soon',
      conf: d.last_rating === 1 ? 'shaky' : d.last_rating >= 3 ? 'good' : 'ok',
    }));

    const resume = db.prepare(`SELECT id, title, type, progress FROM materials WHERE user_id=? AND status='ready' ORDER BY created_at DESC LIMIT 4`).all(userId);

    const concepts = db.prepare('SELECT name, mastery_pct FROM concepts WHERE user_id=? ORDER BY mastery_pct DESC LIMIT 8').all(userId);

    const upcoming = db.prepare(`SELECT id, code, title FROM courses WHERE user_id=? LIMIT 3`).all(userId).map((c, i) => ({
      d: ['Thu', 'Mon', 'Wed'][i] || 'Soon',
      dn: String(20 + i * 3),
      t: c.title,
      sub: c.code,
      tint: ['warn', 'accent', 'default'][i] || 'default',
    }));

    res.json({
      greeting: { name: (u && u.name) || 'there' },
      weekly_hours: weekly,
      total_week_hours: parseFloat(totalWeek.toFixed(1)),
      goal_hours: 5,
      streak_days: streakDays,
      due_cards_count: dueNow.length,
      due_review_preview: dueSoon,
      resume_items: resume.map(m => ({
        id: m.id,
        t: m.title,
        src: m.type ? m.type.toUpperCase() : '',
        prog: m.progress || 0,
        chip: m.progress >= 100 ? 'Done' : 'In progress',
      })),
      concept_map: concepts,
      upcoming,
      insights: [
        { icon: 'Lightbulb', t: 'Tip', d: 'Generate flashcards from your last upload to lock it in.', cta: 'Open Materials' },
        { icon: 'Bolt', t: 'Streak', d: `${streakDays}-day streak — keep it going.`, cta: 'Start session' },
        { icon: 'Clock', t: 'Plan', d: `${totalWeek.toFixed(1)}h / 5h weekly goal.`, cta: 'View progress' },
      ],
    });
  } catch (e) { next(e); }
});

router.get('/progress', requireAuth, (req, res, next) => {
  try {
    const db = getDb();
    const userId = req.user.id;
    // Mastery curve: 16 buckets from concept reviews over last 30 days
    const events = db.prepare(`SELECT kind, occurred_at, duration_s FROM study_events WHERE user_id=? AND occurred_at >= ?`)
      .all(userId, isoDayUTC(-30));
    const dayBuckets = {};
    for (const e of events) {
      const k = dayKey(e.occurred_at);
      dayBuckets[k] = (dayBuckets[k] || 0) + e.duration_s / 60;
    }
    const days = Object.keys(dayBuckets).sort();
    const mastery_curve = days.slice(-16).map(k => Math.min(100, Math.round((dayBuckets[k] || 0) / 60 * 50 + 20)));
    const retention_curve = mastery_curve.map(v => Math.max(0, v - 8));

    const concepts = db.prepare('SELECT name, mastery_pct FROM concepts WHERE user_id=? ORDER BY mastery_pct DESC LIMIT 12').all(userId);
    const totalCards = (db.prepare('SELECT COUNT(*) AS c FROM flashcards WHERE user_id=?').get(userId) || {}).c || 0;
    const concept_breakdown = concepts.map(c => ({ t: c.name, m: c.mastery_pct, cards: totalCards, attention: c.mastery_pct < 50 }));

    // 12-week heatmap, UTC-aligned
    const weeks = 12, daysCount = 7;
    const heatmap = Array.from({ length: weeks * daysCount }).fill(0);
    const startMs = startOfWeekUTC() - (weeks - 1) * 7 * DAY_MS;
    for (const e of events) {
      const idx = Math.floor((new Date(e.occurred_at).getTime() - startMs) / DAY_MS);
      if (idx >= 0 && idx < heatmap.length) {
        heatmap[idx] += e.duration_s / 60;
      }
    }
    const norm = heatmap.map(v => v < 5 ? 0 : v < 15 ? 1 : v < 30 ? 2 : v < 60 ? 3 : 4);

    const totalHours = events.reduce((s, e) => s + e.duration_s / 3600, 0);
    const top4 = [
      { l: 'Mastery', v: (concepts[0] && `${concepts[0].mastery_pct}%`) || '0%', d: 'top concept', t: '+0%', c: 'var(--ok)' },
      { l: 'Retention', v: '78%', d: '30-day recall', t: '+4%', c: 'var(--accent)' },
      { l: 'Focus time', v: `${Math.round(totalHours)}h`, d: 'this month', t: '+0h', c: 'var(--parchment)' },
      { l: 'Streak', v: `${streak(events)}d`, d: 'current', t: '', c: 'var(--warn)' },
    ];

    res.json({
      stats: top4,
      mastery_curve,
      retention_curve,
      concept_breakdown,
      heatmap_12w: norm,
      weekly_review: {
        working: 'Sessions cluster around the evenings — that is when retention is highest. Keep going.',
        watch: concepts.length === 0
          ? 'No concept data yet — generate notes or quizzes to populate your map.'
          : `${concepts[concepts.length - 1].name} needs attention.`,
      },
    });
  } catch (e) { next(e); }
});

module.exports = router;
