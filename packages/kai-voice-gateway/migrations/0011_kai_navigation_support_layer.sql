-- ── Migration 0011: Kai Navigation Core + Support Request Layer ──
-- Phase 11: Shared foundation for cross-app navigation and support requests.
-- Tables: kai_app_route_registry, kai_app_action_registry, kai_support_requests

-- ── App Route Registry ──
-- Stores route definitions per app with role-based access, risk levels,
-- and confirmation/admin-approval requirements.

CREATE TABLE IF NOT EXISTS kai_app_route_registry (
  id TEXT PRIMARY KEY,
  app_id TEXT NOT NULL,
  route_key TEXT NOT NULL,
  route_label TEXT NOT NULL,
  route_path TEXT NOT NULL,
  route_type TEXT NOT NULL,
  allowed_roles_json TEXT NOT NULL,
  required_permissions_json TEXT,
  risk_level TEXT DEFAULT 'low',
  requires_confirmation INTEGER DEFAULT 0,
  requires_admin_approval INTEGER DEFAULT 0,
  description TEXT,
  metadata_json TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_kai_route_registry_app_route
  ON kai_app_route_registry (app_id, route_key);

-- ── App Action Registry ──
-- Stores action definitions per app with role-based access, risk levels,
-- blocked flag, and confirmation/admin-approval requirements.

CREATE TABLE IF NOT EXISTS kai_app_action_registry (
  id TEXT PRIMARY KEY,
  app_id TEXT NOT NULL,
  action_key TEXT NOT NULL,
  action_label TEXT NOT NULL,
  action_type TEXT NOT NULL,
  allowed_roles_json TEXT NOT NULL,
  required_permissions_json TEXT,
  risk_level TEXT DEFAULT 'low',
  requires_confirmation INTEGER DEFAULT 0,
  requires_admin_approval INTEGER DEFAULT 0,
  blocked INTEGER DEFAULT 0,
  description TEXT,
  metadata_json TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_kai_action_registry_app_action
  ON kai_app_action_registry (app_id, action_key);

-- ── Support Requests ──
-- Stores support requests from users across all apps.

CREATE TABLE IF NOT EXISTS kai_support_requests (
  id TEXT PRIMARY KEY,
  app_id TEXT NOT NULL,
  requester_user_id TEXT NOT NULL,
  requester_role TEXT NOT NULL,
  requester_name TEXT,
  requester_email TEXT,
  request_type TEXT NOT NULL,
  request_title TEXT NOT NULL,
  request_description TEXT NOT NULL,
  current_screen TEXT,
  related_route_key TEXT,
  related_action_key TEXT,
  urgency TEXT DEFAULT 'normal',
  status TEXT DEFAULT 'new',
  risk_level TEXT DEFAULT 'low',
  requires_admin_review INTEGER DEFAULT 0,
  estimated_complexity TEXT DEFAULT 'unknown',
  suggested_next_step TEXT,
  assigned_to TEXT,
  source TEXT NOT NULL,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_kai_support_requests_app_id
  ON kai_support_requests (app_id);
CREATE INDEX IF NOT EXISTS idx_kai_support_requests_status
  ON kai_support_requests (status);
CREATE INDEX IF NOT EXISTS idx_kai_support_requests_requester_user_id
  ON kai_support_requests (requester_user_id);
CREATE INDEX IF NOT EXISTS idx_kai_support_requests_created_at
  ON kai_support_requests (created_at);
