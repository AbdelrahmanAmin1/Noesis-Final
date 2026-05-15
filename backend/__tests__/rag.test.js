'use strict';

describe('cosine similarity', () => {
  let cosine;

  it('loads the rag module and cosine function', () => {
    const rag = require('../services/rag.service');
    cosine = rag.cosine;
    expect(typeof cosine).toBe('function');
  });

  it('returns 1 for identical vectors', () => {
    const v = [1, 2, 3, 4];
    expect(cosine(v, v)).toBeCloseTo(1.0, 5);
  });

  it('returns 0 for orthogonal vectors', () => {
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0.0, 5);
  });

  it('returns -1 for opposite vectors', () => {
    expect(cosine([1, 0], [-1, 0])).toBeCloseTo(-1.0, 5);
  });

  it('returns 0 for zero vectors', () => {
    expect(cosine([0, 0, 0], [1, 2, 3])).toBe(0);
  });

  it('computes correct similarity for known vectors', () => {
    const a = [1, 2, 3];
    const b = [4, 5, 6];
    const dot = 1 * 4 + 2 * 5 + 3 * 6;
    const magA = Math.sqrt(1 + 4 + 9);
    const magB = Math.sqrt(16 + 25 + 36);
    const expected = dot / (magA * magB);
    expect(cosine(a, b)).toBeCloseTo(expected, 5);
  });
});

describe('concept-synonyms', () => {
  const { expandQuery } = require('../utils/concept-synonyms');

  it('expands a known concept', () => {
    const result = expandQuery('polymorphism');
    expect(result).toContain('polymorphism');
    expect(result.length).toBeGreaterThan('polymorphism'.length);
    expect(result.toLowerCase()).toContain('overriding');
  });

  it('returns original query for unknown concept', () => {
    const result = expandQuery('xyzzy_unknown_concept');
    expect(result).toBe('xyzzy_unknown_concept');
  });

  it('handles empty input', () => {
    expect(expandQuery('')).toBe('');
  });

  it('limits expansion to avoid overly long queries', () => {
    const result = expandQuery('binary search tree');
    const words = result.split(/\s+/).length;
    expect(words).toBeLessThanOrEqual(20);
  });
});

describe('visual-templates', () => {
  const { findTemplate, TEMPLATES } = require('../utils/visual-templates');

  it('finds exact match', () => {
    const t = findTemplate('stack');
    expect(t).toBeDefined();
    expect(t.type).toBe('stack_queue');
  });

  it('finds partial match', () => {
    const t = findTemplate('binary search tree insertion');
    expect(t).toBeDefined();
    expect(t.type).toBe('tree');
  });

  it('returns null for no match', () => {
    expect(findTemplate('quantum computing')).toBeNull();
  });

  it('has templates for core concepts', () => {
    expect(Object.keys(TEMPLATES).length).toBeGreaterThanOrEqual(15);
    expect(findTemplate('inheritance')).toBeDefined();
    expect(findTemplate('linked list')).toBeDefined();
    expect(findTemplate('recursion')).toBeDefined();
  });
});
