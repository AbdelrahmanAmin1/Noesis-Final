'use strict';

const express = require('express');
const cookieParser = require('cookie-parser');
const request = require('supertest');
const { setupTestEnv, cleanupTestDb, createTestUser } = require('./helpers/setup');

setupTestEnv();

const ai = require('../services/ai.service');
const { migrate, getDb } = require('../config/db');
const { notFound, errorHandler } = require('../middleware/error');

function nowIso() { return new Date().toISOString(); }

function getVideoApp() {
  setupTestEnv();
  cleanupTestDb();
  migrate();
  const app = express();
  app.use(cookieParser());
  app.use(express.json({ limit: '2mb' }));
  app.use('/api/auth', require('../routes/auth.routes'));
  app.use('/api/videos', require('../routes/video.routes'));
  app.use(notFound);
  app.use(errorHandler);
  return { app, db: getDb() };
}

function insertMaterial(db, userId, title = 'Trees') {
  const now = nowIso();
  const materialId = db.prepare(`INSERT INTO materials
    (user_id, title, type, file_path, mime, size_bytes, status, progress, created_at)
    VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(userId, title, 'pdf', `${title}.pdf`, 'application/pdf', 100, 'ready', 100, now).lastInsertRowid;
  const chapterId = db.prepare('INSERT INTO chapters (material_id, idx, title, char_start, char_end) VALUES (?,?,?,?,?)')
    .run(materialId, 0, title, 0, 1000).lastInsertRowid;
  const chunks = [
    {
      heading: 'Tree ADT',
      text: 'A tree ADT organizes nodes in a hierarchy. The root node has children, and leaf nodes have no children. Height and depth describe node positions.',
      keywords: ['tree', 'root', 'children', 'leaf'],
    },
    {
      heading: 'Tree Traversals',
      text: 'Preorder, inorder, and postorder are traversal orders for a binary tree. A binary search tree follows left subtree and right subtree ordering.',
      keywords: ['preorder', 'inorder', 'postorder', 'binary search tree'],
    },
  ];
  const insertChunk = db.prepare(`INSERT INTO chunks
    (material_id, chapter_id, idx, text, token_count, chapter_title, heading, source_page, has_code, keywords_json)
    VALUES (?,?,?,?,?,?,?,?,?,?)`);
  chunks.forEach((chunk, index) => insertChunk.run(
    materialId,
    chapterId,
    index,
    chunk.text,
    80,
    title,
    chunk.heading,
    index + 1,
    0,
    JSON.stringify(chunk.keywords)
  ));
  const visualId = db.prepare(`INSERT INTO source_visual_candidates
    (material_id, page_number, slide_number, image_path, thumbnail_path, heading, nearby_text, ocr_text, visual_type_guess, importance_score, metadata_json)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .run(materialId, 1, null, null, null, 'Tree hierarchy diagram', chunks[0].text, '', 'tree_diagram', 0.92, '{}').lastInsertRowid;
  return { materialId, visualId };
}

function treeStoryboard(visualType = 'unsupported_magic') {
  const evidence = [
    {
      chunkId: 1,
      quote: 'A tree ADT organizes nodes in a hierarchy. The root node has children, and leaf nodes have no children.',
      heading: 'Tree ADT',
      sourcePage: 1,
    },
  ];
  const goodTreeData = {
    type: 'tree_visual',
    nodes: ['root node', 'child node', 'leaf node', 'height', 'depth'],
    edges: [['root node', 'child node'], ['child node', 'leaf node']],
    operations: ['start at root', 'visit children', 'identify leaves'],
    caption: 'Tree hierarchy from the uploaded material.',
  };
  const weakData = {
    type: visualType,
    nodes: ['Journey', 'Power', 'Concept'],
    edges: [],
    operations: [],
    caption: 'Generic visual.',
  };
  const scene1 = {
    id: 'scene-1',
    type: 'deep_explanation',
    title: 'Tree hierarchy',
    sceneTitle: 'Tree hierarchy',
    teachingGoal: 'Explain root, child, and leaf relationships in a tree ADT.',
    learningPoint: 'A tree starts at the root and connects parent nodes to children and leaves.',
    narration: 'The uploaded material defines a tree as a hierarchy with a root node, child nodes, and leaf nodes. This scene should make that parent-child structure visible before traversal details.',
    visualType,
    visualTemplate: visualType,
    visualData: weakData,
    visualElements: weakData,
    sourceEvidence: evidence,
  };
  const scenes = [
    scene1,
    {
      id: 'scene-2',
      type: 'diagram',
      title: 'Tree visual',
      sceneTitle: 'Tree visual',
      teachingGoal: 'Show the parent-child structure.',
      learningPoint: 'Root, children, and leaves define the tree structure.',
      narration: 'A tree can be read as parent-child relationships from root to leaves.',
      visualType: 'tree_visual',
      visualTemplate: 'tree_visual',
      visualData: goodTreeData,
      visualElements: goodTreeData,
      sourceEvidence: evidence,
    },
    {
      id: 'scene-3',
      type: 'concept',
      title: 'Traversal terms',
      narration: 'Preorder, inorder, and postorder are ways to visit nodes in a tree.',
      visualType: 'process_flow',
      visualTemplate: 'process_flow',
      visualData: { type: 'process_flow', nodes: ['preorder', 'inorder', 'postorder'], edges: [['preorder', 'inorder']], operations: ['choose traversal', 'visit nodes'], caption: 'Traversal choices.' },
      visualElements: { type: 'process_flow', nodes: ['preorder', 'inorder', 'postorder'], edges: [['preorder', 'inorder']], operations: ['choose traversal', 'visit nodes'], caption: 'Traversal choices.' },
      sourceEvidence: evidence,
    },
    {
      id: 'scene-4',
      type: 'common_mistakes',
      title: 'Common mistake',
      narration: 'Do not treat every node term as a linked list; trees branch through children.',
      visualType: 'comparison_contrast',
      visualTemplate: 'comparison_contrast',
      visualData: { type: 'comparison_contrast', nodes: ['tree children', 'single chain'], edges: [['tree children', 'single chain']], operations: ['compare branching'], caption: 'Branching versus chain.' },
      visualElements: { type: 'comparison_contrast', nodes: ['tree children', 'single chain'], edges: [['tree children', 'single chain']], operations: ['compare branching'], caption: 'Branching versus chain.' },
      sourceEvidence: evidence,
    },
    {
      id: 'scene-5',
      type: 'checkpoint',
      title: 'Tree checkpoint',
      narration: 'Check whether you can identify the root, a child, and a leaf in a tree diagram.',
      visualType: 'summary_path',
      visualTemplate: 'summary_path',
      visualData: { type: 'summary_path', nodes: ['root', 'child', 'leaf', 'checkpoint'], edges: [['root', 'child'], ['child', 'leaf']], operations: ['review terms'], caption: 'Tree recap.' },
      visualElements: { type: 'summary_path', nodes: ['root', 'child', 'leaf', 'checkpoint'], edges: [['root', 'child'], ['child', 'leaf']], operations: ['review terms'], caption: 'Tree recap.' },
      sourceEvidence: evidence,
    },
  ];
  return {
    topic: 'Trees',
    materialUnderstanding: {
      domain: 'Data Structures',
      topic: 'Trees',
      normalizedTopic: 'Trees',
      confidence: 0.9,
      keyConcepts: ['root', 'child', 'leaf', 'height', 'depth', 'traversal'],
      sourceEvidence: evidence,
    },
    grounding: {
      topicDriftRisk: 'low',
      enrichmentValidation: { passed: true, issues: [], topicDriftRisk: 'low' },
    },
    scenes,
  };
}

function insertStoryboard(db, userId, materialId, storyboard) {
  const now = nowIso();
  const quality = require('../services/storyboard.service').storyboardQuality(storyboard);
  const row = db.prepare(`INSERT INTO video_storyboards
    (user_id, material_id, topic, status, lesson_json, storyboard_json, quality_json, renderer, created_at, updated_at, approved_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .run(userId, materialId, storyboard.topic, 'needs_review', JSON.stringify({}), JSON.stringify(storyboard), JSON.stringify({ storyboard: quality }), 'remotion', now, now, null);
  const insertScene = db.prepare('INSERT INTO video_storyboard_scenes (storyboard_id, scene_id, scene_order, scene_json, quality_json, updated_at) VALUES (?,?,?,?,?,?)');
  storyboard.scenes.forEach((scene, index) => {
    insertScene.run(row.lastInsertRowid, scene.id, index, JSON.stringify(scene), JSON.stringify({ warnings: scene.qualityWarnings || [] }), now);
  });
  return row.lastInsertRowid;
}

function treeRepairJson(visualId) {
  return JSON.stringify({
    patches: [{
      sceneId: 'scene-1',
      reason: 'Use the uploaded tree hierarchy visual to replace the unsupported generic visual.',
      patch: {
        visualType: 'source_page_reference',
        visualData: { sourceVisualId: visualId },
        narration: 'The uploaded material defines a tree as a hierarchy. Use the source visual to point out the root node first, then follow the child links down to leaf nodes so height and depth become concrete.',
        learningPoint: 'A tree hierarchy starts at the root, branches to children, and ends at leaves.',
        onScreenText: ['Root starts the hierarchy', 'Children branch below it', 'Leaves have no children'],
        sourceEvidence: [{ chunkId: 1, quote: 'A tree ADT organizes nodes in a hierarchy.' }],
      },
    }],
  });
}

function linkedListRepairJson() {
  return JSON.stringify({
    patches: [{
      sceneId: 'scene-1',
      reason: 'Wrong repair for the test.',
      patch: {
        visualType: 'linked_list_operation',
        visualData: {
          type: 'linked_list_operation',
          nodes: ['head pointer', 'node.next', 'null'],
          edges: [['head pointer', 'node.next']],
          operations: ['follow next pointer'],
          caption: 'Linked list chain.',
        },
        narration: 'A linked list follows the head pointer through node.next references until null.',
        sourceEvidence: [{ chunkId: 1, quote: 'A tree ADT organizes nodes in a hierarchy.' }],
      },
    }],
  });
}

describe.sequential('storyboard AI repair', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    setupTestEnv();
    cleanupTestDb();
    migrate();
    vi.spyOn(ai, 'generate').mockResolvedValue(JSON.stringify({ patches: [] }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    cleanupTestDb();
  });

  it('rejects wrong-topic Linked List AI repair for Trees storyboard', async () => {
    const repair = require('../services/storyboard-repair.service');
    const db = getDb();
    const user = db.prepare('INSERT INTO users (email, password_hash, name, created_at) VALUES (?,?,?,?)')
      .run(`trees-${Date.now()}@example.com`, 'hash', 'Trees User', nowIso());
    const { materialId } = insertMaterial(db, user.lastInsertRowid);
    const storyboardId = insertStoryboard(db, user.lastInsertRowid, materialId, treeStoryboard());
    ai.generate.mockResolvedValueOnce(linkedListRepairJson());

    const out = await repair.repairStoryboard(user.lastInsertRowid, storyboardId, { scope: 'weak_scenes' });

    expect(out.repair.repairedSceneIds).toEqual([]);
    expect(out.repair.decisions.some(d => d.reason === 'source_grounding_judge_rejected')).toBe(true);
    const row = db.prepare('SELECT storyboard_json, quality_json FROM video_storyboards WHERE id=?').get(storyboardId);
    expect(row.storyboard_json).not.toMatch(/head pointer|node\.next/i);
    expect(row.quality_json).not.toMatch(/"repair"/);
  });

  it('accepts a source visual candidate repair and stores repair trace', async () => {
    const repair = require('../services/storyboard-repair.service');
    const db = getDb();
    const user = db.prepare('INSERT INTO users (email, password_hash, name, created_at) VALUES (?,?,?,?)')
      .run(`visual-${Date.now()}@example.com`, 'hash', 'Visual User', nowIso());
    const { materialId, visualId } = insertMaterial(db, user.lastInsertRowid);
    const storyboardId = insertStoryboard(db, user.lastInsertRowid, materialId, treeStoryboard());
    ai.generate.mockResolvedValueOnce(treeRepairJson(visualId));

    const out = await repair.repairStoryboard(user.lastInsertRowid, storyboardId, { scope: 'weak_scenes' });

    expect(out.repair.repairedSceneIds).toContain('scene-1');
    const repairedScene = out.storyboard.storyboard.scenes.find(scene => scene.id === 'scene-1');
    expect(repairedScene.visualType).toMatch(/source_page_reference|source_slide_reference/);
    expect(repairedScene.visualData.sourceVisualId).toBe(visualId);
    const row = db.prepare('SELECT status, approved_at, quality_json FROM video_storyboards WHERE id=?').get(storyboardId);
    expect(row.status).not.toBe('approved');
    expect(row.approved_at).toBe(null);
    expect(row.quality_json).toMatch(/"repair"/);
  });

  it('enforces no_visual and image-path validation rules', () => {
    const repair = require('../services/storyboard-repair.service');
    const chunk = { id: 1, text: 'Bones protect organs and support movement.', heading: 'Skeletal System' };
    const context = {
      topic: 'Skeletal System',
      chunks: [chunk],
      validChunkIds: new Set([1]),
      chunkById: new Map([[1, chunk]]),
      sourceVisualMaps: { byId: new Map(), paths: new Map() },
      sceneWarnings: ['vague_visual'],
    };
    const scene = {
      id: 'scene-1',
      title: 'Bones',
      narration: 'Bones protect organs and support movement in the skeletal system. This scene can be source-led because a diagram is not needed for the definition.',
      sourceEvidence: [{ chunkId: 1, quote: chunk.text }],
    };

    expect(repair._internals.sanitizePatch(scene, {
      visualType: 'no_visual',
      narration: `${scene.narration} The viewer should focus on the source definition and remember the support and protection functions.`,
      sourceEvidence: [{ chunkId: 1, quote: chunk.text }],
    }, context).ok).toBe(true);

    expect(repair._internals.sanitizePatch(scene, {
      visualType: 'no_visual',
      sourceEvidence: [{ chunkId: 1, quote: chunk.text }],
    }, { ...context, sceneWarnings: ['domain:missing_required_visual:tree_visual'] }).reason).toBe('no_visual_cannot_fix_required_visual');

    expect(repair._internals.sanitizePatch(scene, {
      visualType: 'cinematic_glow_shapes',
      sourceEvidence: [{ chunkId: 1, quote: chunk.text }],
    }, context).reason).toMatch(/unsupported_visual_type/);

    expect(repair._internals.sanitizePatch(scene, {
      visualType: 'concept_cards',
      visualData: { imagePath: 'C:/outside/source.png', nodes: ['Bones'] },
      sourceEvidence: [{ chunkId: 1, quote: chunk.text }],
    }, context).reason).toBe('image_path_not_from_source_visual_candidate');
  });

  it('repairs through the route and requires storyboard ownership', async () => {
    const setup = getVideoApp();
    const app = setup.app;
    const db = setup.db;
    const created = await createTestUser(app, request);
    const other = await createTestUser(app, request);
    const { materialId, visualId } = insertMaterial(db, created.user.id);
    const storyboardId = insertStoryboard(db, created.user.id, materialId, treeStoryboard());
    ai.generate.mockResolvedValueOnce(treeRepairJson(visualId));

    const res = await request(app)
      .post(`/api/videos/storyboard/${storyboardId}/repair`)
      .set('Authorization', `Bearer ${created.token}`)
      .send({ scope: 'weak_scenes' });

    expect(res.status).toBe(200);
    expect(res.body.repair.repairedSceneIds).toContain('scene-1');
    expect(res.body.quality).toHaveProperty('classified');

    const forbidden = await request(app)
      .post(`/api/videos/storyboard/${storyboardId}/repair`)
      .set('Authorization', `Bearer ${other.token}`)
      .send({ scope: 'weak_scenes' });

    expect(forbidden.status).toBe(404);
  });

  it('leaves storyboard unchanged when AI repair response is invalid', async () => {
    const repair = require('../services/storyboard-repair.service');
    const db = getDb();
    const user = db.prepare('INSERT INTO users (email, password_hash, name, created_at) VALUES (?,?,?,?)')
      .run(`invalid-${Date.now()}@example.com`, 'hash', 'Invalid User', nowIso());
    const { materialId } = insertMaterial(db, user.lastInsertRowid);
    const storyboardId = insertStoryboard(db, user.lastInsertRowid, materialId, treeStoryboard());
    const before = db.prepare('SELECT storyboard_json FROM video_storyboards WHERE id=?').get(storyboardId).storyboard_json;
    ai.generate.mockRejectedValueOnce(new Error('model_down'));

    const out = await repair.repairStoryboard(user.lastInsertRowid, storyboardId, { scope: 'weak_scenes' });

    expect(out.repair.repairedSceneIds).toEqual([]);
    expect(out.repair.decisions[0].action).toBe('ai_repair_failed');
    const after = db.prepare('SELECT storyboard_json FROM video_storyboards WHERE id=?').get(storyboardId).storyboard_json;
    expect(after).toBe(before);
  });
});
