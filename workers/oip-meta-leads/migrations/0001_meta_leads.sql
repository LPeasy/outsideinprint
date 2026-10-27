CREATE TABLE meta_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  newsletter_id TEXT NOT NULL,
  email_key_fingerprint TEXT NOT NULL
);

CREATE TABLE meta_leads (
  lead_id TEXT PRIMARY KEY,
  page_id TEXT NOT NULL,
  form_id TEXT NOT NULL,
  ad_id TEXT NOT NULL,
  campaign_code TEXT NOT NULL,
  consent_version TEXT NOT NULL,
  consent_key TEXT NOT NULL,
  consent_value TEXT NOT NULL,
  created_at TEXT NOT NULL,
  received_at TEXT NOT NULL,
  email_key TEXT UNIQUE,
  state TEXT NOT NULL CHECK (state IN ('queued', 'dispatching', 'pending_confirmation', 'duplicate', 'held', 'rejected', 'uncertain')),
  attempted_at TEXT,
  retrieval_attempts INTEGER NOT NULL DEFAULT 0,
  next_retrieval_at TEXT,
  subscriber_id TEXT,
  error_code TEXT,
  finished_at TEXT
);
CREATE INDEX meta_leads_queue ON meta_leads(state, next_retrieval_at, received_at);
CREATE INDEX meta_leads_attempts ON meta_leads(attempted_at);

CREATE TRIGGER meta_leads_attribution_immutable
BEFORE UPDATE OF lead_id, page_id, form_id, ad_id, campaign_code, consent_version, consent_key, consent_value, created_at, received_at ON meta_leads
BEGIN SELECT RAISE(ABORT, 'immutable_attribution'); END;

CREATE TRIGGER meta_leads_email_key_immutable
BEFORE UPDATE OF email_key ON meta_leads
WHEN OLD.email_key IS NOT NULL AND OLD.email_key IS NOT NEW.email_key
BEGIN SELECT RAISE(ABORT, 'immutable_email_key'); END;
