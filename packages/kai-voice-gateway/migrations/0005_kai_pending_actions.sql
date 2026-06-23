-- Phase 5: Kai Pending Actions — Confirmation workflow for medium-risk actions
-- Only medium-risk actions enter the pending confirmation flow.
-- High-risk and blocked actions are never stored here.

CREATE TABLE IF NOT EXISTS kai_pending_actions (
  id TEXT PRIMARY KEY,
  app_id TEXT NOT NULL,
  project TEXT,
  user_id TEXT NOT NULL,
  user_role TEXT NOT NULL,
  session_id TEXT,
  task_id TEXT,
  action_type TEXT NOT NULL,
  action_summary TEXT,
  prepared_output TEXT,
  risk_level TEXT NOT NULL DEFAULT 'medium',
  gate_decision_json TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  confirmed_at TEXT,
  denied_at TEXT,
  confirmed_by TEXT,
  denied_by TEXT,
  metadata_json TEXT
);

-- Query indexes
CREATE INDEX IF NOT EXISTS idx_pending_actions_app_id ON kai_pending_actions(app_id);
CREATE INDEX IF NOT EXISTS idx_pending_actions_user_id ON kai_pending_actions(user_id);
CREATE INDEX IF NOT EXISTS idx_pending_actions_task_id ON kai_pending_actions(task_id);
CREATE INDEX IF NOT EXISTS idx_pending_actions_status ON kai_pending_actions(status);
CREATE INDEX IF NOT EXISTS idx_pending_actions_created_at ON kai_pending_actions(created_at);
CREATE INDEX IF NOT EXISTS idx_pending_actions_expires_at ON kai_pending_actions(expires_at);
