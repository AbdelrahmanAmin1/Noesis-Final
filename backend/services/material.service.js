'use strict';

const fs = require('fs');
const path = require('path');
const { z } = require('zod');
const { getDb } = require('../config/db');
const { HttpError } = require('../middleware/error');
const { extractText, detectChapters } = require('./extract.service');
const { chunkByChapter } = require('./chunk.service');
const { embedAndStore } = require('./rag.service');
const ai = require('./ai.service');
const jobs = require('./jobs.service');
const log = require('../utils/logger');
const prompts = require('../utils/prompts');
const { parseJsonSafe } = require('../utils/jsonSafe');
const topicResolver = require('./topic-resolver.service');
const gamification = require('./gamification.service');

function nowIso() { return new Date().toISOString(); }

const ConceptExtractSchema = z.object({
  concepts: z.array(z.string().min(1)).min(1).max(8),
});

function fileTypeFromExt(ext) {
  const e = (ext || '').toLowerCase();
  if (e === '.pdf') return 'pdf';
  if (e === '.pptx' || e === '.ppt') return 'slides';
  if (e === '.docx' || e === '.doc') return 'doc';
  return 'note';
}

function listForUser(userId) {
  const db = getDb();
  const rows = db.prepare(`SELECT id, title, type, status, progress, created_at,
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

function displayTitleForMaterial(db, material) {
  const title = String(material && material.title || '').replace(/\s+/g, ' ').trim();
  if (!isGenericMaterialTitle(title)) return title || `Material #${material.id}`;
  const chunks = db.prepare(`SELECT id, idx, text, chapter_title, heading, slide_title, section_title
                             FROM chunks WHERE material_id=? ORDER BY idx LIMIT 8`).all(material.id);
  const ranked = topicResolver.rankTopicsFromChunks(chunks);
  const sourceTitle = chunks.map(c => c.chapter_title || c.heading || c.slide_title || c.section_title).find(Boolean);
  const topic = ranked && ranked.topic;
  if (sourceTitle && topic) return `${sourceTitle} — ${topic}`;
  if (topic) return topic;
  if (sourceTitle) return sourceTitle;
  return `Material #${material.id}`;
}

function getChunks(userId, materialId, chapterId) {
  const db = getDb();
  const m = db.prepare('SELECT id FROM materials WHERE id=? AND user_id=?').get(materialId, userId);
  if (!m) throw new HttpError(404, 'material_not_found');
  if (chapterId) {
    return db.prepare(`SELECT id, idx, text, chapter_title, heading, slide_number, slide_title, section_title, has_code, keywords_json
                       FROM chunks WHERE material_id=? AND chapter_id=? ORDER BY idx`)
      .all(materialId, chapterId);
  }
  return db.prepare(`SELECT id, idx, text, chapter_title, heading, slide_number, slide_title, section_title, has_code, keywords_json
                     FROM chunks WHERE material_id=? ORDER BY idx`).all(materialId);
}

function deleteMaterial(userId, id) {
  const db = getDb();
  const m = db.prepare('SELECT id, file_path FROM materials WHERE id=? AND user_id=?').get(id, userId);
  if (!m) throw new HttpError(404, 'material_not_found');
  db.prepare('DELETE FROM materials WHERE id=?').run(id);
  try { if (m.file_path && fs.existsSync(m.file_path)) fs.unlinkSync(m.file_path); } catch (_) {}
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

async function processMaterial(materialId, jobId) {
  const db = getDb();
  const setStatus = (s, p) => db.prepare('UPDATE materials SET status=?, progress=? WHERE id=?').run(s, p, materialId);
  const m = db.prepare('SELECT * FROM materials WHERE id=?').get(materialId);
  if (!m) return;
  try {
    setStatus('processing', 10);
    if (jobId) jobs.update(jobId, { status: 'running', progress: 10 });

    const text = await extractText(m.file_path, m.mime);
    if (!text || text.trim().length < 20) throw new Error('no_extractable_text');
    setStatus('processing', 30);
    if (jobId) jobs.update(jobId, { progress: 30 });

    const chapters = detectChapters(text);
    const insChapter = db.prepare('INSERT INTO chapters (material_id, idx, title, char_start, char_end) VALUES (?,?,?,?,?)');
    const chapterIds = [];
    db.transaction(() => {
      for (const ch of chapters) {
        const r = insChapter.run(materialId, ch.idx, ch.title, ch.char_start, ch.char_end);
        chapterIds[ch.idx] = r.lastInsertRowid;
      }
    })();

    const chunks = chunkByChapter(text, chapters);
    if (chunks.length === 0) throw new Error('no_chunks_created');
    const insChunk = db.prepare(`INSERT INTO chunks
      (material_id, chapter_id, idx, text, token_count, chapter_title, heading, slide_number, slide_title, section_title, has_code, keywords_json)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
    const inserted = [];
    db.transaction(() => {
      for (const c of chunks) {
        const r = insChunk.run(
          materialId,
          chapterIds[c.chapter_idx] || null,
          c.idx,
          c.text,
          c.token_count,
          c.chapter_title || '',
          c.heading || '',
          c.slide_number || null,
          c.slide_title || '',
          c.section_title || c.heading || '',
          c.has_code ? 1 : 0,
          c.keywords_json || JSON.stringify(c.keywords || [])
        );
        inserted.push({ id: r.lastInsertRowid, text: c.text, chapter_title: c.chapter_title || '', heading: c.heading || '' });
      }
    })();
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

    setStatus('ready', 100);
    db.prepare(`INSERT INTO study_events (user_id, kind, ref_id, duration_s, occurred_at) VALUES (?,?,?,?,?)`)
      .run(m.user_id, 'reading', materialId, 0, nowIso());
    if (m.user_id > 0) {
      gamification.award(m.user_id, 'material_uploaded', 'material', materialId, {
        metadata: { title: m.title, type: m.type },
      });
    }
    if (jobId) jobs.update(jobId, { status: 'completed', progress: 100, result: { material_id: materialId } });
  } catch (e) {
    log.error('processMaterial', e.message || e);
    setStatus('failed', 0);
    if (jobId) jobs.update(jobId, { status: 'failed', error: String(e.message || e) });
  }
}

module.exports = { listForUser, getOwned, getChunks, createPending, deleteMaterial, processMaterial, displayTitleForMaterial };
