'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const env = require('../config/env');

function existingDirs(values) {
  const seen = new Set();
  const out = [];
  for (const value of values || []) {
    const dir = String(value || '').trim();
    if (!dir || seen.has(dir)) continue;
    try {
      if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) continue;
    } catch (_) {
      continue;
    }
    seen.add(dir);
    out.push(dir);
  }
  return out;
}

function childDirs(parent, matcher, child) {
  try {
    if (!parent || !fs.existsSync(parent)) return [];
    return fs.readdirSync(parent, { withFileTypes: true })
      .filter(entry => entry.isDirectory() && matcher(entry.name))
      .map(entry => child ? path.join(parent, entry.name, child) : path.join(parent, entry.name));
  } catch (_) {
    return [];
  }
}

function ocrToolDirs() {
  const localApp = process.env.LOCALAPPDATA || '';
  const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
  const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  const wingetPackages = path.join(localApp, 'Microsoft', 'WinGet', 'Packages');
  const pythonRoot = path.join(localApp, 'Programs', 'Python');
  const dirs = [
    path.join(programFiles, 'Tesseract-OCR'),
    ...childDirs(pythonRoot, name => /^Python\d+/i.test(name), 'Scripts'),
    ...childDirs(wingetPackages, name => /Poppler/i.test(name), path.join('poppler-25.07.0', 'Library', 'bin')),
    ...childDirs(wingetPackages, name => /Poppler/i.test(name))
      .flatMap(dir => childDirs(dir, name => /^poppler-/i.test(name), path.join('Library', 'bin'))),
    ...childDirs(programFiles, name => /^ImageMagick-/i.test(name)),
    ...childDirs(programFilesX86, name => /^ImageMagick-/i.test(name)),
    path.join(localApp, 'Programs', 'GhostscriptPortable', 'gs10071', 'bin'),
    ...childDirs(path.join(programFiles, 'gs'), name => /^gs/i.test(name), 'bin'),
    ...childDirs(path.join(programFilesX86, 'gs'), name => /^gs/i.test(name), 'bin'),
    path.join(programFiles, 'LibreOffice', 'program'),
    path.join(programFilesX86, 'LibreOffice', 'program'),
  ];
  return existingDirs(dirs);
}

function withOcrToolPath(basePath) {
  const current = String(basePath || process.env.Path || process.env.PATH || '');
  const parts = current.split(path.delimiter).filter(Boolean);
  return [...ocrToolDirs(), ...parts].filter((value, index, all) => all.indexOf(value) === index).join(path.delimiter);
}

function childEnvWithOcrTools() {
  const childEnv = { ...process.env };
  const pathKey = Object.keys(childEnv).find(key => key.toLowerCase() === 'path') || 'Path';
  childEnv[pathKey] = withOcrToolPath(childEnv[pathKey]);
  const tessdata = path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Tesseract-OCR', 'tessdata');
  if (!childEnv.TESSDATA_PREFIX && fs.existsSync(tessdata)) childEnv.TESSDATA_PREFIX = tessdata;
  return childEnv;
}

function commandExists(command) {
  const lookup = process.platform === 'win32' ? 'where' : 'which';
  const result = spawnSync(lookup, [command], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: childEnvWithOcrTools() });
  return result.status === 0 && String(result.stdout || '').trim().length > 0;
}

function providerForType(type, preferred = env.OCR_PROVIDER) {
  const provider = String(preferred || 'ocrmypdf').toLowerCase();
  if (type === 'pdf' && provider === 'ocrmypdf') return 'ocrmypdf';
  if (provider === 'tesseractjs') return 'tesseractjs';
  if (provider === 'tesseract') return 'tesseract';
  if (type === 'pdf') return 'ocrmypdf';
  return 'tesseract';
}

function providerAvailability(provider = env.OCR_PROVIDER) {
  const p = String(provider || 'ocrmypdf').toLowerCase();
  if (p === 'ocrmypdf') {
    return { provider: p, available: commandExists('ocrmypdf'), missing: commandExists('ocrmypdf') ? [] : ['ocrmypdf'] };
  }
  if (p === 'tesseract') {
    return { provider: p, available: commandExists('tesseract'), missing: commandExists('tesseract') ? [] : ['tesseract'] };
  }
  if (p === 'tesseractjs') {
    try {
      require.resolve('tesseract.js');
      return { provider: p, available: true, missing: [] };
    } catch (_) {
      return { provider: p, available: false, missing: ['tesseract.js'] };
    }
  }
  return { provider: p, available: false, missing: [p] };
}

function status(provider = env.OCR_PROVIDER) {
  const selected = providerAvailability(provider);
  const imageFallback = providerAvailability('tesseract');
  const jsFallback = providerAvailability('tesseractjs');
  return {
    enabled: !!env.OCR_ENABLED,
    provider: selected.provider,
    available: selected.available,
    missing: selected.missing,
    providers: {
      ocrmypdf: providerAvailability('ocrmypdf'),
      tesseract: imageFallback,
      tesseractjs: jsFallback,
    },
  };
}

function runProcess(command, args, opts = {}) {
  const timeoutMs = opts.timeoutMs || env.OCR_TIMEOUT_MS;
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: opts.cwd || process.cwd(),
      env: childEnvWithOcrTools(),
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try { child.kill('SIGKILL'); } catch (_) {}
    }, timeoutMs);
    child.stdout.on('data', d => { stdout += d.toString(); });
    child.stderr.on('data', d => { stderr += d.toString(); });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (timedOut) {
        const err = new Error('ocr_timeout');
        err.code = 'ocr_timeout';
        err.stdout = stdout;
        err.stderr = stderr;
        return reject(err);
      }
      if (code !== 0) {
        const err = new Error(`ocr_command_failed:${code}`);
        err.code = 'ocr_command_failed';
        err.exitCode = code;
        err.stdout = stdout;
        err.stderr = stderr;
        return reject(err);
      }
      resolve({ stdout, stderr });
    });
  });
}

function ensureWorkDir(materialId) {
  const base = path.join(env.UPLOAD_DIR, 'ocr', String(materialId || `tmp-${Date.now()}`));
  fs.mkdirSync(base, { recursive: true });
  return base;
}

function extFromMime(mime) {
  const m = String(mime || '').toLowerCase();
  if (m.includes('png')) return '.png';
  if (m.includes('webp')) return '.webp';
  if (m.includes('jpeg') || m.includes('jpg')) return '.jpg';
  return '.png';
}

async function ocrPdfWithOcrmypdf({ filePath, materialId, quality }) {
  const availability = providerAvailability('ocrmypdf');
  if (!availability.available) {
    const err = new Error('ocr_provider_unavailable');
    err.missing = availability.missing;
    throw err;
  }
  const workDir = ensureWorkDir(materialId);
  const outputPdf = path.join(workDir, 'ocr-output.pdf');
  const sidecar = path.join(workDir, 'ocr-sidecar.txt');
  const modeArg = quality && quality.imageOnlyPageRatio >= 0.5 ? '--skip-text' : '--redo-ocr';
  const args = [
    modeArg,
    '--sidecar', sidecar,
    '--output-type', 'pdf',
    '--optimize', '0',
    '--tesseract-timeout', String(Math.max(1, Math.ceil(env.OCR_TIMEOUT_MS / 1000))),
  ];
  if (env.OCR_TESSERACT_LANG) args.push('-l', env.OCR_TESSERACT_LANG);
  if (env.OCR_MAX_PAGES > 0) args.push('--pages', `1-${env.OCR_MAX_PAGES}`);
  args.push(filePath, outputPdf);
  await runProcess('ocrmypdf', args, { timeoutMs: env.OCR_TIMEOUT_MS });

  const { extractStructured } = require('./extract.service');
  const structured = await extractStructured(outputPdf, 'application/pdf', { fromOcrPdf: true });
  return {
    status: 'ocr_completed',
    provider: 'ocrmypdf',
    outputPath: outputPdf,
    sidecarPath: fs.existsSync(sidecar) ? sidecar : null,
    pages: (structured.pages || []).map(p => ({
      pageNumber: p.pageNumber,
      slideNumber: null,
      text: p.text,
      confidence: null,
    })),
  };
}

async function ocrImageWithTesseract(filePath, opts = {}) {
  const result = await ocrImageDataWithTesseract(filePath, opts);
  return result.text;
}

function parseTesseractTsv(value) {
  const words = [];
  const lines = String(value || '').split(/\r?\n/);
  for (let i = 1; i < lines.length; i += 1) {
    const cols = lines[i].split('\t');
    if (cols.length < 12) continue;
    const text = cols.slice(11).join('\t').trim();
    const confidence = Number(cols[10]);
    if (!text || !Number.isFinite(confidence) || confidence < 0) continue;
    words.push({
      text,
      confidence,
      page: Number(cols[1] || 1),
      block: Number(cols[2] || 0),
      paragraph: Number(cols[3] || 0),
      line: Number(cols[4] || 0),
      word: Number(cols[5] || 0),
      boundingBox: { left: Number(cols[6] || 0), top: Number(cols[7] || 0), width: Number(cols[8] || 0), height: Number(cols[9] || 0) },
    });
  }
  const confidence = words.length ? words.reduce((sum, word) => sum + word.confidence, 0) / words.length : null;
  return { words, confidence: confidence == null ? null : Number(confidence.toFixed(2)) };
}

async function ocrImageDataWithTesseract(filePath, opts = {}) {
  const availability = providerAvailability('tesseract');
  if (!availability.available) {
    const err = new Error('ocr_provider_unavailable');
    err.missing = availability.missing;
    throw err;
  }
  const workDir = opts.workDir || fs.mkdtempSync(path.join(os.tmpdir(), 'noesis-ocr-'));
  const outBase = path.join(workDir, `image-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const args = [filePath, outBase];
  if (env.OCR_TESSERACT_LANG) args.push('-l', env.OCR_TESSERACT_LANG);
  args.push('txt', 'tsv');
  await runProcess('tesseract', args, { timeoutMs: opts.timeoutMs || env.OCR_TIMEOUT_MS });
  const txtPath = `${outBase}.txt`;
  const tsvPath = `${outBase}.tsv`;
  const parsed = fs.existsSync(tsvPath) ? parseTesseractTsv(fs.readFileSync(tsvPath, 'utf8')) : { words: [], confidence: null };
  return {
    text: fs.existsSync(txtPath) ? fs.readFileSync(txtPath, 'utf8') : '',
    words: parsed.words,
    confidence: parsed.confidence,
    warnings: parsed.words.length ? [] : ['ocr_layout_or_confidence_unavailable'],
  };
}

async function ocrImageWithTesseractJs(filePath) {
  const result = await ocrImageDataWithTesseractJs(filePath);
  return result.text;
}

async function ocrImageDataWithTesseractJs(filePath) {
  let mod;
  try {
    mod = require('tesseract.js');
  } catch (_) {
    const err = new Error('ocr_provider_unavailable');
    err.missing = ['tesseract.js'];
    throw err;
  }
  const result = await mod.recognize(filePath, env.OCR_TESSERACT_LANG || 'eng', {
    logger: () => {},
  });
  const data = result && result.data || {};
  const words = (data.words || []).map((word, index) => ({
    text: word.text || '',
    confidence: Number(word.confidence == null ? data.confidence : word.confidence),
    word: index + 1,
    boundingBox: word.bbox ? { left: word.bbox.x0, top: word.bbox.y0, width: word.bbox.x1 - word.bbox.x0, height: word.bbox.y1 - word.bbox.y0 } : {},
  })).filter(word => word.text);
  return {
    text: data.text || '',
    words,
    confidence: Number.isFinite(Number(data.confidence)) ? Number(Number(data.confidence).toFixed(2)) : null,
    warnings: words.length ? [] : ['ocr_layout_or_confidence_unavailable'],
  };
}

function materializeVisualSource(visual, workDir, index) {
  if (visual.filePath) return visual.filePath;
  if (!visual.buffer) return null;
  const ext = path.extname(visual.name || '') || extFromMime(visual.mime);
  const out = path.join(workDir, `visual-${index}${ext}`);
  fs.writeFileSync(out, visual.buffer);
  return out;
}

function usefulChars(value) {
  return (String(value || '').match(/[A-Za-z0-9]/g) || []).length;
}

function visualLocationKey(value = {}) {
  return value.slideNumber != null ? `s:${value.slideNumber}` : `p:${value.pageNumber || 1}`;
}

function weakVisualSources(structured = {}) {
  const pages = structured.pages || [];
  if (!pages.length) return structured.visualSources || [];
  const weak = new Set(pages
    .filter(page => usefulChars(page.text) < env.OCR_MIN_TEXT_CHARS_PER_PAGE)
    .map(visualLocationKey));
  const filtered = (structured.visualSources || []).filter(visual => weak.has(visualLocationKey(visual)));
  return filtered.length ? filtered : [];
}

async function ocrVisualSources({ visualSources = [], materialId, provider }) {
  const selected = providerForType('image', provider);
  const workDir = ensureWorkDir(materialId);
  const byLocation = new Map();
  const capped = visualSources.slice(0, env.OCR_MAX_PAGES || visualSources.length);
  for (let i = 0; i < capped.length; i += 1) {
    const visual = capped[i];
    const imagePath = materializeVisualSource(visual, workDir, i + 1);
    if (!imagePath) continue;
    let data = { text: '', words: [], confidence: null, warnings: [] };
    if (selected === 'tesseractjs') data = await ocrImageDataWithTesseractJs(imagePath);
    else data = await ocrImageDataWithTesseract(imagePath, { workDir });
    const key = visual.slideNumber != null ? `s:${visual.slideNumber}` : `p:${visual.pageNumber || 1}`;
    const existing = byLocation.get(key) || {
      pageNumber: visual.pageNumber || null,
      slideNumber: visual.slideNumber || null,
      text: '',
      words: [],
      confidence: null,
      warnings: [],
    };
    existing.text = [existing.text, data.text].filter(Boolean).join('\n');
    existing.words.push(...(data.words || []));
    const confidences = [existing.confidence, data.confidence].filter(value => value != null && Number.isFinite(Number(value)));
    existing.confidence = confidences.length ? Number((confidences.reduce((sum, value) => sum + Number(value), 0) / confidences.length).toFixed(2)) : null;
    existing.warnings.push(...(data.warnings || []));
    byLocation.set(key, existing);
  }
  return {
    status: 'ocr_completed',
    provider: selected,
    pages: [...byLocation.values()],
  };
}

async function runOcr(opts = {}) {
  const structured = opts.structured || {};
  const provider = providerForType(structured.type, opts.provider || env.OCR_PROVIDER);
  if (structured.type === 'pdf' && provider === 'ocrmypdf') return ocrPdfWithOcrmypdf(opts);
  if (structured.type === 'image') {
    return ocrVisualSources({
      visualSources: [{ filePath: opts.filePath, pageNumber: 1, mime: opts.mime }],
      materialId: opts.materialId,
      provider,
    });
  }
  if (structured.type === 'slides') {
    return ocrVisualSources({
      visualSources: weakVisualSources(structured),
      materialId: opts.materialId,
      provider,
    });
  }
  return {
    status: 'ocr_skipped_unsupported_type',
    provider,
    pages: [],
  };
}

module.exports = {
  commandExists,
  providerAvailability,
  runOcr,
  status,
  _internals: {
    extFromMime,
    materializeVisualSource,
    ocrImageWithTesseract,
    ocrImageDataWithTesseract,
    ocrImageWithTesseractJs,
    ocrImageDataWithTesseractJs,
    ocrPdfWithOcrmypdf,
    ocrVisualSources,
    providerForType,
    runProcess,
    childEnvWithOcrTools,
    ocrToolDirs,
    weakVisualSources,
    parseTesseractTsv,
  },
};
