'use strict';

const env = require('../config/env');
const groq = require('../services/providers/groq.provider');
const ollama = require('../services/providers/ollama.provider');

describe('AI provider error classification and deadlines', () => {
  const originalKey = env.GROQ_API_KEY;
  const originalModel = env.GROQ_MODEL;

  beforeEach(() => {
    env.GROQ_API_KEY = 'test-key';
    env.GROQ_MODEL = 'test-model';
  });

  afterEach(() => {
    env.GROQ_API_KEY = originalKey;
    env.GROQ_MODEL = originalModel;
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('does not classify a generic invalid Groq request as a missing model', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => JSON.stringify({ error: { message: 'Invalid request body: temperature is out of range.' } }),
    }));

    await expect(groq.generate('prompt', { format: 'json' })).rejects.toMatchObject({
      code: 'ai_request_failed',
      status: 400,
    });
  });

  it('retries without response_format when Groq JSON mode is rejected', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => JSON.stringify({ error: { message: 'response_format json_object is not supported.' } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { content: '{"questions":[]}' } }] }),
      });
    vi.stubGlobal('fetch', fetchMock);

    await expect(groq.generate('prompt', { format: 'json', timeoutMs: 1234 })).resolves.toBe('{"questions":[]}');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toHaveProperty('response_format');
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).not.toHaveProperty('response_format');
  });

  it('still identifies an explicitly decommissioned Groq model', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => JSON.stringify({ error: { message: 'The model test-model has been decommissioned.' } }),
    }));

    await expect(groq.generate('prompt')).rejects.toMatchObject({ code: 'ai_model_missing' });
  });

  it('honors a per-request Ollama timeout', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((_url, opts) => new Promise((_resolve, reject) => {
      opts.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    }))); 

    const generation = ollama.generate('prompt', { timeoutMs: 25 });
    const assertion = expect(generation).rejects.toMatchObject({ code: 'ai_timeout', details: { timeout_ms: 25 } });
    await vi.advanceTimersByTimeAsync(25);
    await assertion;
  });
});
