'use strict';

const { scoreVideoScript } = require('../services/video-quality.service');

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
  return {
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
});
