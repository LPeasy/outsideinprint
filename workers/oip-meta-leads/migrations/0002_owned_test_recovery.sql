-- A reviewed, one-time correction of a definitely rejected owner-only test.
-- No automatic recovery path exists. Stable email reservations are preserved.
CREATE TABLE meta_owned_test_recoveries (
  lead_id TEXT PRIMARY KEY REFERENCES meta_leads(lead_id),
  original_error_code TEXT NOT NULL,
  original_attempted_at TEXT NOT NULL,
  original_finished_at TEXT NOT NULL,
  reviewed_at TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason = 'approved_owned_test_firewall_retry')
);

CREATE TRIGGER meta_owned_test_recovery_guard
BEFORE UPDATE OF state ON meta_leads
WHEN OLD.state != 'queued' AND NEW.state = 'queued'
BEGIN
  SELECT CASE WHEN OLD.state != 'rejected' OR OLD.ad_id != 'owned-test'
    OR OLD.error_code NOT IN ('buttondown_http_400', 'buttondown_firewall_blocked')
    OR NEW.error_code IS NOT 'approved_owned_test_firewall_retry'
    OR OLD.email_key IS NULL OR NEW.email_key IS NOT OLD.email_key
    OR OLD.subscriber_id IS NOT NULL OR NEW.subscriber_id IS NOT NULL OR OLD.attempted_at IS NULL OR OLD.finished_at IS NULL
    OR NEW.attempted_at IS NOT NULL OR NEW.finished_at IS NOT NULL
    THEN RAISE(ABORT, 'owned_test_recovery_not_allowed') END;
  INSERT INTO meta_owned_test_recoveries
    (lead_id, original_error_code, original_attempted_at, original_finished_at, reviewed_at, reason)
    VALUES (OLD.lead_id, OLD.error_code, OLD.attempted_at, OLD.finished_at,
      strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NEW.error_code);
END;

CREATE TRIGGER meta_owned_test_recovery_immutable_update
BEFORE UPDATE ON meta_owned_test_recoveries
BEGIN SELECT RAISE(ABORT, 'immutable_recovery_audit'); END;

CREATE TRIGGER meta_owned_test_recovery_immutable_delete
BEFORE DELETE ON meta_owned_test_recoveries
BEGIN SELECT RAISE(ABORT, 'immutable_recovery_audit'); END;
