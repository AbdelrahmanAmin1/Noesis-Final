'use strict';

const understanding = require('../services/material-understanding.service');
const resolver = require('../services/topic-resolver.service');

describe('material-understanding.service', () => {
  it('builds an evidence-backed Encapsulation understanding object', () => {
    const result = understanding.understandFromChunks([
      {
        id: 31,
        idx: 0,
        chapter_title: 'Object-Oriented Programming',
        heading: 'Encapsulation',
        text: 'Encapsulation means hiding the internal state of an object. A class uses private fields to protect data.',
        score: 0.42,
      },
      {
        id: 32,
        idx: 1,
        heading: 'Controlled access',
        text: 'public class Counter { private int count; public void increment() { count++; } } Public methods control behavior and preserve an invariant.',
        score: 0.37,
      },
    ], {
      resolvedTopic: 'Encapsulation',
      resolverConfidence: 0.87,
      alternatives: [{ topic: 'Encapsulation', score: 61, evidence: ['encapsulation'] }],
    });

    expect(result.domain).toBe('Object-Oriented Programming');
    expect(result.topic).toBe('Encapsulation in Java');
    expect(result.normalizedTopic).toBe('Encapsulation');
    expect(result.confidence).toBeGreaterThanOrEqual(0.65);
    expect(result.keyConcepts).toEqual(expect.arrayContaining(['class', 'object', 'state', 'private fields', 'public methods']));
    expect(result.sourceEvidence).toHaveLength(2);
    expect(result.sourceEvidence[0]).toHaveProperty('chunkId');
    expect(result.readyForGeneration).toBe(true);
    expect(result.status).toBe('ready');
  });

  it('detects Linked List as a Data Structures topic', () => {
    const result = understanding.understandFromChunks([
      {
        id: 41,
        idx: 0,
        heading: 'Linked Lists',
        text: 'A linked list stores data in nodes. Each node points to the next pointer, and the head points at the first node.',
      },
      {
        id: 42,
        idx: 1,
        text: 'Traversal follows next references until null. Insert and delete operations update links between nodes.',
      },
    ], {
      resolvedTopic: 'Linked List',
      resolverConfidence: 0.81,
    });

    expect(result.domain).toBe('Data Structures');
    expect(result.normalizedTopic).toBe('Linked List');
    expect(result.keyConcepts).toEqual(expect.arrayContaining(['node', 'head', 'next pointer', 'traversal']));
    expect(result.sourceEvidence.length).toBeGreaterThanOrEqual(2);
    expect(result.readyForGeneration).toBe(true);
  });

  it('detects Big-O as an Algorithms topic with evidence', () => {
    const result = understanding.understandFromChunks([
      {
        id: 51,
        idx: 0,
        heading: 'Big-O Complexity',
        text: 'Big-O describes time complexity as input size grows. Common growth rates include O(1), O(log n), O(n), and O(n log n).',
      },
      {
        id: 52,
        idx: 1,
        heading: 'Nested loops',
        text: 'A nested loop over the same input often produces O(n^2) work, while space complexity describes extra memory usage.',
      },
    ], {
      resolvedTopic: 'Big-O Complexity',
      resolverConfidence: 0.84,
    });

    expect(result.domain).toBe('Algorithms');
    expect(result.normalizedTopic).toBe('Big-O Complexity');
    expect(result.confidence).toBeGreaterThanOrEqual(0.65);
    expect(result.keyConcepts).toEqual(expect.arrayContaining(['O(1)', 'O(log n)', 'O(n)', 'O(n^2)', 'time complexity', 'space complexity', 'input size']));
    expect(result.sourceEvidence).toHaveLength(2);
    expect(result.readyForGeneration).toBe(true);
  });

  it('marks weak or generic detection as needs_review', () => {
    const result = understanding.understandFromChunks([
      {
        id: 7,
        idx: 0,
        heading: 'Overview',
        text: 'This document introduces important ideas and gives a high level overview.',
      },
    ], {
      hint: 'Document',
      resolverConfidence: 0.12,
    });

    expect(result.status).toBe('needs_review');
    expect(result.readyForGeneration).toBe(false);
    expect(result.issues).toEqual(expect.arrayContaining(['unsupported_domain', 'low_confidence', 'insufficient_source_evidence']));
  });
});

describe('topic-resolver expanded topic families', () => {
  it('ranks Hash Table and Big-O excerpts', () => {
    const hash = resolver.rankTopicsFromChunks([
      { text: 'A hash table uses a hash function to map a key to a bucket. Collisions can be handled by chaining, and load factor controls when we rehash.' },
    ]);
    expect(hash.topic).toBe('Hash Table');

    const bigO = resolver.rankTopicsFromChunks([
      { text: 'Big-O describes time complexity as input size grows, comparing O(1), O(log n), O(n), and O(n^2).' },
    ]);
    expect(bigO.topic).toBe('Big-O Complexity');
  });
});
