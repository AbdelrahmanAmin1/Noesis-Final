'use strict';

const fs = require('fs');
const path = require('path');
const { getDb } = require('../config/db');
const env = require('../config/env');

function clean(value, max = 120) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > max ? text.slice(0, max).trim() : text;
}

function headingFor(chunk) {
  return clean(chunk && (chunk.chapter_title || chunk.slide_title || chunk.section_title || chunk.heading) || '', 100);
}

function looksTableLike(text) {
  const lines = String(text || '').split(/\n+/).map(line => line.trim()).filter(Boolean);
  if (lines.some(line => /\t|\s{3,}|\|/.test(line))) return true;
  return /\b(types?|categories|classified|includes?|consists of|advantages?|disadvantages?)\b/i.test(String(text || ''));
}

function visualTypeGuess(value) {
  const text = String(value || '');
  if (/\b(?:logo|watermark|background|decorative|divider|icon|footer|header|copyright|university|college)\b/i.test(text)) return 'decorative';
  if (/\b(?:code|class\s+\w+|def\s+\w+|public\s+class|for\s*\(|while\s*\(|if\s*\(|return\s+|printf|cout|system\.out)\b/i.test(text)) return 'code_screenshot';
  if (/\b(?:stack|lifo|push|pop|peek|top)\b/i.test(text)) return 'data_structure_visual';
  if (/\b(?:queue|fifo|enqueue|dequeue|front|rear|deque)\b/i.test(text)) return 'data_structure_visual';
  if (/\b(?:linked list|node|head|next|pointer)\b/i.test(text)) return 'data_structure_visual';
  if (/\b(?:bst|binary search tree|tree|node|root|leaf|traversal|heap|trie)\b/i.test(text)) return 'tree_diagram';
  if (/\b(?:hash table|hashing|bucket|collision|linear probing|chaining)\b/i.test(text)) return 'hash_table_diagram';
  if (/\b(?:flowchart|flow chart|process|pipeline|workflow|step\s+\d+|algorithm)\b/i.test(text)) return 'flowchart';
  if (/\b(?:equation|formula|theorem|lemma|proof|=|≤|>=|<=|∑|sqrt|log\(|lim)\b/i.test(text)) return 'equation';
  if (/\b(?:chart|graph|plot|axis|trend|bar chart|line chart|pie chart)\b/i.test(text)) return 'chart';
  if (/\b(?:table|matrix|grid|classification|comparison)\b/i.test(text) || looksTableLike(text)) return 'table';
  if (/\b(?:diagram|figure|illustration|labeled|anatomy|vertebrae|bone|skeleton)\b/i.test(text)) return 'diagram';
  return '';
}

function classifyVisualCandidate(input = {}) {
  const text = [input.heading, input.nearbyText, input.ocrText, input.visualTypeGuess].filter(Boolean).join('\n');
  const guess = input.visualTypeGuess || visualTypeGuess(text);
  const textLen = String(text || '').replace(/\s+/g, '').length;
  const classification = guess === 'decorative' || (input.hasImage && textLen < 18 && !guess)
    ? 'decorative'
    : guess === 'table'
      ? 'table'
      : guess === 'flowchart'
        ? 'flowchart'
        : guess === 'code_screenshot'
          ? 'code_screenshot'
          : guess === 'equation'
            ? 'equation'
            : guess === 'data_structure_visual' || /tree|hash_table/.test(guess)
              ? 'data_structure_visual'
              : guess === 'chart'
                ? 'diagram'
                : guess || 'diagram';
  return { guess, classification };
}

function importanceScore(input = {}) {
  const text = [input.heading, input.nearbyText, input.ocrText].filter(Boolean).join('\n');
  const classified = classifyVisualCandidate({ ...input, visualTypeGuess: input.visualTypeGuess || visualTypeGuess(text) });
  if (classified.classification === 'decorative') return 0;
  let score = input.hasImage ? 0.45 : 0.2;
  if (input.heading) score += 0.12;
  if (input.ocrText && input.ocrText.length > 40) score += 0.12;
  if (classified.guess) score += 0.22;
  if (/\b(?:figure|diagram|chart|table|flow|tree|hash|caption|shown|below|above)\b/i.test(text)) score += 0.14;
  if (input.lowTextHighVisual) score += 0.14;
  if (input.width && input.height) {
    const area = Number(input.width) * Number(input.height);
    if (area > 120000) score += 0.08;
  }
  return Math.max(0, Math.min(1, Number(score.toFixed(3))));
}

function labelFor(candidate) {
  if (!candidate) return '';
  if (candidate.slideNumber != null || candidate.slide_number != null) return `Slide ${candidate.slideNumber ?? candidate.slide_number}`;
  return `Page ${candidate.sourcePage ?? candidate.pageNumber ?? candidate.page_number ?? 1}`;
}

function captionFor(candidate) {
  const label = labelFor(candidate);
  const heading = clean(candidate.heading || candidate.visualTypeGuess || candidate.visual_type_guess || 'source visual', 100);
  return heading ? `${label}: ${heading}` : label;
}

function fromChunks(chunks = [], opts = {}) {
  const max = opts.max || 8;
  const out = [];
  const seen = new Set();
  const add = (candidate) => {
    const key = [candidate.type, candidate.sourcePage, candidate.slideNumber, candidate.heading].join('|').toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(candidate);
  };

  for (const chunk of chunks || []) {
    const heading = headingFor(chunk);
    const text = clean(chunk && chunk.text || '', 260);
    if (chunk && chunk.source_page != null) {
      add({
        type: 'source_page_reference',
        sourcePage: chunk.source_page,
        slideNumber: null,
        heading,
        caption: heading ? `Source page ${chunk.source_page}: ${heading}` : `Source page ${chunk.source_page}`,
        evidence: text,
        chunkId: chunk.id || chunk.chunk_id || null,
      });
    }
    if (chunk && chunk.slide_number != null) {
      add({
        type: 'source_slide_reference',
        sourcePage: null,
        slideNumber: chunk.slide_number,
        heading: heading || clean(chunk.slide_title, 100),
        caption: heading ? `Source slide ${chunk.slide_number}: ${heading}` : `Source slide ${chunk.slide_number}`,
        evidence: text,
        chunkId: chunk.id || chunk.chunk_id || null,
      });
    }
    if (looksTableLike(chunk && chunk.text)) {
      add({
        type: /compare|contrast|versus|advantage|disadvantage/i.test(chunk.text || '') ? 'comparison_table' : 'classification_table',
        sourcePage: chunk && chunk.source_page || null,
        slideNumber: chunk && chunk.slide_number || null,
        heading,
        caption: heading ? `Table candidate: ${heading}` : 'Table candidate from source text',
        evidence: text,
        chunkId: chunk && (chunk.id || chunk.chunk_id) || null,
      });
    }
    if (out.length >= max) break;
  }
  return out.slice(0, max);
}

function sourceVisualDir(materialId) {
  const dir = path.join(env.UPLOAD_DIR, 'source-visuals', String(materialId));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function safeExt(name, mime) {
  const ext = path.extname(String(name || '')).toLowerCase();
  if (['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(ext)) return ext;
  if (String(mime || '').includes('jpeg')) return '.jpg';
  if (String(mime || '').includes('webp')) return '.webp';
  if (String(mime || '').includes('gif')) return '.gif';
  return '.png';
}

function writeVisualFile(materialId, visual, index) {
  if (visual.filePath && fs.existsSync(visual.filePath)) {
    if (path.resolve(visual.filePath).startsWith(path.resolve(env.UPLOAD_DIR))) return visual.filePath;
    const out = path.join(sourceVisualDir(materialId), `visual-${index}${safeExt(visual.name || visual.filePath, visual.mime)}`);
    fs.copyFileSync(visual.filePath, out);
    return out;
  }
  if (!visual.buffer) return null;
  const out = path.join(sourceVisualDir(materialId), `visual-${index}${safeExt(visual.name, visual.mime)}`);
  fs.writeFileSync(out, visual.buffer);
  return out;
}

function pageKey(value) {
  if (value && value.slideNumber != null) return `s:${value.slideNumber}`;
  return `p:${value && value.pageNumber != null ? value.pageNumber : 1}`;
}

function insertSourcePages(db, materialId, pages = []) {
  const insert = db.prepare(`INSERT INTO material_source_pages
    (material_id, page_number, slide_number, normal_text_chars, ocr_text_chars, merged_text, source_kind, heading, thumbnail_path, diagnostics_json)
    VALUES (?,?,?,?,?,?,?,?,?,?)`);
  for (const page of pages) {
    insert.run(
      materialId,
      page.pageNumber || null,
      page.slideNumber || null,
      page.normalTextChars || String(page.normalText || '').length || 0,
      page.ocrTextChars || String(page.ocrText || '').length || 0,
      page.text || '',
      page.sourceKind || 'text',
      page.heading || '',
      page.thumbnailPath || null,
      JSON.stringify(page.diagnostics || {})
    );
  }
}

function asCandidateRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    materialId: row.material_id,
    pageNumber: row.page_number,
    sourcePage: row.page_number,
    slideNumber: row.slide_number,
    imagePath: row.image_path,
    thumbnailPath: row.thumbnail_path,
    heading: row.heading || '',
    nearbyText: row.nearby_text || '',
    ocrText: row.ocr_text || '',
    visualTypeGuess: row.visual_type_guess || '',
    classification: parseJson(row.metadata_json, {}).classification || row.visual_type_guess || '',
    importanceScore: Number(row.importance_score || 0),
    metadata: parseJson(row.metadata_json, {}),
    type: row.slide_number != null ? 'source_slide_reference' : 'source_page_reference',
    caption: captionFor(row),
    evidence: clean(row.nearby_text || row.ocr_text || '', 260),
  };
}

function parseJson(value, fallback) {
  try { return JSON.parse(value || ''); } catch (_) { return fallback; }
}

function persistForMaterial(materialId, extraction = {}, opts = {}) {
  const db = getDb();
  const pages = extraction.pages || [];
  const pageByKey = new Map(pages.map(p => [pageKey(p), p]));
  const visualSources = extraction.visualSources || [];
  const max = opts.max || env.SOURCE_VISUALS_MAX_PER_MATERIAL;
  const rows = [];

  const insertCandidate = db.prepare(`INSERT INTO source_visual_candidates
    (material_id, page_number, slide_number, image_path, thumbnail_path, heading, nearby_text, ocr_text, visual_type_guess, importance_score, metadata_json)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`);

  db.transaction(() => {
    db.prepare('DELETE FROM source_visual_candidates WHERE material_id=?').run(materialId);
    db.prepare('DELETE FROM material_source_pages WHERE material_id=?').run(materialId);
    insertSourcePages(db, materialId, pages);

    let index = 0;
    const seen = new Set();
    for (const visual of visualSources) {
      index += 1;
      const key = pageKey(visual);
      const page = pageByKey.get(key) || {};
      const imagePath = writeVisualFile(materialId, visual, index);
      const nearbyText = clean(page.text || page.normalText || '', 600);
      const ocrText = clean(page.ocrText || '', 600);
      const heading = clean(page.heading || headingFor({ text: nearbyText }) || '', 120);
      const classified = classifyVisualCandidate({ heading, nearbyText, ocrText, hasImage: !!imagePath });
      const guess = classified.guess;
      const score = importanceScore({
        heading,
        nearbyText,
        ocrText,
        visualTypeGuess: guess,
        hasImage: !!imagePath,
        lowTextHighVisual: nearbyText.length < 120 && !!imagePath,
      });
      const dedupeKey = `${key}|${imagePath || ''}|${guess}`;
      if (classified.classification === 'decorative' || seen.has(dedupeKey) || score < 0.4) continue;
      seen.add(dedupeKey);
      const info = insertCandidate.run(
        materialId,
        visual.pageNumber || null,
        visual.slideNumber || null,
        imagePath,
        imagePath,
        heading,
        nearbyText,
        ocrText,
        guess,
        score,
        JSON.stringify({ entryName: visual.entryName || '', mime: visual.mime || '', name: visual.name || '', classification: classified.classification, pageAssociation: key })
      );
      rows.push({ id: info.lastInsertRowid, key });
      if (rows.length >= max) break;
    }

    if (rows.length < max) {
      for (const page of pages) {
        const nearbyText = clean(page.text || page.normalText || '', 600);
        const ocrText = clean(page.ocrText || '', 600);
        const heading = clean(page.heading || '', 120);
        const classified = classifyVisualCandidate({ heading, nearbyText, ocrText, hasImage: false });
        const guess = classified.guess;
        if (!guess) continue;
        const score = importanceScore({
          heading,
          nearbyText,
          ocrText,
          visualTypeGuess: guess,
          hasImage: false,
          lowTextHighVisual: (page.normalTextChars || 0) < 120 && (page.ocrTextChars || 0) > 60,
        });
        if (classified.classification === 'decorative' || score < 0.62) continue;
        const key = pageKey(page);
        const dedupeKey = `${key}|page-reference|${guess}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        const info = insertCandidate.run(
          materialId,
          page.pageNumber || null,
          page.slideNumber || null,
          null,
          page.thumbnailPath || null,
          heading,
          nearbyText,
          ocrText,
          guess,
          score,
          JSON.stringify({ sourceKind: page.sourceKind || 'text', referenceOnly: true, classification: classified.classification, pageAssociation: key })
        );
        rows.push({ id: info.lastInsertRowid, key });
        if (rows.length >= max) break;
      }
    }
  })();

  return forPrompt(materialId, { max });
}

function forPrompt(materialId, opts = {}) {
  if (!materialId) return [];
  const max = opts.max || env.SOURCE_VISUALS_MAX_PER_MATERIAL || 8;
  const minScore = opts.minScore == null ? 0.4 : opts.minScore;
  const db = getDb();
  const rows = db.prepare(`SELECT * FROM source_visual_candidates
                           WHERE material_id=? AND importance_score>=?
                           ORDER BY importance_score DESC, id ASC
                           LIMIT ?`).all(materialId, minScore, max);
  return rows.map(asCandidateRow).filter(Boolean);
}

function listForMaterial(userId, materialId, opts = {}) {
  const db = getDb();
  const owner = db.prepare('SELECT id FROM materials WHERE id=? AND user_id=?').get(materialId, userId);
  if (!owner) return null;
  const max = opts.max || 50;
  const rows = db.prepare(`SELECT * FROM source_visual_candidates
                           WHERE material_id=?
                           ORDER BY importance_score DESC, id ASC
                           LIMIT ?`).all(materialId, max);
  return rows.map(asCandidateRow).filter(Boolean);
}

function imagePathForCandidate(userId, materialId, candidateId) {
  const db = getDb();
  const row = db.prepare(`SELECT svc.*
                          FROM source_visual_candidates svc
                          JOIN materials m ON m.id = svc.material_id
                          WHERE svc.id=? AND svc.material_id=? AND m.user_id=?`).get(candidateId, materialId, userId);
  const candidate = asCandidateRow(row);
  if (!candidate || !candidate.imagePath) return null;
  const resolved = path.resolve(candidate.imagePath);
  if (!resolved.startsWith(path.resolve(env.UPLOAD_DIR)) || !fs.existsSync(resolved)) return null;
  return { ...candidate, imagePath: resolved };
}

function fromMaterialAndChunks(materialId, chunks = [], opts = {}) {
  const max = opts.max || env.SOURCE_VISUALS_MAX_PER_MATERIAL || 8;
  let persisted = [];
  try { persisted = forPrompt(materialId, { max, minScore: opts.minScore == null ? 0.4 : opts.minScore }); } catch (_) {}
  const chunkCandidates = opts.includeChunkFallback ? fromChunks(chunks, { max }) : [];
  const out = [];
  const seen = new Set();
  for (const candidate of [...persisted, ...chunkCandidates]) {
    const key = [candidate.type, candidate.sourcePage, candidate.pageNumber, candidate.slideNumber, candidate.heading].join('|').toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(candidate);
    if (out.length >= max) break;
  }
  return out;
}

module.exports = {
  captionFor,
  classifyVisualCandidate,
  forPrompt,
  fromChunks,
  fromMaterialAndChunks,
  imagePathForCandidate,
  importanceScore,
  labelFor,
  listForMaterial,
  persistForMaterial,
  visualTypeGuess,
  _internals: { asCandidateRow, looksTableLike, headingFor, pageKey, safeExt, writeVisualFile, classifyVisualCandidate },
};
