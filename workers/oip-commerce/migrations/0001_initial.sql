PRAGMA foreign_keys = ON;

CREATE TABLE checkout_requests (
  request_key TEXT PRIMARY KEY,
  request_kind TEXT NOT NULL CHECK (request_kind IN ('ONE_TIME', 'MONTHLY')),
  request_hash TEXT NOT NULL,
  square_idempotency_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')),
  checkout_url TEXT,
  square_payment_link_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_error_code TEXT,
  processing_started_at INTEGER,
  processing_token TEXT
);

CREATE TABLE rate_limits (
  bucket_key TEXT NOT NULL,
  bucket_start INTEGER NOT NULL,
  request_count INTEGER NOT NULL CHECK (request_count >= 0),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (bucket_key, bucket_start)
);

CREATE INDEX idx_rate_limits_updated_at ON rate_limits(updated_at);
CREATE INDEX idx_checkout_requests_status_updated ON checkout_requests(status, updated_at);

CREATE TABLE webhook_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  object_id TEXT,
  payment_id TEXT,
  payload_sha256 TEXT NOT NULL,
  event_created_at TEXT,
  status TEXT NOT NULL CHECK (status IN ('RECEIVED', 'QUEUED', 'PROCESSING', 'PROCESSED', 'FAILED')),
  attempts INTEGER NOT NULL DEFAULT 0,
  received_at INTEGER NOT NULL,
  processing_started_at INTEGER,
  processing_token TEXT,
  processed_at INTEGER,
  last_error_code TEXT
);

CREATE INDEX idx_webhook_events_status_received ON webhook_events(status, received_at);

CREATE TABLE fulfillments (
  fulfillment_id TEXT PRIMARY KEY,
  payment_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  sku TEXT NOT NULL,
  buyer_email_sha256 TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'REVOKED')),
  token_sha256 TEXT NOT NULL UNIQUE,
  token_generation INTEGER NOT NULL DEFAULT 1 CHECK (token_generation > 0),
  expires_at INTEGER NOT NULL,
  download_count INTEGER NOT NULL DEFAULT 0 CHECK (download_count >= 0),
  max_downloads INTEGER NOT NULL DEFAULT 5 CHECK (max_downloads > 0),
  created_at INTEGER NOT NULL,
  revoked_at INTEGER,
  last_email_at INTEGER,
  email_delivery_status TEXT CHECK (email_delivery_status IN ('PENDING', 'SENT', 'FAILED')),
  email_message_id TEXT,
  resend_sequence INTEGER NOT NULL DEFAULT 0 CHECK (resend_sequence >= 0),
  resend_status TEXT CHECK (resend_status IN ('PENDING', 'SENT', 'FAILED')),
  resend_processing_started_at INTEGER,
  resend_processing_token TEXT,
  UNIQUE (payment_id, sku)
);

CREATE INDEX idx_fulfillments_order_id ON fulfillments(order_id);
CREATE INDEX idx_fulfillments_payment_id ON fulfillments(payment_id);
CREATE INDEX idx_fulfillments_created_at ON fulfillments(created_at);

CREATE TABLE fulfillment_reviews (
  review_id TEXT PRIMARY KEY,
  event_id TEXT,
  payment_id TEXT,
  order_id TEXT,
  reason_code TEXT NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'RESOLVED')),
  created_at INTEGER NOT NULL,
  UNIQUE (event_id, reason_code)
);

CREATE INDEX idx_fulfillment_reviews_status ON fulfillment_reviews(status, created_at);

CREATE TABLE payment_blocks (
  payment_id TEXT PRIMARY KEY,
  reason_code TEXT NOT NULL CHECK (reason_code IN ('REFUND', 'DISPUTE')),
  event_id TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE subscription_events (
  subscription_id TEXT PRIMARY KEY,
  last_event_id TEXT NOT NULL,
  status TEXT,
  plan_variation_id TEXT,
  square_version INTEGER NOT NULL CHECK (square_version >= 0),
  updated_at INTEGER NOT NULL
);
