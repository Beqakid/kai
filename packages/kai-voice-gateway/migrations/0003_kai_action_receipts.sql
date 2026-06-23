-- ── Migration 0003: Kai Action Receipts ──
-- Creates the auditable receipt log for every Kai recommendation,
-- action, escalation, and generated output.
-- Run: wrangler d1 execute kai-voice --file=./migrations/0003_kai_action_receipts.sql

CREATE TABLE IF NOT EXISTS kai_action_receipts (
  id                    TEXT PRIMARY KEY,
  app_id                TEXT NOT NULL,
  project               TEXT,
  user_id               TEXT NOT NULL,
  user_role             TEXT NOT NULL,
  session_id            TEXT,
  source                TEXT,
  receipt_type          TEXT NOT NULL,
  action_type           TEXT,
  action_summary        TEXT,
  user_intent           TEXT,
  kai_response          TEXT,
  risk_level            TEXT NOT NULL,
  requires_confirmation INTEGER NOT NULL DEFAULT 0,
  approval_status       TEXT NOT NULL DEFAULT 'auto',
  blocked_reason        TEXT,
  task_id               TEXT,
  request_id            TEXT,
  metadata_json         TEXT,
  created_at            TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── Indexes for efficient querying ──
CREATE INDEX IF NOT EXISTS idx_action_receipts_app_id       ON kai_action_receipts(app_id);
CREATE INDEX IF NOT EXISTS idx_action_receipts_user_id      ON kai_action_receipts(user_id);
CREATE INDEX IF NOT EXISTS idx_action_receipts_receipt_type  ON kai_action_receipts(receipt_type);
CREATE INDEX IF NOT EXISTS idx_action_receipts_risk_level    ON kai_action_receipts(risk_level);
CREATE INDEX IF NOT EXISTS idx_action_receipts_task_id       ON kai_action_receipts(task_id);
CREATE INDEX IF NOT EXISTS idx_action_receipts_created_at    ON kai_action_receipts(created_at);
