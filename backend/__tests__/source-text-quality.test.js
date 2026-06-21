'use strict';

const sourceTextQuality = require('../services/source-text-quality.service');

describe('source text quality visible noise sanitizer', () => {
  it('removes page, course, date, lecture, and byline header noise while preserving the concept', () => {
    const text = 'Page 1 CS 2110 September 18, 2025 Lecture 8: Classes and Encapsulation CS 2110, Matt Eichhorn and Leah Perlmutter';

    const cleaned = sourceTextQuality.stripSourceNoise(text, { preserveNewlines: false });

    expect(cleaned).toContain('Classes and Encapsulation');
    expect(cleaned).not.toMatch(/\bPage\s*1\b/i);
    expect(cleaned).not.toMatch(/\bLecture\s*8\b/i);
    expect(cleaned).not.toMatch(/\bCS\s*2110\b/i);
    expect(cleaned).not.toMatch(/September\s+18,\s+2025/i);
    expect(cleaned).not.toMatch(/Matt Eichhorn|Leah Perlmutter/i);
  });

  it('removes noisy page prefixes from announcement-like extracted text', () => {
    const text = 'Page 3 CS 2110 3 Announcements Lecture 8: Classes and Encapsulation September 18, 2025 - A2 clarification (problem 2.3): Describe your tests';

    const cleaned = sourceTextQuality.stripSourceNoise(text, { preserveNewlines: false });

    expect(cleaned).toContain('Announcements');
    expect(cleaned).toContain('Classes and Encapsulation');
    expect(cleaned).toContain('A2 clarification');
    expect(cleaned).not.toMatch(/\bPage\s*3\b/i);
    expect(cleaned).not.toMatch(/\bLecture\s*8\b/i);
    expect(cleaned).not.toMatch(/\bCS\s*2110\b/i);
  });

  it('removes lecture and slide labels without dropping useful terms', () => {
    expect(sourceTextQuality.stripSourceNoise('Lecture 8: Classes and Encapsulation')).toBe('Classes and Encapsulation');
    expect(sourceTextQuality.stripSourceNoise("Slide 4 Today's Learning Outcomes")).toBe("Today's Learning Outcomes");
  });

  it('preserves concise technical terms, formulas, and standalone CS wording', () => {
    const text = 'Pop follows LIFO order in O(1). CS concepts can include encapsulation, class, object, and inheritance.';

    const cleaned = sourceTextQuality.stripSourceNoise(text, { preserveNewlines: false });

    expect(cleaned).toContain('Pop');
    expect(cleaned).toContain('LIFO');
    expect(cleaned).toContain('O(1)');
    expect(cleaned).toContain('CS concepts');
    expect(cleaned).toContain('encapsulation');
  });
});
