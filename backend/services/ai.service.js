'use strict';

const env = require('../config/env');
const ollamaProvider = require('./providers/ollama.provider');
const groqProvider = require('./providers/groq.provider');

const { AiServiceError } = ollamaProvider;

const providers = { ollama: ollamaProvider, groq: groqProvider };

function getProvider(name) {
  const p = providers[name];
  if (!p) {
    throw new AiServiceError(500, 'ai_config_error',
      `Unknown AI_PROVIDER "${name}". Supported: ollama, groq.`,
      { configured: name });
  }
  return p;
}

function getProviderFor(feature) {
  if (feature === 'video_script') return env.VIDEO_SCRIPT_PROVIDER || 'ollama';
  if (feature === 'notes') return env.NOTES_PROVIDER || env.AI_PROVIDER;
  return env.AI_PROVIDER;
}

function getGenerationProvider(opts = {}) {
  const name = opts.provider || getProviderFor(opts.feature);
  return getProvider(name);
}

async function generate(prompt, opts = {}) {
  return getGenerationProvider(opts).generate(prompt, opts);
}

async function generateJSON(prompt, opts = {}) {
  return generate(prompt, { ...opts, format: 'json' });
}

async function embed(text) {
  return ollamaProvider.embed(text);
}

async function listModels(provider) {
  const p = provider ? getProvider(provider) : getGenerationProvider();
  if (!p.listModels) return [];
  return p.listModels();
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
    defaultProvider: env.AI_PROVIDER,
    generation: genHealth,
    embedding: {
      ok: ollamaHealth.ok !== false,
      provider: 'ollama',
      model: env.OLLAMA_EMBED_MODEL,
    },
    embeddings: {
      ok: ollamaHealth.ok !== false,
      provider: 'ollama',
      model: env.OLLAMA_EMBED_MODEL,
    },
    notes: {
      provider: env.NOTES_PROVIDER,
      groqConfigured: !!env.GROQ_API_KEY,
      maxOutputTokens: env.NOTES_PROVIDER === 'groq' ? env.GROQ_NOTES_MAX_OUTPUT_TOKENS : undefined,
    },
    videoScript: {
      provider: env.VIDEO_SCRIPT_PROVIDER,
      groqFallbackOnWeak: env.VIDEO_SCRIPT_GROQ_FALLBACK_ON_WEAK,
      minQualityScore: env.VIDEO_SCRIPT_MIN_QUALITY_SCORE,
      groqConfigured: !!env.GROQ_API_KEY,
      groqModel: env.GROQ_MODEL,
      privacyMode: env.VIDEO_SCRIPT_PROVIDER === 'groq'
        ? 'direct-groq-for-video-scripts-only'
        : (env.VIDEO_SCRIPT_GROQ_FALLBACK_ON_WEAK && env.GROQ_API_KEY
          ? 'local-first-with-optional-groq-fallback'
          : 'fully-local'),
      useLocalIfGroqFails: env.VIDEO_SCRIPT_USE_LOCAL_IF_GROQ_FAILS,
    },
  };
}

module.exports = {
  AiServiceError,
  generate,
  generateJSON,
  embed,
  listModels,
  getProviderFor,
  getModelStatus,
  assertModelsAvailable,
  hasModel,
  isMissingModelError,
  ping,
  healthCheck,
};
