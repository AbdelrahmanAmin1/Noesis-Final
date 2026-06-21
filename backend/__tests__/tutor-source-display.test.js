'use strict';

const tutor = require('../services/tutor.service');

describe('guided tutor source display', () => {
  it('uses neutral source labels instead of page or slide numbers', () => {
    const sources = tutor.sourceChunksForClient([
      {
        id: 10,
        idx: 0,
        source_page: 1,
        slide_number: 4,
        chapter_title: 'Chapter 1',
        heading: 'Lecture 8: Classes and Encapsulation',
        text: 'Page 1 CS 2110 September 18, 2025 Lecture 8: Classes and Encapsulation. Encapsulation keeps fields private.',
        score: 0.9,
      },
    ], 'CS 2110 Lecture 8');

    expect(sources).toHaveLength(1);
    expect(sources[0].location).toBe('Source excerpt');
    expect(sources[0].heading).toBe('Classes and Encapsulation');
    expect(sources[0].excerpt).toContain('Encapsulation keeps fields private');
    expect(`${sources[0].heading} ${sources[0].location} ${sources[0].excerpt} ${sources[0].materialTitle}`)
      .not.toMatch(/\b(Page|Slide|Lecture|Chapter)\s*\d+\b|\bCS\s*2110\b|September\s+18,\s+2025/i);
  });
});
