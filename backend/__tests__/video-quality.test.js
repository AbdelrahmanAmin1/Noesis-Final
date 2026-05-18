'use strict';

const { scoreVideoScript } = require('../services/video-quality.service');

function makeSlide(type, narrationLen = 200, bulletCount = 3) {
  return {
    slideType: type,
    title: `${type} slide title`,
    narration: 'A'.repeat(narrationLen),
    bullets: Array.from({ length: bulletCount }, (_, i) => `Bullet point number ${i + 1} explaining the concept`),
    visual: { type: 'mindmap', nodes: ['A', 'B', 'C'], edges: [['A', 'B']] },
    callouts: ['Important note here'],
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
    const truncCriterion = result.criteria.find(c => c.name === 'no_truncated_bullets');
    expect(truncCriterion).toBeDefined();
    expect(truncCriterion.passed).toBe(false);
  });

  it('passes when no bullets are truncated', () => {
    const script = makeFullScript();
    const result = scoreVideoScript(script, { concept: 'Encapsulation' });
    const truncCriterion = result.criteria.find(c => c.name === 'no_truncated_bullets');
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
});
