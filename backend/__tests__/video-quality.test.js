'use strict';

const { scoreVideoScript } = require('../services/video-quality.service');
const lessons = require('../services/lesson.service');

function makeSlide(type, narrationLen = 200, bulletCount = 3) {
  return {
    slideType: type,
    title: `${type} slide title`,
    narration: 'A'.repeat(narrationLen),
    bullets: Array.from({ length: Math.min(2, bulletCount) }, (_, i) => `Focus ${i + 1}`),
    visual: { type: type === 'diagram' ? 'class_diagram' : 'mindmap', nodes: type === 'diagram' ? ['Account', 'Balance'] : ['A', 'B', 'C'], edges: [['A', 'B']] },
    callouts: [],
    example_code: type === 'code' ? '// Example\nclass Foo {\n  bar() { return 1; }\n}' : '',
  };
}

function makeFullScript() {
  const script = {
    topic: 'Encapsulation',
    learningObjectives: ['Understand encapsulation', 'Apply access modifiers', 'Identify violations'],
    slides: [
      makeSlide('title', 80),
      makeSlide('objectives', 80),
      makeSlide('concept', 200),
      makeSlide('analogy', 200),
      makeSlide('diagram', 180),
      makeSlide('code', 250),
      makeSlide('step_by_step', 220),
      makeSlide('mistakes', 200),
      makeSlide('recap', 90),
      makeSlide('quiz', 80),
    ],
  };
  script.slides[4].visual.nodes = ['BankAccount', 'private balance field', 'public deposit method', 'getBalance getter', 'validation guard'];
  script.slides[4].narration = 'A BankAccount class keeps balance as a private field. Public methods such as deposit and getBalance form the API, and validation guards protect the object from invalid state.';
  script.slides[5].example_code = 'class BankAccount {\n  private int balance;\n  public int getBalance() { return balance; }\n  public void deposit(int amount) { if (amount > 0) balance += amount; }\n}';
  script.slides[5].narration = 'The code uses a private balance field, a public getBalance getter, and a public deposit method with validation. Client code cannot directly overwrite balance.';
  script.slides[5].visual.nodes = ['private balance', 'public getter', 'public deposit', 'validation'];
  script.slides[6].visual.type = 'flow';
  script.slides[6].visual.nodes = ['client call', 'public method', 'validation', 'private balance'];
  script.slides[6].narration = 'The step-by-step flow starts with client code calling a public method, then validation checks the request before the private balance changes inside the object.';
  return script;
}

describe('scoreVideoScript', () => {
  it('passes a well-formed deep script', () => {
    const script = makeFullScript();
    const result = scoreVideoScript(script, { concept: 'Encapsulation' });
    expect(result.score).toBeGreaterThanOrEqual(0.75);
    expect(result.passed).toBe(true);
  });

  it('penalizes teaching slides with short narration', () => {
    const script = makeFullScript();
    script.slides[2].narration = 'Too short.';
    script.slides[3].narration = 'Also short.';
    script.slides[5].narration = 'Brief.';
    script.slides[6].narration = 'Minimal.';
    const result = scoreVideoScript(script, { concept: 'Encapsulation' });
    const criterion = result.criteria.find(c => c.name === 'narration_depth');
    expect(criterion).toBeDefined();
    expect(criterion.passed).toBe(false);
  });

  it('fails when bullets are truncated', () => {
    const script = makeFullScript();
    script.slides[2].bullets = ['Encapsulation means hiding internal state...', 'Access modifiers control visibility...'];
    const result = scoreVideoScript(script, { concept: 'Encapsulation' });
    const truncCriterion = result.criteria.find(c => c.name === 'no_truncated_visible_text');
    expect(truncCriterion).toBeDefined();
    expect(truncCriterion.passed).toBe(false);
  });

  it('fails when visible text ends with a hanging word', () => {
    const script = makeFullScript();
    script.slides[6].title = 'Line 1: The reference type is Shape, but the';
    const result = scoreVideoScript(script, { concept: 'Polymorphism' });
    expect(result.criteria.find(c => c.name === 'no_truncated_visible_text').passed).toBe(false);
    expect(result.passed).toBe(false);
  });

  it('fails sentence-like focus labels', () => {
    const script = makeFullScript();
    script.slides[2].bullets = ['The variable type controls what methods are legal to call'];
    const result = scoreVideoScript(script, { concept: 'Encapsulation' });
    expect(result.criteria.find(c => c.name === 'short_focus_labels').passed).toBe(false);
    expect(result.passed).toBe(false);
  });

  it('does not apply data-structure gates to class/object OOP scripts', () => {
    const script = makeFullScript();
    script.topic = 'Classes and Objects in Java';
    script.slides[2].narration = 'Classes and objects in Java define a blueprint and an instance. A class groups fields and methods, while each object owns state and behavior even when implementation complexity is hidden.';
    script.slides[2].bullets = ['Class blueprint', 'Object state'];
    script.slides[4].visual.nodes = ['Person class', 'name field', 'greet method', 'alice object'];
    script.slides[5].example_code = 'class Person {\n  private String name;\n  public void greet() { System.out.println(name); }\n}\nPerson alice = new Person();';

    const result = scoreVideoScript(script, { concept: 'Classes and Objects in Java' });

    expect(result.criteria.find(c => c.name === 'ds_operation_visual').passed).toBe(true);
    expect(result.criteria.find(c => c.name === 'ds_complexity').passed).toBe(true);
    expect(result.reasons.join(' ')).not.toMatch(/Data-structure videos need/i);
  });

  it('passes when no bullets are truncated', () => {
    const script = makeFullScript();
    const result = scoreVideoScript(script, { concept: 'Encapsulation' });
    const truncCriterion = result.criteria.find(c => c.name === 'no_truncated_visible_text');
    expect(truncCriterion.passed).toBe(true);
  });

  it('allows non-CS science videos without code scenes but blocks CS injection', () => {
    const slide = (type, title, bullets, visualType = 'mindmap') => ({
      slideType: type,
      title,
      narration: `${title} explains photosynthesis using light energy, chloroplasts, carbon dioxide, glucose, oxygen, and a concrete plant-cell scenario from the uploaded lecture.`,
      bullets,
      visual: { type: visualType, nodes: bullets, edges: [['Photosynthesis', bullets[0] || title].filter(Boolean)] },
      visual_nodes: bullets,
      callouts: [],
    });
    const script = {
      topic: 'Photosynthesis',
      learningObjectives: ['Explain photosynthesis', 'Apply source process'],
      slides: [
        slide('title', 'Photosynthesis', ['Photosynthesis', 'Light Energy']),
        slide('objectives', 'Learning Objectives', ['Explain Process', 'Apply Source']),
        slide('concept', 'Source Process', ['Chloroplasts', 'Glucose']),
        slide('analogy', 'Plant Cell Scenario', ['Sunlight Input', 'Glucose Output'], 'comparison'),
        slide('diagram', 'Energy Conversion Flow', ['Light Energy', 'Carbon Dioxide', 'Glucose', 'Oxygen'], 'flow'),
        slide('mistakes', 'Soil Food Mistake', ['Soil only', 'Glucose production'], 'comparison'),
        slide('recap', 'Recap', ['Chloroplasts', 'Oxygen']),
        slide('quiz', 'Mini Checkpoint', ['Question', 'Chloroplasts']),
      ],
    };
    const result = scoreVideoScript(script, { concept: 'Photosynthesis', domain: 'science' });

    expect(result.criteria.find(c => c.name === 'required_slide_types').passed).toBe(true);
    expect(result.criteria.find(c => c.name === 'no_unrelated_cs_terms').passed).toBe(true);

    script.slides[2].narration += ' This is not a search algorithm, stack, or queue example.';
    const withCsLeak = scoreVideoScript(script, { concept: 'Photosynthesis', domain: 'science' });
    expect(withCsLeak.criteria.find(c => c.name === 'no_unrelated_cs_terms').passed).toBe(false);
    expect(withCsLeak.passed).toBe(false);
  });

  it('passes source-led anatomy videos without CS diagram or code requirements', () => {
    const slide = (type, title, bullets, visualType = 'cards') => ({
      slideType: type,
      title,
      narration: `${title} uses uploaded anatomy terms: skeletal system, axial skeleton, appendicular skeleton, bone shapes, mineral storage, red blood cell production, organ protection, and movement support. This scene explains the actual source concepts with a concrete review step.`,
      bullets,
      visual: { type: visualType, nodes: bullets, operations: bullets.map(b => `${b}: source detail`) },
      visual_nodes: bullets,
      callouts: [],
    });
    const script = {
      topic: 'The Skeletal System',
      learningObjectives: ['Explain skeletal functions', 'Compare axial appendicular'],
      slides: [
        slide('title', 'The Skeletal System', ['Skeletal functions', 'Source terms'], 'none'),
        slide('objectives', 'Learning Goals', ['Explain support', 'Compare skeletons'], 'cards'),
        slide('concept', 'Source Overview', ['Support and protection', 'Blood cell production'], 'cards'),
        slide('analogy', 'Classification Table', ['Axial skeleton', 'Appendicular skeleton'], 'table'),
        slide('diagram', 'Bone Shape Categories', ['Long bones', 'Flat bones', 'Irregular bones'], 'table'),
        slide('mistakes', 'Common Misunderstanding', ['Memorize labels', 'Use source detail'], 'table'),
        slide('quiz', 'Review Question', ['Which skeleton?', 'Why?'], 'cards'),
        slide('recap', 'Exam Ready Recap', ['Functions', 'Classifications'], 'cards'),
      ],
    };

    const result = scoreVideoScript(script, {
      concept: 'The Skeletal System',
      domain: 'science',
      chunks: [{ text: 'The skeletal system supports the body, protects organs, stores minerals, produces red blood cells, and includes axial and appendicular skeletons.' }],
    });

    expect(result.criteria.find(c => c.name === 'required_slide_types').passed).toBe(true);
    expect(result.criteria.find(c => c.name === 'oop_class_visual').passed).toBe(true);
    expect(result.criteria.find(c => c.name === 'ds_operation_visual').passed).toBe(true);
    expect(result.criteria.find(c => c.name === 'no_unrelated_cs_terms').passed).toBe(true);
    expect(result.passed).toBe(true);
  });

  it('fails when slide count is too low', () => {
    const script = makeFullScript();
    script.slides = script.slides.slice(0, 4);
    const result = scoreVideoScript(script, { concept: 'Encapsulation' });
    expect(result.passed).toBe(false);
  });

  it('fails on placeholder content', () => {
    const script = makeFullScript();
    script.slides[2].narration = 'This is a document about encapsulation that provides definition goes here and explanation.';
    const result = scoreVideoScript(script, { concept: 'Encapsulation' });
    const placeholderCriterion = result.criteria.find(c => c.name === 'no_placeholders');
    expect(placeholderCriterion.passed).toBe(false);
  });

  it('rejects generic tutor placeholders from weak fallback scripts', () => {
    const script = makeFullScript();
    script.slides[5].title = 'Code Sketch';
    script.slides[5].example_code = 'function useConcept(input) { return result; }';
    script.slides[6].bullets = ['Define the idea', 'Trace an example', 'Apply main rule'];
    const result = scoreVideoScript(script, { concept: 'Inheritance' });
    expect(result.criteria.find(c => c.name === 'no_placeholders').passed).toBe(false);
    expect(result.passed).toBe(false);
  });

  it('fails when video callouts are present', () => {
    const script = makeFullScript();
    script.slides[1].callouts = ['Source note: read this chunk'];
    const result = scoreVideoScript(script, { concept: 'Encapsulation' });
    expect(result.criteria.find(c => c.name === 'no_video_callouts').passed).toBe(false);
    expect(result.passed).toBe(false);
  });

  it('fails code walkthrough scenes without line ranges', () => {
    const script = makeFullScript();
    script.slides[6].sceneType = 'code_walkthrough';
    script.slides[6].example_code = 'class A {}\nclass B extends A {}';
    script.slides[6].code_focus = null;
    const result = scoreVideoScript(script, { concept: 'Inheritance' });
    expect(result.criteria.find(c => c.name === 'code_walkthrough_line_ranges').passed).toBe(false);
    expect(result.passed).toBe(false);
  });

  it('fails code walkthrough scenes that reference invisible or nonexistent lines', () => {
    const script = makeFullScript();
    script.slides[6].sceneType = 'code_walkthrough';
    script.slides[6].title = 'Lines 11-15: Node.next';
    script.slides[6].example_code = 'class Node {\n  int value;\n  Node next;\n}';
    script.slides[6].code_focus = {
      language: 'java',
      content: script.slides[6].example_code,
      lineRange: '11-15',
      highlightLines: [11, 12, 13, 14, 15],
      explanation: 'Node.next stores the link to the next node.',
    };

    const result = scoreVideoScript(script, { concept: 'Linked List' });

    expect(result.criteria.find(c => c.name === 'code_walkthrough_visible_lines').passed).toBe(false);
    expect(result.passed).toBe(false);
  });

  it('passes code walkthrough scenes when the requested line window is visible', () => {
    const script = makeFullScript();
    const code = Array.from({ length: 18 }, (_, i) => `line ${i + 1};`).join('\n');
    script.slides[6].sceneType = 'code_walkthrough';
    script.slides[6].title = 'Lines 11-15: Node.next';
    script.slides[6].example_code = code;
    script.slides[6].code_focus = {
      language: 'java',
      content: code,
      lineRange: '11-15',
      visibleStartLine: 9,
      visibleEndLine: 18,
      highlightLines: [11, 12, 13, 14, 15],
      explanation: 'Node.next stores the link from one node to the next node in the chain.',
      pointers: [{ from: 'explanation_card', to: 'code_line_12', style: 'arrow', label: 'next link' }],
    };

    const result = scoreVideoScript(script, { concept: 'Encapsulation' });

    expect(result.criteria.find(c => c.name === 'code_walkthrough_visible_lines').passed).toBe(true);
    expect(result.criteria.find(c => c.name === 'code_walkthrough_pointer_targets').passed).toBe(true);
  });

  it('requires concrete hash-table visuals and collision/load-factor coverage', () => {
    const script = lessons.lessonToVideoScript(lessons.fallbackLesson('Hash Table'));
    const result = scoreVideoScript(script, { concept: 'Hash Table' });
    expect(result.criteria.find(c => c.name === 'hash_table_specifics').passed).toBe(true);
    expect(result.passed).toBe(true);
  });

  it('checks Queue-specific FIFO/front/rear coverage', () => {
    const script = makeFullScript();
    script.topic = 'Queue';
    script.learningObjectives = ['Understand FIFO queues', 'Trace enqueue and dequeue', 'Identify front and rear'];
    script.slides[4].visual.type = 'stack_queue';
    script.slides[4].visual.nodes = ['Queue', 'FIFO order', 'front pointer', 'rear pointer', 'enqueue', 'dequeue'];
    script.slides[4].narration = 'A queue is FIFO: first in, first out. Enqueue adds at the rear pointer, while dequeue removes from the front pointer.';
    script.slides[5].example_code = 'Queue<Integer> q = new ArrayDeque<>();\nq.add(10); // enqueue at rear\nq.add(20);\nint first = q.remove(); // dequeue from front';
    script.slides[5].narration = 'This Java queue example shows enqueue at the rear and dequeue at the front, so the first item inserted is the first one removed. Both common operations are O(1) in a normal linked or circular queue.';
    script.slides[6].narration = 'The walkthrough tracks the front pointer before dequeue and the rear pointer after enqueue. Underflow means trying to remove from an empty queue.';

    const result = scoreVideoScript(script, { concept: 'Queue' });

    expect(result.criteria.find(c => c.name === 'queue_specifics').passed).toBe(true);
  });

  it('checks BST-specific root/search/inorder coverage', () => {
    const script = makeFullScript();
    script.topic = 'Binary Search Tree';
    script.learningObjectives = ['Use the BST property', 'Trace search and insert', 'Read inorder traversal'];
    script.slides[4].visual.type = 'tree';
    script.slides[4].visual.nodes = ['root 8', 'left child 3', 'right child 10', 'search path', 'inorder traversal'];
    script.slides[4].narration = 'A binary search tree keeps smaller values on the left and larger values on the right of each root. Search and insert follow that comparison path.';
    script.slides[5].example_code = 'boolean search(Node root, int target) {\n  if (root == null) return false;\n  if (target == root.value) return true;\n  return target < root.value ? search(root.left, target) : search(root.right, target);\n}';
    script.slides[5].narration = 'The code compares the target with the root, then moves left for smaller values and right for larger values. In a balanced BST this is O(log n), while a skewed tree can degrade to O(n).';
    script.slides[6].narration = 'An inorder traversal visits left subtree, root, then right subtree, which produces sorted order when the BST property is preserved.';

    const result = scoreVideoScript(script, { concept: 'Binary Search Tree' });

    expect(result.criteria.find(c => c.name === 'bst_specifics').passed).toBe(true);
  });

  it('checks Big-O growth-rate coverage and runtime-seconds warning', () => {
    const script = makeFullScript();
    script.topic = 'Big-O Notation';
    script.learningObjectives = ['Compare growth rates', 'Use input size n', 'Avoid timing misconceptions'];
    script.slides[4].visual.type = 'bigo_chart';
    script.slides[4].visual.nodes = ['input size n', 'O(1)', 'O(log n)', 'O(n)', 'O(n log n)', 'O(n^2)', 'growth rate'];
    script.slides[4].narration = 'Big-O describes growth rate as input size n increases, not exact runtime seconds on one machine. The chart compares O(1), O(log n), O(n), O(n log n), and O(n^2).';
    script.slides[5].example_code = 'for (int i = 0; i < n; i++) {\n  System.out.println(i); // O(n)\n}\nfor (int i = 1; i < n; i *= 2) {\n  System.out.println(i); // O(log n)\n}';
    script.slides[5].narration = 'The first loop grows linearly with input n, so it is O(n). The second loop doubles i each time, so it is O(log n).';
    script.slides[6].narration = 'The common mistake is saying one algorithm is always faster in seconds. Big-O compares how cost grows as n changes, independent of a single machine timing.';

    const result = scoreVideoScript(script, { concept: 'Big-O Notation' });

    expect(result.criteria.find(c => c.name === 'big_o_specifics').passed).toBe(true);
  });
});
