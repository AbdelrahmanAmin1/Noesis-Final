'use strict';

const { z } = require('zod');
const { getDb } = require('../config/db');
const ai = require('./ai.service');
const storyboardSvc = require('./storyboard.service');
const materialUnderstanding = require('./material-understanding.service');
const sourceVisualCandidates = require('./source-visual-candidates.service');
const sourceGroundingJudge = require('./source-grounding-judge.service');
const visualRegistry = require('../utils/visual-registry');
const prompts = require('../utils/prompts');
const { parseJsonSafe } = require('../utils/jsonSafe');
const { HttpError } = require('../middleware/error');

function nowIso() { return new Date().toISOString(); }

const ALLOWED_VISUAL_TYPES = new Set([
  'encapsulation_boundary',
  'class_object',
  'inheritance_uml',
  'polymorphism_dispatch',
  'linked_list_operation',
  'stack_operation',
  'queue_operation',
  'hash_table_operation',
  'tree_visual',
  'big_o_growth',
  'code_walkthrough',
  'process_flow',
  'comparison_contrast',
  'concept_cards',
  'classification_table',
  'comparison_table',
  'source_page_reference',
  'source_slide_reference',
  'no_visual',
  'learning_objectives',
  'summary_path',
]);

const VISUAL_REQUIRED_RE = /missing_required_visual|domain:(?:oop_missing_class_object_visual|data_structure_missing_operation_visual|algorithm_missing_flow_or_complexity_visual|missing_code_scene)/i;

const RepairPatchSchema = z.object({
  sceneId: z.string().min(1),
  reason: z.string().optional().default(''),
  patch: z.object({}).passthrough(),
});

const RepairSchema = z.object({
  patches: z.array(RepairPatchSchema).optional().default([]),
  skipped: z.array(z.object({
    sceneId: z.string().optional().default(''),
    reason: z.string().optional().default(''),
  })).optional().default([]),
});

function clean(value, max = 800) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, Math.max(0, max - 3)).trim()}...` : text;
}

function asArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function parseJson(value, fallback) {
  try { return JSON.parse(value || ''); } catch (_) { return fallback; }
}

function qualityForResponse(quality = {}) {
  const warnings = asArray(quality.warnings);
  return {
    ...quality,
    classified: storyboardSvc.classifyWarnings(warnings),
    warningDetails: warnings.map(code => ({
      code,
      label: clean(String(code || '').replace(/_/g, ' '), 160),
      fix: null,
    })),
  };
}

function getMaterialChunks(materialId, limit = 24) {
  const db = getDb();
  return db.prepare(`SELECT id, idx, text, chapter_id, source_page, chapter_title, heading,
      slide_number, slide_title, section_title, has_code, keywords_json, source_kind, source_visual_id
    FROM chunks WHERE material_id=? ORDER BY idx LIMIT ?`).all(materialId, limit);
}

function getSourcePages(materialId, limit = 20) {
  try {
    const db = getDb();
    return db.prepare(`SELECT page_number, slide_number, merged_text, source_kind, heading, thumbnail_path
      FROM material_source_pages WHERE material_id=? ORDER BY COALESCE(page_number, slide_number, 0), id LIMIT ?`).all(materialId, limit);
  } catch (_) {
    return [];
  }
}

function visualLabels(data = {}) {
  return [
    ...asArray(data.nodes).map(item => typeof item === 'string' ? item : item && (item.label || item.name || item.id || item.value)),
    ...asArray(data.operations).map(item => typeof item === 'string' ? item : item && (item.label || item.name || item.step)),
    ...asArray(data.edges).map(edge => Array.isArray(edge) ? edge.join(' -> ') : edge && typeof edge === 'object' ? [edge.from || edge.source, edge.to || edge.target, edge.label].filter(Boolean).join(' -> ') : edge),
    data.caption,
  ].filter(Boolean).map(item => clean(item, 90));
}

function compactScene(scene = {}, warningList = []) {
  const data = scene.visualElements || scene.visualData || {};
  return {
    id: scene.id,
    type: scene.type || scene.sceneType || '',
    title: scene.sceneTitle || scene.title || '',
    learningPoint: scene.learningPoint || scene.teachingGoal || scene.studentFacingGoal || '',
    narration: clean(scene.narration, 520),
    visualType: scene.visualType || scene.visualTemplate || data.type || '',
    visualLabels: visualLabels(data).slice(0, 8),
    warnings: warningList,
    sourceEvidence: asArray(scene.sourceEvidence).slice(0, 3).map(item => ({
      chunkId: item.chunkId,
      heading: item.heading || item.chapterTitle || item.slideTitle || '',
      quote: clean(item.quote || item.text || item.excerpt || '', 220),
    })),
  };
}

function chunkEvidence(chunk) {
  return {
    chunkId: chunk.id,
    quote: clean(chunk.text, 260),
    heading: chunk.heading || chunk.chapter_title || chunk.slide_title || chunk.section_title || '',
    chapterTitle: chunk.chapter_title || '',
    slideNumber: chunk.slide_number || null,
    slideTitle: chunk.slide_title || '',
    sourcePage: chunk.source_page || null,
  };
}

function sourceOutlineFor(storyboard, chunks) {
  const understanding = materialUnderstandingFor(storyboard);
  return (understanding && understanding.sourceOutline) || materialUnderstanding.buildSourceOutline(chunks, {
    explicitQuery: storyboard.topic,
    title: storyboard.topic,
  });
}

function materialUnderstandingFor(storyboard = {}) {
  return storyboard.materialUnderstanding || storyboard.topicDetection || storyboard.understanding || {};
}

function sceneVisualResult(quality, sceneId) {
  const scenes = quality && quality.visual && Array.isArray(quality.visual.scenes) ? quality.visual.scenes : [];
  return scenes.find(item => item && item.sceneId === sceneId) || null;
}

function warningsForScene(quality, sceneId, scene = {}) {
  const out = new Set(asArray(scene.qualityWarnings));
  for (const warning of asArray(quality && quality.warnings)) {
    if (String(warning).startsWith(`${sceneId}:`)) out.add(String(warning).slice(String(sceneId).length + 1));
  }
  const visual = sceneVisualResult(quality, sceneId);
  for (const warning of asArray(visual && visual.warnings)) out.add(warning);
  return [...out];
}

function globalWarnings(quality = {}) {
  return asArray(quality.warnings).filter(warning => {
    const prefix = String(warning).split(':')[0];
    return /^(domain|topic|storyboard|grounding|enrichment|curated)$/.test(prefix);
  });
}

function targetVisualTypeFromWarning(code = '', topic = '') {
  const match = String(code || '').match(/missing_required_visual:([a-z0-9_]+)/i);
  if (match) return match[1];
  const lower = String(topic || '').toLowerCase();
  if (/linked/.test(lower)) return 'linked_list_operation';
  if (/tree|bst|binary/.test(lower)) return 'tree_visual';
  if (/hash/.test(lower)) return 'hash_table_operation';
  if (/stack/.test(lower)) return 'stack_operation';
  if (/queue/.test(lower)) return 'queue_operation';
  if (/encapsulation/.test(lower)) return 'encapsulation_boundary';
  if (/inheritance/.test(lower)) return 'inheritance_uml';
  if (/polymorphism/.test(lower)) return 'polymorphism_dispatch';
  if (/class|object|interface|abstraction/.test(lower)) return 'class_object';
  if (/big.?o|complexity/.test(lower)) return 'big_o_growth';
  if (/algorithm|steps?|process/.test(lower)) return 'process_flow';
  return '';
}

function sceneText(scene = {}) {
  const data = scene.visualElements || scene.visualData || {};
  return [
    scene.id,
    scene.type,
    scene.title,
    scene.sceneTitle,
    scene.learningPoint,
    scene.teachingGoal,
    scene.studentFacingGoal,
    scene.narration,
    visualLabels(data).join(' '),
  ].filter(Boolean).join(' ').toLowerCase();
}

function chooseSceneForGlobalWarning(storyboard, warning) {
  const target = targetVisualTypeFromWarning(warning, storyboard.topic);
  const scenes = asArray(storyboard.scenes);
  if (!scenes.length) return null;
  const targetTerms = String(target || '').replace(/_/g, ' ').split(/\s+/).filter(Boolean);
  return [...scenes].sort((a, b) => {
    const score = scene => {
      const text = sceneText(scene);
      let n = /deep_explanation|diagram|concept|definition|code|walkthrough/.test(text) ? 3 : 0;
      for (const term of targetTerms) if (term.length > 3 && text.includes(term)) n += 2;
      if (/recap|checkpoint|objectives/.test(text)) n -= 1;
      return n;
    };
    return score(b) - score(a);
  })[0];
}

function targetScenes(storyboard, quality, payload = {}) {
  const explicit = new Set(asArray(payload.sceneIds || payload.scene_ids).map(String));
  const requestedWarnings = asArray(payload.warningCodes || payload.warning_codes).map(String);
  const ids = new Set(explicit);
  for (const warning of asArray(quality.warnings)) {
    const first = String(warning).split(':')[0];
    if (!/^(domain|topic|storyboard|grounding|enrichment|curated)$/.test(first)) ids.add(first);
  }
  for (const scene of storyboard.scenes || []) {
    if (warningsForScene(quality, scene.id, scene).length) ids.add(scene.id);
  }
  for (const warning of [...requestedWarnings, ...globalWarnings(quality)]) {
    const scene = chooseSceneForGlobalWarning(storyboard, warning);
    if (scene && scene.id) ids.add(scene.id);
  }
  const allowed = new Set((storyboard.scenes || []).map(scene => scene.id));
  return [...ids].filter(id => allowed.has(id)).slice(0, 4);
}

function sourceVisualPayload(candidate) {
  const sourcePage = candidate.sourcePage ?? candidate.pageNumber ?? null;
  const slideNumber = candidate.slideNumber ?? null;
  const label = slideNumber != null ? `Slide ${slideNumber}` : `Page ${sourcePage || 1}`;
  const heading = candidate.heading || candidate.visualTypeGuess || 'source visual';
  return {
    type: slideNumber != null ? 'source_slide_reference' : 'source_page_reference',
    nodes: [heading].filter(Boolean),
    edges: [],
    details: {},
    operations: [],
    caption: candidate.caption || `${label}: ${heading}`,
    imagePath: candidate.imagePath || candidate.thumbnailPath || null,
    imageUrl: candidate.imageUrl || null,
    sourceVisualId: candidate.id || null,
    sourcePage,
    slideNumber,
    ocrText: candidate.ocrText || null,
    nearbyText: candidate.nearbyText || null,
    visualTypeGuess: candidate.visualTypeGuess || null,
  };
}

function sourceVisualMaps(sourceVisuals = []) {
  const byId = new Map();
  const paths = new Map();
  for (const candidate of sourceVisuals || []) {
    if (!candidate) continue;
    if (candidate.id != null) byId.set(String(candidate.id), candidate);
    for (const key of ['imagePath', 'thumbnailPath', 'imageUrl']) {
      if (candidate[key]) paths.set(String(candidate[key]), candidate);
    }
  }
  return { byId, paths };
}

function compactRepairPrompt(context) {
  const allowed = [...ALLOWED_VISUAL_TYPES].join(', ');
  return [
    'You are repairing a Noesis storyboard. Return ONLY strict JSON.',
    'Use the uploaded material as source of truth. Do not introduce unrelated topics.',
    'Repair only the listed weak scenes. Do not add, remove, or reorder scenes.',
    'Choose no_visual only when a visual is unnecessary, never for required visual coverage blockers.',
    `Allowed visual types: ${allowed}.`,
    '',
    'Return shape:',
    '{"patches":[{"sceneId":"scene-id","reason":"why this fixes the warning","patch":{...allowed scene fields...}}],"skipped":[{"sceneId":"scene-id","reason":"why skipped"}]}',
    '',
    'Allowed patch fields: title, sceneTitle, teachingGoal, learningPoint, studentFacingGoal, narration, onScreenText, motionInstructions, visualType, visualTemplate, visualData, visualElements, visualGrounding, visualPurpose, visualRationale, viewerTakeaway, sourceEvidence, code.',
    'For source visuals, set visualType to source_page_reference or source_slide_reference and include sourceVisualId from the candidates.',
    'For generated visuals, provide concrete nodes, edges, operations, and caption.',
    '',
    `Topic: ${context.topic}`,
    `Domain: ${context.domain || 'unknown'}`,
    `Warnings: ${context.beforeWarnings.slice(0, 24).join(' | ')}`,
    `Key concepts: ${context.keyConcepts.slice(0, 14).join(', ')}`,
    '',
    `Source outline: ${JSON.stringify(context.sourceOutline).slice(0, 3000)}`,
    `Source excerpts: ${JSON.stringify(context.chunks).slice(0, 5000)}`,
    `OCR/page text: ${JSON.stringify(context.sourcePages).slice(0, 2500)}`,
    `Source visual candidates: ${JSON.stringify(context.sourceVisuals).slice(0, 3000)}`,
    `Weak scenes: ${JSON.stringify(context.scenes).slice(0, 6000)}`,
  ].join('\n');
}

async function generateRepairPlan(context) {
  const raw = await ai.generate(compactRepairPrompt(context), {
    feature: 'storyboard_repair',
    format: 'json',
    temperature: 0.2,
    num_predict: 1800,
  });
  return parseJsonSafe(raw, RepairSchema, async (txt) => ai.generate(prompts.REPAIR_JSON(txt), {
    feature: 'storyboard_repair',
    temperature: 0,
    num_predict: 900,
  }));
}

function sanitizeStringList(value, limit, max) {
  return asArray(value).map(item => clean(item, max)).filter(Boolean).slice(0, limit);
}

function sanitizeVisualData(data = {}) {
  return {
    ...data,
    type: clean(data.type || '', 80),
    nodes: sanitizeStringList(data.nodes, 8, 70),
    edges: asArray(data.edges).slice(0, 8).map(edge => Array.isArray(edge)
      ? edge.map(item => clean(item, 50)).filter(Boolean).slice(0, 3)
      : edge && typeof edge === 'object'
        ? {
          from: clean(edge.from || edge.source || '', 50),
          to: clean(edge.to || edge.target || '', 50),
          label: clean(edge.label || '', 50),
        }
        : clean(edge, 90)).filter(Boolean),
    operations: sanitizeStringList(data.operations, 6, 90),
    caption: clean(data.caption || '', 180),
  };
}

function bestEvidenceForScene(scene, chunks = []) {
  if (!chunks.length) return [];
  const text = sceneText(scene);
  const ranked = chunks.map((chunk, index) => {
    const chunkText = `${chunk.heading || ''} ${chunk.chapter_title || ''} ${chunk.text || ''}`.toLowerCase();
    let score = 0;
    for (const word of text.split(/[^a-z0-9]+/).filter(w => w.length >= 5)) {
      if (chunkText.includes(word)) score += 1;
    }
    return { chunk, index, score };
  }).sort((a, b) => b.score - a.score || a.index - b.index);
  return ranked.slice(0, 2).map(item => chunkEvidence(item.chunk));
}

function sanitizeEvidence(value, context) {
  const valid = context.validChunkIds;
  const out = [];
  for (const item of asArray(value)) {
    const chunkId = item && item.chunkId != null ? Number(item.chunkId) : item && item.chunk_id != null ? Number(item.chunk_id) : null;
    if (!Number.isInteger(chunkId) || !valid.has(chunkId)) continue;
    const chunk = context.chunkById.get(chunkId);
    out.push({
      ...chunkEvidence(chunk || { id: chunkId, text: item.quote || item.text || '', heading: item.heading || '' }),
      quote: clean(item.quote || item.text || item.excerpt || (chunk && chunk.text) || '', 260),
    });
  }
  return out;
}

function materialText(context) {
  return context.chunks.map(chunk => chunk.text || '').join('\n');
}

function sanitizePatch(scene, rawPatch, context) {
  const patch = rawPatch && typeof rawPatch === 'object' ? rawPatch : {};
  const next = {};
  for (const key of ['title', 'sceneTitle', 'teachingGoal', 'learningPoint', 'studentFacingGoal', 'visualPurpose', 'visualRationale', 'viewerTakeaway']) {
    if (patch[key] != null) next[key] = clean(patch[key], 220);
  }
  if (patch.narration != null) next.narration = clean(patch.narration, 1400);
  if (Array.isArray(patch.onScreenText)) next.onScreenText = sanitizeStringList(patch.onScreenText, 4, 90);
  if (Array.isArray(patch.motionInstructions)) next.motionInstructions = sanitizeStringList(patch.motionInstructions, 5, 120);

  const mergedVisualData = {
    ...(patch.visualData && typeof patch.visualData === 'object' ? patch.visualData : {}),
    ...(patch.visualElements && typeof patch.visualElements === 'object' ? patch.visualElements : {}),
  };
  const requestedVisual = patch.visualType || patch.visualTemplate || mergedVisualData.type || scene.visualType || scene.visualTemplate || '';
  const resolved = visualRegistry.resolveVisualType(requestedVisual, {
    topic: context.topic,
    title: next.title || scene.title,
    text: [next.narration, next.learningPoint, visualLabels(mergedVisualData).join(' ')].filter(Boolean).join(' '),
  });
  if (!resolved.supported || !ALLOWED_VISUAL_TYPES.has(resolved.canonical)) {
    return { ok: false, reason: `unsupported_visual_type:${requestedVisual || 'missing'}` };
  }
  const visualType = resolved.canonical;
  const targetWarnings = asArray(context.sceneWarnings).join(' ');
  const sourceEvidence = sanitizeEvidence(patch.sourceEvidence, context);
  const preservedEvidence = asArray(scene.sourceEvidence).filter(item => item && item.chunkId != null && context.validChunkIds.has(Number(item.chunkId)));
  const evidence = sourceEvidence.length ? sourceEvidence : (preservedEvidence.length ? preservedEvidence : bestEvidenceForScene({ ...scene, ...next }, context.chunks));
  if (Array.isArray(patch.sourceEvidence) && patch.sourceEvidence.length && !sourceEvidence.length) {
    return { ok: false, reason: 'source_evidence_not_from_uploaded_material' };
  }

  if (visualType === 'no_visual') {
    const strongNarration = String(next.narration || scene.narration || '').length >= 180;
    if (VISUAL_REQUIRED_RE.test(targetWarnings)) return { ok: false, reason: 'no_visual_cannot_fix_required_visual' };
    if (!evidence.length && !strongNarration) return { ok: false, reason: 'no_visual_needs_source_or_strong_narration' };
  }

  const maps = context.sourceVisualMaps;
  let visualData = sanitizeVisualData(mergedVisualData);
  const sourceVisualId = mergedVisualData.sourceVisualId || mergedVisualData.source_visual_id || patch.sourceVisualId || patch.source_visual_id;
  const hasImagePath = !!(mergedVisualData.imagePath || mergedVisualData.image_path || mergedVisualData.imageUrl || mergedVisualData.image_url);
  const sourceRef = visualType === 'source_page_reference' || visualType === 'source_slide_reference';
  if (sourceRef) {
    const candidate = sourceVisualId != null ? maps.byId.get(String(sourceVisualId)) : null;
    if (!candidate) return { ok: false, reason: 'source_visual_candidate_not_found' };
    if (!(candidate.imagePath || candidate.thumbnailPath || candidate.imageUrl)) {
      return { ok: false, reason: 'source_visual_candidate_has_no_image' };
    }
    visualData = sourceVisualPayload(candidate);
  } else if (hasImagePath) {
    const candidate = maps.paths.get(String(mergedVisualData.imagePath || mergedVisualData.image_path || mergedVisualData.imageUrl || mergedVisualData.image_url));
    if (!candidate) return { ok: false, reason: 'image_path_not_from_source_visual_candidate' };
    visualData.imagePath = candidate.imagePath || candidate.thumbnailPath || null;
    visualData.imageUrl = candidate.imageUrl || null;
    visualData.sourceVisualId = candidate.id || null;
  }
  visualData.type = visualType;

  next.visualType = visualType;
  next.visualTemplate = visualType;
  next.visualData = visualData;
  next.visualElements = { ...visualData };
  next.sourceEvidence = evidence;
  next.visualGrounding = {
    ...(scene.visualGrounding || {}),
    ...(patch.visualGrounding && typeof patch.visualGrounding === 'object' ? patch.visualGrounding : {}),
    sceneIntent: clean((patch.visualGrounding && patch.visualGrounding.sceneIntent) || next.teachingGoal || scene.teachingGoal || scene.learningPoint || '', 240),
    selectedVisualReason: clean((patch.visualGrounding && patch.visualGrounding.selectedVisualReason) || `AI repair selected ${visualType.replace(/_/g, ' ')} using uploaded source evidence.`, 260),
    requiredVisualEvidence: sanitizeStringList((patch.visualGrounding && patch.visualGrounding.requiredVisualEvidence) || visualData.nodes || evidence.map(item => item.heading), 6, 90),
  };
  if (!next.visualPurpose) next.visualPurpose = `Use ${visualType.replace(/_/g, ' ')} to make this source-backed scene concrete.`;
  if (!next.visualRationale) next.visualRationale = 'Selected during AI repair because it matches the uploaded source evidence and scene warning.';
  if (!next.viewerTakeaway) next.viewerTakeaway = next.learningPoint || scene.learningPoint || scene.studentFacingGoal || scene.title || context.topic;

  if (patch.code && typeof patch.code === 'object') {
    const content = clean(patch.code.content || '', 4000);
    if (content && !materialText(context).includes(content) && !(scene.code && scene.code.content === content)) {
      return { ok: false, reason: 'code_not_from_uploaded_material' };
    }
    next.code = { ...(scene.code || {}), ...patch.code, content };
  }

  return { ok: true, patch: next };
}

function mergedScene(scene, patch) {
  return {
    ...scene,
    ...patch,
    visualData: patch.visualData ? { ...(scene.visualData || {}), ...patch.visualData } : scene.visualData,
    visualElements: patch.visualElements ? { ...(scene.visualElements || {}), ...patch.visualElements } : scene.visualElements,
    visualGrounding: patch.visualGrounding ? { ...(scene.visualGrounding || {}), ...patch.visualGrounding } : scene.visualGrounding,
  };
}

function warningSeverity(code) {
  const { CRITICAL_PATTERNS, INFO_PATTERNS } = storyboardSvc;
  if (CRITICAL_PATTERNS && CRITICAL_PATTERNS.some(p => p.test(code))) return 2;
  if (INFO_PATTERNS && INFO_PATTERNS.some(p => p.test(code))) return 0;
  return 1;
}

function sceneImproved(beforeQuality, afterQuality, sceneId) {
  const beforeScene = sceneVisualResult(beforeQuality, sceneId);
  const afterScene = sceneVisualResult(afterQuality, sceneId);
  const beforeAll = asArray(beforeQuality.warnings).filter(w => String(w).startsWith(`${sceneId}:`))
    .concat(asArray(beforeScene && beforeScene.warnings));
  const afterAll = asArray(afterQuality.warnings).filter(w => String(w).startsWith(`${sceneId}:`))
    .concat(asArray(afterScene && afterScene.warnings));
  if (afterAll.length < beforeAll.length) return true;
  if (beforeScene && beforeScene.passed === false && afterScene && afterScene.passed === true) return true;
  if (asArray(afterQuality.warnings).length < asArray(beforeQuality.warnings).length) return true;
  const beforeCritical = beforeAll.filter(w => warningSeverity(w) === 2).length;
  const afterCritical = afterAll.filter(w => warningSeverity(w) === 2).length;
  if (beforeCritical > 0 && afterCritical < beforeCritical) return true;
  const beforeScore = beforeAll.reduce((s, w) => s + warningSeverity(w), 0);
  const afterScore = afterAll.reduce((s, w) => s + warningSeverity(w), 0);
  if (afterScore < beforeScore) return true;
  return false;
}

function sceneWarningCodesFromQuality(quality, sceneId) {
  const out = new Set();
  for (const warning of asArray(quality.warnings)) {
    if (String(warning).startsWith(`${sceneId}:`)) out.add(String(warning).slice(String(sceneId).length + 1));
  }
  const visual = sceneVisualResult(quality, sceneId);
  for (const warning of asArray(visual && visual.warnings)) out.add(warning);
  return [...out];
}

function persistRepairedStoryboard(userId, id, board, storyboard, quality, repairTrace) {
  const db = getDb();
  const nextStatus = quality.passed ? 'draft' : 'needs_review';
  const updateScene = db.prepare('UPDATE video_storyboard_scenes SET scene_json=?, quality_json=?, approved=0, updated_at=? WHERE storyboard_id=? AND scene_id=?');
  db.transaction(() => {
    db.prepare(`UPDATE video_storyboards
      SET storyboard_json=?, quality_json=?, status=?, approved_at=NULL, updated_at=?
      WHERE id=? AND user_id=?`)
      .run(
        JSON.stringify(storyboard),
        JSON.stringify({ ...(board.quality || {}), storyboard: quality, repair: repairTrace }),
        nextStatus,
        nowIso(),
        id,
        userId
      );
    for (const scene of storyboard.scenes || []) {
      const warnings = sceneWarningCodesFromQuality(quality, scene.id);
      updateScene.run(
        JSON.stringify({ ...scene, qualityWarnings: warnings }),
        JSON.stringify({ warnings, repair: repairTrace.sceneTraces && repairTrace.sceneTraces[scene.id] || null }),
        nowIso(),
        id,
        scene.id
      );
    }
  })();
}

function buildRepairContext(userId, board, storyboard, quality, targetIds) {
  const materialId = board.material_id;
  const chunks = getMaterialChunks(materialId);
  const sourcePages = getSourcePages(materialId);
  const sourceVisuals = [
    ...sourceVisualCandidates.fromMaterialAndChunks(materialId, chunks, { includeChunkFallback: true, max: 12 }),
    ...(sourceVisualCandidates.listForMaterial(userId, materialId, { max: 24 }) || []),
  ];
  const seenVisuals = new Set();
  const dedupedVisuals = sourceVisuals.filter(candidate => {
    const key = String(candidate && (candidate.id || `${candidate.type}:${candidate.sourcePage}:${candidate.slideNumber}:${candidate.heading}`));
    if (!key || seenVisuals.has(key)) return false;
    seenVisuals.add(key);
    return true;
  });
  const chunkById = new Map(chunks.map(chunk => [Number(chunk.id), chunk]));
  const targetSceneMap = new Map((storyboard.scenes || []).filter(scene => targetIds.includes(scene.id)).map(scene => [
    scene.id,
    warningsForScene(quality, scene.id, scene),
  ]));
  const understanding = materialUnderstandingFor(storyboard);
  const sourceOutline = sourceOutlineFor(storyboard, chunks);
  return {
    userId,
    materialId,
    topic: storyboard.topic || board.topic || '',
    domain: understanding.domain || '',
    understanding,
    sourceOutline,
    chunks,
    promptChunks: chunks.slice(0, 14).map(chunk => ({
      id: chunk.id,
      heading: chunk.heading || chunk.chapter_title || chunk.slide_title || '',
      page: chunk.source_page,
      slide: chunk.slide_number,
      text: clean(chunk.text, 520),
    })),
    sourcePages: sourcePages.map(page => ({
      page: page.page_number,
      slide: page.slide_number,
      heading: page.heading || '',
      sourceKind: page.source_kind || '',
      text: clean(page.merged_text, 360),
    })),
    sourceVisuals: dedupedVisuals.slice(0, 12).map(candidate => ({
      id: candidate.id,
      type: candidate.type,
      pageNumber: candidate.pageNumber || candidate.sourcePage,
      slideNumber: candidate.slideNumber,
      heading: candidate.heading || '',
      caption: candidate.caption || '',
      evidence: clean(candidate.evidence || candidate.nearbyText || candidate.ocrText || '', 260),
      visualTypeGuess: candidate.visualTypeGuess || '',
      importanceScore: candidate.importanceScore,
      hasImage: !!(candidate.imagePath || candidate.thumbnailPath || candidate.imageUrl),
    })),
    sourceVisualMaps: sourceVisualMaps(dedupedVisuals),
    validChunkIds: new Set(chunks.map(chunk => Number(chunk.id))),
    chunkById,
    targetSceneMap,
    keyConcepts: asArray(understanding.keyConcepts),
  };
}

async function repairStoryboard(userId, id, payload = {}) {
  const scope = String(payload.scope || 'weak_scenes');
  if (scope !== 'weak_scenes') throw new HttpError(400, 'invalid_repair_scope', 'Storyboard repair currently supports scope=weak_scenes only.');
  const board = storyboardSvc.getStoryboard(userId, id);
  if (!board) return null;
  const storyboard = {
    ...board.storyboard,
    scenes: asArray(board.storyboard && board.storyboard.scenes),
  };
  const beforeQuality = storyboardSvc.storyboardQuality(storyboard);
  const beforeWarnings = asArray(beforeQuality.warnings);
  const targetIds = targetScenes(storyboard, beforeQuality, payload);
  const repairTrace = {
    at: nowIso(),
    scope,
    repairedSceneIds: [],
    skippedSceneIds: [],
    beforeWarnings,
    afterWarnings: beforeWarnings,
    decisions: [],
    sceneTraces: {},
  };
  if (!targetIds.length) {
    return {
      storyboard: board,
      quality: qualityForResponse(beforeQuality),
      repair: repairTrace,
    };
  }

  const context = buildRepairContext(userId, board, storyboard, beforeQuality, targetIds);
  const promptContext = {
    topic: context.topic,
    domain: context.domain,
    beforeWarnings,
    keyConcepts: context.keyConcepts,
    sourceOutline: context.sourceOutline,
    chunks: context.promptChunks,
    sourcePages: context.sourcePages,
    sourceVisuals: context.sourceVisuals,
    scenes: targetIds.map(sceneId => {
      const scene = storyboard.scenes.find(item => item.id === sceneId);
      return compactScene(scene, context.targetSceneMap.get(sceneId) || []);
    }),
  };

  let aiPlan;
  try {
    aiPlan = await generateRepairPlan(promptContext);
  } catch (err) {
    repairTrace.skippedSceneIds = targetIds;
    repairTrace.decisions.push({ action: 'ai_repair_failed', reason: err && err.message || 'ai_repair_failed' });
    return { storyboard: board, quality: qualityForResponse(beforeQuality), repair: repairTrace };
  }

  let workingStoryboard = {
    ...storyboard,
    scenes: storyboard.scenes.map(scene => ({ ...scene })),
  };
  let workingQuality = beforeQuality;
  const sceneMap = new Map(workingStoryboard.scenes.map(scene => [scene.id, scene]));
  const accepted = [];

  for (const item of aiPlan.patches || []) {
    const scene = sceneMap.get(item.sceneId);
    if (!scene || !targetIds.includes(item.sceneId)) {
      repairTrace.skippedSceneIds.push(item.sceneId || 'unknown');
      repairTrace.decisions.push({ sceneId: item.sceneId || '', action: 'skipped', reason: 'scene_not_targeted' });
      continue;
    }
    const sceneContext = {
      ...context,
      sceneWarnings: context.targetSceneMap.get(item.sceneId) || [],
    };
    const sanitized = sanitizePatch(scene, item.patch, sceneContext);
    if (!sanitized.ok) {
      repairTrace.skippedSceneIds.push(item.sceneId);
      repairTrace.decisions.push({ sceneId: item.sceneId, action: 'skipped', reason: sanitized.reason });
      continue;
    }
    const candidateScene = mergedScene(scene, sanitized.patch);
    const candidateStoryboard = {
      ...workingStoryboard,
      scenes: workingStoryboard.scenes.map(existing => existing.id === item.sceneId ? candidateScene : existing),
    };
    const candidateQuality = storyboardSvc.storyboardQuality(candidateStoryboard);
    const verifier = sourceGroundingJudge.judge({
      feature: 'storyboard',
      stage: 'repair_scene',
      materialId: board.material_id,
      resolvedTopic: context.topic,
      requestedTopic: payload.concept || context.topic,
      domainInfo: { domain: context.domain, confidence: context.understanding.confidence || 0.5 },
      sourceOutline: context.sourceOutline,
      materialUnderstanding: context.understanding,
      chunks: context.chunks,
      sourceVisuals: context.sourceVisuals,
      outputText: [
        candidateScene.title,
        candidateScene.learningPoint,
        candidateScene.teachingGoal,
        candidateScene.narration,
        JSON.stringify(candidateScene.visualElements || candidateScene.visualData || {}),
      ].filter(Boolean).join('\n'),
      outputJson: candidateScene,
      attempt: 1,
    });
    if (verifier.decision !== sourceGroundingJudge.DECISIONS.ACCEPT) {
      repairTrace.skippedSceneIds.push(item.sceneId);
      repairTrace.decisions.push({ sceneId: item.sceneId, action: 'skipped', reason: 'source_grounding_judge_rejected', verifier });
      continue;
    }
    if (!sceneImproved(workingQuality, candidateQuality, item.sceneId)) {
      repairTrace.skippedSceneIds.push(item.sceneId);
      repairTrace.decisions.push({ sceneId: item.sceneId, action: 'skipped', reason: 'patch_did_not_improve_quality' });
      continue;
    }
    workingStoryboard = candidateStoryboard;
    workingQuality = candidateQuality;
    sceneMap.set(item.sceneId, candidateScene);
    accepted.push(item.sceneId);
    repairTrace.repairedSceneIds.push(item.sceneId);
    repairTrace.sceneTraces[item.sceneId] = {
      reason: clean(item.reason || 'AI repair patch accepted.', 260),
      visualType: candidateScene.visualType || candidateScene.visualTemplate || '',
      beforeWarnings: context.targetSceneMap.get(item.sceneId) || [],
      afterWarnings: sceneWarningCodesFromQuality(candidateQuality, item.sceneId),
    };
    repairTrace.decisions.push({ sceneId: item.sceneId, action: 'accepted', reason: clean(item.reason || 'accepted', 260) });
  }

  repairTrace.repairedSceneIds = [...new Set(repairTrace.repairedSceneIds)];
  repairTrace.skippedSceneIds = [...new Set(repairTrace.skippedSceneIds)];
  repairTrace.afterWarnings = asArray(workingQuality.warnings);

  if (!accepted.length) {
    let fallbackBoard = null;
    let fallbackQuality = beforeQuality;
    const sourcePreference = String(payload.sourcePreference || payload.source_preference || 'auto');
    for (const sceneId of targetIds) {
      try {
        fallbackBoard = storyboardSvc.fixScene(userId, id, sceneId, 'fix_auto', {
          sourcePreference,
          sourceVisualId: payload.sourceVisualId || payload.source_visual_id,
          targetVisualType: payload.targetVisualType || payload.visualType || '',
        });
        fallbackQuality = storyboardSvc.storyboardQuality(fallbackBoard.storyboard);
        repairTrace.repairedSceneIds.push(sceneId);
        repairTrace.decisions.push({ sceneId, action: 'deterministic_fallback', reason: 'AI repair produced no accepted patch.' });
        repairTrace.sceneTraces[sceneId] = {
          reason: 'Deterministic fallback replaced the weak visual.',
          beforeWarnings: context.targetSceneMap.get(sceneId) || [],
          afterWarnings: sceneWarningCodesFromQuality(fallbackQuality, sceneId),
        };
        if (asArray(fallbackQuality.warnings).length < beforeWarnings.length) break;
      } catch (err) {
        repairTrace.skippedSceneIds.push(sceneId);
        repairTrace.decisions.push({ sceneId, action: 'fallback_skipped', reason: err && err.code || err && err.message || 'fallback_failed' });
      }
    }
    repairTrace.repairedSceneIds = [...new Set(repairTrace.repairedSceneIds)];
    repairTrace.skippedSceneIds = [...new Set(repairTrace.skippedSceneIds)];
    repairTrace.afterWarnings = asArray(fallbackQuality.warnings);
    return {
      storyboard: fallbackBoard || board,
      quality: qualityForResponse(fallbackQuality),
      repair: repairTrace,
    };
  }

  persistRepairedStoryboard(userId, id, board, workingStoryboard, workingQuality, repairTrace);
  const finalBoard = storyboardSvc.getStoryboard(userId, id);
  const finalQuality = storyboardSvc.storyboardQuality(finalBoard.storyboard);
  const repair = {
    ...repairTrace,
    afterWarnings: asArray(finalQuality.warnings),
  };
  return {
    storyboard: finalBoard,
    quality: qualityForResponse(finalQuality),
    repair,
  };
}

module.exports = {
  repairStoryboard,
  _internals: {
    ALLOWED_VISUAL_TYPES,
    buildRepairContext,
    compactRepairPrompt,
    qualityForResponse,
    sanitizePatch,
    targetScenes,
    targetVisualTypeFromWarning,
  },
};
