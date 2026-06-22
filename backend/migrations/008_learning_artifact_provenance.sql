CREATE TABLE IF NOT EXISTS flashcard_generations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  material_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  source_scope TEXT NOT NULL DEFAULT 'material',
  chapter_id INTEGER,
  chunk_id INTEGER,
  topic TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  archived_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE CASCADE,
  FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE SET NULL,
  FOREIGN KEY (chunk_id) REFERENCES chunks(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_flashcard_generations_user_material
  ON flashcard_generations(user_id, material_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_flashcard_generations_one_active
  ON flashcard_generations(user_id, material_id)
  WHERE is_active = 1;
