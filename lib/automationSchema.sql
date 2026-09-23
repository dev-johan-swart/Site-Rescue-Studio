-- Site Rescue Studio automation foundation
-- Phase A: additive, non-destructive Neon schema.
-- This file does not modify or delete existing scanner tables.

CREATE TABLE IF NOT EXISTS automation_discovery_provider_state (
  provider TEXT PRIMARY KEY, day_key DATE NOT NULL, request_count INTEGER NOT NULL DEFAULT 0,
  consecutive_failures INTEGER NOT NULL DEFAULT 0, cooldown_until TIMESTAMPTZ, last_error TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS automation_runs (
  id BIGSERIAL PRIMARY KEY,
  run_key TEXT NOT NULL UNIQUE,
  scheduled_for TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'queued',
  candidate_count INTEGER NOT NULL DEFAULT 0,
  scanned_count INTEGER NOT NULL DEFAULT 0,
  high_count INTEGER NOT NULL DEFAULT 0,
  moderate_count INTEGER NOT NULL DEFAULT 0,
  healthy_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  retry_count INTEGER NOT NULL DEFAULT 0,
  error_summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS automation_queue (
  id BIGSERIAL PRIMARY KEY,
  website TEXT NOT NULL,
  website_normalized TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual',
  status TEXT NOT NULL DEFAULT 'queued',
  run_id BIGINT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  scheduled_for TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  last_error TEXT,
  scan_history_id BIGINT,
  qualification_priority TEXT,
  qualification_reason TEXT,
  qualification_evidence JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS automation_queue_website_active_idx
  ON automation_queue (website_normalized)
  WHERE status IN ('queued', 'running');

CREATE INDEX IF NOT EXISTS automation_queue_status_idx
  ON automation_queue (status, scheduled_for);

CREATE INDEX IF NOT EXISTS automation_queue_run_idx
  ON automation_queue (run_id);

CREATE TABLE IF NOT EXISTS automation_outreach (
  id BIGSERIAL PRIMARY KEY,
  website_normalized TEXT NOT NULL,
  prospect_id BIGINT,
  outreach_kind TEXT NOT NULL DEFAULT 'initial',
  contacted_at TIMESTAMPTZ NOT NULL,
  contact_date DATE NOT NULL,
  channel TEXT,
  status TEXT,
  follow_up_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One initial outreach record per website. Follow-ups remain separate events.
CREATE UNIQUE INDEX IF NOT EXISTS automation_outreach_initial_idx
  ON automation_outreach (website_normalized)
  WHERE outreach_kind = 'initial';

CREATE INDEX IF NOT EXISTS automation_outreach_followup_idx
  ON automation_outreach (follow_up_at, website_normalized);

CREATE TABLE IF NOT EXISTS automation_shortlist (
  id BIGSERIAL PRIMARY KEY,
  run_id BIGINT NOT NULL,
  website_normalized TEXT NOT NULL,
  prospect_id BIGINT,
  priority TEXT NOT NULL,
  is_follow_up BOOLEAN NOT NULL DEFAULT FALSE,
  qualification_reason TEXT,
  evidence JSONB,
  report_generated BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS automation_shortlist_run_website_idx
  ON automation_shortlist (run_id, website_normalized);

CREATE INDEX IF NOT EXISTS automation_shortlist_priority_idx
  ON automation_shortlist (run_id, priority);
