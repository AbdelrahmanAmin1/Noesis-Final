'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const EVAL_DIR = path.join(ROOT, 'eval', 'noesis');

function loadBackendEnv() {
  const file = path.join(ROOT, 'backend', '.env');
  if (!fs.existsSync(file)) return;
  for (const rawLine of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const idx = line.indexOf('=');
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key && process.env[key] == null) process.env[key] = value;
  }
}

loadBackendEnv();

const args = process.argv.slice(2);
const PROVIDER = (valueAfter('--provider') || process.env.NOESIS_EVAL_PROVIDER || 'ollama').toLowerCase();
const OLLAMA_MODEL = process.env.OLLAMA_GEN_MODEL || 'llama3.2:latest';
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
const GROQ_BASE_URL = String(process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1').replace(/\/+$/, '');
const TIMEOUT_MS = parseInt(process.env.NOESIS_EVAL_TIMEOUT_MS || process.env.OLLAMA_TIMEOUT_MS || '300000', 10);

function valueAfter(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : null;
}

function rel(file) {
  return path.relative(ROOT, file).replace(/\\/g, '/');
}

function readJsonl(file) {
  return fs.readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .filter(line => line.trim())
    .map((line, index) => {
      try {
        return { ok: true, record: JSON.parse(line), line: index + 1 };
      } catch (error) {
        return { ok: false, error: error.message, raw: line, line: index + 1 };
      }
    });
}

function fetchWithTimeout(url, options) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  return fetch(url, { ...options, signal: ctrl.signal })
    .finally(() => clearTimeout(timer));
}

async function ollamaGenerate(prompt) {
  const res = await fetchWithTimeout(`${OLLAMA_BASE_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      stream: false,
      prompt,
      options: { temperature: 0.2, num_ctx: 4096 },
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`ollama_${res.status}: ${text.slice(0, 300)}`);
  const json = JSON.parse(text);
  return json.response || '';
}

async function groqGenerate(prompt, record) {
  if (!process.env.GROQ_API_KEY) throw new Error('GROQ_API_KEY is not set');
  const messages = [
    {
      role: 'system',
      content: [
        'You are Noesis, an expert CS learning tutor.',
        'Answer the evaluation prompt directly and accurately.',
        record && record.expect_json ? 'When JSON is requested, return only valid JSON without markdown fences.' : 'Use clear, concise educational language.',
      ].join(' '),
    },
    { role: 'user', content: prompt },
  ];
  const res = await fetchWithTimeout(`${GROQ_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages,
      temperature: 0.2,
      max_tokens: parseInt(process.env.NOESIS_EVAL_GROQ_MAX_TOKENS || '1200', 10),
    }),
  });
  const text = await res.text();
  if (!res.ok) {
    let message = text;
    try {
      const parsed = JSON.parse(text);
      message = (parsed.error && parsed.error.message) || parsed.message || text;
    } catch (_) {
      // Keep raw response text.
    }
    throw new Error(`groq_${res.status}: ${String(message).slice(0, 300)}`);
  }
  const json = JSON.parse(text);
  const choice = json && json.choices && json.choices[0];
  return (choice && choice.message && choice.message.content) || '';
}

async function generate(prompt, record) {
  if (PROVIDER === 'groq') return groqGenerate(prompt, record);
  if (PROVIDER === 'ollama') return ollamaGenerate(prompt);
  throw new Error(`Unsupported provider: ${PROVIDER}`);
}

function modelName() {
  return PROVIDER === 'groq' ? GROQ_MODEL : OLLAMA_MODEL;
}

function baseUrl() {
  return PROVIDER === 'groq' ? GROQ_BASE_URL : OLLAMA_BASE_URL;
}

function extractJson(text) {
  const s = String(text || '').replace(/```(?:json)?/gi, '').replace(/```/g, '');
  const start = Math.min(...['{', '['].map(ch => {
    const idx = s.indexOf(ch);
    return idx === -1 ? Number.POSITIVE_INFINITY : idx;
  }));
  if (!Number.isFinite(start)) return null;
  for (let end = s.length; end > start; end--) {
    const candidate = s.slice(start, end);
    try {
      JSON.parse(candidate);
      return candidate;
    } catch (_) {
      // continue shrinking
    }
  }
  return null;
}

function scoreCase(record, response) {
  const lower = String(response || '').toLowerCase();
  const keywords = Array.isArray(record.expected_keywords) ? record.expected_keywords : [];
  const keywordHits = keywords.filter(keyword => lower.includes(String(keyword).toLowerCase()));
  const keywordScore = keywords.length ? keywordHits.length / keywords.length : 1;
  const jsonCandidate = extractJson(response);
  const jsonValid = !!jsonCandidate;
  const jsonScore = record.expect_json ? (jsonValid ? 1 : 0) : 1;
  const lengthScore = response && response.trim().length >= 40 ? 1 : 0;
  const score = Math.round(((keywordScore * 1.4) + (jsonScore * 1.0) + (lengthScore * 0.6)) * 100) / 100;
  return {
    score: Math.min(3, score),
    keywordHits,
    keywordTotal: keywords.length,
    jsonValid,
    responseChars: String(response || '').length,
  };
}

async function main() {
  const files = fs.readdirSync(EVAL_DIR).filter(name => name.endsWith('.jsonl')).sort().map(name => path.join(EVAL_DIR, name));
  const started = Date.now();
  const fileResults = [];
  for (const file of files) {
    const parsed = readJsonl(file);
    const cases = [];
    for (const item of parsed) {
      if (!item.ok) {
        cases.push({ line: item.line, parseError: item.error, score: 0, ok: false });
        continue;
      }
      const record = item.record;
      const caseStart = Date.now();
      try {
        const response = await generate(record.prompt, record);
        const scored = scoreCase(record, response);
        cases.push({
          id: record.id,
          feature: record.feature,
          ok: scored.score >= 2,
          durationMs: Date.now() - caseStart,
          responsePreview: String(response || '').replace(/\s+/g, ' ').slice(0, 300),
          ...scored,
        });
      } catch (error) {
        cases.push({
          id: record.id,
          feature: record.feature,
          ok: false,
          durationMs: Date.now() - caseStart,
          error: error.message,
          score: 0,
          keywordHits: [],
          keywordTotal: Array.isArray(record.expected_keywords) ? record.expected_keywords.length : 0,
          jsonValid: false,
          responseChars: 0,
        });
      }
    }
    const validRecords = parsed.filter(item => item.ok).length;
    const avgScore = cases.length ? cases.reduce((sum, item) => sum + (item.score || 0), 0) / cases.length : 0;
    fileResults.push({
      file: rel(file),
      feature: cases.find(item => item.feature)?.feature || path.basename(file, '.jsonl'),
      records: parsed.length,
      validRecords,
      jsonlValidityRate: parsed.length ? validRecords / parsed.length : 0,
      averageScore: Math.round(avgScore * 100) / 100,
      passed: cases.filter(item => item.ok).length,
      failed: cases.filter(item => !item.ok).length,
      cases,
    });
  }
  const allCases = fileResults.flatMap(file => file.cases.map(c => ({ ...c, file: file.file })));
  const summary = {
    generatedAt: new Date().toISOString(),
    command: `node scripts/run-noesis-evals.js --provider ${PROVIDER}`,
    provider: PROVIDER,
    baseUrl: baseUrl(),
    ollamaBaseUrl: PROVIDER === 'ollama' ? OLLAMA_BASE_URL : undefined,
    model: modelName(),
    durationMs: Date.now() - started,
    files: fileResults.length,
    records: allCases.length,
    passed: allCases.filter(item => item.ok).length,
    failed: allCases.filter(item => !item.ok).length,
    averageScore: allCases.length ? Math.round((allCases.reduce((sum, item) => sum + (item.score || 0), 0) / allCases.length) * 100) / 100 : 0,
    jsonValidityRate: allCases.length ? allCases.filter(item => item.jsonValid).length / allCases.length : 0,
    strongestArea: fileResults.slice().sort((a, b) => b.averageScore - a.averageScore)[0]?.feature || null,
    weakestArea: fileResults.slice().sort((a, b) => a.averageScore - b.averageScore)[0]?.feature || null,
    ok: allCases.length > 0 && allCases.every(item => item.ok),
    fileResults,
  };

  if (args.includes('--json')) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log(`Noesis ${PROVIDER} evals: ${summary.records} records across ${summary.files} files, average ${summary.averageScore}/3, ${summary.passed} passed, ${summary.failed} failed.`);
    for (const file of fileResults) {
      console.log(`${file.failed ? 'FAIL' : 'PASS'} ${file.file}: ${file.averageScore}/3 (${file.passed}/${file.records})`);
    }
  }

  process.exit(summary.ok ? 0 : 1);
}

main().catch(error => {
  const summary = {
    generatedAt: new Date().toISOString(),
    command: `node scripts/run-noesis-evals.js --provider ${PROVIDER}`,
    provider: PROVIDER,
    baseUrl: baseUrl(),
    model: modelName(),
    ok: false,
    error: error.message,
  };
  if (args.includes('--json')) console.log(JSON.stringify(summary, null, 2));
  else console.error(error.stack || error.message);
  process.exit(1);
});
