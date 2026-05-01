'use strict';

const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { getDb } = require('../config/db');

const router = express.Router();

const DAY_MS = 86400000;

function dayKey(d) {
  return new Date(d).toISOString().slice(0, 10);
}

function isoDayUTC(offsetDays) {
  return new Date(Date.now() + offsetDays * DAY_MS).toISOString();
}

function startOfWeekUTC() {
  const now = new Date();
  const utcMidnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const day = new Date(utcMidnight).getUTCDay();
  const monOffset = (day + 6) % 7;
  return utcMidnight - monOffset * DAY_MS;
}

function weeklyHours(events) {
  const buckets = [0, 0, 0, 0, 0, 0, 0];
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
    if (days.has(k)) s++;
    else {
      if (i === 0) continue;
      break;
    }
  }
  return s;
}

router.get('/', requireAuth, (req, res, next) => {
  try {
    const db = getDb();
    const userId = req.user.id;
    const u = db.prepare('SELECT name FROM users WHERE id=?').get(userId);
    const prefs = db.prepare('SELECT daily_minutes FROM user_prefs WHERE user_id=?').get(userId);
    const dailyMin = (prefs && prefs.daily_minutes) || 45;
    const goalH = parseFloat((dailyMin * 7 / 60).toFixed(1));
    const events = db.prepare('SELECT kind, ref_id, duration_s, occurred_at FROM study_events WHERE user_id=? AND occurred_at >= ?')
      .all(userId, isoDayUTC(-7));
    const allEvents = db.prepare('SELECT kind, occurred_at FROM study_events WHERE user_id=? ORDER BY occurred_at DESC LIMIT 365')
      .all(userId);
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

    const resume = db.prepare("SELECT id, title, type, progress FROM materials WHERE user_id=? AND status='ready' ORDER BY created_at DESC LIMIT 4").all(userId);
    const concepts = db.prepare('SELECT name, mastery_pct FROM concepts WHERE user_id=? ORDER BY mastery_pct DESC LIMIT 8').all(userId);
    const upcoming = db.prepare('SELECT id, code, title FROM courses WHERE user_id=? ORDER BY id ASC LIMIT 3').all(userId).map(c => ({
      d: 'Course',
      dn: c.code ? c.code.replace(/\D/g, '').slice(-2) || 'CS' : 'CS',
      t: c.title,
      sub: c.code,
      tint: 'default',
    }));

    const counts = {
      materials: (db.prepare('SELECT COUNT(*) AS c FROM materials WHERE user_id=?').get(userId) || {}).c || 0,
      notes: (db.prepare('SELECT COUNT(*) AS c FROM notes WHERE user_id=?').get(userId) || {}).c || 0,
      flashcards: (db.prepare('SELECT COUNT(*) AS c FROM flashcards WHERE user_id=?').get(userId) || {}).c || 0,
      quizzes: (db.prepare('SELECT COUNT(*) AS c FROM quizzes WHERE user_id=?').get(userId) || {}).c || 0,
      quizzes_completed: (db.prepare('SELECT COUNT(*) AS c FROM quiz_attempts WHERE user_id=? AND finished_at IS NOT NULL').get(userId) || {}).c || 0,
    };
    const avgRow = db.prepare('SELECT AVG(score) AS avg_score FROM quiz_attempts WHERE user_id=? AND finished_at IS NOT NULL').get(userId) || {};
    const averageScore = avgRow.avg_score == null ? null : Math.round(avgRow.avg_score);
    const weakTopics = db.prepare('SELECT name, mastery_pct FROM concepts WHERE user_id=? AND mastery_pct < 60 ORDER BY mastery_pct ASC, name ASC LIMIT 5').all(userId);
    const recentActivity = db.prepare(`
      SELECT e.kind, e.ref_id, e.duration_s, e.occurred_at,
        CASE e.kind
          WHEN 'reading' THEN COALESCE(
            (SELECT title FROM materials m WHERE m.id=e.ref_id AND m.user_id=e.user_id),
            (SELECT title FROM notes n WHERE n.id=e.ref_id AND n.user_id=e.user_id)
          )
          WHEN 'flashcard' THEN (SELECT COALESCE(topic, deck, question) FROM flashcards f WHERE f.id=e.ref_id AND f.user_id=e.user_id)
          WHEN 'quiz' THEN (
            SELECT q.title
            FROM quiz_attempts a JOIN quizzes q ON q.id=a.quiz_id
            WHERE a.id=e.ref_id AND a.user_id=e.user_id
          )
          ELSE NULL
        END AS title
      FROM study_events e
      WHERE e.user_id=?
      ORDER BY e.occurred_at DESC
      LIMIT 8
    `).all(userId);

    const insights = [];
    if (!counts.materials) {
      insights.push({ icon: 'Upload', t: 'Start', d: 'Upload an OOP or Data Structures material to unlock notes, cards, quizzes, and tutor sessions.', cta: 'Open Materials', route: 'materials' });
    } else if (!counts.notes) {
      insights.push({ icon: 'PenNib', t: 'Summarize', d: 'Generate exam-ready notes from your latest indexed material.', cta: 'Open Materials', route: 'materials' });
    }
    if (dueNow.length) {
      insights.push({ icon: 'Cards', t: 'Review due', d: `${dueNow.length} flashcard${dueNow.length === 1 ? '' : 's'} ready for spaced repetition.`, cta: 'Review now', route: 'flashcards' });
    } else if (counts.materials && !counts.flashcards) {
      insights.push({ icon: 'Cards', t: 'Make cards', d: 'Generate topic-tagged flashcards from a ready material.', cta: 'Open Materials', route: 'materials' });
    }
    if (weakTopics.length) {
      insights.push({ icon: 'Target', t: 'Weak topic', d: `${weakTopics[0].name} is the lowest mastery topic in your map.`, cta: 'Open Progress', route: 'progress' });
    }
    if (!insights.length) {
      insights.push({ icon: 'Bolt', t: 'Keep momentum', d: `${totalWeek.toFixed(1)}h logged toward your ${goalH}h weekly target.`, cta: 'Start session', route: 'tutor' });
    }

    res.json({
      greeting: { name: (u && u.name) || 'there' },
      weekly_hours: weekly,
      total_week_hours: parseFloat(totalWeek.toFixed(1)),
      goal_hours: goalH,
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
      summary: {
        ...counts,
        avg_score: averageScore,
        average_score: averageScore,
        weak_topics: weakTopics,
      },
      recent_activity: recentActivity,
      insights,
    });
  } catch (e) { next(e); }
});

router.get('/progress', requireAuth, (req, res, next) => {
  try {
    const db = getDb();
    const userId = req.user.id;
    const events = db.prepare('SELECT kind, occurred_at, duration_s FROM study_events WHERE user_id=? AND occurred_at >= ?')
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
    const cardCounts = Object.fromEntries(db.prepare(`
      SELECT COALESCE(topic, deck, 'General') AS topic, COUNT(*) AS count
      FROM flashcards WHERE user_id=? GROUP BY COALESCE(topic, deck, 'General')
    `).all(userId).map(r => [r.topic, r.count]));
    const concept_breakdown = concepts.map(c => ({ t: c.name, m: c.mastery_pct, cards: cardCounts[c.name] || 0, attention: c.mastery_pct < 50 }));

    const weeks = 12;
    const daysCount = 7;
    const heatmap = Array.from({ length: weeks * daysCount }).fill(0);
    const startMs = startOfWeekUTC() - (weeks - 1) * 7 * DAY_MS;
    for (const e of events) {
      const idx = Math.floor((new Date(e.occurred_at).getTime() - startMs) / DAY_MS);
      if (idx >= 0 && idx < heatmap.length) heatmap[idx] += e.duration_s / 60;
    }
    const norm = heatmap.map(v => v < 5 ? 0 : v < 15 ? 1 : v < 30 ? 2 : v < 60 ? 3 : 4);

    const totalHours = events.reduce((s, e) => s + e.duration_s / 3600, 0);
    const reviewRows = db.prepare('SELECT rating FROM flashcard_reviews WHERE user_id=? AND reviewed_at >= ?').all(userId, isoDayUTC(-30));
    const retentionPct = reviewRows.length > 0
      ? Math.round(reviewRows.filter(r => r.rating >= 3).length / reviewRows.length * 100)
      : 0;
    const top4 = [
      { l: 'Mastery', v: (concepts[0] && `${concepts[0].mastery_pct}%`) || '0%', d: 'top concept', t: '', c: 'var(--ok)' },
      { l: 'Retention', v: `${retentionPct}%`, d: '30-day recall', t: '', c: 'var(--accent)' },
      { l: 'Focus time', v: `${Math.round(totalHours)}h`, d: 'this month', t: '', c: 'var(--parchment)' },
      { l: 'Streak', v: `${streak(events)}d`, d: 'current', t: '', c: 'var(--warn)' },
    ];

    res.json({
      stats: top4,
      mastery_curve,
      retention_curve,
      concept_breakdown,
      heatmap_12w: norm,
      weekly_review: {
        working: events.length
          ? `${events.length} study action${events.length === 1 ? '' : 's'} logged in the last 30 days.`
          : 'No study activity logged yet. Upload material or start a tutor session to begin tracking.',
        watch: concepts.length === 0
          ? 'No concept data yet. Generate notes, flashcards, or quizzes to populate your map.'
          : `${concepts[concepts.length - 1].name} is currently your lowest mastery topic.`,
      },
    });
  } catch (e) { next(e); }
});

module.exports = router;
