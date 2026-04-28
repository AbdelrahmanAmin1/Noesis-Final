'use strict';

const fs = require('fs');
const path = require('path');
const { getDb } = require('../config/db');
const { HttpError } = require('../middleware/error');
const { extractText, detectChapters } = require('./extract.service');
const { chunkByChapter } = require('./chunk.service');
const { embedAndStore } = require('./rag.service');
const jobs = require('./jobs.service');
const log = require('../utils/logger');

function nowIso() { return new Date().toISOString(); }

function fileTypeFromExt(ext) {
  const e = (ext || '').toLowerCase();
  if (e === '.pdf') return 'pdf';
  if (e === '.docx' || e === '.doc') return 'slides';
  return 'note';
}

function listForUser(userId) {
  const db = getDb();
  return db.prepare(`SELECT id, title, type, status, progress, created_at,
                     (SELECT COUNT(*) FROM chapters c WHERE c.material_id = m.id) AS chapters
                     FROM materials m WHERE user_id=? ORDER BY created_at DESC`).all(userId);
}

function getOwned(userId, id) {
  const db = getDb();
  const m = db.prepare('SELECT * FROM materials WHERE id=? AND user_id=?').get(id, userId);
  if (!m) throw new HttpError(404, 'material_not_found');
  const chapters = db.prepare('SELECT id, idx, title FROM chapters WHERE material_id=? ORDER BY idx').all(id);
  return { ...m, chapters };
}

function getChunks(userId, materialId, chapterId) {
  const db = getDb();
  const m = db.prepare('SELECT id FROM materials WHERE id=? AND user_id=?').get(materialId, userId);
  if (!m) throw new HttpError(404, 'material_not_found');
  if (chapterId) {
    return db.prepare('SELECT id, idx, text FROM chunks WHERE material_id=? AND chapter_id=? ORDER BY idx')
      .all(materialId, chapterId);
  }
  return db.prepare('SELECT id, idx, text FROM chunks WHERE material_id=? ORDER BY idx').all(materialId);
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
    const insChunk = db.prepare('INSERT INTO chunks (material_id, chapter_id, idx, text, token_count) VALUES (?,?,?,?,?)');
    const inserted = [];
    db.transaction(() => {
      for (const c of chunks) {
        const r = insChunk.run(materialId, chapterIds[c.chapter_idx] || null, c.idx, c.text, c.token_count);
        inserted.push({ id: r.lastInsertRowid, text: c.text });
      }
    })();
    setStatus('processing', 60);
    if (jobId) jobs.update(jobId, { progress: 60 });

    await embedAndStore(materialId, inserted);

    setStatus('ready', 100);
    db.prepare(`INSERT INTO study_events (user_id, kind, ref_id, duration_s, occurred_at) VALUES (?,?,?,?,?)`)
      .run(m.user_id, 'reading', materialId, 0, nowIso());
    if (jobId) jobs.update(jobId, { status: 'completed', progress: 100, result: { material_id: materialId } });
  } catch (e) {
    log.error('processMaterial', e.message || e);
    setStatus('failed', 0);
    if (jobId) jobs.update(jobId, { status: 'failed', error: String(e.message || e) });
  }
}

module.exports = { listForUser, getOwned, getChunks, createPending, deleteMaterial, processMaterial };
