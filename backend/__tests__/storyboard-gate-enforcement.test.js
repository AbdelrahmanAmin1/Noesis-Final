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

function seedRenderableStoryboardRow(db, status = 'needs_review') {
  const now = nowIso();
  const user = db.prepare('INSERT INTO users (email, password_hash, name, created_at) VALUES (?,?,?,?)')
    .run(`render-${Date.now()}@example.com`, 'hash', 'Render User', now);
  const material = db.prepare(`INSERT INTO materials
    (user_id, title, type, file_path, mime, size_bytes, status, progress, created_at)
    VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(user.lastInsertRowid, 'Linked List Slides', 'pdf', 'linked-list.pdf', 'application/pdf', 100, 'ready', 100, now);
  const storyboard = { topic: 'Linked List', scenes: [] };
  const quality = {
    storyboard: {
      passed: false,
      warnings: ['grounding:topic_drift_risk_high'],
      classified: { critical: [], warnings: ['grounding:topic_drift_risk_high'], info: [] },
    },
    approvalOverride: JSON.stringify({ at: now, remainingWarnings: 1 }),
  };
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
      JSON.stringify(quality),
      'canvas',
      now,
      now,
      now
    );
  return {
    userId: user.lastInsertRowid,
    materialId: material.lastInsertRowid,
    storyboardId: row.lastInsertRowid,
    now,
    quality,
  };
}

function seedPolymorphismStoryboardMissingClassObject(db) {
  const now = nowIso();
  const user = db.prepare('INSERT INTO users (email, password_hash, name, created_at) VALUES (?,?,?,?)')
    .run(`poly-${Date.now()}@example.com`, 'hash', 'Poly User', now);
  const material = db.prepare(`INSERT INTO materials
    (user_id, title, type, file_path, mime, size_bytes, status, progress, created_at)
    VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(user.lastInsertRowid, 'Polymorphism Slides', 'pdf', 'poly.pdf', 'application/pdf', 100, 'ready', 100, now);
  const storyboard = {
    topic: 'Polymorphism in Java',
    materialUnderstanding: {
      domain: 'Object-Oriented Programming',
      topic: 'Polymorphism',
      normalizedTopic: 'Polymorphism',
      confidence: 0.9,
      keyConcepts: ['polymorphism', 'dynamic dispatch', 'overriding'],
    },
    scenes: [
      {
        id: 'scene-1',
        type: 'deep_explanation',
        title: 'Runtime dispatch',
        sceneTitle: 'Runtime dispatch',
        teachingGoal: 'Explain polymorphism with superclass references and subclass objects.',
        narration: 'A Shape reference can point at Circle or Rectangle, and Java dispatches the overridden method at runtime.',
        visualType: 'polymorphism_dispatch',
        visualTemplate: 'polymorphism_dispatch',
        visualData: { type: 'polymorphism_dispatch', nodes: ['base reference', 'runtime object', 'overridden method', 'dynamic dispatch'], edges: [['base reference', 'runtime object']] },
        visualElements: { type: 'polymorphism_dispatch', nodes: ['base reference', 'runtime object', 'overridden method', 'dynamic dispatch'], edges: [['base reference', 'runtime object']] },
        code: { language: 'java', content: 'Shape s = new Circle();\ns.draw();' },
      },
      {
        id: 'scene-2',
        type: 'code_walkthrough',
        title: 'Code walkthrough',
        sceneTitle: 'Code walkthrough',
        teachingGoal: 'Walk through the same method call on different objects.',
        narration: 'The same call can run different overridden implementations.',
        visualType: 'code_walkthrough',
        visualTemplate: 'code_walkthrough',
        visualData: { type: 'code_walkthrough', nodes: ['Shape s', 'new Circle()', 's.draw()'], edges: [['Shape s', 's.draw()']] },
        visualElements: { type: 'code_walkthrough', nodes: ['Shape s', 'new Circle()', 's.draw()'], edges: [['Shape s', 's.draw()']] },
        code: { language: 'java', content: 'Shape s = new Circle();\ns.draw();\ns = new Rectangle();\ns.draw();' },
      },
      {
        id: 'scene-3',
        type: 'analogy',
        title: 'Remote control analogy',
        sceneTitle: 'Remote control analogy',
        teachingGoal: 'Connect superclass references to runtime behavior.',
        narration: 'The reference is like a remote control label, but the actual device decides what happens.',
        visualType: 'comparison_contrast',
        visualTemplate: 'comparison_contrast',
        visualData: { type: 'comparison_contrast', nodes: ['Shape reference', 'Circle object', 'Rectangle object', 'same draw call'], edges: [['Shape reference', 'Circle object'], ['Shape reference', 'Rectangle object']] },
        visualElements: { type: 'comparison_contrast', nodes: ['Shape reference', 'Circle object', 'Rectangle object', 'same draw call'], edges: [['Shape reference', 'Circle object'], ['Shape reference', 'Rectangle object']] },
      },
      {
        id: 'scene-4',
        type: 'common_mistakes',
        title: 'Overriding versus overloading',
        sceneTitle: 'Overriding versus overloading',
        teachingGoal: 'Separate runtime overriding from compile-time overload selection.',
        narration: 'Overriding is chosen by runtime object, while overloading is chosen by parameters.',
        visualType: 'process_flow',
        visualTemplate: 'process_flow',
        visualData: { type: 'process_flow', nodes: ['method call', 'runtime object', 'overridden implementation'], edges: [['method call', 'runtime object'], ['runtime object', 'overridden implementation']] },
        visualElements: { type: 'process_flow', nodes: ['method call', 'runtime object', 'overridden implementation'], edges: [['method call', 'runtime object'], ['runtime object', 'overridden implementation']] },
      },
      {
        id: 'scene-5',
        type: 'recap',
        title: 'Polymorphism recap',
        sceneTitle: 'Polymorphism recap',
        teachingGoal: 'Summarize the rule and checkpoint understanding.',
        narration: 'A superclass reference can point to subclass objects, and overridden methods dispatch at runtime.',
        visualType: 'summary_path',
        visualTemplate: 'summary_path',
        visualData: { type: 'summary_path', nodes: ['superclass reference', 'subclass object', 'dynamic dispatch', 'checkpoint'], edges: [['superclass reference', 'subclass object'], ['subclass object', 'dynamic dispatch']] },
        visualElements: { type: 'summary_path', nodes: ['superclass reference', 'subclass object', 'dynamic dispatch', 'checkpoint'], edges: [['superclass reference', 'subclass object'], ['subclass object', 'dynamic dispatch']] },
      },
    ],
  };
  const row = db.prepare(`INSERT INTO video_storyboards
    (user_id, material_id, topic, status, lesson_json, storyboard_json, quality_json, renderer, created_at, updated_at, approved_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .run(user.lastInsertRowid, material.lastInsertRowid, storyboard.topic, 'needs_review', JSON.stringify({}), JSON.stringify(storyboard), JSON.stringify({ storyboard: { passed: false, warnings: ['domain:missing_required_visual:class_object'] } }), 'canvas', now, now, null);
  const insertScene = db.prepare('INSERT INTO video_storyboard_scenes (storyboard_id, scene_id, scene_order, scene_json, quality_json, updated_at) VALUES (?,?,?,?,?,?)');
  storyboard.scenes.forEach((scene, index) => {
    insertScene.run(row.lastInsertRowid, scene.id, index, JSON.stringify(scene), JSON.stringify({ warnings: [] }), now);
  });
  return { userId: user.lastInsertRowid, storyboardId: row.lastInsertRowid };
}

describe.sequential('storyboard quality gate enforcement', () => {
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
      expect(['storyboard_quality_failed', 'storyboard_critical_blockers']).toContain(err.code);
      expect(err.details.passed).toBe(false);
      expect(err.details.warnings).toContain('topic:missing_detection');
    }
  });

  it('generateVideoFromStoryboard refuses approved rows when critical blockers remain', async () => {
    const { getDb } = require('../config/db');
    const videos = require('../services/video.service');
    const db = getDb();
    const { userId, storyboardId } = seedStoryboard(db, 'approved');

    await expect(videos.generateVideoFromStoryboard({ userId, storyboardId }))
      .rejects
      .toMatchObject({ status: 422, code: 'storyboard_critical_blockers' });
    const row = db.prepare('SELECT status FROM video_storyboards WHERE id=?').get(storyboardId);
    expect(row.status).toBe('needs_review');
  });

  it('queues render for force-approved storyboards with only non-critical warnings', async () => {
    const { getDb } = require('../config/db');
    const storyboards = require('../services/storyboard.service');
    const videos = require('../services/video.service');
    const db = getDb();
    const { userId, materialId, storyboardId, now, quality } = seedRenderableStoryboardRow(db, 'needs_review');
    const originalSetImmediate = global.setImmediate;
    const spy = vi.spyOn(storyboards, 'scriptForRender').mockReturnValue({
      board: {
        id: storyboardId,
        user_id: userId,
        material_id: materialId,
        topic: 'Linked List',
        status: 'needs_review',
        approved_at: now,
        video_id: null,
      },
      quality,
      script: { topic: 'Linked List', slides: [] },
    });
    global.setImmediate = () => null;
    try {
      const out = await videos.generateVideoFromStoryboard({ userId, storyboardId });
      expect(out.videoId).toBeTruthy();
      expect(out.jobId).toBeTruthy();
      const row = db.prepare('SELECT status FROM video_storyboards WHERE id=?').get(storyboardId);
      expect(row.status).toBe('rendering');
    } finally {
      spy.mockRestore();
      global.setImmediate = originalSetImmediate;
    }
  });

  it('returns actionable render gate errors for expected storyboard states', async () => {
    const { getDb } = require('../config/db');
    const storyboards = require('../services/storyboard.service');
    const videos = require('../services/video.service');
    const db = getDb();
    const { userId, materialId, storyboardId, now, quality } = seedRenderableStoryboardRow(db, 'approved');
    const criticalQuality = {
      ...quality,
      storyboard: {
        ...quality.storyboard,
        warnings: ['domain:missing_required_visual:class_object'],
        classified: { critical: ['domain:missing_required_visual:class_object'], warnings: [], info: [] },
      },
    };
    const spy = vi.spyOn(storyboards, 'scriptForRender').mockReturnValue({
      board: {
        id: storyboardId,
        user_id: userId,
        material_id: materialId,
        topic: 'Polymorphism in Java',
        status: 'approved',
        approved_at: now,
        video_id: null,
      },
      quality: criticalQuality,
      script: { topic: 'Polymorphism in Java', slides: [] },
    });
    try {
      await expect(videos.generateVideoFromStoryboard({ userId, storyboardId }))
        .rejects
        .toMatchObject({ status: 422, code: 'storyboard_critical_blockers' });
      const row = db.prepare('SELECT status FROM video_storyboards WHERE id=?').get(storyboardId);
      expect(row.status).toBe('needs_review');
    } finally {
      spy.mockRestore();
    }

    await expect(videos.generateVideoFromStoryboard({ userId, storyboardId: 999999 }))
      .rejects
      .toMatchObject({ status: 404, code: 'storyboard_not_found' });
  });

  it('classifies visual validation failures as needs-review instead of render fallback', () => {
    const videos = require('../services/video.service');
    const err = new Error('unsupported_visual_type:cinematic_glow_shapes');
    err.visualValidation = true;

    expect(videos._internals.isVisualValidationError(err)).toBe(true);
    expect(videos._internals.storyboardFailureStatus(err)).toBe('needs_review');
    expect(videos._internals.storyboardFailureStatus(new Error('storyboard_video_quality_failed: linked-list specifics missing'))).toBe('needs_review');
    expect(videos._internals.storyboardFailureStatus(new Error('ffmpeg_1: encoder failed'))).toBe('failed');
  });

  it('builds a concrete class/object visual patch for global blocker fixes', () => {
    const storyboards = require('../services/storyboard.service');
    const patch = storyboards._internals.visualPatchForScene({
      id: 'scene-1',
      type: 'deep_explanation',
      title: 'Runtime dispatch',
      narration: 'A Shape reference points at a Circle object.',
    }, 'Polymorphism in Java', 'class_object');

    expect(patch.visualType).toBe('class_object');
    expect(patch.visualTemplate).toBe('class_object');
    expect(JSON.stringify(patch.visualElements)).toMatch(/Class blueprint|Object instance|Field \/ state|Method \/ behavior/);
    expect(JSON.stringify(patch.visualElements)).toMatch(/Shape superclass|Circle subclass/);
  });
});
