-- Ordering watermarks in compact lifecycle summaries preserve unknown-time
-- reconciliation without retaining detailed event IDs or individual payloads.
ALTER TABLE subscriber_week_facts ADD COLUMN last_unknown_observed_at TEXT;
ALTER TABLE subscriber_week_facts ADD COLUMN last_dated_observed_at TEXT;
