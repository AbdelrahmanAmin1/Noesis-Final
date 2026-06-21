'use strict';

const lessons = require('../services/lesson.service');

describe('lesson markdown source noise cleanup', () => {
  it('does not expose page or lecture labels in rendered notes', () => {
    const markdown = lessons.lessonToMarkdown({
      topic: 'Lecture 8: Classes and Encapsulation',
      learningObjectives: ['Slide 4: Explain encapsulation'],
      sections: [{
        type: 'definition',
        title: 'Page 1 CS 2110 Lecture 8: Encapsulation',
        content: 'Page 1 CS 2110 September 18, 2025 Lecture 8: Encapsulation keeps fields private and exposes validated public methods.',
        cards: [{ title: 'Lecture 8: Key idea', text: 'Slide 4: private fields plus public methods.' }],
        callouts: [{ type: 'remember', text: 'Chapter 1: validate before changing state.' }],
        quiz: [{
          question: 'Page 2: Why keep balance private?',
          options: ['Validated methods control changes', 'Page headers control state'],
          answer: 'Validated methods control changes',
          explanation: 'Lecture 8 says validation protects object state.',
        }],
      }],
    });

    expect(markdown).toContain('Encapsulation keeps fields private');
    expect(markdown).toContain('validated public methods');
    expect(markdown).not.toMatch(/\b(Page|Slide|Lecture|Chapter)\s*\d+\b/i);
    expect(markdown).not.toMatch(/\bCS\s*2110\b|September\s+18,\s+2025/i);
  });
});
