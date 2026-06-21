'use strict';

const { setupTestEnv, cleanupTestDb } = require('./helpers/setup');

setupTestEnv();

const { migrate, getDb } = require('../config/db');
const ai = require('../services/ai.service');
const materialMaps = require('../services/material-learning-map.service');

describe('material-learning-map.service', () => {
  let db;
  let userId;

  beforeAll(() => {
    cleanupTestDb();
    migrate();
    db = getDb();
  });

  beforeEach(() => {
    vi.restoreAllMocks();
    db.exec('DELETE FROM learning_maps; DELETE FROM chunks; DELETE FROM chapters; DELETE FROM materials; DELETE FROM concepts; DELETE FROM user_prefs; DELETE FROM users;');
    userId = db.prepare('INSERT INTO users (email, password_hash, name, created_at) VALUES (?,?,?,?)')
      .run(`map-${Date.now()}-${Math.random()}@test.com`, 'hash', 'Map User', new Date().toISOString()).lastInsertRowid;
    db.prepare('INSERT INTO user_prefs (user_id, subject, goal, daily_minutes, study_profile_json) VALUES (?,?,?,?,?)')
      .run(userId, 'general', 'understand', 45, '{}');
  });

  afterAll(() => cleanupTestDb());

  function addMaterial(title, rows) {
    const materialId = db.prepare(`INSERT INTO materials
      (user_id, course_id, title, type, file_path, mime, size_bytes, status, progress, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)`)
      .run(userId, null, title, 'pdf', `/tmp/${String(title).replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.pdf`, 'application/pdf', 1200, 'ready', 100, new Date().toISOString())
      .lastInsertRowid;
    rows.forEach((row, index) => {
      db.prepare(`INSERT INTO chunks
        (material_id, chapter_id, idx, text, token_count, chapter_title, heading, has_code, keywords_json)
        VALUES (?,?,?,?,?,?,?,?,?)`)
        .run(materialId, null, index, row.text, 40, row.chapter, row.heading, 0, JSON.stringify(row.keywords || []));
    });
    return materialId;
  }

  function visibleStrings(map) {
    const values = [];
    const visit = node => {
      values.push(node.label || '', node.summary || '', node.relationship || '');
      (node.children || []).forEach(visit);
    };
    visit(map.tree);
    return values.join(' ');
  }

  it('builds different source-grounded fallback maps for different subjects', () => {
    const biologyId = addMaterial('Plant Energy', [{
      chapter: 'Photosynthesis',
      heading: 'Light-dependent reactions',
      text: 'Photosynthesis converts light energy into chemical energy. Chlorophyll captures light, and plants use carbon dioxide and water to form glucose and oxygen.',
      keywords: ['photosynthesis', 'chlorophyll', 'glucose', 'oxygen'],
    }]);
    const marketingId = addMaterial('Marketing Strategy', [{
      chapter: 'Market Segmentation',
      heading: 'Target customers',
      text: 'Market segmentation groups customers by shared needs. Targeting chooses attractive segments, while positioning shapes the value proposition for those customers.',
      keywords: ['segmentation', 'targeting', 'positioning', 'customers'],
    }]);

    const biology = materialMaps.getOrBuild(userId, biologyId, { persist: false });
    const marketing = materialMaps.getOrBuild(userId, marketingId, { persist: false });

    expect(biology.generation.mode).toBe('source_fallback');
    expect(marketing.generation.mode).toBe('source_fallback');
    expect(visibleStrings(biology)).toMatch(/photosynthesis|chlorophyll|glucose/i);
    expect(visibleStrings(marketing)).toMatch(/segmentation|target|position/i);
    expect(visibleStrings(biology)).not.toBe(visibleStrings(marketing));
    expect(biology.nodes.length).toBeLessThanOrEqual(materialMaps.MAX_NODES);
    expect(marketing.nodes.length).toBeLessThanOrEqual(materialMaps.MAX_NODES);
  });

  it('accepts a grounded AI hierarchy and removes learner-facing metadata', async () => {
    const materialId = addMaterial('Page 1 CS 2110 Lecture 8: Classes and Encapsulation', [{
      chapter: 'Object-Oriented Programming',
      heading: 'Encapsulation',
      text: 'Encapsulation protects object state with private fields and public methods. Classes define state and behavior. Getters and setters provide controlled access.',
      keywords: ['encapsulation', 'private fields', 'public methods', 'classes', 'state', 'behavior'],
    }]);
    const chunkId = db.prepare('SELECT id FROM chunks WHERE material_id=?').get(materialId).id;
    vi.spyOn(ai, 'generateWithFallback').mockResolvedValue({
      provider: 'groq',
      text: JSON.stringify({
        root_topic: 'Classes and Encapsulation',
        root_summary: 'Classes organize state and behavior while encapsulation controls access.',
        branches: [{
          label: 'Encapsulation', summary: 'Encapsulation protects object state.', relationship: 'major topic', source_chunk_ids: [chunkId],
          children: [{ label: 'Private fields', summary: 'Private fields hide internal state.', relationship: 'protects state', source_chunk_ids: [chunkId] }],
        }, {
          label: 'Classes', summary: 'Classes define state and behavior.', relationship: 'major topic', source_chunk_ids: [chunkId],
          children: [{ label: 'Public methods', summary: 'Public methods provide controlled access.', relationship: 'exposes behavior', source_chunk_ids: [chunkId] }],
        }],
      }),
    });

    const map = await materialMaps.generateAndPersist(userId, materialId);

    expect(map.generation.mode).toBe('ai');
    expect(map.generation.provider).toBe('groq');
    expect(map.tree.children.map(node => node.label)).toEqual(['Encapsulation', 'Classes']);
    expect(visibleStrings(map)).not.toMatch(/page\s*1|lecture\s*8|CS\s*2110|chunk\s*\d+/i);
    expect(map.tree.children.every(node => node.sourceChunkIds.includes(chunkId))).toBe(true);
  });

  it('falls back safely for malformed output or provider timeout', async () => {
    const materialId = addMaterial('Queue Operations', [{
      chapter: 'Queues', heading: 'FIFO operations',
      text: 'A queue follows FIFO order. Enqueue adds at the rear and dequeue removes from the front.',
      keywords: ['queue', 'FIFO', 'enqueue', 'dequeue'],
    }]);
    vi.spyOn(ai, 'generateWithFallback').mockResolvedValueOnce({ provider: 'groq', text: 'not json' });
    const malformed = await materialMaps.generateAndPersist(userId, materialId);
    expect(malformed.generation.mode).toBe('source_fallback');
    expect(malformed.generation.failureCode).toMatch(/invalid/i);

    ai.generateWithFallback.mockRejectedValueOnce(Object.assign(new Error('timed out'), { code: 'ai_timeout' }));
    const timedOut = await materialMaps.generateAndPersist(userId, materialId);
    expect(timedOut.generation.mode).toBe('source_fallback');
    expect(timedOut.generation.failureCode).toBe('ai_timeout');
    expect(visibleStrings(timedOut)).toMatch(/queue|enqueue|dequeue|fifo/i);
  });

  it('reuses a current cached map', () => {
    const materialId = addMaterial('Binary Search', [{
      chapter: 'Searching', heading: 'Binary search',
      text: 'Binary search repeatedly halves a sorted search interval.', keywords: ['binary search', 'sorted', 'half'],
    }]);
    const first = materialMaps.getOrBuild(userId, materialId);
    const second = materialMaps.getOrBuild(userId, materialId);
    expect(second.id).toBe(first.id);
    expect(second.sourceFingerprint).toBe(first.sourceFingerprint);
  });
});
