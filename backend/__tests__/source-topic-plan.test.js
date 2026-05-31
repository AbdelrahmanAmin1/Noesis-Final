'use strict';

const sourceTopicPlans = require('../services/source-topic-plan.service');

describe('source-topic-plan.service', () => {
  it('builds a balanced DS bundle from chunk mentions, not only outline headings', () => {
    const chunks = [
      { id: 1, text: 'Stacks use LIFO. Push adds an item and pop removes from the top.' },
      { id: 2, text: 'Queues use FIFO. Enqueue at the rear and dequeue at the front.' },
      { id: 3, text: 'Priority Queue removes the highest priority element, often implemented with a heap.' },
      { id: 4, text: 'A double ended queue, or deque, allows insert and delete at both front and rear.' },
    ];

    const plan = sourceTopicPlans.buildSourceTopicPlan({
      chunks,
      sourceScope: 'material',
      domainInfo: { domain: 'Data Structures' },
      materialTitle: 'INFO material concepts',
      sourceOutline: { mainTopic: 'Data Structures', majorTopics: [] },
    });

    expect(plan.topicMode).toBe('material_wide');
    expect(plan.topicBundle.map(item => item.topic)).toEqual(
      expect.arrayContaining(['Stack', 'Queue', 'Priority Queue', 'Deque'])
    );
    expect(plan.topicBundle.map(item => item.topic)).not.toContain('INFO material concepts');
  });
});
