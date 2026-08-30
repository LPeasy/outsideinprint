PRAGMA foreign_keys = ON;

CREATE TABLE operational_heartbeats (
  monitor_key TEXT PRIMARY KEY,
  run_token TEXT NOT NULL,
  last_started_at INTEGER NOT NULL,
  last_completed_at INTEGER,
  status TEXT NOT NULL CHECK (status IN ('RUNNING', 'OK', 'DEGRADED', 'FAILED')),
  last_error_code TEXT,
  updated_at INTEGER NOT NULL
);

CREATE TABLE operational_queue_canaries (
  canary_id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('PENDING', 'QUEUED', 'RECEIVED', 'SEND_FAILED', 'STALE')),
  queued_at INTEGER NOT NULL,
  received_at INTEGER,
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_operational_queue_canaries_status
ON operational_queue_canaries(status, queued_at);

CREATE TABLE operational_dlq_receipts (
  receipt_sha256 TEXT PRIMARY KEY CHECK (length(receipt_sha256) = 64),
  received_at INTEGER NOT NULL
);

CREATE INDEX idx_operational_dlq_receipts_received
ON operational_dlq_receipts(received_at);

CREATE TABLE operational_alerts (
  alert_id TEXT PRIMARY KEY,
  alert_code TEXT NOT NULL,
  alert_bucket INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('PENDING', 'SENT')),
  occurrence_count INTEGER NOT NULL CHECK (occurrence_count > 0),
  first_seen_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  delivery_attempts INTEGER NOT NULL DEFAULT 0 CHECK (delivery_attempts >= 0),
  last_delivery_attempt_at INTEGER,
  delivered_at INTEGER,
  last_delivery_error_code TEXT,
  UNIQUE (alert_code, alert_bucket)
);

CREATE INDEX idx_operational_alerts_pending
ON operational_alerts(status, first_seen_at);
