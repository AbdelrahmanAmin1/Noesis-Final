'use strict';

const quality = require('../services/note-content-quality.service');

describe('note content quality metadata filtering', () => {
  const noisyChunks = [
    {
      id: 1,
      heading: 'SELVA KUMAR S',
      chapter_title: 'UNIT 4',
      text: [
        'SELVA KUMAR S',
        'Assistant Professor, B.M.S. College of Engineering',
        'DATA STRUCTURES',
        'Trees organize nodes with root, parent, child, siblings, leaf node, height, and depth.',
        'A binary search tree stores smaller keys in the left subtree and larger keys in the right subtree.',
        'Hashing uses a hash function; collisions may be handled with chaining.',
      ].join('\n'),
      keywords_json: JSON.stringify(['SELVA', 'Kumar', 'Trees', 'Binary Search Tree', 'Hashing', 'College of Engineering']),
    },
    {
      id: 2,
      heading: 'DATA STRUCTURES',
      text: 'Tree traversal includes preorder, inorder, and postorder. BST search, insertion, and deletion follow the ordering rule.',
      keywords_json: JSON.stringify(['root', 'leaf node', 'traversal', 'collision']),
    },
  ];

  it('rejects source metadata and preserves tree/BST/hashing terms', () => {
    const profile = quality.buildMetadataProfile({ chunks: noisyChunks, materialTitle: 'Trees Unit Notes' });

    expect(quality.containsMetadata('SELVA KUMAR S', profile)).toBe(true);
    expect(quality.containsMetadata('Kumar', profile)).toBe(true);
    expect(quality.containsMetadata('B.M.S. College of Engineering', profile)).toBe(true);
    expect(quality.containsMetadata('Assistant Professor', profile)).toBe(true);

    expect(quality.containsMetadata('Binary Search Tree', profile)).toBe(false);
    expect(quality.containsMetadata('leaf node', profile)).toBe(false);
    expect(quality.containsMetadata('hash function', profile)).toBe(false);
    expect(quality.containsMetadata('collision', profile)).toBe(false);
  });

  it('sanitizes chunks without mutating the stored raw text shape', () => {
    const profile = quality.buildMetadataProfile({ chunks: noisyChunks });
    const sanitized = quality.sanitizeChunks(noisyChunks, profile);

    expect(noisyChunks[0].text).toContain('SELVA KUMAR S');
    expect(sanitized[0].text).not.toMatch(/selva|kumar|college|assistant professor/i);
    expect(sanitized[0].text).toMatch(/Trees organize nodes/i);
    expect(JSON.parse(sanitized[0].keywords_json)).toEqual(expect.arrayContaining(['Trees', 'Binary Search Tree', 'Hashing']));
    expect(JSON.parse(sanitized[0].keywords_json).join(' ')).not.toMatch(/selva|college|kumar/i);
  });

  it('flags contaminated lesson fields and passes after sanitization', () => {
    const profile = quality.buildMetadataProfile({ chunks: noisyChunks });
    const lesson = {
      topic: 'SELVA KUMAR S / COLLEGE OF ENGINEERING / Trees / Leaf Node',
      lessonType: 'data_structure',
      learningObjectives: ['Review Selva and trees'],
      studyGuide: {
        keyConcepts: ['Kumar', 'Binary Search Tree', 'College of Engineering'],
        checkpoints: ['What is Kumar?'],
      },
      sections: [
        {
          type: 'checkpoint',
          title: 'Review Questions',
          content: 'Answer using the topic.',
          diagram: { type: 'mindmap', nodes: ['SELVA', 'Root', 'Leaf node'] },
          quiz: [{ question: 'Which option is a tree concept?', options: ['Selva', 'Kumar', 'Root node', 'College'], answer: 'Root node' }],
        },
      ],
      relatedTopics: ['Assistant Professor', 'Hashing'],
    };

    expect(quality.validateLesson(lesson, { profile }).passed).toBe(false);

    const clean = quality.sanitizeLesson(lesson, {
      profile,
      chunks: noisyChunks,
      fallbackTopic: 'Trees',
      sourceOutline: { keyConcepts: ['Trees', 'Binary Search Tree', 'Hashing'] },
    });
    const validation = quality.validateLesson(clean, { profile });

    expect(validation.passed).toBe(true);
    expect(clean.topic).toMatch(/tree/i);
    expect(JSON.stringify(clean)).not.toMatch(/selva|kumar|college|assistant professor/i);
    expect(JSON.stringify(clean)).toMatch(/Binary Search Tree|Root node|Hashing/i);
  });
});
