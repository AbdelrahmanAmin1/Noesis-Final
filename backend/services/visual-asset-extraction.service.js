'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const env = require('../config/env');
const ocr = require('./ocr.service');
const sourceVisuals = require('./source-visual-candidates.service');

function optionalSharp() {
  try { return require('sharp'); } catch (_) { return null; }
}

function runDir(materialId, analysisRunId) {
  const dir = path.join(env.UPLOAD_DIR, 'source-visuals', String(materialId), String(analysisRunId));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function safeExt(value, mime = '') {
  const ext = path.extname(String(value || '')).toLowerCase();
  if (['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(ext)) return ext;
  if (/jpeg/.test(mime)) return '.jpg';
  if (/webp/.test(mime)) return '.webp';
  return '.png';
}

function materialize(visual, dir, index) {
  const ext = safeExt(visual.name || visual.filePath, visual.mime);
  const out = path.join(dir, `asset-${String(index).padStart(3, '0')}${ext}`);
  if (visual.buffer) fs.writeFileSync(out, visual.buffer);
  else if (visual.filePath && fs.existsSync(visual.filePath)) fs.copyFileSync(visual.filePath, out);
  else return null;
  return out;
}

function fileFingerprint(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return '';
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

async function imageMetrics(filePath) {
  const sharp = optionalSharp();
  if (!sharp || !filePath) return { width: null, height: null, qualityScore: filePath ? 0.65 : 0, warnings: sharp ? [] : ['sharp_unavailable_quality_estimated'] };
  try {
    const image = sharp(filePath, { failOn: 'none' });
    const metadata = await image.metadata();
    const stats = await image.stats();
    const width = Number(metadata.width || 0);
    const height = Number(metadata.height || 0);
    const contrast = stats.channels && stats.channels.length
      ? stats.channels.reduce((sum, channel) => sum + Number(channel.stdev || 0), 0) / stats.channels.length
      : 0;
    const resolution = Math.min(1, Math.sqrt(width * height) / 900);
    const contrastScore = Math.min(1, contrast / 55);
    const qualityScore = Number((resolution * 0.65 + contrastScore * 0.35).toFixed(3));
    return { width, height, contrast: Number(contrast.toFixed(2)), qualityScore, warnings: qualityScore < 0.65 ? ['source_visual_low_resolution_or_contrast'] : [] };
  } catch (err) {
    return { width: null, height: null, qualityScore: 0.4, warnings: [`visual_quality_failed:${err.message || err}`] };
  }
}

async function cropEducationalRegion(pageImagePath, page = {}, dir, index) {
  const sharp = optionalSharp();
  if (!sharp || !pageImagePath) return { filePath: pageImagePath, boundingBox: {}, warnings: sharp ? [] : ['sharp_unavailable_region_crop_skipped'] };
  try {
    const metadata = await sharp(pageImagePath).metadata();
    const width = Number(metadata.width || 0);
    const height = Number(metadata.height || 0);
    const boxes = (page.ocrWords || []).map(word => word.boundingBox || {}).filter(box => Number(box.width) > 0 && Number(box.height) > 0);
    let box;
    if (boxes.length) {
      const padding = 20;
      const left = Math.max(0, Math.min(...boxes.map(item => Number(item.left || 0))) - padding);
      const top = Math.max(0, Math.min(...boxes.map(item => Number(item.top || 0))) - padding);
      const right = Math.min(width, Math.max(...boxes.map(item => Number(item.left || 0) + Number(item.width || 0))) + padding);
      const bottom = Math.min(height, Math.max(...boxes.map(item => Number(item.top || 0) + Number(item.height || 0))) + padding);
      box = { left, top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) };
    } else {
      box = { left: 0, top: 0, width, height };
    }
    const out = path.join(dir, `region-${String(index).padStart(3, '0')}.png`);
    await sharp(pageImagePath).extract(box).png().toFile(out);
    return { filePath: out, boundingBox: { x: box.left, y: box.top, width: box.width, height: box.height, unit: 'px' }, warnings: boxes.length ? [] : ['region_crop_uses_full_page_without_ocr_boxes'] };
  } catch (err) {
    return { filePath: pageImagePath, boundingBox: {}, warnings: [`visual_region_crop_failed:${err.message || err}`] };
  }
}

async function ocrVisualFile(filePath, dir) {
  if (!env.OCR_ENABLED || !filePath) return { text: '', confidence: null, words: [], warnings: env.OCR_ENABLED ? [] : ['visual_ocr_disabled'] };
  try {
    if (String(env.OCR_PROVIDER || '').toLowerCase() === 'tesseractjs') return await ocr._internals.ocrImageDataWithTesseractJs(filePath);
    return await ocr._internals.ocrImageDataWithTesseract(filePath, { workDir: dir, timeoutMs: env.OCR_TIMEOUT_MS });
  } catch (err) {
    return { text: '', confidence: null, words: [], warnings: [`visual_ocr_failed:${err.message || err}`] };
  }
}

function renderPdfPages(filePath, dir, maxPages) {
  if (!ocr.commandExists('pdftoppm')) return { pages: [], warnings: ['pdftoppm_unavailable_page_render_skipped'] };
  const prefix = path.join(dir, 'page');
  const args = ['-png', '-r', '144', '-f', '1', '-l', String(maxPages), filePath, prefix];
  const result = spawnSync('pdftoppm', args, { encoding: 'utf8', windowsHide: true, env: ocr._internals.childEnvWithOcrTools() });
  if (result.status !== 0) return { pages: [], warnings: [`pdf_page_render_failed:${String(result.stderr || '').trim().slice(0, 180)}`] };
  const pages = fs.readdirSync(dir).filter(name => /^page-\d+\.png$/i.test(name)).sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0])).map((name, index) => ({ pageNumber: index + 1, filePath: path.join(dir, name) }));
  return { pages, warnings: [] };
}

function copyImageAsPage(filePath, dir) {
  if (!filePath || !fs.existsSync(filePath)) return [];
  const out = path.join(dir, `page-1${safeExt(filePath)}`);
  fs.copyFileSync(filePath, out);
  return [{ pageNumber: 1, filePath: out }];
}

function renderPptxSlides(filePath, dir, maxPages) {
  const command = ocr.commandExists('soffice') ? 'soffice' : ocr.commandExists('libreoffice') ? 'libreoffice' : null;
  if (!command) return { pages: [], warnings: ['libreoffice_unavailable_native_slide_crop_skipped'] };
  const converted = spawnSync(command, ['--headless', '--convert-to', 'pdf', '--outdir', dir, filePath], {
    encoding: 'utf8', windowsHide: true, env: ocr._internals.childEnvWithOcrTools(),
  });
  if (converted.status !== 0) return { pages: [], warnings: [`pptx_page_render_failed:${String(converted.stderr || '').trim().slice(0, 180)}`] };
  const pdf = path.join(dir, `${path.basename(filePath, path.extname(filePath))}.pdf`);
  if (!fs.existsSync(pdf)) return { pages: [], warnings: ['pptx_conversion_pdf_missing'] };
  const rendered = renderPdfPages(pdf, dir, maxPages);
  rendered.pages = rendered.pages.map((page, index) => ({ ...page, pageNumber: null, slideNumber: index + 1 }));
  return rendered;
}

function pageKey(value = {}) {
  return value.slideNumber != null ? `s:${value.slideNumber}` : `p:${value.pageNumber || 1}`;
}

async function extractVisualAssets({ materialId, analysisRunId, filePath, structured = {} }) {
  const dir = runDir(materialId, analysisRunId);
  const warnings = [];
  let pageImages = [];
  if (structured.type === 'pdf') {
    const rendered = renderPdfPages(filePath, dir, Math.min(env.OCR_MAX_PAGES || 40, structured.pageCount || 40));
    pageImages = rendered.pages;
    warnings.push(...rendered.warnings);
  } else if (structured.type === 'image') {
    pageImages = copyImageAsPage(filePath, dir);
  } else if (structured.type === 'slides') {
    const rendered = renderPptxSlides(filePath, dir, Math.min(env.OCR_MAX_PAGES || 40, structured.pageCount || 40));
    pageImages = rendered.pages;
    warnings.push(...rendered.warnings);
  }

  const pageByKey = new Map((structured.pages || []).map(page => [pageKey(page), page]));
  const assets = [];
  let index = 0;
  for (const visual of structured.visualSources || []) {
    index += 1;
    const imagePath = materialize(visual, dir, index);
    const visualOcr = index <= (env.OCR_MAX_PAGES || 40) ? await ocrVisualFile(imagePath, dir) : { text: '', confidence: null, words: [], warnings: ['visual_ocr_limit_reached'] };
    const metrics = await imageMetrics(imagePath);
    const page = pageByKey.get(pageKey(visual)) || {};
    const nearbyText = String(page.text || page.normalText || '').slice(0, 2000);
    const ocrText = String(visualOcr.text || page.ocrText || '').slice(0, 2000);
    const visualTypeGuess = sourceVisuals.visualTypeGuess([page.heading, nearbyText, ocrText, visual.name].filter(Boolean).join(' '));
    assets.push({
      ...visual,
      imagePath,
      heading: page.heading || '',
      nearbyText,
      ocrText,
      visualTypeGuess,
      boundingBox: visual.boundingBox || {},
      fingerprint: fileFingerprint(imagePath),
      width: metrics.width,
      height: metrics.height,
      qualityScore: metrics.qualityScore,
      ocrConfidence: visualOcr.confidence,
      ocrWords: visualOcr.words || [],
      warnings: [...metrics.warnings, ...(visualOcr.warnings || [])],
      metadata: { entryName: visual.entryName || '', name: visual.name || '', mime: visual.mime || '', associationMethod: visual.associationMethod || '' },
    });
  }

  for (const pageImage of pageImages) {
    const pageImageKey = pageImage.slideNumber != null ? `s:${pageImage.slideNumber}` : `p:${pageImage.pageNumber}`;
    const page = pageByKey.get(pageImageKey) || {};
    page.pageImagePath = pageImage.filePath;
    const text = [page.heading, page.text, page.ocrText].filter(Boolean).join(' ');
    const guess = sourceVisuals.visualTypeGuess(text);
    if (!guess || guess === 'decorative') continue;
    const region = await cropEducationalRegion(pageImage.filePath, page, dir, assets.length + 1);
    const metrics = await imageMetrics(region.filePath);
    assets.push({
      pageNumber: pageImage.pageNumber || null,
      slideNumber: pageImage.slideNumber || null,
      imagePath: region.filePath,
      heading: page.heading || '',
      nearbyText: String(page.text || '').slice(0, 2000),
      ocrText: String(page.ocrText || '').slice(0, 2000),
      visualTypeGuess: guess,
      boundingBox: region.boundingBox,
      fingerprint: fileFingerprint(region.filePath),
      width: metrics.width,
      height: metrics.height,
      qualityScore: metrics.qualityScore,
      warnings: [...metrics.warnings, ...region.warnings, 'rendered_page_region_candidate'],
      metadata: { pageRender: true, associationMethod: 'rendered_page' },
    });
  }

  const counts = new Map();
  assets.forEach(asset => { if (asset.fingerprint) counts.set(asset.fingerprint, (counts.get(asset.fingerprint) || 0) + 1); });
  assets.forEach(asset => {
    if (asset.fingerprint && counts.get(asset.fingerprint) >= 2) asset.warnings = [...new Set([...(asset.warnings || []), 'repeated_visual_asset'])];
  });
  return { assets, pageImages, warnings, directory: dir };
}

module.exports = { extractVisualAssets, imageMetrics, _internals: { cropEducationalRegion, fileFingerprint, materialize, ocrVisualFile, renderPdfPages, renderPptxSlides, safeExt } };
