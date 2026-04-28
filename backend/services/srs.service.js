'use strict';

// Lightweight SM-2 implementation
// rating: 1=again, 2=hard, 3=good, 4=easy
// Returns { ease, interval_days, reps, due_at }

const DAY_MS = 86400000;

function nowIso(d = new Date()) { return d.toISOString(); }

function nextSchedule(prev, rating) {
  let ease = (prev && prev.ease) || 2.5;
  let reps = (prev && prev.reps) || 0;
  let interval;
  if (rating <= 1) {
    reps = 0;
    interval = 1 / 24; // 1 hour
    ease = Math.max(1.3, ease - 0.2);
  } else {
    if (reps === 0) interval = 1;
    else if (reps === 1) interval = 3;
    else interval = (prev && prev.interval_days ? prev.interval_days : 1) * ease;
    if (rating === 2) { ease = Math.max(1.3, ease - 0.15); interval = Math.max(1, interval * 0.6); }
    else if (rating === 3) { /* keep ease */ }
    else if (rating >= 4) { ease = ease + 0.1; interval = interval * 1.3; }
    reps += 1;
  }
  const due = new Date(Date.now() + interval * DAY_MS);
  return { ease: parseFloat(ease.toFixed(3)), interval_days: parseFloat(interval.toFixed(3)), reps, due_at: nowIso(due) };
}

module.exports = { nextSchedule };
