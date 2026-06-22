'use strict';

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const env = require('../config/env');
const { getDb } = require('../config/db');
const log = require('../utils/logger');
const visualComposition = require('../utils/visual-composition');

const MIME_BY_EXT = {
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

const SOURCE_REFERENCE_TYPES = new Set([
  'source_reference',
  'source_page_reference',
  'source_slide_reference',
]);

function clean(value) {
  return String(value || '').trim();
}

function asNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function isWithin(parent, child) {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function mimeTypeFor(filePath, fallback = '') {
  const fromExt = MIME_BY_EXT[path.extname(clean(filePath)).toLowerCase()];
  const normalizedFallback = clean(fallback).toLowerCase();
  return fromExt || (/^image\/(?:png|jpeg|gif|webp)$/.test(normalizedFallback) ? normalizedFallback : '');
}

function filePathCandidates(value) {
  const text = clean(value);
  if (!text || /^(?:https?:|data:|blob:|file:)/i.test(text)) return [];
  if (path.isAbsolute(text)) return [path.normalize(text)];
  return [...new Set([
    path.resolve(env.ROOT_DIR, text),
    path.resolve(path.dirname(env.ROOT_DIR), text),
    path.resolve(path.dirname(env.UPLOAD_DIR), text),
    path.resolve(env.UPLOAD_DIR, text),
  ])];
}

function resolveLocalFilePath(value) {
  const candidates = filePathCandidates(value);
  return candidates.find(candidate => fs.existsSync(candidate)) || candidates[0] || '';
}

function candidateFromDb(sourceVisualId, materialId) {
  if (sourceVisualId == null || sourceVisualId === '') return null;
  try {
    const db = getDb();
    const row = materialId == null
      ? db.prepare('SELECT * FROM source_visual_candidates WHERE id=?').get(sourceVisualId)
      : db.prepare('SELECT * FROM source_visual_candidates WHERE id=? AND material_id=?').get(sourceVisualId, materialId);
    if (!row) return null;
    let metadata = {};
    try { metadata = JSON.parse(row.metadata_json || '{}'); } catch (_) {}
    return {
      id: row.id,
      sourceVisualId: row.id,
      materialId: row.material_id,
      imagePath: row.image_path || row.thumbnail_path || '',
      thumbnailPath: row.thumbnail_path || '',
      imageUrl: '',
      mimeType: metadata.mime || '',
      width: metadata.width || null,
      height: metadata.height || null,
      associationMethod: metadata.associationMethod || '',
      associationConfidence: metadata.associationConfidence == null
        ? (/^embedded-\d+\.(?:jpe?g|png|webp|gif)$/i.test(metadata.name || '') ? 0.25 : 1)
        : Number(metadata.associationConfidence),
    };
  } catch (_) {
    return null;
  }
}

function mergedAssetInput(sourceVisual = {}, opts = {}) {
  const sourceVisualId = sourceVisual.sourceVisualId
    || sourceVisual.source_visual_id
    || sourceVisual.id
    || opts.sourceVisualId
    || null;
  const stored = opts.lookupDb === false ? null : candidateFromDb(sourceVisualId, opts.materialId || sourceVisual.materialId || sourceVisual.material_id);
  return {
    ...(stored || {}),
    ...sourceVisual,
    sourceVisualId,
    imagePath: sourceVisual.imagePath
      || sourceVisual.image_path
      || sourceVisual.thumbnailPath
      || sourceVisual.thumbnail_path
      || sourceVisual.sourceImagePath
      || sourceVisual.source_image_path
      || stored && stored.imagePath
      || '',
    imageUrl: sourceVisual.imageUrl
      || sourceVisual.image_url
      || sourceVisual.sourceImageUrl
      || sourceVisual.source_image_url
      || stored && stored.imageUrl
      || '',
  };
}

function basicAssetCheck(sourceVisual = {}, opts = {}) {
  const input = mergedAssetInput(sourceVisual, opts);
  const requestedPath = clean(input.imagePath);
  const imageUrl = clean(input.imageUrl);
  if (opts.requireTrustedAssociation !== false
    && input.associationConfidence != null
    && Number(input.associationConfidence) < 0.5) {
    const absolutePath = resolveLocalFilePath(requestedPath);
    return {
      valid: false,
      exists: !!(absolutePath && fs.existsSync(absolutePath)),
      sourceVisualId: input.sourceVisualId || null,
      requestedPath,
      absolutePath,
      publicUrl: absolutePath ? pathToFileURL(absolutePath).href : '',
      reasonIfInvalid: 'source_image_page_association_untrusted',
    };
  }
  if (!requestedPath) {
    return {
      valid: false,
      exists: false,
      sourceVisualId: input.sourceVisualId || null,
      reasonIfInvalid: imageUrl ? 'remote_or_embedded_image_requires_preflight' : 'missing_image_path',
    };
  }
  const absolutePath = resolveLocalFilePath(requestedPath);
  if (!absolutePath || !fs.existsSync(absolutePath)) {
    return {
      valid: false,
      exists: false,
      sourceVisualId: input.sourceVisualId || null,
      requestedPath,
      absolutePath,
      reasonIfInvalid: 'file_not_found',
    };
  }
  if (!opts.allowOutsideUploadDir && !isWithin(env.UPLOAD_DIR, absolutePath)) {
    return {
      valid: false,
      exists: true,
      sourceVisualId: input.sourceVisualId || null,
      requestedPath,
      absolutePath,
      reasonIfInvalid: 'file_outside_upload_dir',
    };
  }
  let stat;
  try {
    fs.accessSync(absolutePath, fs.constants.R_OK);
    stat = fs.statSync(absolutePath);
  } catch (_) {
    return {
      valid: false,
      exists: true,
      sourceVisualId: input.sourceVisualId || null,
      requestedPath,
      absolutePath,
      reasonIfInvalid: 'file_not_readable',
    };
  }
  if (!stat.isFile() || stat.size <= 0) {
    return {
      valid: false,
      exists: true,
      sourceVisualId: input.sourceVisualId || null,
      requestedPath,
      absolutePath,
      reasonIfInvalid: 'file_empty_or_not_regular',
    };
  }
  const mimeType = mimeTypeFor(absolutePath, input.mimeType || input.mime);
  if (!mimeType) {
    return {
      valid: false,
      exists: true,
      sourceVisualId: input.sourceVisualId || null,
      requestedPath,
      absolutePath,
      reasonIfInvalid: 'unsupported_image_type',
    };
  }
  return {
    valid: true,
    exists: true,
    sourceVisualId: input.sourceVisualId || null,
    requestedPath,
    absolutePath,
    publicUrl: pathToFileURL(absolutePath).href,
    mimeType,
    sizeBytes: stat.size,
  };
}

function dimensionsFromBuffer(buffer, mimeType) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 10) return null;
  if (mimeType === 'image/png' && buffer.length >= 24 && buffer.toString('ascii', 1, 4) === 'PNG') {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if (mimeType === 'image/gif' && buffer.length >= 10 && /^GIF8/.test(buffer.toString('ascii', 0, 4))) {
    return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
  }
  if (mimeType === 'image/jpeg' && buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset + 8 < buffer.length) {
      if (buffer[offset] !== 0xff) { offset += 1; continue; }
      const marker = buffer[offset + 1];
      const length = buffer.readUInt16BE(offset + 2);
      if (length < 2) break;
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        return { width: buffer.readUInt16BE(offset + 7), height: buffer.readUInt16BE(offset + 5) };
      }
      offset += 2 + length;
    }
  }
  return null;
}

function dimensionsAreValid(dimensions = {}) {
  return !!(dimensions && asNumber(dimensions.width) && asNumber(dimensions.height));
}

function dimensionsAreUseful(dimensions = {}) {
  const width = asNumber(dimensions && dimensions.width);
  const height = asNumber(dimensions && dimensions.height);
  return !!(width && height && width >= 24 && height >= 24 && width * height >= 1024);
}

async function decodeDimensions(absolutePath, mimeType, buffer) {
  const fromHeader = dimensionsFromBuffer(buffer, mimeType);
  if (dimensionsAreValid(fromHeader)) return fromHeader;
  try {
    const { loadImage } = require('canvas');
    const image = await loadImage(absolutePath);
    return { width: image.width, height: image.height };
  } catch (_) {
    return null;
  }
}

async function resolveRenderVisualAsset(sourceVisual = {}, opts = {}) {
  const basic = basicAssetCheck(sourceVisual, opts);
  if (!basic.valid) return basic;
  let buffer;
  try {
    buffer = fs.readFileSync(basic.absolutePath);
  } catch (_) {
    return { ...basic, valid: false, reasonIfInvalid: 'file_not_readable' };
  }
  const dimensions = await decodeDimensions(basic.absolutePath, basic.mimeType, buffer);
  if (!dimensionsAreValid(dimensions)) {
    return { ...basic, valid: false, reasonIfInvalid: 'invalid_image_dimensions' };
  }
  if (!dimensionsAreUseful(dimensions)) {
    return {
      ...basic,
      valid: false,
      width: dimensions.width,
      height: dimensions.height,
      reasonIfInvalid: 'image_too_small_for_educational_visual',
    };
  }
  return {
    ...basic,
    valid: true,
    width: dimensions.width,
    height: dimensions.height,
    browserSrc: `data:${basic.mimeType};base64,${buffer.toString('base64')}`,
    reasonIfInvalid: '',
  };
}

function renderText(slide = {}, scene = {}) {
  const data = scene.visualElements || scene.visualData || {};
  return [
    slide.title,
    slide.caption,
    slide.narration,
    ...(slide.bullets || []),
    ...(slide.visual_nodes || []),
    scene.topic,
    scene.title,
    scene.sceneTitle,
    scene.learningPoint,
    scene.narration,
    ...(data.nodes || []),
    ...(data.operations || []),
  ].filter(Boolean).join(' ').toLowerCase();
}

function generatedFallback(textValue) {
  const text = clean(textValue).toLowerCase();
  if (/\b(?:binary search tree|bst|tree|root|leaf|subtree|tree insertion)\b/.test(text)) {
    return { slideType: 'tree', sceneType: 'tree_visual', nodes: ['root', 'left child', 'right child', 'insertion path'] };
  }
  if (/\b(?:stack|lifo|push|pop|top pointer)\b/.test(text)) {
    return { slideType: 'stack_queue', sceneType: 'stack_operation', nodes: ['top', 'push', 'pop', 'LIFO order'] };
  }
  if (/\b(?:queue|fifo|enqueue|dequeue|front|rear)\b/.test(text)) {
    return { slideType: 'stack_queue', sceneType: 'queue_operation', nodes: ['front', 'rear', 'enqueue', 'dequeue'] };
  }
  if (/\b(?:linked list|head pointer|next pointer|node link)\b/.test(text)) {
    return { slideType: 'linkedlist', sceneType: 'linked_list_operation', nodes: ['head', 'node', 'next pointer', 'link update'] };
  }
  if (/\b(?:hash table|hash function|bucket|collision|load factor)\b/.test(text)) {
    return { slideType: 'hash_table', sceneType: 'hash_table_operation', nodes: ['key', 'hash function', 'bucket index', 'collision handling'] };
  }
  if (/\b(?:big[\s-]?o|complexity|growth rate|o\(\s*n)\b/.test(text)) {
    return { slideType: 'bigo_chart', sceneType: 'big_o_growth', nodes: ['input size', 'growth rate', 'O(1)', 'O(n)'] };
  }
  if (/\b(?:class|object|inheritance|polymorphism|encapsulation|interface|abstract class)\b/.test(text)) {
    return { slideType: 'class_diagram', sceneType: 'class_object', nodes: ['class', 'state', 'behavior', 'relationship'] };
  }
  if (/\b(?:compare|comparison|classification|types|categories|versus)\b/.test(text)) {
    return { slideType: 'table', sceneType: 'classification_table', nodes: ['category', 'meaning', 'example'] };
  }
  if (/\b(?:process|operation|step|flow|dns|tcp|routing|sql|transaction|insert|select)\b/.test(text)) {
    return { slideType: 'flow', sceneType: 'process_flow', nodes: ['input', 'process step', 'result'] };
  }
  return { slideType: 'cards', sceneType: 'concept_cards', nodes: ['source concept', 'supporting detail', 'review point'] };
}

function removeImageFields(value = {}) {
  const next = { ...value };
  for (const key of [
    'imagePath', 'image_path', 'imageUrl', 'image_url',
    'sourceImagePath', 'source_image_path', 'sourceImageUrl', 'source_image_url',
    'sourceVisualId', 'source_visual_id',
    'assetRole', 'asset_role', 'placement',
  ]) delete next[key];
  return next;
}

function sourceInputFor(slide = {}, scene = {}) {
  const data = scene.visualElements || scene.visualData || {};
  const plan = scene.visualPlan || {};
  const sourceVisualIds = scene.sourceVisualIds || plan.sourceVisualIds || [];
  return {
    imagePath: slide.image_path || slide.imagePath || data.imagePath || data.image_path || data.sourceImagePath || data.source_image_path || plan.imagePath || plan.filePath || '',
    imageUrl: slide.image_url || slide.imageUrl || data.imageUrl || data.image_url || data.sourceImageUrl || data.source_image_url || plan.imageUrl || '',
    sourceVisualId: slide.source_visual_id || slide.sourceVisualId || data.sourceVisualId || data.source_visual_id || scene.sourceVisualId || plan.sourceVisualId || sourceVisualIds[0] || null,
    materialId: data.materialId || data.material_id || scene.materialId || scene.material_id || null,
    assetRole: data.assetRole || data.asset_role || scene.assetRole || scene.asset_role || slide.asset_role || slide.assetRole || '',
    placement: data.placement || scene.placement || slide.placement || null,
  };
}

function validOverlayPlacement(value) {
  if (!value || typeof value !== 'object') return false;
  return ['x', 'y', 'width', 'height'].every(key => Number.isFinite(Number(value[key]))) &&
    Number(value.width) > 0 && Number(value.height) > 0 &&
    Number(value.x) >= 0 && Number(value.y) >= 0 &&
    Number(value.x) + Number(value.width) <= 1 &&
    Number(value.y) + Number(value.height) <= 1;
}

function isSourceReference(slide = {}, scene = {}) {
  const data = scene.visualElements || scene.visualData || {};
  const plan = scene.visualPlan || {};
  return SOURCE_REFERENCE_TYPES.has(clean(slide.visual_type || slide.visualType).toLowerCase())
    || SOURCE_REFERENCE_TYPES.has(clean(scene.visualType || scene.visualTemplate || data.type).toLowerCase())
    || !!(slide.image_path || slide.imagePath || slide.image_url || slide.imageUrl || data.imagePath || data.image_path || data.imageUrl || data.image_url)
    || !!(data.sourceImagePath || data.source_image_path || data.sourceImageUrl || data.source_image_url)
    || !!(scene.sourceVisualId || plan.useSourceImage || plan.sourceVisualId || (scene.sourceVisualIds || []).length);
}

function sceneWithResolvedImage(scene = {}, resolved) {
  const data = scene.visualElements || scene.visualData || {};
  const sourceType = data.slideNumber != null || data.slide_number != null
    ? 'source_slide_reference'
    : 'source_page_reference';
  const nextData = {
    ...data,
    type: sourceType,
    imagePath: resolved.absolutePath,
    imageUrl: resolved.browserSrc,
    sourceVisualId: resolved.sourceVisualId || data.sourceVisualId || null,
    assetRole: 'storyboard_frame_image',
    placement: { mode: 'frame', layoutTemplate: 'source_main' },
  };
  const composition = visualComposition.normalizeCompositionPlan(scene.visualPlan, { hasSourceImage: true });
  return {
    ...scene,
    visualType: sourceType,
    visualTemplate: sourceType,
    visualData: nextData,
    visualElements: { ...nextData },
    visualPlan: {
      ...(scene.visualPlan || {}),
      ...composition,
      sourceVisualUsed: resolved.sourceVisualId || data.sourceVisualId || null,
      fallbackGeneratedVisual: false,
    },
  };
}

function sceneWithFallback(scene = {}, fallback, warning) {
  const data = removeImageFields(scene.visualElements || scene.visualData || {});
  const sourceNodes = (data.nodes || []).filter(node => !/^page\s+\d+$/i.test(clean(node)));
  const nodes = fallback.sceneType === 'concept_cards'
    ? [...new Set([...sourceNodes, ...(fallback.nodes || [])])].slice(0, 6)
    : fallback.nodes;
  const nextData = {
    ...data,
    type: fallback.sceneType,
    nodes,
    caption: clean(data.caption) && !/^page\s+\d+/i.test(clean(data.caption))
      ? data.caption
      : 'Generated visual fallback from the source topic.',
  };
  return {
    ...scene,
    visualType: fallback.sceneType,
    visualTemplate: fallback.sceneType,
    visualData: nextData,
    visualElements: { ...nextData },
    visualPlan: {
      ...(scene.visualPlan || {}),
      ...visualComposition.normalizeCompositionPlan(scene.visualPlan),
      sourceVisualUsed: null,
      fallbackGeneratedVisual: true,
    },
    sourceVisualId: null,
    renderAssetWarning: warning,
    repairHistory: [
      ...(scene.repairHistory || []),
      { action: 'fallback_invalid_source_visual', reason: warning.reason, fallbackVisualType: fallback.sceneType },
    ],
  };
}

function stripEmbeddedBrowserAssets(script = {}) {
  return {
    ...script,
    slides: (script.slides || []).map(slide => {
      const next = { ...slide };
      if (/^data:/i.test(clean(next.image_url))) next.image_url = '';
      return next;
    }),
  };
}

async function preflightScriptAssets(script = {}, opts = {}) {
  const slides = (script.slides || []).map(slide => ({ ...slide }));
  const scenes = (opts.scenes || []).map(scene => ({ ...scene }));
  const warnings = [];

  for (let index = 0; index < slides.length; index += 1) {
    const slide = slides[index];
    const scene = scenes[index] || {};
    const roleInput = sourceInputFor(slide, scene);
    if (roleInput.assetRole === 'source_reference_image') {
      slides[index] = removeImageFields(slide);
      if (scenes[index]) {
        const data = removeImageFields(scene.visualElements || scene.visualData || {});
        scenes[index] = { ...scene, visualData: data, visualElements: { ...data } };
      }
      log.warn('render_visual_asset_role_rejected', { sceneIndex: index, sceneId: scene.id || null, assetRole: roleInput.assetRole });
      continue;
    }
    if (roleInput.assetRole === 'overlay_asset' && !validOverlayPlacement(roleInput.placement)) {
      slides[index] = removeImageFields(slide);
      if (scenes[index]) {
        const data = removeImageFields(scene.visualElements || scene.visualData || {});
        scenes[index] = { ...scene, visualData: data, visualElements: { ...data } };
      }
      warnings.push({ sceneIndex: index, sceneId: scene.id || null, assetRole: roleInput.assetRole, reason: 'overlay_placement_required', fallback: true });
      log.warn('render_visual_asset_role_rejected', { sceneIndex: index, sceneId: scene.id || null, assetRole: roleInput.assetRole, reason: 'overlay_placement_required' });
      continue;
    }
    if (!isSourceReference(slide, scene)) continue;
    const sourceInput = sourceInputFor(slide, scene);
    const resolved = await resolveRenderVisualAsset(sourceInput, {
      materialId: opts.materialId,
      requireTrustedAssociation: false,
    });
    if (resolved.valid) {
      const composition = visualComposition.normalizeCompositionPlan(scene.visualPlan, { hasSourceImage: true });
      slides[index] = {
        ...slide,
        visual_type: 'source_reference',
        image_path: resolved.absolutePath,
        image_url: resolved.browserSrc,
        source_visual_id: resolved.sourceVisualId || slide.source_visual_id || null,
        asset_role: 'storyboard_frame_image',
        placement: { mode: 'frame', layoutTemplate: 'source_main' },
        composition_mode: composition.compositionMode,
        layout_template: composition.layoutTemplate,
        composition_regions: composition.regions,
      };
      if (scenes[index]) scenes[index] = sceneWithResolvedImage(scene, resolved);
      log.info('render_visual_asset', {
        sceneIndex: index,
        sceneId: scene.id || null,
        visualType: scene.visualType || scene.visualTemplate || slide.visual_type || null,
        sourceVisualId: resolved.sourceVisualId || null,
        requestedPath: resolved.requestedPath || '',
        absolutePath: resolved.absolutePath,
        publicUrl: resolved.publicUrl,
        valid: true,
        fallback: false,
        dimensions: `${resolved.width}x${resolved.height}`,
        compositionMode: composition.compositionMode,
        layoutTemplate: composition.layoutTemplate,
        regions: composition.regions,
        collisionDetected: composition.collisionDetected,
      });
      continue;
    }

    const fallback = generatedFallback(renderText(slide, scene));
    const warning = {
      sceneIndex: index,
      sceneId: scene.id || null,
      sourceVisualId: sourceInput.sourceVisualId || null,
      visualType: scene.visualType || scene.visualTemplate || slide.visual_type || null,
      requestedPath: resolved.requestedPath || sourceInput.imagePath || '',
      absolutePath: resolved.absolutePath || '',
      publicUrl: resolved.publicUrl || '',
      valid: false,
      fallback: true,
      fallbackVisualType: fallback.sceneType,
      reason: resolved.reasonIfInvalid || 'invalid_source_visual',
    };
    warnings.push(warning);
    slides[index] = {
      ...removeImageFields(slide),
      visual_type: fallback.slideType,
      visual_nodes: fallback.sceneType === 'concept_cards'
        ? [...new Set([
          ...(slide.visual_nodes || []).filter(node => !/^page\s+\d+$/i.test(clean(node))),
          ...(fallback.nodes || []),
        ])].slice(0, 6)
        : fallback.nodes,
      caption: 'Generated visual fallback from the source topic.',
      composition_mode: 'generated_only',
      layout_template: 'generated_main',
      composition_regions: visualComposition.LAYOUT_TEMPLATES.generated_main,
    };
    if (scenes[index]) scenes[index] = sceneWithFallback(scene, fallback, warning);
    log.warn('render_visual_asset', warning);
  }

  return { script: { ...script, slides }, scenes, warnings };
}

module.exports = {
  basicAssetCheck,
  dimensionsAreValid,
  dimensionsAreUseful,
  generatedFallback,
  preflightScriptAssets,
  resolveRenderVisualAsset,
  stripEmbeddedBrowserAssets,
  _internals: {
    dimensionsFromBuffer,
    filePathCandidates,
    isSourceReference,
    isWithin,
    mimeTypeFor,
    removeImageFields,
    resolveLocalFilePath,
    sceneWithResolvedImage,
  },
};
