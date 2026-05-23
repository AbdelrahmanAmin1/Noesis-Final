CREATE TABLE IF NOT EXISTS note_audio (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  note_id INTEGER NOT NULL,
  style TEXT NOT NULL,
  voice TEXT NOT NULL DEFAULT 'default',
  speed TEXT NOT NULL DEFAULT 'normal',
  script_md TEXT NOT NULL DEFAULT '',
  audio_path TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'queued',
  error TEXT,
  content_hash TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_note_audio_note_style ON note_audio(note_id, style, status, updated_at);
CREATE INDEX IF NOT EXISTS idx_note_audio_user ON note_audio(user_id, updated_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_note_audio_cache ON note_audio(note_id, style, voice, speed, content_hash) WHERE status='completed';
