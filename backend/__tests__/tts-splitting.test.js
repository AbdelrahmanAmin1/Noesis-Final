'use strict';

const { _internals: { splitSentences } } = require('../services/tts.service');

describe('splitSentences', () => {
  it('splits on sentence-ending punctuation', () => {
    const result = splitSentences('First sentence. Second sentence. Third one!');
    expect(result).toHaveLength(3);
    expect(result[0]).toContain('First');
    expect(result[1]).toContain('Second');
  });

  it('does not split on e.g. or i.e.', () => {
    const result = splitSentences('Use access modifiers, e.g. private and protected. This is important.');
    expect(result.length).toBeLessThanOrEqual(2);
    expect(result[0]).toContain('e.g');
  });

  it('does not split on O.n or similar technical dots', () => {
    const result = splitSentences('The complexity is O.n log n for merge sort. It is efficient.');
    expect(result.length).toBe(2);
  });

  it('does not split on dotted identifiers like node.next', () => {
    const result = splitSentences('Access node.next to traverse. Then check if null.');
    expect(result.length).toBe(2);
    expect(result[0]).toContain('node');
    expect(result[0]).toContain('next');
  });

  it('handles empty input', () => {
    expect(splitSentences('')).toEqual([]);
    expect(splitSentences(null)).toEqual([]);
  });
});
