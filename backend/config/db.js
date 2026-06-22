'use strict';

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const env = require('./env');

let _db = null;
let _dbPath = null;

function ensureDirs() {
  fs.mkdirSync(env.DATA_DIR, { recursive: true });
  fs.mkdirSync(path.join(env.UPLOAD_DIR, 'materials'), { recursive: true });
  fs.mkdirSync(path.join(env.UPLOAD_DIR, 'audio'), { recursive: true });
  fs.mkdirSync(path.join(env.UPLOAD_DIR, 'slides'), { recursive: true });
  fs.mkdirSync(path.join(env.UPLOAD_DIR, 'videos'), { recursive: true });
  fs.mkdirSync(path.join(env.UPLOAD_DIR, 'ocr'), { recursive: true });
  fs.mkdirSync(path.join(env.UPLOAD_DIR, 'source-visuals'), { recursive: true });
}

function getDb() {
  if (_db && _dbPath === env.DB_PATH) return _db;
  if (_db && _dbPath !== env.DB_PATH) closeDbForTests();
  ensureDirs();
  _db = new Database(env.DB_PATH);
  _dbPath = env.DB_PATH;
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');
  _db.pragma('busy_timeout = 15000');
  migrate();
  return _db;
}

function migrate() {
  ensureDirs();
  if (_db && _dbPath !== env.DB_PATH) closeDbForTests();
  const db = _db || new Database(env.DB_PATH);
  if (!_db) {
    _db = db;
    _dbPath = env.DB_PATH;
  }
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
  ensureColumn(db, 'chunks', 'source_kind', "TEXT DEFAULT 'text'");
  ensureColumn(db, 'chunks', 'source_visual_id', 'INTEGER');
  ensureColumn(db, 'chunks', 'analysis_run_id', 'INTEGER');
  ensureColumn(db, 'chunks', 'raw_text', "TEXT DEFAULT ''");
  ensureColumn(db, 'chunks', 'content_type', "TEXT DEFAULT 'prose'");
  ensureColumn(db, 'chunks', 'relevance_score', 'REAL NOT NULL DEFAULT 1');
  ensureColumn(db, 'chunks', 'relevance_level', "TEXT NOT NULL DEFAULT 'high'");
  ensureColumn(db, 'chunks', 'relevance_reasons_json', "TEXT DEFAULT '[]'");
  ensureColumn(db, 'chunks', 'ocr_confidence', 'REAL');
  ensureColumn(db, 'materials', 'extraction_diagnostics_json', "TEXT DEFAULT '{}'");
  ensureColumn(db, 'materials', 'ocr_status', "TEXT DEFAULT 'not_evaluated'");
  ensureColumn(db, 'materials', 'ocr_provider', 'TEXT');
  ensureColumn(db, 'materials', 'topic_map_json', "TEXT DEFAULT '{}'");
  ensureColumn(db, 'materials', 'topic_map_version', 'INTEGER DEFAULT 1');
  ensureColumn(db, 'materials', 'topic_map_updated_at', 'TEXT');
  ensureColumn(db, 'materials', 'active_analysis_run_id', 'INTEGER');
  ensureColumn(db, 'notes', 'lesson_json', 'TEXT');
  ensureColumn(db, 'notes', 'source_map_json', 'TEXT');
  ensureColumn(db, 'videos', 'lesson_json', 'TEXT');
  ensureColumn(db, 'videos', 'storyboard_json', 'TEXT');
  ensureColumn(db, 'videos', 'quality_json', 'TEXT');
  ensureColumn(db, 'videos', 'subtitle_path', 'TEXT');
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
  const ocrSourceVisualsSql = fs.readFileSync(path.join(__dirname, '..', 'migrations', '005_ocr_source_visuals.sql'), 'utf8');
  db.exec(ocrSourceVisualsSql);
  ensureColumn(db, 'material_source_pages', 'analysis_run_id', 'INTEGER');
  ensureColumn(db, 'material_source_pages', 'raw_normal_text', "TEXT DEFAULT ''");
  ensureColumn(db, 'material_source_pages', 'raw_ocr_text', "TEXT DEFAULT ''");
  ensureColumn(db, 'material_source_pages', 'cleaned_educational_text', "TEXT DEFAULT ''");
  ensureColumn(db, 'material_source_pages', 'low_value_text_json', "TEXT DEFAULT '[]'");
  ensureColumn(db, 'material_source_pages', 'ocr_confidence_json', "TEXT DEFAULT '{}'");
  ensureColumn(db, 'material_source_pages', 'warnings_json', "TEXT DEFAULT '[]'");
  ensureColumn(db, 'material_source_pages', 'page_image_path', 'TEXT');
  ensureColumn(db, 'source_visual_candidates', 'analysis_run_id', 'INTEGER');
  ensureColumn(db, 'source_visual_candidates', 'bounding_box_json', "TEXT DEFAULT '{}'");
  ensureColumn(db, 'source_visual_candidates', 'topic_relevance_score', 'REAL NOT NULL DEFAULT 0');
  ensureColumn(db, 'source_visual_candidates', 'visual_usefulness_score', 'REAL NOT NULL DEFAULT 0');
  ensureColumn(db, 'source_visual_candidates', 'visual_quality_score', 'REAL NOT NULL DEFAULT 0');
  ensureColumn(db, 'source_visual_candidates', 'recommended_scene_usage', "TEXT DEFAULT ''");
  ensureColumn(db, 'source_visual_candidates', 'recommendation', "TEXT NOT NULL DEFAULT 'ignore'");
  ensureColumn(db, 'source_visual_candidates', 'selected_for_video', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn(db, 'source_visual_candidates', 'ocr_confidence', 'REAL');
  ensureColumn(db, 'source_visual_candidates', 'warnings_json', "TEXT DEFAULT '[]'");
  ensureColumn(db, 'source_visual_candidates', 'semantic_data_json', "TEXT DEFAULT '{}'");
  ensureColumn(db, 'source_visual_candidates', 'fingerprint', "TEXT DEFAULT ''");
  const materialAnalysisSql = fs.readFileSync(path.join(__dirname, '..', 'migrations', '007_material_analysis.sql'), 'utf8');
  db.exec(materialAnalysisSql);
  const learningArtifactSql = fs.readFileSync(path.join(__dirname, '..', 'migrations', '008_learning_artifact_provenance.sql'), 'utf8');
  db.exec(learningArtifactSql);
  ensureColumn(db, 'flashcards', 'generation_id', 'INTEGER REFERENCES flashcard_generations(id) ON DELETE SET NULL');
  ensureColumn(db, 'quiz_questions', 'source_chunk_ids_json', "TEXT NOT NULL DEFAULT '[]'");
  db.exec('CREATE INDEX IF NOT EXISTS idx_flashcards_generation ON flashcards(generation_id)');
  backfillFlashcardGenerations(db);
  return db;
}

function backfillFlashcardGenerations(db) {
  const groups = db.prepare(`
    SELECT f.user_id, f.material_id, COALESCE(m.title, MAX(f.deck), 'Flashcards') AS title,
           MIN(f.created_at) AS first_created_at
    FROM flashcards f
    JOIN materials m ON m.id=f.material_id AND m.user_id=f.user_id
    JOIN users u ON u.id=f.user_id
    WHERE f.material_id IS NOT NULL AND f.generation_id IS NULL
    GROUP BY f.user_id, f.material_id
  `).all();
  if (!groups.length) return;
  const findActive = db.prepare(`
    SELECT id FROM flashcard_generations
    WHERE user_id=? AND material_id=? AND is_active=1
    ORDER BY id DESC LIMIT 1
  `);
  const insert = db.prepare(`
    INSERT INTO flashcard_generations
      (user_id, material_id, title, source_scope, topic, is_active, created_at)
    VALUES (?,?,?,?,?,?,?)
  `);
  const assign = db.prepare(`
    UPDATE flashcards SET generation_id=?
    WHERE user_id=? AND material_id=? AND generation_id IS NULL
  `);
  db.transaction(() => {
    for (const group of groups) {
      let generation = findActive.get(group.user_id, group.material_id);
      if (!generation) {
        const created = insert.run(
          group.user_id,
          group.material_id,
          group.title || 'Flashcards',
          'material',
          null,
          1,
          group.first_created_at || new Date().toISOString(),
        );
        generation = { id: created.lastInsertRowid };
      }
      assign.run(generation.id, group.user_id, group.material_id);
    }
  })();
}

function closeDbForTests() {
  if (!_db) return;
  try { _db.close(); } catch (_) {}
  _db = null;
  _dbPath = null;
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

module.exports = { getDb, migrate, closeDbForTests };
