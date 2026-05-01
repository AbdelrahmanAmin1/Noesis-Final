'use strict';

const express = require('express');
const { z } = require('zod');
const { requireAuth } = require('../middleware/auth');
const { aiLimiter } = require('../middleware/rateLimit');
const { getDb } = require('../config/db');
const { HttpError } = require('../middleware/error');
const ai = require('../services/ai.service');
const { retrieve } = require('../services/rag.service');
const prompts = require('../utils/prompts');

const router = express.Router();
const nowIso = () => new Date().toISOString();

router.get('/', requireAuth, (req, res, next) => {
  try {
    const db = getDb();
    const folder = req.query.folder;
    const rows = folder
      ? db.prepare('SELECT id, material_id, folder, title, body_md, tags_json, updated_at FROM notes WHERE user_id=? AND folder=? ORDER BY updated_at DESC').all(req.user.id, folder)
      : db.prepare('SELECT id, material_id, folder, title, body_md, tags_json, updated_at FROM notes WHERE user_id=? ORDER BY updated_at DESC').all(req.user.id);
    const folders = db.prepare('SELECT folder, COUNT(*) AS count FROM notes WHERE user_id=? GROUP BY folder').all(req.user.id);
    res.json({ notes: rows, folders });
  } catch (e) { next(e); }
});

router.post('/', requireAuth, (req, res, next) => {
  try {
    const { title, body_md, folder, tags, material_id } = req.body || {};
    if (!title) throw new HttpError(400, 'missing_title');
    const db = getDb();
    let ownedMaterialId = null;
    if (material_id) {
      const m = db.prepare('SELECT id FROM materials WHERE id=? AND user_id=?').get(material_id, req.user.id);
      if (!m) throw new HttpError(404, 'material_not_found');
      ownedMaterialId = m.id;
    }
    const r = db.prepare(`INSERT INTO notes (user_id, material_id, folder, title, body_md, tags_json, created_at, updated_at)
                          VALUES (?,?,?,?,?,?,?,?)`).run(
      req.user.id, ownedMaterialId, folder || 'General',
      title, body_md || '', JSON.stringify(tags || []), nowIso(), nowIso()
    );
    res.json({ id: r.lastInsertRowid });
  } catch (e) { next(e); }
});

router.get('/:id', requireAuth, (req, res, next) => {
  try {
    const db = getDb();
    const n = db.prepare('SELECT * FROM notes WHERE id=? AND user_id=?').get(parseInt(req.params.id, 10), req.user.id);
    if (!n) throw new HttpError(404, 'not_found');
    res.json(n);
  } catch (e) { next(e); }
});

router.put('/:id', requireAuth, (req, res, next) => {
  try {
    const db = getDb();
    const n = db.prepare('SELECT id FROM notes WHERE id=? AND user_id=?').get(parseInt(req.params.id, 10), req.user.id);
    if (!n) throw new HttpError(404, 'not_found');
    const { title, body_md, folder, tags } = req.body || {};
    db.prepare('UPDATE notes SET title=COALESCE(?,title), body_md=COALESCE(?,body_md), folder=COALESCE(?,folder), tags_json=COALESCE(?,tags_json), updated_at=? WHERE id=?')
      .run(title || null, body_md || null, folder || null, tags ? JSON.stringify(tags) : null, nowIso(), n.id);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.delete('/:id', requireAuth, (req, res, next) => {
  try {
    const db = getDb();
    const r = db.prepare('DELETE FROM notes WHERE id=? AND user_id=?').run(parseInt(req.params.id, 10), req.user.id);
    res.json({ ok: r.changes > 0 });
  } catch (e) { next(e); }
});

router.post('/generate', requireAuth, aiLimiter, async (req, res, next) => {
  try {
    const { material_id, chapter_id, query } = req.body || {};
    if (!material_id) throw new HttpError(400, 'missing_material_id');
    const db = getDb();
    const m = db.prepare('SELECT id, title FROM materials WHERE id=? AND user_id=?').get(material_id, req.user.id);
    if (!m) throw new HttpError(404, 'material_not_found');
    const chapterTitle = chapter_id ? (db.prepare(`
      SELECT c.title
      FROM chapters c
      JOIN materials m ON m.id = c.material_id
      WHERE c.id=? AND c.material_id=? AND m.user_id=?
    `).get(chapter_id, material_id, req.user.id) || {}).title : null;
    if (chapter_id && !chapterTitle) throw new HttpError(404, 'chapter_not_found');
    const q = query || chapterTitle || m.title;
    const chunks = await retrieve(material_id, q, 8);
    const prompt = prompts.NOTES_SUMMARY(chunks, chapterTitle || m.title);
    const md = await ai.generate(prompt, { temperature: 0.4 });
    const r = db.prepare(`INSERT INTO notes (user_id, material_id, folder, title, body_md, tags_json, created_at, updated_at)
                          VALUES (?,?,?,?,?,?,?,?)`).run(
      req.user.id, material_id, m.title,
      chapterTitle || m.title, md, JSON.stringify(['ai-generated', 'concept']), nowIso(), nowIso()
    );
    db.prepare(`INSERT INTO study_events (user_id, kind, ref_id, duration_s, occurred_at) VALUES (?,?,?,?,?)`)
      .run(req.user.id, 'reading', r.lastInsertRowid, 60, nowIso());
    res.json({ id: r.lastInsertRowid, title: chapterTitle || m.title, body_md: md });
  } catch (e) { next(e); }
});

module.exports = router;
