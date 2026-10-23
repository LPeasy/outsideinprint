-- Operational state only. No customer or secret data belongs in these journals.
ALTER TABLE operational_heartbeats ADD COLUMN lease_expires_at INTEGER;

CREATE TABLE operational_monitor_runs (
  run_token TEXT PRIMARY KEY,
  monitor_key TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  lease_expires_at INTEGER NOT NULL,
  completed_at INTEGER,
  status TEXT NOT NULL CHECK (status IN ('RUNNING', 'OK', 'DEGRADED', 'FAILED', 'ABANDONED')),
  last_error_code TEXT
);
CREATE INDEX idx_operational_monitor_runs_started ON operational_monitor_runs(started_at);

CREATE TABLE operational_monitor_errors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_token TEXT NOT NULL,
  stage TEXT NOT NULL,
  error_code TEXT NOT NULL,
  occurred_at INTEGER NOT NULL,
  http_status INTEGER CHECK (http_status IS NULL OR http_status BETWEEN 100 AND 599)
);
CREATE INDEX idx_operational_monitor_errors_run ON operational_monitor_errors(run_token, occurred_at);

INSERT INTO operational_monitor_runs
  (run_token, monitor_key, started_at, lease_expires_at, completed_at, status, last_error_code)
SELECT run_token, monitor_key, last_started_at, COALESCE(lease_expires_at, 0),
       CASE WHEN status = 'RUNNING' THEN NULL ELSE last_completed_at END, status, last_error_code
FROM operational_heartbeats;

CREATE TRIGGER operational_monitor_admitted_insert
AFTER INSERT ON operational_heartbeats
WHEN NEW.status = 'RUNNING' AND NEW.lease_expires_at IS NOT NULL
BEGIN
  INSERT INTO operational_monitor_runs
    (run_token, monitor_key, started_at, lease_expires_at, status)
  VALUES (NEW.run_token, NEW.monitor_key, NEW.last_started_at, NEW.lease_expires_at, 'RUNNING');
END;

CREATE TRIGGER operational_monitor_replaced
AFTER UPDATE ON operational_heartbeats
WHEN NEW.run_token <> OLD.run_token AND NEW.lease_expires_at IS NOT NULL
BEGIN
  UPDATE operational_monitor_runs
  SET status = 'ABANDONED', completed_at = NEW.last_started_at,
      last_error_code = 'MONITOR_LEASE_EXPIRED'
  WHERE run_token = OLD.run_token AND status = 'RUNNING';
  INSERT INTO operational_monitor_runs
    (run_token, monitor_key, started_at, lease_expires_at, status)
  VALUES (NEW.run_token, NEW.monitor_key, NEW.last_started_at, NEW.lease_expires_at, 'RUNNING');
END;

CREATE TRIGGER operational_monitor_progress
AFTER UPDATE ON operational_heartbeats
WHEN NEW.run_token = OLD.run_token AND NEW.lease_expires_at IS NOT NULL
BEGIN
  UPDATE operational_monitor_runs
  SET lease_expires_at = NEW.lease_expires_at, status = NEW.status,
      completed_at = CASE WHEN NEW.status = 'RUNNING' THEN NULL ELSE NEW.last_completed_at END,
      last_error_code = NEW.last_error_code
  WHERE run_token = NEW.run_token;
END;

ALTER TABLE operational_alerts ADD COLUMN claim_token TEXT;
ALTER TABLE operational_alerts ADD COLUMN claim_expires_at INTEGER;
ALTER TABLE operational_alerts ADD COLUMN first_delivery_attempt_at INTEGER;
ALTER TABLE operational_alerts ADD COLUMN delivery_occurrence_count INTEGER;
ALTER TABLE operational_alerts ADD COLUMN delivery_first_seen_at INTEGER;
ALTER TABLE operational_alerts ADD COLUMN delivery_last_seen_at INTEGER;
ALTER TABLE operational_alerts ADD COLUMN payload_sha256 TEXT;
ALTER TABLE operational_alerts ADD COLUMN retry_blocked INTEGER NOT NULL DEFAULT 0 CHECK (retry_blocked IN (0, 1));
ALTER TABLE operational_alerts ADD COLUMN last_delivery_http_status INTEGER;

CREATE TABLE operational_alert_attempts (
  claim_token TEXT PRIMARY KEY,
  alert_id TEXT NOT NULL REFERENCES operational_alerts(alert_id),
  started_at INTEGER NOT NULL,
  lease_expires_at INTEGER NOT NULL,
  payload_sha256 TEXT,
  status TEXT NOT NULL CHECK (status IN ('IN_FLIGHT', 'SENT', 'RETRY', 'FAILED')),
  completed_at INTEGER,
  error_code TEXT,
  http_status INTEGER CHECK (http_status IS NULL OR http_status BETWEEN 100 AND 599),
  retry_blocked INTEGER NOT NULL DEFAULT 0 CHECK (retry_blocked IN (0, 1))
);
CREATE INDEX idx_operational_alert_attempts_alert ON operational_alert_attempts(alert_id, started_at);

-- Preserve the last known legacy failure before quarantining attempted rows.
-- This is one retained observation, not a reconstruction of missing attempts.
INSERT INTO operational_alert_attempts
  (claim_token, alert_id, started_at, lease_expires_at, status, completed_at, error_code)
SELECT 'legacy:' || alert_id, alert_id,
       COALESCE(last_delivery_attempt_at, last_seen_at),
       COALESCE(last_delivery_attempt_at, last_seen_at), 'FAILED',
       COALESCE(last_delivery_attempt_at, last_seen_at), last_delivery_error_code
FROM operational_alerts WHERE last_delivery_error_code IS NOT NULL;

-- Earlier versions did not preserve the original request snapshot or its first
-- attempt time. Do not guess either value and reuse an old idempotency key.
UPDATE operational_alerts
SET retry_blocked = 1, last_delivery_error_code = 'LEGACY_RETRY_REVIEW_REQUIRED'
WHERE status = 'PENDING' AND delivery_attempts > 0;

CREATE TRIGGER operational_alert_claimed
AFTER UPDATE OF claim_token ON operational_alerts
WHEN NEW.claim_token IS NOT NULL AND NEW.claim_token IS NOT OLD.claim_token
BEGIN
  INSERT INTO operational_alert_attempts
    (claim_token, alert_id, started_at, lease_expires_at, payload_sha256, status)
  VALUES (NEW.claim_token, NEW.alert_id, NEW.last_delivery_attempt_at,
          NEW.claim_expires_at, NEW.payload_sha256, 'IN_FLIGHT');
END;

CREATE TRIGGER operational_alert_payload_frozen
AFTER UPDATE OF payload_sha256 ON operational_alerts WHEN NEW.payload_sha256 IS NOT NULL
BEGIN
  UPDATE operational_alert_attempts SET payload_sha256 = NEW.payload_sha256
  WHERE claim_token = NEW.claim_token AND status = 'IN_FLIGHT'
    AND (payload_sha256 IS NULL OR payload_sha256 = NEW.payload_sha256);
END;

-- Completing one attempt journals it and updates the delivery ledger in the
-- same SQLite statement. A late success for the exact frozen payload is final;
-- a late failure may be retained but cannot alter another owner's state.
CREATE TRIGGER operational_alert_attempt_completed
AFTER UPDATE OF status ON operational_alert_attempts
WHEN OLD.status = 'IN_FLIGHT' AND NEW.status IN ('SENT', 'RETRY', 'FAILED')
BEGIN
  UPDATE operational_alerts
  SET status = 'SENT', delivered_at = COALESCE(delivered_at, NEW.completed_at),
      last_delivery_http_status = NEW.http_status,
      claim_token = NULL, claim_expires_at = NULL, retry_blocked = 0
  WHERE alert_id = NEW.alert_id AND NEW.status = 'SENT'
    AND NEW.payload_sha256 IS NOT NULL AND payload_sha256 = NEW.payload_sha256;

  UPDATE operational_alerts
  SET last_delivery_error_code = CASE WHEN retry_blocked = 1 THEN last_delivery_error_code ELSE NEW.error_code END,
      last_delivery_http_status = NEW.http_status,
      retry_blocked = MAX(retry_blocked, NEW.retry_blocked), claim_token = NULL, claim_expires_at = NULL
  WHERE alert_id = NEW.alert_id AND NEW.status IN ('RETRY', 'FAILED')
    AND status = 'PENDING' AND claim_token = NEW.claim_token
    AND claim_expires_at > NEW.completed_at;
END;
