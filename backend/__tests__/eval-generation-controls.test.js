'use strict';

const generation = require('../scripts/eval-noesis-generation');
const ai = require('../services/ai.service');

const jsonEvalItem = {
  id: 'notes_queue_001',
  domain: 'data-structures',
  topic: 'Queue',
  feature: 'notes',
  taskType: 'deep_notes',
  difficulty: 'beginner',
  prompt: 'Generate notes about queues.',
  expectedMustInclude: [],
  expectedShouldInclude: [],
  mustNotInclude: [],
  expectedOutputType: 'lesson_json',
  rubric: { schemaValidity: 3 },
  source: { type: 'curated', name: 'test', license: 'project-authored' },
  evalFile: 'notes_eval.jsonl',
};

function rateLimitError() {
  const err = new Error('Rate limit reached for model `openai/gpt-oss-120b` on tokens per minute (TPM). Please try again in 0s.');
  err.code = 'ai_model_missing';
  err.status = 404;
  return err;
}

function schemaError(message = 'Failed to generate JSON. Please adjust your prompt.') {
  const err = new Error(message);
  err.code = 'ai_request_failed';
  err.status = 400;
  return err;
}

describe('eval-noesis-generation controls', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const items = [
    { id: 'tutor_1', feature: 'tutor', topic: 'Encapsulation' },
    { id: 'quiz_1', feature: 'quiz', topic: 'Stack' },
    { id: 'video_1', feature: 'video', topic: 'Linked List' },
    { id: 'notes_1', feature: 'notes', topic: 'Polymorphism' },
  ];

  it('parses provider, model, filters, and preflight flags', () => {
    const args = generation.parseArgs([
      '--feature=all',
      '--features=tutor,quiz',
      '--provider=groq',
      '--model=openai/gpt-oss-120b',
      '--ids=tutor_1,quiz_1',
      '--limit=2',
      '--no-preflight',
      '--retries=2',
      '--retry-delay-ms=25',
      '--eval-json-mode=prompt',
      '--ollama-compact-json',
      '--fast-groq',
      '--timeout-ms=5000',
      '--between-items-delay-ms=12000',
      '--batch-size=3',
      '--batch-delay-ms=60000',
    ]);

    expect(args.feature).toBe('all');
    expect(args.features).toBe('tutor,quiz');
    expect(args.provider).toBe('groq');
    expect(args.model).toBe('openai/gpt-oss-120b');
    expect(args.ids).toBe('tutor_1,quiz_1');
    expect(args.limit).toBe(2);
    expect(args.noPreflight).toBe(true);
    expect(args.retries).toBe(2);
    expect(args.retryDelayMs).toBe(25);
    expect(args.evalJsonMode).toBe('prompt');
    expect(args.ollamaCompactJson).toBe(true);
    expect(args.fastGroq).toBe(true);
    expect(args.timeoutMs).toBe(5000);
    expect(args.betweenItemsDelayMs).toBe(12000);
    expect(args.batchSize).toBe(3);
    expect(args.batchDelayMs).toBe(60000);
  });

  it('filters by feature list, ids, and limit', () => {
    const selected = generation.selectEvalItems(items, {
      features: 'tutor,quiz,video',
      ids: 'tutor_1,video_1',
      limit: 1,
    });

    expect(selected.map(item => item.id)).toEqual(['tutor_1']);
  });

  it('supports single feature filtering when features list is absent', () => {
    const selected = generation.selectEvalItems(items, { feature: 'notes' });

    expect(selected).toHaveLength(1);
    expect(selected[0].id).toBe('notes_1');
  });

  it('redacts secrets from preflight payloads', () => {
    const sanitized = generation.sanitizePreflight({
      ok: true,
      details: {
        apiKey: 'secret',
        nested: { authorization: 'Bearer secret', model: 'm' },
      },
    });

    expect(sanitized.details.apiKey).toBe('[redacted]');
    expect(sanitized.details.nested.authorization).toBe('[redacted]');
    expect(sanitized.details.nested.model).toBe('m');
  });

  it('configures eval-only JSON modes and compact Ollama generation options', () => {
    const item = {
      id: 'quiz_1',
      feature: 'quiz',
      expectedOutputType: 'quiz_json',
    };

    expect(generation.generationOptionsForAttempt(item, {
      provider: 'groq',
      evalJsonMode: 'provider',
    }).format).toBe('json');

    expect(generation.generationOptionsForAttempt(item, {
      provider: 'groq',
      evalJsonMode: 'prompt',
    }).format).toBeUndefined();

    const compact = generation.generationOptionsForAttempt(item, {
      provider: 'ollama',
      ollamaCompactJson: true,
      evalJsonMode: 'auto',
    });

    expect(compact.format).toBe('json');
    expect(compact.num_predict).toBeLessThanOrEqual(650);
    expect(compact.num_ctx).toBe(3072);
  });

  it('identifies retryable provider JSON failures and retry-after delays', () => {
    const item = { feature: 'quiz', expectedOutputType: 'quiz_json' };
    const err = {
      code: 'ai_request_failed',
      status: 400,
      message: 'Failed to generate JSON. Please adjust your prompt.',
    };

    expect(generation.shouldRetryWithoutProviderJson(err, item, { evalJsonMode: 'auto' })).toBe(true);
    expect(generation.shouldRetryWithoutProviderJson(err, item, { evalJsonMode: 'provider' })).toBe(false);
    expect(generation.retryAfterMs('Please try again in 14.64s.', 1000)).toBe(14640);
  });

  it('applies safe pacing defaults for live Groq evaluations', () => {
    const pacing = generation.resolvePacingOptions({ provider: 'groq', dryRun: false });

    expect(pacing.betweenItemsDelayMs).toBe(70000);
    expect(pacing.batchSize).toBe(1);
    expect(pacing.batchDelayMs).toBe(70000);
    expect(pacing.enabled).toBe(true);
    expect(pacing.fastGroq).toBe(false);
    expect(pacing.defaultsApplied).toEqual({
      betweenItemsDelayMs: true,
      batchSize: true,
      batchDelayMs: true,
    });
  });

  it('supports fast Groq pacing for intentionally faster live evaluations', () => {
    const pacing = generation.resolvePacingOptions({ provider: 'groq', dryRun: false, fastGroq: true });

    expect(pacing.betweenItemsDelayMs).toBe(10000);
    expect(pacing.batchSize).toBe(4);
    expect(pacing.batchDelayMs).toBe(45000);
    expect(pacing.enabled).toBe(true);
    expect(pacing.fastGroq).toBe(true);
    expect(pacing.defaultsApplied).toEqual({
      betweenItemsDelayMs: true,
      batchSize: true,
      batchDelayMs: true,
    });
  });

  it('does not apply default pacing for dry-run or Ollama evaluations', () => {
    const groqDryRun = generation.resolvePacingOptions({ provider: 'groq', dryRun: true, fastGroq: true });
    const ollamaLive = generation.resolvePacingOptions({ provider: 'ollama', dryRun: false, fastGroq: true });

    expect(groqDryRun.enabled).toBe(false);
    expect(groqDryRun.betweenItemsDelayMs).toBe(0);
    expect(ollamaLive.enabled).toBe(false);
    expect(ollamaLive.batchSize).toBe(0);
  });

  it('respects explicit pacing overrides including zero delays', () => {
    const custom = generation.resolvePacingOptions({
      provider: 'groq',
      dryRun: false,
      fastGroq: true,
      betweenItemsDelayMs: 12000,
      batchSize: 3,
      batchDelayMs: 60000,
    });
    const disabled = generation.resolvePacingOptions({
      provider: 'groq',
      dryRun: false,
      betweenItemsDelayMs: 0,
      batchSize: 0,
      batchDelayMs: 0,
    });

    expect(custom.betweenItemsDelayMs).toBe(12000);
    expect(custom.batchSize).toBe(3);
    expect(custom.batchDelayMs).toBe(60000);
    expect(custom.defaultsApplied).toEqual({
      betweenItemsDelayMs: false,
      batchSize: false,
      batchDelayMs: false,
    });
    expect(disabled.enabled).toBe(false);
    expect(disabled.betweenItemsDelayMs).toBe(0);
    expect(disabled.batchSize).toBe(0);
    expect(disabled.batchDelayMs).toBe(0);
  });

  it('schedules between-item and batch pacing without delaying after the final item', () => {
    const pacing = generation.resolvePacingOptions({
      provider: 'groq',
      dryRun: false,
      betweenItemsDelayMs: 10000,
      batchSize: 3,
      batchDelayMs: 60000,
    });

    expect(generation.shouldApplyPacingDelay({
      completedCount: 1,
      totalCount: 5,
      item: { id: 'item_1' },
    }, pacing)).toMatchObject({ itemId: 'item_1', itemIndex: 1, delayMs: 10000, reason: 'between_items' });

    expect(generation.shouldApplyPacingDelay({
      completedCount: 3,
      totalCount: 5,
      item: { id: 'item_3' },
    }, pacing)).toMatchObject({ itemId: 'item_3', itemIndex: 3, delayMs: 60000, reason: 'batch' });

    expect(generation.shouldApplyPacingDelay({
      completedCount: 5,
      totalCount: 5,
      item: { id: 'item_5' },
    }, pacing)).toBeNull();
  });

  it('does not let rate-limit retries consume the prompt-only JSON fallback', async () => {
    const spy = vi.spyOn(ai, 'generate')
      .mockRejectedValueOnce(rateLimitError())
      .mockRejectedValueOnce(rateLimitError())
      .mockRejectedValueOnce(schemaError('Failed to generate JSON. Please adjust your prompt.'))
      .mockResolvedValueOnce(JSON.stringify({ sections: [{}, {}, {}] }));

    const result = await generation.runItem(jsonEvalItem, {
      provider: 'groq',
      model: 'openai/gpt-oss-120b',
      retries: 2,
      retryDelayMs: 0,
      evalJsonMode: 'auto',
    });

    expect(result.status).toBe('evaluated');
    expect(spy).toHaveBeenCalledTimes(4);
    expect(result.attempts.map(attempt => attempt.jsonMode)).toEqual(['provider', 'provider', 'provider', 'prompt']);
    expect(result.attempts[0].consumedProviderRetryBudget).toBe(true);
    expect(result.attempts[1].consumedProviderRetryBudget).toBe(true);
    expect(result.attempts[2].consumedJsonFallbackBudget).toBe(true);
  });

  it('can retry prompt-only JSON fallback after a TPM failure', async () => {
    const spy = vi.spyOn(ai, 'generate')
      .mockRejectedValueOnce(schemaError('Failed to validate JSON. Please adjust your prompt.'))
      .mockRejectedValueOnce(rateLimitError())
      .mockResolvedValueOnce(JSON.stringify({ sections: [{}, {}, {}] }));

    const result = await generation.runItem(jsonEvalItem, {
      provider: 'groq',
      model: 'openai/gpt-oss-120b',
      retries: 1,
      retryDelayMs: 0,
      evalJsonMode: 'auto',
    });

    expect(result.status).toBe('evaluated');
    expect(spy).toHaveBeenCalledTimes(3);
    expect(result.attempts.map(attempt => attempt.jsonMode)).toEqual(['provider', 'prompt', 'prompt']);
    expect(result.attempts[0].consumedJsonFallbackBudget).toBe(true);
    expect(result.attempts[1].consumedProviderRetryBudget).toBe(true);
  });

  it('refuses prompt fallback in provider-only JSON mode', async () => {
    const spy = vi.spyOn(ai, 'generate')
      .mockRejectedValueOnce(schemaError('JSON validation failed while using provider JSON mode.'));

    const result = await generation.runItem(jsonEvalItem, {
      provider: 'groq',
      model: 'openai/gpt-oss-120b',
      retries: 2,
      retryDelayMs: 0,
      evalJsonMode: 'provider',
    });

    expect(result.status).toBe('error');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(result.failureCategory).toBe('SCHEMA_FAILURE');
    expect(result.excludedFromModelQuality).toBe(true);
    expect(result.attempts[0].jsonMode).toBe('provider');
    expect(result.attempts[0].consumedJsonFallbackBudget).toBe(false);
  });

  it('starts with prompt-only JSON mode when requested', async () => {
    const spy = vi.spyOn(ai, 'generate')
      .mockResolvedValueOnce(JSON.stringify({ sections: [{}, {}, {}] }));

    const result = await generation.runItem(jsonEvalItem, {
      provider: 'groq',
      model: 'openai/gpt-oss-120b',
      retries: 1,
      retryDelayMs: 0,
      evalJsonMode: 'prompt',
    });

    expect(result.status).toBe('evaluated');
    expect(result.attempts[0].jsonMode).toBe('prompt');
    expect(spy.mock.calls[0][1].format).toBeUndefined();
    expect(spy.mock.calls[0][0]).toContain('Return ONLY strict JSON');
  });
});
