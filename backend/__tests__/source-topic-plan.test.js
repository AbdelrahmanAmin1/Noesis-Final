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

  it('recovers database topics from chunks when outline headings are collapsed', () => {
    const chunks = [
      { id: 1, text: 'An ERD models entities, relationships, attributes, and cardinality.' },
      { id: 2, text: 'Normalization reduces redundancy and avoids update anomalies through normal forms.' },
      { id: 3, text: 'SQL SELECT statements query tables with SELECT, FROM, WHERE, and JOIN.' },
      { id: 4, text: 'Transactions follow ACID properties and can COMMIT or ROLLBACK.' },
    ];

    const plan = sourceTopicPlans.buildSourceTopicPlan({
      chunks,
      sourceScope: 'material',
      domainInfo: { domain: 'databases' },
      materialTitle: 'Database Lecture',
      sourceOutline: { mainTopic: 'Databases', majorTopics: [] },
    });

    expect(plan.topicMode).toBe('material_wide');
    expect(plan.topicBundle.map(item => item.topic)).toEqual(
      expect.arrayContaining(['ERD', 'Normalization', 'SQL', 'Transactions'])
    );
    expect(plan.hasMultipleTopics).toBe(true);
  });

  it('recovers network topics from source chunks without CS-only gating', () => {
    const chunks = [
      { id: 1, text: 'The OSI Model has physical, data link, network, transport, session, presentation, and application layers.' },
      { id: 2, text: 'TCP/IP groups network access, internet, transport, and application layers.' },
      { id: 3, text: 'DNS resolution maps a domain name to an IP address through a resolver query.' },
      { id: 4, text: 'Routing moves packets through a router using a routing table and next hop.' },
    ];

    const plan = sourceTopicPlans.buildSourceTopicPlan({
      chunks,
      sourceScope: 'material',
      domainInfo: { domain: 'networks' },
      materialTitle: 'Network Fundamentals',
      sourceOutline: { mainTopic: 'Networks', majorTopics: [] },
    });

    expect(plan.topicBundle.map(item => item.topic)).toEqual(
      expect.arrayContaining(['OSI Model', 'TCP/IP', 'DNS', 'Routing'])
    );
    expect(plan.primaryTopic).toMatch(/OSI Model/);
  });
});
