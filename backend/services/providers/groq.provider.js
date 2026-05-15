'use strict';

const env = require('../../config/env');

const { AiServiceError } = require('./ollama.provider');

const GROQ_BASE = 'https://api.groq.com/openai/v1';
const GROQ_TIMEOUT_MS = 60000;

function requireApiKey() {
  if (!env.GROQ_API_KEY) {
    throw new AiServiceError(
      503,
      'ai_unavailable',
      'GROQ_API_KEY is not set. Add it to your .env file or switch AI_PROVIDER to ollama.',
      { provider: 'groq' }
    );
  }
}

async function groqFetch(pathname, body) {
  requireApiKey();
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), GROQ_TIMEOUT_MS);
  try {
    const res = await fetch(`${GROQ_BASE}${pathname}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.GROQ_API_KEY}`,
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      let message = text;
      try { message = JSON.parse(text).error?.message || text; } catch (_) {}
      if (res.status === 429) {
        throw new AiServiceError(429, 'ai_rate_limited',
          'Groq API rate limit reached. Wait a moment and try again.',
          { provider: 'groq', groq_status: res.status });
      }
      throw new AiServiceError(
        res.status >= 500 ? 503 : res.status,
        res.status >= 500 ? 'ai_unavailable' : 'ai_request_failed',
        message || `Groq request failed with status ${res.status}.`,
        { provider: 'groq', groq_status: res.status }
      );
    }
    return res.json();
  } catch (err) {
    if (err instanceof AiServiceError) throw err;
    if (err && err.name === 'AbortError') {
      throw new AiServiceError(503, 'ai_timeout', 'Groq API did not respond before the timeout.', {
        provider: 'groq',
        timeout_ms: GROQ_TIMEOUT_MS,
      });
    }
    throw new AiServiceError(503, 'ai_unavailable', 'Groq API is not reachable.', {
      provider: 'groq',
      cause: err && err.message ? err.message : String(err),
    });
  } finally {
    clearTimeout(t);
  }
}

async function generate(prompt, opts = {}) {
  const model = opts.model || env.GROQ_MODEL;
  const messages = [{ role: 'user', content: prompt }];
  const body = {
    model,
    messages,
    temperature: opts.temperature ?? 0.4,
    max_tokens: opts.num_predict || 4096,
  };
  if (opts.format === 'json') {
    body.response_format = { type: 'json_object' };
  }
  const out = await groqFetch('/chat/completions', body);
  const choice = out && out.choices && out.choices[0];
  return (choice && choice.message && choice.message.content) || '';
}

async function listModels() {
  requireApiKey();
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 10000);
  try {
    const res = await fetch(`${GROQ_BASE}/models`, {
      headers: { 'Authorization': `Bearer ${env.GROQ_API_KEY}` },
      signal: ctrl.signal,
    });
    if (!res.ok) return [];
    const json = await res.json();
    return Array.isArray(json.data) ? json.data.map(m => m && m.id).filter(Boolean) : [];
  } catch (_) {
    return [];
  } finally {
    clearTimeout(t);
  }
}

async function healthCheck() {
  try {
    requireApiKey();
    const models = await listModels();
    const modelAvailable = models.includes(env.GROQ_MODEL);
    return {
      ok: models.length > 0 && modelAvailable,
      provider: 'groq',
      model: env.GROQ_MODEL,
      embed_model: env.OLLAMA_EMBED_MODEL + ' (local)',
      details: {
        reachable: models.length > 0,
        ready: modelAvailable,
        model: env.GROQ_MODEL,
        available_models: models.length,
        missing: modelAvailable ? [] : [{ role: 'generation', model: env.GROQ_MODEL }],
      },
    };
  } catch (err) {
    return {
      ok: false,
      provider: 'groq',
      model: env.GROQ_MODEL,
      details: {
        reachable: false,
        ready: false,
        error: err && err.code ? err.code : 'ai_unavailable',
        message: err && err.message ? err.message : String(err),
      },
    };
  }
}

async function ping() {
  try {
    requireApiKey();
    const models = await listModels();
    return models.length > 0;
  } catch (_) {
    return false;
  }
}

module.exports = {
  name: 'groq',
  AiServiceError,
  generate,
  listModels,
  healthCheck,
  ping,
};
