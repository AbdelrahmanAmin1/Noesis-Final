'use strict';

const { setupTestEnv, cleanupTestDb } = require('./helpers/setup');

beforeEach(() => {
  setupTestEnv();
});

afterEach(() => {
  cleanupTestDb();
});

describe('tutor step quality', () => {
  it('rejects placeholder tutor steps', () => {
    const tutor = require('../services/tutor.service');
    expect(() => tutor._internals.validateStep({
      title: 'Warm-up',
      content: '...',
      question: 'Trace an example',
      hint: 'Code sketch',
    })).toThrow(/quality|incomplete/i);
  });

  it('builds concrete polymorphism steps', () => {
    const tutor = require('../services/tutor.service');
    const plan = tutor.buildPlan('Polymorphism');
    expect(plan.steps).toHaveLength(5);
    expect(plan.steps[0].content).toMatch(/runtime object/i);
    expect(plan.steps[4].code.content).toMatch(/Shape s = new Circle/);
    expect(JSON.stringify(plan)).not.toContain('...');
  });
});
