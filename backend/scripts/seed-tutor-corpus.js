'use strict';

const fs = require('fs');
const path = require('path');
const { getDb } = require('../config/db');
const { detectChapters } = require('../services/extract.service');
const { chunkByChapter } = require('../services/chunk.service');
const { embedAndStore } = require('../services/rag.service');
const log = require('../utils/logger');

const SYSTEM_USER_ID = 0;
const SYSTEM_EMAIL = 'system@noesis.local';
// "!" is not a valid bcrypt hash; bcrypt.compare always returns false.
const UNUSABLE_PASSWORD_HASH = '!';

function nowIso() { return new Date().toISOString(); }

function ensureSystemUser(db) {
  const u = db.prepare('SELECT id FROM users WHERE id=?').get(SYSTEM_USER_ID);
  if (u) return;
  // Force the AUTOINCREMENT to skip 0 by inserting with explicit id.
  db.prepare(`INSERT OR IGNORE INTO users (id, email, password_hash, name, major, created_at)
              VALUES (?, ?, ?, ?, ?, ?)`).run(
    SYSTEM_USER_ID, SYSTEM_EMAIL, UNUSABLE_PASSWORD_HASH, 'Noesis', 'system', nowIso()
  );
}

function titleFromFilename(file) {
  const base = path.basename(file, path.extname(file));
  return base
    .replace(/^\d+[-_]?/, '')
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim();
}

function listSeedFiles() {
  const seedDir = path.join(__dirname, '..', 'seed');
  if (!fs.existsSync(seedDir)) return [];
  const out = [];
  for (const sub of fs.readdirSync(seedDir)) {
    const subDir = path.join(seedDir, sub);
    if (!fs.statSync(subDir).isDirectory()) continue;
    for (const f of fs.readdirSync(subDir)) {
      if (!/\.(md|txt)$/i.test(f)) continue;
      out.push({
        topic: sub,                       // 'oop' | 'ds'
        file: path.join(subDir, f),
        title: titleFromFilename(f),
      });
    }
  }
  return out;
}

async function seedOne(db, item) {
  const existing = db.prepare(
    'SELECT id FROM materials WHERE user_id=? AND title=?'
  ).get(SYSTEM_USER_ID, item.title);
  if (existing) return { skipped: true, materialId: existing.id };

  const text = fs.readFileSync(item.file, 'utf8');
  const r = db.prepare(`INSERT INTO materials
      (user_id, course_id, title, type, file_path, mime, size_bytes, status, progress, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
    SYSTEM_USER_ID, null, item.title, 'note',
    item.file, 'text/markdown', Buffer.byteLength(text), 'processing', 0, nowIso()
  );
  const materialId = r.lastInsertRowid;

  const chapters = detectChapters(text);
  const chapterIds = [];
  const insChapter = db.prepare(
    'INSERT INTO chapters (material_id, idx, title, char_start, char_end) VALUES (?,?,?,?,?)'
  );
  db.transaction(() => {
    for (const ch of chapters) {
      const cr = insChapter.run(materialId, ch.idx, ch.title, ch.char_start, ch.char_end);
      chapterIds[ch.idx] = cr.lastInsertRowid;
    }
  })();

  const chunks = chunkByChapter(text, chapters);
  const insChunk = db.prepare(
    'INSERT INTO chunks (material_id, chapter_id, idx, text, token_count) VALUES (?,?,?,?,?)'
  );
  const inserted = [];
  db.transaction(() => {
    for (const c of chunks) {
      const cr = insChunk.run(materialId, chapterIds[c.chapter_idx] || null, c.idx, c.text, c.token_count);
      inserted.push({ id: cr.lastInsertRowid, text: c.text });
    }
  })();

  await embedAndStore(materialId, inserted);
  db.prepare('UPDATE materials SET status=?, progress=? WHERE id=?').run('ready', 100, materialId);
  return { skipped: false, materialId, chunkCount: inserted.length };
}

async function run({ force = false } = {}) {
  const db = getDb();
  ensureSystemUser(db);
  const items = listSeedFiles();
  if (!items.length) {
    log.info('seed: no files in backend/seed/');
    return { processed: 0, skipped: 0 };
  }
  let processed = 0, skipped = 0;
  for (const item of items) {
    try {
      if (force) {
        db.prepare('DELETE FROM materials WHERE user_id=? AND title=?').run(SYSTEM_USER_ID, item.title);
      }
      const r = await seedOne(db, item);
      if (r.skipped) skipped++; else processed++;
      log.info(`seed: ${r.skipped ? 'skip' : 'ok'} ${item.topic}/${item.title}${r.chunkCount ? ` (${r.chunkCount} chunks)` : ''}`);
    } catch (e) {
      log.warn(`seed: failed ${item.title}:`, e.message || e);
    }
  }
  log.info(`seed: done — processed ${processed}, skipped ${skipped}`);
  return { processed, skipped };
}

function seedMisconceptions(db) {
  const filePath = path.join(__dirname, '..', 'seed', 'misconceptions.json');
  if (!fs.existsSync(filePath)) return 0;
  const existing = db.prepare("SELECT COUNT(*) AS c FROM chunks WHERE material_id IN (SELECT id FROM materials WHERE user_id=? AND title='Misconceptions')").get(SYSTEM_USER_ID);
  if (existing && existing.c > 0) return 0;
  const items = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const text = items.map(m =>
    `## ${m.topic}\n**Misconception:** ${m.misconception}\n**Correction:** ${m.correction}\n**Related:** ${(m.related_concepts || []).join(', ')}`
  ).join('\n\n');
  const r = db.prepare(`INSERT INTO materials
    (user_id, course_id, title, type, file_path, mime, size_bytes, status, progress, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
    SYSTEM_USER_ID, null, 'Misconceptions', 'note', filePath, 'application/json', Buffer.byteLength(text), 'ready', 100, nowIso()
  );
  const materialId = r.lastInsertRowid;
  const insChunk = db.prepare('INSERT INTO chunks (material_id, chapter_id, idx, text, token_count) VALUES (?,?,?,?,?)');
  const inserted = [];
  db.transaction(() => {
    items.forEach((m, i) => {
      const chunkText = `Topic: ${m.topic}. Misconception: ${m.misconception}. Correction: ${m.correction}. Related: ${(m.related_concepts || []).join(', ')}.`;
      const cr = insChunk.run(materialId, null, i, chunkText, Math.ceil(chunkText.split(/\s+/).length * 1.3));
      inserted.push({ id: cr.lastInsertRowid, text: chunkText });
    });
  })();
  log.info(`seed: loaded ${inserted.length} misconceptions`);
  return inserted.length;
}

async function runIfNeeded() {
  const db = getDb();
  ensureSystemUser(db);
  seedMisconceptions(db);
  const items = listSeedFiles();
  if (!items.length) return { processed: 0, skipped: 0 };
  const titles = items.map(item => item.title);
  const placeholders = titles.map(() => '?').join(',');
  const row = db.prepare(`SELECT COUNT(*) AS c FROM materials WHERE user_id=? AND title IN (${placeholders})`).get(SYSTEM_USER_ID, ...titles);
  if (row && row.c >= titles.length) return { processed: 0, skipped: row.c };
  return run();
}

if (require.main === module) {
  const force = process.argv.includes('--force');
  run({ force })
    .then(() => process.exit(0))
    .catch(err => { log.error('seed failed', err); process.exit(1); });
}

module.exports = { run, runIfNeeded, ensureSystemUser, SYSTEM_USER_ID };
