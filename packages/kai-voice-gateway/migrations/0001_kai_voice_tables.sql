-- ── Kai Voice Gateway — D1 Schema Migration 0001 ──
-- Creates voice session and interaction logging tables.
-- Run via: wrangler d1 execute kai-voice --file=./migrations/0001_kai_voice_tables.sql

-- ── Voice Sessions ──
CREATE TABLE IF NOT EXISTS kai_voice_sessions (
  id              TEXT PRIMARY KEY,
  app_id          TEXT NOT NULL,
  user_id         TEXT NOT NULL,
  user_role       TEXT NOT NULL,
  current_screen  TEXT NOT NULL,
  provider_stt    TEXT NOT NULL,
  provider_tts    TEXT NOT NULL,
  started_at      TEXT NOT NULL,  -- ISO 8601
  ended_at        TEXT,           -- NULL until session ends
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sessions_app_id    ON kai_voice_sessions(app_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id   ON kai_voice_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_created   ON kai_voice_sessions(created_at);

-- ── Voice Interactions ──
CREATE TABLE IF NOT EXISTS kai_voice_interactions (
  id                      TEXT PRIMARY KEY,
  session_id              TEXT NOT NULL,
  app_id                  TEXT NOT NULL,
  user_id                 TEXT NOT NULL,
  user_role               TEXT NOT NULL,
  transcript              TEXT,
  kai_response            TEXT,
  risk_level              TEXT NOT NULL DEFAULT 'safe',
  requires_confirmation   INTEGER NOT NULL DEFAULT 0,  -- 0 = false, 1 = true
  suggested_actions_json  TEXT,           -- JSON array
  action_taken            TEXT,           -- NULL until user acts
  error_message           TEXT,
  stt_provider            TEXT,
  tts_provider            TEXT,
  duration_ms             INTEGER,        -- STT audio duration
  created_at              TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY (session_id) REFERENCES kai_voice_sessions(id)
);

CREATE INDEX IF NOT EXISTS idx_interactions_session  ON kai_voice_interactions(session_id);
CREATE INDEX IF NOT EXISTS idx_interactions_app_id   ON kai_voice_interactions(app_id);
CREATE INDEX IF NOT EXISTS idx_interactions_user_id  ON kai_voice_interactions(user_id);
CREATE INDEX IF NOT EXISTS idx_interactions_risk     ON kai_voice_interactions(risk_level);
CREATE INDEX IF NOT EXISTS idx_interactions_created  ON kai_voice_interactions(created_at);
