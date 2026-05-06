'use strict';

const env = require('../config/env');

class AiServiceError extends Error {
  constructor(status, code, message, details = {}) {
    super(message || code);
    this.name = 'AiServiceError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.model = details.model;
  }
}

function parseOllamaError(text) {
  const raw = String(text || '').trim();
  if (!raw) return '';
  try {
    const parsed = JSON.parse(raw);
    return String(parsed.error || parsed.message || raw);
  } catch (_) {
    return raw;
  }
}

function modelAliases(model) {
  const name = String(model || '').trim();
  const aliases = new Set();
  if (!name) return aliases;
  aliases.add(name);
  if (!name.includes(':')) aliases.add(`${name}:latest`);
  if (name.endsWith(':latest')) aliases.add(name.replace(/:latest$/, ''));
  return aliases;
}

function hasModel(installed, model) {
  const aliases = modelAliases(model);
  return (installed || []).some(name => aliases.has(String(name || '').trim()));
}

function missingModelError(model, role, details = {}) {
  return new AiServiceError(
    503,
    'ai_model_missing',
    `Required local Ollama model "${model}" is not installed. Run "ollama pull ${model}" and try again.`,
    { role, model, ...details }
  );
}

function isMissingModelError(err) {
  return !!(err && err.code === 'ai_model_missing');
}

async function ollamaFetch(pathname, body) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), env.OLLAMA_TIMEOUT_MS);
  try {
    const res = await fetch(`${env.OLLAMA_BASE_URL}${pathname}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      const message = parseOllamaError(text);
      if (res.status === 404 && /model .*not found|not found/i.test(message)) {
        throw missingModelError(body && body.model, pathname === '/api/embeddings' ? 'embedding' : 'generation', {
          endpoint: pathname,
          ollama_status: res.status,
          ollama_error: message,
        });
      }
      throw new AiServiceError(
        res.status >= 500 ? 503 : res.status,
        res.status >= 500 ? 'ai_unavailable' : 'ai_request_failed',
        message || `Ollama request failed with status ${res.status}.`,
        { endpoint: pathname, ollama_status: res.status }
      );
    }
    return res.json();
  } catch (err) {
    if (err instanceof AiServiceError) throw err;
    if (err && err.name === 'AbortError') {
      throw new AiServiceError(503, 'ai_timeout', 'The local Ollama model did not respond before the timeout.', {
        endpoint: pathname,
        timeout_ms: env.OLLAMA_TIMEOUT_MS,
      });
    }
    throw new AiServiceError(503, 'ai_unavailable', 'Ollama is not reachable. Start Ollama and try again.', {
      endpoint: pathname,
      cause: err && err.message ? err.message : String(err),
    });
  } finally {
    clearTimeout(t);
  }
}

async function generate(prompt, opts = {}) {
  const body = {
    model: opts.model || env.OLLAMA_GEN_MODEL,
    prompt,
    stream: false,
    options: {
      temperature: opts.temperature ?? 0.4,
      num_ctx: opts.num_ctx || 4096,
    },
  };
  if (opts.num_predict) body.options.num_predict = opts.num_predict;
  if (opts.format) body.format = opts.format; // 'json' for strict
  const out = await ollamaFetch('/api/generate', body);
  return (out && out.response) || '';
}

async function embed(text) {
  const out = await ollamaFetch('/api/embeddings', {
    model: env.OLLAMA_EMBED_MODEL,
    prompt: String(text || '').slice(0, 8000),
  });
  if (!out || !Array.isArray(out.embedding)) {
    throw new Error('ollama_embed_invalid');
  }
  return out.embedding;
}

async function listModels() {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), Math.min(env.OLLAMA_TIMEOUT_MS, 10000));
  try {
    const res = await fetch(`${env.OLLAMA_BASE_URL}/api/tags`, { signal: ctrl.signal });
    if (!res.ok) {
      throw new AiServiceError(503, 'ai_unavailable', `Ollama tags request failed with status ${res.status}.`, {
        ollama_status: res.status,
      });
    }
    const json = await res.json();
    return Array.isArray(json.models) ? json.models.map(m => m && m.name).filter(Boolean) : [];
  } catch (err) {
    if (err instanceof AiServiceError) throw err;
    if (err && err.name === 'AbortError') {
      throw new AiServiceError(503, 'ai_timeout', 'Ollama model list request timed out.', {
        timeout_ms: Math.min(env.OLLAMA_TIMEOUT_MS, 10000),
      });
    }
    throw new AiServiceError(503, 'ai_unavailable', 'Ollama is not reachable. Start Ollama and try again.', {
      cause: err && err.message ? err.message : String(err),
    });
  } finally {
    clearTimeout(t);
  }
}

async function getModelStatus() {
  try {
    const installed = await listModels();
    const generationAvailable = hasModel(installed, env.OLLAMA_GEN_MODEL);
    const embeddingAvailable = hasModel(installed, env.OLLAMA_EMBED_MODEL);
    const missing = [];
    if (!generationAvailable) missing.push({ role: 'generation', model: env.OLLAMA_GEN_MODEL });
    if (!embeddingAvailable) missing.push({ role: 'embedding', model: env.OLLAMA_EMBED_MODEL });
    return {
      reachable: true,
      ready: generationAvailable && embeddingAvailable,
      base_url: env.OLLAMA_BASE_URL,
      generation: { model: env.OLLAMA_GEN_MODEL, available: generationAvailable },
      embedding: { model: env.OLLAMA_EMBED_MODEL, available: embeddingAvailable },
      installed,
      missing,
    };
  } catch (err) {
    return {
      reachable: false,
      ready: false,
      base_url: env.OLLAMA_BASE_URL,
      generation: { model: env.OLLAMA_GEN_MODEL, available: false },
      embedding: { model: env.OLLAMA_EMBED_MODEL, available: false },
      installed: [],
      missing: [
        { role: 'generation', model: env.OLLAMA_GEN_MODEL },
        { role: 'embedding', model: env.OLLAMA_EMBED_MODEL },
      ],
      error: err && err.code ? err.code : 'ai_unavailable',
      message: err && err.message ? err.message : String(err),
    };
  }
}

async function assertModelsAvailable(opts = {}) {
  const needsGeneration = opts.generation !== false;
  const needsEmbedding = opts.embedding === true;
  const status = await getModelStatus();
  if (!status.reachable) {
    throw new AiServiceError(503, status.error || 'ai_unavailable', status.message || 'Ollama is not reachable.', {
      base_url: env.OLLAMA_BASE_URL,
    });
  }
  if (needsGeneration && !status.generation.available) {
    throw missingModelError(env.OLLAMA_GEN_MODEL, 'generation', { installed: status.installed });
  }
  if (needsEmbedding && !status.embedding.available) {
    throw missingModelError(env.OLLAMA_EMBED_MODEL, 'embedding', { installed: status.installed });
  }
  return status;
}

async function ping() {
  try {
    const res = await fetch(`${env.OLLAMA_BASE_URL}/api/tags`);
    return res.ok;
  } catch (_) {
    return false;
  }
}

module.exports = {
  AiServiceError,
  generate,
  embed,
  listModels,
  getModelStatus,
  assertModelsAvailable,
  hasModel,
  isMissingModelError,
  ping,
};
