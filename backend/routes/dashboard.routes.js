'use strict';

const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { getDb } = require('../config/db');
const learningMaps = require('../services/learning-map.service');
const studyPlans = require('../services/study-plan.service');
const gamification = require('../services/gamification.service');
const leaderboards = require('../services/leaderboard.service');
const { getGoalProfile, publicGoalProfile } = require('../services/goal-profile.service');

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

function dashboardCopy(goalProfile, { dueCount, totalWeek, goalH }) {
  if (goalProfile.id === 'retain' && dueCount > 0) {
    return {
      title: `You have ${dueCount} card${dueCount === 1 ? '' : 's'} due — lock them in before moving on.`,
      subtitle: `${goalProfile.dashboardBias} You're at ${totalWeek.toFixed(1)}h this week of ${goalH}h goal.`,
    };
  }
  const titles = {
    exams: 'Exam mode: turn today into a checkpoint.',
    understand: 'Deep mode: clear one concept gap today.',
    retain: 'Retention mode: keep the memory loop alive.',
    practice: 'Practice mode: expose one mistake and fix it.',
  };
  return {
    title: titles[goalProfile.id] || titles.exams,
    subtitle: `${goalProfile.dashboardBias} You're at ${totalWeek.toFixed(1)}h this week of ${goalH}h goal.`,
  };
}

function buildGoalRecommendation(goalProfile, { latestMaterial, nextFocus, dueCount, counts, weakTopics }) {
  if (!counts.materials) {
    return {
      title: 'Upload your first material',
      description: 'Add a source first so Noesis can recommend a goal-specific next step.',
      cta: 'Upload material',
      route: 'materials',
      action: 'upload_material',
      reason: 'Noesis needs source material before it can personalize your recommendations.',
    };
  }
  const topic = (weakTopics[0] && weakTopics[0].name) || nextFocus || (latestMaterial && latestMaterial.title) || 'this material';
  const materialId = latestMaterial && latestMaterial.id;
  const materialTitle = latestMaterial && latestMaterial.title;
  if (goalProfile.id === 'retain') {
    return dueCount > 0
      ? {
          title: 'Review due flashcards',
          description: `${dueCount} card${dueCount === 1 ? '' : 's'} are ready for spaced recall.`,
          cta: 'Review cards',
          route: 'flashcards',
          action: 'review_flashcards',
          reason: `Because you chose ${goalProfile.label}, recall comes before new material.`,
        }
      : {
          title: 'Generate flashcards from this material',
          description: materialTitle ? `Turn ${materialTitle} into a spaced-review deck.` : 'Turn your newest material into a spaced-review deck.',
          cta: 'Generate flashcards',
          route: 'material',
          action: 'generate_flashcards',
          material_id: materialId,
          reason: `Because you chose ${goalProfile.label}, Noesis should build recall cards first.`,
        };
  }
  if (goalProfile.id === 'understand') {
    return {
      title: `Tutor deep dive: ${topic}`,
      description: materialTitle ? `Use ${materialTitle} for a guided explanation and follow-up questions.` : 'Start a guided explanation and follow-up questions.',
      cta: 'Study with tutor',
      route: 'tutor',
      action: 'start_tutor',
      material_id: materialId,
      topic,
      reason: `Because you chose ${goalProfile.label}, Noesis should attack concept gaps first.`,
    };
  }
  if (goalProfile.id === 'practice') {
    return {
      title: `Generate a practice quiz: ${topic}`,
      description: materialTitle ? `Use ${materialTitle} to expose mistakes and review them right away.` : 'Create a short practice quiz to expose mistakes.',
      cta: 'Generate practice quiz',
      route: 'material',
      action: 'generate_quiz',
      material_id: materialId,
      reason: `Because you chose ${goalProfile.label}, practice sets come first.`,
    };
  }
  return {
    title: `Generate an exam-style quiz: ${topic}`,
    description: materialTitle ? `Turn ${materialTitle} into a checkpoint for exam prep.` : 'Create a checkpoint from your newest material.',
    cta: 'Generate quiz',
    route: 'material',
    action: 'generate_quiz',
    material_id: materialId,
    reason: `Because you chose ${goalProfile.label}, checkpoints and weak-topic review come first.`,
  };
}

function buildGoalRecommendations(goalProfile, context) {
  const primary = buildGoalRecommendation(goalProfile, context);
  const recommendations = [primary];
  if (context.activePlan) {
    recommendations.push({
      title: `Continue study plan: ${context.nextFocus}`,
      description: 'Your existing plan is still available, but the goal recommendation stays first.',
      cta: 'Open study plan',
      route: 'study-plan',
      action: 'continue_plan',
      reason: `This is secondary so it does not hide your ${goalProfile.label} recommendation.`,
    });
  }
  return recommendations;
}

function recommendationAsAction(rec) {
  return {
    title: rec.title,
    label: rec.cta || rec.title,
    route: rec.route,
    action: rec.action,
    material_id: rec.material_id,
    topic: rec.topic,
    reason: rec.reason,
  };
}

function goalInsights(goalProfile, { counts, dueNow, weakTopics, totalWeek, goalH, goalRecommendations }) {
  const shared = [];
  if (!counts.materials) {
    return [{ icon: 'Upload', t: 'Start', d: 'Upload material to unlock goal-aware notes, cards, quizzes, and tutor sessions.', cta: 'Open Materials', route: 'materials' }];
  }
  if (!counts.notes) {
    shared.push({ icon: 'PenNib', t: goalProfile.id === 'exams' ? 'Exam notes' : 'Summarize', d: 'Generate polished notes from your latest indexed material.', cta: 'Open Materials', route: 'materials' });
  }
  const dueText = `${dueNow.length} flashcard${dueNow.length === 1 ? '' : 's'} ready for spaced repetition.`;
  const byGoal = {
    exams: [
      { icon: 'Target', t: 'Quiz checkpoint', d: weakTopics.length ? `Turn ${weakTopics[0].name} into a quick exam-style checkpoint.` : 'Generate or continue a quiz to check exam readiness.', cta: 'Open Quizzes', route: 'quizzes' },
      ...(weakTopics.length ? [{ icon: 'Target', t: 'Weak topic', d: `${weakTopics[0].name} is your lowest mastery topic.`, cta: 'Open Progress', route: 'progress' }] : []),
      ...(dueNow.length ? [{ icon: 'Cards', t: 'Review due', d: dueText, cta: 'Review now', route: 'flashcards' }] : []),
    ],
    understand: [
      { icon: 'Brain', t: 'Tutor deep dive', d: weakTopics.length ? `Use the tutor to unpack ${weakTopics[0].name}.` : 'Start a tutor session to test your explanations.', cta: 'Start tutor', route: 'tutor' },
      ...(weakTopics.length ? [{ icon: 'Target', t: 'Concept gap', d: `${weakTopics[0].name} needs the most attention on your map.`, cta: 'Open Progress', route: 'progress' }] : []),
      ...(dueNow.length ? [{ icon: 'Cards', t: 'Review due', d: dueText, cta: 'Review now', route: 'flashcards' }] : []),
    ],
    retain: [
      ...(dueNow.length ? [{ icon: 'Cards', t: 'Review due', d: dueText, cta: 'Review now', route: 'flashcards' }] : [{ icon: 'Cards', t: 'Build recall', d: 'Generate flashcards so spaced review has something to schedule.', cta: 'Open Materials', route: 'materials' }]),
      { icon: 'Bookmark', t: 'Spaced review', d: 'Keep recall active before adding more new material.', cta: 'Open Flashcards', route: 'flashcards' },
      ...(weakTopics.length ? [{ icon: 'Target', t: 'Weak recall', d: `${weakTopics[0].name} is a good candidate for new cards.`, cta: 'Open Progress', route: 'progress' }] : []),
    ],
    practice: [
      { icon: 'Bolt', t: 'Practice set', d: weakTopics.length ? `Drill ${weakTopics[0].name} and review mistakes right after.` : 'Run a quiz to expose the next weak spot.', cta: 'Practice now', route: 'quizzes' },
      ...(weakTopics.length ? [{ icon: 'Target', t: 'Mistake review', d: `${weakTopics[0].name} is the best place to practice next.`, cta: 'Open Progress', route: 'progress' }] : []),
      ...(dueNow.length ? [{ icon: 'Cards', t: 'Review due', d: dueText, cta: 'Review now', route: 'flashcards' }] : []),
    ],
  };
  const primary = goalRecommendations && goalRecommendations[0]
    ? [{ icon: goalProfile.icon, t: goalRecommendations[0].title, d: goalRecommendations[0].description, cta: goalRecommendations[0].cta, route: goalRecommendations[0].route, action: goalRecommendations[0].action, material_id: goalRecommendations[0].material_id, reason: goalRecommendations[0].reason }]
    : [];
  const picked = [...primary, ...(byGoal[goalProfile.id] || byGoal.exams), ...shared];
  if (!picked.length) {
    picked.push({ icon: goalProfile.icon, t: goalProfile.shortLabel, d: `${totalWeek.toFixed(1)}h logged toward your ${goalH}h weekly target.`, cta: goalProfile.primaryCta, route: goalProfile.primaryRoute });
  }
  return picked.slice(0, 3);
}

router.get('/', requireAuth, (req, res, next) => {
  try {
    const db = getDb();
    const userId = req.user.id;
    const u = db.prepare('SELECT name FROM users WHERE id=?').get(userId);
    const prefs = db.prepare('SELECT goal, daily_minutes FROM user_prefs WHERE user_id=?').get(userId);
    const goalProfile = getGoalProfile(prefs && prefs.goal);
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
      FROM flashcards f
      LEFT JOIN flashcard_generations g ON g.id=f.generation_id
      WHERE f.user_id=? AND (g.is_active=1 OR f.generation_id IS NULL)
      LIMIT 200
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
      flashcards: (db.prepare(`SELECT COUNT(*) AS c FROM flashcards f
                              LEFT JOIN flashcard_generations g ON g.id=f.generation_id
                              WHERE f.user_id=? AND (g.is_active=1 OR f.generation_id IS NULL)`).get(userId) || {}).c || 0,
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

    const activePlan = studyPlans.getPlan(userId);
    const learningMap = learningMaps.buildLearningMap(userId);
    const nextFocus = (activePlan && activePlan.plan && activePlan.plan.dailyPlan && activePlan.plan.dailyPlan[0] && activePlan.plan.dailyPlan[0].focusTopic)
      || (weakTopics[0] && weakTopics[0].name)
      || learningMap.startHere;
    const goalRecommendations = buildGoalRecommendations(goalProfile, {
      activePlan,
      latestMaterial: resume[0] || null,
      nextFocus,
      dueCount: dueNow.length,
      counts,
      weakTopics,
    });
    const nextRecommendedAction = recommendationAsAction(goalRecommendations[0]);
    const insights = goalInsights(goalProfile, { counts, dueNow, weakTopics, totalWeek, goalH, goalRecommendations });
    const hero = dashboardCopy(goalProfile, { dueCount: dueNow.length, totalWeek, goalH });
    const gamificationSummary = gamification.getSummary(userId);
    const leaderboardPreview = leaderboards.weekly(userId, 5).leaderboard;

    res.json({
      greeting: { name: (u && u.name) || 'there' },
      weekly_hours: weekly,
      total_week_hours: parseFloat(totalWeek.toFixed(1)),
      goal_hours: goalH,
      goal_profile: publicGoalProfile(goalProfile.id),
      dashboard_copy: hero,
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
      learning_map: learningMap,
      active_study_plan: activePlan,
      next_recommended_action: nextRecommendedAction,
      goal_recommendations: goalRecommendations,
      upcoming,
      summary: {
        ...counts,
        avg_score: averageScore,
        average_score: averageScore,
        weak_topics: weakTopics,
      },
      gamification: gamificationSummary,
      leaderboard_preview: leaderboardPreview,
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
      SELECT COALESCE(f.topic, f.deck, 'General') AS topic, COUNT(*) AS count
      FROM flashcards f
      LEFT JOIN flashcard_generations g ON g.id=f.generation_id
      WHERE f.user_id=? AND (g.is_active=1 OR f.generation_id IS NULL)
      GROUP BY COALESCE(f.topic, f.deck, 'General')
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

    const gamificationSummary = gamification.getSummary(userId);
    res.json({
      stats: top4,
      mastery_curve,
      retention_curve,
      concept_breakdown,
      heatmap_12w: norm,
      gamification: gamificationSummary,
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
