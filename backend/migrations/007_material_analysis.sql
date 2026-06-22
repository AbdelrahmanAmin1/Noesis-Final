PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS material_analysis_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  material_id INTEGER NOT NULL,
  pipeline_version INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'processing',
  raw_extracted_text TEXT NOT NULL DEFAULT '',
  cleaned_educational_text TEXT NOT NULL DEFAULT '',
  low_value_text_json TEXT NOT NULL DEFAULT '[]',
  ocr_confidence_json TEXT NOT NULL DEFAULT '{}',
  warnings_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_material_analysis_runs_material
  ON material_analysis_runs(material_id, id DESC);

CREATE INDEX IF NOT EXISTS idx_material_source_pages_run
  ON material_source_pages(material_id, analysis_run_id, page_number, slide_number);

CREATE INDEX IF NOT EXISTS idx_source_visual_candidates_run
  ON source_visual_candidates(material_id, analysis_run_id, selected_for_video, topic_relevance_score DESC);

CREATE TABLE IF NOT EXISTS material_code_blocks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  analysis_run_id INTEGER NOT NULL,
  material_id INTEGER NOT NULL,
  page_number INTEGER,
  slide_number INTEGER,
  language TEXT NOT NULL DEFAULT 'text',
  raw_code TEXT NOT NULL DEFAULT '',
  normalized_code TEXT NOT NULL DEFAULT '',
  nearby_text TEXT NOT NULL DEFAULT '',
  relevance_score REAL NOT NULL DEFAULT 0,
  ocr_confidence REAL,
  reconstruction_json TEXT NOT NULL DEFAULT '{}',
  warnings_json TEXT NOT NULL DEFAULT '[]',
  FOREIGN KEY (analysis_run_id) REFERENCES material_analysis_runs(id) ON DELETE CASCADE,
  FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_material_code_blocks_run
  ON material_code_blocks(analysis_run_id, relevance_score DESC);

CREATE TABLE IF NOT EXISTS material_tables (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  analysis_run_id INTEGER NOT NULL,
  material_id INTEGER NOT NULL,
  page_number INTEGER,
  slide_number INTEGER,
  caption TEXT NOT NULL DEFAULT '',
  raw_text TEXT NOT NULL DEFAULT '',
  cells_json TEXT NOT NULL DEFAULT '[]',
  relevance_score REAL NOT NULL DEFAULT 0,
  ocr_confidence REAL,
  warnings_json TEXT NOT NULL DEFAULT '[]',
  FOREIGN KEY (analysis_run_id) REFERENCES material_analysis_runs(id) ON DELETE CASCADE,
  FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_material_tables_run
  ON material_tables(analysis_run_id, relevance_score DESC);
