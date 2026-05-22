'use strict';

const { storyboardQuality, scriptFromStoryboard, _internals } = require('../services/storyboard.service');
const visualRegistry = require('../utils/visual-registry');

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
        groundedScene('scene-5', 'summary_path', 'Controlled API'),
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
