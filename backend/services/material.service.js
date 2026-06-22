'use strict';

const fs = require('fs');
const path = require('path');
const { z } = require('zod');
const { getDb } = require('../config/db');
const env = require('../config/env');
const { HttpError } = require('../middleware/error');
const { extractStructured, detectChapters } = require('./extract.service');
const extractionQuality = require('./extraction-quality.service');
const ocr = require('./ocr.service');
const { chunkByChapter } = require('./chunk.service');
const { embedAndStore } = require('./rag.service');
const ai = require('./ai.service');
const jobs = require('./jobs.service');
const log = require('../utils/logger');
const prompts = require('../utils/prompts');
const { parseJsonSafe } = require('../utils/jsonSafe');
const topicResolver = require('./topic-resolver.service');
const gamification = require('./gamification.service');
const sourceVisualCandidates = require('./source-visual-candidates.service');
const materialTopicMap = require('./material-topic-map.service');
const materialLearningMaps = require('./material-learning-map.service');
const sourceTextQuality = require('./source-text-quality.service');
const materialAnalysis = require('./material-analysis.service');

const EXTRACTION_PIPELINE_VERSION = 3;

function nowIso() { return new Date().toISOString(); }

const ConceptExtractSchema = z.object({
  concepts: z.array(z.string().min(1)).min(1).max(8),
});

function fileTypeFromExt(ext) {
  const e = (ext || '').toLowerCase();
  if (e === '.pdf') return 'pdf';
  if (e === '.pptx' || e === '.ppt') return 'slides';
  if (e === '.docx' || e === '.doc') return 'doc';
  if (['.png', '.jpg', '.jpeg', '.webp'].includes(e)) return 'image';
  return 'note';
}

function listForUser(userId) {
  const db = getDb();
  const rows = db.prepare(`SELECT id, title, type, status, progress, created_at, ocr_status, ocr_provider, topic_map_json,
                     (SELECT COUNT(*) FROM chapters c WHERE c.material_id = m.id) AS chapters
                     FROM materials m WHERE user_id=? ORDER BY created_at DESC`).all(userId);
  return rows.map(row => ({ ...row, display_title: displayTitleForMaterial(db, row) }));
}

function getOwned(userId, id) {
  const db = getDb();
  const m = db.prepare('SELECT * FROM materials WHERE id=? AND user_id=?').get(id, userId);
  if (!m) throw new HttpError(404, 'material_not_found');
  const chapters = db.prepare('SELECT id, idx, title FROM chapters WHERE material_id=? ORDER BY idx').all(id);
  const concepts = db.prepare(`
    SELECT DISTINCT c.id, c.name, c.mastery_pct, c.last_reviewed_at
    FROM concepts c
    WHERE c.user_id=?
      AND EXISTS (
        SELECT 1 FROM chunks ch
        WHERE ch.material_id=?
          AND instr(lower(ch.text), lower(c.name)) > 0
      )
    ORDER BY c.mastery_pct ASC, c.name ASC
    LIMIT 12
  `).all(userId, id);
  return { ...m, display_title: displayTitleForMaterial(db, m), chapters, concepts };
}

function isGenericMaterialTitle(title) {
  return topicResolver.isGenericTopic(title) || /^\d+$/.test(String(title || '').trim());
}

function parseJson(value, fallback = {}) {
  try { return value ? JSON.parse(value) : fallback; } catch (_) { return fallback; }
}

function splitCompactTitle(value) {
  const text = String(value || '')
    .replace(/\.[a-z0-9]{2,5}$/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/^\s*(?:\d+\s*){1,3}/, '')
    .replace(/\b(?:unit|chapter|lecture|lec|slide|deck|pdf|pptx?|docx?)\b/gi, ' ')
    .replace(/\b(?:cs|ds)\s*\d{2,4}\b/gi, ' ')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();
  if (/^(?:[A-Z]{1,4}|\d+)(?:\s+(?:[A-Z]{1,4}|\d+))*$/i.test(text)) return '';
  return text;
}

function isCodeLikeTitle(value) {
  const text = String(value || '').trim();
  if (!text) return true;
  if (/[_-]|\d/.test(text) && !/\s/.test(text)) return true;
  if (/^(?:[A-Z]{2,6}|\d+)(?:[-_\s]+(?:[A-Z]{2,6}|\d+))*$/.test(text)) return true;
  return false;
}

function cleanHeadlineCandidate(value) {
  const text = sourceTextQuality.cleanVisible(value)
    .replace(/^\d+\.\s*/, '')
    .replace(/^\d{1,3}\s+(?=[A-Za-z])/, '')
    .replace(/^(?:[A-Z]{2,6}\s*)?(?:design|handout|lecture|chapter|unit|module)\s*#?\d+\s*(?:--|-|:)\s*/i, '')
    .replace(/\b(?:lecture|slides?|chapter|unit|module|handout)\b\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text || text.length < 3 || text.length > 90) return '';
  if (sourceTextQuality.isWeakHeading(text) || sourceTextQuality.isDocumentMetadata(text) || sourceTextQuality.isIncompleteLabel(text)) return '';
  if (/^(?:source excerpt|document|page|slide|lecture|chapter|unit|module|contents?)\b/i.test(text)) return '';
  if (text.split(/\s+/).length > 10) return '';
  if (/[.!?]$/.test(text) && text.split(/\s+/).length > 5) return '';
  return text;
}

function addTitleCandidate(out, seen, value) {
  const cleaned = cleanHeadlineCandidate(value);
  const key = sourceTextQuality.normalize(cleaned);
  if (!cleaned || !key || seen.has(key)) return;
  seen.add(key);
  out.push(cleaned);
}

function topicMapTitleCandidates(material) {
  const parsed = parseJson(material && material.topic_map_json, {});
  const out = [];
  const addSplit = value => String(value || '').split(/\s+\/\s+|\s+[>›]\s+|\s+—\s+/).forEach(part => out.push(part));
  addSplit(parsed.title);
  out.push(parsed.sourceOutline && parsed.sourceOutline.mainTopic);
  for (const topic of (parsed.topics || [])) out.push(topic && topic.name);
  for (const topic of (parsed.sourceOutline && parsed.sourceOutline.majorTopics || [])) out.push(topic && topic.topic);
  return out;
}

function displayTitleForMaterial(db, material) {
  const title = String(material && material.title || '').replace(/\s+/g, ' ').trim();
  const candidates = [];
  const seen = new Set();
  const topicMapJson = material && material.topic_map_json != null
    ? material.topic_map_json
    : (material && material.id ? (db.prepare('SELECT topic_map_json FROM materials WHERE id=?').get(material.id) || {}).topic_map_json : null);
  const withTopicMap = { ...(material || {}), topic_map_json: topicMapJson };
  if (!isGenericMaterialTitle(title) && !isCodeLikeTitle(title)) addTitleCandidate(candidates, seen, title);
  if (isCodeLikeTitle(title)) addTitleCandidate(candidates, seen, splitCompactTitle(title));
  for (const candidate of topicMapTitleCandidates(withTopicMap)) addTitleCandidate(candidates, seen, candidate);
  const chunks = db.prepare(`SELECT id, idx, text, chapter_title, heading, slide_title, section_title
                             FROM chunks WHERE material_id=? ORDER BY idx LIMIT 8`).all(material.id);
  for (const c of chunks) addTitleCandidate(candidates, seen, c.heading || c.slide_title || c.section_title || c.chapter_title);
  const ranked = topicResolver.rankTopicsFromChunks(chunks);
  addTitleCandidate(candidates, seen, ranked && ranked.topic);
  if (!candidates.length && title) addTitleCandidate(candidates, seen, splitCompactTitle(title) || title);
  if (candidates.length) return candidates[0];
  const sourceTitle = chunks.map(c => cleanHeadlineCandidate(c.heading || c.slide_title || c.section_title || c.chapter_title)).find(Boolean);
  const topic = ranked && ranked.topic;
  if (topic) return topic;
  if (sourceTitle) return sourceTitle;
  return `Material #${material.id}`;
}

function getChunks(userId, materialId, chapterId) {
  const db = getDb();
  const m = db.prepare('SELECT id FROM materials WHERE id=? AND user_id=?').get(materialId, userId);
  if (!m) throw new HttpError(404, 'material_not_found');
  if (chapterId) {
    return db.prepare(`SELECT id, idx, text, raw_text, content_type, relevance_score, relevance_level, relevance_reasons_json, ocr_confidence,
                       source_page, chapter_title, heading, slide_number, slide_title, section_title, has_code, keywords_json, source_kind, source_visual_id
                       FROM chunks WHERE material_id=? AND chapter_id=? ORDER BY idx`)
      .all(materialId, chapterId);
  }
  return db.prepare(`SELECT id, idx, text, raw_text, content_type, relevance_score, relevance_level, relevance_reasons_json, ocr_confidence,
                     source_page, chapter_title, heading, slide_number, slide_title, section_title, has_code, keywords_json, source_kind, source_visual_id
                     FROM chunks WHERE material_id=? ORDER BY idx`).all(materialId);
}

function deleteMaterial(userId, id) {
  const db = getDb();
  const m = db.prepare('SELECT id, file_path FROM materials WHERE id=? AND user_id=?').get(id, userId);
  if (!m) throw new HttpError(404, 'material_not_found');
  db.transaction(() => {
    // Legacy flashcards predate a material foreign key. Remove them explicitly so
    // deleting a material cannot leave an unscoped deck in the global due queue.
    db.prepare('DELETE FROM flashcards WHERE material_id=? AND user_id=?').run(id, userId);
    db.prepare('DELETE FROM materials WHERE id=?').run(id);
  })();
  try { if (m.file_path && fs.existsSync(m.file_path)) fs.unlinkSync(m.file_path); } catch (_) {}
  try { fs.rmSync(path.join(env.UPLOAD_DIR, 'source-visuals', String(id)), { recursive: true, force: true }); } catch (_) {}
  try { fs.rmSync(path.join(env.UPLOAD_DIR, 'ocr', String(id)), { recursive: true, force: true }); } catch (_) {}
  return { ok: true };
}

function createPending(userId, file, courseId) {
  const db = getDb();
  const ext = path.extname(file.originalname || file.filename || '').toLowerCase();
  const title = (file.originalname || file.filename || 'Untitled').replace(/\.[^.]+$/, '');
  if (courseId) {
    const course = db.prepare('SELECT id FROM courses WHERE id=? AND user_id=?').get(courseId, userId);
    if (!course) throw new HttpError(404, 'course_not_found');
  }
  const info = db.prepare(`INSERT INTO materials (user_id, course_id, title, type, file_path, mime, size_bytes, status, progress, created_at)
                           VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
    userId, courseId || null, title, fileTypeFromExt(ext),
    file.path, file.mimetype || '', file.size || 0,
    'queued', 0, nowIso()
  );
  return { id: info.lastInsertRowid, title };
}

function cleanConceptName(name) {
  return String(name || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

async function extractAndStoreConcepts(userId, chunks) {
  const sample = (chunks || []).slice(0, 12).map(c => ({ id: c.id, text: String(c.text || '').slice(0, 2000) }));
  if (!sample.length) return [];
  const raw = await ai.generate(prompts.CONCEPT_EXTRACT(sample), { format: 'json', temperature: 0.2 });
  const parsed = await parseJsonSafe(raw, ConceptExtractSchema, async (txt) => ai.generate(prompts.REPAIR_JSON(txt), { temperature: 0 }));
  const names = [...new Set((parsed.concepts || []).map(cleanConceptName).filter(Boolean))];
  if (!names.length) return [];
  const db = getDb();
  const ins = db.prepare('INSERT OR IGNORE INTO concepts (user_id, name, mastery_pct) VALUES (?,?,0)');
  db.transaction(() => {
    for (const name of names) ins.run(userId, name);
  })();
  return names;
}

function saveExtractionDiagnostics(db, materialId, status, provider, diagnostics = {}) {
  db.prepare(`UPDATE materials
              SET extraction_diagnostics_json=?, ocr_status=?, ocr_provider=?
              WHERE id=?`).run(
    JSON.stringify(diagnostics || {}),
    status || 'not_evaluated',
    provider || null,
    materialId
  );
}

function visualIdForChunk(chunk, candidates = []) {
  const match = candidates.find((candidate) => {
    if (chunk.slide_number != null && candidate.slideNumber != null) return Number(chunk.slide_number) === Number(candidate.slideNumber);
    if (chunk.source_page != null && (candidate.sourcePage != null || candidate.pageNumber != null)) {
      return Number(chunk.source_page) === Number(candidate.sourcePage ?? candidate.pageNumber);
    }
    return false;
  });
  return match ? match.id : null;
}

function sourceKindForChunk(chunk, pages = []) {
  const page = pages.find((p) => {
    if (chunk.slide_number != null && p.slideNumber != null) return Number(chunk.slide_number) === Number(p.slideNumber);
    if (chunk.source_page != null && p.pageNumber != null) return Number(chunk.source_page) === Number(p.pageNumber);
    return false;
  });
  return page && page.sourceKind ? page.sourceKind : 'text';
}

async function processMaterial(materialId, jobId, opts = {}) {
  const db = getDb();
  const replaceExisting = !!opts.replaceExisting;
  const setStatus = (s, p) => db.prepare('UPDATE materials SET status=?, progress=? WHERE id=?').run(s, p, materialId);
  const m = db.prepare('SELECT * FROM materials WHERE id=?').get(materialId);
  if (!m) return;
  let analysisRunId = null;
  try {
    setStatus('processing', 10);
    if (jobId) jobs.update(jobId, { status: 'running', progress: 10 });

    const structured = await extractStructured(m.file_path, m.mime);
    const quality = extractionQuality.analyzeExtraction(structured, {
      minTextCharsPerPage: env.OCR_MIN_TEXT_CHARS_PER_PAGE,
    });
    let ocrStatus = quality.needsOcr ? 'ocr_needed' : 'ocr_skipped_not_needed';
    let ocrResult = null;
    let ocrError = null;
    let mergedExtraction = structured;
    saveExtractionDiagnostics(db, materialId, ocrStatus, env.OCR_PROVIDER, { quality, ocr: { enabled: env.OCR_ENABLED, status: ocrStatus } });

    if (quality.needsOcr && !env.OCR_ENABLED) {
      ocrStatus = 'ocr_skipped_disabled';
      saveExtractionDiagnostics(db, materialId, ocrStatus, env.OCR_PROVIDER, { quality, ocr: { enabled: false, status: ocrStatus } });
      if (jobId) jobs.update(jobId, { progress: 18, stage: ocrStatus });
    } else if (quality.needsOcr && env.OCR_ENABLED) {
      ocrStatus = 'ocr_running';
      saveExtractionDiagnostics(db, materialId, ocrStatus, env.OCR_PROVIDER, { quality, ocr: { enabled: true, status: ocrStatus } });
      if (jobId) jobs.update(jobId, { progress: 18, stage: ocrStatus });
      try {
        ocrResult = await ocr.runOcr({
          filePath: m.file_path,
          mime: m.mime,
          structured,
          quality,
          materialId,
          provider: env.OCR_PROVIDER,
        });
        mergedExtraction = extractionQuality.mergeStructuredWithOcr(structured, ocrResult);
        ocrStatus = 'ocr_completed';
        saveExtractionDiagnostics(db, materialId, ocrStatus, ocrResult.provider || env.OCR_PROVIDER, {
          quality,
          ocr: {
            enabled: true,
            status: ocrStatus,
            provider: ocrResult.provider || env.OCR_PROVIDER,
            pages: (ocrResult.pages || []).length,
          },
        });
      } catch (err) {
        ocrError = err;
        ocrStatus = 'ocr_failed_using_normal_extraction';
        mergedExtraction = extractionQuality.mergeStructuredWithOcr(structured, null);
        saveExtractionDiagnostics(db, materialId, ocrStatus, env.OCR_PROVIDER, {
          quality,
          ocr: {
            enabled: true,
            status: ocrStatus,
            provider: env.OCR_PROVIDER,
            error: String(err.message || err),
            missing: err.missing || undefined,
          },
        });
        log.warn('ocr_failed_using_normal_extraction', { materialId, error: err.message || err });
        if (jobId) jobs.update(jobId, { progress: 20, stage: ocrStatus, ocr_error: String(err.message || err) });
      }
    } else {
      mergedExtraction = extractionQuality.mergeStructuredWithOcr(structured, null);
      if (jobId) jobs.update(jobId, { progress: 18, stage: ocrStatus });
    }

    const analysis = await materialAnalysis.analyzeAndPersist({
      material: m,
      structured: mergedExtraction,
      pipelineVersion: EXTRACTION_PIPELINE_VERSION,
    });
    analysisRunId = analysis.analysisRunId;
    const text = analysis.view.cleanedEducationalText || mergedExtraction.text || structured.text || '';
    if (!text || text.trim().length < 20) throw new Error('no_extractable_text');
    setStatus('processing', 30);
    if (jobId) jobs.update(jobId, { progress: 30 });

    const visualCandidates = [...(analysis.assets || [])].sort((a, b) => Number(b.selectedForVideo) - Number(a.selectedForVideo));

    const chapters = detectChapters(text);
    const chunks = chunkByChapter(text, chapters);
    if (chunks.length === 0) throw new Error('no_chunks_created');
    const insChapter = db.prepare('INSERT INTO chapters (material_id, idx, title, char_start, char_end) VALUES (?,?,?,?,?)');
    const chapterIds = [];
    const insChunk = db.prepare(`INSERT INTO chunks
      (material_id, chapter_id, idx, text, token_count, source_page, chapter_title, heading, slide_number, slide_title,
       section_title, has_code, keywords_json, source_kind, source_visual_id, analysis_run_id, raw_text, content_type,
       relevance_score, relevance_level, relevance_reasons_json, ocr_confidence)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    const inserted = [];
    db.transaction(() => {
      if (replaceExisting) {
        db.prepare('UPDATE flashcards SET source_chunk_id=NULL WHERE material_id=?').run(materialId);
        db.prepare('DELETE FROM chunks WHERE material_id=?').run(materialId);
        db.prepare('DELETE FROM chapters WHERE material_id=?').run(materialId);
      }
      for (const ch of chapters) {
        const r = insChapter.run(materialId, ch.idx, ch.title, ch.char_start, ch.char_end);
        chapterIds[ch.idx] = r.lastInsertRowid;
      }
      for (const c of chunks) {
        const unit = bestEducationalUnitForChunk(c, analysis.view.allScoredChunks || []);
        const locatedChunk = {
          ...c,
          source_page: c.source_page || unit && unit.pageNumber || null,
          slide_number: c.slide_number || unit && unit.slideNumber || null,
        };
        const sourceKind = sourceKindForChunk(locatedChunk, mergedExtraction.pages || []);
        const sourceVisualId = visualIdForChunk(locatedChunk, visualCandidates);
        const r = insChunk.run(
          materialId,
          chapterIds[c.chapter_idx] || null,
          c.idx,
          c.text,
          c.token_count,
          locatedChunk.source_page,
          c.chapter_title || '',
          c.heading || unit && unit.heading || '',
          locatedChunk.slide_number,
          c.slide_title || '',
          c.section_title || c.heading || '',
          c.has_code ? 1 : 0,
          c.keywords_json || JSON.stringify(c.keywords || []),
          sourceKind,
          sourceVisualId,
          analysisRunId,
          unit && unit.rawText || c.text,
          unit && unit.contentType || (c.has_code ? 'code' : 'prose'),
          unit && unit.relevanceScore != null ? unit.relevanceScore : 0.7,
          unit && unit.relevanceLevel || 'high',
          JSON.stringify(unit && unit.relevanceReasons || []),
          unit && unit.ocrConfidence != null ? unit.ocrConfidence : null
        );
        inserted.push({
          id: r.lastInsertRowid,
          text: c.text,
          chapter_title: c.chapter_title || '',
          heading: c.heading || unit && unit.heading || '',
          source_page: locatedChunk.source_page,
          slide_number: locatedChunk.slide_number,
          source_kind: sourceKind,
          source_visual_id: sourceVisualId,
          relevance_score: unit && unit.relevanceScore != null ? unit.relevanceScore : 0.7,
          relevance_level: unit && unit.relevanceLevel || 'high',
          content_type: unit && unit.contentType || (c.has_code ? 'code' : 'prose'),
        });
      }
      db.prepare(`UPDATE material_analysis_runs SET status='completed', completed_at=? WHERE id=? AND material_id=?`)
        .run(nowIso(), analysisRunId, materialId);
      db.prepare('UPDATE materials SET active_analysis_run_id=? WHERE id=?').run(analysisRunId, materialId);
    })();
    saveExtractionDiagnostics(db, materialId, ocrStatus, (ocrResult && ocrResult.provider) || env.OCR_PROVIDER, {
      quality,
      ocr: {
        enabled: env.OCR_ENABLED,
        status: ocrStatus,
        provider: (ocrResult && ocrResult.provider) || env.OCR_PROVIDER,
        error: ocrError ? String(ocrError.message || ocrError) : null,
      },
      sourcePages: (mergedExtraction.pages || []).length,
      sourceVisualCandidates: visualCandidates.length,
      analysisRunId,
      cleanedEducationalChars: text.length,
      rawExtractedChars: analysis.rawExtractedText.length,
      lowValueTextCount: analysis.view.lowValueTextRemoved.length,
      selectedVisualAssets: visualCandidates.filter(candidate => candidate.selectedForVideo).length,
      codeBlocks: analysis.codeBlocks.length,
      tables: analysis.tables.length,
      warnings: analysis.warnings,
      extractionPipelineVersion: EXTRACTION_PIPELINE_VERSION,
    });
    let refreshedTopicMap = null;
    try {
      refreshedTopicMap = materialTopicMap.refresh(m.user_id, materialId, { hint: m.title, limit: 120 });
    } catch (e) {
      log.warn('material_topic_map_failed', e.message || e);
    }
    setStatus('processing', 60);
    if (jobId) jobs.update(jobId, { progress: 60 });

    await embedAndStore(materialId, inserted);
    setStatus('processing', 80);
    if (jobId) jobs.update(jobId, { progress: 80 });

    try {
      const concepts = await extractAndStoreConcepts(m.user_id, inserted);
      if (concepts.length) log.info(`material concepts ${materialId}: ${concepts.join(', ')}`);
    } catch (e) {
      log.warn('concept_extract_failed', e.message || e);
    }

    if (jobId) jobs.update(jobId, { progress: 90, stage: 'Building material mind map...' });
    try {
      await materialLearningMaps.generateAndPersist(m.user_id, materialId, {
        topicMap: refreshedTopicMap,
        timeoutMs: materialLearningMaps.AI_TIMEOUT_MS,
      });
    } catch (e) {
      log.warn('material_learning_map_failed', e.message || e);
      materialLearningMaps.getOrBuild(m.user_id, materialId, { topicMap: refreshedTopicMap, force: true, persist: true });
    }

    setStatus('ready', 100);
    if (!replaceExisting) db.prepare(`INSERT INTO study_events (user_id, kind, ref_id, duration_s, occurred_at) VALUES (?,?,?,?,?)`)
      .run(m.user_id, 'reading', materialId, 0, nowIso());
    if (!replaceExisting && m.user_id > 0) {
      gamification.award(m.user_id, 'material_uploaded', 'material', materialId, {
        metadata: { title: m.title, type: m.type },
      });
    }
    if (jobId) jobs.update(jobId, { status: 'completed', progress: 100, result: { material_id: materialId } });
  } catch (e) {
    materialAnalysis.failRun(materialId, analysisRunId, e);
    log.error('processMaterial', e.message || e);
    const existingChunks = db.prepare('SELECT COUNT(*) AS count FROM chunks WHERE material_id=?').get(materialId).count;
    setStatus(replaceExisting && existingChunks > 0 ? 'ready' : 'failed', replaceExisting && existingChunks > 0 ? 100 : 0);
    if (jobId) jobs.update(jobId, { status: 'failed', error: String(e.message || e) });
  }
}

function bestEducationalUnitForChunk(chunk, units = []) {
  const chunkWords = new Set(String(chunk && chunk.text || '').toLowerCase().match(/[a-z0-9+#-]{3,}/g) || []);
  let best = null;
  let bestScore = -1;
  for (const unit of units || []) {
    if (chunk.slide_number != null && unit.slideNumber != null && Number(chunk.slide_number) !== Number(unit.slideNumber)) continue;
    if (chunk.source_page != null && unit.pageNumber != null && Number(chunk.source_page) !== Number(unit.pageNumber)) continue;
    const unitWords = [...new Set(String(unit.text || '').toLowerCase().match(/[a-z0-9+#-]{3,}/g) || [])];
    const overlap = unitWords.filter(word => chunkWords.has(word)).length;
    const score = overlap + Number(unit.relevanceScore || 0);
    if (score > bestScore) { best = unit; bestScore = score; }
  }
  return best;
}

function extractionNeedsReindex(userId, materialId) {
  const db = getDb();
  const row = db.prepare(`SELECT m.id, m.status, m.file_path, m.extraction_diagnostics_json, m.active_analysis_run_id,
    ar.status AS analysis_status, ar.pipeline_version AS analysis_pipeline_version
    FROM materials m LEFT JOIN material_analysis_runs ar ON ar.id=m.active_analysis_run_id
    WHERE m.id=? AND m.user_id=?`).get(materialId, userId);
  if (!row) throw new HttpError(404, 'material_not_found');
  let diagnostics = {};
  try { diagnostics = JSON.parse(row.extraction_diagnostics_json || '{}'); } catch (_) {}
  const stale = row.status !== 'ready'
    || Number(diagnostics.extractionPipelineVersion || 0) < EXTRACTION_PIPELINE_VERSION
    || !row.active_analysis_run_id
    || row.analysis_status !== 'completed'
    || Number(row.analysis_pipeline_version || 0) < EXTRACTION_PIPELINE_VERSION;
  if (!stale) return false;
  const existingChunks = db.prepare('SELECT COUNT(*) AS count FROM chunks WHERE material_id=?').get(materialId).count || 0;
  if (row.status === 'ready' && existingChunks > 0 && (!row.file_path || !fs.existsSync(row.file_path))) return false;
  return true;
}

function queueReindex(userId, materialId) {
  if (!extractionNeedsReindex(userId, materialId)) return { needed: false, job: null };
  const active = jobs.findActive('material_reindex', { userId, materialId });
  if (active) return { needed: true, job: active };
  const job = jobs.create('material_reindex', { userId, materialId });
  setImmediate(() => processMaterial(materialId, job.id, { replaceExisting: true }));
  return { needed: true, job };
}

module.exports = {
  listForUser,
  getOwned,
  getChunks,
  createPending,
  deleteMaterial,
  processMaterial,
  displayTitleForMaterial,
  extractionNeedsReindex,
  queueReindex,
  EXTRACTION_PIPELINE_VERSION,
};
