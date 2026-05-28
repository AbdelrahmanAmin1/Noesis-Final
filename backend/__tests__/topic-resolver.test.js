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

  it('resolves Trees material as Trees instead of Linked List', () => {
    const ranked = resolver.rankTopicsFromChunks([
      {
        chapter_title: 'Tree ADT',
        heading: 'Tree Implementation',
        text: 'A tree ADT stores nodes in a hierarchy. Each node can have a parent, children, and leaf descendants. The root node starts the structure, while height and depth describe position in the tree.',
      },
      {
        chapter_title: 'Tree Traversals',
        heading: 'Preorder and Postorder',
        text: 'Tree traversal can use preorder, postorder, or inorder order. Binary tree implementations often use left and right child references, and BST examples appear as a special ordered tree.',
      },
      {
        chapter_title: 'Binary Search Tree',
        heading: 'BST Operations',
        text: 'A BST uses left subtree and right subtree rules for search, insert, and delete, but it is still part of the broader Trees topic in this unit.',
      },
    ]);

    expect(ranked.topic).toBe('Trees');
    expect(ranked.candidates[0].topic).toBe('Trees');
    expect(ranked.candidates.find(candidate => candidate.topic === 'Linked List')).toBeUndefined();
  });

  it('still resolves real Linked List material as Linked List', () => {
    const ranked = resolver.rankTopicsFromChunks([
      {
        heading: 'Linked Lists',
        text: 'A linked list stores nodes using a head pointer and next pointer. Each node.next reference points to the next node until the null pointer ends the chain.',
      },
      {
        heading: 'Linked List Operations',
        text: 'Insert and delete operations update next references and tail pointer state in a singly linked list.',
      },
    ]);

    expect(ranked.topic).toBe('Linked List');
    expect(ranked.confidence).toBeGreaterThan(0.5);
  });

  it('does not infer Linked List from generic anatomy words', () => {
    const ranked = resolver.rankTopicsFromChunks([
      {
        chapter_title: 'Skeletal Anatomy',
        heading: 'Head and Front View',
        text: 'A child can tilt the head forward. The front of the skull protects the brain and connects to facial bones.',
      },
    ]);

    expect(ranked.topic).not.toBe('Linked List');
  });

  it('keeps BST as an explicit topic while broad tree labels map to Trees', () => {
    expect(resolver.exactKnownTopic('BST')).toBe('Binary Search Tree');
    expect(resolver.exactKnownTopic('binary search tree')).toBe('Binary Search Tree');
    expect(resolver.exactKnownTopic('trees')).toBe('Trees');
    expect(resolver.exactKnownTopic('binary tree')).toBe('Trees');
  });
});
