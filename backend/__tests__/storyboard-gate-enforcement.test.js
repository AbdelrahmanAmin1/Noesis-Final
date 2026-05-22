'use strict';

const { setupTestEnv, cleanupTestDb } = require('./helpers/setup');

function nowIso() { return new Date().toISOString(); }

function weakStoryboard() {
  return {
    topic: 'Encapsulation in Java',
    scenes: [
      {
        id: 'scene-1',
        title: 'A visual journey into OOP',
        narration: 'Explore the concept through a dynamic learning experience.',
        visualType: 'concept_map',
        visualElements: { nodes: ['Journey', 'Power', 'Concept'] },
      },
    ],
  };
}

function seedStoryboard(db, status = 'draft') {
  const now = nowIso();
  const user = db.prepare('INSERT INTO users (email, password_hash, name, created_at) VALUES (?,?,?,?)')
    .run(`phase6-${Date.now()}@example.com`, 'hash', 'Phase Six', now);
  const material = db.prepare(`INSERT INTO materials
    (user_id, title, type, file_path, mime, size_bytes, status, progress, created_at)
    VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(user.lastInsertRowid, 'Encapsulation Slides', 'pdf', 'encapsulation.pdf', 'application/pdf', 100, 'ready', 100, now);
  const storyboard = weakStoryboard();
  const row = db.prepare(`INSERT INTO video_storyboards
    (user_id, material_id, topic, status, lesson_json, storyboard_json, quality_json, renderer, created_at, updated_at, approved_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .run(
      user.lastInsertRowid,
      material.lastInsertRowid,
      storyboard.topic,
      status,
      JSON.stringify({}),
      JSON.stringify(storyboard),
      JSON.stringify({ storyboard: { passed: false, warnings: ['seeded_failure'] } }),
      'remotion',
      now,
      now,
      status === 'approved' ? now : null
    );
  return { userId: user.lastInsertRowid, storyboardId: row.lastInsertRowid };
}

describe('storyboard quality gate enforcement', () => {
  beforeEach(() => {
    vi.resetModules();
    setupTestEnv();
    cleanupTestDb();
  });

  afterEach(() => cleanupTestDb());

  it('approveStoryboard blocks storyboards whose hard quality gate failed', () => {
    const { getDb } = require('../config/db');
    const storyboards = require('../services/storyboard.service');
    const db = getDb();
    const { userId, storyboardId } = seedStoryboard(db, 'draft');

    try {
      storyboards.approveStoryboard(userId, storyboardId);
      throw new Error('expected approveStoryboard to throw');
    } catch (err) {
      expect(err.status).toBe(422);
      expect(err.code).toBe('storyboard_quality_failed');
      expect(err.details.passed).toBe(false);
      expect(err.details.warnings).toContain('topic:missing_detection');
    }
  });

  it('generateVideoFromStoryboard refuses approved rows when storyboard.passed is false', async () => {
    const { getDb } = require('../config/db');
    const videos = require('../services/video.service');
    const db = getDb();
    const { userId, storyboardId } = seedStoryboard(db, 'approved');

    await expect(videos.generateVideoFromStoryboard({ userId, storyboardId }))
      .rejects
      .toThrow(/storyboard_quality_failed/);
    const row = db.prepare('SELECT status FROM video_storyboards WHERE id=?').get(storyboardId);
    expect(row.status).toBe('needs_review');
  });

  it('classifies visual validation failures as needs-review instead of render fallback', () => {
    const videos = require('../services/video.service');
    const err = new Error('unsupported_visual_type:cinematic_glow_shapes');
    err.visualValidation = true;

    expect(videos._internals.isVisualValidationError(err)).toBe(true);
    expect(videos._internals.storyboardFailureStatus(err)).toBe('needs_review');
    expect(videos._internals.storyboardFailureStatus(new Error('ffmpeg_1: encoder failed'))).toBe('failed');
  });
});
