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
  _db.pragma('busy_timeout = 15000');
  migrate();
  return _db;
}

function migrate() {
  ensureDirs();
  const db = _db || new Database(env.DB_PATH);
  if (!_db) _db = db;
  db.pragma('busy_timeout = 15000');
  const sql = fs.readFileSync(path.join(__dirname, '..', 'migrations', '001_init.sql'), 'utf8');
  db.exec(sql);
  ensureColumn(db, 'flashcard_reviews', 'reps', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn(db, 'flashcards', 'difficulty', "TEXT DEFAULT 'medium'");
  ensureColumn(db, 'flashcards', 'topic', 'TEXT');
  ensureColumn(db, 'chunks', 'source_page', 'INTEGER');
  ensureColumn(db, 'chunks', 'chapter_title', "TEXT DEFAULT ''");
  ensureColumn(db, 'chunks', 'heading', "TEXT DEFAULT ''");
  ensureColumn(db, 'chunks', 'slide_number', 'INTEGER');
  ensureColumn(db, 'chunks', 'slide_title', "TEXT DEFAULT ''");
  ensureColumn(db, 'chunks', 'section_title', "TEXT DEFAULT ''");
  ensureColumn(db, 'chunks', 'has_code', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn(db, 'chunks', 'keywords_json', "TEXT DEFAULT '[]'");
  ensureColumn(db, 'notes', 'lesson_json', 'TEXT');
  ensureColumn(db, 'notes', 'source_map_json', 'TEXT');
  ensureColumn(db, 'videos', 'lesson_json', 'TEXT');
  ensureColumn(db, 'videos', 'storyboard_json', 'TEXT');
  ensureColumn(db, 'videos', 'quality_json', 'TEXT');
  ensureColumnFromMigration(db, 'videos', 'resolved_concept', '002_add_video_resolved_concept.sql');
  ensureColumn(db, 'user_prefs', 'study_profile_json', 'TEXT');
  ensureColumn(db, 'tutor_sessions', 'status', "TEXT NOT NULL DEFAULT 'ready'");
  ensureColumn(db, 'tutor_sessions', 'topic', 'TEXT');
  ensureColumn(db, 'tutor_sessions', 'source_title', 'TEXT');
  ensureColumn(db, 'tutor_sessions', 'sources_json', "TEXT DEFAULT '[]'");
  ensureColumn(db, 'tutor_sessions', 'trace_json', "TEXT DEFAULT '{}'");
  ensureColumn(db, 'tutor_sessions', 'learning_map_json', 'TEXT');
  ensureColumn(db, 'tutor_sessions', 'last_error', 'TEXT');
  ensureColumn(db, 'tutor_sessions', 'updated_at', 'TEXT');
  ensureColumn(db, 'tutor_steps', 'step_id', 'TEXT');
  ensureColumn(db, 'tutor_steps', 'step_json', 'TEXT');
  ensureColumn(db, 'tutor_steps', 'status', "TEXT DEFAULT 'locked'");
  ensureColumn(db, 'tutor_steps', 'source_refs_json', "TEXT DEFAULT '[]'");
  ensureColumn(db, 'tutor_steps', 'trace_json', "TEXT DEFAULT '{}'");
  ensureColumn(db, 'tutor_notes', 'step_id', 'TEXT');
  ensureColumn(db, 'tutor_notes', 'note_kind', "TEXT DEFAULT 'manual'");
  ensureColumn(db, 'tutor_notes', 'source_refs_json', "TEXT DEFAULT '[]'");
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_tutor_steps_session_step_id ON tutor_steps(session_id, step_id)');
  db.exec(`
    CREATE TABLE IF NOT EXISTS video_storyboards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      material_id INTEGER NOT NULL,
      video_id INTEGER,
      topic TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      lesson_json TEXT NOT NULL,
      storyboard_json TEXT NOT NULL,
      quality_json TEXT NOT NULL DEFAULT '{}',
      renderer TEXT DEFAULT 'canvas',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      approved_at TEXT,
      rendered_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE CASCADE,
      FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_video_storyboards_user ON video_storyboards(user_id, updated_at);
    CREATE TABLE IF NOT EXISTS video_storyboard_scenes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      storyboard_id INTEGER NOT NULL,
      scene_id TEXT NOT NULL,
      scene_order INTEGER NOT NULL,
      scene_json TEXT NOT NULL,
      quality_json TEXT NOT NULL DEFAULT '{}',
      approved INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (storyboard_id) REFERENCES video_storyboards(id) ON DELETE CASCADE
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_video_storyboard_scene_key ON video_storyboard_scenes(storyboard_id, scene_id);
    CREATE TABLE IF NOT EXISTS study_plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      goal TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      plan_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      approved_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_study_plans_user ON study_plans(user_id, status, updated_at);
    CREATE TABLE IF NOT EXISTS study_plan_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plan_id INTEGER NOT NULL,
      day INTEGER NOT NULL,
      task_order INTEGER NOT NULL,
      task_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      completed_at TEXT,
      FOREIGN KEY (plan_id) REFERENCES study_plans(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS learning_maps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      material_id INTEGER,
      root_topic TEXT NOT NULL,
      map_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_learning_maps_user ON learning_maps(user_id, material_id, updated_at);
    CREATE TABLE IF NOT EXISTS tutor_conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      material_id INTEGER,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_tutor_conversations_user ON tutor_conversations(user_id, updated_at);
    CREATE TABLE IF NOT EXISTS tutor_chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      sources_json TEXT NOT NULL DEFAULT '[]',
      suggestions_json TEXT NOT NULL DEFAULT '[]',
      grounding_tier TEXT,
      trace_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      FOREIGN KEY (conversation_id) REFERENCES tutor_conversations(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_chat_messages_conv ON tutor_chat_messages(conversation_id, created_at);
  `);
  const noteAudioSql = fs.readFileSync(path.join(__dirname, '..', 'migrations', '003_note_audio.sql'), 'utf8');
  db.exec(noteAudioSql);
  const gamificationSocialSql = fs.readFileSync(path.join(__dirname, '..', 'migrations', '004_gamification_social.sql'), 'utf8');
  db.exec(gamificationSocialSql);
  return db;
}

function ensureColumn(db, table, column, definition) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some(c => c.name === column)) {
    try {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    } catch (err) {
      if (!/duplicate column name/i.test(err.message || '')) throw err;
    }
  }
}

function ensureColumnFromMigration(db, table, column, fileName) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some(c => c.name === column)) {
    const sql = fs.readFileSync(path.join(__dirname, '..', 'migrations', fileName), 'utf8');
    try {
      db.exec(sql);
    } catch (err) {
      if (!/duplicate column name/i.test(err.message || '')) throw err;
    }
  }
}

module.exports = { getDb, migrate };
