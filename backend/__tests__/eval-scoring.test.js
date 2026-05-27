'use strict';

const path = require('path');
const scoring = require('../utils/eval-scoring');

const baseItem = {
  id: 'eval_test_001',
  domain: 'oop',
  topic: 'Encapsulation',
  feature: 'tutor',
  taskType: 'give_example',
  difficulty: 'beginner',
  prompt: 'Explain encapsulation with a Java example.',
  expectedMustInclude: ['private field', 'public method', 'validation'],
  expectedShouldInclude: ['BankAccount', 'common mistake'],
  mustNotInclude: ['Code sketch'],
  expectedOutputType: 'markdown',
  rubric: {
    correctness: 3,
    depth: 3,
    clarity: 3,
    noPlaceholders: 3,
  },
  source: {
    type: 'curated',
    name: 'Noesis authored eval',
    license: 'project-authored',
  },
};

describe('eval-scoring utilities', () => {
  it('parses valid JSONL records', () => {
    const text = `${JSON.stringify(baseItem)}\n`;
    const records = scoring.parseJsonlText(text, { filePath: 'inline.jsonl' });

    expect(records).toHaveLength(1);
    expect(records[0].id).toBe(baseItem.id);
  });

  it('rejects malformed JSONL with line details', () => {
    expect(() => scoring.parseJsonlText('{"id":', { filePath: 'bad.jsonl' }))
      .toThrow(/bad\.jsonl:1/);
  });

  it('rejects records missing required schema fields', () => {
    const invalid = { ...baseItem };
    delete invalid.prompt;
    expect(() => scoring.validateEvalItem(invalid, { filePath: 'eval.jsonl', line: 3 }))
      .toThrow(/failed eval item schema/);
  });

  it('scores must-include, should-include, and banned phrase checks', () => {
    const output = [
      'Encapsulation keeps a private field safe and exposes a public method.',
      'A BankAccount uses validation before changing balance.',
      'A common mistake is making the field public.',
      'Check yourself: why should balance stay private?',
    ].join('\n');

    const result = scoring.scoreOutput(baseItem, output);

    expect(result.pass).toBe(true);
    expect(result.checks.mustInclude.missing).toEqual([]);
    expect(result.checks.shouldInclude.found).toContain('BankAccount');
    expect(result.dimensions.noPlaceholders).toBe(3);
  });

  it('detects banned placeholder and internal phrases', () => {
    const output = 'Code sketch: private field and public method with validation. [chunk:12]';
    const result = scoring.scoreOutput(baseItem, output);

    expect(result.pass).toBe(false);
    expect(result.checks.banned.hits).toContain('Code sketch');
    expect(result.dimensions.noPlaceholders).toBe(0);
  });

  it('checks quiz JSON validity and option quality', () => {
    const quizItem = {
      ...baseItem,
      id: 'quiz_eval_001',
      feature: 'quiz',
      expectedOutputType: 'quiz_json',
      expectedMustInclude: ['private', 'validation'],
      expectedShouldInclude: ['BankAccount'],
      rubric: { correctness: 3, schemaValidity: 3, noPlaceholders: 3 },
    };
    const output = JSON.stringify({
      questions: [{
        question: 'Why should balance be private?',
        options: ['Validation', 'Validation', 'Inheritance', 'Filename'],
        correct_idx: 0,
        explanation: 'Validation protects account state.',
        topic: 'Encapsulation',
      }],
    });

    const result = scoring.scoreOutput(quizItem, output);

    expect(result.pass).toBe(false);
    expect(result.checks.json.valid).toBe(true);
    expect(result.checks.feature.some(check => check.name === 'quiz_options_valid' && !check.passed)).toBe(true);
  });

  it('filters loaded eval items by feature', () => {
    const evalDir = path.resolve(__dirname, '..', '..', 'training', 'eval');
    const quizItems = scoring.loadEvalDataset(evalDir, { feature: 'quiz' });

    expect(quizItems.length).toBeGreaterThan(0);
    expect(quizItems.every(item => item.feature === 'quiz')).toBe(true);
  });

  it('builds JSON and markdown reports', () => {
    const output = 'Encapsulation uses a private field, public method, validation, BankAccount, and a common mistake.';
    const result = {
      item: baseItem,
      status: 'evaluated',
      responseTimeMs: 42,
      scoring: scoring.scoreOutput(baseItem, output),
    };
    const report = scoring.buildReport({
      provider: 'ollama',
      model: 'test-model',
      feature: 'tutor',
      dryRun: false,
      results: [result],
      startedAt: '2026-05-24T00:00:00.000Z',
      endedAt: '2026-05-24T00:00:01.000Z',
    });
    const markdown = scoring.renderMarkdownReport(report);

    expect(report.summary.itemCount).toBe(1);
    expect(report.summary.averageScore).toBeGreaterThanOrEqual(2);
    expect(markdown).toContain('Noesis Evaluation Summary');
    expect(markdown).toContain('Fine-Tuning Readiness');
    expect(markdown).not.toContain('Groq on-demand tiers may require 60–90 seconds between eval items.');
  });

  it('adds a Groq pacing warning to markdown reports', () => {
    const report = scoring.buildReport({
      provider: 'groq',
      model: 'test-model',
      feature: 'all',
      dryRun: false,
      results: [],
    });
    const markdown = scoring.renderMarkdownReport(report);

    expect(markdown).toContain('Groq on-demand tiers may require 60–90 seconds between eval items.');
  });

  it('summarizes per-feature, per-topic, errors, and future training candidates', () => {
    const failedItem = {
      ...baseItem,
      id: 'eval_failed_001',
      topic: 'Polymorphism',
      expectedMustInclude: ['dynamic dispatch'],
      expectedShouldInclude: ['Shape'],
    };
    const results = [
      {
        item: baseItem,
        status: 'evaluated',
        responseTimeMs: 30,
        scoring: scoring.scoreOutput(baseItem, 'Encapsulation uses a private field, public method, validation, BankAccount, common mistake, and check yourself.'),
      },
      {
        item: failedItem,
        status: 'evaluated',
        responseTimeMs: 30,
        scoring: scoring.scoreOutput(failedItem, 'Code sketch: Polymorphism is useful.'),
      },
      {
        item: { ...baseItem, id: 'eval_error_001', feature: 'quiz' },
        status: 'error',
        responseTimeMs: 10,
        scoring: scoring.scoreOutput({ ...baseItem, id: 'eval_error_001', feature: 'quiz', expectedOutputType: 'quiz_json' }, ''),
      },
    ];

    const report = scoring.buildReport({ provider: 'ollama', model: 'm', feature: 'all', results });

    expect(report.summary.byFeature.tutor.evaluatedCount).toBe(2);
    expect(report.summary.byFeature.quiz.errorRate).toBe(1);
    expect(report.summary.byTopic.Polymorphism.failedItemIds).toContain('eval_failed_001');
    expect(report.summary.failedItemIds).toEqual(expect.arrayContaining(['eval_failed_001', 'eval_error_001']));
    expect(report.summary.fineTuningCandidates.some(item => item.id === 'eval_failed_001')).toBe(true);
  });

  it('classifies provider/runtime errors without treating them as model quality failures', () => {
    const rateLimit = scoring.normalizeEvalError({
      code: 'ai_model_missing',
      status: 404,
      message: 'Rate limit reached for model `openai/gpt-oss-120b` on tokens per minute (TPM). Please try again in 14.64s.',
    });
    const jsonFailure = scoring.normalizeEvalError({
      code: 'ai_request_failed',
      status: 400,
      message: 'Failed to generate JSON. Please adjust your prompt.',
    });
    const jsonValidateFailure = scoring.normalizeEvalError({
      code: 'ai_request_failed',
      status: 400,
      message: 'Failed to validate JSON. Please adjust your prompt.',
    });
    const jsonValidationFailed = scoring.normalizeEvalError({
      code: 'ai_request_failed',
      status: 400,
      message: 'JSON validation failed while using provider JSON mode.',
    });
    const responseFormatError = scoring.normalizeEvalError({
      code: 'ai_request_failed',
      status: 400,
      message: 'response_format error: schema could not be satisfied.',
    });
    const timeout = scoring.normalizeEvalError({
      code: 'ai_timeout',
      status: 503,
      message: 'The local Ollama model did not respond before the timeout.',
    });

    expect(rateLimit.failureCategory).toBe('TOKEN_LIMIT_FAILURE');
    expect(rateLimit.excludedFromModelQuality).toBe(true);
    expect(rateLimit.retryable).toBe(true);
    expect(jsonFailure.failureCategory).toBe('SCHEMA_FAILURE');
    expect(jsonFailure.retryable).toBe(true);
    expect(jsonFailure.excludedFromModelQuality).toBe(true);
    expect(jsonValidateFailure.failureCategory).toBe('SCHEMA_FAILURE');
    expect(jsonValidateFailure.retryable).toBe(true);
    expect(jsonValidationFailed.failureCategory).toBe('SCHEMA_FAILURE');
    expect(jsonValidationFailed.retryable).toBe(true);
    expect(responseFormatError.failureCategory).toBe('SCHEMA_FAILURE');
    expect(responseFormatError.retryable).toBe(true);
    expect(timeout.failureCategory).toBe('TIMEOUT');
    expect(timeout.excludedFromModelQuality).toBe(true);
  });

  it('matches Big-O paraphrases through calibrated synonym scoring', () => {
    const item = {
      ...baseItem,
      id: 'big_o_synonym_001',
      domain: 'big-o',
      topic: 'Big-O Notation',
      expectedMustInclude: ['growth rate', 'not exact seconds'],
      expectedShouldInclude: ['runtime seconds misconception'],
    };
    const output = [
      'Big-O describes how the amount of work grows as the input size becomes larger.',
      'It does not tell you how many seconds the code will take on one machine.',
      'A common misconception is treating Big-O like wall-clock time.',
    ].join(' ');

    const result = scoring.scoreOutput(item, output);

    expect(result.checks.mustInclude.missing).toEqual([]);
    expect(result.checks.mustInclude.notes.some(note => note.matchType.startsWith('semantic'))).toBe(true);
    expect(result.checks.shouldInclude.missing).toEqual([]);
  });

  it('treats constructor as a literal rubric term, not an inherited synonym key', () => {
    const evalDir = path.resolve(__dirname, '..', '..', 'training', 'eval');
    const item = scoring.loadEvalDataset(evalDir, { feature: 'all' })
      .find(record => record.id === 'notes_class_object_001');

    expect(item).toBeTruthy();
    expect(() => scoring.scoreOutput(item, 'class object blueprint instance constructor field method diagram mini quiz')).not.toThrow();

    const result = scoring.scoreOutput(item, 'class object blueprint instance constructor field method diagram mini quiz');
    expect(result.checks.shouldInclude.found).toContain('constructor');
  });

  it('normalizes supported synonym shapes safely', () => {
    const { normalizeSynonymValue, termVariants } = scoring._internals;

    expect(normalizeSynonymValue(['growth rate', '', null], 'growth rate')).toEqual(['growth rate']);
    expect(normalizeSynonymValue({ 'growth rate': ['scales with n', 'rate of growth'] }, 'growth rate')).toEqual(['scales with n', 'rate of growth']);
    expect(normalizeSynonymValue('growth rate', 'anything')).toEqual(['growth rate']);
    expect(normalizeSynonymValue(null, 'growth rate')).toEqual([]);
    expect(normalizeSynonymValue(undefined, 'growth rate')).toEqual([]);
    expect(normalizeSynonymValue({}, 'constructor')).toEqual([]);
    expect(termVariants('constructor')).toEqual(['constructor']);
  });

  it('can score every committed eval item without throwing', () => {
    const evalDir = path.resolve(__dirname, '..', '..', 'training', 'eval');
    const items = scoring.loadEvalDataset(evalDir, { feature: 'all' });
    const dummyOutput = [
      'class object blueprint instance constructor field method diagram mini quiz',
      'node data next head null LIFO push pop peek underflow top pointer',
      'root left subtree right subtree search path inorder traversal complexity',
      'growth rate not exact seconds O(1) O(log n) O(n) O(n^2) explanation',
    ].join(' ');

    expect(items.length).toBeGreaterThan(0);
    expect(() => {
      for (const item of items) scoring.scoreOutput(item, dummyOutput);
    }).not.toThrow();
  });

  it('excludes provider failures from fine-tuning candidates and content averages', () => {
    const providerErrorItem = { ...baseItem, id: 'provider_error_001', feature: 'quiz', expectedOutputType: 'quiz_json' };
    const schemaErrorItem = { ...baseItem, id: 'schema_error_001', feature: 'quiz', expectedOutputType: 'quiz_json' };
    const contentFailureItem = { ...baseItem, id: 'content_failure_001', expectedMustInclude: ['dynamic dispatch'] };
    const results = [
      {
        item: providerErrorItem,
        status: 'error',
        failureCategory: 'TOKEN_LIMIT_FAILURE',
        excludedFromModelQuality: true,
        responseTimeMs: 15,
        error: { code: 'ai_model_missing', message: 'Rate limit reached for model x on TPM', status: 404 },
        scoring: scoring.scoreOutput(providerErrorItem, ''),
      },
      {
        item: schemaErrorItem,
        status: 'error',
        failureCategory: 'SCHEMA_FAILURE',
        excludedFromModelQuality: true,
        responseTimeMs: 15,
        error: { code: 'ai_request_failed', message: 'Failed to validate JSON. Please adjust your prompt.', status: 400 },
        scoring: scoring.scoreOutput(schemaErrorItem, ''),
      },
      {
        item: contentFailureItem,
        status: 'evaluated',
        responseTimeMs: 20,
        scoring: scoring.scoreOutput(contentFailureItem, 'Polymorphism is useful, but this answer is shallow.'),
      },
    ];

    const report = scoring.buildReport({ provider: 'groq', model: 'm', feature: 'all', results });

    expect(report.summary.failureBreakdown.TOKEN_LIMIT_FAILURE).toBe(1);
    expect(report.summary.failureBreakdown.SCHEMA_FAILURE).toBe(1);
    expect(report.summary.contentEvaluatedCount).toBe(1);
    expect(report.summary.fineTuningCandidates.map(item => item.id)).toEqual(['content_failure_001']);
    expect(report.summary.modelCapabilityCandidateIds).toEqual(['content_failure_001']);
    expect(report.fineTuningReadiness.likelyIssues).toContain('token_limit_failure');
  });
});
