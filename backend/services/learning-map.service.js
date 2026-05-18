'use strict';

const { getDb } = require('../config/db');

function nowIso() { return new Date().toISOString(); }

const PATHS = {
  oop: ['Class', 'Object', 'Encapsulation', 'Inheritance', 'Polymorphism', 'Interfaces', 'Abstract Classes', 'SOLID'],
  ds: ['Arrays', 'Linked List', 'Stack', 'Queue', 'Binary Search Tree', 'Hash Table', 'Graph', 'Big-O'],
  algorithms: ['Big-O', 'Search', 'Sorting', 'Recursion', 'Tree Traversal', 'Graph Traversal'],
};

function normalizeTopic(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function subjectPath(subject) {
  const s = String(subject || '').toLowerCase();
  if (/data|algorithm|ds/.test(s)) return PATHS.ds;
  if (/oop|object|java/.test(s)) return PATHS.oop;
  return [...PATHS.oop.slice(0, 5), ...PATHS.ds.slice(0, 6)];
}

function statusFor(topic, conceptMap) {
  const row = conceptMap.get(topic.toLowerCase());
  const mastery = row ? Number(row.mastery_pct || 0) : 0;
  if (mastery >= 80) return 'mastered';
  if (mastery >= 45) return 'in_progress';
  if (row) return 'weak';
  return 'not_started';
}

function typeFor(topic, index, weakSet) {
  if (weakSet.has(topic.toLowerCase())) return 'weak';
  if (index === 0) return 'prerequisite';
  if (index <= 4) return 'core';
  return 'recommended';
}

function buildLearningMap(userId, opts = {}) {
  const db = getDb();
  const prefs = db.prepare('SELECT * FROM user_prefs WHERE user_id=?').get(userId) || {};
  const concepts = db.prepare('SELECT name, mastery_pct FROM concepts WHERE user_id=? ORDER BY mastery_pct ASC, name ASC').all(userId);
  const wrong = db.prepare(`
    SELECT qq.concept, COUNT(*) AS misses
    FROM quiz_answers qa
    JOIN quiz_questions qq ON qq.id=qa.question_id
    JOIN quiz_attempts at ON at.id=qa.attempt_id
    WHERE at.user_id=? AND qa.is_correct=0 AND COALESCE(qq.concept, '') <> ''
    GROUP BY qq.concept
    ORDER BY misses DESC, qq.concept ASC
    LIMIT 8
  `).all(userId);
  const material = opts.materialId
    ? db.prepare('SELECT title FROM materials WHERE id=? AND user_id=?').get(opts.materialId, userId)
    : null;
  const conceptMap = new Map(concepts.map(c => [String(c.name || '').toLowerCase(), c]));
  const weakSet = new Set([
    ...concepts.filter(c => Number(c.mastery_pct || 0) < 45).map(c => String(c.name || '').toLowerCase()),
    ...wrong.map(w => String(w.concept || '').toLowerCase()),
  ]);
  const basePath = subjectPath(prefs.subject);
  const extraWeak = wrong.map(w => normalizeTopic(w.concept)).filter(Boolean);
  const topics = [...new Set([...basePath, ...extraWeak])].slice(0, 14);
  const weakFirst = topics.find(t => weakSet.has(t.toLowerCase()));
  const startHere = weakFirst || topics.find(t => statusFor(t, conceptMap) !== 'mastered') || topics[0] || 'Upload material';
  const nodes = topics.map((topic, index) => {
    const key = topic.toLowerCase();
    const misses = wrong.find(w => String(w.concept || '').toLowerCase() === key);
    const mastery = conceptMap.get(key);
    const status = statusFor(topic, conceptMap);
    return {
      id: key.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''),
      label: topic,
      type: typeFor(topic, index, weakSet),
      status,
      mastery: mastery ? mastery.mastery_pct : 0,
      reason: misses
        ? `You missed ${misses.misses} question${misses.misses === 1 ? '' : 's'} about ${topic}.`
        : (status === 'mastered' ? 'You are currently strong here.' : 'Recommended by the course path.'),
      children: [],
    };
  });
  const remainingPath = topics.filter(t => statusFor(t, conceptMap) !== 'mastered' && t !== startHere);
  const map = {
    rootTopic: opts.rootTopic || material && material.title || prefs.subject || 'Learning Path',
    startHere,
    nodes,
    recommendedPath: [startHere, ...remainingPath].filter(Boolean).slice(0, 7),
    generatedAt: nowIso(),
  };
  if (opts.persist) {
    const existing = opts.materialId
      ? db.prepare('SELECT id FROM learning_maps WHERE user_id=? AND material_id=? ORDER BY id DESC LIMIT 1').get(userId, opts.materialId)
      : null;
    if (existing) {
      db.prepare('UPDATE learning_maps SET root_topic=?, map_json=?, updated_at=? WHERE id=?')
        .run(map.rootTopic, JSON.stringify(map), nowIso(), existing.id);
      return { id: existing.id, ...map };
    }
    const r = db.prepare('INSERT INTO learning_maps (user_id, material_id, root_topic, map_json, created_at, updated_at) VALUES (?,?,?,?,?,?)')
      .run(userId, opts.materialId || null, map.rootTopic, JSON.stringify(map), nowIso(), nowIso());
    return { id: r.lastInsertRowid, ...map };
  }
  return map;
}

module.exports = { buildLearningMap };
