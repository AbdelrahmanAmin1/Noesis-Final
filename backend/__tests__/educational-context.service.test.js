'use strict';

const educationalContext = require('../services/educational-context.service');
const knowledge = require('../services/knowledge.service');

describe('educational-context.service', () => {
  beforeEach(() => {
    knowledge.clearCache();
  });

  it('matches curated topics by required aliases', () => {
    const cases = [
      ['Dynamic Dispatch', 'Polymorphism'],
      ['LIFO', 'Stack'],
      ['FIFO', 'Queue'],
      ['BST', 'Binary Search Tree'],
      ['Data hiding', 'Encapsulation'],
      ['Blueprint', 'Class and Object'],
    ];

    for (const [query, topic] of cases) {
      const context = educationalContext.buildEducationalContext({ query, feature: 'tutor' });
      expect(context.curatedKnowledge.topic).toBe(topic);
      expect(context.trace.curatedMatched).toBe(true);
    }
  });

  it('does not force unrelated curated knowledge for unknown topics', () => {
    const context = educationalContext.buildEducationalContext({
      query: 'Explain operating system deadlocks',
      feature: 'tutor',
    });

    expect(context.curatedKnowledge).toBeNull();
    expect(context.trace.curatedMatched).toBe(false);
  });

  it('keeps uploaded and system chunks separate', () => {
    const ragResult = {
      chunks: [
        { id: 1, corpus: 'uploaded', heading: 'Lecture', text: 'The teacher defines encapsulation as protected state.' },
        { id: 2, corpus: 'system', heading: 'Encapsulation overview', text: 'Curated definition and examples.' },
      ],
      uploaded: { chunks: [{ id: 1, heading: 'Lecture', text: 'The teacher defines encapsulation as protected state.' }], maxScore: 0.5 },
      system: { chunks: [{ id: 2, heading: 'Encapsulation overview', text: 'Curated definition and examples.' }], maxScore: 0.4 },
    };

    const context = educationalContext.buildEducationalContext({
      topic: 'Encapsulation',
      query: 'Encapsulation',
      feature: 'tutor',
      ragResult,
    });

    expect(context.materialContext.chunks).toHaveLength(1);
    expect(context.systemContext.chunks).toHaveLength(1);
    expect(context.materialContext.confidence).toBe('low');
    expect(context.curatedKnowledge.topic).toBe('Encapsulation');
    expect(context.generationPolicy.priority).toMatch(/uploaded material first/i);
  });

  it('formats compact prompt context within budget', () => {
    const context = educationalContext.buildEducationalContext({
      query: 'Give me a linked list example',
      feature: 'tutor',
    });
    const promptContext = educationalContext.formatEducationalContextForPrompt(context, { maxChars: 1200 });

    expect(promptContext.length).toBeLessThanOrEqual(1200);
    expect(promptContext).toContain('Linked List');
    expect(promptContext).toContain('uploaded material first');
  });

  it('formats compact video context with curated assets and budget', () => {
    const context = educationalContext.buildEducationalContext({
      query: 'Create a video about data hiding',
      feature: 'video',
      ragResult: {
        uploaded: {
          chunks: [{ id: 7, heading: 'Lecture', text: 'The lecture introduces data hiding.' }],
          maxScore: 0.5,
        },
        system: {
          chunks: [{ id: 99, heading: 'Curated Encapsulation', text: 'Encapsulation uses private fields and public methods.' }],
          maxScore: 0.4,
        },
      },
    });

    const promptContext = educationalContext.formatVideoEducationalContextForPrompt(context, { maxChars: 4000 });

    expect(promptContext.length).toBeLessThanOrEqual(4000);
    expect(promptContext).toContain('Encapsulation');
    expect(promptContext).toContain('codeExample');
    expect(promptContext).toContain('diagram');
    expect(promptContext).toContain('commonMistakes');
    expect(promptContext).toContain('uploaded');
  });

  it('formats compact practice context for quizzes and flashcards', () => {
    const context = educationalContext.buildEducationalContext({
      query: 'quiz me on data hiding',
      feature: 'quiz',
      ragResult: {
        uploaded: {
          chunks: [{ id: 4, heading: 'Encapsulation', text: 'The lecture says fields should be private.' }],
          maxScore: 0.5,
        },
        system: {
          chunks: [{ id: 40, heading: 'Curated Encapsulation', text: 'Use validation through methods.' }],
          maxScore: 0.3,
        },
      },
    });

    const promptContext = educationalContext.formatPracticeEducationalContextForPrompt(context, { feature: 'quiz', maxChars: 4000 });

    expect(promptContext.length).toBeLessThanOrEqual(4000);
    expect(promptContext).toContain('Encapsulation');
    expect(promptContext).toContain('commonMistakes');
    expect(promptContext).toContain('miniQuiz');
    expect(promptContext).toContain('flashcards');
    expect(promptContext).toContain('uploaded material first');
  });

  it('does not inject unrelated curated practice context for unknown topics', () => {
    const context = educationalContext.buildEducationalContext({
      query: 'quiz me on CPU scheduling',
      feature: 'flashcards',
    });
    const promptContext = educationalContext.formatPracticeEducationalContextForPrompt(context, { feature: 'flashcards', maxChars: 2000 });

    expect(context.curatedKnowledge).toBeNull();
    expect(promptContext).toContain('"curatedKnowledge": null');
    expect(promptContext).not.toContain('BankAccount');
    expect(promptContext).not.toContain('Linked List');
  });
});
