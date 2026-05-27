'use strict';

const seedKnowledge = require('../scripts/seed-knowledge-corpus');
const knowledge = require('../services/knowledge.service');

describe('seed-knowledge-corpus', () => {
  beforeEach(() => {
    knowledge.clearCache();
  });

  it('builds searchable chunks from a curated topic', () => {
    const topic = knowledge.getTopic('encapsulation', { refresh: true });
    const chunks = seedKnowledge.buildTopicChunks(topic);

    expect(chunks.length).toBeGreaterThanOrEqual(5);
    expect(chunks.some(chunk => chunk.heading.includes('overview'))).toBe(true);
    expect(chunks.some(chunk => chunk.hasCode === 1 && chunk.text.includes('class BankAccount'))).toBe(true);
    expect(chunks.some(chunk => chunk.text.includes('Common') || chunk.text.includes('Mistake'))).toBe(true);
    expect(chunks.every(chunk => chunk.text.includes('Source: curated project-authored knowledge'))).toBe(true);
  });

  it('plans all curated topics during dry-run without touching the database', async () => {
    const result = await seedKnowledge.run({ dryRun: true, silent: true });

    expect(result.dryRun).toBe(true);
    expect(result.processed).toBeGreaterThanOrEqual(10);
    expect(result.chunks).toBeGreaterThanOrEqual(50);
    expect(result.topics.some(topic => topic.title === 'Curated Knowledge: Stack')).toBe(true);
    expect(result.topics.some(topic => topic.title === 'Curated Knowledge: Class and Object')).toBe(true);
  });

  it('supports filtering one topic by alias in dry-run mode', async () => {
    const result = await seedKnowledge.run({ dryRun: true, only: 'BST', silent: true });

    expect(result.processed).toBe(1);
    expect(result.topics[0].title).toBe('Curated Knowledge: Binary Search Tree');
  });
});
