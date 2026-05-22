'use strict';

const { storyboardQuality, scriptFromStoryboard, _internals } = require('../services/storyboard.service');
const renderer = require('../services/renderer.service');

function grounding() {
  return {
    uploadedMaterialCoverage: 0.82,
    enrichmentUsed: false,
    enrichmentReason: '',
    topicDriftRisk: 'low',
    enrichmentValidation: { passed: true, issues: [], topicDriftRisk: 'low' },
  };
}

function understanding(domain, topic, keyConcepts) {
  return {
    domain,
    topic,
    normalizedTopic: topic,
    confidence: 0.9,
    keyConcepts,
    sourceEvidence: [
      { chunkId: 1, quote: `${topic} uses concrete visual labels, operations, and code examples.` },
      { chunkId: 2, quote: `${topic} diagrams should show structure, relationships, and state changes.` },
    ],
    reason: `The material repeatedly discusses ${topic}.`,
    alternatives: [],
    readyForGeneration: true,
  };
}

function sourceEvidence(topic, index = 1) {
  return [{
    chunkId: index,
    quote: `${topic} uses concrete visual labels, operations, relationships, source evidence, and code examples.`,
    score: 0.82,
    chapterTitle: topic,
  }];
}

function scene(topic, id, visualType, title, nodes, opts = {}) {
  const codeSnippet = opts.codeSnippet || '';
  const visualName = String(visualType || '').replace(/_/g, ' ');
  const type = opts.type || (visualType === 'code_walkthrough'
    ? 'code_walkthrough'
    : visualType === 'summary_path'
      ? 'recap'
      : visualType === 'concept_map'
        ? 'mindmap'
        : 'diagram');
  return {
    id,
    type,
    sceneTitle: title,
    title,
    learningPoint: opts.learningPoint || `${title} teaches one concrete ${topic} idea using uploaded source evidence.`,
    visualPurpose: opts.visualPurpose || `Use a ${visualName} visual to show ${title} with exact labels, arrows, and state changes.`,
    visualRationale: opts.visualRationale || `${visualName} is relevant because the viewer needs to see ${nodes.slice(0, 4).join(', ')}.`,
    viewerTakeaway: opts.viewerTakeaway || `After seeing the visual, the viewer can explain ${title} for ${topic}.`,
    visualGrounding: {
      topic,
      sceneIntent: opts.sceneIntent || `show ${title} as a concrete ${topic} diagram`,
      requiredVisualEvidence: opts.requiredVisualEvidence || nodes.slice(0, 4),
      selectedVisualReason: opts.selectedVisualReason || `${visualName} directly represents ${title}.`,
      sourceBacked: true,
    },
    narration: opts.narration || `This ${topic} scene explains ${title}. The visual labels ${nodes.join(', ')} and traces the operation so the narration matches the diagram rather than drifting into generic technical-looking filler.`,
    onScreenText: opts.onScreenText || [title, nodes[0], nodes[1]].filter(Boolean),
    visualType,
    visualTemplate: visualType,
    visualElements: {
      type: opts.visualElementType || visualType,
      nodes,
      edges: opts.edges || [],
      operations: opts.operations || ['step through operation', 'show state change'],
      caption: `${title} is grounded in ${topic} source evidence.`,
    },
    codeSnippet,
    code: codeSnippet ? {
      language: opts.language || 'java',
      content: codeSnippet,
      highlightLines: opts.highlightLines || [1, 2],
      walkthrough: [{ lineRange: '1-2', text: `${title} uses the highlighted code to explain ${topic}.` }],
    } : null,
    sourceEvidence: sourceEvidence(topic, Number(id.replace(/\D/g, '')) || 1),
    enrichment: opts.enrichment || { used: false, type: 'none', content: '' },
    motionInstructions: opts.motionInstructions || ['Highlight labels', 'Trace the operation', 'Show state change'],
    durationSeconds: 18,
  };
}

function board(domain, topic, keyConcepts, scenes) {
  return {
    topic,
    materialUnderstanding: understanding(domain, topic, keyConcepts),
    grounding: grounding(),
    scenes,
  };
}

function encapsulationBoard() {
  const topic = 'Encapsulation in Java';
  return board('Object-Oriented Programming', topic, ['class', 'object', 'private fields', 'public methods'], [
    scene(topic, 'scene-1', 'class_object', 'Class vs Object', ['Counter class blueprint', 'Counter object instance', 'state field', 'behavior method']),
    scene(topic, 'scene-2', 'encapsulation_boundary', 'Private Fields', ['Counter class boundary', 'private count field', 'public increment method', 'blocked direct access', 'valid public API call']),
    scene(topic, 'scene-3', 'comparison_contrast', 'Bad vs Correct Access', ['bad public field access', 'correct private field', 'valid public method call'], { operations: ['compare before and after'] }),
    scene(topic, 'scene-4', 'process_flow', 'Controlled API Flow', ['client code', 'public API', 'validation step', 'private state'], { operations: ['client calls API', 'method validates', 'state changes internally'] }),
    scene(topic, 'scene-5', 'code_walkthrough', 'Counter Code', ['private int count', 'public void increment()', 'client.increment() allowed'], {
      visualElementType: 'code',
      codeSnippet: 'private int count;\npublic void increment() { count++; }',
    }),
  ]);
}

function linkedListBoard() {
  const topic = 'Linked Lists';
  return board('Data Structures', topic, ['node', 'head', 'next', 'insert'], [
    scene(topic, 'scene-1', 'linked_list_operation', 'Node Chain', ['head pointer', 'node A', 'node.next pointer', 'null terminator'], { operations: ['insert node', 'update next pointer', 'traverse list'] }),
    scene(topic, 'scene-2', 'process_flow', 'Insertion State Change', ['before insert', 'new node', 'after insert', 'head state'], { operations: ['show state before insert', 'rewire pointer', 'show state after insert'] }),
    scene(topic, 'scene-3', 'comparison_contrast', 'Array vs Linked Nodes', ['array index', 'linked node', 'next pointer']),
    scene(topic, 'scene-4', 'summary_path', 'Linked List Recap', ['node', 'head', 'next pointer', 'insert operation'], { type: 'recap', operations: ['recap pointer operation'] }),
    scene(topic, 'scene-5', 'code_walkthrough', 'Node Code', ['class Node', 'data field', 'Node next pointer'], {
      visualElementType: 'code',
      codeSnippet: 'class Node {\n  int data;\n  Node next;\n}',
    }),
  ]);
}

function bigOBoard() {
  const topic = 'Big-O Complexity';
  return board('Algorithms', topic, ['input size', 'growth rate', 'O(n)', 'nested loops'], [
    scene(topic, 'scene-1', 'big_o_growth', 'Growth Curves', ['input size n', 'O(1) constant cost', 'O(n) linear growth', 'O(n^2) quadratic growth'], { operations: ['increase input size', 'compare growth curves'] }),
    scene(topic, 'scene-2', 'process_flow', 'Count Operations', ['step sequence', 'input array', 'operation count state', 'output cost']),
    scene(topic, 'scene-3', 'comparison_contrast', 'Linear vs Quadratic', ['linear loop', 'nested loop', 'complexity cost']),
    scene(topic, 'scene-4', 'summary_path', 'Big-O Recap', ['input size', 'growth rate', 'complexity', 'O(n)'], { type: 'recap' }),
    scene(topic, 'scene-5', 'code_walkthrough', 'Loop Code', ['for loop line', 'n input size', 'operation count'], {
      visualElementType: 'code',
      codeSnippet: 'for (int i = 0; i < n; i++) {\n  count++;\n}',
    }),
  ]);
}

function expectPasses(storyboard) {
  const quality = storyboardQuality(storyboard);
  expect(quality.passed).toBe(true);
  expect(quality.warnings).toEqual([]);
  expect(quality.visual.passed).toBe(true);
  expect(quality.visual.coverage.missing).toEqual([]);
  return quality;
}

describe('Phase 8 visual quality regressions', () => {
  it('passes concrete Encapsulation, Linked List, and Big-O visual baselines', () => {
    const enc = expectPasses(encapsulationBoard());
    expect(enc.visual.coverage.present).toEqual(expect.arrayContaining(['encapsulation_boundary', 'class_object', 'code_walkthrough']));

    const linked = expectPasses(linkedListBoard());
    expect(linked.visual.coverage.present).toEqual(expect.arrayContaining(['linked_list_operation', 'code_walkthrough']));

    const bigO = expectPasses(bigOBoard());
    expect(bigO.visual.coverage.present).toEqual(expect.arrayContaining(['big_o_growth', 'process_flow', 'code_walkthrough']));
  });

  it('rejects unsupported visual types before Remotion can fall back', () => {
    const storyboard = encapsulationBoard();
    storyboard.scenes[0] = {
      ...storyboard.scenes[0],
      visualType: 'cinematic_glow_shapes',
      visualTemplate: 'cinematic_glow_shapes',
      visualElements: { type: 'cinematic_glow_shapes', nodes: ['Glow', 'Shapes'], operations: ['pulse glow'] },
    };
    const quality = storyboardQuality(storyboard);
    expect(quality.passed).toBe(false);
    expect(quality.visual.passed).toBe(false);
    expect(quality.warnings.join(' ')).toContain('unsupported_visual_type:cinematic_glow_shapes');
    expect(() => renderer.validateRemotionVisualInput({
      scene: storyboard.scenes[0],
      slide: { title: storyboard.scenes[0].title },
    })).toThrow(/unsupported_visual_type:cinematic_glow_shapes/);
  });

  it('rejects generic concept-map fallback for concrete core CS scenes', () => {
    const storyboard = encapsulationBoard();
    storyboard.scenes[1] = {
      ...storyboard.scenes[1],
      type: 'diagram',
      visualType: 'concept_map',
      visualTemplate: 'concept_map',
      visualElements: { type: 'concept_map', nodes: ['Encapsulation', 'Private fields', 'Public methods'], operations: [] },
    };
    const quality = storyboardQuality(storyboard);
    expect(quality.passed).toBe(false);
    expect(quality.warnings).toContain('scene-2:generic_fallback_not_allowed');
    expect(quality.warnings).toContain('domain:missing_required_visual:encapsulation_boundary');
  });

  it('rejects linked-list diagrams attached to Encapsulation learning points', () => {
    const storyboard = encapsulationBoard();
    storyboard.scenes[1] = {
      ...storyboard.scenes[1],
      visualType: 'linked_list_operation',
      visualTemplate: 'linked_list_operation',
      visualElements: {
        type: 'linked_list_operation',
        nodes: ['head pointer', 'node.next pointer', 'null terminator'],
        edges: [['head pointer', 'node.next pointer']],
        operations: ['insert after head', 'advance next pointer'],
      },
    };
    const quality = storyboardQuality(storyboard);
    expect(quality.passed).toBe(false);
    expect(quality.warnings).toContain('scene-2:unrelated_diagram');
    expect(quality.warnings).toContain('scene-2:narration_visual_mismatch');
  });

  it('rejects vague abstract visuals and generic technical filler', () => {
    const abstractScene = {
      ...encapsulationBoard().scenes[0],
      visualPurpose: 'Use cinematic glowing orbs as an abstract decorative background.',
      visualRationale: 'The visual is aesthetic and decorative, not an educational diagram.',
      viewerTakeaway: 'The viewer sees a random vibe instead of a useful model.',
      visualElements: { type: 'class_object', nodes: ['System', 'Component', 'Data', 'Process'], edges: [], operations: ['animate particles'] },
    };
    const validation = _internals.validateVisualRelevance(abstractScene, 'Encapsulation in Java');
    expect(validation.passed).toBe(false);
    expect(validation.warnings).toEqual(expect.arrayContaining(['decorative_only_visual', 'vague_visual', 'missing_visual_elements', 'unrelated_diagram']));
  });

  it('rejects narration that contradicts an otherwise concrete visual', () => {
    const storyboard = encapsulationBoard();
    storyboard.scenes[1] = {
      ...storyboard.scenes[1],
      narration: 'A tree traversal starts at the root, visits each child node, follows edges, and outputs leaf order. The explanation follows branches across a hierarchy and tracks visit order in a data-structure diagram.',
    };
    const quality = storyboardQuality(storyboard);
    expect(quality.passed).toBe(false);
    expect(quality.warnings).toContain('scene-2:narration_visual_mismatch');
  });

  it('keeps concrete scene labels in the render script and metadata topic unchanged', () => {
    const storyboard = encapsulationBoard();
    const script = scriptFromStoryboard(storyboard);
    const allNodes = script.slides.flatMap(slide => slide.visual_nodes || []).join(' ');
    expect(allNodes).toMatch(/Counter class blueprint/);
    expect(allNodes).toMatch(/blocked direct access/);
    expect(script.slides[4].example_code).toMatch(/private int count/);
    expect(storyboard.materialUnderstanding.topic).toBe('Encapsulation in Java');
    expect(storyboard.topic).toBe(storyboard.materialUnderstanding.topic);
  });
});
