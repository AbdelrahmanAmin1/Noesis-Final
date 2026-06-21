'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

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

const WORD_DOC = process.env.NOESIS_WORD_DOC || 'C:\\Users\\belal\\Documents\\Word.docx';
const RUN_ID = new Date().toISOString().replace(/[:.]/g, '-');
const RUN_DIR = path.join(ROOT, 'docs', 'test-evidence', 'runs', RUN_ID);
const LOG_DIR = path.join(RUN_DIR, 'logs');
const RESULT_DIR = path.join(RUN_DIR, 'results');
const HTML_DIR = path.join(RUN_DIR, 'html');
const SCREENSHOT_DIR = path.join(RUN_DIR, 'screenshots');
const SUMMARY_PATH = path.join(RESULT_DIR, 'evidence-summary.json');
const SCREENSHOT_INDEX = path.join(ROOT, 'docs', 'testing-evaluation-screenshot-index.md');
const DOCX_PATH = path.join(ROOT, 'docs', 'testing-evaluation-report.docx');

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const OLLAMA_GEN_MODEL = process.env.OLLAMA_GEN_MODEL || 'llama3.2:latest';
const OLLAMA_EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text:latest';

function rel(file) {
  return path.relative(ROOT, file).replace(/\\/g, '/');
}

function ensureDirs() {
  for (const dir of [LOG_DIR, RESULT_DIR, HTML_DIR, SCREENSHOT_DIR]) fs.mkdirSync(dir, { recursive: true });
}

function commandString(command, args) {
  return [command, ...args.map(arg => /\s/.test(arg) ? `"${arg}"` : arg)].join(' ');
}

function runCommand(id, label, command, args, options = {}) {
  const started = Date.now();
  const cwd = options.cwd || ROOT;
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    shell: process.platform === 'win32' && command === 'npm',
    timeout: options.timeoutMs || 600000,
    maxBuffer: 1024 * 1024 * 20,
    env: {
      ...process.env,
      OLLAMA_BASE_URL,
      OLLAMA_GEN_MODEL,
      OLLAMA_EMBED_MODEL,
      OLLAMA_TIMEOUT_MS: process.env.OLLAMA_TIMEOUT_MS || '300000',
      ...(options.env || {}),
    },
  });
  const durationMs = Date.now() - started;
  const stdout = result.stdout || '';
  const stderr = result.stderr || '';
  const logPath = path.join(LOG_DIR, `${id}.log`);
  fs.writeFileSync(logPath, [
    `$ ${commandString(command, args)}`,
    `cwd: ${rel(cwd) || '.'}`,
    `exit: ${result.status}`,
    `durationMs: ${durationMs}`,
    '',
    '--- stdout ---',
    stdout,
    '',
    '--- stderr ---',
    stderr,
    result.error ? `\n--- error ---\n${result.error.message}` : '',
  ].join('\n'), 'utf8');
  return {
    id,
    label,
    command: commandString(command, args),
    cwd: rel(cwd) || '.',
    status: typeof result.status === 'number' ? result.status : null,
    ok: result.status === 0,
    durationMs,
    logPath: rel(logPath),
    stdout,
    stderr,
    error: result.error ? result.error.message : null,
  };
}

function parseJsonOutput(command) {
  const text = command.stdout || '';
  try {
    return JSON.parse(text);
  } catch (_) {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try { return JSON.parse(text.slice(start, end + 1)); } catch (_) {}
    }
  }
  return null;
}

function stripAnsi(text) {
  return String(text || '').replace(/\x1b\[[0-9;]*m/g, '');
}

function parseCountLine(line) {
  const pass = line.match(/(\d+)\s+passed/i);
  const fail = line.match(/(\d+)\s+failed/i);
  const skipped = line.match(/(\d+)\s+skipped/i);
  const total = line.match(/\((\d+)\)/);
  return {
    pass: pass ? parseInt(pass[1], 10) : 0,
    fail: fail ? parseInt(fail[1], 10) : 0,
    skipped: skipped ? parseInt(skipped[1], 10) : 0,
    total: total ? parseInt(total[1], 10) : null,
  };
}

function parseTap(stdout) {
  const out = { testFiles: 0, testFilePass: 0, testFileFail: 0, tests: 0, pass: 0, fail: 0, skipped: 0, durationMs: null };
  for (const line of stripAnsi(stdout).split(/\r?\n/)) {
    let m;
    if ((m = line.match(/^# tests\s+(\d+)/))) out.tests = parseInt(m[1], 10);
    if ((m = line.match(/^# pass\s+(\d+)/))) out.pass = parseInt(m[1], 10);
    if ((m = line.match(/^# fail\s+(\d+)/))) out.fail = parseInt(m[1], 10);
    if ((m = line.match(/^# skipped\s+(\d+)/))) out.skipped = parseInt(m[1], 10);
    if ((m = line.match(/^# duration_ms\s+([\d.]+)/))) out.durationMs = Math.round(parseFloat(m[1]));
    if (/^\s*Test Files\s+/i.test(line)) {
      const counts = parseCountLine(line);
      out.testFilePass = counts.pass;
      out.testFileFail = counts.fail;
      out.testFiles = counts.total == null ? counts.pass + counts.fail + counts.skipped : counts.total;
    } else if (/^\s*Tests\s+/i.test(line)) {
      const counts = parseCountLine(line);
      out.pass = counts.pass;
      out.fail = counts.fail;
      out.skipped = counts.skipped;
      out.tests = counts.total == null ? counts.pass + counts.fail + counts.skipped : counts.total;
    }
  }
  out.ok = out.tests > 0 && out.fail === 0;
  return out;
}

function extractWordText() {
  const outPath = path.join(RESULT_DIR, 'word-extracted.txt');
  if (!fs.existsSync(WORD_DOC)) {
    return { ok: false, path: WORD_DOC, error: 'Word document not found', extractedPath: null };
  }
  const ps = [
    "$ErrorActionPreference='Stop'",
    "Add-Type -AssemblyName System.IO.Compression",
    `$p=${JSON.stringify(WORD_DOC)}`,
    `$out=${JSON.stringify(outPath)}`,
    "$fs=[System.IO.File]::Open($p,[System.IO.FileMode]::Open,[System.IO.FileAccess]::Read,[System.IO.FileShare]::ReadWrite)",
    "try {",
    "  $zip=New-Object System.IO.Compression.ZipArchive($fs,[System.IO.Compression.ZipArchiveMode]::Read,$false)",
    "  try {",
    "    $entry=$zip.GetEntry('word/document.xml')",
    "    $sr=New-Object System.IO.StreamReader($entry.Open())",
    "    $xml=$sr.ReadToEnd(); $sr.Close()",
    "    $text=$xml -replace '</w:p>',\"`n\" -replace '<w:tab/>',' ' -replace '<[^>]+>','' -replace '&amp;','&' -replace '&lt;','<' -replace '&gt;','>' -replace '&quot;','\"' -replace '&#39;',\"'\"",
    "    Set-Content -LiteralPath $out -Value $text -Encoding UTF8",
    "  } finally { $zip.Dispose() }",
    "} finally { $fs.Dispose() }",
  ].join('; ');
  const result = runCommand('word-extract', 'Extract Word testing section', 'powershell', ['-NoProfile', '-Command', ps], { timeoutMs: 30000 });
  const ok = result.ok && fs.existsSync(outPath);
  return {
    ok,
    path: WORD_DOC,
    extractedPath: ok ? rel(outPath) : null,
    chars: ok ? fs.readFileSync(outPath, 'utf8').length : 0,
    command: result,
    error: ok ? null : (result.stderr || result.error || 'Word extraction failed'),
  };
}

function compareWordClaims(word) {
  const text = word.ok ? fs.readFileSync(path.join(ROOT, word.extractedPath), 'utf8') : '';
  const claims = [
    { claim: '56 backend test files passed', expected: 56, actualKey: 'backendTestFiles', supported: false },
    { claim: '457 backend tests passed', expected: 457, actualKey: 'backendTests', supported: false },
    { claim: '23 frontend source files built', expected: 23, actualKey: 'frontendSourceFiles', supported: false },
    { claim: '10 chat bundle markers passed', expected: 10, actualKey: 'frontendMarkers', supported: false },
    { claim: '10 curated knowledge files validated', expected: 10, actualKey: 'knowledgeFiles', supported: false },
    { claim: '21 eval records across 7 JSONL files', expected: 21, actualKey: 'evalRecords', supported: false },
    { claim: '7 JSONL eval files', expected: 7, actualKey: 'evalFiles', supported: false },
    { claim: '10 tracked sources validated for licenses', expected: 10, actualKey: 'licenseWarnings', supported: false },
    { claim: 'OCR tests exist', expected: 'present', actualKey: 'ocrTests', supported: false },
    { claim: 'Study room tests exist', expected: 'present', actualKey: 'studyRoomTests', supported: false },
    { claim: 'Caption/Remotion tests exist', expected: 'present', actualKey: 'captionRemotionTests', supported: false },
  ].map(item => ({ ...item, mentionedInWord: text.toLowerCase().includes(item.claim.split(' ')[0].toLowerCase()) || text.toLowerCase().includes(String(item.expected).toLowerCase()) }));
  return { wordProvided: word.ok, claims };
}

function htmlEscape(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function flatten(value, depth = 0) {
  if (value == null) return '';
  if (typeof value !== 'object') return htmlEscape(value);
  if (depth > 2) return htmlEscape(JSON.stringify(value));
  if (Array.isArray(value)) {
    return `<ul>${value.slice(0, 12).map(item => `<li>${flatten(item, depth + 1)}</li>`).join('')}</ul>`;
  }
  return `<table>${Object.entries(value).slice(0, 24).map(([k, v]) => `<tr><th>${htmlEscape(k)}</th><td>${flatten(v, depth + 1)}</td></tr>`).join('')}</table>`;
}

function renderPage(title, subtitle, blocks) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${htmlEscape(title)}</title>
<style>
body{margin:0;background:#f6f3ec;color:#141414;font-family:Arial,Helvetica,sans-serif}
.wrap{padding:34px 42px}
h1{font-size:34px;margin:0 0 6px}
.sub{color:#555;margin-bottom:24px}
.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
.card{background:#fff;border:1px solid #ddd;border-radius:8px;padding:16px;box-shadow:0 2px 10px rgba(0,0,0,.04)}
.wide{grid-column:1/-1}
h2{font-size:17px;margin:0 0 10px}
table{border-collapse:collapse;width:100%;font-size:12px}
th,td{border:1px solid #e4e4e4;padding:6px;text-align:left;vertical-align:top}
th{background:#fafafa;width:190px}
.pass{color:#087f23;font-weight:700}.fail{color:#b00020;font-weight:700}.env{color:#946200;font-weight:700}.skip{color:#666;font-weight:700}
pre{white-space:pre-wrap;font-size:11px;background:#111;color:#f4f4f4;padding:12px;border-radius:6px;max-height:260px;overflow:hidden}
ul{margin:4px 0 4px 20px;padding:0}
</style>
</head>
<body><div class="wrap">
<h1>${htmlEscape(title)}</h1>
<div class="sub">${htmlEscape(subtitle)}</div>
<div class="grid">
${blocks.map(block => `<section class="card ${block.wide ? 'wide' : ''}"><h2>${htmlEscape(block.title)}</h2>${block.html}</section>`).join('\n')}
</div></div></body></html>`;
}

function statusClass(status) {
  if (status === 'passed' || status === true || status === 0) return 'pass';
  if (status === 'environment-dependent') return 'env';
  if (status === 'skipped') return 'skip';
  return 'fail';
}

function writeEvidencePages(evidence) {
  const pages = [];
  const add = (name, title, subtitle, blocks) => {
    const htmlPath = path.join(HTML_DIR, `${name}.html`);
    fs.writeFileSync(htmlPath, renderPage(title, subtitle, blocks), 'utf8');
    pages.push({ name, title, htmlPath });
  };

  const commandRows = evidence.commands.map(cmd => `<tr><td>${htmlEscape(cmd.label)}</td><td>${htmlEscape(cmd.command)}</td><td class="${cmd.ok ? 'pass' : 'fail'}">${cmd.ok ? 'passed' : 'failed'}</td><td>${cmd.durationMs}</td><td>${htmlEscape(cmd.logPath)}</td></tr>`).join('');
  add('01-command-summary', 'Command Summary', `Run ${evidence.runId}`, [
    { title: 'Executed Commands', wide: true, html: `<table><tr><th>Label</th><th>Command</th><th>Status</th><th>Duration ms</th><th>Log</th></tr>${commandRows}</table>` },
    { title: 'Environment', html: flatten(evidence.environment) },
  ]);

  add('02-backend-tests', 'Backend Test Results', 'Vitest or Node test runner output', [
    { title: 'Summary', html: flatten(evidence.backendTests.summary) },
    { title: 'Command', html: flatten(evidence.backendTests.command) },
    { title: 'Log Preview', wide: true, html: `<pre>${htmlEscape((evidence.backendTests.command.stdout || evidence.backendTests.command.stderr || '').slice(-5000))}</pre>` },
  ]);

  const smoke = evidence.apiSmoke.result || {};
  const stepBlock = id => {
    const s = (smoke.steps || []).find(item => item.id === id) || {};
    return { title: s.title || id, html: `<div class="${statusClass(s.status)}">${htmlEscape(s.status || 'missing')}</div>${flatten(s.result || s.error || s.note)}` };
  };
  add('03-api-health', 'API Health and Ollama Readiness', 'Live backend smoke evidence', [stepBlock('api-health'), stepBlock('protected-route')]);
  add('04-auth-protected', 'Authentication and Protected Routes', 'Signup, login, onboarding, protected route checks', [stepBlock('auth'), stepBlock('protected-route')]);
  add('05-upload-job', 'Material Upload and Job Polling', 'Upload, processing job, ready material, chunks, rejection', [stepBlock('upload-material'), stepBlock('unsupported-upload')]);
  add('06-notes', 'Notes Tests', 'Manual note CRUD and AI note generation', [stepBlock('notes')]);
  add('07-flashcards', 'Flashcard Tests', 'Live generation, due queue, SRS review', [stepBlock('flashcards')]);
  add('08-quiz', 'Quiz Tests', 'Live quiz generation and scoring', [stepBlock('quiz')]);
  add('09-tutor', 'Guided Tutor Tests', 'Live guided session, feedback, tutor note, finish', [stepBlock('tutor')]);
  add('10-dashboard-progress', 'Dashboard and Progress Tests', 'Study activity reflected in analytics', [stepBlock('dashboard-progress')]);
  add('11-video', 'Video and Storyboard Result', 'Environment-dependent video rendering with silence TTS', [stepBlock('video')]);

  const providerEvals = evidence.providerEvals || { ollama: evidence.evals };
  const providerSummary = Object.fromEntries(Object.entries(providerEvals).map(([provider, item]) => [
    provider,
    item.result ? {
      model: item.result.model,
      records: item.result.records,
      passed: item.result.passed,
      failed: item.result.failed,
      averageScore: item.result.averageScore,
      ok: item.result.ok,
      logPath: item.command.logPath,
    } : {
      ok: false,
      error: item.command.error || item.command.stderr || 'No result parsed',
      logPath: item.command.logPath,
    },
  ]));
  const evalRows = Object.entries(providerEvals).flatMap(([provider, item]) => {
    const result = item.result || {};
    return (result.fileResults || []).map(row => `<tr><td>${htmlEscape(provider)}</td><td>${htmlEscape(row.file)}</td><td>${htmlEscape(row.feature)}</td><td>${row.records}</td><td>${row.averageScore}</td><td>${row.passed}</td><td>${row.failed}</td></tr>`);
  }).join('');
  add('12-evals', 'AI Evaluation Results', 'Live Ollama and Groq JSONL evaluation suite', [
    { title: 'Provider Summary', html: flatten(providerSummary) },
    { title: 'Files', wide: true, html: `<table><tr><th>Provider</th><th>File</th><th>Feature</th><th>Records</th><th>Avg / 3</th><th>Passed</th><th>Failed</th></tr>${evalRows}</table>` },
  ]);

  add('13-frontend', 'Frontend Bundle Verification', 'Static local references and API helper markers', [{ title: 'Summary', html: flatten(evidence.frontend.result) }]);
  add('14-knowledge', 'Knowledge Validation', 'Seed corpus validation', [{ title: 'Summary', html: flatten(evidence.knowledge.result) }]);
  add('15-licenses', 'License and Source Validation', 'package-lock license metadata scan', [{ title: 'Summary', html: flatten(evidence.licenses.result) }]);
  add('16-word-claims', 'Word Document Claim Comparison', 'Historical claims versus current repo evidence', [
    { title: 'Word Extraction', html: flatten(evidence.word) },
    { title: 'Claim Comparison', wide: true, html: flatten(evidence.wordComparison.claims) },
  ]);

  return pages;
}

function findChrome() {
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ];
  return candidates.find(file => fs.existsSync(file)) || null;
}

function fileUrl(file) {
  return `file:///${path.resolve(file).replace(/\\/g, '/')}`;
}

function captureScreenshots(pages) {
  const chrome = findChrome();
  return pages.map(page => {
    const screenshotPath = path.join(SCREENSHOT_DIR, `${page.name}.png`);
    if (!chrome) return { title: page.title, htmlPath: rel(page.htmlPath), screenshotPath: rel(screenshotPath), ok: false, error: 'Chrome/Edge not found' };
    const result = spawnSync(chrome, [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--allow-file-access-from-files',
      '--window-size=1440,1100',
      `--screenshot=${screenshotPath}`,
      fileUrl(page.htmlPath),
    ], { encoding: 'utf8', timeout: 60000, maxBuffer: 1024 * 1024 });
    return {
      title: page.title,
      htmlPath: rel(page.htmlPath),
      screenshotPath: rel(screenshotPath),
      ok: result.status === 0 && fs.existsSync(screenshotPath),
      error: result.status === 0 ? null : (result.stderr || result.error && result.error.message || 'screenshot failed'),
    };
  });
}

function writeScreenshotIndex(evidence) {
  const lines = [
    '# Testing and Evaluation Screenshot Index',
    '',
    `Generated: ${new Date().toISOString()}`,
    `Run directory: \`${rel(RUN_DIR)}\``,
    '',
    '| Screenshot | Evidence | Status |',
    '| --- | --- | --- |',
    ...evidence.screenshots.map(item => `| ![${item.title}](${item.screenshotPath}) | [${item.title}](${item.htmlPath}) | ${item.ok ? 'captured' : `failed: ${item.error || ''}`} |`),
    '',
  ];
  fs.writeFileSync(SCREENSHOT_INDEX, lines.join('\n'), 'utf8');
}

function calculateScore(evidence) {
  const tests = evidence.backendTests.summary || {};
  const testScore = tests.tests ? (tests.pass / tests.tests) * 40 : 0;
  const providerEvals = evidence.providerEvals ? Object.values(evidence.providerEvals) : [evidence.evals];
  const providerScores = providerEvals.map(item => {
    const result = item && item.result;
    return result && result.records ? Math.max(0, Math.min(3, result.averageScore || 0)) : 0;
  });
  const avgProviderScore = providerScores.length ? providerScores.reduce((sum, score) => sum + score, 0) / providerScores.length : 0;
  const evalScore = (avgProviderScore / 3) * 25;
  const smoke = evidence.apiSmoke.result || {};
  const smokeSteps = smoke.steps || [];
  const smokeWeighted = smokeSteps.length ? smokeSteps.reduce((sum, item) => sum + (item.status === 'passed' ? 1 : item.status === 'environment-dependent' ? 0.75 : 0), 0) / smokeSteps.length : 0;
  const manualScore = smokeWeighted * 20;
  const staticItems = [evidence.frontend, evidence.knowledge, evidence.licenses];
  const staticScore = (staticItems.filter(item => item.command.ok).length / staticItems.length) * 15;
  return {
    automatedTests: Math.round(testScore * 10) / 10,
    aiEvaluation: Math.round(evalScore * 10) / 10,
    manualWorkflowTesting: Math.round(manualScore * 10) / 10,
    buildEnvironmentValidation: Math.round(staticScore * 10) / 10,
    total: Math.round((testScore + evalScore + manualScore + staticScore) * 10) / 10,
  };
}

function main() {
  ensureDirs();
  const commands = [];
  const word = extractWordText();
  commands.push(word.command);

  const frontend = runCommand('frontend-verify', 'Frontend bundle verification', 'node', ['scripts/verify-frontend-bundle.js', '--json']);
  commands.push(frontend);
  const knowledge = runCommand('knowledge-validate', 'Knowledge validation', 'node', ['scripts/validate-knowledge.js', '--json']);
  commands.push(knowledge);
  const licenses = runCommand('license-validate', 'License/source validation', 'node', ['scripts/validate-licenses.js', '--json']);
  commands.push(licenses);
  const backendTests = runCommand('backend-tests', 'Backend unit/integration tests', 'npm', ['test'], { cwd: path.join(ROOT, 'backend'), timeoutMs: 900000 });
  commands.push(backendTests);
  const ollamaEvals = runCommand('noesis-evals-ollama', 'Live Ollama JSONL evaluations', 'node', ['scripts/run-noesis-evals.js', '--provider', 'ollama', '--json'], { timeoutMs: 1200000 });
  commands.push(ollamaEvals);
  const groqEvals = runCommand('noesis-evals-groq', 'Live Groq JSONL evaluations', 'node', ['scripts/run-noesis-evals.js', '--provider', 'groq', '--json'], { timeoutMs: 1200000 });
  commands.push(groqEvals);
  const apiSmokeOut = path.join(RESULT_DIR, 'api-smoke.json');
  const apiSmoke = runCommand('api-smoke', 'Live API smoke workflow', 'node', ['scripts/run-api-smoke.js', '--json', '--out', apiSmokeOut], { timeoutMs: 1200000 });
  commands.push(apiSmoke);

  const evidence = {
    generatedAt: new Date().toISOString(),
    runId: RUN_ID,
    runDir: rel(RUN_DIR),
    environment: {
      os: `${os.type()} ${os.release()} (${os.platform()} ${os.arch()})`,
      node: process.version,
      ollamaBaseUrl: OLLAMA_BASE_URL,
      generationModel: OLLAMA_GEN_MODEL,
      embeddingModel: OLLAMA_EMBED_MODEL,
      groqBaseUrl: process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1',
      groqModel: process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
      groqConfigured: !!process.env.GROQ_API_KEY,
      wordDocument: WORD_DOC,
    },
    commands,
    word,
    frontend: { command: frontend, result: parseJsonOutput(frontend) },
    knowledge: { command: knowledge, result: parseJsonOutput(knowledge) },
    licenses: { command: licenses, result: parseJsonOutput(licenses) },
    backendTests: { command: backendTests, summary: parseTap(`${backendTests.stdout}\n${backendTests.stderr}`) },
    evals: { command: ollamaEvals, result: parseJsonOutput(ollamaEvals) },
    providerEvals: {
      ollama: { command: ollamaEvals, result: parseJsonOutput(ollamaEvals) },
      groq: { command: groqEvals, result: parseJsonOutput(groqEvals) },
    },
    apiSmoke: { command: apiSmoke, result: fs.existsSync(apiSmokeOut) ? JSON.parse(fs.readFileSync(apiSmokeOut, 'utf8')) : parseJsonOutput(apiSmoke) },
    wordComparison: null,
    screenshots: [],
    score: null,
  };
  evidence.wordComparison = compareWordClaims(word);
  evidence.wordComparison.actuals = {
    backendTestFiles: evidence.backendTests.summary.testFiles || 0,
    backendTests: evidence.backendTests.summary.tests || 0,
    backendPassed: evidence.backendTests.summary.pass || 0,
    evalFiles: evidence.evals.result ? evidence.evals.result.files : 0,
    evalRecords: evidence.evals.result ? evidence.evals.result.records : 0,
    frontendSourceFiles: evidence.frontend.result ? evidence.frontend.result.sourceFilesBuilt : 0,
    frontendMarkers: evidence.frontend.result ? evidence.frontend.result.markerCount - evidence.frontend.result.markerFailures.length : 0,
    knowledgeFiles: evidence.knowledge.result ? evidence.knowledge.result.filesValidated : 0,
    licensePackages: evidence.licenses.result ? evidence.licenses.result.packagesChecked : 0,
    licenseWarnings: evidence.licenses.result ? evidence.licenses.result.warnings : 0,
    ocrTests: 0,
    studyRoomTests: 0,
    captionRemotionTests: 0,
  };
  for (const claim of evidence.wordComparison.claims) {
    const actual = evidence.wordComparison.actuals[claim.actualKey];
    claim.actual = actual == null ? 'not found' : actual;
    claim.supported = typeof claim.expected === 'number' ? actual === claim.expected : !!actual;
  }
  evidence.score = calculateScore(evidence);

  fs.writeFileSync(SUMMARY_PATH, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  const pages = writeEvidencePages(evidence);
  evidence.screenshots = captureScreenshots(pages);
  fs.writeFileSync(SUMMARY_PATH, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  writeScreenshotIndex(evidence);

  const sourceDoc = word.ok ? path.join(ROOT, word.extractedPath) : WORD_DOC;
  const report = runCommand('report-generator', 'Generate final testing report', 'node', ['scripts/generate-testing-evaluation-report.js', sourceDoc], {
    env: { NOESIS_EVIDENCE_SUMMARY: SUMMARY_PATH },
    timeoutMs: 120000,
  });
  commands.push(report);
  evidence.commands = commands;
  fs.writeFileSync(SUMMARY_PATH, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  const docx = runCommand('docx-generator', 'Generate Word document with screenshots', 'node', ['scripts/generate-testing-evaluation-docx.js', DOCX_PATH, SUMMARY_PATH], {
    env: { NOESIS_EVIDENCE_SUMMARY: SUMMARY_PATH },
    timeoutMs: 120000,
  });
  commands.push(docx);
  evidence.commands = commands;
  fs.writeFileSync(SUMMARY_PATH, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');

  console.log(`Evidence run: ${rel(RUN_DIR)}`);
  console.log(`Screenshots: ${rel(SCREENSHOT_DIR)}`);
  console.log(`Summary: ${rel(SUMMARY_PATH)}`);
  console.log(`Screenshot index: ${rel(SCREENSHOT_INDEX)}`);
  console.log(`Word document: ${rel(DOCX_PATH)}`);
  console.log(`Overall testing confidence score: ${evidence.score.total}/100`);
  const reportCommand = commands.find(command => command.id === 'report-generator');
  const docxCommand = commands.find(command => command.id === 'docx-generator');
  process.exit((reportCommand && !reportCommand.ok) || (docxCommand && !docxCommand.ok) ? 1 : 0);
}

main();
