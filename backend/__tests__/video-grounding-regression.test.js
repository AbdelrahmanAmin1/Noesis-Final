'use strict';

const { setupTestEnv, cleanupTestDb } = require('./helpers/setup');

function nowIso() { return new Date().toISOString(); }

function understanding() {
  return {
    domain: 'Object-Oriented Programming',
    topic: 'Encapsulation in Java',
    normalizedTopic: 'Encapsulation',
    confidence: 0.89,
    keyConcepts: ['class', 'object', 'state', 'behavior', 'private fields', 'public methods', 'invariant'],
    sourceEvidence: [
      { chunkId: 11, quote: 'Encapsulation means hiding the internal state of an object using private fields.' },
      { chunkId: 12, quote: 'Public methods control access and keep object state valid.' },
    ],
    reason: 'The uploaded material names encapsulation, classes, objects, private fields, public methods, state, and invariants.',
    alternatives: [],
    readyForGeneration: true,
    status: 'ready',
  };
}

function grounding() {
  return {
    uploadedMaterialCoverage: 0.82,
    enrichmentUsed: true,
    enrichmentReason: 'Uploaded material was abstract, so the AI added a small Counter example.',
    topicDriftRisk: 'low',
    scenesWithSourceEvidence: 8,
    sourceEvidenceCount: 2,
    enrichmentValidation: { passed: true, issues: [], topicDriftRisk: 'low' },
  };
}

function sourceEvidence(i = 0) {
  return [{
    chunkId: i % 2 === 0 ? 11 : 12,
    quote: i % 2 === 0
      ? 'Encapsulation means hiding the internal state of an object using private fields.'
      : 'Public methods control access and keep object state valid.',
    score: 0.78,
    chapterTitle: 'Object-Oriented Programming',
  }];
}

function scene(id, visualType, title, nodes, extra = {}) {
  const code = extra.codeSnippet || '';
  const visualName = String(visualType || '').replace(/_/g, ' ');
  const sceneType = visualType === 'code_walkthrough'
    ? 'code_walkthrough'
    : visualType === 'summary_path'
      ? 'recap'
      : visualType === 'learning_objectives'
        ? 'objectives'
        : visualType === 'concept_map'
          ? 'mindmap'
          : 'diagram';
  return {
    id,
    type: sceneType,
    sceneTitle: title,
    title,
    learningPoint: `${title} teaches one concrete Encapsulation idea from the uploaded material.`,
    visualPurpose: `Use a ${visualName} visual to show ${title} with source-backed diagram parts.`,
    visualRationale: `${visualName} is relevant because it can show the exact Encapsulation labels and relationships in ${title}.`,
    viewerTakeaway: `After seeing the visual, the viewer can explain ${title} without relying on abstract icons.`,
    visualGrounding: {
      topic: 'Encapsulation in Java',
      sceneIntent: `show ${title} as concrete Encapsulation evidence`,
      requiredVisualEvidence: ['class or object label', 'private or public access label', 'source-backed relationship'],
      selectedVisualReason: `${visualName} was selected because it visually supports ${title}.`,
      sourceBacked: true,
    },
    narration: `This scene connects the uploaded Encapsulation definition to ${title}. It names the exact class, object, field, method, access path, and state rule so the video stays concrete instead of becoming a generic cinematic interpretation.`,
    onScreenText: extra.onScreenText || [title, nodes[0], nodes[1]].filter(Boolean),
    visualType,
    visualTemplate: visualType,
    visualElements: {
      type: extra.visualElementType || visualType,
      nodes,
      edges: extra.edges || [],
      operations: extra.operations || ['highlight source-backed detail'],
      caption: `${title} is grounded in uploaded Encapsulation evidence.`,
    },
    codeSnippet: code,
    code: code ? {
      language: 'java',
      content: code,
      highlightLines: extra.highlightLines || [1, 2],
      walkthrough: [{ lineRange: '1-2', text: 'The highlighted lines keep state private and expose a public API.' }],
    } : null,
    sourceEvidence: sourceEvidence(Number(id.replace(/\D/g, '')) || 0),
    enrichment: extra.enrichment || { used: false, type: 'none', content: '' },
    motionInstructions: extra.motionInstructions || ['Highlight the labeled diagram', 'Trace the controlled access path'],
    durationSeconds: 18,
  };
}

function encapsulationStoryboard() {
  return {
    topic: 'Encapsulation in Java',
    materialUnderstanding: understanding(),
    grounding: grounding(),
    materialDiagnostics: {
      sourceFileName: 'encapsulation-lecture.pdf',
      extractedCharCount: 5400,
      chunkCount: 12,
      evidenceCount: 8,
    },
    scenes: [
      scene('scene-1', 'class_object', 'Class vs Object', ['Counter class blueprint', 'Counter object instance', 'state', 'behavior'], {
        visualElementType: 'class_diagram',
      }),
      scene('scene-2', 'encapsulation_boundary', 'Private Fields', ['Counter class', '- count: int private field', '+ increment() public method', 'object state'], {
        visualElementType: 'encapsulation_boundary',
      }),
      scene('scene-3', 'encapsulation_boundary', 'Blocked Direct Access', ['client.count = -5 blocked', 'private boundary', 'Counter state remains valid'], {
        operations: ['show blocked direct access', 'mark invalid write'],
      }),
      scene('scene-4', 'encapsulation_boundary', 'Valid Method Call', ['client.increment() allowed', '+ increment()', 'count changes safely'], {
        operations: ['trace method call', 'update state inside boundary'],
      }),
      scene('scene-5', 'comparison_contrast', 'Bad Public Field vs Correct Private Field', ['public int count is unsafe', 'private int count is protected', 'public increment() validates'], {
        visualElementType: 'comparison',
        operations: ['compare before and after'],
      }),
      scene('scene-6', 'code_walkthrough', 'Java Code Walkthrough', ['private int count', 'public void increment()', 'public int getCount()'], {
        visualElementType: 'code',
        codeSnippet: 'private int count;\npublic void increment() { count++; }\npublic int getCount() { return count; }',
        highlightLines: [1, 2, 3],
        enrichment: {
          used: true,
          type: 'simplified explanation + code example',
          content: 'A Counter object keeps count private and exposes increment() and getCount() as its small public API.',
        },
      }),
      scene('scene-7', 'process_flow', 'Controlled Access Through an API', ['Client code', 'public API', 'validation', 'private state'], {
        visualElementType: 'flow',
        edges: [['Client code', 'public API'], ['public API', 'validation'], ['validation', 'private state']],
        operations: ['client calls API', 'method validates', 'state changes internally'],
      }),
      scene('scene-8', 'summary_path', 'Controlled API Recap', ['class', 'object', 'private fields', 'public methods', 'valid state'], {
        visualElementType: 'summary_path',
        operations: ['recap source-backed concepts'],
      }),
    ],
  };
}

function seedApprovedStoryboard(db, storyboards) {
  const storyboard = encapsulationStoryboard();
  const quality = {
    storyboard: storyboards.storyboardQuality(storyboard),
    materialUnderstanding: storyboard.materialUnderstanding,
    grounding: storyboard.grounding,
  };
  expect(quality.storyboard.passed).toBe(true);
  const now = nowIso();
  const userId = db.prepare('INSERT INTO users (email, password_hash, name, created_at) VALUES (?,?,?,?)')
    .run(`phase8-${Date.now()}@example.com`, 'hash', 'Phase Eight', now).lastInsertRowid;
  const materialId = db.prepare(`INSERT INTO materials
    (user_id, title, type, file_path, mime, size_bytes, status, progress, created_at)
    VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(userId, 'Encapsulation Lecture', 'pdf', 'encapsulation-lecture.pdf', 'application/pdf', 5400, 'ready', 100, now).lastInsertRowid;
  const storyboardId = db.prepare(`INSERT INTO video_storyboards
    (user_id, material_id, topic, status, lesson_json, storyboard_json, quality_json, renderer, created_at, updated_at, approved_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .run(userId, materialId, storyboard.topic, 'approved', JSON.stringify({}), JSON.stringify(storyboard), JSON.stringify(quality), 'remotion', now, now, now)
    .lastInsertRowid;
  const insertScene = db.prepare(`INSERT INTO video_storyboard_scenes
    (storyboard_id, scene_id, scene_order, scene_json, quality_json, approved, updated_at)
    VALUES (?,?,?,?,?,?,?)`);
  storyboard.scenes.forEach((item, index) => {
    insertScene.run(storyboardId, item.id, index, JSON.stringify(item), JSON.stringify({ warnings: [] }), 1, now);
  });
  return { userId, materialId, storyboardId, storyboard };
}

describe('Phase 8 video grounding regressions', () => {
  beforeEach(() => {
    vi.resetModules();
    setupTestEnv();
    cleanupTestDb();
  });

  afterEach(() => cleanupTestDb());

  it('Encapsulation storyboard covers the concrete required teaching beats', () => {
    const storyboards = require('../services/storyboard.service');
    const storyboard = encapsulationStoryboard();
    const quality = storyboards.storyboardQuality(storyboard);
    const text = JSON.stringify(storyboard).toLowerCase();

    expect(quality.passed).toBe(true);
    expect(text).toContain('class vs object');
    expect(text).toContain('private field');
    expect(text).toContain('public method');
    expect(text).toContain('client.count = -5 blocked');
    expect(text).toContain('client.increment() allowed');
    expect(text).toContain('bad public field');
    expect(text).toContain('private int count');
    expect(text).toContain('public api');
    expect(storyboard.scenes).toHaveLength(8);
    expect(storyboard.scenes.every(item => item.sourceEvidence && item.sourceEvidence.length)).toBe(true);
  });

  it('rejects missing evidence, unsupported visuals, and generic concept-map-only storyboards', () => {
    const storyboards = require('../services/storyboard.service');
    const missingEvidence = encapsulationStoryboard();
    missingEvidence.scenes[0] = { ...missingEvidence.scenes[0], sourceEvidence: [] };
    expect(storyboards.storyboardQuality(missingEvidence).warnings.join(' ')).toContain('missing_source_evidence');

    const unsupported = encapsulationStoryboard();
    unsupported.scenes[0] = { ...unsupported.scenes[0], visualType: 'cinematic_glow_shapes', visualTemplate: 'cinematic_glow_shapes' };
    expect(storyboards.storyboardQuality(unsupported).warnings.join(' ')).toContain('unsupported_visual_type:cinematic_glow_shapes');

    const conceptOnly = encapsulationStoryboard();
    conceptOnly.scenes = conceptOnly.scenes.map((item, index) => ({
      ...item,
      id: `concept-${index + 1}`,
      visualType: 'concept_map',
      visualTemplate: 'concept_map',
      visualElements: { type: 'mindmap', nodes: ['Encapsulation', 'Private fields', 'Public methods'], operations: [] },
      code: null,
      codeSnippet: '',
    }));
    const conceptQuality = storyboards.storyboardQuality(conceptOnly);
    expect(conceptQuality.passed).toBe(false);
    expect(conceptQuality.warnings).toContain('domain:oop_missing_class_object_visual');
    expect(conceptQuality.warnings).toContain('domain:missing_code_scene');
  });

  it('catches enrichment topic drift before approval', () => {
    const storyboards = require('../services/storyboard.service');
    const storyboard = encapsulationStoryboard();
    storyboard.grounding = {
      ...storyboard.grounding,
      topicDriftRisk: 'high',
      enrichmentValidation: {
        passed: false,
        issues: ['scene-6:enrichment_unrelated_topics:Linked List'],
        topicDriftRisk: 'high',
      },
    };
    storyboard.scenes[5] = {
      ...storyboard.scenes[5],
      enrichment: { used: true, type: 'example', content: 'Switch to linked list traversal with nodes and next pointers.' },
    };

    const quality = storyboards.storyboardQuality(storyboard);
    expect(quality.passed).toBe(false);
    expect(quality.warnings).toContain('grounding:topic_drift_risk_high');
    expect(quality.warnings).toContain('enrichment:validation_failed');
  });

  it('passes concrete scene data through to Remotion-oriented render payloads', () => {
    const storyboards = require('../services/storyboard.service');
    const storyboard = encapsulationStoryboard();
    const sanitized = storyboards.sanitizeForRender(storyboard);
    const script = storyboards.scriptFromStoryboard(storyboard);

    expect(sanitized.scenes[0].visualType).toBe('class_object');
    expect(sanitized.scenes[2].visualElements.nodes.join(' ')).toMatch(/client\.count = -5 blocked/i);
    expect(sanitized.scenes[5].codeSnippet).toMatch(/private int count/);
    expect(script.slides[5].example_code).toMatch(/getCount/);
    expect(script.slides[6].visual_nodes).toEqual(expect.arrayContaining(['Client code', 'public API', 'validation', 'private state']));
  });

  it('queued video metadata keeps the detected storyboard topic', async () => {
    const { getDb } = require('../config/db');
    const storyboards = require('../services/storyboard.service');
    const videos = require('../services/video.service');
    const db = getDb();
    const { userId, storyboardId } = seedApprovedStoryboard(db, storyboards);
    const originalSetImmediate = global.setImmediate;
    global.setImmediate = () => ({ unref() {} });
    try {
      const out = await videos.generateVideoFromStoryboard({ userId, storyboardId });
      const row = db.prepare('SELECT status, resolved_concept FROM videos WHERE id=? AND user_id=?')
        .get(out.videoId, userId);
      expect(row.status).toBe('queued');
      expect(row.resolved_concept).toBe('Encapsulation in Java');
    } finally {
      global.setImmediate = originalSetImmediate;
    }
  });
});
