PRAGMA foreign_keys = ON;

ALTER TABLE materials ADD COLUMN topic_map_json TEXT DEFAULT '{}';
ALTER TABLE materials ADD COLUMN topic_map_version INTEGER DEFAULT 1;
ALTER TABLE materials ADD COLUMN topic_map_updated_at TEXT;
