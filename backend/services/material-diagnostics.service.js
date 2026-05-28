'use strict';

const fs = require('fs');
const path = require('path');
const { getDb } = require('../config/db');
const { extractText } = require('./extract.service');

function compactText(value, max = 220) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1)).trim()}...`;
}

function parseKeywords(value) {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean).slice(0, 12) : [];
  } catch (_) {
    return [];
  }
}

function parseJson(value, fallback) {
  try { return JSON.parse(value || ''); } catch (_) { return fallback; }
}

function unique(values) {
  return [...new Set((values || []).filter(v => v !== null && v !== undefined && String(v).trim() !== ''))];
}

function evidenceLabelForChunk(chunk) {
  const idx = Number.isFinite(Number(chunk && chunk.idx)) ? Number(chunk.idx) + 1 : null;
  const fallback = idx ? `Chunk ${idx}` : 'Chunk';
  if (chunk && chunk.slide_number) {
    const title = chunk.slide_title || chunk.heading || chunk.section_title || '';
    return title ? `Slide ${chunk.slide_number}: ${title}` : `Slide ${chunk.slide_number}`;
  }
  if (chunk && chunk.source_page) {
    const title = chunk.heading || chunk.section_title || chunk.chapter_title || '';
    return title ? `Page ${chunk.source_page}: ${title}` : `Page ${chunk.source_page}`;
  }
  const title = chunk && (chunk.heading || chunk.section_title || chunk.chapter_title);
  return title ? `${fallback}: ${title}` : fallback;
}

function sourceKind(material) {
  const type = String(material && material.type || '').toLowerCase();
  const mime = String(material && material.mime || '').toLowerCase();
  const ext = path.extname(String(material && material.file_path || material && material.title || '')).replace('.', '').toLowerCase();
  if (type.includes('ppt') || mime.includes('presentation') || ext === 'pptx') return 'pptx';
  if (type.includes('pdf') || mime.includes('pdf') || ext === 'pdf') return 'pdf';
  if (type.includes('doc') || mime.includes('word') || ext === 'docx' || ext === 'doc') return 'doc';
  return ext || type || 'unknown';
}

function classifyWeakness(input) {
  const flags = [];
  const extractedCharCount = Number(input.extractedCharCount || 0);
  const chunkCount = Number(input.chunkCount || 0);
  const embeddedChunkCount = Number(input.embeddedChunkCount || 0);
  const chunkReferences = input.chunkReferences || [];
  const materialStatus = String(input.materialStatus || '');
  const fileExists = input.fileExists !== false;

  if (!fileExists) flags.push('missing_file');
  if (materialStatus && materialStatus !== 'ready') flags.push('material_not_ready');
  if (input.extractionError) flags.push('extract_recheck_failed');
  if (extractedCharCount < 20 || chunkCount === 0) flags.push('empty_extraction');
  else if (extractedCharCount < 1000) flags.push('short_extraction');
  if (chunkCount > 0 && chunkCount < 2) flags.push('few_chunks');
  if (chunkCount > 0 && embeddedChunkCount < chunkCount) flags.push('missing_embeddings');

  const locationCount = chunkReferences.filter(c =>
    c.slideNumber || c.sourcePage || c.heading || c.sectionTitle || c.chapterTitle
  ).length;
  if (chunkCount > 0 && locationCount === 0) flags.push('missing_location_metadata');

  return {
    weaknessFlags: flags,
    weak: flags.includes('empty_extraction') || flags.includes('short_extraction') || flags.includes('few_chunks'),
    usable: !flags.includes('empty_extraction') && chunkCount > 0,
  };
}

async function recheckExtractedCharCount(material) {
  const filePath = material && material.file_path;
  if (!filePath || !fs.existsSync(filePath)) {
    return { fileExists: false, charCount: null, error: filePath ? null : 'missing_file_path' };
  }
  try {
    const text = await extractText(filePath, material.mime || material.type || path.extname(filePath));
    return { fileExists: true, charCount: String(text || '').length, error: null };
  } catch (err) {
    return { fileExists: true, charCount: null, error: err && err.message || 'extract_recheck_failed' };
  }
}

function buildChunkReferences(chunks) {
  return (chunks || []).map(chunk => ({
    chunkId: chunk.id,
    chunkIndex: chunk.idx,
    evidenceLabel: evidenceLabelForChunk(chunk),
    chapterTitle: chunk.chapter_title || '',
    heading: chunk.heading || '',
    sectionTitle: chunk.section_title || '',
    slideNumber: chunk.slide_number || null,
    slideTitle: chunk.slide_title || '',
    sourcePage: chunk.source_page || null,
    sourceKind: chunk.source_kind || 'text',
    sourceVisualId: chunk.source_visual_id || null,
    hasCode: !!chunk.has_code,
    tokenCount: Number(chunk.token_count || 0),
    charCount: String(chunk.text || '').length,
    keywords: parseKeywords(chunk.keywords_json),
    quotePreview: compactText(chunk.text, 260),
  }));
}

function attachRetrievalDiagnostics(diagnostics, retrieval) {
  const source = retrieval || {};
  const chunks = source.chunks || [];
  return {
    ...diagnostics,
    retrieval: {
      chunkCount: chunks.length,
      chunkIds: chunks.map(c => c.id).filter(Boolean),
      maxScore: Number(source.maxScore || 0),
      meanScore: Number(source.meanScore || 0),
    },
  };
}

async function buildMaterialDiagnostics(materialId, opts = {}) {
  const db = getDb();
  const material = opts.userId
    ? db.prepare('SELECT * FROM materials WHERE id=? AND user_id=?').get(materialId, opts.userId)
    : db.prepare('SELECT * FROM materials WHERE id=?').get(materialId);

  if (!material) {
    return {
      materialId,
      usable: false,
      weak: true,
      weaknessFlags: ['material_not_found'],
      extractedCharCount: 0,
      chunkCount: 0,
      evidenceCount: 0,
      chunkIds: [],
      chunkReferences: [],
    };
  }

  const chapters = db.prepare('SELECT id, idx, title, char_start, char_end FROM chapters WHERE material_id=? ORDER BY idx').all(materialId);
  const chunks = db.prepare(`SELECT id, idx, text, token_count, embedding,
      source_page, chapter_title, heading, slide_number, slide_title, section_title, has_code, keywords_json, source_kind, source_visual_id
    FROM chunks WHERE material_id=? ORDER BY idx`).all(materialId);
  const extractionDiagnostics = parseJson(material.extraction_diagnostics_json, {});
  const sourceVisualCount = db.prepare('SELECT COUNT(*) AS count FROM source_visual_candidates WHERE material_id=?').get(materialId).count || 0;

  const recheck = opts.skipExtractRecheck ? { fileExists: !!material.file_path, charCount: null, error: null } : await recheckExtractedCharCount(material);
  const chunkTextCharCount = chunks.reduce((sum, chunk) => sum + String(chunk.text || '').length, 0);
  const extractedCharCount = recheck.charCount == null ? chunkTextCharCount : recheck.charCount;
  const chunkReferences = buildChunkReferences(chunks);
  const embeddedChunkCount = chunks.filter(c => c.embedding).length;
  const classification = classifyWeakness({
    extractedCharCount,
    chunkCount: chunks.length,
    embeddedChunkCount,
    chunkReferences,
    extractionError: recheck.error,
    fileExists: recheck.fileExists,
    materialStatus: material.status,
  });
  if (extractionDiagnostics && extractionDiagnostics.quality && extractionDiagnostics.quality.needsOcr) {
    classification.weaknessFlags = unique([...classification.weaknessFlags, 'ocr_needed']);
  }
  if (material.ocr_status === 'ocr_skipped_disabled') {
    classification.weaknessFlags = unique([...classification.weaknessFlags, 'ocr_disabled']);
  }

  const diagnostics = {
    materialId: material.id,
    sourceFileName: path.basename(material.file_path || material.title || ''),
    sourceTitle: material.title || '',
    sourceType: sourceKind(material),
    sourceFileExists: recheck.fileExists !== false,
    mime: material.mime || '',
    sizeBytes: material.size_bytes || null,
    status: material.status || '',
    extractedCharCount,
    chunkTextCharCount,
    extractionRechecked: !opts.skipExtractRecheck,
    extractionError: recheck.error || null,
    extractionDiagnostics,
    ocrStatus: material.ocr_status || 'not_evaluated',
    ocrProvider: material.ocr_provider || null,
    sourceVisualCount,
    chapterCount: chapters.length,
    chunkCount: chunks.length,
    evidenceCount: chunks.length,
    embeddedChunkCount,
    chunkIds: chunks.map(c => c.id),
    headings: unique([
      ...chapters.map(c => c.title),
      ...chunks.map(c => c.heading),
      ...chunks.map(c => c.section_title),
      ...chunks.map(c => c.slide_title),
    ]).slice(0, 30),
    slideNumbers: unique(chunks.map(c => c.slide_number)).map(Number).filter(Number.isFinite),
    pageNumbers: unique(chunks.map(c => c.source_page)).map(Number).filter(Number.isFinite),
    chunkReferences,
    ...classification,
  };

  return opts.retrieval ? attachRetrievalDiagnostics(diagnostics, opts.retrieval) : diagnostics;
}

module.exports = {
  buildMaterialDiagnostics,
  attachRetrievalDiagnostics,
  _internals: {
    buildChunkReferences,
    classifyWeakness,
    compactText,
    evidenceLabelForChunk,
    parseKeywords,
    parseJson,
  },
};
