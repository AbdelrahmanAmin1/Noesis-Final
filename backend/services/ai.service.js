'use strict';

const env = require('../config/env');
const log = require('../utils/logger');

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
      throw new Error(`ollama_${res.status}: ${text.slice(0, 200)}`);
    }
    return res.json();
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

async function ping() {
  try {
    const res = await fetch(`${env.OLLAMA_BASE_URL}/api/tags`);
    return res.ok;
  } catch (_) {
    return false;
  }
}

module.exports = { generate, embed, ping };
