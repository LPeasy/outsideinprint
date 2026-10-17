-- No email, email hash, IP, raw payload, or referring URL belongs in this database.
PRAGMA foreign_keys = ON;
CREATE TABLE campaigns (code TEXT PRIMARY KEY, definition TEXT NOT NULL);
CREATE TABLE signups (
  signup_ref TEXT PRIMARY KEY, campaign_code TEXT REFERENCES campaigns(code),
  landing_path TEXT, created_at TEXT NOT NULL, accepted_at TEXT,
  subscriber_id TEXT, is_new INTEGER, is_test INTEGER NOT NULL DEFAULT 0,
  outcome TEXT NOT NULL DEFAULT 'reserved',
  CHECK(is_new IS NULL OR is_new IN (0,1)), CHECK(is_test IN (0,1))
);
CREATE INDEX signup_created ON signups(created_at);
CREATE TABLE subscribers (
  subscriber_id TEXT PRIMARY KEY, status TEXT NOT NULL,
  is_test INTEGER, is_baseline INTEGER NOT NULL DEFAULT 0,
  campaign_code TEXT REFERENCES campaigns(code), acquisition_signup_ref TEXT UNIQUE,
  signup_at TEXT, first_confirmed_at TEXT, first_confirmation_observed_at TEXT,
  confirmation_time_known INTEGER NOT NULL DEFAULT 0, confirmation_evidence TEXT,
  state_observed_at TEXT NOT NULL, last_seen_at TEXT NOT NULL,
  CHECK(is_test IS NULL OR is_test IN (0,1)), CHECK(is_baseline IN (0,1))
);
CREATE TABLE lifecycle_events (
  event_id TEXT PRIMARY KEY, subscriber_id TEXT NOT NULL, type TEXT NOT NULL,
  occurred_at TEXT, observed_at TEXT NOT NULL, event_time_known INTEGER NOT NULL DEFAULT 0,
  evidence_source TEXT NOT NULL
);
CREATE INDEX lifecycle_subscriber ON lifecycle_events(subscriber_id);
CREATE TABLE runs (
  run_id TEXT PRIMARY KEY, kind TEXT NOT NULL, started_at TEXT NOT NULL,
  finished_at TEXT, status TEXT NOT NULL, record_count INTEGER, error_code TEXT
);
CREATE TABLE controls (key TEXT PRIMARY KEY, value TEXT NOT NULL);
