'use strict';

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const env = require('./env');

let _db = null;

function ensureDirs() {
  fs.mkdirSync(env.DATA_DIR, { recursive: true });
  fs.mkdirSync(path.join(env.UPLOAD_DIR, 'materials'), { recursive: true });
  fs.mkdirSync(path.join(env.UPLOAD_DIR, 'audio'), { recursive: true });
  fs.mkdirSync(path.join(env.UPLOAD_DIR, 'slides'), { recursive: true });
  fs.mkdirSync(path.join(env.UPLOAD_DIR, 'videos'), { recursive: true });
}

function getDb() {
  if (_db) return _db;
  ensureDirs();
  _db = new Database(env.DB_PATH);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');
  migrate();
  return _db;
}

function migrate() {
  ensureDirs();
  const db = _db || new Database(env.DB_PATH);
  if (!_db) _db = db;
  const sql = fs.readFileSync(path.join(__dirname, '..', 'migrations', '001_init.sql'), 'utf8');
  db.exec(sql);
  ensureColumn(db, 'flashcard_reviews', 'reps', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn(db, 'flashcards', 'difficulty', "TEXT DEFAULT 'medium'");
  ensureColumn(db, 'flashcards', 'topic', 'TEXT');
  ensureColumn(db, 'chunks', 'source_page', 'INTEGER');
  ensureColumn(db, 'chunks', 'chapter_title', "TEXT DEFAULT ''");
  ensureColumn(db, 'chunks', 'heading', "TEXT DEFAULT ''");
  ensureColumnFromMigration(db, 'videos', 'resolved_concept', '002_add_video_resolved_concept.sql');
  return db;
}

function ensureColumn(db, table, column, definition) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some(c => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function ensureColumnFromMigration(db, table, column, fileName) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some(c => c.name === column)) {
    const sql = fs.readFileSync(path.join(__dirname, '..', 'migrations', fileName), 'utf8');
    db.exec(sql);
  }
}

module.exports = { getDb, migrate };
