'use strict';

const fs = require('fs');
const net = require('net');
const path = require('path');
const env = require('../config/env');
const slides = require('./slides.service');
const visualRegistry = require('../utils/visual-registry');

let remotionBundleLocation = null;

function existingPath(value) {
  return value && fs.existsSync(value) ? value : '';
}

function detectBrowserExecutable() {
  if (existingPath(env.REMOTION_BROWSER_EXECUTABLE)) return env.REMOTION_BROWSER_EXECUTABLE;
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ];
  return candidates.find(existingPath) || '';
}

function canResolve(pkg) {
  try {
    require.resolve(pkg);
    return true;
  } catch (_) {
    return false;
  }
}

function getAvailablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = address && typeof address === 'object' ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

function remotionStatus() {
  const packages = ['@remotion/renderer', '@remotion/bundler', 'remotion', 'react', 'react-dom'];
  const missing = packages.filter(pkg => !canResolve(pkg));
  const browserExecutable = detectBrowserExecutable();
  return {
    ok: missing.length === 0 && !!browserExecutable,
    renderer: 'remotion',
    missing: [...missing, ...(!browserExecutable ? ['chrome_or_edge'] : [])],
    browserExecutable,
    recommendation: missing.length
      ? 'Install Remotion packages before enabling VIDEO_RENDERER=remotion for production demo renders.'
      : (!browserExecutable ? 'Install Chrome/Edge or set REMOTION_BROWSER_EXECUTABLE to a browser executable path.' : '')
  };
}

function canvasStatus() {
  const ok = !!(slides._internals && slides._internals.loadCanvas && slides._internals.loadCanvas());
  return {
    ok,
    renderer: 'canvas',
    missing: ok ? [] : ['canvas'],
    recommendation: ok ? '' : 'Run npm install in backend so the optional canvas dependency is available.',
  };
}

function status() {
  const remotion = remotionStatus();
  const canvas = canvasStatus();
  const selected = env.VIDEO_RENDERER_EXPLICIT
    ? (env.VIDEO_RENDERER === 'remotion' ? 'remotion' : 'canvas')
    : (remotion.ok ? 'remotion' : 'canvas');
  const selectedStatus = selected === 'remotion' ? remotion : canvas;
  return {
    selected,
    ok: selectedStatus.ok,
    selectedStatus,
    remotion,
    canvas,
  };
}

function storyboardPreviewUrl(storyboardId, sceneId) {
  return `/api/videos/storyboard/${storyboardId}/scene/${encodeURIComponent(sceneId)}/preview`;
}

function visualTextFor(scene = {}, slide = {}) {
  const data = scene.visualElements || scene.visualData || slide.visual || {};
  const nodes = Array.isArray(data.nodes) ? data.nodes : slide.visual_nodes || [];
  return [
    scene.topic,
    slide.topic,
    scene.sceneTitle,
    scene.title,
    slide.title,
    scene.learningPoint,
    scene.narration,
    slide.narration,
    data.caption,
    slide.caption,
    ...nodes.map(node => typeof node === 'string' ? node : node && (node.label || node.id || node.name) || ''),
  ].filter(Boolean).join(' ');
}

function sceneTypeOf(scene = {}, slide = {}) {
  return String(scene.sceneType || scene.type || slide.slideType || slide.slide_type || '').toLowerCase();
}

function conceptMapAllowedForRender(scene = {}, slide = {}, canonicalType = '') {
  const type = sceneTypeOf(scene, slide);
  if (canonicalType === 'learning_objectives') return type === 'objectives';
  if (canonicalType === 'summary_path') return type === 'recap' || type === 'checkpoint' || type === 'summary';
  if (canonicalType === 'concept_map') return type === 'mindmap' || type === 'objectives' || type === 'recap' || type === 'summary';
  return true;
}

function visualValidationError(code, message, details = {}) {
  const err = new Error(message || code);
  err.code = code;
  err.visualValidation = true;
  err.details = details;
  return err;
}

function validateRemotionVisualInput({ scene = {}, slide = {} } = {}) {
  const data = scene.visualElements || scene.visualData || slide.visual || {};
  const rawType = scene.visualType || scene.visualTemplate || data.type || slide.visual_type || '';
  const text = visualTextFor(scene, slide);
  const resolution = visualRegistry.resolveVisualType(rawType, {
    topic: scene.topic || slide.topic,
    title: scene.sceneTitle || scene.title || slide.title,
    text,
  });
  if (!resolution.supported) {
    throw visualValidationError(
      'unsupported_visual_type',
      `unsupported_visual_type:${rawType || 'missing'}`,
      { visualType: rawType || 'missing' }
    );
  }
  if (resolution.config && resolution.config.conceptMap && !conceptMapAllowedForRender(scene, slide, resolution.canonical)) {
    throw visualValidationError(
      'generic_fallback_not_allowed',
      `generic_fallback_not_allowed:${resolution.canonical}`,
      { visualType: resolution.canonical, sceneType: sceneTypeOf(scene, slide) || 'missing' }
    );
  }
  return resolution;
}

async function renderScenePreview(slide, outPath) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  return slides.renderSlide(slide, outPath);
}

async function ensureRemotionBundle() {
  if (remotionBundleLocation) return remotionBundleLocation;
  const remotion = remotionStatus();
  if (!remotion.ok) {
    throw new Error(`remotion_not_ready: missing ${remotion.missing.join(', ')}`);
  }
  const { bundle } = require('@remotion/bundler');
  remotionBundleLocation = await bundle({
    entryPoint: path.join(env.ROOT_DIR, 'remotion', 'index.jsx'),
    webpackOverride: (config) => config,
  });
  return remotionBundleLocation;
}

async function renderRemotionScene({ slide, scene, outPath, durationSec, fps = 30, onProgress }) {
  validateRemotionVisualInput({ scene, slide });
  const serveUrl = await ensureRemotionBundle();
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const { renderMedia, selectComposition } = require('@remotion/renderer');
  const browserExecutable = detectBrowserExecutable();
  if (!browserExecutable) throw new Error('remotion_browser_not_found: install Chrome/Edge or set REMOTION_BROWSER_EXECUTABLE');
  const port = await getAvailablePort();
  const durationInFrames = Math.max(30, Math.ceil(Number(durationSec || 12) * fps));
  const inputProps = {
    slide: slide || {},
    scene: scene || {},
    durationInFrames,
  };
  const composition = await selectComposition({
    serveUrl,
    id: 'TutorScene',
    inputProps,
    browserExecutable,
    port,
    timeoutInMilliseconds: 60000,
  });
  await renderMedia({
    composition,
    serveUrl,
    codec: 'h264',
    outputLocation: outPath,
    inputProps,
    frameRange: [0, durationInFrames - 1],
    muted: true,
    overwrite: true,
    logLevel: 'warn',
    crf: 20,
    concurrency: '50%',
    browserExecutable,
    port,
    timeoutInMilliseconds: 60000,
    onProgress: onProgress || undefined,
  });
  return outPath;
}

module.exports = {
  status,
  remotionStatus,
  canvasStatus,
  supportedVisualTypes: visualRegistry.supportedVisualTypes,
  resolveVisualType: visualRegistry.resolveVisualType,
  validateRemotionVisualInput,
  detectBrowserExecutable,
  getAvailablePort,
  storyboardPreviewUrl,
  renderScenePreview,
  renderRemotionScene,
};
