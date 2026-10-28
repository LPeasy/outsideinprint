-- workerd limits LIKE/GLOB pattern length. Canonical strftime equality and the
-- existing text/length checks enforce the same UTC timestamp without a long GLOB.
-- Keep the old guard until the replacement is installed; no row is requeued.
CREATE TRIGGER meta_lead_recovery_guard_v4
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

DROP TRIGGER meta_lead_recovery_guard;
