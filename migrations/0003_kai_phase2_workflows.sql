CREATE TABLE IF NOT EXISTS kai_workflow_states (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  app TEXT NOT NULL,
  user_id TEXT,
  workflow_id TEXT NOT NULL,
  current_step_id TEXT,
  completed_step_ids_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'in_progress',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (session_id, workflow_id),
  FOREIGN KEY (session_id) REFERENCES kai_sessions(id)
);

CREATE INDEX IF NOT EXISTS idx_kai_workflow_states_session ON kai_workflow_states(session_id, status);
CREATE INDEX IF NOT EXISTS idx_kai_workflow_states_user ON kai_workflow_states(app, user_id, status);
