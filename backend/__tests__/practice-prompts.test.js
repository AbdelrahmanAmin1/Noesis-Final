'use strict';

const prompts = require('../utils/prompts');

describe('quiz and flashcard practice prompts', () => {
  const chunks = [
    {
      id: 12,
      heading: 'Encapsulation lecture',
      text: 'Encapsulation keeps fields private and updates state through validated public methods.',
    },
  ];

  it('includes curated educational context and preserves quiz JSON shape', () => {
    const prompt = prompts.QUIZ_MCQ(chunks, 4, 'medium', {
      groundingTier: 'strong',
      educationalContext: [
        'Educational context for Encapsulation',
        'Use the BankAccount example.',
        'Common mistake: public fields or setters without validation.',
      ].join('\n'),
    });

    expect(prompt).toContain('Educational context');
    expect(prompt).toContain('BankAccount');
    expect(prompt).toContain('Uploaded excerpts are the course-specific source of truth');
    expect(prompt).toMatch(/curated educational context is trusted expansion/i);
    expect(prompt).toContain('correct_idx');
    expect(prompt).not.toContain('answerIndex');
    expect(prompt).toMatch(/What is this topic/i);
    expect(prompt).toMatch(/Define the concept/i);
  });

  it('includes curated complexity guidance without asking for visible chunk ids in flashcards', () => {
    const prompt = prompts.FLASHCARDS(chunks, 5, {
      groundingTier: 'moderate',
      educationalContext: [
        'Big-O context',
        'Complexity: O(1), O(log n), O(n), O(n log n), O(n^2).',
        'Common mistake: confusing runtime seconds with growth rate.',
      ].join('\n'),
    });

    expect(prompt).toContain('Educational context');
    expect(prompt).toContain('O(log n)');
    expect(prompt).toContain('complexity');
    expect(prompt).toContain('source_chunk_id');
    expect(prompt).toContain('Do not put raw chunk IDs');
    expect(prompt).not.toMatch(/show raw chunk ids/i);
    expect(prompt).not.toMatch(/cite chunk ids/i);
  });
});
