'use strict';

const { getDb } = require('../config/db');
const educationalFilter = require('./educational-content-filter.service');
const topicRelevance = require('./topic-relevance-filter.service');
const visualExtraction = require('./visual-asset-extraction.service');
const visualSelector = require('./visual-asset-selector.service');
const materialUnderstanding = require('./material-understanding.service');

function nowIso() { return new Date().toISOString(); }
function parseJson(value, fallback) { try { return JSON.parse(value || ''); } catch (_) { return fallback; } }

function createRun(materialId, pipelineVersion) {
  const db = getDb();
  const info = db.prepare(`INSERT INTO material_analysis_runs
    (material_id, pipeline_version, status, created_at) VALUES (?,?,?,?)`)
    .run(materialId, pipelineVersion, 'processing', nowIso());
  return Number(info.lastInsertRowid);
}

function rawTextForPages(pages = []) {
  return pages.map((page) => {
    const label = page.slideNumber != null ? `Slide ${page.slideNumber}` : `Page ${page.pageNumber || 1}`;
    const normal = String(page.normalText || page.text || '').trim();
    const ocrText = String(page.ocrText || '').trim();
    return [label, normal && `Normal extraction:\n${normal}`, ocrText && `OCR extraction:\n${ocrText}`].filter(Boolean).join('\n');
  }).join('\n\n');
}

function topicContext(material, preliminary, domainInfo = {}) {
  const provisionalChunks = (preliminary.candidates || []).map((unit, index) => ({
    id: index + 1,
    idx: index,
    text: unit.text,
    heading: unit.heading || '',
    source_page: unit.pageNumber,
    slide_number: unit.slideNumber,
    keywords_json: '[]',
  }));
  let outline = {};
  try {
    outline = materialUnderstanding.buildSourceOutline(provisionalChunks, {
      hint: material.title,
      title: material.title,
      materialTitle: material.title,
      domainInfo,
    }) || {};
  } catch (_) {}
  const topics = (outline.majorTopics || []).map(item => item && (item.topic || item.name)).filter(Boolean);
  return {
    title: material.title,
    mainTopic: outline.mainTopic || material.title,
    topics,
    subtopics: topics,
    keyConcepts: outline.keyConcepts || [],
    importantConcepts: outline.keyConcepts || [],
    learningOutcomes: preliminary.candidates.filter(unit => unit.contentType === 'learning_outcome').map(unit => unit.text).slice(0, 12),
    repeatedHeadings: (preliminary.pages || []).map(page => page.heading).filter(Boolean),
    sourceOutline: outline,
  };
}

function normalizeCode(raw) {
  return String(raw || '')
    .replace(/^```\w*\s*/i, '')
    .replace(/```\s*$/, '')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[ \t]+$/gm, '')
    .trim();
}

function languageForCode(value) {
  const text = String(value || '');
  if (/\bpublic\s+(?:class|static|void)|System\.out|\bextends\b/.test(text)) return 'java';
  if (/\bdef\s+\w+\s*\(|\bimport\s+\w+|:\s*(?:#.*)?$/m.test(text)) return 'python';
  if (/#include|std::|cout\s*<</.test(text)) return 'cpp';
  if (/\b(?:const|let|var|function)\s+\w+|=>/.test(text)) return 'javascript';
  return 'text';
}

function reconstructCodeFromWords(words = [], rawCode = '') {
  if (!Array.isArray(words) || words.length < 3) return null;
  const codeTokens = new Set((String(rawCode || '').match(/[A-Za-z_][A-Za-z0-9_]*|[{}();=+*/<>-]/g) || []).map(token => token.toLowerCase()));
  const relevant = words.filter(word => codeTokens.has(String(word.text || '').toLowerCase()) && word.boundingBox);
  if (relevant.length < 3) return null;
  const lines = new Map();
  for (const word of relevant) {
    const key = word.line || Math.round(Number(word.boundingBox.top || 0) / 8);
    if (!lines.has(key)) lines.set(key, []);
    lines.get(key).push(word);
  }
  const ordered = [...lines.values()].map(line => line.sort((a, b) => Number(a.boundingBox.left || 0) - Number(b.boundingBox.left || 0))).sort((a, b) => Number(a[0].boundingBox.top || 0) - Number(b[0].boundingBox.top || 0));
  if (ordered.length < 2) return null;
  const baseLeft = Math.min(...ordered.flatMap(line => line.map(word => Number(word.boundingBox.left || 0))));
  const charWidths = relevant.map(word => Number(word.boundingBox.width || 0) / Math.max(1, String(word.text || '').length)).filter(value => value > 0);
  const charWidth = charWidths.length ? charWidths.reduce((sum, value) => sum + value, 0) / charWidths.length : 8;
  return ordered.map(line => {
    const indent = Math.max(0, Math.min(12, Math.round((Number(line[0].boundingBox.left || 0) - baseLeft) / Math.max(2, charWidth))));
    return `${' '.repeat(indent)}${line.map(word => word.text).join(' ')}`.trimEnd();
  }).join('\n');
}

function codeBlocksFromView(view = {}) {
  return (view.allScoredChunks || []).filter(unit => unit.contentType === 'code').map(unit => {
    const rawCode = unit.rawText || unit.text || '';
    const geometryCode = reconstructCodeFromWords(unit.ocrWords || [], rawCode);
    const normalizedCode = normalizeCode(geometryCode || rawCode);
    const changed = normalizedCode !== String(rawCode).trim();
    return {
      pageNumber: unit.pageNumber || null,
      slideNumber: unit.slideNumber || null,
      language: languageForCode(normalizedCode),
      rawCode,
      normalizedCode,
      nearbyText: unit.heading || '',
      relevanceScore: unit.relevanceScore,
      ocrConfidence: unit.ocrConfidence == null ? null : unit.ocrConfidence,
      reconstruction: { changed, method: geometryCode ? 'ocr_geometry' : changed ? 'evidence_preserving_normalization' : 'none', edits: geometryCode ? ['indentation_rebuilt_from_word_boxes'] : changed ? ['quotes_or_fence_normalized', 'trailing_space_removed'] : [] },
      warnings: normalizedCode.split(/\n/).length > 16 ? ['large_code_block_storyboard_window_required'] : [],
    };
  });
}

function tablesFromExtraction(structured = {}, view = {}) {
  const tables = (structured.tables || []).map(table => ({
    pageNumber: table.pageNumber || null,
    slideNumber: table.slideNumber || null,
    caption: table.caption || '',
    rawText: table.rawText || '',
    cells: table.cells || [],
    relevanceScore: topicRelevance.scoreUnit({ text: table.rawText, contentType: 'table', educationalSignals: ['comparison'] }, view.context || {}).relevanceScore,
    ocrConfidence: null,
    warnings: [],
  }));
  if (!tables.length) {
    for (const unit of view.allScoredChunks || []) {
      if (unit.contentType !== 'table') continue;
      const cells = String(unit.text || '').split(/\n/).map(row => row.replace(/^Table row:\s*/i, '').split(/\t|\s{3,}|\|/).map(cell => cell.trim()).filter(Boolean)).filter(row => row.length);
      tables.push({ pageNumber: unit.pageNumber, slideNumber: unit.slideNumber, caption: unit.heading || '', rawText: unit.text, cells, relevanceScore: unit.relevanceScore, ocrConfidence: unit.ocrConfidence || null, warnings: ['table_inferred_from_text_layout'] });
    }
  }
  return tables;
}

function persistPages(db, materialId, analysisRunId, pages = []) {
  const insert = db.prepare(`INSERT INTO material_source_pages
    (material_id, analysis_run_id, page_number, slide_number, normal_text_chars, ocr_text_chars,
     merged_text, raw_normal_text, raw_ocr_text, cleaned_educational_text, low_value_text_json,
     source_kind, heading, thumbnail_path, page_image_path, ocr_confidence_json, warnings_json, diagnostics_json)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  for (const page of pages) {
    insert.run(
      materialId, analysisRunId, page.pageNumber || null, page.slideNumber || null,
      page.normalTextChars || String(page.normalText || '').length, page.ocrTextChars || String(page.ocrText || '').length,
      page.text || '', page.normalText || '', page.ocrText || '', page.cleanedEducationalText || '',
      JSON.stringify(page.lowValueUnits || []), page.sourceKind || 'text', page.heading || '',
      page.thumbnailPath || page.pageImagePath || null, page.pageImagePath || null,
      JSON.stringify({
        confidence: page.ocrConfidence == null ? null : page.ocrConfidence,
        wordCount: (page.ocrWords || []).length,
        status: Number(page.ocrTextChars || String(page.ocrText || '').length) > 0 ? page.ocrConfidence == null ? 'unavailable' : 'measured' : 'not_applicable',
      }),
      JSON.stringify(page.warnings || []), JSON.stringify(page.diagnostics || {})
    );
  }
}

function persistAssets(db, materialId, analysisRunId, assets = []) {
  const insert = db.prepare(`INSERT INTO source_visual_candidates
    (material_id, analysis_run_id, page_number, slide_number, image_path, thumbnail_path, heading, nearby_text,
     ocr_text, visual_type_guess, importance_score, metadata_json, bounding_box_json, topic_relevance_score,
     visual_usefulness_score, visual_quality_score, recommended_scene_usage, recommendation, selected_for_video,
     ocr_confidence, warnings_json, semantic_data_json, fingerprint)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const out = [];
  for (const asset of assets) {
    const info = insert.run(
      materialId, analysisRunId, asset.pageNumber || null, asset.slideNumber || null, asset.imagePath || null,
      asset.thumbnailPath || asset.imagePath || null, asset.heading || '', asset.nearbyText || '', asset.ocrText || '',
      asset.visualTypeGuess || asset.classification || '', asset.visualUsefulnessScore || 0,
      JSON.stringify({ ...(asset.metadata || {}), classification: asset.classification || '', mandatoryForVideo: !!asset.mandatoryForVideo, width: asset.width || null, height: asset.height || null }),
      JSON.stringify(asset.boundingBox || {}), asset.topicRelevanceScore || 0, asset.visualUsefulnessScore || 0,
      asset.visualQualityScore || 0, asset.recommendedSceneUsage || '', asset.recommendation || 'ignore',
      asset.selectedForVideo ? 1 : 0, asset.ocrConfidence == null ? null : asset.ocrConfidence,
      JSON.stringify(asset.warnings || []), JSON.stringify(asset.semanticData || {}), asset.fingerprint || ''
    );
    out.push({ ...asset, id: Number(info.lastInsertRowid), materialId });
  }
  return out;
}

function persistCodeAndTables(db, materialId, analysisRunId, codeBlocks, tables) {
  const codeInsert = db.prepare(`INSERT INTO material_code_blocks
    (analysis_run_id, material_id, page_number, slide_number, language, raw_code, normalized_code, nearby_text,
     relevance_score, ocr_confidence, reconstruction_json, warnings_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
  codeBlocks.forEach(block => codeInsert.run(analysisRunId, materialId, block.pageNumber, block.slideNumber, block.language, block.rawCode, block.normalizedCode, block.nearbyText, block.relevanceScore, block.ocrConfidence, JSON.stringify(block.reconstruction), JSON.stringify(block.warnings)));
  const tableInsert = db.prepare(`INSERT INTO material_tables
    (analysis_run_id, material_id, page_number, slide_number, caption, raw_text, cells_json, relevance_score, ocr_confidence, warnings_json)
    VALUES (?,?,?,?,?,?,?,?,?,?)`);
  tables.forEach(table => tableInsert.run(analysisRunId, materialId, table.pageNumber, table.slideNumber, table.caption, table.rawText, JSON.stringify(table.cells), table.relevanceScore, table.ocrConfidence, JSON.stringify(table.warnings)));
}

async function analyzeAndPersist({ material, structured, pipelineVersion, domainInfo = {} }) {
  const db = getDb();
  const analysisRunId = createRun(material.id, pipelineVersion);
  try {
    const preliminary = educationalFilter.analyzePages(structured.pages || [], { title: material.title });
    const context = topicContext(material, preliminary, domainInfo);
    const view = topicRelevance.buildEducationalView(preliminary, context);
    view.context = context;
    const visualResult = await visualExtraction.extractVisualAssets({ materialId: material.id, analysisRunId, filePath: material.file_path, structured });
    const assets = visualSelector.selectAssets(visualResult.assets, context);
    const byLocation = new Map(visualResult.pageImages.map(item => [item.slideNumber != null ? `s:${item.slideNumber}` : `p:${item.pageNumber}`, item.filePath]));
    view.pages.forEach(page => { page.pageImagePath = byLocation.get(page.slideNumber != null ? `s:${page.slideNumber}` : `p:${page.pageNumber || 1}`) || page.pageImagePath || null; });
    const codeBlocks = codeBlocksFromView(view);
    const tables = tablesFromExtraction(structured, view);
    const rawExtractedText = rawTextForPages(structured.pages || []);
    const confidences = view.pages.map(page => {
      const hasOcr = Number(page.ocrTextChars || String(page.ocrText || '').length) > 0;
      return {
        pageNumber: page.pageNumber,
        slideNumber: page.slideNumber,
        confidence: page.ocrConfidence == null ? null : page.ocrConfidence,
        wordCount: (page.ocrWords || []).length,
        status: hasOcr ? page.ocrConfidence == null ? 'unavailable' : 'measured' : 'not_applicable',
      };
    });
    const warnings = [...new Set([
      ...visualResult.warnings,
      ...assets.flatMap(asset => asset.warnings || []),
      ...view.pages.flatMap(page => page.warnings || []),
      ...(confidences.some(item => item.status === 'unavailable') ? ['ocr_confidence_not_available_for_some_ocr_pages'] : []),
    ])];
    db.transaction(() => {
      persistPages(db, material.id, analysisRunId, view.pages);
      persistCodeAndTables(db, material.id, analysisRunId, codeBlocks, tables);
      db.prepare(`UPDATE material_analysis_runs SET raw_extracted_text=?, cleaned_educational_text=?, low_value_text_json=?,
        ocr_confidence_json=?, warnings_json=? WHERE id=?`)
        .run(rawExtractedText, view.cleanedEducationalText, JSON.stringify(view.lowValueTextRemoved), JSON.stringify({ pages: confidences }), JSON.stringify(warnings), analysisRunId);
    })();
    const persistedAssets = persistAssets(db, material.id, analysisRunId, assets);
    return { analysisRunId, context, view, assets: persistedAssets, codeBlocks, tables, warnings, rawExtractedText };
  } catch (err) {
    db.prepare(`UPDATE material_analysis_runs SET status='failed', warnings_json=?, completed_at=? WHERE id=?`)
      .run(JSON.stringify([`analysis_failed:${err.message || err}`]), nowIso(), analysisRunId);
    throw err;
  }
}

function activateRun(materialId, analysisRunId) {
  const db = getDb();
  db.transaction(() => {
    db.prepare(`UPDATE material_analysis_runs SET status='completed', completed_at=? WHERE id=? AND material_id=?`).run(nowIso(), analysisRunId, materialId);
    db.prepare('UPDATE materials SET active_analysis_run_id=? WHERE id=?').run(analysisRunId, materialId);
  })();
}

function failRun(materialId, analysisRunId, error) {
  if (!analysisRunId) return;
  const db = getDb();
  const material = db.prepare('SELECT active_analysis_run_id FROM materials WHERE id=?').get(materialId);
  if (material && Number(material.active_analysis_run_id) === Number(analysisRunId)) return;
  db.prepare(`UPDATE material_analysis_runs SET status='failed', warnings_json=?, completed_at=? WHERE id=? AND material_id=?`)
    .run(JSON.stringify([`analysis_failed:${error && (error.message || error) || 'material_processing_failed'}`]), nowIso(), analysisRunId, materialId);
}

function activeRun(userId, materialId) {
  const db = getDb();
  return db.prepare(`SELECT ar.* FROM material_analysis_runs ar JOIN materials m ON m.id=ar.material_id
    WHERE ar.id=m.active_analysis_run_id AND ar.material_id=? AND m.user_id=? AND ar.status='completed'`).get(materialId, userId);
}

function rowLocation(row) { return { pageNumber: row.page_number || null, slideNumber: row.slide_number || null }; }

function getAnalysis(userId, materialId) {
  const db = getDb();
  const run = activeRun(userId, materialId);
  if (!run) return null;
  const chunks = db.prepare(`SELECT id, raw_text, text, content_type, relevance_score, relevance_level,
    relevance_reasons_json, ocr_confidence, source_page, slide_number, heading, source_kind
    FROM chunks WHERE material_id=? AND analysis_run_id=? ORDER BY idx`).all(materialId, run.id).map(row => ({
      id: row.id, rawText: row.raw_text || row.text, text: row.text, contentType: row.content_type,
      relevanceScore: Number(row.relevance_score || 0), relevanceLevel: row.relevance_level,
      relevanceReasons: parseJson(row.relevance_reasons_json, []), ocrConfidence: row.ocr_confidence,
      pageNumber: row.source_page, slideNumber: row.slide_number, heading: row.heading, sourceKind: row.source_kind,
    }));
  const visuals = db.prepare('SELECT * FROM source_visual_candidates WHERE material_id=? AND analysis_run_id=? ORDER BY topic_relevance_score DESC, visual_usefulness_score DESC, id').all(materialId, run.id).map(row => ({
    id: row.id, materialId: row.material_id, ...rowLocation(row), imagePath: row.image_path, thumbnailPath: row.thumbnail_path,
    heading: row.heading, nearbyText: row.nearby_text, ocrText: row.ocr_text, visualType: row.visual_type_guess,
    classification: parseJson(row.metadata_json, {}).classification || row.visual_type_guess,
    boundingBox: parseJson(row.bounding_box_json, {}), topicRelevanceScore: Number(row.topic_relevance_score || 0),
    visualUsefulnessScore: Number(row.visual_usefulness_score || 0), visualQualityScore: Number(row.visual_quality_score || 0),
    recommendedSceneUsage: row.recommended_scene_usage, recommendation: row.recommendation,
    selectedForVideo: !!row.selected_for_video, ocrConfidence: row.ocr_confidence,
    warnings: parseJson(row.warnings_json, []), semanticData: parseJson(row.semantic_data_json, {}),
    mandatoryForVideo: !!parseJson(row.metadata_json, {}).mandatoryForVideo,
  }));
  const codeBlocks = db.prepare('SELECT * FROM material_code_blocks WHERE analysis_run_id=? ORDER BY relevance_score DESC, id').all(run.id).map(row => ({ id: row.id, ...rowLocation(row), language: row.language, rawCode: row.raw_code, normalizedCode: row.normalized_code, nearbyText: row.nearby_text, relevanceScore: Number(row.relevance_score || 0), ocrConfidence: row.ocr_confidence, reconstruction: parseJson(row.reconstruction_json, {}), warnings: parseJson(row.warnings_json, []) }));
  const tables = db.prepare('SELECT * FROM material_tables WHERE analysis_run_id=? ORDER BY relevance_score DESC, id').all(run.id).map(row => ({ id: row.id, ...rowLocation(row), caption: row.caption, rawText: row.raw_text, cells: parseJson(row.cells_json, []), relevanceScore: Number(row.relevance_score || 0), ocrConfidence: row.ocr_confidence, warnings: parseJson(row.warnings_json, []) }));
  const diagrams = visuals.filter(visual => /diagram|flow|tree|class|architecture|data_structure|equation|chart/.test(`${visual.classification} ${visual.visualType}`));
  return {
    materialId,
    analysisRunId: run.id,
    pipelineVersion: run.pipeline_version,
    rawExtractedText: run.raw_extracted_text || '',
    cleanedEducationalText: run.cleaned_educational_text || '',
    lowValueTextRemoved: parseJson(run.low_value_text_json, []),
    topicRelevantChunks: chunks,
    extractedVisualAssets: visuals,
    selectedVisualAssetsForVideo: visuals.filter(visual => visual.selectedForVideo),
    codeBlocks,
    diagrams,
    tables,
    ocrConfidenceScores: parseJson(run.ocr_confidence_json, {}),
    warnings: parseJson(run.warnings_json, []),
  };
}

module.exports = { activateRun, analyzeAndPersist, createRun, failRun, getAnalysis, _internals: { codeBlocksFromView, languageForCode, normalizeCode, reconstructCodeFromWords, rawTextForPages, tablesFromExtraction, topicContext } };
