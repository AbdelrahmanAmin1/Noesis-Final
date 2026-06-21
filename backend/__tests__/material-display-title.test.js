'use strict';

const { setupTestEnv, cleanupTestDb } = require('./helpers/setup');

setupTestEnv();

const { migrate, getDb } = require('../config/db');
const materials = require('../services/material.service');

describe('material display titles', () => {
  let db;
  let userId;

  beforeAll(() => {
    cleanupTestDb();
    migrate();
    db = getDb();
  });

  beforeEach(() => {
    db.exec('DELETE FROM chunks; DELETE FROM materials; DELETE FROM user_prefs; DELETE FROM users;');
    userId = db.prepare('INSERT INTO users (email, password_hash, name, created_at) VALUES (?,?,?,?)')
      .run(`title-${Date.now()}-${Math.random()}@test.com`, 'hash', 'Title User', new Date().toISOString()).lastInsertRowid;
    db.prepare('INSERT INTO user_prefs (user_id, subject, goal, daily_minutes) VALUES (?,?,?,?)')
      .run(userId, 'computer-science', 'exams', 45);
  });

  afterAll(() => cleanupTestDb());

  function addMaterial(title, opts = {}) {
    const materialId = db.prepare(`
      INSERT INTO materials
        (user_id, course_id, title, type, file_path, mime, size_bytes, status, progress, created_at, topic_map_json)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      userId,
      null,
      title,
      'pdf',
      `/tmp/${String(title).replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'material'}.pdf`,
      'application/pdf',
      1200,
      'ready',
      100,
      new Date().toISOString(),
      JSON.stringify(opts.topicMap || {})
    ).lastInsertRowid;
    for (const [idx, chunk] of (opts.chunks || []).entries()) {
      db.prepare(`
        INSERT INTO chunks
          (material_id, chapter_id, idx, text, token_count, chapter_title, heading, has_code, keywords_json)
        VALUES (?,?,?,?,?,?,?,?,?)
      `).run(
        materialId,
        null,
        idx,
        chunk.text || '',
        40,
        chunk.chapter || '',
        chunk.heading || '',
        0,
        JSON.stringify(chunk.keywords || [])
      );
    }
    return db.prepare('SELECT * FROM materials WHERE id=?').get(materialId);
  }

  function displayTitle(title, opts = {}) {
    return materials.displayTitleForMaterial(db, addMaterial(title, opts));
  }

  it('cleans compact code-like filenames into learner-facing headlines', () => {
    expect(displayTitle('325_04Stacks')).toBe('Stacks');
    expect(displayTitle('09OOPEncapsulation')).toBe('OOP Encapsulation');
  });

  it('replaces generic and metadata-heavy titles with meaningful source topics', () => {
    expect(displayTitle('Document', {
      topicMap: { title: 'Queue Operations', topics: [{ name: 'Queue' }] },
    })).toBe('Queue Operations');

    expect(displayTitle('Page 12 CS 2110 Fall 2024 Lecture 8', {
      chunks: [{
        chapter: 'CS 2110 Lecture 8',
        heading: 'Encapsulation',
        text: 'Encapsulation protects object state with private fields and public methods.',
        keywords: ['encapsulation', 'private fields', 'public methods'],
      }],
    })).toBe('Encapsulation');
  });

  it('keeps already-good human titles', () => {
    expect(displayTitle('Binary Search Trees')).toBe('Binary Search Trees');
  });
});
