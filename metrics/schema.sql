PRAGMA foreign_keys = ON;

CREATE TABLE prompt_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT NOT NULL,
  version TEXT NOT NULL,
  created_at TEXT NOT NULL,
  change_note TEXT,
  UNIQUE (path, version)
);

CREATE TABLE stories (
  id TEXT PRIMARY KEY,
  title TEXT,
  summary TEXT,
  created_at TEXT,
  status TEXT
);

CREATE TABLE story_metrics (
  story_id TEXT PRIMARY KEY,
  read_count INTEGER DEFAULT 0,
  drop_off_users INTEGER DEFAULT 0,
  FOREIGN KEY(story_id) REFERENCES stories(id)
);

CREATE TABLE pipeline_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  story_id TEXT,
  stage TEXT,
  iteration INTEGER,
  timestamp TEXT,
  status TEXT,
  FOREIGN KEY(story_id) REFERENCES stories(id)
);

CREATE TABLE dashboard_runs (
  id TEXT PRIMARY KEY,
  status TEXT,
  requested_count INTEGER,
  created_at TEXT,
  updated_at TEXT,
  error TEXT
);

CREATE TABLE dashboard_run_stories (
  run_id TEXT,
  story_id TEXT,
  story_index INTEGER,
  PRIMARY KEY(run_id, story_id),
  FOREIGN KEY(run_id) REFERENCES dashboard_runs(id),
  FOREIGN KEY(story_id) REFERENCES stories(id)
);

CREATE TABLE runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  story_id TEXT NOT NULL,
  stage TEXT NOT NULL,
  agent_name TEXT NOT NULL,
  model TEXT,
  prompt_path TEXT,
  prompt_version TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  duration_seconds REAL,
  cost_usd REAL,
  timestamp TEXT NOT NULL,
  status TEXT NOT NULL,
  artifact_path TEXT,
  notes TEXT,
  FOREIGN KEY (story_id) REFERENCES stories(id)
);

CREATE INDEX idx_pipeline_logs_story_id ON pipeline_logs(story_id);
CREATE INDEX idx_pipeline_logs_timestamp ON pipeline_logs(timestamp);
CREATE INDEX idx_runs_story_id ON runs(story_id);
CREATE INDEX idx_runs_stage ON runs(stage);
CREATE INDEX idx_runs_timestamp ON runs(timestamp);
CREATE INDEX idx_stories_status ON stories(status);
