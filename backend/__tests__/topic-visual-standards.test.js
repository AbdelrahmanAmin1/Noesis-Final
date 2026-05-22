'use strict';

const { storyboardQuality } = require('../services/storyboard.service');

function grounding() {
  return {
    uploadedMaterialCoverage: 0.8,
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
      { chunkId: 1, quote: `${topic} uses concrete structure, operations, and code examples.` },
      { chunkId: 2, quote: `${topic} diagrams should show labels, relationships, and state changes.` },
    ],
    reason: `The material repeatedly discusses ${topic}.`,
    alternatives: [],
    readyForGeneration: true,
  };
}

function evidence(topic, index) {
  return [{
    chunkId: index % 2 ? 1 : 2,
    quote: `${topic} uses concrete structure, operations, labels, relationships, and state changes.`,
    score: 0.8,
  }];
}

function scene(topic, id, visualType, title, nodes, opts = {}) {
  const codeSnippet = opts.codeSnippet || '';
  return {
    id,
    type: opts.type || (visualType === 'code_walkthrough' ? 'code_walkthrough' : visualType === 'summary_path' ? 'recap' : 'diagram'),
    sceneTitle: title,
    title,
    learningPoint: `${title} teaches a concrete ${topic} idea using the uploaded material.`,
    visualPurpose: `Use ${visualType.replace(/_/g, ' ')} to show ${title} with exact labels and state changes.`,
    visualRationale: `${visualType.replace(/_/g, ' ')} is relevant because the viewer needs to see ${nodes.slice(0, 3).join(', ')}.`,
    viewerTakeaway: `After seeing this visual, the viewer can explain ${title} for ${topic}.`,
    visualGrounding: {
      topic,
      sceneIntent: `show ${title} as a concrete ${topic} visual`,
      requiredVisualEvidence: nodes.slice(0, 3),
      selectedVisualReason: `${visualType.replace(/_/g, ' ')} directly represents ${title}.`,
      sourceBacked: true,
    },
    narration: opts.narration || `This ${topic} scene explains ${title}. The diagram labels ${nodes.join(', ')} and traces the operation so the narration matches the visual instead of using generic decorative shapes.`,
    onScreenText: opts.onScreenText || [title, nodes[0], nodes[1]].filter(Boolean),
    visualType,
    visualTemplate: visualType,
    visualElements: {
      type: opts.visualElementType || visualType,
      nodes,
      edges: opts.edges || [],
      operations: opts.operations || ['step through operation', 'show state change'],
      caption: `${title} is source-backed ${topic} visual evidence.`,
    },
    codeSnippet,
    code: codeSnippet ? {
      language: opts.language || 'java',
      content: codeSnippet,
      highlightLines: opts.highlightLines || [1, 2],
      walkthrough: [{ lineRange: '1-2', text: `${title} uses the highlighted code to explain ${topic}.` }],
    } : null,
    sourceEvidence: evidence(topic, Number(id.replace(/\D/g, '')) || 1),
    enrichment: { used: false, type: 'none', content: '' },
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

function expectPasses(storyboard) {
  const quality = storyboardQuality(storyboard);
  expect(quality.warnings).toEqual([]);
  expect(quality.passed).toBe(true);
  expect(quality.visual.coverage.missing).toEqual([]);
  return quality;
}

describe('topic-specific visual standards', () => {
  it('requires Encapsulation videos to show class/object, private/public access, blocked access, and code', () => {
    const topic = 'Encapsulation in Java';
    const good = board('Object-Oriented Programming', topic, ['class', 'object', 'private fields', 'public methods'], [
      scene(topic, 'scene-1', 'class_object', 'Class vs Object', ['Counter class blueprint', 'Counter object instance', 'state field', 'behavior method']),
      scene(topic, 'scene-2', 'encapsulation_boundary', 'Private Fields', ['Counter class boundary', 'private count field', 'public increment method', 'blocked direct access', 'valid public API call']),
      scene(topic, 'scene-3', 'comparison_contrast', 'Bad vs Correct Access', ['bad public field access', 'correct private field', 'valid public method call'], { operations: ['compare before and after'] }),
      scene(topic, 'scene-4', 'process_flow', 'Controlled API Flow', ['client code', 'public API', 'validation step', 'private state'], { operations: ['client calls API', 'method validates', 'state changes internally'] }),
      scene(topic, 'scene-5', 'code_walkthrough', 'Counter Code', ['private int count', 'public void increment()', 'client.increment() allowed'], {
        visualElementType: 'code',
        codeSnippet: 'private int count;\npublic void increment() { count++; }',
      }),
    ]);
    expectPasses(good);

    const missingBoundary = { ...good, scenes: good.scenes.filter(item => item.visualType !== 'encapsulation_boundary') };
    const quality = storyboardQuality(missingBoundary);
    expect(quality.passed).toBe(false);
    expect(quality.warnings).toContain('domain:missing_required_visual:encapsulation_boundary');
  });

  it('requires Classes and Objects videos to show blueprint, instance, fields, methods, and code', () => {
    const topic = 'Classes and Objects in Java';
    const good = board('Object-Oriented Programming', topic, ['class', 'object', 'instance', 'field', 'method'], [
      scene(topic, 'scene-1', 'class_object', 'Class Blueprint', ['Person class blueprint', 'alice object instance', 'name field', 'speak method']),
      scene(topic, 'scene-2', 'comparison_contrast', 'Class vs Object', ['class template', 'object instance', 'shared methods']),
      scene(topic, 'scene-3', 'process_flow', 'Constructor Flow', ['constructor input', 'object state', 'method behavior']),
      scene(topic, 'scene-4', 'summary_path', 'Class Object Recap', ['class blueprint', 'object instance', 'field state', 'method behavior'], { type: 'recap', operations: ['recap source-backed concepts'] }),
      scene(topic, 'scene-5', 'code_walkthrough', 'Person Code', ['class Person', 'private String name field', 'public speak() method'], {
        visualElementType: 'code',
        codeSnippet: 'class Person {\n  private String name;\n  public void speak() {}\n}',
      }),
    ]);
    expectPasses(good);
  });

  it('requires Linked List videos to show nodes, head, next pointers, operations, and code', () => {
    const topic = 'Linked Lists';
    const good = board('Data Structures', topic, ['node', 'head', 'next', 'insert'], [
      scene(topic, 'scene-1', 'linked_list_operation', 'Node Chain', ['head pointer', 'node A', 'node.next pointer', 'null terminator'], { operations: ['insert node', 'update next pointer', 'traverse list'] }),
      scene(topic, 'scene-2', 'process_flow', 'Insertion State Change', ['before insert', 'new node', 'after insert', 'head state'], { operations: ['show state before insert', 'rewire pointer', 'show state after insert'] }),
      scene(topic, 'scene-3', 'comparison_contrast', 'Array vs Linked Nodes', ['array index', 'linked node', 'next pointer']),
      scene(topic, 'scene-4', 'summary_path', 'Linked List Recap', ['node', 'head', 'next pointer', 'insert operation'], { type: 'recap', operations: ['recap pointer operation'] }),
      scene(topic, 'scene-5', 'code_walkthrough', 'Node Code', ['class Node', 'data field', 'Node next pointer'], {
        visualElementType: 'code',
        codeSnippet: 'class Node {\n  int data;\n  Node next;\n}',
      }),
    ]);
    expectPasses(good);

    const missingListVisual = { ...good, scenes: good.scenes.filter(item => item.visualType !== 'linked_list_operation') };
    const quality = storyboardQuality(missingListVisual);
    expect(quality.passed).toBe(false);
    expect(quality.warnings).toContain('domain:missing_required_visual:linked_list_operation');
  });

  it('requires Stack and Queue videos to show their core operations and pointer/index state', () => {
    const stackTopic = 'Stack';
    const stack = board('Data Structures', stackTopic, ['stack', 'push', 'pop', 'top'], [
      scene(stackTopic, 'scene-1', 'stack_operation', 'Push Pop Top', ['stack', 'push operation', 'pop operation', 'top pointer'], { operations: ['push item', 'update top state', 'pop item'] }),
      scene(stackTopic, 'scene-2', 'process_flow', 'LIFO State Change', ['input item', 'top state', 'output item', 'operation result']),
      scene(stackTopic, 'scene-3', 'comparison_contrast', 'Before After Stack', ['before push', 'after push', 'top item']),
      scene(stackTopic, 'scene-4', 'summary_path', 'Stack Recap', ['stack', 'push', 'pop', 'top'], { type: 'recap' }),
      scene(stackTopic, 'scene-5', 'code_walkthrough', 'Stack Code', ['stack.push(x)', 'stack.pop()', 'stack.peek() top'], {
        visualElementType: 'code',
        codeSnippet: 'stack.push(x);\nint top = stack.pop();',
      }),
    ]);
    expectPasses(stack);

    const queueTopic = 'Queue';
    const queue = board('Data Structures', queueTopic, ['queue', 'enqueue', 'dequeue', 'front', 'rear'], [
      scene(queueTopic, 'scene-1', 'queue_operation', 'Enqueue Dequeue', ['queue', 'enqueue operation', 'dequeue operation', 'front pointer', 'rear pointer'], { operations: ['enqueue item', 'move rear pointer', 'dequeue front item'] }),
      scene(queueTopic, 'scene-2', 'process_flow', 'FIFO State Change', ['input item', 'front state', 'rear state', 'output item']),
      scene(queueTopic, 'scene-3', 'comparison_contrast', 'Before After Queue', ['before enqueue', 'after dequeue', 'front and rear']),
      scene(queueTopic, 'scene-4', 'summary_path', 'Queue Recap', ['queue', 'enqueue', 'dequeue', 'front', 'rear'], { type: 'recap' }),
      scene(queueTopic, 'scene-5', 'code_walkthrough', 'Queue Code', ['queue.add(x) enqueue', 'queue.remove() dequeue', 'front item'], {
        visualElementType: 'code',
        codeSnippet: 'queue.add(x);\nint front = queue.remove();',
      }),
    ]);
    expectPasses(queue);
  });

  it('requires Tree videos to show hierarchy, root/child relationships, traversal, and code', () => {
    const topic = 'Trees';
    const good = board('Data Structures', topic, ['root', 'child', 'edge', 'traversal'], [
      scene(topic, 'scene-1', 'tree_visual', 'Tree Structure', ['root node', 'left child', 'right child', 'edge branch', 'leaf node'], { operations: ['visit root', 'traverse child edge', 'visit leaf'] }),
      scene(topic, 'scene-2', 'process_flow', 'Traversal State', ['root state', 'child pointer', 'visit operation', 'output order']),
      scene(topic, 'scene-3', 'comparison_contrast', 'Parent Child Links', ['parent node', 'child node', 'branch edge']),
      scene(topic, 'scene-4', 'summary_path', 'Tree Recap', ['root', 'child node', 'edge', 'traversal'], { type: 'recap' }),
      scene(topic, 'scene-5', 'code_walkthrough', 'Tree Node Code', ['class TreeNode', 'left child', 'right child'], {
        visualElementType: 'code',
        codeSnippet: 'class TreeNode {\n  TreeNode left;\n  TreeNode right;\n}',
      }),
    ]);
    expectPasses(good);
  });

  it('requires Big-O videos to show growth, input size, step/state progression, and code', () => {
    const topic = 'Big-O Complexity';
    const good = board('Algorithms', topic, ['input size', 'growth rate', 'O(n)', 'nested loops'], [
      scene(topic, 'scene-1', 'big_o_growth', 'Growth Curves', ['input size n', 'O(1) constant cost', 'O(n) linear growth', 'O(n^2) quadratic growth'], { operations: ['increase input size', 'compare growth curves'] }),
      scene(topic, 'scene-2', 'process_flow', 'Count Operations', ['step sequence', 'input array', 'operation count state', 'output cost']),
      scene(topic, 'scene-3', 'comparison_contrast', 'Linear vs Quadratic', ['linear loop', 'nested loop', 'complexity cost']),
      scene(topic, 'scene-4', 'summary_path', 'Big-O Recap', ['input size', 'growth rate', 'complexity', 'O(n)'], { type: 'recap' }),
      scene(topic, 'scene-5', 'code_walkthrough', 'Loop Code', ['for loop line', 'n input size', 'operation count'], {
        visualElementType: 'code',
        codeSnippet: 'for (int i = 0; i < n; i++) {\n  count++;\n}',
      }),
    ]);
    expectPasses(good);

    const missingGrowth = { ...good, scenes: good.scenes.filter(item => item.visualType !== 'big_o_growth') };
    const quality = storyboardQuality(missingGrowth);
    expect(quality.passed).toBe(false);
    expect(quality.warnings).toContain('domain:missing_required_visual:big_o_growth');
  });
});
