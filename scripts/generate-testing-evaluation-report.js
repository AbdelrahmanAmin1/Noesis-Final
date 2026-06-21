'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const { spawnSync } = require('child_process');
const zlib = require('zlib');

const ROOT = path.resolve(__dirname, '..');
const DOCS_DIR = path.join(ROOT, 'docs');
const REPORT_PATH = path.join(DOCS_DIR, 'testing-evaluation-report.md');
const SUMMARY_PATH = path.join(DOCS_DIR, 'testing-evaluation-summary.json');
const SOURCE_DOC = process.argv[2] ? path.resolve(process.argv[2]) : null;
const EVIDENCE_SUMMARY_PATH = process.env.NOESIS_EVIDENCE_SUMMARY || null;

const GENERATED_REL = new Set([
  'docs/testing-evaluation-report.md',
  'docs/testing-evaluation-summary.json',
]);

const SKIP_DIRS = new Set(['.git', 'node_modules']);
const SKIP_REL_PREFIXES = [
  'backend/data/',
  'backend/uploads/',
  'docs/screenshots/',
];

const TEST_RUNNERS = [
  'vitest',
  'jest',
  'mocha',
  'ava',
  'tap',
  'supertest',
  'playwright',
  'cypress',
  '@testing-library/react',
];

const SCREENSHOTS = [
  ['01-report-command.png', 'Terminal output after running node scripts/generate-testing-evaluation-report.js.'],
  ['02-summary-json.png', 'Opened docs/testing-evaluation-summary.json.'],
  ['03-api-health.png', 'GET /api/health response after the backend is started.'],
  ['04-signup-onboarding.png', 'Registration and onboarding flow.'],
  ['05-material-upload-job.png', 'Material upload and job progress/polling.'],
  ['06-notes-generation.png', 'Generated notes view.'],
  ['07-flashcards-review.png', 'Flashcard generation and review.'],
  ['08-quiz-score.png', 'Quiz attempt and final score.'],
  ['09-tutor-session.png', 'Tutor or guided tutor session.'],
  ['10-dashboard-progress.png', 'Dashboard/progress update after study activity.'],
  ['11-video-job-playback.png', 'Video/storyboard generation job and playback when Ollama, TTS, and ffmpeg are available.'],
  ['12-network-mechanisms.png', 'Browser Network tab showing authenticated API requests and job polling.'],
];

const FEATURES = [
  {
    name: 'Authentication',
    keywords: ['auth', 'signin', 'signup', 'signout', 'onboarding', 'jwt', 'session', 'protected'],
    implementation: ['backend/routes/auth.routes.js', 'backend/services/auth.service.js', 'backend/middleware/auth.js', 'project/components/Auth.jsx', 'project/api.js'],
    manual: ['registration', 'onboarding'],
  },
  {
    name: 'Materials upload and processing',
    keywords: ['material', 'materials', 'upload', 'extract', 'chunk', 'multipart', 'pdf', 'docx', 'pptx'],
    implementation: ['backend/routes/material.routes.js', 'backend/services/material.service.js', 'backend/middleware/upload.js', 'backend/services/extract.service.js', 'backend/services/chunk.service.js', 'project/components/Materials.jsx'],
    manual: ['upload material'],
  },
  {
    name: 'Notes',
    keywords: ['note', 'notes', 'generate'],
    implementation: ['backend/routes/note.routes.js', 'project/components/Study.jsx', 'project/components/Materials.jsx'],
    manual: ['notes generation'],
  },
  {
    name: 'Flashcards',
    keywords: ['flashcard', 'flashcards', 'srs', 'review', 'due'],
    implementation: ['backend/routes/flashcard.routes.js', 'backend/services/srs.service.js', 'project/components/Study.jsx'],
    manual: ['flashcards'],
  },
  {
    name: 'Quizzes',
    keywords: ['quiz', 'quizzes', 'attempt', 'score', 'wrong'],
    implementation: ['backend/routes/quiz.routes.js', 'project/components/Study.jsx'],
    manual: ['quizzes'],
  },
  {
    name: 'Tutor chat',
    keywords: ['tutor', 'session', 'socratic', 'chat'],
    implementation: ['backend/routes/tutor.routes.js', 'project/components/Tutor.jsx'],
    manual: ['tutor chat'],
  },
  {
    name: 'Guided tutor',
    keywords: ['guided', 'tutor', 'plan', 'step', 'mcq'],
    implementation: ['backend/routes/tutor.routes.js', 'backend/utils/prompts.js', 'project/components/Tutor.jsx'],
    manual: ['guided tutor session'],
  },
  {
    name: 'Dashboard/progress',
    keywords: ['dashboard', 'progress', 'mastery', 'streak', 'study_events'],
    implementation: ['backend/routes/dashboard.routes.js', 'project/components/Dashboard.jsx', 'project/components/Other.jsx'],
    manual: ['dashboard update'],
  },
  {
    name: 'Learning map',
    keywords: ['concept_map', 'concept map', 'learning map', 'mastery', 'concepts'],
    implementation: ['backend/routes/dashboard.routes.js', 'backend/services/auth.service.js', 'project/components/Dashboard.jsx', 'project/components/Other.jsx'],
    manual: ['learning map'],
  },
  {
    name: 'Study plan',
    keywords: ['study plan', 'upcoming', 'course', 'goal', 'daily_minutes'],
    implementation: ['backend/routes/dashboard.routes.js', 'backend/services/auth.service.js', 'project/components/Auth.jsx', 'project/components/Dashboard.jsx'],
    manual: ['study plan'],
  },
  {
    name: 'Storyboard/video',
    keywords: ['video', 'storyboard', 'slides', 'tts', 'ffmpeg', 'ffprobe'],
    implementation: ['backend/routes/video.routes.js', 'backend/services/video.service.js', 'backend/services/slides.service.js', 'backend/services/tts.service.js', 'project/components/Materials.jsx'],
    manual: ['storyboard', 'video'],
  },
  {
    name: 'Study rooms/social features',
    keywords: ['room', 'rooms', 'collab', 'social', 'websocket', 'whiteboard'],
    implementation: [],
    manual: ['study room'],
  },
  {
    name: 'OCR',
    keywords: ['ocr', 'tesseract', 'scanned'],
    implementation: ['backend/services/extract.service.js', 'backend/ASSUMPTIONS.md', 'backend/TODO.md'],
    manual: ['ocr'],
  },
  {
    name: 'RAG/grounding',
    keywords: ['rag', 'ground', 'grounding', 'chunk', 'source', 'embedding', 'retrieve'],
    implementation: ['backend/services/rag.service.js', 'backend/utils/prompts.js', 'backend/services/material.service.js'],
    manual: ['rag', 'grounding'],
  },
  {
    name: 'JSON/schema validation',
    keywords: ['json', 'schema', 'zod', 'repair', 'parseJsonSafe'],
    implementation: ['backend/utils/jsonSafe.js', 'backend/routes/quiz.routes.js', 'backend/routes/flashcard.routes.js', 'backend/routes/tutor.routes.js', 'backend/services/video.service.js'],
    manual: ['json repair', 'schema validation'],
  },
  {
    name: 'Security/protected routes',
    keywords: ['security', 'protected', 'requireAuth', 'rateLimit', 'jwt', 'cookie', 'cors', 'multer'],
    implementation: ['backend/middleware/auth.js', 'backend/middleware/rateLimit.js', 'backend/middleware/upload.js', 'backend/server.js'],
    manual: ['protected routes'],
  },
];

function rel(filePath) {
  return path.relative(ROOT, filePath).replace(/\\/g, '/');
}

function abs(relPath) {
  return path.join(ROOT, relPath);
}

function readText(relPath) {
  const file = abs(relPath);
  if (!fs.existsSync(file)) return '';
  return fs.readFileSync(file, 'utf8');
}

function fileExists(relPath) {
  return fs.existsSync(abs(relPath));
}

function escapeMd(value) {
  return String(value == null ? '' : value).replace(/\|/g, '\\|').replace(/\n/g, '<br>');
}

function oneLine(value, limit = 220) {
  const s = String(value || '').replace(/\s+/g, ' ').trim();
  return s.length > limit ? `${s.slice(0, limit - 3)}...` : s;
}

function shouldSkipDir(fullPath) {
  const base = path.basename(fullPath);
  if (SKIP_DIRS.has(base)) return true;
  const r = `${rel(fullPath)}/`;
  return SKIP_REL_PREFIXES.some(prefix => r.startsWith(prefix));
}

function shouldSkipFile(fullPath) {
  const r = rel(fullPath);
  if (GENERATED_REL.has(r)) return true;
  if (r.endsWith('.log') || r.endsWith('.out.log') || r.endsWith('.err.log')) return true;
  return SKIP_REL_PREFIXES.some(prefix => r.startsWith(prefix));
}

function listFiles(dir = ROOT, output = []) {
  if (!fs.existsSync(dir)) return output;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!shouldSkipDir(full)) listFiles(full, output);
      continue;
    }
    if (entry.isFile() && !shouldSkipFile(full)) output.push(rel(full));
  }
  return output.sort();
}

function parseJsonFile(relPath) {
  try {
    return JSON.parse(readText(relPath));
  } catch (error) {
    return null;
  }
}

function readEvidenceSummary() {
  const explicit = EVIDENCE_SUMMARY_PATH && fs.existsSync(EVIDENCE_SUMMARY_PATH) ? EVIDENCE_SUMMARY_PATH : null;
  let selected = explicit;
  if (!selected) {
    const runsDir = path.join(ROOT, 'docs', 'test-evidence', 'runs');
    if (fs.existsSync(runsDir)) {
      const candidates = fs.readdirSync(runsDir)
        .map(name => path.join(runsDir, name, 'results', 'evidence-summary.json'))
        .filter(file => fs.existsSync(file))
        .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
      selected = candidates[0] || null;
    }
  }
  if (!selected) return null;
  try {
    const evidence = JSON.parse(fs.readFileSync(selected, 'utf8'));
    evidence.summaryPath = rel(selected);
    return evidence;
  } catch (error) {
    return { summaryPath: rel(selected), error: error.message };
  }
}

function commandDisplay(command, args) {
  return [command.replace(/\.cmd$/i, ''), ...args.map(arg => (/\s/.test(arg) ? `"${arg}"` : arg))].join(' ');
}

function runCommand(command, args, cwdRel = '.', options = {}) {
  const cwd = abs(cwdRel);
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    shell: process.platform === 'win32' && command === 'npm',
    timeout: options.timeoutMs || 30000,
    maxBuffer: 1024 * 1024 * 8,
  });
  return {
    command: commandDisplay(command, args),
    cwd: cwdRel,
    status: typeof result.status === 'number' ? result.status : null,
    ok: result.status === 0,
    stdout: oneLine(result.stdout, options.limit || 4000),
    stderr: oneLine(result.stderr, options.limit || 2000),
    error: result.error ? result.error.message : null,
  };
}

function probeHealth(timeoutMs = 3000) {
  return new Promise(resolve => {
    const req = http.get('http://localhost:3001/api/health', { timeout: timeoutMs }, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        resolve({
          url: 'http://localhost:3001/api/health',
          reachable: true,
          statusCode: res.statusCode,
          body: oneLine(body, 1000),
        });
      });
    });
    req.on('timeout', () => {
      req.destroy();
      resolve({ url: 'http://localhost:3001/api/health', reachable: false, error: 'timeout' });
    });
    req.on('error', error => {
      resolve({ url: 'http://localhost:3001/api/health', reachable: false, error: error.message || 'connection failed' });
    });
  });
}

function discoverPackageScripts(files) {
  return files
    .filter(file => file.endsWith('package.json'))
    .map(file => {
      const json = parseJsonFile(file) || {};
      return {
        file,
        name: json.name || null,
        scripts: json.scripts || {},
        dependencies: Object.assign({}, json.dependencies || {}, json.devDependencies || {}, json.optionalDependencies || {}),
      };
    });
}

function discoverTestFiles(files) {
  return files.filter(file => {
    const parts = file.toLowerCase().split('/');
    const base = parts[parts.length - 1];
    return /\.(test|spec)\.[cm]?[jt]sx?$/.test(base)
      || parts.includes('__tests__')
      || parts.includes('tests')
      || parts.includes('test')
      || /(^|[-_.])test([-_.]|$)/.test(base)
      || /(^|[-_.])spec([-_.]|$)/.test(base);
  });
}

function countTestsInFile(relPath) {
  const text = readText(relPath);
  const matches = text.match(/\b(it|test)\s*\(|describe\s*\(/g) || [];
  const skipped = text.match(/\b(it|test|describe)\.skip\s*\(/g) || [];
  return { total: matches.length, skipped: skipped.length };
}

function discoverEvalFiles(files) {
  return files.filter(file => {
    if (file === 'scripts/generate-testing-evaluation-report.js') return false;
    const lower = file.toLowerCase();
    return lower.endsWith('.jsonl')
      || /(^|\/)(eval|evaluation|evaluations|judge|judges)(\/|[-_.])/.test(lower)
      || /(^|[-_.])(eval|evaluation|judge)([-_.]|$)/.test(path.basename(lower));
  });
}

function discoverCiFiles(files) {
  return files.filter(file => {
    const lower = file.toLowerCase();
    return lower.startsWith('.github/workflows/')
      || lower.endsWith('.gitlab-ci.yml')
      || lower.endsWith('.gitlab-ci.yaml')
      || lower.endsWith('azure-pipelines.yml')
      || lower.endsWith('circle.yml')
      || lower.endsWith('jenkinsfile');
  });
}

function discoverValidationFiles(files) {
  return files.filter(file => {
    const lower = file.toLowerCase();
    if (lower.endsWith('package-lock.json')) return false;
    return /validate|validation|license|licence|source|sources|curated/.test(lower)
      && /\.(js|mjs|cjs|json|md|txt|yml|yaml)$/i.test(file);
  });
}

function analyzeJsonl(relPath) {
  const raw = readText(relPath);
  const lines = raw.split(/\r?\n/).filter(line => line.trim());
  let valid = 0;
  let invalid = 0;
  const scores = [];
  for (const line of lines) {
    try {
      const obj = JSON.parse(line);
      valid += 1;
      for (const key of ['score', 'rating', 'grade']) {
        if (typeof obj[key] === 'number') scores.push(obj[key]);
      }
    } catch (_) {
      invalid += 1;
    }
  }
  const averageScore = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
  return {
    file: relPath,
    records: lines.length,
    validRecords: valid,
    invalidRecords: invalid,
    jsonValidityRate: lines.length ? valid / lines.length : null,
    averageScore,
    scoringMethod: scores.length ? 'Numeric score/rating/grade fields found in JSONL records.' : 'No numeric score field found.',
  };
}

function extractDocxText(filePath) {
  const buf = fs.readFileSync(filePath);
  let offset = 0;
  const chunks = [];
  while (offset + 30 < buf.length) {
    const sig = buf.readUInt32LE(offset);
    if (sig !== 0x04034b50) {
      offset += 1;
      continue;
    }
    const method = buf.readUInt16LE(offset + 8);
    const compressedSize = buf.readUInt32LE(offset + 18);
    const uncompressedSize = buf.readUInt32LE(offset + 22);
    const nameLen = buf.readUInt16LE(offset + 26);
    const extraLen = buf.readUInt16LE(offset + 28);
    const name = buf.slice(offset + 30, offset + 30 + nameLen).toString('utf8');
    const dataStart = offset + 30 + nameLen + extraLen;
    const dataEnd = dataStart + compressedSize;
    if (name === 'word/document.xml' && compressedSize > 0 && uncompressedSize > 0) {
      const compressed = buf.slice(dataStart, dataEnd);
      let xml = '';
      if (method === 0) xml = compressed.toString('utf8');
      if (method === 8) xml = zlib.inflateRawSync(compressed).toString('utf8');
      const text = xml
        .replace(/<\/w:p>/g, '\n')
        .replace(/<w:tab\/>/g, '\t')
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
      chunks.push(text);
    }
    offset = Math.max(dataEnd, offset + 30 + nameLen + extraLen);
  }
  return chunks.join('\n').trim();
}

function analyzeSourceDocument(sourceDoc) {
  if (!sourceDoc) {
    return {
      provided: false,
      status: 'not provided',
      note: 'Word document sections 4.21 to 4.27 were not available to this script.',
      documentedItems: [],
    };
  }
  if (!fs.existsSync(sourceDoc)) {
    return {
      provided: true,
      path: sourceDoc,
      status: 'not found',
      note: 'The requested source document path does not exist.',
      documentedItems: [],
    };
  }
  const ext = path.extname(sourceDoc).toLowerCase();
  let text = '';
  try {
    if (ext === '.txt' || ext === '.md') text = fs.readFileSync(sourceDoc, 'utf8');
    else if (ext === '.docx') text = extractDocxText(sourceDoc);
    else {
      return {
        provided: true,
        path: sourceDoc,
        status: 'unsupported extension',
        note: 'Supported source document extensions are .txt, .md, and .docx.',
        documentedItems: [],
      };
    }
  } catch (error) {
    return {
      provided: true,
      path: sourceDoc,
      status: 'parse failed',
      note: error.message,
      documentedItems: [],
    };
  }
  const keywords = /(test|testing|evaluation|eval|score|passed|failed|manual|workflow|screenshot|jsonl|judge|validation|coverage)/i;
  const documentedItems = text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => keywords.test(line))
    .slice(0, 80);
  return {
    provided: true,
    path: rel(sourceDoc),
    status: text ? 'parsed' : 'empty',
    textLength: text.length,
    documentedItems,
  };
}

function parseEnvExample() {
  const text = readText('backend/.env.example');
  return text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#') && line.includes('='))
    .map(line => line.split('=')[0]);
}

function localAssetCheck() {
  const htmlRel = 'project/Noesis.html';
  const html = readText(htmlRel);
  const refs = [];
  const refRegex = /\b(?:src|href)="([^"]+)"/g;
  let match;
  while ((match = refRegex.exec(html))) {
    const value = match[1];
    if (/^(https?:)?\/\//i.test(value) || value.startsWith('#')) continue;
    refs.push(value);
  }
  const missing = refs.filter(value => !fs.existsSync(path.join(ROOT, 'project', value)));
  return {
    command: 'static check project/Noesis.html local asset references',
    ok: missing.length === 0,
    html: htmlRel,
    checkedReferences: refs,
    missingReferences: missing,
    note: 'External CDN scripts/fonts are intentionally not fetched by this local check.',
  };
}

function findRelatedFiles(files, keywords) {
  return files.filter(file => {
    const lower = file.toLowerCase();
    if (keywords.some(k => lower.includes(k.toLowerCase().replace(/\s+/g, '_')) || lower.includes(k.toLowerCase()))) return true;
    if (!/\.(js|jsx|md|txt|json|jsonl|sql)$/i.test(file)) return false;
    const text = readText(file).toLowerCase();
    return keywords.some(k => text.includes(k.toLowerCase()));
  });
}

function featureCoverage(features, files, testFiles, evalFiles, docsText) {
  return features.map(feature => {
    const implementationEvidence = feature.implementation.filter(fileExists);
    const relatedTests = findRelatedFiles(testFiles, feature.keywords);
    const relatedEvaluations = findRelatedFiles(evalFiles, feature.keywords);
    const docMentioned = feature.manual.some(item => docsText.toLowerCase().includes(item.toLowerCase()))
      || feature.keywords.some(item => docsText.toLowerCase().includes(item.toLowerCase()));
    const coverage = relatedTests.length
      ? 'partially covered'
      : 'not covered';
    const result = relatedTests.length
      ? 'tested but not documented unless source document confirms it'
      : 'not verified from repository evidence';
    const whatTested = relatedTests.length
      ? 'Automated test files were discovered for this feature.'
      : 'No automated test evidence was discovered. Implementation files do not count as tests.';
    return {
      feature: feature.name,
      whatTested,
      howTested: relatedTests.length ? 'Repository test files matching feature keywords.' : 'No automated command or test file found.',
      relatedTestFiles: relatedTests,
      relatedEvaluationFiles: relatedEvaluations,
      implementationEvidence,
      documentedOrManualEvidence: docMentioned,
      result,
      coverage,
    };
  });
}

function docsEvidence(files) {
  const candidates = [
    'README.md',
    'CLAUDE.md',
    'codex-review-report.md',
    'backend/README.md',
    'backend/ASSUMPTIONS.md',
    'backend/TODO.md',
    'backend/codex-review.md',
  ].filter(fileExists);
  return candidates.map(file => {
    const text = readText(file);
    const lines = text.split(/\r?\n/);
    const evidenceLines = lines
      .map((line, index) => ({ line: index + 1, text: line.trim() }))
      .filter(item => /(test|testing|evaluation|eval|smoke|manual|workflow|coverage|ocr|json|validation|review)/i.test(item.text))
      .slice(0, 12);
    return { file, evidenceLines };
  });
}

function dependencySummary(packages) {
  const deps = {};
  for (const pkg of packages) Object.assign(deps, pkg.dependencies || {});
  const installedTestRunners = TEST_RUNNERS.filter(name => deps[name]);
  return {
    installedTestRunners,
    dependencyNames: Object.keys(deps).sort(),
  };
}

function scriptCommands(packages) {
  const rows = [];
  for (const pkg of packages) {
    for (const [name, value] of Object.entries(pkg.scripts || {})) {
      rows.push({
        package: pkg.file,
        script: name,
        command: `cd ${path.dirname(pkg.file)} && npm run ${name}`,
        definition: value,
        category: /(test|spec|eval|coverage|judge|validate|lint|build)/i.test(name + ' ' + value) ? 'test/evaluation candidate' : 'operational',
      });
    }
  }
  return rows;
}

function nodeCheckFiles(files) {
  return files.filter(file => {
    if (!file.endsWith('.js')) return false;
    return file.startsWith('backend/')
      || file === 'project/api.js'
      || file === 'scripts/generate-testing-evaluation-report.js';
  });
}

function summarizeNodeChecks(checks) {
  const failed = checks.filter(check => !check.ok);
  return {
    command: 'node --check <backend JS files, project/api.js, scripts/generate-testing-evaluation-report.js>',
    files: checks.length,
    passed: checks.length - failed.length,
    failed: failed.length,
    failures: failed.map(check => ({
      file: check.file,
      stderr: check.result.stderr || check.result.error,
    })),
  };
}

function testCountSummary(testFiles) {
  const rows = testFiles.map(file => ({ file, counts: countTestsInFile(file) }));
  const total = rows.reduce((sum, row) => sum + row.counts.total, 0);
  const skipped = rows.reduce((sum, row) => sum + row.counts.skipped, 0);
  return { files: testFiles.length, total, skipped, rows };
}

function markdownTable(headers, rows) {
  const head = `| ${headers.map(escapeMd).join(' | ')} |`;
  const sep = `| ${headers.map(() => '---').join(' | ')} |`;
  const body = rows.map(row => `| ${row.map(escapeMd).join(' | ')} |`);
  return [head, sep, ...body].join('\n');
}

function bulletList(items, emptyText = 'None found.') {
  if (!items || !items.length) return `- ${emptyText}`;
  return items.map(item => `- ${item}`).join('\n');
}

function percent(value) {
  if (value == null || Number.isNaN(value)) return 'N/A';
  return `${Math.round(value * 1000) / 10}%`;
}

function calculateScore({ testSummary, jsonlAnalyses, nodeChecksSummary, assetCheck }) {
  const automated = testSummary.total > 0 ? 40 : 0;
  const aiValidity = jsonlAnalyses.length
    ? jsonlAnalyses.reduce((sum, item) => sum + (item.jsonValidityRate || 0), 0) / jsonlAnalyses.length
    : 0;
  const ai = aiValidity * 25;
  const manual = 0;
  const staticChecks = [
    nodeChecksSummary.failed === 0,
    assetCheck.ok,
  ];
  const build = (staticChecks.filter(Boolean).length / staticChecks.length) * 15;
  return {
    weights: {
      automatedTests: 40,
      aiEvaluation: 25,
      manualWorkflowTesting: 20,
      buildEnvironmentValidation: 15,
    },
    components: {
      automatedTests: {
        score: automated,
        reason: testSummary.total > 0 ? 'Automated tests were discovered.' : 'No automated test files or test scripts were found.',
      },
      aiEvaluation: {
        score: Math.round(ai * 10) / 10,
        reason: jsonlAnalyses.length ? 'JSONL evaluation files were discovered and JSON validity was measured.' : 'No JSONL AI evaluation datasets were found.',
      },
      manualWorkflowTesting: {
        score: manual,
        reason: 'Manual workflows are described in documentation/review notes but no screenshots or logs are present in repository evidence.',
      },
      buildEnvironmentValidation: {
        score: Math.round(build * 10) / 10,
        reason: 'Static Node syntax checks and frontend local asset checks were executed.',
      },
    },
    total: Math.round((automated + ai + manual + build) * 10) / 10,
  };
}

function evidenceStatus(value) {
  if (value === true || value === 'passed') return 'passed';
  if (value === 'environment-dependent') return 'environment-dependent';
  if (value === 'skipped') return 'skipped';
  return value ? String(value) : 'failed';
}

function evidenceScreenshotRows(evidence) {
  if (!evidence || !Array.isArray(evidence.screenshots) || !evidence.screenshots.length) return [];
  return evidence.screenshots.map(item => [
    item.title,
    item.ok ? `![${item.title}](${item.screenshotPath})` : 'not captured',
    item.htmlPath || '',
    item.ok ? 'captured' : (item.error || 'failed'),
  ]);
}

function evidenceClaimRows(evidence) {
  if (!evidence || !evidence.wordComparison) return [];
  const actuals = evidence.wordComparison.actuals || {};
  return (evidence.wordComparison.claims || []).map(item => [
    item.claim,
    item.expected,
    actuals[item.actualKey] == null ? 'not found' : actuals[item.actualKey],
    item.supported ? 'supported' : 'not supported by current repo evidence',
  ]);
}

function evidenceCommandRows(evidence) {
  if (!evidence || !Array.isArray(evidence.commands)) return [];
  return evidence.commands.map(cmd => [
    cmd.label || cmd.id,
    cmd.command,
    cmd.cwd || '.',
    cmd.ok ? 'passed' : 'failed',
    cmd.durationMs,
    cmd.logPath,
  ]);
}

function providerEvalEntries(evidence) {
  if (!evidence) return [];
  if (evidence.providerEvals && typeof evidence.providerEvals === 'object') {
    return Object.entries(evidence.providerEvals);
  }
  return evidence.evals ? [['ollama', evidence.evals]] : [];
}

function providerScoreSummary(evidence) {
  const entries = providerEvalEntries(evidence)
    .map(([provider, item]) => {
      const result = item && item.result;
      if (!result) return `${provider}: no parsed result`;
      return `${provider}: ${result.averageScore}/3 (${result.passed}/${result.records} passed, model ${result.model || 'unknown'})`;
    });
  return entries.length ? entries.join('; ') : 'N/A';
}

function buildReport(data) {
  const evidence = data.evidenceRun;
  const commandsRows = [
    ...data.executedCommands.map(cmd => [
      cmd.command,
      cmd.cwd,
      cmd.ok ? 'passed' : 'failed',
      cmd.stdout || cmd.stderr || cmd.error || '',
    ]),
    [data.assetCheck.command, '.', data.assetCheck.ok ? 'passed' : 'failed', data.assetCheck.missingReferences.length ? `Missing: ${data.assetCheck.missingReferences.join(', ')}` : data.assetCheck.note],
    ['passive GET http://localhost:3001/api/health', '.', data.health.reachable ? 'reachable' : 'not reachable', data.health.body || data.health.error || ''],
  ];
  if (evidence) {
    for (const row of evidenceCommandRows(evidence)) {
      commandsRows.push([row[1], row[2], row[3], `${row[0]} (${row[4]} ms, log: ${row[5]})`]);
    }
  }

  const scriptRows = data.availableScripts.length
    ? data.availableScripts.map(row => [row.package, row.script, row.definition, row.category])
    : [['not found', 'not found', 'No package scripts were discovered.', 'not verified from repository evidence']];
  const providerEvals = providerEvalEntries(evidence);
  const providerResults = providerEvals.filter(([, item]) => item && item.result);
  const providerFiles = providerResults.length ? providerResults.map(([, item]) => item.result.files || 0).join('<br>') : data.jsonlAnalyses.length;
  const providerRecords = providerResults.length ? providerResults.map(([, item]) => item.result.records || 0).join('<br>') : data.jsonlAnalyses.reduce((sum, item) => sum + item.records, 0);
  const providerPassed = providerResults.length ? providerResults.map(([, item]) => item.result.passed || 0).join('<br>') : 'N/A';
  const providerFailed = providerResults.length ? providerResults.map(([, item]) => item.result.failed || 0).join('<br>') : 'N/A';
  const providerPassRates = providerResults.length ? providerResults.map(([, item]) => item.result.records ? percent(item.result.passed / item.result.records) : 'N/A').join('<br>') : (data.jsonlAnalyses.length ? percent(data.jsonValidityRate) : 'N/A');
  const providerCommands = providerEvals.length ? providerEvals.map(([provider, item]) => `${provider}: ${item.command.command}`).join('<br>') : (data.jsonlAnalyses.length ? 'JSONL parse scan' : 'No JSONL evaluation command found');
  const providerLogSummary = providerEvals.length ? providerEvals.map(([provider, item]) => {
    const result = item.result;
    return `${provider} average ${result ? result.averageScore : 'N/A'}/3; log: ${item.command.logPath}`;
  }).join('<br>') : (data.jsonlAnalyses.length ? 'JSON validity measured.' : 'not verified from repository evidence');

  const autoRows = [
    [
      'Backend automated tests',
      evidence && evidence.backendTests ? evidence.backendTests.command.command : (data.testCommands.length ? data.testCommands.map(c => c.command).join('<br>') : 'No test command found'),
      evidence && evidence.backendTests ? (evidence.backendTests.summary.testFiles || 'N/A') : data.testSummary.files,
      evidence && evidence.backendTests ? evidence.backendTests.summary.tests : data.testSummary.total,
      evidence && evidence.backendTests ? evidence.backendTests.summary.pass : 'N/A',
      evidence && evidence.backendTests ? evidence.backendTests.summary.fail : 'N/A',
      evidence && evidence.backendTests ? evidence.backendTests.summary.skipped : data.testSummary.skipped,
      evidence && evidence.backendTests && evidence.backendTests.summary.tests ? percent(evidence.backendTests.summary.pass / evidence.backendTests.summary.tests) : 'N/A',
      evidence && evidence.backendTests ? `log: ${evidence.backendTests.command.logPath}` : (data.testSummary.files ? 'Test files discovered but not executed by this generator.' : 'not verified from repository evidence'),
    ],
    [
      'Frontend build or bundle verification',
      evidence && evidence.frontend ? evidence.frontend.command.command : data.assetCheck.command,
      evidence && evidence.frontend && evidence.frontend.result ? evidence.frontend.result.sourceFilesBuilt : 1,
      evidence && evidence.frontend && evidence.frontend.result ? evidence.frontend.result.checkedReferences + evidence.frontend.result.markerCount : 1,
      evidence && evidence.frontend && evidence.frontend.result ? (evidence.frontend.result.ok ? evidence.frontend.result.checkedReferences + evidence.frontend.result.markerCount : 'partial') : (data.assetCheck.ok ? 1 : 0),
      evidence && evidence.frontend && evidence.frontend.result ? (evidence.frontend.result.missingReferences.length + evidence.frontend.result.markerFailures.length) : (data.assetCheck.ok ? 0 : 1),
      0,
      evidence && evidence.frontend && evidence.frontend.result ? (evidence.frontend.result.ok ? '100%' : 'partial') : (data.assetCheck.ok ? '100%' : '0%'),
      evidence && evidence.frontend ? `log: ${evidence.frontend.command.logPath}` : data.assetCheck.note,
    ],
    [
      'Static JavaScript syntax checks',
      data.nodeChecks.command,
      data.nodeChecks.files,
      data.nodeChecks.files,
      data.nodeChecks.passed,
      data.nodeChecks.failed,
      0,
      data.nodeChecks.files ? percent(data.nodeChecks.passed / data.nodeChecks.files) : 'N/A',
      data.nodeChecks.failed ? `Failures: ${data.nodeChecks.failures.map(f => f.file).join(', ')}` : 'All checked files parsed successfully.',
    ],
    [
      'AI evaluation datasets',
      providerCommands,
      providerFiles,
      providerRecords,
      providerPassed,
      providerFailed,
      0,
      providerPassRates,
      providerLogSummary,
    ],
  ];
  if (evidence && evidence.apiSmoke && evidence.apiSmoke.result) {
    autoRows.push([
      'Manual/API workflow smoke evidence',
      evidence.apiSmoke.command.command,
      1,
      evidence.apiSmoke.result.steps ? evidence.apiSmoke.result.steps.length : 0,
      evidence.apiSmoke.result.passed,
      evidence.apiSmoke.result.failed,
      evidence.apiSmoke.result.skipped,
      evidence.apiSmoke.result.steps && evidence.apiSmoke.result.steps.length ? percent((evidence.apiSmoke.result.passed + evidence.apiSmoke.result.environmentDependent * 0.75) / evidence.apiSmoke.result.steps.length) : 'N/A',
      `environment-dependent: ${evidence.apiSmoke.result.environmentDependent}; log: ${evidence.apiSmoke.command.logPath}`,
    ]);
  }

  const featureRows = data.features.map(item => [
    item.feature,
    item.whatTested,
    item.howTested,
    item.relatedTestFiles.length ? item.relatedTestFiles.join('<br>') : 'No test files found',
    item.result,
    item.coverage,
  ]);

  const evalRows = providerResults.length
    ? providerResults.flatMap(([provider, evalItem]) => evalItem.result.fileResults.map(item => [
      provider,
      item.file,
      item.feature,
      item.records,
      'Live provider keyword/JSON/relevance scoring, 0-3 scale',
      item.averageScore,
      percent(item.jsonlValidityRate),
      evalItem.result.strongestArea || 'N/A',
      evalItem.result.weakestArea || 'N/A',
      item.failed ? `${item.failed} case(s) below threshold or failed live generation.` : 'Starter dataset; not a complete academic benchmark.',
    ]))
    : data.jsonlAnalyses.length
    ? data.jsonlAnalyses.map(item => [
      'repository',
      item.file,
      inferFeatureFromPath(item.file),
      item.records,
      item.scoringMethod,
      item.averageScore == null ? 'N/A' : String(Math.round(item.averageScore * 1000) / 1000),
      percent(item.jsonValidityRate),
      'not verified from repository evidence',
      'not verified from repository evidence',
      'Dataset limitations require reviewer assessment.',
    ])
    : [['No JSONL files found', 'N/A', 'N/A', 0, 'N/A', 'N/A', 'N/A', 'not verified from repository evidence', 'not verified from repository evidence', 'No AI evaluation dataset exists in repository evidence.']];

  const documentedRows = data.sourceDocument.documentedItems.length
    ? data.sourceDocument.documentedItems.map((item, index) => [index + 1, item])
    : [['N/A', data.sourceDocument.note || 'No source document evidence was available.']];

  const missingDocRows = data.testsFoundButNotDocumented.length
    ? data.testsFoundButNotDocumented.map(item => [item.kind, item.path, item.reason])
    : [['N/A', 'N/A', 'No automated tests, JSONL evaluations, CI workflows, or validation scripts were found that could be marked as tested but not documented.']];

  const evidenceRows = data.docsEvidence.flatMap(doc => (
    doc.evidenceLines.length
      ? doc.evidenceLines.map(item => [doc.file, item.line, item.text])
      : [[doc.file, '', 'No explicit testing/evaluation evidence lines found.']]
  ));

  const scoreRows = evidence && evidence.score
    ? [
      ['automatedTests', 40, evidence.score.automatedTests, 'Computed from backend Vitest/Node test pass rate.'],
      ['aiEvaluation', 25, evidence.score.aiEvaluation, 'Computed from live Ollama and Groq JSONL average scores.'],
      ['manualWorkflowTesting', 20, evidence.score.manualWorkflowTesting, 'Computed from API smoke workflow steps; environment-dependent steps count partially.'],
      ['buildEnvironmentValidation', 15, evidence.score.buildEnvironmentValidation, 'Computed from frontend, knowledge, and license validation commands.'],
    ]
    : Object.entries(data.score.components).map(([key, value]) => [
      key,
      data.score.weights[key],
      value.score,
      value.reason,
    ]);

  const evidenceIntro = evidence ? `
## Evidence Run

- Run directory: \`${evidence.runDir}\`
- Evidence summary: \`${evidence.summaryPath}\`
- Screenshot index: \`docs/testing-evaluation-screenshot-index.md\`
- Live Ollama: \`${evidence.environment.ollamaBaseUrl}\`
- Generation model: \`${evidence.environment.generationModel}\`
- Embedding model: \`${evidence.environment.embeddingModel}\`
- Live Groq: \`${evidence.environment.groqBaseUrl || 'not recorded'}\`
- Groq model: \`${evidence.environment.groqModel || 'not recorded'}\`
- Groq configured: ${evidence.environment.groqConfigured ? 'yes' : 'no'}
- Provider evaluation scores: ${providerScoreSummary(evidence)}
- Overall evidence score: ${evidence.score ? evidence.score.total : 'N/A'}/100

${markdownTable(['Screenshot', 'Image', 'HTML evidence', 'Status'], evidenceScreenshotRows(evidence))}
` : '';

  const wordComparison = evidence ? `
### Word Document Claim Comparison

${markdownTable(['Word claim', 'Expected/documented', 'Current evidence', 'Status'], evidenceClaimRows(evidence))}
` : '';

  const automatedPassRateLine = evidence && evidence.backendTests && evidence.backendTests.summary.tests
    ? percent(evidence.backendTests.summary.pass / evidence.backendTests.summary.tests)
    : (data.testSummary.total ? 'not executed by this generator' : 'N/A because no automated tests were found');

  const aiFrameworkNote = evidence
    ? 'The evidence run executed the JSONL benchmark runner for Ollama and Groq, plus the seed-corpus validator and license/source reporter. Source grounding is still scored heuristically; there is no independent judge that verifies citations against retrieved chunks.'
    : 'No source-grounding judge, curated knowledge validation command, license/source validation command, or AI benchmark runner was discovered unless listed above.';

  const manualWorkflowText = evidence && evidence.apiSmoke && evidence.apiSmoke.result
    ? [
      'The evidence suite executed a live API smoke workflow against an isolated backend, temporary SQLite database, temporary upload directory, live Ollama, and silence TTS for video generation. The screenshots linked in this report are generated from reproducible HTML evidence pages, while browser UI and Network-tab screenshots remain recommended future manual evidence.',
      '',
      bulletList((evidence.apiSmoke.result.steps || []).map(step => `${step.title}: ${step.status}${step.error ? ` (${step.error})` : ''}`)),
    ].join('\n')
    : `Repository documentation and review notes describe the intended smoke workflow, but no committed screenshots, terminal logs, or manual test records were found. The following workflows should be treated as documented/manual or needing stronger evidence:

- Registration and onboarding: documented/manual or needs stronger evidence.
- Upload material: documented/manual or needs stronger evidence.
- Notes generation: documented/manual or needs stronger evidence.
- Flashcards: documented/manual or needs stronger evidence.
- Quizzes: documented/manual or needs stronger evidence.
- Tutor chat: documented/manual or needs stronger evidence.
- Guided tutor session: documented/manual or needs stronger evidence.
- Dashboard update: documented/manual or needs stronger evidence.
- Study plan: documented/manual or needs stronger evidence.
- Learning map: documented/manual or needs stronger evidence.
- Storyboard/video: documented/manual or needs stronger evidence.
- Study room: not verified from repository evidence; TODO indicates collaboration rooms are future work.`;

  const licenseLogPath = evidence && evidence.licenses && evidence.licenses.command
    ? evidence.licenses.command.logPath
    : 'the license validation log';
  const claimsNeedingEvidence = evidence
    ? bulletList([
      `The Word document's historical claim of 56 test files and 457 tests is compared against the generated evidence, which currently verifies ${evidence.backendTests.summary.tests} backend tests across ${evidence.backendTests.summary.testFiles || 'N/A'} test files.`,
      'OCR, study rooms/social features, and caption/Remotion-specific tests remain unsupported by current repository evidence.',
      'AI grounding is evaluated through keyword, JSON-shape, and relevance heuristics; no independent source-grounding judge is present.',
      `License/source validation now exists, but the latest run reported warnings or unknown license metadata; review \`${licenseLogPath}\`.`,
      'Browser UI screenshots and Network-tab mechanism screenshots are not automated yet; the captured PNGs are reproducible evidence-page screenshots.',
      'Load, stress, cross-browser, accessibility, penetration, and real-student usability evidence were not found.',
    ])
    : `- Manual smoke flow for signup, upload, notes, flashcards, quiz, tutor, dashboard, and video generation needs screenshots or logs.
- OCR is documented as future work or unsupported for scanned PDFs; no OCR test evidence was found.
- Study rooms/social features are documented as future work; no realtime backend or tests were found.
- AI quality, grounding, JSON repair, and schema validation are implemented in code, but no JSONL benchmark or source-grounding judge evidence was found.
- License/source validation is not supported by a discovered validation command; package-lock license metadata alone is not a validation test.
- Security/protected route behavior is implemented through middleware and route usage, but no automated API/security test suite was found.`;

  const limitationsText = evidence
    ? bulletList([
      'AI evaluation scores depend on the live Ollama/Groq models, local runtime performance, API availability, and generation variance.',
      'The evidence screenshots are rendered from generated HTML evidence pages; they do not replace live frontend UI screenshots or Network-tab captures.',
      'Video evidence used `TTS_ENGINE=silence`; real TTS quality remains environment-dependent.',
      'OCR for scanned PDFs, study rooms/social features, and caption/Remotion-specific coverage are still not implemented or not evidenced in the current repo.',
      'License/source validation reports package metadata warnings that need human review.',
      'No load, stress, cross-browser, accessibility, penetration, or real-student usability-study evidence was found.',
    ])
    : `- No automated test files or test command were found.
- No JSONL AI evaluation dataset was found.
- Local backend health depends on whether the server and Ollama are running; this generator does not start services.
- Video rendering depends on ffmpeg, ffprobe, TTS configuration, and local AI availability.
- OCR for scanned PDFs is not implemented according to repository assumptions/TODO evidence.
- No load, stress, cross-browser, accessibility, or penetration testing evidence was found.
- No real student survey or usability-study dataset was found.`;

  const recommendationsText = evidence
    ? bulletList([
      'Expand the Node test suite if the dissertation must support the historical 56-file/457-test claim.',
      'Add Playwright browser tests that capture real frontend states and Network-tab/API mechanism evidence.',
      'Add an independent source-grounding judge that checks generated answers against retrieved chunks.',
      'Resolve license/source warnings and document acceptable third-party package licenses.',
      'Add or remove claims for OCR, study rooms, captions, and Remotion depending on the final supported product scope.',
      'Add accessibility, cross-browser, security, load, and usability testing before production use.',
    ])
    : `- Add a Vitest + Supertest API smoke suite for auth, protected routes, upload validation, notes, flashcards, quizzes, tutor, dashboard, jobs, and videos.
- Add JSON shape snapshot tests for frontend-dependent API responses.
- Add JSONL AI evaluation datasets for notes, flashcards, quizzes, tutor, RAG grounding, and video scripts.
- Add a source-grounding judge that checks citation use against retrieved chunks.
- Add curated knowledge validation for the seeded OOP and Data Structures corpus.
- Add license/source validation for bundled media dependencies and third-party packages.
- Add Playwright smoke tests for the browser workflows and screenshots.
- Add accessibility, cross-browser, security, and load testing before production use.`;

  const finalConclusion = evidence
    ? 'The current Noesis repository now includes a reproducible testing and evaluation evidence suite for the main graduation-project workflows: backend unit checks, live API smoke workflows, live Ollama and Groq JSONL evaluations, frontend static verification, knowledge validation, license/source reporting, Word-claim comparison, and screenshot evidence. It supports the implemented core product much more strongly than before, while still clearly separating new verified evidence from unsupported historical claims in the Word document.'
    : 'The current Noesis repository demonstrates broad implementation coverage for the main graduation-project workflows, including learning material ingestion, AI-assisted study artifact generation, tutor guidance, progress analytics, and local video generation. The testing evidence, however, is not yet strong enough to claim comprehensive verification. The next academic milestone should be to convert the documented smoke workflows into reproducible automated tests, expand AI evaluation datasets, and preserve screenshot/log evidence for manual mechanisms that depend on local services.';

  return `# Testing and Evaluation Report

Generated on ${new Date().toISOString()} from repository evidence.

${evidenceIntro}

## 1. Executive Summary

Noesis has a functioning implementation surface for authentication, material ingestion, notes, flashcards, quizzes, tutor sessions, dashboard analytics, RAG, JSON repair/schema validation, and video generation. ${evidence ? 'This report includes a newly generated runnable evidence suite with backend tests, live API smoke workflows, live Ollama and Groq JSONL evaluations, static frontend verification, seed-corpus validation, license/source validation, and screenshots.' : 'However, repository evidence does not currently include automated test files, a test runner dependency, a test script, CI configuration, JSONL AI evaluation datasets, curated-knowledge validation scripts, license/source validation scripts, or committed manual screenshot evidence.'}

${evidence ? 'The Word document is treated as a historical baseline. Claims that are not represented by current repo files or the new evidence run are explicitly marked as unsupported rather than copied as facts.' : 'The available verification is therefore limited to static discovery, package script inspection, JavaScript syntax checks, frontend local asset reference checks, and documentation review. All feature claims without test files or reproducible logs are marked as "not verified from repository evidence".'}

## 2. Test Environment

- Operating system: ${os.type()} ${os.release()} (${os.platform()} ${os.arch()})
- Node.js: ${data.nodeVersion.stdout || data.nodeVersion.stderr || 'not verified'}
- npm: ${data.npmVersion.stdout || data.npmVersion.stderr || 'not verified'}
- Backend: Express + SQLite + Ollama, located in \`backend/\`.
- Frontend: static React/Babel app, located in \`project/\`; no npm build script is present.
- Database/storage: SQLite and upload directories are runtime-generated under \`backend/data/\` and \`backend/uploads/\`; these are excluded from report discovery.
- AI/evaluation files: ${data.jsonlAnalyses.length ? `${data.jsonlAnalyses.length} JSONL file(s) found.` : 'No JSONL evaluation datasets found.'}
- Local backend health at report-generation moment: ${data.health.reachable ? `reachable, HTTP ${data.health.statusCode}` : `not reachable (${data.health.error || 'no response'})`}.
- Environment variables discovered from \`backend/.env.example\`: ${data.envKeys.length ? data.envKeys.map(k => `\`${k}\``).join(', ') : 'none found'}.
- Installed test runners: ${data.dependencies.installedTestRunners.length ? data.dependencies.installedTestRunners.map(k => `\`${k}\``).join(', ') : 'none found'}.

## 3. Commands Used

The generator executed only safe, non-mutating discovery and verification checks.

${markdownTable(['Command/check', 'Working directory', 'Status', 'Evidence'], commandsRows)}

Available package scripts:

${markdownTable(['Package', 'Script', 'Definition', 'Category'], scriptRows)}

## 4. Automated Testing Results

${markdownTable(['Test category', 'Command', 'Number of test files', 'Number of tests/checks', 'Passed', 'Failed', 'Skipped', 'Pass rate', 'Notes/evidence'], autoRows)}

Automated test pass rate: ${automatedPassRateLine}.

## 5. Functional Coverage

${markdownTable(['Feature', 'What was tested', 'How it was tested', 'Related test files', 'Result', 'Coverage'], featureRows)}

Implementation evidence by feature is present in the JSON summary. Implementation files are useful traceability evidence, but they are not counted as tests.

## 6. AI Evaluation Framework

${markdownTable(['Provider', 'Evaluation file', 'Feature', 'Records', 'Scoring method', 'Average score', 'JSON validity rate', 'Strongest area', 'Weakest area', 'Limitations'], evalRows)}

${aiFrameworkNote}

## 7. Manual Workflow Testing

${manualWorkflowText}

Documentation evidence scanned:

${markdownTable(['File', 'Line', 'Evidence'], evidenceRows)}

## 8. Tests Already Mentioned in the Document

${data.sourceDocument.provided ? `Source document status: ${data.sourceDocument.status}.` : 'The Word document sections 4.21 to 4.27 were not available to this script, so this section cannot compare against the original Word text.'}

${markdownTable(['Item', 'Documented testing/evaluation line'], documentedRows)}

${wordComparison}

## 9. Tests Found in the Codebase but Not Mentioned in the Document

${markdownTable(['Kind', 'Path/command', 'Why it should be added'], missingDocRows)}

## 10. Documented Claims That Need More Evidence

${claimsNeedingEvidence}

## 11. Scoring and Evaluation Summary

${markdownTable(['Component', 'Weight', 'Score awarded', 'Reason'], scoreRows)}

- Overall testing confidence score: ${evidence && evidence.score ? evidence.score.total : data.score.total}/100.
- Automated test pass rate: ${evidence && evidence.backendTests && evidence.backendTests.summary.tests ? percent(evidence.backendTests.summary.pass / evidence.backendTests.summary.tests) : (data.testSummary.total ? 'not executed by this generator' : 'N/A, no automated tests found')}.
- Frontend build status: ${evidence && evidence.frontend && evidence.frontend.result ? (evidence.frontend.result.ok ? 'verified' : 'failed or partial') : `build-less static frontend; local asset reference check ${data.assetCheck.ok ? 'passed' : 'failed'}`}.
- Evaluation dataset count: ${providerResults.length ? providerResults.map(([provider, item]) => `${provider}: ${item.result.files}`).join('; ') : data.jsonlAnalyses.length}.
- AI average score: ${evidence ? providerScoreSummary(evidence) : (data.aiAverageScore == null ? 'N/A' : data.aiAverageScore)}.
- JSON validity rate: ${providerResults.length ? providerResults.map(([provider, item]) => `${provider}: ${percent(item.result.jsonValidityRate)}`).join('; ') : (data.jsonValidityRate == null ? 'N/A' : percent(data.jsonValidityRate))}.
- Coverage summary: ${evidence && evidence.apiSmoke && evidence.apiSmoke.result ? `${evidence.apiSmoke.result.passed} workflow steps passed, ${evidence.apiSmoke.result.environmentDependent} environment-dependent, ${evidence.apiSmoke.result.failed} failed.` : `${data.features.filter(f => f.coverage !== 'not covered').length}/${data.features.length} features have automated test evidence.`}

The score is intentionally conservative. It rewards verified repository artifacts and does not infer passing behavior from implementation files alone.

## 12. Limitations

${limitationsText}

## 13. Recommendations

${recommendationsText}

## 14. Final Conclusion

${finalConclusion}

## Screenshot Evidence Guide

Create \`docs/screenshots/\` when collecting manual evidence. Do not capture secrets from \`.env\`, JWTs, cookies, authorization headers, private files, or personal data.

${bulletList(SCREENSHOTS.map(([name, description]) => `\`${name}\` - ${description}`))}

Recommended mechanism screenshots:

- Browser Network tab showing \`/api/jobs/:id\` polling during upload/video jobs.
- Browser Network tab showing authenticated API calls without exposing token/cookie values.
- Terminal showing backend startup, Ollama availability, and report generation command output.
- UI screenshots after each workflow completes, especially quiz score, dashboard update, and generated video playback.
`;
}

function inferFeatureFromPath(file) {
  const lower = file.toLowerCase();
  const hit = FEATURES.find(feature => feature.keywords.some(keyword => lower.includes(keyword.toLowerCase().replace(/\s+/g, '-')) || lower.includes(keyword.toLowerCase().replace(/\s+/g, '_')) || lower.includes(keyword.toLowerCase())));
  return hit ? hit.name : 'not inferred';
}

async function main() {
  const files = listFiles();
  const packages = discoverPackageScripts(files);
  const availableScripts = scriptCommands(packages);
  const testCommands = availableScripts.filter(row => row.category === 'test/evaluation candidate');
  const testFiles = discoverTestFiles(files);
  const evalFiles = discoverEvalFiles(files);
  const ciFiles = discoverCiFiles(files);
  const validationFiles = discoverValidationFiles(files);
  const jsonlFiles = files.filter(file => file.toLowerCase().endsWith('.jsonl'));
  const jsonlAnalyses = jsonlFiles.map(analyzeJsonl);
  const docs = docsEvidence(files);
  const docsText = docs.map(doc => readText(doc.file)).join('\n');
  const sourceDocument = analyzeSourceDocument(SOURCE_DOC);
  const evidenceRun = readEvidenceSummary();
  const dependencies = dependencySummary(packages);

  const nodeVersion = runCommand('node', ['-v'], '.', { timeoutMs: 10000 });
  const npmVersion = runCommand('npm', ['-v'], '.', { timeoutMs: 10000 });
  const npmRun = fileExists('backend/package.json') ? runCommand('npm', ['run'], 'backend', { timeoutMs: 10000 }) : null;
  const npmLs = fileExists('backend/package.json') ? runCommand('npm', ['ls', '--depth=0'], 'backend', { timeoutMs: 30000, limit: 6000 }) : null;
  const checkFiles = nodeCheckFiles(files);
  const nodeCheckResults = checkFiles.map(file => ({
    file,
    result: runCommand('node', ['--check', file], '.', { timeoutMs: 10000, limit: 1000 }),
  }));
  const nodeChecks = summarizeNodeChecks(nodeCheckResults.map(item => ({
    file: item.file,
    ok: item.result.ok,
    result: item.result,
  })));
  const assetCheck = localAssetCheck();
  const health = await probeHealth();

  const testSummary = testCountSummary(testFiles);
  const features = featureCoverage(FEATURES, files, testFiles, evalFiles, docsText);
  const jsonValidityRate = jsonlAnalyses.length
    ? jsonlAnalyses.reduce((sum, item) => sum + (item.jsonValidityRate || 0), 0) / jsonlAnalyses.length
    : null;
  const scoreValues = jsonlAnalyses.flatMap(item => item.averageScore == null ? [] : [item.averageScore]);
  const aiAverageScore = scoreValues.length ? scoreValues.reduce((a, b) => a + b, 0) / scoreValues.length : null;
  const score = calculateScore({ testSummary, jsonlAnalyses, nodeChecksSummary: nodeChecks, assetCheck });

  const testsFoundButNotDocumented = [];
  for (const file of testFiles) testsFoundButNotDocumented.push({ kind: 'test file', path: file, reason: 'Automated test evidence should be listed in the testing chapter.' });
  for (const file of evalFiles) testsFoundButNotDocumented.push({ kind: 'evaluation file', path: file, reason: 'AI evaluation evidence should be listed in the evaluation framework section.' });
  for (const file of ciFiles) testsFoundButNotDocumented.push({ kind: 'CI workflow', path: file, reason: 'CI verification should be documented as repeatable testing infrastructure.' });
  for (const file of validationFiles) testsFoundButNotDocumented.push({ kind: 'validation/source file', path: file, reason: 'Validation evidence should be documented if it supports testing claims.' });
  for (const cmd of testCommands) testsFoundButNotDocumented.push({ kind: 'test/evaluation command', path: cmd.command, reason: 'Runnable verification commands should be listed in the commands section.' });

  const summary = {
    generatedAt: new Date().toISOString(),
    repositoryRoot: ROOT,
    sourceDocument,
    environment: {
      os: `${os.type()} ${os.release()} (${os.platform()} ${os.arch()})`,
      node: nodeVersion.stdout || nodeVersion.stderr || null,
      npm: npmVersion.stdout || npmVersion.stderr || null,
      envKeys: parseEnvExample(),
      backendHealth: health,
    },
    discovery: {
      totalFilesScanned: files.length,
      packageFiles: packages.map(pkg => pkg.file),
      availableScripts,
      testCommands,
      testFiles,
      evalFiles,
      jsonlFiles,
      ciFiles,
      validationFiles,
      docsEvidence: docs,
      dependencies,
    },
    checks: {
      executedCommands: [nodeVersion, npmVersion, npmRun, npmLs].filter(Boolean),
      nodeChecks,
      nodeCheckFailures: nodeChecks.failures,
      frontendAssetCheck: assetCheck,
    },
    results: {
      automatedTestSummary: testSummary,
      jsonlAnalyses,
      jsonValidityRate,
      aiAverageScore,
      featureCoverage: features,
      score,
    },
    scoring: evidenceRun && evidenceRun.score ? evidenceRun.score : score,
    screenshotChecklist: SCREENSHOTS.map(([file, description]) => ({ file, description })),
    evidenceRun,
  };

  const reportData = {
    ...summary.discovery,
    ...summary.results,
    sourceDocument,
    envKeys: summary.environment.envKeys,
    health,
    dependencies,
    nodeVersion,
    npmVersion,
    executedCommands: summary.checks.executedCommands,
    nodeChecks,
    assetCheck,
    score,
    aiAverageScore,
    testSummary,
    features,
    testsFoundButNotDocumented,
    evidenceRun,
  };

  fs.mkdirSync(DOCS_DIR, { recursive: true });
  fs.writeFileSync(SUMMARY_PATH, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  fs.writeFileSync(REPORT_PATH, buildReport(reportData), 'utf8');

  console.log(`Generated ${rel(REPORT_PATH)}`);
  console.log(`Generated ${rel(SUMMARY_PATH)}`);
  console.log(`Automated test files found: ${testFiles.length}`);
  console.log(`JSONL evaluation files found: ${jsonlFiles.length}`);
  console.log(`Overall testing confidence score: ${score.total}/100`);
}

main().catch(error => {
  console.error(error.stack || error.message || error);
  process.exit(1);
});
