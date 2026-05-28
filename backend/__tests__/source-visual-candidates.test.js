'use strict';

describe('source-visual-candidates.service heuristics', () => {
  it('recognizes educational diagram and table candidates', () => {
    const svc = require('../services/source-visual-candidates.service');
    expect(svc.visualTypeGuess('Binary search tree diagram with root, left child, and right child')).toBe('tree_diagram');
    expect(svc.visualTypeGuess('Hash table buckets and collision chaining')).toBe('hash_table_diagram');
    expect(svc.visualTypeGuess('Comparison table of long, short, flat, and irregular bones')).toBe('table');
  });

  it('scores concrete source images above weak reference-only text', () => {
    const svc = require('../services/source-visual-candidates.service');
    const strong = svc.importanceScore({
      heading: 'Vertebrae regions diagram',
      nearbyText: 'Figure shows cervical, thoracic, lumbar, sacrum, and coccyx.',
      hasImage: true,
    });
    const weak = svc.importanceScore({
      nearbyText: 'A short paragraph with no visual cue.',
      hasImage: false,
    });

    expect(strong).toBeGreaterThan(weak);
    expect(strong).toBeGreaterThanOrEqual(0.7);
  });
});
