'use strict';

const { setupTestEnv, cleanupTestDb } = require('./helpers/setup');

beforeEach(() => {
  setupTestEnv();
});

afterEach(() => {
  cleanupTestDb();
});

describe('tutor step quality', () => {
  it('rejects placeholder tutor steps', () => {
    const tutor = require('../services/tutor.service');
    expect(() => tutor._internals.validateStep({
      title: 'Warm-up',
      content: '...',
      question: 'Trace an example',
      hint: 'Code sketch',
    })).toThrow(/quality|incomplete/i);
  });

  it('builds concrete polymorphism steps', () => {
    const tutor = require('../services/tutor.service');
    const plan = tutor.buildPlan('Polymorphism');
    expect(plan.steps).toHaveLength(5);
    expect(plan.steps[0].content).toMatch(/runtime object/i);
    expect(plan.steps[4].code.content).toMatch(/Shape s = new Circle/);
    expect(JSON.stringify(plan)).not.toContain('...');
  });

  it('builds a source-led non-CS guided plan without CS fallback topics', () => {
    const tutor = require('../services/tutor.service');
    const plan = tutor.buildPlan('Photosynthesis', 0, {
      understanding: {
        keyConcepts: ['Photosynthesis', 'Chloroplasts', 'Glucose', 'Carbon Dioxide', 'Oxygen'],
        representativeExcerpts: [
          'Photosynthesis converts light energy, carbon dioxide, and water into glucose inside chloroplasts.',
          'Chlorophyll captures sunlight, and oxygen is released as a product of the process.',
        ],
        sourceEvidence: [
          { chunkId: 1, quote: 'Photosynthesis converts light energy, carbon dioxide, and water into glucose inside chloroplasts.' },
        ],
      },
    });
    const text = JSON.stringify(plan).toLowerCase();

    expect(plan.steps).toHaveLength(5);
    expect(text).toContain('photosynthesis');
    expect(text).toContain('chloroplast');
    expect(text).toContain('glucose');
    expect(text).toContain('carbon dioxide');
    expect(text).not.toMatch(/search algorithm|stack|queue|object-oriented|data structure|java/);
    expect(plan.steps.every(step => !step.code)).toBe(true);
  });

  it('returns concrete code for encapsulation examples', () => {
    const tutor = require('../services/tutor.service');
    const current = tutor.buildPlan('Encapsulation').steps[0];
    const feedback = tutor._internals.deterministicFeedback({
      action: 'give_example',
      mode: 'example',
      topic: 'Encapsulation',
      current,
      answer: '',
      hasMcq: false,
      correct: true,
    }).feedback;

    expect(feedback).toMatch(/BankAccount/);
    expect(feedback).toMatch(/private double balance/);
    expect(feedback).toMatch(/deposit/);
    expect(feedback).toMatch(/withdraw/);
    expect(tutor._internals.tutorReplyIsUseful(feedback, { action: 'give_example', topic: 'Encapsulation', mode: 'example' })).toBe(true);
  });

  it('returns concrete code for polymorphism examples', () => {
    const tutor = require('../services/tutor.service');
    const current = tutor.buildPlan('Polymorphism').steps[0];
    const feedback = tutor._internals.deterministicFeedback({
      action: 'give_example',
      mode: 'example',
      topic: 'Polymorphism',
      current,
      answer: '',
      hasMcq: false,
      correct: true,
    }).feedback;

    expect(feedback).toMatch(/Shape s = new Circle/);
    expect(feedback).toMatch(/Circle\.draw/);
    expect(feedback).toMatch(/Rectangle\.draw/);
    expect(tutor._internals.tutorReplyIsUseful(feedback, { action: 'give_example', topic: 'Polymorphism', mode: 'example' })).toBe(true);
  });

  it('simplifies confused replies and check-answer feedback evaluates the answer', () => {
    const tutor = require('../services/tutor.service');
    const current = tutor.buildPlan('Encapsulation').steps[0];
    const confused = tutor._internals.deterministicFeedback({
      action: 'im_confused',
      mode: 'explain',
      topic: 'Encapsulation',
      current,
      answer: '',
      hasMcq: false,
      correct: true,
    }).feedback;
    const checked = tutor._internals.deterministicFeedback({
      action: 'check_answer',
      mode: 'socratic',
      topic: 'Encapsulation',
      current,
      answer: 'It hides state behind methods.',
      hasMcq: false,
      correct: true,
    }).feedback;

    expect(confused).toMatch(/Simpler version|Analogy|Mini example/i);
    expect(checked).toMatch(/What is correct|What to sharpen|Better answer/i);
  });

  it('rejects socratic replies without a question mark', () => {
    const tutor = require('../services/tutor.service');
    const noQuestion = 'Encapsulation hides internal state behind methods. The internal fields are private and cannot be accessed directly. This protects the invariants of the class and ensures controlled mutation through public methods only.';
    expect(tutor._internals.tutorReplyIsUseful(noQuestion, { action: 'continue', topic: 'Encapsulation', mode: 'socratic' })).toBe(false);
  });

  it('rejects example mode replies without a code block', () => {
    const tutor = require('../services/tutor.service');
    const noCode = 'Encapsulation means wrapping data and methods together. Think of it like a vending machine where you only interact through the buttons, not by reaching inside. The key idea is controlled access. A common mistake is making fields public. Try thinking about how a bank account restricts direct balance changes.';
    expect(tutor._internals.tutorReplyIsUseful(noCode, { action: 'continue', topic: 'Encapsulation', mode: 'example' })).toBe(false);
  });

  it('accepts example mode scenario replies for non-CS topics', () => {
    const tutor = require('../services/tutor.service');
    const scenario = 'Here is a concrete scenario from the source material: a plant leaf receives sunlight, chlorophyll captures that energy, carbon dioxide enters the leaf, and glucose is produced for the plant. The example shows how the source concepts fit together. A common mistake is saying plants get all their food from soil instead of explaining glucose production.';

    expect(tutor._internals.tutorReplyIsUseful(scenario, { action: 'give_example', topic: 'Photosynthesis', mode: 'example' })).toBe(true);
  });

  it('rejects raw structured JSON as display feedback', () => {
    const tutor = require('../services/tutor.service');
    const rawJson = '{"explanation":"A linked list stores nodes.","question":"What does next point to?","hint":"Look at the arrow.","example":"head -> node","code":{"language":"java","content":"class Node {}"}}';
    expect(tutor._internals.tutorReplyIsUseful(rawJson, { action: 'give_example', topic: 'Linked List', mode: 'example' })).toBe(false);
  });

  it('builds structured response objects for frontend rendering', () => {
    const tutor = require('../services/tutor.service');
    const current = tutor.buildPlan('Linked List').steps[0];
    const feedback = tutor._internals.deterministicFeedback({
      action: 'give_example',
      mode: 'example',
      topic: 'Linked List',
      current,
      answer: '',
      hasMcq: false,
      correct: true,
    }).feedback;
    const response = tutor._internals.structuredResponseFromFeedback(feedback, { action: 'give_example', topic: 'Linked List', current });

    expect(response.type).toBe('example');
    expect(response.explanation).toMatch(/linked-list/i);
    expect(response.code.content).toMatch(/Node|next/);
  });

  it('accepts quality replies with proper mode markers', () => {
    const tutor = require('../services/tutor.service');
    const socraticReply = 'Let me guide you step by step. Encapsulation wraps data inside a class. Think of it like a safe that only opens with the right key. The internal state is protected. But here is the question: what would happen if the balance field were public? Could any code directly set it to a negative number?';
    const exampleReply = 'Here is a concrete example:\n\n```java\nclass BankAccount {\n  private double balance;\n  public void deposit(double amount) {\n    if (amount > 0) balance += amount;\n  }\n}\n```\n\nThe `balance` field is private — no outside code can set it directly. The `deposit` method validates the input before modifying state. A common mistake is making `balance` public.';
    expect(tutor._internals.tutorReplyIsUseful(socraticReply, { action: 'continue', topic: 'Encapsulation', mode: 'socratic' })).toBe(true);
    expect(tutor._internals.tutorReplyIsUseful(exampleReply, { action: 'continue', topic: 'Encapsulation', mode: 'example' })).toBe(true);
  });
});
