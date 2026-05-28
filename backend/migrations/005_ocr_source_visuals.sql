PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS material_source_pages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  material_id INTEGER NOT NULL,
  page_number INTEGER,
  slide_number INTEGER,
  normal_text_chars INTEGER NOT NULL DEFAULT 0,
  ocr_text_chars INTEGER NOT NULL DEFAULT 0,
  merged_text TEXT NOT NULL DEFAULT '',
  source_kind TEXT NOT NULL DEFAULT 'text',
  heading TEXT DEFAULT '',
  thumbnail_path TEXT,
  diagnostics_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_material_source_pages_material
  ON material_source_pages(material_id, page_number, slide_number);

CREATE TABLE IF NOT EXISTS source_visual_candidates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  material_id INTEGER NOT NULL,
  page_number INTEGER,
  slide_number INTEGER,
  image_path TEXT,
  thumbnail_path TEXT,
  heading TEXT DEFAULT '',
  nearby_text TEXT DEFAULT '',
  ocr_text TEXT DEFAULT '',
  visual_type_guess TEXT DEFAULT '',
  importance_score REAL NOT NULL DEFAULT 0,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_source_visual_candidates_material
  ON source_visual_candidates(material_id, importance_score DESC);
