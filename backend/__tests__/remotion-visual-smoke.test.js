'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

function assertPng(filePath) {
  const buffer = fs.readFileSync(filePath);
  expect(buffer.toString('ascii', 1, 4)).toBe('PNG');
  expect(buffer.readUInt32BE(16)).toBe(1280);
  expect(buffer.readUInt32BE(20)).toBe(720);
  expect(buffer.length).toBeGreaterThan(15_000);
}

function sceneFor(visualType) {
  const base = {
    id: `smoke-${visualType}`,
    sceneTitle: visualType.replace(/_/g, ' '),
    title: visualType.replace(/_/g, ' '),
    learningPoint: `This supported ${visualType} scene renders a concrete CS visual with labels and source-backed detail.`,
    narration: 'This smoke scene verifies that the Remotion tutor board receives concrete visual data and produces a nonblank frame.',
    visualType,
    visualTemplate: visualType,
    visualElements: {
      type: visualType,
      nodes: ['Counter class', 'private count field', 'public increment method', 'object state', 'client.increment()', 'bucket 2', 'node.next', 'O(n)'],
      edges: [['Counter class', 'private count field'], ['public increment method', 'object state']],
      operations: ['highlight field', 'trace method call'],
      caption: 'Concrete visual smoke test',
    },
    sourceEvidence: [{ chunkId: 1, quote: 'Source-backed visual data.' }],
    onScreenText: ['Counter class', 'private count field'],
    durationSeconds: 1,
  };
  if (visualType === 'code_walkthrough') {
    base.code = {
      language: 'java',
      content: 'private int count;\npublic void increment() { count++; }',
      highlightLines: [1, 2],
    };
    base.codeSnippet = base.code.content;
  }
  if (visualType === 'stack_operation') base.visualElements.nodes = ['push', 'pop', 'top', 'LIFO'];
  if (visualType === 'queue_operation') base.visualElements.nodes = ['enqueue', 'dequeue', 'front', 'rear', 'FIFO'];
  if (visualType === 'linked_list_operation') base.visualElements.nodes = ['head', 'node 10', 'node.next', 'null'];
  if (visualType === 'hash_table_operation') base.visualElements.nodes = ['key "cat"', 'hash(key)', 'index = hash mod buckets', 'bucket 2', '(cat, 41)', '(cot, 19)', 'collision chain'];
  if (visualType === 'tree_visual') base.visualElements.nodes = ['root', 'left child', 'right child', 'leaf'];
  if (visualType === 'big_o_growth') base.visualElements.nodes = ['O(1)', 'O(n)', 'O(n^2)', 'input size'];
  return base;
}

const EXPECTED_LABELS = {
  encapsulation_boundary: ['private count field', 'public increment method'],
  class_object: ['Counter class', 'object state'],
  inheritance_uml: ['Counter class', 'public increment method'],
  polymorphism_dispatch: ['Counter class', 'client.increment()'],
  linked_list_operation: ['head', 'node.next'],
  stack_operation: ['push', 'pop', 'top'],
  queue_operation: ['enqueue', 'dequeue', 'front', 'rear'],
  hash_table_operation: ['hash(key)', 'bucket 2', 'collision chain'],
  tree_visual: ['root', 'left child', 'leaf'],
  big_o_growth: ['O(1)', 'O(n)', 'input size'],
  code_walkthrough: ['private int count', 'public void increment()'],
  process_flow: ['Counter class', 'object state'],
  comparison_contrast: ['Counter class', 'private count field'],
  learning_objectives: ['Counter class', 'private count field'],
  summary_path: ['Counter class', 'private count field'],
  concept_map: ['Counter class', 'private count field'],
};

function assertExpectedLabels(scene, visualType) {
  const text = [
    scene.visualType,
    scene.visualTemplate,
    scene.visualElements && scene.visualElements.type,
    ...(scene.visualElements && scene.visualElements.nodes || []),
    ...(scene.visualElements && scene.visualElements.operations || []),
    scene.codeSnippet,
    scene.code && scene.code.content,
  ].filter(Boolean).join(' ');
  for (const label of EXPECTED_LABELS[visualType] || []) {
    expect(text).toContain(label);
  }
}

describe('Remotion supported visual smoke tests', () => {
  const renderer = require('../services/renderer.service');
  const remotion = renderer.remotionStatus();
  const runIfReady = remotion.ok ? it : it.skip;

  it('rejects unsupported visual input before rendering or fallback', () => {
    expect(() => renderer.validateRemotionVisualInput({
      scene: {
        id: 'bad-visual',
        type: 'diagram',
        sceneTitle: 'Decorative shapes',
        visualType: 'cinematic_glow_shapes',
        visualElements: { type: 'cinematic_glow_shapes', nodes: ['Glow', 'Shapes'] },
      },
      slide: { title: 'Bad visual' },
    })).toThrow(/unsupported_visual_type:cinematic_glow_shapes/);
  });

  it('rejects concept-map fallback for concrete Remotion diagram scenes', () => {
    expect(() => renderer.validateRemotionVisualInput({
      scene: {
        id: 'bad-map',
        type: 'diagram',
        sceneTitle: 'Private Fields',
        visualType: 'concept_map',
        visualElements: { type: 'concept_map', nodes: ['Encapsulation', 'Private fields'] },
      },
      slide: { title: 'Private Fields' },
    })).toThrow(/generic_fallback_not_allowed:concept_map/);
  });

  runIfReady('renders nonblank still frames for every supported visual type', async () => {
    const { bundle } = require('@remotion/bundler');
    const { renderStill, selectComposition } = require('@remotion/renderer');
    const entryPoint = path.join(__dirname, '..', 'remotion', 'index.jsx');
    const serveUrl = await bundle({ entryPoint, webpackOverride: config => config });
    const outDir = path.join(os.tmpdir(), `noesis-remotion-smoke-${Date.now()}`);
    fs.mkdirSync(outDir, { recursive: true });
    try {
      const visualTypes = renderer.supportedVisualTypes();
      const composition = await selectComposition({
        serveUrl,
        id: 'TutorScene',
        inputProps: { scene: sceneFor('encapsulation_boundary'), slide: { title: 'Smoke' } },
        browserExecutable: remotion.browserExecutable,
        timeoutInMilliseconds: 60000,
        logLevel: 'warn',
      });
      for (const visualType of visualTypes) {
        const outPath = path.join(outDir, `${visualType}.png`);
        const scene = sceneFor(visualType);
        assertExpectedLabels(scene, visualType);
        await renderStill({
          composition,
          serveUrl,
          output: outPath,
          frame: 18,
          inputProps: { scene, slide: { title: scene.title, visual_type: visualType } },
          browserExecutable: remotion.browserExecutable,
          overwrite: true,
          imageFormat: 'png',
          timeoutInMilliseconds: 60000,
          logLevel: 'warn',
        });
        assertPng(outPath);
      }
    } finally {
      try { fs.rmSync(outDir, { recursive: true, force: true }); } catch (_) {}
    }
  }, 180000);
});
