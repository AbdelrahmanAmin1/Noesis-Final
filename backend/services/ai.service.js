'use strict';

const env = require('../config/env');
const ollamaProvider = require('./providers/ollama.provider');
const groqProvider = require('./providers/groq.provider');

const { AiServiceError } = ollamaProvider;

const providers = { ollama: ollamaProvider, groq: groqProvider };

function getGenerationProvider() {
  const name = env.AI_PROVIDER;
  const p = providers[name];
  if (!p) {
    throw new AiServiceError(500, 'ai_config_error',
      `Unknown AI_PROVIDER "${name}". Supported: ollama, groq.`,
      { configured: name });
  }
  return p;
}

async function generate(prompt, opts = {}) {
  return getGenerationProvider().generate(prompt, opts);
}

async function embed(text) {
  return ollamaProvider.embed(text);
}

async function listModels() {
  return getGenerationProvider().listModels();
}

async function getModelStatus() {
  const gen = getGenerationProvider();
  if (gen.getModelStatus) return gen.getModelStatus();
  const hc = await gen.healthCheck();
  return hc.details || { reachable: hc.ok, ready: hc.ok };
}

async function assertModelsAvailable(opts = {}) {
  const needsGeneration = opts.generation !== false;
  const needsEmbedding = opts.embedding === true;

  if (needsGeneration) {
    const gen = getGenerationProvider();
    const hc = await gen.healthCheck();
    if (!hc.ok) {
      const d = hc.details || {};
      throw new AiServiceError(503, d.error || 'ai_unavailable',
        d.message || `AI provider "${gen.name}" is not ready.`,
        { provider: gen.name });
    }
  }

  if (needsEmbedding) {
    const ollamaStatus = await ollamaProvider.getModelStatus();
    if (!ollamaStatus.embedding.available) {
      throw ollamaProvider.missingModelError(env.OLLAMA_EMBED_MODEL, 'embedding', {
        installed: ollamaStatus.installed,
      });
    }
  }
}

function hasModel(installed, model) {
  return ollamaProvider.hasModel(installed, model);
}

function isMissingModelError(err) {
  return !!(err && err.code === 'ai_model_missing');
}

async function ping() {
  return getGenerationProvider().ping();
}

async function healthCheck() {
  const gen = getGenerationProvider();
  const genHealth = await gen.healthCheck();

  const ollamaHealth = env.AI_PROVIDER !== 'ollama'
    ? await ollamaProvider.healthCheck()
    : genHealth;

  return {
    provider: env.AI_PROVIDER,
    generation: genHealth,
    embedding: {
      ok: ollamaHealth.ok !== false,
      provider: 'ollama',
      model: env.OLLAMA_EMBED_MODEL,
    },
  };
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
  healthCheck,
};
