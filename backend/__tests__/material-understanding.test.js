'use strict';

const understanding = require('../services/material-understanding.service');
const resolver = require('../services/topic-resolver.service');

describe('material-understanding.service', () => {
  function skeletalChunks() {
    return [
      { id: 1, idx: 0, chapter_title: 'Document', heading: 'Top', text: 'Welcome' },
      {
        id: 2,
        idx: 1,
        chapter_title: 'Introduction to Anatomy: The Skeletal System',
        heading: 'Introduction to Anatomy: The Skeletal System',
        text: 'The skeletal system supports the body, stores minerals, produces red blood cells, protects organs and tissues, and enables movement using levers.',
        keywords_json: JSON.stringify(['skeletal system', 'support', 'mineral storage', 'red blood cell production']),
      },
      {
        id: 3,
        idx: 2,
        chapter_title: 'Axial Skeleton',
        heading: 'Axial Skeleton',
        text: 'The axial skeleton includes the skull, vertebral column, ribs, and sternum.',
        keywords_json: JSON.stringify(['axial skeleton', 'skull', 'vertebrae']),
      },
      {
        id: 4,
        idx: 3,
        chapter_title: 'Appendicular Skeleton',
        heading: 'Appendicular Skeleton',
        text: 'The appendicular skeleton includes upper limb bones, lower limb bones, shoulder girdle, and pelvic girdle.',
        keywords_json: JSON.stringify(['appendicular skeleton', 'upper limb bones', 'lower limb bones']),
      },
      {
        id: 5,
        idx: 4,
        chapter_title: 'Shapes of Bones',
        heading: 'Shapes of Bones',
        text: 'Long bones, short bones, flat bones, irregular bones, and sesamoid bones are common bone shape categories.',
        keywords_json: JSON.stringify(['bone shapes', 'long bones', 'flat bones']),
      },
      {
        id: 6,
        idx: 5,
        chapter_title: 'Quiz Answer Keys',
        heading: 'Quiz Answer Keys',
        text: 'Quiz answer keys and review questions appear after the teaching sections.',
      },
    ];
  }

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

  it('builds a source outline from anatomy headings and filters boilerplate', () => {
    const result = understanding.understandGeneralFromChunks(skeletalChunks(), {
      title: '411skeletal.pdf',
      domainInfo: { domain: 'science', confidence: 0.82 },
    });
    const outlineText = JSON.stringify(result.sourceOutline).toLowerCase();
    const headings = result.sourceOutline.meaningfulSections.map(section => section.title.toLowerCase());

    expect(result.topic).toMatch(/skeletal system/i);
    expect(headings).toEqual(expect.arrayContaining([
      expect.stringMatching(/skeletal system/),
      expect.stringMatching(/axial skeleton/),
      expect.stringMatching(/appendicular skeleton/),
      expect.stringMatching(/shapes of bones/),
    ]));
    expect(headings.join(' ')).not.toMatch(/\b(document|top|welcome|quiz answer keys)\b/);
    expect(result.sourceOutline.quizSections.map(section => section.title)).toEqual(expect.arrayContaining(['Quiz Answer Keys']));
    expect(outlineText).toMatch(/red blood cells|red blood cell/);
    expect(outlineText).toMatch(/skull|vertebral|vertebrae/);
    expect(outlineText).toMatch(/upper limb|lower limb/);
    expect(result.sourceOutline.sourceFacts.facts.join(' ')).toMatch(/supports the body|stores minerals|red blood cells/i);
    expect(result.sourceOutline.sourceFacts.classifications.join(' ')).toMatch(/axial skeleton includes|appendicular skeleton includes|bone shape categories/i);
  });

  it('filters repeated navigation lines while keeping source body facts', () => {
    const chunks = [
      {
        id: 101,
        idx: 0,
        chapter_title: 'Marketing Strategy',
        heading: 'Market Segmentation',
        text: 'Introduction\nMarketing Strategy\nQuiz\nMarket segmentation divides customers into groups with similar needs.\nExamples include demographic, geographic, behavioral, and psychographic segments.',
      },
      {
        id: 102,
        idx: 1,
        chapter_title: 'Marketing Strategy',
        heading: 'Targeting',
        text: 'Introduction\nMarketing Strategy\nQuiz\nTargeting means choosing which segment the company will serve.\nA target market should be measurable, reachable, and profitable.',
      },
      {
        id: 103,
        idx: 2,
        chapter_title: 'Marketing Strategy',
        heading: 'Positioning',
        text: 'Introduction\nMarketing Strategy\nQuiz\nPositioning explains how the brand should be perceived compared with competitors.',
      },
      {
        id: 104,
        idx: 3,
        chapter_title: 'Marketing Strategy',
        heading: 'Marketing Mix',
        text: 'Introduction\nMarketing Strategy\nQuiz\nThe marketing mix includes product, price, place, and promotion.',
      },
    ];

    const outline = understanding.buildSourceOutline(chunks, { title: 'marketing-week-2.pdf' });
    const allFacts = JSON.stringify(outline.sourceFacts).toLowerCase();
    const ignored = outline.ignoredBoilerplate.map(item => `${item.label}:${item.reason}`).join(' ').toLowerCase();

    expect(ignored).toMatch(/introduction:repeated_navigation|quiz:repeated_navigation/);
    expect(allFacts).toMatch(/market segmentation divides customers|targeting means choosing|marketing mix includes/);
    expect(allFacts).not.toMatch(/introduction marketing strategy quiz introduction/);
  });

  it('extracts generic definitions, examples, classifications, numbers, processes, and review questions', () => {
    const facts = understanding._internals.extractSourceFactsFromSection({
      title: 'General Lecture',
      text: [
        'Opportunity cost is the value of the next best alternative.',
        'Examples include time, money, or resources given up for another choice.',
        'Project phases include initiation, planning, execution, and closure.',
        'First identify the constraint. Then compare possible choices. Finally evaluate the result.',
        'A 20 percent discount reduces the listed price before tax.',
        'Why does opportunity cost matter when choosing between two projects?',
      ].join('\n'),
    });

    expect(facts.definitions.join(' ')).toMatch(/opportunity cost is/i);
    expect(facts.examples.join(' ')).toMatch(/examples include/i);
    expect(facts.classifications.join(' ')).toMatch(/phases include/i);
    expect(facts.processes.join(' ')).toMatch(/first identify|finally evaluate/i);
    expect(facts.numbers.join(' ')).toMatch(/20 percent/);
    expect(facts.reviewQuestions.join(' ')).toMatch(/why does opportunity cost matter/i);
  });

  it('resolves weak material titles from uploaded headings instead of the file label', () => {
    const result = understanding.understandGeneralFromChunks(skeletalChunks().slice(0, 4), {
      title: 'Document',
      domainInfo: { domain: 'science', confidence: 0.7 },
    });

    expect(result.topic).toMatch(/skeletal system/i);
    expect(result.topic).not.toMatch(/^Document$/i);
    expect(result.source).toBe('source_heading');
  });

  it('detects focused topic drift across multi-topic source outlines', () => {
    const outline = understanding.buildSourceOutline([
      { id: 10, idx: 0, chapter_title: 'Trees', heading: 'Tree Introduction', text: 'Trees have a root node, edges, parent child relationships, and leaves.' },
      { id: 11, idx: 1, chapter_title: 'Binary Trees', heading: 'Tree Traversal', text: 'Binary tree traversal can be preorder, inorder, and postorder.' },
      { id: 12, idx: 2, chapter_title: 'Binary Search Tree', heading: 'BST Operations', text: 'A BST stores smaller keys in the left subtree and supports search, insert, and delete.' },
      { id: 13, idx: 3, chapter_title: 'Hashing', heading: 'Hash Table', text: 'A hash function maps keys to buckets in a hash table.' },
      { id: 14, idx: 4, chapter_title: 'Collision Resolution', heading: 'Open Addressing', text: 'Collisions use separate chaining, linear probing, quadratic probing, or double hashing.' },
    ], { title: 'Data Structures Unit' });

    const focusTerms = understanding.focusTermsForTopic('Trees', outline);
    const competingTerms = understanding.competingTermsForTopic('Trees', outline);
    const treeOutput = understanding.detectTopicDrift('Trees use root nodes, edges, leaves, traversal, and BST operations.', { focusTopic: 'Trees', sourceOutline: outline });
    const hashOutput = understanding.detectTopicDrift('Hash tables use buckets, hash functions, collisions, probing, and chaining.', { focusTopic: 'Trees', sourceOutline: outline });

    expect(focusTerms.join(' ')).toMatch(/Trees|Root Node|Traversal|Binary Trees/i);
    expect(competingTerms.join(' ')).toMatch(/Hashing|Collision|Probing|Chaining/i);
    expect(treeOutput.drifted).toBe(false);
    expect(hashOutput.drifted).toBe(true);
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
