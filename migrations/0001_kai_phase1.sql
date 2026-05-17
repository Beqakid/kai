CREATE TABLE IF NOT EXISTS kai_sessions (
  id TEXT PRIMARY KEY,
  app TEXT NOT NULL,
  user_id TEXT,
  user_role TEXT,
  language TEXT NOT NULL DEFAULT 'en',
  guidance_mode TEXT NOT NULL DEFAULT 'GUIDE_MODE',
  workflow_id TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS kai_messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  language TEXT NOT NULL DEFAULT 'en',
  content TEXT NOT NULL,
  knowledge_sources_json TEXT,
  workflow_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES kai_sessions(id)
);

CREATE TABLE IF NOT EXISTS kai_user_preferences (
  id TEXT PRIMARY KEY,
  app TEXT NOT NULL,
  user_id TEXT NOT NULL,
  preferred_language TEXT NOT NULL DEFAULT 'en',
  preferences_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (app, user_id)
);

CREATE TABLE IF NOT EXISTS kai_audit_logs (
  id TEXT PRIMARY KEY,
  app TEXT NOT NULL,
  session_id TEXT,
  user_id TEXT,
  action TEXT NOT NULL,
  permission TEXT,
  allowed INTEGER NOT NULL DEFAULT 0,
  reason TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS kai_knowledge_sources (
  id TEXT PRIMARY KEY,
  app TEXT NOT NULL,
  language TEXT NOT NULL,
  title TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'markdown',
  path TEXT NOT NULL,
  summary TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (app, language, path)
);

CREATE INDEX IF NOT EXISTS idx_kai_sessions_user ON kai_sessions(app, user_id);
CREATE INDEX IF NOT EXISTS idx_kai_messages_session ON kai_messages(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_kai_audit_session ON kai_audit_logs(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_kai_knowledge_app_language ON kai_knowledge_sources(app, language, enabled);
