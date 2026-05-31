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
});
