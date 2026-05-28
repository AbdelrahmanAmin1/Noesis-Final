'use strict';

const judge = require('../services/source-grounding-judge.service');
const understanding = require('../services/material-understanding.service');

describe('source-grounding-judge.service', () => {
  function treeChunks() {
    return [
      {
        id: 1,
        idx: 0,
        heading: 'Tree ADT',
        text: 'A tree ADT organizes nodes in a hierarchy. The root node has children, and leaf nodes have no children. Height and depth describe node positions in the tree.',
      },
      {
        id: 2,
        idx: 1,
        heading: 'Tree Traversals',
        text: 'Preorder, inorder, and postorder are tree traversal orders. A binary tree uses left and right child references.',
      },
      {
        id: 3,
        idx: 2,
        heading: 'Binary Search Tree',
        text: 'A BST is an ordered tree example. Search, insert, and delete follow the left subtree and right subtree rule.',
      },
    ];
  }

  it('retries a Linked List selection for Trees source material', () => {
    const chunks = treeChunks();
    const sourceOutline = understanding.buildSourceOutline(chunks, { title: '210-Trees.pdf' });
    const verdict = judge.judge({
      feature: 'notes',
      stage: 'pre_generation',
      resolvedTopic: 'Linked List',
      requestedTopic: '210-Trees',
      sourceOutline,
      chunks,
    });

    expect(verdict.decision).toBe('retry');
    expect(verdict.reasonCodes).toContain('topic_mismatch');
    expect(verdict.correctedTopic).toBe('Trees');
  });

  it('accepts real Linked List source material', () => {
    const chunks = [
      {
        id: 1,
        heading: 'Linked Lists',
        text: 'A linked list stores data in nodes. The head pointer references the first node, and each node.next points to the next node until null.',
      },
      {
        id: 2,
        heading: 'Linked List Operations',
        text: 'Insert and delete update next pointer links in a singly linked list.',
      },
    ];
    const sourceOutline = understanding.buildSourceOutline(chunks, { title: 'linked-list.pdf' });
    const verdict = judge.judge({
      feature: 'notes',
      stage: 'pre_generation',
      resolvedTopic: 'Linked List',
      requestedTopic: 'Linked List',
      sourceOutline,
      chunks,
    });

    expect(verdict.decision).toBe('accept');
    expect(verdict.reasonCodes).toEqual([]);
  });

  it('keeps BST-heavy source under Trees unless BST is explicit', () => {
    const chunks = treeChunks();
    const sourceOutline = understanding.buildSourceOutline(chunks, { title: 'trees-and-bst.pdf' });
    const implicit = judge.judge({
      feature: 'video',
      stage: 'pre_generation',
      resolvedTopic: 'Binary Search Tree',
      requestedTopic: 'Trees',
      sourceOutline,
      chunks,
    });
    const explicit = judge.judge({
      feature: 'video',
      stage: 'pre_generation',
      resolvedTopic: 'Binary Search Tree',
      requestedTopic: 'BST',
      sourceOutline,
      chunks,
    });

    expect(implicit.decision).toBe('retry');
    expect(implicit.correctedTopic).toBe('Trees');
    expect(explicit.decision).toBe('accept');
  });

  it('does not let anatomy language become Linked List', () => {
    const chunks = [
      {
        id: 1,
        heading: 'Skeletal System',
        text: 'The skull protects the brain. A child can tilt the head forward, and the front of the skull connects to facial bones.',
      },
      {
        id: 2,
        heading: 'Axial Skeleton',
        text: 'The axial skeleton includes the skull, vertebral column, ribs, and sternum.',
      },
    ];
    const sourceOutline = understanding.buildSourceOutline(chunks, { title: 'skeletal-system.pdf' });
    const verdict = judge.judge({
      feature: 'notes',
      stage: 'pre_generation',
      resolvedTopic: 'Linked List',
      requestedTopic: 'Skeletal System',
      domainInfo: { domain: 'science', confidence: 0.8 },
      sourceOutline,
      chunks,
    });

    expect(verdict.decision).toBe('retry');
    expect(verdict.correctedTopic).toMatch(/skeletal/i);
    expect(verdict.correctedTopic).not.toBe('Linked List');
  });

  it('blocks unsupported curated CS drift in non-CS output after one retry', () => {
    const chunks = [
      {
        id: 1,
        heading: 'Skeletal System',
        text: 'The skeletal system supports the body, stores minerals, protects organs, and enables movement.',
      },
    ];
    const sourceOutline = understanding.buildSourceOutline(chunks, { title: 'skeletal-system.pdf' });
    const verdict = judge.judge({
      feature: 'tutor',
      stage: 'post_generation_chat',
      resolvedTopic: 'Skeletal System',
      requestedTopic: 'Skeletal System',
      domainInfo: { domain: 'science', confidence: 0.8 },
      sourceOutline,
      chunks,
      outputText: 'Polymorphism lets a superclass reference point to a subclass object, like Shape and Circle.',
      attempt: 1,
    });

    expect(verdict.decision).toBe('block');
    expect(verdict.reasonCodes).toContain('unsupported_curated_topic');
  });

  it('retries Trees quiz output that drifts into Linked List', () => {
    const chunks = treeChunks();
    const sourceOutline = understanding.buildSourceOutline(chunks, { title: '210-Trees.pdf' });
    const outputText = judge.practiceQuizText({
      questions: [{
        question: 'In a linked list, what does the head pointer store?',
        options: [
          'The first node in a null-terminated chain',
          'The root of a tree hierarchy',
          'The depth of a child node',
          'The height of a subtree',
        ],
        correct_idx: 0,
        explanation: 'A linked list follows node.next references from the head pointer to null.',
        topic: 'Linked List',
      }],
    });
    const verdict = judge.judge({
      feature: 'quiz',
      stage: 'post_generation',
      resolvedTopic: 'Trees',
      requestedTopic: 'Trees',
      sourceOutline,
      chunks,
      outputText,
    });

    expect(verdict.decision).toBe('retry');
    expect(verdict.reasonCodes).toContain('unsupported_topic_drift');
    expect(verdict.correctedTopic).toBe('Trees');
  });

  it('allows source-supported neighboring topics in whole-material notes', () => {
    const chunks = [
      {
        id: 1,
        heading: 'Arrays',
        text: 'Arrays store elements in indexed positions and support random access.',
      },
      {
        id: 2,
        heading: 'Stacks',
        text: 'Stacks use LIFO order with push and pop operations.',
      },
      {
        id: 3,
        heading: 'Queues',
        text: 'Queues use FIFO order with enqueue and dequeue operations.',
      },
      {
        id: 4,
        heading: 'Linked Lists',
        text: 'Linked lists connect nodes by references and support traversal.',
      },
    ];
    const sourceOutline = understanding.buildSourceOutline(chunks, { title: 'Data Structures Survey' });
    const verdict = judge.judge({
      feature: 'notes',
      stage: 'post_generation',
      resolvedTopic: 'Data Structures Survey',
      requestedTopic: 'Data Structures Survey',
      sourceOutline,
      chunks,
      topicMode: 'material_wide',
      outputText: 'Arrays provide random access. Stacks use LIFO push and pop. Queues use FIFO enqueue and dequeue. Linked lists connect nodes by references.',
    });

    expect(verdict.decision).toBe('accept');
    expect(verdict.evidence.drift.relaxed).toBe(true);
  });

  it('accepts Linked List practice output for real Linked List source material', () => {
    const chunks = [
      {
        id: 1,
        heading: 'Linked Lists',
        text: 'A linked list has a head pointer. Each node stores data and a next pointer to the following node.',
      },
      {
        id: 2,
        heading: 'Linked List Insert',
        text: 'Inserting at the front updates the head pointer and the new node.next reference.',
      },
    ];
    const sourceOutline = understanding.buildSourceOutline(chunks, { title: 'linked-list.pdf' });
    const outputText = judge.practiceFlashcardText({
      cards: [{
        question: 'What does the head pointer identify in a linked list?',
        answer: 'It identifies the first node, which links to the next node through node.next.',
        topic: 'Linked List',
      }],
    });
    const verdict = judge.judge({
      feature: 'flashcards',
      stage: 'post_generation',
      resolvedTopic: 'Linked List',
      requestedTopic: 'Linked List',
      sourceOutline,
      chunks,
      outputText,
    });

    expect(verdict.decision).toBe('accept');
    expect(verdict.reasonCodes).toEqual([]);
  });

  it('rejects hashing practice drift for anatomy source material', () => {
    const chunks = [
      {
        id: 1,
        heading: 'Skeletal System',
        text: 'Bones protect organs, support movement, store minerals, and produce blood cells in marrow.',
      },
      {
        id: 2,
        heading: 'Bone Classification',
        text: 'Long, short, flat, irregular, and sesamoid bones are classified by shape and function.',
      },
    ];
    const sourceOutline = understanding.buildSourceOutline(chunks, { title: 'anatomy-bones.pdf' });
    const outputText = judge.practiceQuizText({
      questions: [{
        question: 'What is the role of a hash function in a hash table?',
        options: ['Map keys to buckets', 'Protect organs', 'Classify long bones', 'Produce marrow cells'],
        correct_idx: 0,
        explanation: 'Hashing maps each key to an index in a table.',
        topic: 'Hash Table',
      }],
    });
    const verdict = judge.judge({
      feature: 'quiz',
      stage: 'post_generation',
      resolvedTopic: 'Skeletal System',
      requestedTopic: 'Skeletal System',
      domainInfo: { domain: 'science', confidence: 0.8 },
      sourceOutline,
      chunks,
      outputText,
    });

    expect(verdict.decision).toBe('retry');
    expect(verdict.reasonCodes).toContain('unsupported_curated_topic');
  });

  it('rejects Java interface practice drift for marketing source material', () => {
    const chunks = [
      {
        id: 1,
        heading: 'Marketing Channels',
        text: 'Marketing teams compare audience segments, campaign channels, conversion rate, and customer retention.',
      },
      {
        id: 2,
        heading: 'Campaign Positioning',
        text: 'A campaign message should align the offer, customer need, and buying stage.',
      },
    ];
    const sourceOutline = understanding.buildSourceOutline(chunks, { title: 'marketing-strategy.pdf' });
    const outputText = judge.practiceFlashcardText({
      cards: [{
        question: 'What is a Java interface used for?',
        answer: 'An interface declares methods that implementing classes must provide, supporting polymorphism.',
        topic: 'Interface',
      }],
    });
    const verdict = judge.judge({
      feature: 'flashcards',
      stage: 'post_generation',
      resolvedTopic: 'Marketing Strategy',
      requestedTopic: 'Marketing Strategy',
      domainInfo: { domain: 'business', confidence: 0.8 },
      sourceOutline,
      chunks,
      outputText,
    });

    expect(verdict.decision).toBe('retry');
    expect(verdict.reasonCodes).toContain('unsupported_curated_topic');
  });
});
