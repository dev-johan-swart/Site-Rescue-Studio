CREATE TABLE IF NOT EXISTS automation_discovery_stage_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  stage_id TEXT NOT NULL DEFAULT 'pretoria_centurion',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS automation_discovery_backlog (
  id BIGSERIAL PRIMARY KEY,
  website TEXT NOT NULL,
  website_normalized TEXT NOT NULL UNIQUE,
  source TEXT NOT NULL,
  region TEXT,
  category TEXT,
  business_name TEXT,
  city TEXT,
  status TEXT NOT NULL DEFAULT 'available',
  queued_at TIMESTAMPTZ,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS automation_discovery_backlog_status_idx
  ON automation_discovery_backlog (status, created_at);