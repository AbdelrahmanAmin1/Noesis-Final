'use strict';

const { getDb } = require('../config/db');

function nowIso() { return new Date().toISOString(); }

function cleanName(name) {
  return String(name || '').replace(/\s+/g, ' ').trim().slice(0, 80);
}

function recordConceptOutcome(userId, name, correct, opts = {}) {
  const concept = cleanName(name);
  if (!userId || !concept) return null;
  const correctDelta = Number.isFinite(opts.correctDelta) ? opts.correctDelta : 6;
  const incorrectDelta = Number.isFinite(opts.incorrectDelta) ? opts.incorrectDelta : -4;
  const delta = correct ? correctDelta : incorrectDelta;
  const db = getDb();
  db.prepare('INSERT OR IGNORE INTO concepts (user_id, name, mastery_pct) VALUES (?,?,0)').run(userId, concept);
  db.prepare(`
    UPDATE concepts
    SET mastery_pct = MAX(0, MIN(100, mastery_pct + ?)),
        last_reviewed_at = ?
    WHERE user_id=? AND name=?
  `).run(delta, nowIso(), userId, concept);
  return db.prepare('SELECT id, name, mastery_pct, last_reviewed_at FROM concepts WHERE user_id=? AND name=?').get(userId, concept);
}

module.exports = { recordConceptOutcome };
