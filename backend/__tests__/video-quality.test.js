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
});
