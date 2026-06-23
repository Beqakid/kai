-- ── Kai Task Orchestrator — D1 Schema Migration 0002 ──
-- Creates task orchestrator tables for Kai proactive task management.

-- ── Tasks ──
CREATE TABLE IF NOT EXISTS kai_tasks (
  id                    TEXT PRIMARY KEY,
  app_id                TEXT NOT NULL,
  project               TEXT,
  title                 TEXT NOT NULL,
  description           TEXT,
  source                TEXT NOT NULL DEFAULT 'manual',
  priority              TEXT NOT NULL DEFAULT 'medium',
  severity              TEXT NOT NULL DEFAULT 'normal',
  status                TEXT NOT NULL DEFAULT 'open',
  suggested_action      TEXT,
  risk_level            TEXT NOT NULL DEFAULT 'low',
  requires_confirmation INTEGER NOT NULL DEFAULT 1,
  score                 REAL NOT NULL DEFAULT 0,
  metadata_json         TEXT,
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_tasks_app_id    ON kai_tasks(app_id);
CREATE INDEX IF NOT EXISTS idx_tasks_project   ON kai_tasks(project);
CREATE INDEX IF NOT EXISTS idx_tasks_priority  ON kai_tasks(priority);
CREATE INDEX IF NOT EXISTS idx_tasks_status    ON kai_tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_score     ON kai_tasks(score DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_created   ON kai_tasks(created_at);

-- ── Task Actions (audit log) ──
CREATE TABLE IF NOT EXISTS kai_task_actions (
  id               TEXT PRIMARY KEY,
  task_id          TEXT NOT NULL,
  user_id          TEXT NOT NULL,
  action_type      TEXT NOT NULL,
  action_summary   TEXT,
  approval_status  TEXT NOT NULL DEFAULT 'auto',
  result           TEXT,
  error_message    TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY (task_id) REFERENCES kai_tasks(id)
);

CREATE INDEX IF NOT EXISTS idx_task_actions_task    ON kai_task_actions(task_id);
CREATE INDEX IF NOT EXISTS idx_task_actions_user    ON kai_task_actions(user_id);
CREATE INDEX IF NOT EXISTS idx_task_actions_type    ON kai_task_actions(action_type);
CREATE INDEX IF NOT EXISTS idx_task_actions_created ON kai_task_actions(created_at);

-- ── Recommendations ──
CREATE TABLE IF NOT EXISTS kai_recommendations (
  id                   TEXT PRIMARY KEY,
  app_id               TEXT NOT NULL,
  project              TEXT,
  recommendation_type  TEXT NOT NULL,
  title                TEXT NOT NULL,
  evidence             TEXT,
  severity             TEXT NOT NULL DEFAULT 'normal',
  suggested_fix        TEXT,
  risk_level           TEXT NOT NULL DEFAULT 'low',
  status               TEXT NOT NULL DEFAULT 'pending',
  created_at           TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at           TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_recs_app_id   ON kai_recommendations(app_id);
CREATE INDEX IF NOT EXISTS idx_recs_project  ON kai_recommendations(project);
CREATE INDEX IF NOT EXISTS idx_recs_status   ON kai_recommendations(status);
CREATE INDEX IF NOT EXISTS idx_recs_severity ON kai_recommendations(severity);
CREATE INDEX IF NOT EXISTS idx_recs_created  ON kai_recommendations(created_at);
