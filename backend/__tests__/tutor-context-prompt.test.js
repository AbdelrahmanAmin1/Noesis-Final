'use strict';

const prompts = require('../utils/prompts');
const educationalContext = require('../services/educational-context.service');

describe('tutor curated-context prompts', () => {
  it('includes curated knowledge and uploaded-first policy in normal tutor chat prompts', () => {
    const context = educationalContext.buildEducationalContext({
      query: 'Give me an encapsulation example',
      feature: 'tutor',
      ragResult: {
        chunks: [{ id: 1, corpus: 'uploaded', text: 'Our lecture says encapsulation protects object state.', heading: 'Lecture' }],
        uploaded: { chunks: [{ id: 1, text: 'Our lecture says encapsulation protects object state.', heading: 'Lecture' }], maxScore: 0.6 },
        system: { chunks: [], maxScore: 0 },
      },
    });
    const educationalPrompt = educationalContext.formatEducationalContextForPrompt(context, { maxChars: 6000 });
    const prompt = prompts.TUTOR_CHAT(
      [{ id: 1, text: 'Our lecture says encapsulation protects object state.', heading: 'Lecture' }],
      'Give me an encapsulation example',
      { groundingTier: 'strong', educationalContext: educationalPrompt }
    );

    expect(prompt).toContain('Educational context');
    expect(prompt).toContain('BankAccount');
    expect(prompt).toContain('validation');
    expect(prompt).toContain('bad public field example');
    expect(prompt).toContain('common mistake');
    expect(prompt).toContain('checkpoint question');
    expect(prompt).toContain('uploaded material');
    expect(prompt).toContain('Curated knowledge');
    expect(prompt).toContain('Never use placeholder phrases');
  });

  it('includes action-specific curated guidance for give example', () => {
    const context = educationalContext.buildEducationalContext({
      query: 'Dynamic Dispatch',
      feature: 'tutor',
    });
    const prompt = prompts.TUTOR_CHAT_ACTION([], 'Show me a concrete code example.', {
      actionLabel: 'Give example',
      actionInstructions: 'Give one compact code example.',
      groundingTier: 'weak',
      educationalContext: educationalContext.formatEducationalContextForPrompt(context, { maxChars: 6000 }),
    });

    expect(prompt).toContain('For Give example');
    expect(prompt).toContain('Shape s = new Circle();');
    expect(prompt).toContain('overridden method');
    expect(prompt).toContain('dynamic dispatch');
    expect(prompt).toContain('overloading vs overriding');
    expect(prompt).toContain('checkpoint');
    expect(prompt).toContain('Shape');
    expect(prompt).toContain('Circle');
    expect(prompt).toContain('dynamic');
    expect(prompt).toContain('uploaded material');
  });

  it('requires hint-first behavior for Socratic tutor requests', () => {
    const context = educationalContext.buildEducationalContext({
      query: 'Why do we use abstraction instead of showing every detail?',
      feature: 'tutor',
    });
    const prompt = prompts.TUTOR_CHAT([], 'Student action: socratic. Question: Why do we use abstraction instead of showing every detail?', {
      groundingTier: 'weak',
      educationalContext: educationalContext.formatEducationalContextForPrompt(context, { maxChars: 6000 }),
    });

    expect(prompt).toContain('Socratic');
    expect(prompt).toContain('guiding question back to the learner');
    expect(prompt).toContain('hint');
    expect(prompt).toContain('interface');
    expect(prompt).toContain('common mistakes');
  });
});
