export const SCHEMA_SQL = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY,
  original_name TEXT NOT NULL,
  source_path TEXT,
  stored_path TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  extension TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  uploaded_at TEXT NOT NULL,
  processed_at TEXT,
  status TEXT NOT NULL CHECK (status IN ('queued', 'pending', 'processing', 'done', 'error')),
  error_message TEXT
);

CREATE TABLE IF NOT EXISTS analysis (
  file_id TEXT PRIMARY KEY REFERENCES files(id) ON DELETE CASCADE,
  main_topic TEXT,
  summary TEXT,
  scene_description TEXT,
  mood_tone TEXT,
  sentiment TEXT,
  dominant_colors_json TEXT,
  entities_json TEXT,
  ocr_text TEXT,
  raw_json TEXT,
  model_used TEXT
);

CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  file_id TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('ai', 'manual')),
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tags_unique_per_file_source
  ON tags(file_id, tag, source);

CREATE INDEX IF NOT EXISTS idx_tags_file_id ON tags(file_id);
CREATE INDEX IF NOT EXISTS idx_files_uploaded_at ON files(uploaded_at);
CREATE INDEX IF NOT EXISTS idx_files_status ON files(status);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(
  file_id UNINDEXED,
  filename,
  summary,
  main_topic,
  tags,
  ocr_text,
  entities
);
`;
