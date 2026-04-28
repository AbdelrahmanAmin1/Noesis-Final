'use strict';

const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { getDb } = require('../config/db');
const { HttpError } = require('../middleware/error');

const router = express.Router();

router.get('/', requireAuth, (req, res, next) => {
  try {
    const db = getDb();
    res.json({ courses: db.prepare('SELECT id, code, title, professor FROM courses WHERE user_id=? ORDER BY id').all(req.user.id) });
  } catch (e) { next(e); }
});

router.post('/', requireAuth, (req, res, next) => {
  try {
    const { code, title, professor } = req.body || {};
    if (!code || !title) throw new HttpError(400, 'missing_fields');
    const db = getDb();
    const r = db.prepare('INSERT INTO courses (user_id, code, title, professor) VALUES (?,?,?,?)')
      .run(req.user.id, String(code).slice(0, 32), String(title).slice(0, 200), professor ? String(professor).slice(0, 200) : null);
    res.json({ id: r.lastInsertRowid });
  } catch (e) { next(e); }
});

router.delete('/:id', requireAuth, (req, res, next) => {
  try {
    const db = getDb();
    const r = db.prepare('DELETE FROM courses WHERE id=? AND user_id=?').run(parseInt(req.params.id, 10), req.user.id);
    res.json({ ok: r.changes > 0 });
  } catch (e) { next(e); }
});

module.exports = router;
