'use strict';

const materialTopicMap = require('../services/material-topic-map.service');

describe('material-topic-map.service helpers', () => {
  it('keeps stack and queue as separate material-wide allocations', () => {
    const topicMap = {
      title: 'Stack / Queue',
      topics: [
        {
          id: 'topic-stack',
          name: 'Stack',
          order: 0,
          terms: ['LIFO', 'push', 'pop'],
          sourceChunkIds: [1, 2],
          sourcePageRefs: [{ kind: 'page', pageNumber: 3, label: 'Page 3' }],
          requiredVisualTypes: ['stack_operation'],
        },
        {
          id: 'topic-queue',
          name: 'Queue',
          order: 1,
          terms: ['FIFO', 'enqueue', 'dequeue', 'front', 'rear'],
          sourceChunkIds: [3, 4],
          sourcePageRefs: [{ kind: 'page', pageNumber: 7, label: 'Page 7' }],
          requiredVisualTypes: ['queue_operation'],
        },
      ],
      coveragePlan: {
        mode: 'material_wide',
        allocations: [
          { topicId: 'topic-stack', sourceChunkIds: [1, 2] },
          { topicId: 'topic-queue', sourceChunkIds: [3, 4] },
        ],
      },
    };
    const chunks = [1, 2, 3, 4].map(id => ({ id, text: `chunk ${id}` }));

    const plan = materialTopicMap.sourceTopicPlanForMap(topicMap, chunks, {});

    expect(plan.topicMode).toBe('material_wide');
    expect(plan.primaryTopic).toBe('Stack / Queue');
    expect(plan.topicBundle.map(item => item.topic)).toEqual(['Stack', 'Queue']);
    expect(plan.balancedChunks.map(chunk => chunk.id)).toEqual([1, 3, 2, 4]);
  });

  it('infers deterministic visual requirements for common domains', () => {
    const required = materialTopicMap._internals.requiredVisualTypesForTopic(
      { name: 'Queue operations', terms: ['FIFO', 'enqueue', 'dequeue', 'front', 'rear'] },
      'Data Structures',
    );

    expect(required).toContain('queue_operation');
  });

  it('derives strong stack and queue topics from source chunks even when the stored map collapsed', () => {
    const chunks = [
      { id: 1, idx: 1, text: 'Operations on stacks include PUSH OPERATION IN STACK, POP OPERATION IN STACK, top pointer, and LIFO order.' },
      { id: 2, idx: 2, text: 'Queue operations use FIFO. Enqueue inserts at the rear and dequeue removes from the front.' },
      { id: 3, idx: 3, text: 'Circular queue checks FRONT and REAR before inserting or deleting items.' },
    ];

    const derived = materialTopicMap._internals.derivedTopicsFromChunks(chunks, 'Data Structures');

    expect(derived.map(topic => topic.name)).toEqual(expect.arrayContaining(['Stack', 'Queue']));
    expect(materialTopicMap._internals.storedMapMissesStrongTopics({ topics: [{ name: 'Queue' }] }, chunks, 'Data Structures')).toBe(true);
  });

  it('normalizes operation headings into their parent topic names', () => {
    const topicMap = materialTopicMap._internals.buildTopicMapFromPartsForTest({
      plan: {
        topicBundle: [
          { topic: 'PUSH OPERATION IN STACK', terms: ['push'] },
          { topic: 'POP OPERATION IN STACK', terms: ['pop'] },
          { topic: 'Queue', terms: ['FIFO'] },
        ],
        primaryTopic: 'PUSH OPERATION IN STACK',
      },
      outline: { keyConcepts: [] },
      chunks: [
        { id: 1, idx: 1, text: 'PUSH OPERATION IN STACK adds an item to the top.', source_page: 7 },
        { id: 2, idx: 2, text: 'POP OPERATION IN STACK removes an item from the top.', source_page: 8 },
        { id: 3, idx: 3, text: 'Queue operations use FIFO with front and rear pointers.', source_page: 9 },
      ],
      visuals: [],
      domain: 'Data Structures',
    });

    expect(topicMap.topics.map(topic => topic.name).slice(0, 2)).toEqual(['Stack', 'Queue']);
    expect(topicMap.title).toBe('Stack / Queue');
  });

  it('normalizes operation and process headings beyond stack and queue', () => {
    const normalize = materialTopicMap._internals.canonicalTopicForHeading;

    expect(normalize('METHOD OVERRIDING IN POLYMORPHISM')).toBe('Polymorphism');
    expect(normalize('PRIMARY KEY IN DATABASES')).toBe('Database Keys');
    expect(normalize('DNS RESOLUTION PROCESS')).toBe('DNS');
    expect(normalize('TCP THREE WAY HANDSHAKE')).toBe('TCP');
    expect(normalize('SQL SELECT STATEMENT')).toBe('SQL');
  });

  it('recovers a collapsed OOP map into source-backed topics', () => {
    const chunks = [
      { id: 1, idx: 1, text: 'Classes and objects use constructors to create instances with fields and methods.' },
      { id: 2, idx: 2, text: 'Encapsulation protects private fields and uses public methods for validation.' },
      { id: 3, idx: 3, text: 'Inheritance uses a superclass and subclass with an extends relationship.' },
      { id: 4, idx: 4, text: 'Polymorphism uses method overriding and dynamic dispatch at runtime.' },
    ];

    const derived = materialTopicMap._internals.derivedTopicsFromChunks(chunks, 'Object-Oriented Programming');
    const names = derived.map(topic => topic.name);

    expect(names).toEqual(expect.arrayContaining(['Classes and Objects', 'Encapsulation', 'Inheritance', 'Polymorphism']));
    expect(materialTopicMap._internals.storedMapMissesStrongTopics({ topics: [{ name: 'Classes and Objects' }] }, chunks, 'Object-Oriented Programming')).toBe(true);
  });

  it('builds a database-wide topic map without data-structure assumptions', () => {
    const chunks = [
      { id: 1, idx: 1, text: 'An ERD shows entities, relationships, attributes, and cardinality.', source_page: 1 },
      { id: 2, idx: 2, text: 'Normalization reduces redundancy. First normal form and third normal form avoid update anomalies.', source_page: 2 },
      { id: 3, idx: 3, text: 'SQL SELECT statements use SELECT, FROM, WHERE, and JOIN to query data.', source_page: 3 },
      { id: 4, idx: 4, text: 'Transactions use ACID properties. COMMIT saves work and ROLLBACK restores a safe state.', source_page: 4 },
    ];

    const topicMap = materialTopicMap._internals.buildTopicMapFromPartsForTest({
      plan: { topicBundle: [], primaryTopic: 'Databases' },
      outline: { keyConcepts: [] },
      chunks,
      visuals: [],
      domain: 'Databases',
    });

    expect(topicMap.topics.map(topic => topic.name)).toEqual(expect.arrayContaining(['ERD', 'Normalization', 'SQL', 'Transactions']));
    expect(topicMap.coveragePlan.mode).toBe('material_wide');
    expect(topicMap.title).toMatch(/ERD/);
    expect(topicMap.title).toMatch(/Normalization/);
    expect(topicMap.topics.find(topic => topic.name === 'Normalization').requiredVisualTypes).toContain('process_flow');
  });

  it('derives multiple network topics and useful generic visual requirements', () => {
    const chunks = [
      { id: 1, idx: 1, text: 'The OSI model organizes communication into physical, data link, network, transport, session, presentation, and application layers.' },
      { id: 2, idx: 2, text: 'TCP/IP groups protocols into network access, internet, transport, and application layers.' },
      { id: 3, idx: 3, text: 'DNS resolution sends a domain name query to a resolver and returns an IP address.' },
      { id: 4, idx: 4, text: 'Routing moves a packet through routers by choosing a route and next hop.' },
    ];

    const derived = materialTopicMap._internals.derivedTopicsFromChunks(chunks, 'Networks');
    const names = derived.map(topic => topic.name);

    expect(names).toEqual(expect.arrayContaining(['OSI Model', 'TCP/IP', 'DNS', 'Routing']));
    expect(materialTopicMap._internals.requiredVisualTypesForTopic(
      { name: 'DNS', terms: ['dns resolution', 'resolver', 'ip address'] },
      'Networks',
    )).toContain('process_flow');
  });
});
