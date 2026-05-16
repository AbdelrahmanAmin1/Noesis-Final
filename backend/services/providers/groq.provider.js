'use strict';

const env = require('../../config/env');

const { AiServiceError } = require('./ollama.provider');

const GROQ_TIMEOUT_MS = 60000;

function baseUrl() {
  return String(env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1').replace(/\/+$/, '');
}

function requireApiKey() {
  if (!env.GROQ_API_KEY) {
    throw new AiServiceError(
      503,
      'ai_unavailable',
      'GROQ_API_KEY is not set. Video script Groq fallback is unavailable.',
      { provider: 'groq' }
    );
  }
}

function parseGroqError(text) {
  const raw = String(text || '').trim();
  if (!raw) return '';
  try {
    const parsed = JSON.parse(raw);
    return String((parsed.error && parsed.error.message) || parsed.message || raw);
  } catch (_) {
    return raw;
  }
}

async function groqFetch(pathname, body, opts = {}) {
  requireApiKey();
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), opts.timeoutMs || GROQ_TIMEOUT_MS);
  const method = opts.method || 'POST';
  try {
    const res = await fetch(`${baseUrl()}${pathname}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.GROQ_API_KEY}`,
      },
      body: method === 'GET' ? undefined : JSON.stringify(body || {}),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      const message = parseGroqError(text);
      if (res.status === 401 || res.status === 403) {
        throw new AiServiceError(res.status, 'ai_auth_failed', 'Groq authentication failed. Check GROQ_API_KEY.', {
          provider: 'groq',
          groq_status: res.status,
        });
      }
      if (res.status === 404 || /model|not found|invalid/i.test(message)) {
        throw new AiServiceError(404, 'ai_model_missing', message || 'Groq model was not found or is not available.', {
          provider: 'groq',
          groq_status: res.status,
          model: body && body.model,
        });
      }
      if (res.status === 429) {
        throw new AiServiceError(429, 'ai_rate_limited', 'Groq API rate limit reached. Wait a moment and try again.', {
          provider: 'groq',
          groq_status: res.status,
        });
      }
      if (res.status === 413 || /token|context|too large|maximum/i.test(message)) {
        throw new AiServiceError(413, 'ai_context_too_large', message || 'Groq request exceeded the model context limit.', {
          provider: 'groq',
          groq_status: res.status,
          model: body && body.model,
        });
      }
      throw new AiServiceError(
        res.status >= 500 ? 503 : res.status,
        res.status >= 500 ? 'ai_unavailable' : 'ai_request_failed',
        message || `Groq request failed with status ${res.status}.`,
        { provider: 'groq', groq_status: res.status, model: body && body.model }
      );
    }
    return res.json();
  } catch (err) {
    if (err instanceof AiServiceError) throw err;
    if (err && err.name === 'AbortError') {
      throw new AiServiceError(503, 'ai_timeout', 'Groq API did not respond before the timeout.', {
        provider: 'groq',
        timeout_ms: opts.timeoutMs || GROQ_TIMEOUT_MS,
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

async function chatCompletion(prompt, opts = {}, useResponseFormat = true) {
  const model = opts.model || env.GROQ_MODEL;
  if (!model) {
    throw new AiServiceError(503, 'ai_model_missing', 'GROQ_MODEL is not set.', {
      provider: 'groq',
    });
  }
  const messages = [
    {
      role: 'system',
      content: 'You are Noesis, an AI tutor that generates grounded educational video lesson JSON. Output only valid JSON.',
    },
    {
      role: 'user',
      content: prompt,
    },
  ];
  const body = {
    model,
    messages,
    temperature: opts.temperature ?? 0.4,
    max_tokens: opts.max_tokens || opts.num_predict || env.GROQ_VIDEO_MAX_OUTPUT_TOKENS || 1000,
  };
  if (opts.format === 'json' && useResponseFormat) {
    body.response_format = { type: 'json_object' };
  }
  const out = await groqFetch('/chat/completions', body);
  const choice = out && out.choices && out.choices[0];
  return (choice && choice.message && choice.message.content) || '';
}

async function generate(prompt, opts = {}) {
  if (opts.format !== 'json') return chatCompletion(prompt, opts, false);
  try {
    return await chatCompletion(prompt, opts, true);
  } catch (err) {
    const message = String(err && err.message || '');
    if (err && err.code === 'ai_request_failed' && /response_format|json_object|json mode|schema/i.test(message)) {
      const strictPrompt = `Return ONLY strict JSON. Do not include markdown or commentary.\n\n${prompt}`;
      return chatCompletion(strictPrompt, opts, false);
    }
    throw err;
  }
}

async function listModels() {
  try {
    const json = await groqFetch('/models', null, { method: 'GET', timeoutMs: 10000 });
    return Array.isArray(json.data) ? json.data.map(m => m && m.id).filter(Boolean) : [];
  } catch (_) {
    return [];
  }
}

async function healthCheck() {
  try {
    requireApiKey();
    const json = await groqFetch('/models', null, { method: 'GET', timeoutMs: 10000 });
    const models = Array.isArray(json.data) ? json.data.map(m => m && m.id).filter(Boolean) : [];
    const modelAvailable = !models.length || models.includes(env.GROQ_MODEL);
    return {
      ok: modelAvailable,
      provider: 'groq',
      model: env.GROQ_MODEL,
      embed_model: `${env.OLLAMA_EMBED_MODEL} (local)`,
      details: {
        reachable: true,
        ready: modelAvailable,
        base_url: baseUrl(),
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
        base_url: baseUrl(),
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
    return Array.isArray(models);
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
