'use strict';

const resolver = require('../services/topic-resolver.service');

describe('topic-resolver.service', () => {
  it('rejects generic chapter and numeric labels', () => {
    expect(resolver.isGenericTopic('Document')).toBe(true);
    expect(resolver.isGenericTopic('Chapter 10')).toBe(true);
    expect(resolver.isGenericTopic('15')).toBe(true);
  });

  it('resolves Chapter 10 polymorphism excerpts to Polymorphism', () => {
    const ranked = resolver.rankTopicsFromChunks([
      {
        chapter_title: 'Chapter 10',
        text: 'What is polymorphism? A superclass reference can be aimed at a subclass object. Dynamic dispatch chooses the subclass method at runtime. Polymorphism enables programming in the general with abstract classes and interfaces.',
      },
    ]);
    expect(ranked.topic).toBe('Polymorphism');
    expect(ranked.confidence).toBeGreaterThan(0.5);
  });

  it('resolves encapsulation excerpts to Encapsulation', () => {
    const ranked = resolver.rankTopicsFromChunks([
      {
        text: 'Encapsulation hides private fields behind public methods. Getters and setters protect data and preserve invariants through access modifiers.',
      },
    ]);
    expect(ranked.topic).toBe('Encapsulation');
  });
});
