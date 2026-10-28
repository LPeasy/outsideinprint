-- Operator-only, once-per-lead recovery of a reviewed paid canonical-ad omission.
-- No existing row is released or reservation/attempt cleared by this migration.
ALTER TABLE meta_leads ADD COLUMN recovery_approved_at TEXT;
ALTER TABLE meta_leads ADD COLUMN recovery_review_source TEXT;
ALTER TABLE meta_leads ADD COLUMN recovery_approval_reason TEXT;

CREATE TABLE meta_paid_lead_recoveries (
  lead_id TEXT PRIMARY KEY REFERENCES meta_leads(lead_id),
  original_state TEXT NOT NULL CHECK (original_state = 'held'),
  original_error_code TEXT NOT NULL CHECK (original_error_code IN ('lead_or_consent_invalid', 'canonical_lead_mismatch')),
  reviewed_at TEXT NOT NULL,
  review_source TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason = 'approved_paid_missing_ad_id_retry')
);

CREATE TRIGGER meta_paid_recovery_metadata_insert_guard
BEFORE INSERT ON meta_leads
WHEN NEW.recovery_approved_at IS NOT NULL OR NEW.recovery_review_source IS NOT NULL OR NEW.recovery_approval_reason IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'paid_recovery_approval_not_allowed'); END;

CREATE TRIGGER meta_paid_recovery_metadata_update_guard
BEFORE UPDATE OF recovery_approved_at, recovery_review_source, recovery_approval_reason ON meta_leads
WHEN OLD.recovery_approved_at IS NOT NEW.recovery_approved_at
  OR OLD.recovery_review_source IS NOT NEW.recovery_review_source
  OR OLD.recovery_approval_reason IS NOT NEW.recovery_approval_reason
BEGIN
  SELECT CASE WHEN OLD.recovery_approved_at IS NOT NULL OR OLD.recovery_review_source IS NOT NULL OR OLD.recovery_approval_reason IS NOT NULL
    THEN RAISE(ABORT, 'immutable_paid_recovery_approval') END;
  SELECT CASE WHEN OLD.state IS NOT 'held' OR NEW.state IS NOT 'queued' OR OLD.ad_id = 'owned-test'
    OR NEW.error_code IS NOT 'approved_paid_missing_ad_id_retry'
    THEN RAISE(ABORT, 'paid_recovery_approval_not_allowed') END;
END;

-- Install the replacement before dropping the old guard. A partial migration
-- therefore keeps the original fail-closed rule on paid requeues.
CREATE TRIGGER meta_lead_recovery_guard
BEFORE UPDATE OF state ON meta_leads
WHEN OLD.state != 'queued' AND NEW.state = 'queued'
BEGIN
  SELECT CASE
    WHEN NEW.error_code IS 'approved_paid_missing_ad_id_retry' AND OLD.ad_id != 'owned-test' THEN
      CASE WHEN (
        OLD.state = 'held' AND OLD.error_code IN ('lead_or_consent_invalid', 'canonical_lead_mismatch')
        AND length(OLD.ad_id) BETWEEN 4 AND 30 AND OLD.ad_id GLOB '[1-9]*' AND OLD.ad_id NOT GLOB '*[^0-9]*'
        AND OLD.email_key IS NULL AND NEW.email_key IS NULL
        AND OLD.attempted_at IS NULL AND NEW.attempted_at IS NULL
        AND OLD.subscriber_id IS NULL AND NEW.subscriber_id IS NULL
        AND OLD.finished_at IS NULL AND NEW.finished_at IS NULL
        AND NEW.retrieval_attempts IS OLD.retrieval_attempts AND NEW.next_retrieval_at IS OLD.next_retrieval_at
        AND OLD.recovery_approved_at IS NULL AND OLD.recovery_review_source IS NULL AND OLD.recovery_approval_reason IS NULL
        AND typeof(NEW.recovery_approved_at) = 'text' AND length(NEW.recovery_approved_at) = 24
        AND NEW.recovery_approved_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z'
        AND strftime('%Y-%m-%dT%H:%M:%fZ', NEW.recovery_approved_at) = NEW.recovery_approved_at
        AND typeof(NEW.recovery_review_source) = 'text' AND length(NEW.recovery_review_source) = 64
        AND NEW.recovery_review_source NOT GLOB '*[^0-9a-f]*'
        AND NEW.recovery_approval_reason IS 'approved_paid_missing_ad_id_retry'
      ) IS NOT 1 THEN RAISE(ABORT, 'paid_lead_recovery_not_allowed') END
    ELSE
      -- Preserve the original owner-test exception and its rejection diagnostic.
      CASE WHEN OLD.state != 'rejected' OR OLD.ad_id != 'owned-test'
        OR OLD.error_code NOT IN ('buttondown_http_400', 'buttondown_firewall_blocked')
        OR NEW.error_code IS NOT 'approved_owned_test_firewall_retry'
        OR OLD.email_key IS NULL OR NEW.email_key IS NOT OLD.email_key
        OR OLD.subscriber_id IS NOT NULL OR NEW.subscriber_id IS NOT NULL OR OLD.attempted_at IS NULL OR OLD.finished_at IS NULL
        OR NEW.attempted_at IS NOT NULL OR NEW.finished_at IS NOT NULL
        THEN RAISE(ABORT, 'owned_test_recovery_not_allowed') END
  END;
  INSERT INTO meta_owned_test_recoveries
    (lead_id, original_error_code, original_attempted_at, original_finished_at, reviewed_at, reason)
    SELECT OLD.lead_id, OLD.error_code, OLD.attempted_at, OLD.finished_at,
      strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NEW.error_code
    WHERE OLD.ad_id = 'owned-test';
  INSERT INTO meta_paid_lead_recoveries
    (lead_id, original_state, original_error_code, reviewed_at, review_source, reason)
    SELECT OLD.lead_id, OLD.state, OLD.error_code, NEW.recovery_approved_at,
      NEW.recovery_review_source, NEW.recovery_approval_reason
    WHERE OLD.ad_id != 'owned-test';
END;

CREATE TRIGGER meta_paid_lead_recovery_immutable_update
BEFORE UPDATE ON meta_paid_lead_recoveries
BEGIN SELECT RAISE(ABORT, 'immutable_recovery_audit'); END;

CREATE TRIGGER meta_paid_lead_recovery_immutable_delete
BEFORE DELETE ON meta_paid_lead_recoveries
BEGIN SELECT RAISE(ABORT, 'immutable_recovery_audit'); END;

DROP TRIGGER meta_owned_test_recovery_guard;
