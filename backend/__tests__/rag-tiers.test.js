'use strict';

const { groundingTier } = require('../services/rag.service');

describe('groundingTier', () => {
  it('returns strong when 3+ chunks and maxScore > 0.40', () => {
    expect(groundingTier({ chunks: [{}, {}, {}], maxScore: 0.55 })).toBe('strong');
    expect(groundingTier({ chunks: [{}, {}, {}, {}], maxScore: 0.41 })).toBe('strong');
  });

  it('returns moderate when 2+ chunks and maxScore > 0.16', () => {
    expect(groundingTier({ chunks: [{}, {}], maxScore: 0.30 })).toBe('moderate');
    expect(groundingTier({ chunks: [{}, {}, {}], maxScore: 0.25 })).toBe('moderate');
  });

  it('returns weak when fewer than 2 chunks', () => {
    expect(groundingTier({ chunks: [{}], maxScore: 0.90 })).toBe('weak');
    expect(groundingTier({ chunks: [], maxScore: 0 })).toBe('weak');
  });

  it('returns weak when maxScore <= 0.16', () => {
    expect(groundingTier({ chunks: [{}, {}, {}], maxScore: 0.10 })).toBe('weak');
    expect(groundingTier({ chunks: [{}, {}], maxScore: 0.16 })).toBe('weak');
  });

  it('handles edge cases', () => {
    expect(groundingTier({ chunks: null, maxScore: 0.5 })).toBe('weak');
    expect(groundingTier({ chunks: undefined, maxScore: 0 })).toBe('weak');
  });
});
