#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

function parseArgs(argv) {
  const args = {};
  for (const arg of argv) {
    if (arg === '--all') args.feature = 'all';
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--no-preflight') args.noPreflight = true;
    else if (arg.startsWith('--feature=')) args.feature = arg.split('=').slice(1).join('=');
    else if (arg.startsWith('--features=')) args.features = arg.split('=').slice(1).join('=');
    else if (arg.startsWith('--provider=')) args.provider = arg.split('=').slice(1).join('=');
    else if (arg.startsWith('--model=')) args.model = arg.split('=').slice(1).join('=');
    else if (arg.startsWith('--eval-dir=')) args.evalDir = arg.split('=').slice(1).join('=');
    else if (arg.startsWith('--limit=')) args.limit = parseInt(arg.split('=').slice(1).join('='), 10);
    else if (arg.startsWith('--ids=')) args.ids = arg.split('=').slice(1).join('=');
    else if (arg.startsWith('--retries=')) args.retries = parseInt(arg.split('=').slice(1).join('='), 10);
    else if (arg.startsWith('--retry-delay-ms=')) args.retryDelayMs = parseInt(arg.split('=').slice(1).join('='), 10);
    else if (arg.startsWith('--eval-json-mode=')) args.evalJsonMode = arg.split('=').slice(1).join('=');
    else if (arg === '--ollama-compact-json') args.ollamaCompactJson = true;
    else if (arg === '--fast-groq') args.fastGroq = true;
    else if (arg.startsWith('--timeout-ms=')) args.timeoutMs = parseInt(arg.split('=').slice(1).join('='), 10);
    else if (arg.startsWith('--between-items-delay-ms=')) args.betweenItemsDelayMs = parseInt(arg.split('=').slice(1).join('='), 10);
    else if (arg.startsWith('--batch-size=')) args.batchSize = parseInt(arg.split('=').slice(1).join('='), 10);
    else if (arg.startsWith('--batch-delay-ms=')) args.batchDelayMs = parseInt(arg.split('=').slice(1).join('='), 10);
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
if (args.provider) process.env.AI_PROVIDER = args.provider;
if (args.model && args.provider === 'groq') process.env.GROQ_MODEL = args.model;
if (args.model && (!args.provider || args.provider === 'ollama')) process.env.OLLAMA_GEN_MODEL = args.model;

const env = require('../config/env');
const ai = require('../services/ai.service');
const prompts = require('../utils/prompts');
const educationalContext = require('../services/educational-context.service');
const scoring = require('../utils/eval-scoring');

const repoRoot = path.resolve(__dirname, '..', '..');
const evalDir = path.resolve(args.evalDir || path.join(repoRoot, 'training', 'eval'));
const reportDir = path.join(repoRoot, 'training', 'reports');

function csvSet(value) {
  return new Set(String(value || '')
    .split(',')
    .map(part => part.trim())
    .filter(Boolean));
}

function selectEvalItems(items, options = {}) {
  let selected = items.slice();
  const features = csvSet(options.features || (options.feature && options.feature !== 'all' ? options.feature : ''));
  const ids = csvSet(options.ids);
  if (features.size) selected = selected.filter(item => features.has(item.feature));
  if (ids.size) selected = selected.filter(item => ids.has(item.id));
  if (Number.isInteger(options.limit) && options.limit > 0) selected = selected.slice(0, options.limit);
  return selected;
}

function fileSafe(value) {
  return String(value || 'unknown').replace(/[^a-z0-9_.-]+/gi, '-').replace(/^-+|-+$/g, '');
}

function difficultyForPractice(value) {
  const raw = String(value || '').toLowerCase();
  if (['easy', 'medium', 'hard'].includes(raw)) return raw;
  if (raw === 'beginner') return 'easy';
  if (raw === 'advanced') return 'hard';
  return 'medium';
}

function featureForProvider(feature) {
  if (feature === 'tutor') return 'tutor';
  if (feature === 'notes') return 'notes';
  if (feature === 'video') return 'video_script';
  return undefined;
}

function expectedJson(item) {
  return /json/i.test(String(item && item.expectedOutputType || ''));
}

function evalJsonMode(value) {
  const mode = String(value || 'auto').toLowerCase();
  return ['provider', 'prompt', 'auto'].includes(mode) ? mode : 'auto';
}

function sleep(ms) {
  const delay = Math.max(0, Number(ms) || 0);
  return delay ? new Promise(resolve => setTimeout(resolve, delay)) : Promise.resolve();
}

function retryAfterMs(message, fallbackMs = 1000) {
  const text = String(message || '');
  const seconds = text.match(/try again in\s+([0-9.]+)s/i) || text.match(/retry(?:-after)?\s*:?\s*([0-9.]+)s?/i);
  if (seconds) return Math.ceil(Number(seconds[1]) * 1000);
  return fallbackMs;
}

function nonNegativeInt(value, fallback) {
  return Number.isInteger(value) && value >= 0 ? value : fallback;
}

function resolvePacingOptions(options = {}) {
  const provider = String(options.provider || '').toLowerCase();
  if (options.dryRun) {
    return {
      provider,
      dryRun: true,
      fastGroq: !!options.fastGroq && provider === 'groq',
      betweenItemsDelayMs: 0,
      batchSize: 0,
      batchDelayMs: 0,
      enabled: false,
      defaultsApplied: {
        betweenItemsDelayMs: false,
        batchSize: false,
        batchDelayMs: false,
      },
    };
  }
  const useGroqDefaults = provider === 'groq' && !options.dryRun;
  const useFastGroqDefaults = useGroqDefaults && !!options.fastGroq;
  const defaultBetweenItemsDelayMs = useGroqDefaults ? useFastGroqDefaults ? 10000 : 70000 : 0;
  const defaultBatchSize = useGroqDefaults ? useFastGroqDefaults ? 4 : 1 : 0;
  const defaultBatchDelayMs = useGroqDefaults ? useFastGroqDefaults ? 45000 : 70000 : 0;
  const betweenItemsDelayMs = nonNegativeInt(options.betweenItemsDelayMs, defaultBetweenItemsDelayMs);
  const batchSize = nonNegativeInt(options.batchSize, defaultBatchSize);
  const batchDelayMs = nonNegativeInt(options.batchDelayMs, defaultBatchDelayMs);
  return {
    provider,
    dryRun: !!options.dryRun,
    fastGroq: useFastGroqDefaults,
    betweenItemsDelayMs,
    batchSize,
    batchDelayMs,
    enabled: betweenItemsDelayMs > 0 || (batchSize > 0 && batchDelayMs > 0),
    defaultsApplied: {
      betweenItemsDelayMs: !Number.isInteger(options.betweenItemsDelayMs) && defaultBetweenItemsDelayMs > 0,
      batchSize: !Number.isInteger(options.batchSize) && defaultBatchSize > 0,
      batchDelayMs: !Number.isInteger(options.batchDelayMs) && defaultBatchDelayMs > 0,
    },
  };
}

function shouldApplyPacingDelay({ completedCount, totalCount, item } = {}, pacing = {}) {
  const completed = Number(completedCount) || 0;
  const total = Number(totalCount) || 0;
  if (!pacing || completed <= 0 || completed >= total) return null;
  if (pacing.batchSize > 0 && pacing.batchDelayMs > 0 && completed % pacing.batchSize === 0) {
    return {
      itemId: item && item.id || null,
      itemIndex: completed,
      delayMs: pacing.batchDelayMs,
      reason: 'batch',
    };
  }
  if (pacing.betweenItemsDelayMs > 0) {
    return {
      itemId: item && item.id || null,
      itemIndex: completed,
      delayMs: pacing.betweenItemsDelayMs,
      reason: 'between_items',
    };
  }
  return null;
}

function shouldRetryWithoutProviderJson(err, item, options = {}) {
  if (!expectedJson(item)) return false;
  if (evalJsonMode(options.evalJsonMode) !== 'auto') return false;
  const normalized = scoring.normalizeEvalError(err);
  return normalized.failureCategory === 'SCHEMA_FAILURE' || normalized.failureCategory === 'PARSING_FAILURE';
}

function isJsonModeFailure(category) {
  return category === 'SCHEMA_FAILURE' || category === 'PARSING_FAILURE';
}

function isProviderRuntimeFailure(category) {
  return category === 'TOKEN_LIMIT_FAILURE'
    || category === 'TIMEOUT'
    || category === 'PROVIDER_ERROR'
    || category === 'EVAL_RUNNER_FAILURE';
}

function formatForAttempt(item, options = {}, attempt = {}) {
  if (!expectedJson(item)) return undefined;
  const mode = evalJsonMode(options.evalJsonMode);
  if (attempt.promptJsonOnly || mode === 'prompt') return undefined;
  return 'json';
}

function promptForAttempt(item, attempt = {}) {
  const prompt = buildPrompt(item);
  if (!expectedJson(item) || !attempt.promptJsonOnly) return prompt;
  return `Return ONLY strict JSON. Do not include markdown or commentary. If a schema is shown, follow it exactly.\n\n${prompt}`;
}

function generationOptionsForAttempt(item, options = {}, attempt = {}) {
  const isCompactOllamaJson = options.provider === 'ollama' && options.ollamaCompactJson && expectedJson(item);
  const baseNumPredict = item.feature === 'notes' || item.feature === 'video' ? 2200 : 1000;
  const opts = {
    provider: options.provider,
    feature: featureForProvider(item.feature),
    format: formatForAttempt(item, options, attempt),
    temperature: 0.25,
    num_predict: isCompactOllamaJson ? Math.min(baseNumPredict, 650) : baseNumPredict,
  };
  if (isCompactOllamaJson) opts.num_ctx = 3072;
  if (Number.isInteger(options.timeoutMs) && options.timeoutMs > 0) opts.timeoutMs = options.timeoutMs;
  return opts;
}

function buildContextPrompt(item) {
  const context = educationalContext.buildEducationalContext({
    topic: item.topic,
    query: item.prompt,
    feature: item.feature,
    audienceLevel: item.difficulty,
  });
  if (item.feature === 'video') {
    return educationalContext.formatVideoEducationalContextForPrompt(context, { maxChars: 3500 });
  }
  if (item.feature === 'quiz' || item.feature === 'flashcards') {
    return educationalContext.formatPracticeEducationalContextForPrompt(context, { feature: item.feature, maxChars: 3500 });
  }
  return educationalContext.formatEducationalContextForPrompt(context, { maxChars: 4500 });
}

function buildPrompt(item) {
  const contextPrompt = buildContextPrompt(item);
  if (item.feature === 'tutor') {
    return prompts.TUTOR_CHAT([], item.prompt, {
      groundingTier: 'weak',
      educationalContext: contextPrompt,
      conversationHistory: '(Evaluation case; no prior conversation.)',
    });
  }
  if (item.feature === 'notes') {
    return prompts.LESSON_GENERATE([], item.topic, {
      topic: item.topic,
      lessonType: item.domain,
      groundingTier: 'weak',
      educationalContext: contextPrompt,
      curatedKnowledge: '(Use the educational context block; do not expose raw JSON.)',
    });
  }
  if (item.feature === 'video') {
    return prompts.VIDEO_SCRIPT(item.topic, [], {
      lowGrounding: true,
      groundingTier: 'weak',
      educationalContext: contextPrompt,
    });
  }
  if (item.feature === 'quiz') {
    return prompts.QUIZ_MCQ([], 4, difficultyForPractice(item.difficulty), {
      groundingTier: 'weak',
      educationalContext: contextPrompt,
    });
  }
  if (item.feature === 'flashcards') {
    return prompts.FLASHCARDS([], 5, {
      groundingTier: 'weak',
      educationalContext: contextPrompt,
    });
  }
  return `${prompts.SYSTEM_BASE}\n\nTask: ${item.prompt}\n\nEducational context:\n${contextPrompt}`;
}

async function runItem(item, options) {
  if (options.dryRun) {
    return {
      item,
      provider: options.provider,
      model: options.model,
      feature: item.feature,
      evalFile: item.evalFile,
      status: 'dry_run',
      responseTimeMs: 0,
      scoring: null,
      outputSnippet: '',
    };
  }
  const started = Date.now();
  const providerRetryLimit = Math.max(0, Number.isInteger(options.retries) ? options.retries : 1);
  const retryDelayMs = Math.max(0, Number.isInteger(options.retryDelayMs) ? options.retryDelayMs : 1000);
  const attempts = [];
  const mode = evalJsonMode(options.evalJsonMode);
  const jsonFallbackAllowed = expectedJson(item) && mode === 'auto';
  const maxTotalAttempts = 1 + providerRetryLimit + (jsonFallbackAllowed ? 1 + providerRetryLimit : 0);
  let totalAttempts = 0;
  let promptJsonOnly = mode === 'prompt';
  let jsonFallbackUsed = false;
  const providerRetriesUsed = { provider: 0, prompt: 0 };
  let lastError = null;

  while (totalAttempts < maxTotalAttempts) {
    const retryMode = promptJsonOnly ? 'prompt' : 'provider';
    const attempt = {
      index: totalAttempts + 1,
      promptJsonOnly,
      jsonMode: expectedJson(item) ? retryMode : 'none',
      consumedProviderRetryBudget: false,
      consumedJsonFallbackBudget: false,
      providerRetriesUsed: providerRetriesUsed[retryMode],
      providerRetryLimit,
      jsonFallbackUsed,
    };
    const prompt = promptForAttempt(item, attempt);
    const generationOptions = generationOptionsForAttempt(item, options, attempt);
    attempt.format = generationOptions.format || 'prompt';
    attempt.num_predict = generationOptions.num_predict;
    attempt.num_ctx = generationOptions.num_ctx || null;
    const attemptStarted = Date.now();
    try {
      const raw = await ai.generate(prompt, generationOptions);
      attempt.status = 'evaluated';
      attempt.responseTimeMs = Date.now() - attemptStarted;
      attempts.push(attempt);
      const responseTimeMs = Date.now() - started;
      return {
        item,
        provider: options.provider,
        model: options.model,
        feature: item.feature,
        evalFile: item.evalFile,
        status: 'evaluated',
        responseTimeMs,
        attempts,
        scoring: scoring.scoreOutput(item, raw),
        outputSnippet: String(raw || '').slice(0, 1600),
      };
    } catch (err) {
      const normalized = scoring.normalizeEvalError(err);
      attempt.status = 'error';
      attempt.responseTimeMs = Date.now() - attemptStarted;
      attempt.error = {
        code: err.code || 'eval_generation_failed',
        message: err.message || String(err),
        status: err.status || null,
      };
      attempt.failureCategory = normalized.failureCategory;
      attempt.retryable = normalized.retryable;
      attempts.push(attempt);
      lastError = err;

      const canSwitchJsonMode = jsonFallbackAllowed
        && !jsonFallbackUsed
        && !promptJsonOnly
        && isJsonModeFailure(normalized.failureCategory);
      const canRetryProviderFailure = normalized.retryable
        && isProviderRuntimeFailure(normalized.failureCategory)
        && providerRetriesUsed[retryMode] < providerRetryLimit;
      if (!canSwitchJsonMode && !canRetryProviderFailure) break;

      if (canSwitchJsonMode) {
        promptJsonOnly = true;
        jsonFallbackUsed = true;
        attempt.consumedJsonFallbackBudget = true;
        attempt.nextJsonMode = 'prompt';
      }
      if (canRetryProviderFailure) {
        providerRetriesUsed[retryMode] += 1;
        attempt.consumedProviderRetryBudget = true;
        attempt.providerRetriesUsed = providerRetriesUsed[retryMode];
        const waitMs = normalized.failureCategory === 'TOKEN_LIMIT_FAILURE'
          ? retryAfterMs(err.message, retryDelayMs)
          : retryDelayMs;
        attempt.retryDelayMs = Math.min(waitMs, 30000);
        await sleep(Math.min(waitMs, 30000));
      }
    }
    totalAttempts += 1;
  }

  const responseTimeMs = Date.now() - started;
  const normalized = scoring.normalizeEvalError(lastError || {});
  try {
    return {
      item,
      provider: options.provider,
      model: options.model,
      feature: item.feature,
      evalFile: item.evalFile,
      status: 'error',
      responseTimeMs,
      attempts,
      failureCategory: normalized.failureCategory,
      providerErrorCode: normalized.providerErrorCode,
      providerStatus: normalized.providerStatus,
      retryable: normalized.retryable,
      excludedFromModelQuality: normalized.excludedFromModelQuality,
      scoring: scoring.scoreOutput(item, ''),
      error: {
        code: lastError && lastError.code || 'eval_generation_failed',
        message: lastError && lastError.message || String(lastError || 'Unknown eval generation failure'),
        status: lastError && lastError.status || null,
      },
      outputSnippet: '',
    };
  } catch (err) {
    const runnerError = scoring.normalizeEvalError(err);
    return {
      item,
      provider: options.provider,
      model: options.model,
      feature: item.feature,
      evalFile: item.evalFile,
      status: 'error',
      responseTimeMs,
      attempts,
      failureCategory: runnerError.failureCategory,
      providerErrorCode: runnerError.providerErrorCode,
      providerStatus: runnerError.providerStatus,
      retryable: runnerError.retryable,
      excludedFromModelQuality: runnerError.excludedFromModelQuality,
      scoring: scoring.scoreOutput(item, ''),
      error: {
        code: err.code || 'eval_generation_failed',
        message: err.message || String(err),
        status: err.status || null,
      },
      outputSnippet: '',
    };
  }
}

function sanitizePreflight(value) {
  if (!value || typeof value !== 'object') return value;
  const copy = JSON.parse(JSON.stringify(value));
  const scrub = obj => {
    if (!obj || typeof obj !== 'object') return;
    for (const key of Object.keys(obj)) {
      if (/api[_-]?key|authorization|token|secret|password/i.test(key)) obj[key] = '[redacted]';
      else if (obj[key] && typeof obj[key] === 'object') scrub(obj[key]);
    }
  };
  scrub(copy);
  return copy;
}

async function providerPreflight(options = {}) {
  if (options.dryRun || options.noPreflight) {
    return {
      skipped: true,
      reason: options.dryRun ? 'dry_run' : 'disabled_by_flag',
      provider: options.provider,
      model: options.model,
    };
  }
  try {
    const status = await ai.getModelStatus();
    return {
      skipped: false,
      ok: status && status.ready !== false,
      provider: options.provider,
      model: options.model,
      details: sanitizePreflight(status),
    };
  } catch (err) {
    return {
      skipped: false,
      ok: false,
      provider: options.provider,
      model: options.model,
      error: {
        code: err.code || 'preflight_failed',
        message: err.message || String(err),
      },
    };
  }
}

function writeReports(report, options = {}) {
  const outDir = options.reportDir || reportDir;
  fs.mkdirSync(outDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const base = `${fileSafe(report.feature)}-${fileSafe(report.provider)}-${fileSafe(report.model)}-${timestamp}`;
  const jsonPath = path.join(outDir, `eval-report-${base}.json`);
  const mdPath = path.join(outDir, `eval-summary-${base}.md`);
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  fs.writeFileSync(mdPath, scoring.renderMarkdownReport(report));
  return { jsonPath, mdPath };
}

async function main() {
  const feature = args.feature || process.env.EVAL_FEATURE || 'all';
  const features = args.features || '';
  const dryRun = !!args.dryRun;
  const provider = args.provider || process.env.EVAL_PROVIDER || env.AI_PROVIDER;
  const model = args.model || (provider === 'groq' ? env.GROQ_MODEL : env.OLLAMA_GEN_MODEL);
  const startedAt = new Date().toISOString();
  const allItems = scoring.loadEvalDataset(evalDir, { feature: 'all' });
  const items = selectEvalItems(allItems, { feature, features, ids: args.ids, limit: args.limit });
  const results = [];
  const pacing = resolvePacingOptions({
    provider,
    dryRun,
    fastGroq: !!args.fastGroq,
    betweenItemsDelayMs: args.betweenItemsDelayMs,
    batchSize: args.batchSize,
    batchDelayMs: args.batchDelayMs,
  });
  const pacingEvents = [];
  const preflight = await providerPreflight({
    dryRun,
    noPreflight: !!args.noPreflight,
    provider,
    model,
  });

  if (!items.length) {
    throw new scoring.EvalScoringError('empty_eval_dataset', `No eval items found for feature "${features || feature}" in ${evalDir}`);
  }

  if (!dryRun && !args.noPreflight && preflight.ok === false) {
    throw new scoring.EvalScoringError('provider_preflight_failed', `Provider preflight failed for ${provider}/${model}`, preflight);
  }

  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    const result = await runItem(item, {
      dryRun,
      provider,
      model,
      retries: args.retries,
      retryDelayMs: args.retryDelayMs,
      evalJsonMode: args.evalJsonMode,
      ollamaCompactJson: !!args.ollamaCompactJson,
      timeoutMs: args.timeoutMs,
    });
    results.push(result);
    const score = result.scoring ? result.scoring.averageScore : 'dry-run';
    console.log(`${result.status} ${item.id} (${item.feature}/${item.topic}) score=${score}`);
    const pacingEvent = shouldApplyPacingDelay({
      completedCount: i + 1,
      totalCount: items.length,
      item,
    }, pacing);
    if (pacingEvent) {
      pacingEvents.push(pacingEvent);
      console.log(`pacing delay ${pacingEvent.delayMs}ms after ${item.id} (${pacingEvent.reason})`);
      await sleep(pacingEvent.delayMs);
    }
  }

  const report = scoring.buildReport({
    provider,
    model,
    feature: features || feature,
    dryRun,
    preflight,
    filters: {
      feature,
      features: features || null,
      ids: args.ids || null,
      limit: Number.isInteger(args.limit) ? args.limit : null,
      retries: Number.isInteger(args.retries) ? args.retries : 1,
      retryDelayMs: Number.isInteger(args.retryDelayMs) ? args.retryDelayMs : 1000,
      evalJsonMode: evalJsonMode(args.evalJsonMode),
      ollamaCompactJson: !!args.ollamaCompactJson,
      timeoutMs: Number.isInteger(args.timeoutMs) ? args.timeoutMs : null,
      pacing,
      evalDir,
      evaluationPath: 'prompt',
    },
    results,
    startedAt,
    endedAt: new Date().toISOString(),
  });
  report.pacingEvents = pacingEvents;
  const written = writeReports(report);
  console.log(`JSON report: ${written.jsonPath}`);
  console.log(`Markdown summary: ${written.mdPath}`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err.message || err);
    if (err.details) console.error(JSON.stringify(err.details, null, 2));
    process.exit(1);
  });
}

module.exports = {
  parseArgs,
  selectEvalItems,
  fileSafe,
  difficultyForPractice,
  featureForProvider,
  expectedJson,
  evalJsonMode,
  retryAfterMs,
  resolvePacingOptions,
  shouldApplyPacingDelay,
  shouldRetryWithoutProviderJson,
  isJsonModeFailure,
  isProviderRuntimeFailure,
  generationOptionsForAttempt,
  buildContextPrompt,
  buildPrompt,
  runItem,
  sanitizePreflight,
  providerPreflight,
  writeReports,
};
