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
  story_id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  slug TEXT NOT NULL,
  title TEXT,
  status TEXT NOT NULL CHECK (
    status IN ('pass', 'passed', 'rewrite', 'needs_review', 'needs_human_review', 'abandoned', 'failed')
  ),
  final_score INTEGER,
  idea_prompt_version TEXT,
  outline_prompt_version TEXT,
  writer_prompt_version TEXT,
  qa_prompt_version TEXT,
  rewrite_prompt_version TEXT,
  total_cost_usd REAL DEFAULT 0,
  total_duration_seconds REAL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  story_id TEXT NOT NULL,
  stage TEXT NOT NULL CHECK (
    stage IN ('idea', 'outline', 'writer', 'qa', 'rewrite', 'evolver')
  ),
  agent_name TEXT NOT NULL,
  model TEXT,
  prompt_path TEXT,
  prompt_version TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  duration_seconds REAL,
  cost_usd REAL,
  timestamp TEXT NOT NULL,
  status TEXT NOT NULL CHECK (
    status IN ('pass', 'rewrite', 'needs_review', 'needs_human_review', 'failed')
  ),
  artifact_path TEXT,
  notes TEXT,
  FOREIGN KEY (story_id) REFERENCES stories(story_id)
);

CREATE INDEX idx_runs_story_id ON runs(story_id);
CREATE INDEX idx_runs_stage ON runs(stage);
CREATE INDEX idx_runs_timestamp ON runs(timestamp);
CREATE INDEX idx_stories_status ON stories(status);

