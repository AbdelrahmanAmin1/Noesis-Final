'use strict';

const knowledge = require('../services/knowledge.service');

describe('knowledge.service', () => {
  beforeEach(() => {
    knowledge.clearCache();
  });

  it('loads curated topic files without treating schema.json as a topic', () => {
    const topics = knowledge.listTopics({ refresh: true });
    expect(topics.length).toBeGreaterThanOrEqual(10);
    expect(topics.some(topic => topic.topic === 'Encapsulation')).toBe(true);
    expect(topics.some(topic => topic.topic === 'Class and Object')).toBe(true);
    expect(topics.some(topic => topic.id === 'schema')).toBe(false);
  });

  it('finds topics by aliases and normalized phrases', () => {
    expect(knowledge.getTopic('data hiding').id).toBe('oop_encapsulation');
    expect(knowledge.getTopic('dynamic dispatch').id).toBe('oop_polymorphism');
    expect(knowledge.getTopic('linked list').id).toBe('ds_linked_list');
    expect(knowledge.getTopic('Big O').id).toBe('big_o_notation');
    expect(knowledge.getTopic('LIFO').id).toBe('ds_stack');
    expect(knowledge.getTopic('FIFO').id).toBe('ds_queue');
    expect(knowledge.getTopic('BST').id).toBe('ds_binary_search_tree');
    expect(knowledge.getTopic('blueprint').id).toBe('oop_class_object');
  });

  it('matches topics conservatively with reasons', () => {
    expect(knowledge.matchTopic('Dynamic Dispatch').topic.id).toBe('oop_polymorphism');
    expect(knowledge.matchTopic('LIFO').topic.id).toBe('ds_stack');
    expect(knowledge.matchTopic('FIFO').topic.id).toBe('ds_queue');
    expect(knowledge.matchTopic('BST').topic.id).toBe('ds_binary_search_tree');
    expect(knowledge.matchTopic('Data hiding').topic.id).toBe('oop_encapsulation');
    expect(knowledge.matchTopic('Blueprint').topic.id).toBe('oop_class_object');
    expect(knowledge.matchTopic('quantum entanglement', { minScore: 80 }).topic).toBeNull();
  });

  it('returns focused teaching assets for a topic', () => {
    const code = knowledge.getCodeExample('encapsulation', 'java');
    const mistakes = knowledge.getCommonMistakes('encapsulation');
    const visual = knowledge.getVisualTemplate('encapsulation');

    expect(code.title).toMatch(/BankAccount|public field/i);
    expect(code.walkthrough.length).toBeGreaterThan(0);
    expect(mistakes.length).toBeGreaterThanOrEqual(3);
    expect(visual).toBeTruthy();
  });

  it('serializes prompt context with v1 fields needed by note and video prompts', () => {
    const promptContext = knowledge.topicToPromptContext('linked list');
    const parsed = JSON.parse(promptContext);

    expect(parsed.topic).toBe('Linked List');
    expect(parsed.codeExamples[0].walkthrough.length).toBeGreaterThan(0);
    expect(parsed.diagrams[0].nodes.length).toBeGreaterThan(0);
    expect(parsed.commonMistakes.length).toBeGreaterThan(0);
    expect(parsed.miniQuiz.length).toBeGreaterThan(0);
    expect(parsed.flashcards.length).toBeGreaterThan(0);
  });

  it('resolves related topic labels when matching files exist', () => {
    const related = knowledge.getRelatedTopics('inheritance');
    const polymorphism = related.nextTopics.find(item => item.label === 'Polymorphism');

    expect(polymorphism).toBeTruthy();
    expect(polymorphism.topic.id).toBe('oop_polymorphism');
  });
});
