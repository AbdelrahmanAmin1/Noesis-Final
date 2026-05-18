'use strict';

const { storyboardQuality, scriptFromStoryboard } = require('../services/storyboard.service');

describe('storyboard.service', () => {
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
});
