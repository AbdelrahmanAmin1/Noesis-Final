'use strict';

const fs = require('fs');
const path = require('path');
const { storyboardQuality, scriptFromStoryboard, classifyWarnings, _internals } = require('../services/storyboard.service');
const visualRegistry = require('../utils/visual-registry');
const env = require('../config/env');

describe('storyboard.service', () => {
  function understanding(overrides = {}) {
    return {
      domain: 'Object-Oriented Programming',
      topic: 'Encapsulation in Java',
      normalizedTopic: 'Encapsulation',
      confidence: 0.87,
      keyConcepts: ['class', 'object', 'private fields', 'public methods'],
      sourceEvidence: [
        { chunkId: 1, quote: 'Encapsulation hides internal state with private fields.' },
        { chunkId: 2, quote: 'Public methods provide controlled access to object behavior.' },
      ],
      reason: 'The material repeatedly mentions encapsulation, private fields, and public methods.',
      alternatives: [],
      ...overrides,
    };
  }

  function grounding(overrides = {}) {
    return {
      uploadedMaterialCoverage: 0.75,
      enrichmentUsed: false,
      enrichmentReason: '',
      topicDriftRisk: 'low',
      enrichmentValidation: { passed: true, issues: [], topicDriftRisk: 'low' },
      ...overrides,
    };
  }

  function storyboard(scenes, overrides = {}) {
    return {
      topic: 'Encapsulation in Java',
      materialUnderstanding: understanding(),
      grounding: grounding(),
      scenes,
      ...overrides,
    };
  }

  function groundedScene(id, visualType, title = 'Private Fields') {
    const codeScene = visualType === 'code_walkthrough';
    const canonicalVisualType = visualRegistry.normalizeVisualType(visualType, {
      topic: 'Encapsulation in Java',
      text: title,
    });
    const visualNodesByType = {
      encapsulation_boundary: ['Counter class boundary', 'private count field', 'public increment method', 'blocked direct access', 'valid public API call'],
      class_object: ['Counter class blueprint', 'Counter object instance', 'state field', 'behavior method'],
      comparison_contrast: ['bad public field access', 'correct private field', 'valid public method call'],
      code_walkthrough: ['private int count', 'public void increment()', 'client.increment() allowed'],
      summary_path: ['Encapsulation', 'private fields', 'public methods', 'controlled valid state'],
    };
    const visualNodes = visualNodesByType[canonicalVisualType] || ['Counter class', 'private count field', 'public increment method', 'object state'];
    const sceneType = codeScene
      ? 'code_walkthrough'
      : canonicalVisualType === 'summary_path'
        ? 'recap'
        : canonicalVisualType === 'learning_objectives'
          ? 'objectives'
          : canonicalVisualType === 'concept_map'
            ? 'mindmap'
            : 'diagram';
    const requiredVisualEvidence = visualType === 'encapsulation_boundary'
      ? ['class boundary', 'private field', 'public method']
      : ['topic label', 'concrete diagram part'];
    return {
      id,
      type: sceneType,
      sceneTitle: title,
      title,
      learningPoint: `${title} explains one concrete Encapsulation idea with source-backed details.`,
      visualPurpose: `Use a ${visualType.replace(/_/g, ' ')} visual to show ${title} as concrete source-backed parts.`,
      visualRationale: `${visualType.replace(/_/g, ' ')} is relevant because the viewer needs visible labels, arrows, and relationships for ${title}.`,
      viewerTakeaway: `After seeing the visual, the viewer can explain why ${title} matters for Encapsulation.`,
      visualGrounding: {
        topic: 'Encapsulation in Java',
        sceneIntent: `show ${title} as a concrete visual relationship`,
        requiredVisualEvidence,
        selectedVisualReason: `${visualType.replace(/_/g, ' ')} was selected because it can show ${title}.`,
        sourceBacked: true,
      },
      narration: `This scene explains ${title} by connecting the uploaded definition to a concrete visual. The learner should point to each labeled part, say what role it plays, and connect it back to the source evidence before moving on.`,
      onScreenText: [title, visualNodes[0], visualNodes[1]].filter(Boolean),
      visualType,
      visualTemplate: visualType,
      visualElements: {
        type: canonicalVisualType,
        nodes: visualNodes,
        edges: [['private count field', 'public increment method']],
        operations: ['highlight private field', 'show blocked direct access', 'trace valid public API call'],
      },
      code: codeScene ? {
        language: 'java',
        content: 'private int count;\npublic void increment() { count++; }',
        highlightLines: [1, 2],
        walkthrough: [{ lineRange: '1-2', text: 'Private state changes through a public method.' }],
      } : null,
      codeSnippet: codeScene ? 'private int count;\npublic void increment() { count++; }' : '',
      sourceEvidence: [{ chunkId: 1, quote: 'Encapsulation hides internal state with private fields.' }],
      enrichment: { used: false, type: 'none', content: '' },
      motionInstructions: ['Highlight private field', 'Trace public method access'],
      durationSeconds: 18,
    };
  }

  it('plans material-wide topic-map scenes with coverage and checkpoints', () => {
    const topicMap = {
      title: 'Stack / Queue',
      domain: 'Data Structures',
      topics: [
        {
          id: 'topic-stack',
          name: 'Stack',
          order: 0,
          terms: ['LIFO', 'push', 'pop', 'underflow'],
          sourceChunkIds: [1],
          sourcePageRefs: [{ kind: 'page', pageNumber: 7, label: 'Page 7' }],
          sourceVisualIds: [],
          conceptIds: ['concept-stack'],
          requiredVisualTypes: ['stack_operation', 'code_walkthrough'],
          checkpointNeeded: true,
        },
        {
          id: 'topic-queue',
          name: 'Queue',
          order: 1,
          terms: ['FIFO', 'enqueue', 'dequeue', 'front', 'rear'],
          sourceChunkIds: [2],
          sourcePageRefs: [{ kind: 'page', pageNumber: 8, label: 'Page 8' }],
          sourceVisualIds: [],
          conceptIds: ['concept-queue'],
          requiredVisualTypes: ['queue_operation', 'code_walkthrough'],
          checkpointNeeded: true,
        },
      ],
    };
    const chunks = [
      { id: 1, text: 'Stack operations push and pop follow LIFO order and can underflow.', source_page: 7 },
      { id: 2, text: 'Queue operations enqueue at rear, dequeue at front, and follow FIFO order.', source_page: 8 },
    ];

    const scenes = _internals.topicMapScenePlan(topicMap, chunks, [], { domain: 'Data Structures' });

    expect(scenes.some(scene => scene.topicId === 'topic-stack')).toBe(true);
    expect(scenes.some(scene => scene.topicId === 'topic-queue')).toBe(true);
    expect(scenes.some(scene => /checkpoint/i.test(scene.type))).toBe(true);
    expect(scenes.map(scene => scene.visualType)).toEqual(expect.arrayContaining(['stack_operation', 'queue_operation']));
    expect(scenes.every(scene => Array.isArray(scene.validationTags) && scene.validationTags.includes('topic_map'))).toBe(true);
  });

  it('keeps deterministic operation visuals when attaching matching source images', () => {
    const topicMap = {
      title: 'Stack / Queue',
      domain: 'Data Structures',
      topics: [
        {
          id: 'topic-stack',
          name: 'Stack',
          terms: ['LIFO', 'push', 'pop'],
          sourceChunkIds: [1],
          sourcePageRefs: [{ kind: 'page', pageNumber: 7, label: 'Page 7' }],
          sourceVisualIds: [10],
          requiredVisualTypes: ['stack_operation'],
        },
        {
          id: 'topic-queue',
          name: 'Queue',
          terms: ['FIFO', 'enqueue', 'dequeue', 'front', 'rear'],
          sourceChunkIds: [2],
          sourcePageRefs: [{ kind: 'page', pageNumber: 8, label: 'Page 8' }],
          requiredVisualTypes: ['queue_operation'],
        },
      ],
    };
    const chunks = [
      { id: 1, text: 'Stack push and pop use LIFO order.', source_page: 7 },
      { id: 2, text: 'Queue enqueue and dequeue use FIFO order.', source_page: 8 },
    ];
    const sourceVisuals = [
      { id: 10, sourcePage: 7, heading: 'Stack push pop diagram', ocrText: 'stack push pop top', imagePath: 'uploads/source-visuals/stack.png', importanceScore: 0.9 },
    ];

    const scenes = _internals.topicMapScenePlan(topicMap, chunks, sourceVisuals, { domain: 'Data Structures' });
    const stackScene = scenes.find(scene => scene.topicId === 'topic-stack' && scene.visualType === 'stack_operation');

    expect(stackScene).toBeTruthy();
    expect(stackScene.visualType).toBe('stack_operation');
    expect(stackScene.visualElements.type).toBe('stack_operation');
    expect(stackScene.sourceVisualIds).toContain(10);
  });

  it('keeps required generated visuals primary while retaining extracted-image provenance', () => {
    const imagePath = path.join(env.UPLOAD_DIR, 'storyboard-estimated-source-test.jpg');
    fs.mkdirSync(path.dirname(imagePath), { recursive: true });
    fs.writeFileSync(imagePath, Buffer.from('storyboard source image fixture'));
    try {
      const scenes = _internals.attachSourceVisualsToScenes([{
        id: 'scene-tree',
        type: 'diagram',
        title: 'Tree insertion',
        sceneTitle: 'Tree insertion',
        narration: 'Insert the value by tracing from the root to the correct child position.',
        learningPoint: 'Tree insertion follows the child path.',
        visualType: 'tree_visual',
        visualTemplate: 'tree_visual',
        visualData: { type: 'tree_visual', nodes: ['root', 'child', 'leaf'] },
      }], [{
        id: 77,
        sourcePage: 61,
        heading: 'Insertion operation',
        nearbyText: 'tree insertion root child path',
        imagePath,
        importanceScore: 0.91,
        associationMethod: 'pdf_byte_offset_estimate',
        associationConfidence: 0.25,
      }]);

      expect(scenes[0].visualType).toBe('tree_visual');
      expect(scenes[0].sourceVisualId).toBeNull();
      expect(scenes[0].sourceVisualIds).toContain(77);
      expect(scenes[0].visualData.imagePath).toBeUndefined();
      expect(scenes[0].visualPlan).toMatchObject({
        sourceVisualUsed: 77,
        fallbackGeneratedVisual: true,
      });
    } finally {
      try { fs.unlinkSync(imagePath); } catch (_) {}
    }
  });

  it('does not replace a code walkthrough with a matching source image', () => {
    const imagePath = path.join(env.UPLOAD_DIR, 'storyboard-code-source-test.jpg');
    fs.mkdirSync(path.dirname(imagePath), { recursive: true });
    fs.writeFileSync(imagePath, Buffer.from('storyboard code source fixture'));
    try {
      const scenes = _internals.attachSourceVisualsToScenes([{
        id: 'scene-code',
        type: 'code_walkthrough',
        title: 'Trace tree insertion',
        narration: 'Trace the insertion operation line by line from the root to a child.',
        visualType: 'code_walkthrough',
        visualTemplate: 'code_walkthrough',
        code: { language: 'java', content: 'Node insert(Node root, int value) {\n  return root;\n}' },
      }], [
        {
          id: 78,
          heading: 'Tree insertion code',
          nearbyText: 'trace insertion root child code',
          imagePath,
          importanceScore: 0.9,
        },
        {
          id: 79,
          heading: 'Additional tree source',
          nearbyText: 'tree root child leaf',
          imagePath,
          importanceScore: 0.8,
        },
      ]);

      expect(scenes[0].visualType).toBe('code_walkthrough');
      expect(scenes[0].code.content).toContain('Node insert');
      expect(scenes[0].sourceVisualIds).toContain(78);
      expect(scenes[0].visualData.imagePath).toBeUndefined();
    } finally {
      try { fs.unlinkSync(imagePath); } catch (_) {}
    }
  });

  it('rejects page-number source references without a real image', () => {
    const validation = _internals.validateVisualRelevance({
      id: 'scene-page',
      title: 'Stack Figure',
      sceneTitle: 'Stack Figure',
      narration: 'Stack push and pop update the top pointer while preserving LIFO order.',
      visualType: 'source_page_reference',
      visualTemplate: 'source_page_reference',
      visualData: {
        type: 'source_page_reference',
        nodes: ['Page 7', 'Stack', 'push'],
      },
      sourceEvidence: [{ chunkId: 1, quote: 'Stack push and pop use LIFO order.' }],
    }, 'Stack');

    expect(validation.passed).toBe(false);
    expect(validation.warnings).toContain('page_number_center_visual');
  });

  it('rejects page-number bubble visuals for any domain', () => {
    const validation = _internals.validateVisualRelevance({
      id: 'scene-network-page',
      title: 'DNS Resolution',
      sceneTitle: 'DNS Resolution',
      narration: 'DNS resolution sends a domain name query to a resolver and returns an IP address.',
      visualType: 'source_page_reference',
      visualTemplate: 'source_page_reference',
      visualData: {
        type: 'source_page_reference',
        nodes: ['Page 12', 'DNS', 'resolver', 'IP address'],
      },
      sourceEvidence: [{ chunkId: 12, quote: 'DNS maps domain names to IP addresses.' }],
    }, 'DNS');

    expect(validation.passed).toBe(false);
    expect(validation.warnings).toContain('page_number_center_visual');
  });

  it('uses the topic-map title and sanitizes uploaded-material narration before scripting', () => {
    const script = scriptFromStoryboard({
      topic: 'Queue',
      topicMap: {
        title: 'Stack / Queue',
        topics: [{ id: 'topic-stack', name: 'Stack' }, { id: 'topic-queue', name: 'Queue' }],
      },
      scenes: [
        {
          id: 'scene-1',
          type: 'diagram',
          title: 'Queue Operation',
          sceneTitle: 'Queue Operation',
          narration: 'The uploaded material is organized around queue operations and stack operations.',
          visualType: 'queue_operation',
          visualTemplate: 'queue_operation',
          visualData: { type: 'queue_operation', nodes: ['queue', 'front pointer', 'rear pointer'], operations: ['enqueue at rear', 'dequeue at front'] },
          sourceEvidence: [{ chunkId: 1, quote: 'Queue operations use FIFO.' }],
        },
      ],
    });

    expect(script.topic).toBe('Stack / Queue');
    expect(script.slides[0].narration).toMatch(/Queue operations use FIFO/i);
    expect(script.slides[0].narration).not.toMatch(/uploaded material is organized/i);
  });

  it('sanitizes generic uploaded-material narration into direct teaching text', () => {
    const narration = _internals.sanitizeNarrationText(
      'The uploaded material is organized around OOP concepts.',
      {
        title: 'OOP Concepts',
        sceneTitle: 'OOP Concepts',
        learningPoint: 'Classes define reusable structure while objects hold concrete state',
        visualType: 'concept_cards',
      },
      'Object-Oriented Programming',
    );

    expect(narration).not.toMatch(/uploaded material|name the rule|point to the visual/i);
    expect(narration).toMatch(/Classes define reusable structure/i);
  });

  it('allocates database storyboard scenes across multiple topics with meaningful generic visuals', () => {
    const topicMap = {
      title: 'ERD / Normalization / SQL / Transactions',
      domain: 'databases',
      topics: [
        { id: 'topic-erd', name: 'ERD', terms: ['entity', 'relationship', 'attribute'], sourceChunkIds: [1], sourceVisualIds: [], requiredVisualTypes: ['comparison_table'], checkpointNeeded: true },
        { id: 'topic-normalization', name: 'Normalization', terms: ['redundancy', 'normal forms'], sourceChunkIds: [2], sourceVisualIds: [], requiredVisualTypes: ['process_flow'], checkpointNeeded: true },
        { id: 'topic-sql', name: 'SQL', terms: ['SELECT', 'FROM', 'WHERE'], sourceChunkIds: [3], sourceVisualIds: [], requiredVisualTypes: ['code_walkthrough'], checkpointNeeded: true },
        { id: 'topic-transactions', name: 'Transactions', terms: ['ACID', 'COMMIT', 'ROLLBACK'], sourceChunkIds: [4], sourceVisualIds: [], requiredVisualTypes: ['process_flow'], checkpointNeeded: true },
      ],
    };
    const chunks = [
      { id: 1, text: 'An ERD shows entities, relationships, attributes, and cardinality.' },
      { id: 2, text: 'Normalization reduces redundancy and avoids update anomalies.' },
      { id: 3, text: 'SQL SELECT statements query tables with SELECT, FROM, and WHERE.' },
      { id: 4, text: 'Transactions follow ACID properties and can COMMIT or ROLLBACK.' },
    ];

    const scenes = _internals.topicMapScenePlan(topicMap, chunks, [], { domain: 'databases' });
    const coveredTopics = new Set(scenes.map(scene => scene.topicId).filter(Boolean));

    expect([...coveredTopics]).toEqual(expect.arrayContaining(['topic-erd', 'topic-normalization', 'topic-sql', 'topic-transactions']));
    expect(scenes.some(scene => scene.visualType === 'process_flow')).toBe(true);
    expect(scenes.some(scene => scene.visualType === 'comparison_table')).toBe(true);
    expect(scenes.every(scene => !/page\s+\d+/i.test(JSON.stringify(scene.visualElements || {})))).toBe(true);
  });

  it('rejects generic scenes before rendering', () => {
    const quality = storyboardQuality({
      topic: 'Polymorphism',
      scenes: [
        {
          id: 'scene-1',
          type: 'diagram',
          title: 'Concept',
          teachingGoal: '',
          narration: 'Trace an example.',
          visualTemplate: 'generic',
          visualData: {},
        },
      ],
    });
    expect(quality.passed).toBe(false);
    expect(quality.warnings.join(' ')).toContain('scene-1');
  });

  it('passes concrete phase-4 scene schema with source evidence', () => {
    const quality = storyboardQuality(
      storyboard([
        groundedScene('scene-1', 'encapsulation_boundary', 'Private Fields'),
        groundedScene('scene-2', 'oop_class_diagram', 'Class API'),
        groundedScene('scene-3', 'code_walkthrough', 'Method Access'),
        groundedScene('scene-4', 'comparison_contrast', 'Bad vs Correct Access'),
        groundedScene('scene-5', 'summary_path', 'Checkpoint Question'),
      ])
    );

    expect(quality.passed).toBe(true);
    expect(quality.minSceneCount).toBe(5);
    expect(quality.targetSceneCount).toBe(8);
    expect(quality.visual.passed).toBe(true);
    expect(quality.visual.coverage.required).toEqual(['encapsulation_boundary', 'class_object', 'code_walkthrough']);
    expect(quality.visual.coverage.present).toEqual(expect.arrayContaining(['encapsulation_boundary', 'class_object', 'code_walkthrough']));
    expect(quality.visual.scenes.every(scene => scene.passed)).toBe(true);
    expect(quality.warnings).toEqual([]);
  });

  it('passes a grounded non-CS storyboard without CS/code requirements', () => {
    const evidence = [
      { chunkId: 10, quote: 'Photosynthesis converts light energy, carbon dioxide, and water into glucose inside chloroplasts.' },
      { chunkId: 11, quote: 'Chlorophyll captures sunlight, and oxygen is released as a product of the process.' },
    ];
    const baseScene = (id, type, title, visualType, nodes, narration) => ({
      id,
      type,
      sceneTitle: title,
      title,
      learningPoint: `${title} explains a concrete source-backed part of photosynthesis from the uploaded material.`,
      visualPurpose: `Use a ${visualType.replace(/_/g, ' ')} visual to connect ${title} to light energy, chloroplasts, glucose, and oxygen.`,
      visualRationale: `${visualType.replace(/_/g, ' ')} is relevant because the viewer needs concrete source-backed biology labels and relationships.`,
      viewerTakeaway: `After seeing the visual, the viewer can apply ${title} to a plant-cell scenario.`,
      visualGrounding: {
        topic: 'Photosynthesis',
        sceneIntent: `show ${title} as a biology relationship`,
        requiredVisualEvidence: ['Photosynthesis', 'Chloroplasts', 'Glucose', 'Oxygen'],
        selectedVisualReason: `${visualType.replace(/_/g, ' ')} was selected to teach photosynthesis from source-backed terms.`,
        sourceBacked: true,
      },
      narration,
      onScreenText: nodes.slice(0, 3),
      visualType,
      visualTemplate: visualType,
      visualElements: {
        type: visualType,
        nodes,
        edges: nodes.slice(1).map(node => [nodes[0], node]),
        operations: ['identify source concept', 'connect process step', 'check the relationship'],
        caption: `${title} uses uploaded source terms.`,
      },
      sourceEvidence: evidence,
      enrichment: { used: false, type: 'none', content: '' },
      motionInstructions: ['Reveal the source-backed biology labels', 'Connect the scenario to the checkpoint'],
      durationSeconds: 20,
    });
    const board = {
      topic: 'Photosynthesis',
      materialUnderstanding: {
        domain: 'science',
        topic: 'Photosynthesis',
        normalizedTopic: 'Photosynthesis',
        confidence: 0.82,
        keyConcepts: ['Photosynthesis', 'Light Energy', 'Chloroplasts', 'Glucose', 'Oxygen'],
        sourceEvidence: evidence,
      },
      grounding: grounding(),
      scenes: [
        baseScene('scene-1', 'mindmap', 'Why Photosynthesis Matters', 'concept_map', ['Photosynthesis', 'Light Energy', 'Glucose', 'Oxygen'], 'Photosynthesis matters because plants use light energy to make glucose and release oxygen. This opening scene anchors the framework in the uploaded biology terms.'),
        baseScene('scene-2', 'definition', 'Source Definition', 'process_flow', ['Light Energy', 'Chloroplasts', 'Carbon Dioxide', 'Glucose', 'Oxygen'], 'The source definition turns photosynthesis into a process: chloroplasts use light energy, carbon dioxide, and water to produce glucose while oxygen is released.'),
        baseScene('scene-3', 'deep_explanation', 'Leaf Scenario Example', 'process_flow', ['Leaf', 'Sunlight', 'Chlorophyll', 'Glucose', 'Oxygen'], 'Example scenario: a leaf receives sunlight, chlorophyll captures the energy, and the plant produces glucose. The viewer should see how the source terms fit into one process.'),
        baseScene('scene-4', 'common_mistakes', 'Food From Soil Mistake', 'comparison_contrast', ['Mistake', 'Soil food only', 'Glucose production', 'Chloroplasts'], 'The common mistake is saying plants get all food from soil. The corrected view explains glucose production through light energy and chloroplasts.'),
        baseScene('scene-5', 'checkpoint', 'Mini Checkpoint and Recap', 'summary_path', ['Photosynthesis checkpoint', 'Chloroplasts capture light', 'Glucose production', 'Oxygen release'], 'Checkpoint question: which cell structure captures light energy for photosynthesis? The recap names chloroplasts and connects them to glucose production and oxygen release.'),
      ],
    };

    const quality = storyboardQuality(board);

    expect(quality.passed).toBe(true);
    expect(quality.warnings).toEqual([]);
    expect(JSON.stringify(board).toLowerCase()).not.toMatch(/search algorithm|stack|queue|object-oriented|java/);
  });

  it('passes source-led anatomy storyboard scenes with cards, tables, and no forced diagram', () => {
    const evidence = [
      { chunkId: 20, sourcePage: 2, quote: 'The skeletal system supports the body, stores minerals, produces red blood cells, protects organs, and enables movement.' },
      { chunkId: 21, sourcePage: 3, quote: 'The axial skeleton includes the skull, vertebral column, ribs, and sternum.' },
      { chunkId: 22, sourcePage: 4, quote: 'The appendicular skeleton includes limb bones and girdles.' },
    ];
    const scene = (id, type, title, visualType, nodes, narration) => ({
      id,
      type,
      sceneTitle: title,
      title,
      learningPoint: `${title} explains source-backed skeletal system content from the uploaded anatomy material.`,
      visualPurpose: visualType === 'no_visual'
        ? `Use source-led narration for ${title} without forcing a diagram.`
        : `Use ${visualType.replace(/_/g, ' ')} to make ${title} concrete from the uploaded anatomy source.`,
      visualRationale: `${visualType.replace(/_/g, ' ')} is selected because this scene is clearer as source terms, cards, or tables rather than a generic map.`,
      viewerTakeaway: `The learner can explain ${title} using source evidence.`,
      visualGrounding: {
        topic: 'The Skeletal System',
        sceneIntent: `teach ${title} from source evidence`,
        requiredVisualEvidence: nodes.length ? nodes : ['source narration', 'learner takeaway'],
        selectedVisualReason: 'The visual choice follows the uploaded source structure.',
        sourceBacked: true,
      },
      narration,
      onScreenText: nodes.slice(0, 3).length ? nodes.slice(0, 3) : [title, 'Source evidence'],
      visualType,
      visualTemplate: visualType,
      visualElements: {
        type: visualType,
        nodes,
        edges: [],
        operations: nodes.map(node => `${node}: source detail`),
        caption: `${title} uses uploaded source terms.`,
      },
      sourceEvidence: evidence,
      enrichment: { used: false, type: 'none', content: '' },
      motionInstructions: ['Reveal source terms', 'Connect detail to review'],
      durationSeconds: 20,
    });
    const board = {
      topic: 'The Skeletal System',
      materialUnderstanding: {
        domain: 'science',
        topic: 'The Skeletal System',
        normalizedTopic: 'The Skeletal System',
        confidence: 0.86,
        keyConcepts: ['Skeletal System', 'Axial Skeleton', 'Appendicular Skeleton', 'Bone Shapes'],
        sourceEvidence: evidence,
      },
      grounding: grounding(),
      scenes: [
        scene('scene-1', 'hook', 'Why The Skeleton Matters', 'no_visual', [], 'The skeletal system is not just a set of bone names. The source says it supports the body, protects organs, stores minerals, produces red blood cells, and enables movement, so the opening scene stays source-led.'),
        scene('scene-2', 'definition', 'Core Functions', 'concept_cards', ['Support', 'Protection', 'Mineral storage', 'Blood cell production'], 'The source lists major skeletal functions: support, protection, mineral storage, red blood cell production, and movement. These cards turn the uploaded terms into a concrete study path.'),
        scene('scene-3', 'deep_explanation', 'Axial And Appendicular', 'classification_table', ['Axial skeleton', 'Appendicular skeleton', 'Skull and vertebral column', 'Limb bones and girdles'], 'A source-based example compares axial skeleton parts with appendicular skeleton parts. The classification table keeps skull, vertebral column, limb bones, and girdles in the right source categories.'),
        scene('scene-4', 'common_mistakes', 'Classification Mistake', 'comparison_table', ['Mistake: memorize bone names only', 'Correction: connect each bone group to its function'], 'The common misunderstanding is memorizing labels without the supporting function. The correction is to explain how each group supports, protects, stores minerals, or enables movement.'),
        scene('scene-5', 'checkpoint', 'Review Question And Recap', 'concept_cards', ['Which skeleton includes the skull?', 'Axial skeleton', 'Functions recap'], 'Checkpoint question: which skeleton includes the skull and vertebral column? The recap connects the answer to the source classification and the functions of the skeletal system.'),
      ],
    };

    const quality = storyboardQuality(board);

    expect(quality.passed).toBe(true);
    expect(quality.warnings).toEqual([]);
    expect(quality.visual.coverage.required).toEqual([]);
    expect(JSON.stringify(board).toLowerCase()).not.toMatch(/hash function|bucket|collision|queue|stack|java/);
  });

  it('blocks unrelated hashing drift in non-CS storyboards', () => {
    const evidence = [{ chunkId: 1, quote: 'The skeletal system supports the body and protects organs.' }];
    const safeScene = (id, type, title, visualType, nodes, narration) => ({
      id,
      type,
      sceneTitle: title,
      title,
      learningPoint: `${title} explains source-backed skeletal content.`,
      visualPurpose: `Use ${visualType.replace(/_/g, ' ')} to make ${title} concrete.`,
      visualRationale: 'The visual is source-backed and uses uploaded material terms.',
      viewerTakeaway: `The learner can explain ${title} from source evidence.`,
      visualGrounding: { sceneIntent: `teach ${title}`, selectedVisualReason: 'source-backed visual', requiredVisualEvidence: nodes, sourceBacked: true },
      narration,
      onScreenText: nodes.slice(0, 3),
      visualType,
      visualTemplate: visualType,
      visualElements: { type: visualType, nodes, operations: nodes.map(node => `${node}: source detail`) },
      sourceEvidence: evidence,
    });
    const board = {
      topic: 'The Skeletal System',
      materialUnderstanding: {
        domain: 'science',
        topic: 'The Skeletal System',
        normalizedTopic: 'The Skeletal System',
        confidence: 0.8,
        keyConcepts: ['Skeletal System', 'Bones', 'Protection'],
        sourceEvidence: evidence,
      },
      grounding: grounding(),
      scenes: [
        {
          id: 'scene-1',
          type: 'definition',
          sceneTitle: 'Skeletal Overview',
          title: 'Skeletal Overview',
          learningPoint: 'Explain the skeletal system from source evidence.',
          visualPurpose: 'Use cards to teach source terms.',
          visualRationale: 'Cards are source-backed.',
          viewerTakeaway: 'Bones protect organs.',
          visualGrounding: { sceneIntent: 'source', selectedVisualReason: 'source', requiredVisualEvidence: ['bones'], sourceBacked: true },
          narration: 'The skeletal system protects organs, but this scene incorrectly says a hash function maps a key to a bucket and collision handling resolves indexes.',
          onScreenText: ['Bones protect organs'],
          visualType: 'concept_cards',
          visualTemplate: 'concept_cards',
          visualElements: { type: 'concept_cards', nodes: ['Bones', 'Protection'], operations: ['source detail'] },
          sourceEvidence: evidence,
        },
        safeScene('scene-2', 'definition', 'Core Functions', 'concept_cards', ['Support', 'Protection'], 'The source says bones support and protect the body with concrete evidence.'),
        safeScene('scene-3', 'deep_explanation', 'Source Example', 'classification_table', ['Bones', 'Organs'], 'A source-based example connects bones to organ protection and body support.'),
        safeScene('scene-4', 'common_mistakes', 'Common Mistake', 'comparison_table', ['Mistake', 'Correction'], 'The common mistake is memorizing labels without explaining support and protection.'),
        safeScene('scene-5', 'checkpoint', 'Checkpoint Recap', 'concept_cards', ['Question', 'Answer'], 'Checkpoint: explain one skeletal function from the uploaded material and recap the source evidence.'),
      ],
    };

    const quality = storyboardQuality(board);

    expect(quality.warnings).toContain('domain:unrelated_cs_injection');
    expect(classifyWarnings(quality.warnings).critical).toContain('domain:unrelated_cs_injection');
  });

  it('selects canonical visual types from topic and scene intent', () => {
    expect(_internals.visualTemplateFor({
      type: 'diagram',
      title: 'Private fields block direct access',
      narration: 'Show client.count = -5 blocked and public increment() allowed.',
      visual: { type: 'class_diagram' },
    }, 'Encapsulation in Java')).toBe('encapsulation_boundary');

    expect(_internals.visualTemplateFor({
      type: 'diagram',
      title: 'Insert after the head node',
      narration: 'Trace head, node.next, and null pointer updates in a linked list.',
      visual: { type: 'mindmap' },
    }, 'Linked Lists')).toBe('linked_list_operation');

    expect(_internals.visualTemplateFor({
      type: 'complexity',
      title: 'Linear versus quadratic growth',
      narration: 'Compare O(n) and O(n^2) as input size grows.',
      visual: { type: 'summary' },
    }, 'Big-O')).toBe('big_o_growth');

    expect(_internals.visualTemplateFor({
      type: 'objectives',
      title: 'Learning goals',
      narration: 'Preview the concrete targets for the lesson.',
      visual: { type: 'summary' },
    }, 'Classes and Objects')).toBe('learning_objectives');

    expect(_internals.visualTemplateFor({
      domain: 'science',
      type: 'objectives',
      title: 'Learning goals',
      narration: 'Preview skeletal system functions and classifications from the source.',
      visual: { type: 'summary' },
    }, 'The Skeletal System')).toBe('concept_cards');
  });

  it('keeps canonical scene visual type and payload type aligned', () => {
    const elements = _internals.visualElementsFor({
      visualType: 'encapsulation_boundary',
      visualTemplate: 'encapsulation_boundary',
      visualData: {
        type: 'class_diagram',
        nodes: ['Counter class', '- count: int private field', '+ increment() public method'],
      },
    }, {}, 'Encapsulation in Java');

    expect(elements.type).toBe('encapsulation_boundary');
    expect(elements.nodes).toContain('Counter class');
  });

  it('rejects concept maps used as fallback for concrete diagram scenes', () => {
    const fallbackScene = groundedScene('scene-1', 'concept_map', 'Private Fields');
    fallbackScene.type = 'diagram';
    fallbackScene.visualElements = {
      type: 'concept_map',
      nodes: ['Encapsulation', 'Private fields', 'Public methods'],
      operations: [],
    };
    const quality = storyboardQuality(
      storyboard([
        fallbackScene,
        groundedScene('scene-2', 'encapsulation_boundary', 'Class Boundary'),
        groundedScene('scene-3', 'class_object', 'Class vs Object'),
        groundedScene('scene-4', 'comparison_contrast', 'Bad vs Correct Access'),
        groundedScene('scene-5', 'code_walkthrough', 'Controlled API'),
      ])
    );

    expect(quality.passed).toBe(false);
    expect(quality.warnings).toContain('scene-1:generic_fallback_not_allowed');
  });

  it('rejects concept maps whose nodes are not source-backed', () => {
    const weakMap = groundedScene('scene-1', 'summary_path', 'Decorative Recap');
    weakMap.type = 'recap';
    weakMap.visualElements = {
      type: 'summary_path',
      nodes: ['Journey', 'Power', 'Potential'],
      operations: ['recap source-backed concepts'],
    };
    const quality = storyboardQuality(
      storyboard([
        weakMap,
        groundedScene('scene-2', 'encapsulation_boundary', 'Class Boundary'),
        groundedScene('scene-3', 'class_object', 'Class vs Object'),
        groundedScene('scene-4', 'comparison_contrast', 'Bad vs Correct Access'),
        groundedScene('scene-5', 'code_walkthrough', 'Controlled API'),
      ])
    );

    expect(quality.passed).toBe(false);
    expect(quality.warnings).toContain('scene-1:concept_map_nodes_not_source_backed');
  });

  it('repairs generated mental-model and checkpoint visuals with source-backed labels', () => {
    const evidence = [
      { chunkId: 31, quote: 'A class is a blueprint that defines fields, methods, state, and behavior.' },
      { chunkId: 35, quote: 'Encapsulation hides private fields and exposes public methods for controlled access.' },
    ];
    const mentalModel = groundedScene('4-deep-explanation-mental-model', 'comparison_contrast', 'Mental Model');
    mentalModel.type = 'deep_explanation';
    mentalModel.learningPoint = 'Connect the rule of Classes and Objects in Java to a mental model.';
    mentalModel.narration = 'Encapsulation bundles data and the methods that operate on that data inside a single unit - the class. The class hides its internal representation with private fields and exposes public methods for clients.';
    mentalModel.visualElements = {
      type: 'comparison_contrast',
      nodes: ['Mental model', 'Classes and Objects in Java', 'What matches', 'Where it breaks'],
      edges: [['Mental model', 'What matches'], ['What matches', 'Classes and Objects in Java']],
      operations: [],
    };
    mentalModel.sourceEvidence = evidence;

    const checkpoint = groundedScene('11-checkpoint-mini-checkpoint', 'summary_path', 'Mini Checkpoint');
    checkpoint.type = 'checkpoint';
    checkpoint.learningPoint = 'Check whether you can apply Classes and Objects in Java.';
    checkpoint.narration = 'Explain Classes and Objects in Java in one sentence and give one source-backed example using class fields and object methods.';
    checkpoint.visualElements = {
      type: 'summary_path',
      nodes: ['Question', 'Think', 'Answer', 'Reason'],
      edges: [['Question', 'Think'], ['Think', 'Answer'], ['Answer', 'Reason']],
      operations: [],
    };
    checkpoint.sourceEvidence = evidence;

    const quality = storyboardQuality(storyboard([
      groundedScene('scene-1', 'class_object', 'Class Blueprint'),
      mentalModel,
      groundedScene('scene-3', 'code_walkthrough', 'Method Access'),
      groundedScene('scene-4', 'encapsulation_boundary', 'Controlled Access'),
      checkpoint,
    ], {
      topic: 'Classes and Objects in Java',
      materialUnderstanding: understanding({
        topic: 'Classes and Objects in Java',
        normalizedTopic: 'Classes and Objects',
        keyConcepts: ['class', 'object', 'fields', 'methods'],
        sourceEvidence: evidence,
      }),
    }));

    expect(quality.warnings.join(' ')).not.toContain('4-deep-explanation-mental-model:narration_visual_mismatch');
    expect(quality.warnings.join(' ')).not.toContain('11-checkpoint-mini-checkpoint:concept_map_nodes_not_source_backed');
  });

  it('requires visual grounding schema fields on scenes', () => {
    const missingVisualGrounding = groundedScene('scene-1', 'encapsulation_boundary', 'Private Fields');
    delete missingVisualGrounding.visualPurpose;
    delete missingVisualGrounding.visualGrounding;
    const quality = storyboardQuality(
      storyboard([
        missingVisualGrounding,
        groundedScene('scene-2', 'class_object', 'Class API'),
        groundedScene('scene-3', 'code_walkthrough', 'Method Access'),
        groundedScene('scene-4', 'comparison_contrast', 'Bad vs Correct Access'),
        groundedScene('scene-5', 'summary_path', 'Controlled API'),
      ])
    );

    expect(quality.passed).toBe(false);
    expect(quality.warnings).toContain('scene-1:missing_visual_purpose');
    expect(quality.warnings).toContain('scene-1:missing_visual_grounding');
  });

  it('flags vague scenes that have no concrete visual grounding', () => {
    const quality = storyboardQuality(
      storyboard([
        {
          id: 'scene-1',
          type: 'hook',
          sceneTitle: 'A visual journey into OOP',
          learningPoint: 'Explore the concept through a dynamic learning experience.',
          narration: 'This is a visual journey into OOP that unlocks your potential and explores the concept in a broad inspirational way without a concrete example.',
          onScreenText: ['Visual journey', 'Explore the concept'],
          visualType: 'learning_map',
          visualTemplate: 'learning_map',
          visualElements: { type: 'mindmap', nodes: ['Journey', 'Concept', 'Potential'] },
          sourceEvidence: [{ chunkId: 1, quote: 'Encapsulation hides internal state.' }],
        },
      ])
    );

    expect(quality.passed).toBe(false);
    expect(quality.warnings.join(' ')).toContain('vague_scene_without_concrete_grounding');
    expect(quality.warnings.join(' ')).toContain('vague_visual');
  });

  it('flags decorative-only visuals that do not teach the scene', () => {
    const decorative = groundedScene('scene-1', 'concept_map', 'Decorative Glow');
    decorative.learningPoint = 'Decorative glowing particles create an abstract vibe instead of explaining Encapsulation.';
    decorative.visualPurpose = 'Use cinematic glowing orbs as an abstract decorative background.';
    decorative.visualRationale = 'The visual is aesthetic and decorative rather than educational.';
    decorative.viewerTakeaway = 'The viewer sees an abstract random animation.';
    decorative.visualElements = { type: 'mindmap', nodes: ['Glow', 'Vibe', 'Energy'], edges: [] };
    decorative.code = null;
    decorative.codeSnippet = '';
    const quality = storyboardQuality(
      storyboard([
        decorative,
        groundedScene('scene-2', 'encapsulation_boundary', 'Class Boundary'),
        groundedScene('scene-3', 'class_object', 'Class vs Object'),
        groundedScene('scene-4', 'comparison_contrast', 'Bad vs Correct Access'),
        groundedScene('scene-5', 'code_walkthrough', 'Controlled API'),
      ])
    );

    expect(quality.passed).toBe(false);
    expect(quality.warnings).toContain('scene-1:decorative_only_visual');
  });

  it('flags unsupported visual types before render', () => {
    const quality = storyboardQuality(
      storyboard([
        {
          ...groundedScene('scene-1', 'cinematic_glow_shapes', 'Private Fields'),
          visualElements: {
            type: 'cinematic_glow_shapes',
            nodes: ['Private fields', 'Public methods', 'Object state'],
            operations: ['pulse glow'],
          },
        },
        groundedScene('scene-2', 'encapsulation_boundary', 'Class Boundary'),
        groundedScene('scene-3', 'class_object', 'Class vs Object'),
        groundedScene('scene-4', 'comparison_contrast', 'Bad vs Correct Access'),
        groundedScene('scene-5', 'summary_path', 'Controlled API'),
      ])
    );

    expect(quality.passed).toBe(false);
    expect(quality.warnings.join(' ')).toContain('unsupported_visual_type:cinematic_glow_shapes');
  });

  it('rejects supported visual types when the diagram is unrelated to the learning point', () => {
    const unrelated = groundedScene('scene-1', 'linked_list_operation', 'Private Fields');
    unrelated.visualElements = {
      type: 'linked_list_operation',
      nodes: ['head pointer', 'node.next', 'null terminator'],
      edges: [['head pointer', 'node.next'], ['node.next', 'null terminator']],
      operations: ['insert after head', 'advance next pointer'],
    };
    const quality = storyboardQuality(
      storyboard([
        unrelated,
        groundedScene('scene-2', 'encapsulation_boundary', 'Class Boundary'),
        groundedScene('scene-3', 'class_object', 'Class vs Object'),
        groundedScene('scene-4', 'comparison_contrast', 'Bad vs Correct Access'),
        groundedScene('scene-5', 'code_walkthrough', 'Method Access'),
      ])
    );

    expect(quality.passed).toBe(false);
    expect(quality.visual.passed).toBe(false);
    expect(quality.warnings).toContain('scene-1:unrelated_diagram');
    expect(quality.warnings).toContain('scene-1:narration_visual_mismatch');
  });

  it('rejects narration that does not match an otherwise concrete diagram', () => {
    const mismatch = groundedScene('scene-1', 'encapsulation_boundary', 'Private Fields');
    mismatch.narration = 'A binary tree traversal starts at the root, visits each child, and moves toward leaf nodes while tracking parent edges. The explanation follows branches and search order across a hierarchy, so it describes a different data-structure diagram.';
    const quality = storyboardQuality(
      storyboard([
        mismatch,
        groundedScene('scene-2', 'encapsulation_boundary', 'Class Boundary'),
        groundedScene('scene-3', 'class_object', 'Class vs Object'),
        groundedScene('scene-4', 'comparison_contrast', 'Bad vs Correct Access'),
        groundedScene('scene-5', 'code_walkthrough', 'Method Access'),
      ])
    );

    expect(quality.passed).toBe(false);
    expect(quality.visual.passed).toBe(false);
    expect(quality.warnings).toContain('scene-1:narration_visual_mismatch');
  });

  it('rejects generic technical filler as missing and vague visual evidence', () => {
    const filler = groundedScene('scene-1', 'class_object', 'Class API');
    filler.visualElements = {
      type: 'class_object',
      nodes: ['System', 'Component', 'Data', 'Process'],
      edges: [],
      operations: ['animate process'],
    };
    const quality = storyboardQuality(
      storyboard([
        filler,
        groundedScene('scene-2', 'encapsulation_boundary', 'Class Boundary'),
        groundedScene('scene-3', 'class_object', 'Class vs Object'),
        groundedScene('scene-4', 'comparison_contrast', 'Bad vs Correct Access'),
        groundedScene('scene-5', 'code_walkthrough', 'Method Access'),
      ])
    );

    expect(quality.passed).toBe(false);
    expect(quality.visual.passed).toBe(false);
    expect(quality.warnings).toContain('scene-1:missing_visual_elements');
    expect(quality.warnings).toContain('scene-1:vague_visual');
    expect(quality.warnings).toContain('scene-1:unrelated_diagram');
  });

  it('fails the hard gate when topic detection metadata is missing', () => {
    const quality = storyboardQuality({
      topic: 'Encapsulation in Java',
      grounding: grounding(),
      scenes: [
        groundedScene('scene-1', 'encapsulation_boundary', 'Private Fields'),
        groundedScene('scene-2', 'class_object', 'Class API'),
        groundedScene('scene-3', 'code_walkthrough', 'Method Access'),
        groundedScene('scene-4', 'comparison_contrast', 'Bad vs Correct Access'),
        groundedScene('scene-5', 'summary_path', 'Controlled API'),
      ],
    });

    expect(quality.passed).toBe(false);
    expect(quality.warnings).toContain('topic:missing_detection');
  });

  it('fails the hard gate for weak detection evidence', () => {
    const quality = storyboardQuality(
      storyboard([
        groundedScene('scene-1', 'encapsulation_boundary', 'Private Fields'),
        groundedScene('scene-2', 'class_object', 'Class API'),
        groundedScene('scene-3', 'code_walkthrough', 'Method Access'),
        groundedScene('scene-4', 'comparison_contrast', 'Bad vs Correct Access'),
        groundedScene('scene-5', 'summary_path', 'Controlled API'),
      ], {
        materialUnderstanding: understanding({
          confidence: 0.51,
          keyConcepts: ['class'],
          sourceEvidence: [{ chunkId: 1, quote: 'Encapsulation hides state.' }],
        }),
      })
    );

    expect(quality.passed).toBe(false);
    expect(quality.warnings).toContain('topic:low_confidence');
    expect(quality.warnings).toContain('topic:insufficient_key_concepts');
    expect(quality.warnings).toContain('topic:insufficient_source_evidence');
  });

  it('requires OOP storyboards to include a class/object style visual and code', () => {
    const quality = storyboardQuality(
      storyboard([
        groundedScene('scene-1', 'comparison_contrast', 'Compare access paths'),
        groundedScene('scene-2', 'summary_path', 'Controlled access'),
        groundedScene('scene-3', 'process_flow', 'Method call flow'),
        groundedScene('scene-4', 'learning_objectives', 'Learning goals'),
        groundedScene('scene-5', 'concept_map', 'Key terms'),
      ])
    );

    expect(quality.passed).toBe(false);
    expect(quality.warnings).toContain('domain:oop_missing_class_object_visual');
    expect(quality.warnings).toContain('domain:missing_code_scene');
    expect(classifyWarnings(quality.warnings).critical).toContain('domain:missing_code_scene');
  });

  it('warns when supported CS storyboards omit a common mistake or checkpoint scene', () => {
    const quality = storyboardQuality(
      storyboard([
        groundedScene('scene-1', 'encapsulation_boundary', 'Private Fields'),
        groundedScene('scene-2', 'class_object', 'Class API'),
        groundedScene('scene-3', 'code_walkthrough', 'Method Access'),
        groundedScene('scene-4', 'process_flow', 'Controlled Access Flow'),
        groundedScene('scene-5', 'summary_path', 'Controlled API'),
      ])
    );

    expect(quality.warnings).toContain('domain:missing_common_mistake_scene');
    expect(quality.warnings).toContain('domain:missing_checkpoint_scene');
    expect(classifyWarnings(quality.warnings).critical).not.toContain('domain:missing_common_mistake_scene');
    expect(classifyWarnings(quality.warnings).critical).not.toContain('domain:missing_checkpoint_scene');
  });

  it('warns when a curated topic matched but the concrete curated example is missing', () => {
    const quality = storyboardQuality(
      storyboard([
        groundedScene('scene-1', 'encapsulation_boundary', 'Private Fields'),
        groundedScene('scene-2', 'class_object', 'Class API'),
        groundedScene('scene-3', 'code_walkthrough', 'Method Access'),
        groundedScene('scene-4', 'comparison_contrast', 'Bad vs Correct Access'),
        groundedScene('scene-5', 'summary_path', 'Checkpoint Question'),
      ], {
        grounding: grounding({
          educationalContext: {
            curatedMatched: true,
            curatedTopicId: 'oop_encapsulation',
          },
        }),
      })
    );

    expect(quality.warnings).toContain('curated:missing_required_example');
  });

  it('warns when all visual nodes are generic placeholders', () => {
    const genericScene = groundedScene('scene-1', 'class_object', 'Generic Parts');
    genericScene.visualElements = {
      type: 'class_object',
      nodes: ['Definition', 'Rule', 'Example', 'Boundary'],
      edges: [['Definition', 'Rule']],
      operations: [],
    };
    const quality = storyboardQuality(
      storyboard([
        genericScene,
        { ...genericScene, id: 'scene-2' },
        { ...genericScene, id: 'scene-3', code: { language: 'java', content: 'class A {}' }, codeSnippet: 'class A {}' },
        { ...genericScene, id: 'scene-4', title: 'Common mistake' },
        { ...genericScene, id: 'scene-5', title: 'Checkpoint question' },
      ])
    );

    expect(quality.warnings).toContain('domain:generic_visual_nodes_only');
  });

  it('requires Data Structure storyboards to include operation/state visuals', () => {
    const quality = storyboardQuality(
      storyboard([
        groundedScene('scene-1', 'comparison_contrast', 'Compare representations'),
        groundedScene('scene-2', 'summary_path', 'Linked list summary'),
        groundedScene('scene-3', 'code_walkthrough', 'Node code'),
        groundedScene('scene-4', 'learning_objectives', 'Learning goals'),
        groundedScene('scene-5', 'concept_map', 'Key terms'),
      ], {
        topic: 'Linked Lists',
        materialUnderstanding: understanding({
          domain: 'Data Structures',
          topic: 'Linked Lists',
          normalizedTopic: 'Linked Lists',
          keyConcepts: ['node', 'head', 'next', 'insert'],
        }),
      })
    );

    expect(quality.passed).toBe(false);
    expect(quality.warnings).toContain('domain:data_structure_missing_operation_visual');
  });

  it('requires Algorithm storyboards to include flow or complexity visuals', () => {
    const quality = storyboardQuality(
      storyboard([
        groundedScene('scene-1', 'comparison_contrast', 'Compare runtimes'),
        groundedScene('scene-2', 'summary_path', 'Big-O summary'),
        groundedScene('scene-3', 'code_walkthrough', 'Loop code'),
        groundedScene('scene-4', 'learning_objectives', 'Learning goals'),
        groundedScene('scene-5', 'concept_map', 'Key terms'),
      ], {
        topic: 'Big-O',
        materialUnderstanding: understanding({
          domain: 'Algorithms',
          topic: 'Big-O',
          normalizedTopic: 'Big-O',
          keyConcepts: ['growth rate', 'constant time', 'linear time', 'nested loops'],
        }),
      })
    );

    expect(quality.passed).toBe(false);
    expect(quality.warnings).toContain('domain:algorithm_missing_flow_or_complexity_visual');
  });

  it('fails the hard gate when enrichment drifts topic', () => {
    const quality = storyboardQuality(
      storyboard([
        { ...groundedScene('scene-1', 'encapsulation_boundary', 'Private Fields'), enrichment: { used: true, type: 'example', content: 'A linked list node stores data and next pointers.' } },
        groundedScene('scene-2', 'class_object', 'Class API'),
        groundedScene('scene-3', 'code_walkthrough', 'Method Access'),
        groundedScene('scene-4', 'comparison_contrast', 'Bad vs Correct Access'),
        groundedScene('scene-5', 'summary_path', 'Controlled API'),
      ], {
        grounding: grounding({
          topicDriftRisk: 'high',
          enrichmentUsed: true,
          enrichmentValidation: {
            passed: false,
            issues: ['scene-1:enrichment_unrelated_topics:Linked Lists'],
            topicDriftRisk: 'high',
          },
        }),
      })
    );

    expect(quality.passed).toBe(false);
    expect(quality.warnings).toContain('grounding:topic_drift_risk_high');
    expect(quality.warnings).toContain('enrichment:validation_failed');
  });

  it('does not block concrete encapsulation maps as generic visuals', () => {
    const quality = storyboardQuality({
      topic: 'Encapsulation',
      scenes: [
        {
          id: 'hook-encapsulation',
          type: 'hook',
          title: 'Encapsulation',
          teachingGoal: 'Understand why encapsulation protects object state.',
          narration: 'Encapsulation keeps state changes behind controlled methods so an object can protect its invariant and avoid invalid values.',
          visualTemplate: 'learning_map',
          visualData: {
            type: 'mindmap',
            nodes: ['Encapsulation', 'Private fields', 'Public methods', 'Validation', 'Class invariant'],
          },
        },
      ],
    });

    expect(quality.warnings.join(' ')).not.toContain('generic_visual_template');
  });

  it('keeps storyboard render scripts free of callouts and sentence focus bullets', () => {
    const script = scriptFromStoryboard({
      topic: 'Polymorphism',
      scenes: [
        {
          id: 'scene-1',
          type: 'diagram',
          title: 'Runtime Dispatch',
          teachingGoal: 'See how the runtime object chooses the overridden method.',
          narration: 'A Shape reference can point at a Circle object, so the call dispatches to Circle.area at runtime.',
          visualTemplate: 'polymorphism_dispatch',
          visualData: { nodes: ['Shape reference', 'Circle object', 'Circle.area()'] },
          code: { language: 'java', content: 'Shape s = new Circle();\ns.area();', highlightLines: [1, 2], walkthrough: [] },
          durationSec: 12,
        },
      ],
    });
    expect(script.slides).toHaveLength(1);
    expect(script.slides[0].callouts).toEqual([]);
    expect(script.slides[0].bullets.every(b => b.split(/\s+/).length <= 5)).toBe(true);
    expect(JSON.stringify(script)).not.toMatch(/Trace an example|Code sketch|Define the idea/i);
  });

  it('compacts generated objective sentences before render scoring', () => {
    const script = scriptFromStoryboard({
      topic: 'Classes and Objects in Java',
      scenes: [
        {
          id: 'scene-1',
          type: 'objectives',
          title: 'What You Will Be Able To Do',
          narration: 'This scene lists the concrete goals for classes and objects in Java before the lesson moves into code and diagrams.',
          onScreenText: ['Explain how encapsulation is achieved', '**class** is blueprint defines data'],
          visualType: 'class_object',
          visualElements: {
            type: 'class_diagram',
            nodes: ['Person class', 'alice object', 'private state'],
          },
          sourceEvidence: [{ chunkId: 1, quote: 'A class is a blueprint and an object is an instance.' }],
        },
      ],
    });

    expect(script.slides[0].bullets).toEqual(['Encapsulation goal', 'class is blueprint defines data']);
    expect(script.slides[0].bullets.every(b => b.split(/\s+/).length <= 5)).toBe(true);
  });

  it('keeps hash-table scenes on a concrete hash-table visual template', () => {
    const script = scriptFromStoryboard({
      topic: 'Hash Table',
      scenes: [
        {
          id: 'scene-1',
          type: 'diagram',
          title: 'Key to Bucket',
          teachingGoal: 'Trace key to hash function to bucket index and collision chain.',
          narration: 'A hash table computes a hash from the key, converts it to a bucket index, then checks entries in that bucket to handle collisions.',
          visualTemplate: 'hash_table_operation',
          visualData: {
            type: 'hash_table',
            nodes: ['key "cat"', 'hash(key)', 'index = hash mod buckets', 'bucket 2', '(cat, 41)', '(cot, 19)', 'collision chain'],
            operations: ['hash', 'mod', 'lookup', 'collision'],
          },
          durationSec: 12,
        },
      ],
    });
    expect(script.slides[0].visual_type).toBe('hash_table');
    expect(script.slides[0].visual_nodes.join(' ')).toMatch(/bucket|collision/i);
  });

  it('flags material-wide DS storyboards that only cover one topic from the detected bundle', () => {
    const dsUnderstanding = understanding({
      domain: 'Data Structures',
      topic: 'Stack / Queue / Priority Queue / Deque',
      normalizedTopic: 'Stack / Queue / Priority Queue / Deque',
      keyConcepts: ['Stack', 'Queue', 'Priority Queue', 'Deque', 'LIFO', 'FIFO'],
      sourceTopicPlan: {
        topicMode: 'material_wide',
        topicBundle: [
          { topic: 'Stack', terms: ['stack', 'lifo', 'push', 'pop'] },
          { topic: 'Queue', terms: ['queue', 'fifo', 'enqueue', 'dequeue'] },
          { topic: 'Priority Queue', terms: ['priority queue', 'heap'] },
          { topic: 'Deque', terms: ['deque', 'double ended queue'] },
        ],
      },
    });
    const queueScene = {
      id: 'queue-only',
      type: 'diagram',
      sceneTitle: 'Queue FIFO Operation',
      title: 'Queue FIFO Operation',
      teachingGoal: 'Explain enqueue and dequeue with front and rear pointers.',
      learningPoint: 'A queue uses FIFO order with front and rear pointers.',
      narration: 'The uploaded material explains queue operations: enqueue adds at the rear and dequeue removes from the front, preserving FIFO order for the queue.',
      onScreenText: ['Queue FIFO', 'front pointer', 'rear pointer'],
      visualType: 'queue_operation',
      visualTemplate: 'queue_operation',
      visualData: {
        type: 'queue_operation',
        nodes: ['queue', 'front pointer', 'rear pointer', 'enqueue', 'dequeue'],
        operations: ['enqueue at rear', 'dequeue from front'],
      },
      code: { language: 'python', content: 'queue.append(x)\nqueue.popleft()', lineRange: '1-2', highlightLines: [1, 2], walkthrough: [] },
      sourceEvidence: [{ chunkId: 1, quote: 'Queues use FIFO. Enqueue at rear and dequeue at front.' }],
    };
    const board = storyboard([
      queueScene,
      { ...queueScene, id: 'queue-2', sceneTitle: 'Queue Rear Pointer' },
      { ...queueScene, id: 'queue-3', sceneTitle: 'Queue Front Pointer' },
      { ...queueScene, id: 'queue-4', sceneTitle: 'Queue Underflow' },
      { ...queueScene, id: 'queue-5', sceneTitle: 'Queue Recap', type: 'recap' },
    ], {
      topic: 'Stack / Queue / Priority Queue / Deque',
      materialUnderstanding: dsUnderstanding,
    });

    const quality = storyboardQuality(board);
    expect(quality.warnings.join(' ')).toContain('topic:missing_bundle_coverage');
    expect(quality.warnings.join(' ')).toMatch(/Stack|Priority Queue|Deque/);
  });

  it('carries extracted source image references into render scripts', () => {
    const script = scriptFromStoryboard({
      topic: 'Queue',
      scenes: [
        {
          id: 'scene-source',
          type: 'diagram',
          title: 'Queue Figure',
          sceneTitle: 'Queue Figure',
          narration: 'The source figure shows enqueue at the rear and dequeue from the front.',
          onScreenText: ['Queue operation', 'Page 2'],
          visualType: 'source_page_reference',
          visualTemplate: 'source_page_reference',
          visualData: {
            type: 'source_page_reference',
            nodes: ['Queue operation', 'front pointer', 'rear pointer'],
            caption: 'Page 2: queue operation diagram',
            imagePath: 'uploads/source-visuals/1/queue.png',
            sourceVisualId: 42,
            sourcePage: 2,
            ocrText: 'enqueue rear dequeue front',
            nearbyText: 'Queue operation diagram from the uploaded material',
          },
        },
      ],
    });

    expect(script.slides[0].visual_type).toBe('source_reference');
    expect(script.slides[0].image_path).toMatch(/queue\.png$/);
    expect(script.slides[0].source_visual_id).toBe(42);
    expect(script.slides[0].ocr_text).toContain('enqueue');
  });

  it('renders scripts from phase-4 scene fields', () => {
    const script = scriptFromStoryboard({
      topic: 'Encapsulation in Java',
      scenes: [
        {
          id: 'scene-1',
          sceneTitle: 'Private Fields Protect State',
          title: 'Private Fields Protect State',
          narration: 'Private fields keep invalid writes away from object state while public methods provide controlled access.',
          onScreenText: ['private int count', 'client.increment()'],
          visualElements: {
            type: 'class_diagram',
            nodes: ['Counter', '- count: int', '+ increment()'],
            edges: [['Counter', '- count: int'], ['Counter', '+ increment()']],
            operations: ['block direct field write'],
            caption: 'Counter exposes methods, not fields',
          },
          codeSnippet: 'private int count;\npublic void increment() { count++; }',
          durationSeconds: 18,
        },
      ],
    });

    expect(script.slides[0].title).toBe('Private Fields Protect State');
    expect(script.slides[0].bullets).toEqual(['private int count', 'client.increment()']);
    expect(script.slides[0].visual_nodes).toContain('Counter');
    expect(script.slides[0].example_code).toMatch(/increment/);
  });
});
