-- OIP Task 2 remote D1 schema proof. Read-only by construction.
-- Run only after all three packet-bound migrations have applied.

WITH expected(name) AS (
  VALUES
    ('0001_initial.sql'),
    ('0002_physical_checkout.sql'),
    ('0003_operational_monitoring.sql')
),
actual(name) AS (
  SELECT name FROM d1_migrations
),
mismatches(direction, name) AS (
  SELECT 'MISSING', name FROM expected
  EXCEPT
  SELECT 'MISSING', name FROM actual
  UNION ALL
  SELECT 'UNEXPECTED', name FROM actual
  EXCEPT
  SELECT 'UNEXPECTED', name FROM expected
)
SELECT
  'migration_set' AS check_name,
  CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END AS status,
  COUNT(*) AS mismatch_count
FROM mismatches;

-- Exact sqlite_schema text binds every column, default, CHECK/UNIQUE/FOREIGN KEY
-- constraint, and index key/order. Same-name schema drift therefore fails.
WITH expected(type, name, tbl_name, sql) AS (
  VALUES
    ('index', 'idx_checkout_requests_status_updated', 'checkout_requests', 'CREATE INDEX idx_checkout_requests_status_updated ON checkout_requests(status, updated_at)'),
    ('index', 'idx_fulfillment_reviews_status', 'fulfillment_reviews', 'CREATE INDEX idx_fulfillment_reviews_status ON fulfillment_reviews(status, created_at)'),
    ('index', 'idx_fulfillments_created_at', 'fulfillments', 'CREATE INDEX idx_fulfillments_created_at ON fulfillments(created_at)'),
    ('index', 'idx_fulfillments_order_id', 'fulfillments', 'CREATE INDEX idx_fulfillments_order_id ON fulfillments(order_id)'),
    ('index', 'idx_fulfillments_payment_id', 'fulfillments', 'CREATE INDEX idx_fulfillments_payment_id ON fulfillments(payment_id)'),
    ('index', 'idx_operational_alerts_pending', 'operational_alerts', 'CREATE INDEX idx_operational_alerts_pending
ON operational_alerts(status, first_seen_at)'),
    ('index', 'idx_operational_dlq_receipts_received', 'operational_dlq_receipts', 'CREATE INDEX idx_operational_dlq_receipts_received
ON operational_dlq_receipts(received_at)'),
    ('index', 'idx_operational_queue_canaries_status', 'operational_queue_canaries', 'CREATE INDEX idx_operational_queue_canaries_status
ON operational_queue_canaries(status, queued_at)'),
    ('index', 'idx_physical_checkout_expiry', 'physical_checkout_bindings', 'CREATE INDEX idx_physical_checkout_expiry ON physical_checkout_bindings(status, expires_at)'),
    ('index', 'idx_physical_checkout_order', 'physical_checkout_bindings', 'CREATE INDEX idx_physical_checkout_order ON physical_checkout_bindings(square_order_id)'),
    ('index', 'idx_physical_checkout_payment', 'physical_checkout_bindings', 'CREATE INDEX idx_physical_checkout_payment ON physical_checkout_bindings(square_payment_id)'),
    ('index', 'idx_physical_inventory_active', 'physical_inventory_reservations', 'CREATE INDEX idx_physical_inventory_active
ON physical_inventory_reservations(catalog_object_id, status, expires_at)'),
    ('index', 'idx_rate_limits_updated_at', 'rate_limits', 'CREATE INDEX idx_rate_limits_updated_at ON rate_limits(updated_at)'),
    ('index', 'idx_webhook_events_status_received', 'webhook_events', 'CREATE INDEX idx_webhook_events_status_received ON webhook_events(status, received_at)'),
    ('table', 'checkout_requests', 'checkout_requests', 'CREATE TABLE "checkout_requests" (
  request_key TEXT PRIMARY KEY,
  request_kind TEXT NOT NULL CHECK (request_kind IN (''ONE_TIME'', ''MONTHLY'', ''EPUB'', ''PHYSICAL'')),
  request_hash TEXT NOT NULL,
  square_idempotency_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN (''PENDING'', ''PROCESSING'', ''COMPLETED'', ''FAILED'')),
  checkout_url TEXT,
  square_payment_link_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_error_code TEXT,
  processing_started_at INTEGER,
  processing_token TEXT
)'),
    ('table', 'florida_county_sales_tax_rates', 'florida_county_sales_tax_rates', 'CREATE TABLE florida_county_sales_tax_rates (
  rate_version TEXT NOT NULL,
  county_fips TEXT NOT NULL,
  state_rate_bps INTEGER NOT NULL CHECK (state_rate_bps = 600),
  surtax_rate_bps INTEGER NOT NULL CHECK (surtax_rate_bps BETWEEN 0 AND 200),
  combined_rate_bps INTEGER NOT NULL,
  PRIMARY KEY (rate_version, county_fips),
  FOREIGN KEY (rate_version) REFERENCES florida_sales_tax_rate_manifests(rate_version),
  CHECK (combined_rate_bps = state_rate_bps + surtax_rate_bps)
)'),
    ('table', 'florida_jurisdiction_datasets', 'florida_jurisdiction_datasets', 'CREATE TABLE florida_jurisdiction_datasets (
  dataset_version TEXT PRIMARY KEY,
  schema_version TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN (''ACTIVE'', ''RETIRED'')),
  effective_from INTEGER NOT NULL,
  effective_through INTEGER NOT NULL,
  stale_after INTEGER NOT NULL,
  row_count INTEGER NOT NULL CHECK (row_count > 0),
  content_sha256 TEXT NOT NULL,
  source_url TEXT NOT NULL,
  imported_at INTEGER NOT NULL
)'),
    ('table', 'florida_sales_tax_rate_manifests', 'florida_sales_tax_rate_manifests', 'CREATE TABLE florida_sales_tax_rate_manifests (
  rate_version TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN (''ACTIVE'', ''RETIRED'')),
  effective_from INTEGER NOT NULL,
  effective_through INTEGER NOT NULL,
  stale_after INTEGER NOT NULL,
  row_count INTEGER NOT NULL CHECK (row_count = 67),
  content_sha256 TEXT NOT NULL,
  source_url TEXT NOT NULL,
  imported_at INTEGER NOT NULL
)'),
    ('table', 'fulfillment_reviews', 'fulfillment_reviews', 'CREATE TABLE fulfillment_reviews (
  review_id TEXT PRIMARY KEY,
  event_id TEXT,
  payment_id TEXT,
  order_id TEXT,
  reason_code TEXT NOT NULL,
  details_json TEXT NOT NULL DEFAULT ''{}'',
  status TEXT NOT NULL DEFAULT ''OPEN'' CHECK (status IN (''OPEN'', ''RESOLVED'')),
  created_at INTEGER NOT NULL,
  UNIQUE (event_id, reason_code)
)'),
    ('table', 'fulfillments', 'fulfillments', 'CREATE TABLE fulfillments (
  fulfillment_id TEXT PRIMARY KEY,
  payment_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  sku TEXT NOT NULL,
  buyer_email_sha256 TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN (''ACTIVE'', ''REVOKED'')),
  token_sha256 TEXT NOT NULL UNIQUE,
  token_generation INTEGER NOT NULL DEFAULT 1 CHECK (token_generation > 0),
  expires_at INTEGER NOT NULL,
  download_count INTEGER NOT NULL DEFAULT 0 CHECK (download_count >= 0),
  max_downloads INTEGER NOT NULL DEFAULT 5 CHECK (max_downloads > 0),
  created_at INTEGER NOT NULL,
  revoked_at INTEGER,
  last_email_at INTEGER,
  email_delivery_status TEXT CHECK (email_delivery_status IN (''PENDING'', ''SENT'', ''FAILED'')),
  email_message_id TEXT,
  resend_sequence INTEGER NOT NULL DEFAULT 0 CHECK (resend_sequence >= 0),
  resend_status TEXT CHECK (resend_status IN (''PENDING'', ''SENT'', ''FAILED'')),
  resend_processing_started_at INTEGER,
  resend_processing_token TEXT,
  UNIQUE (payment_id, sku)
)'),
    ('table', 'operational_alerts', 'operational_alerts', 'CREATE TABLE operational_alerts (
  alert_id TEXT PRIMARY KEY,
  alert_code TEXT NOT NULL,
  alert_bucket INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN (''PENDING'', ''SENT'')),
  occurrence_count INTEGER NOT NULL CHECK (occurrence_count > 0),
  first_seen_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  delivery_attempts INTEGER NOT NULL DEFAULT 0 CHECK (delivery_attempts >= 0),
  last_delivery_attempt_at INTEGER,
  delivered_at INTEGER,
  last_delivery_error_code TEXT,
  UNIQUE (alert_code, alert_bucket)
)'),
    ('table', 'operational_dlq_receipts', 'operational_dlq_receipts', 'CREATE TABLE operational_dlq_receipts (
  receipt_sha256 TEXT PRIMARY KEY CHECK (length(receipt_sha256) = 64),
  received_at INTEGER NOT NULL
)'),
    ('table', 'operational_heartbeats', 'operational_heartbeats', 'CREATE TABLE operational_heartbeats (
  monitor_key TEXT PRIMARY KEY,
  run_token TEXT NOT NULL,
  last_started_at INTEGER NOT NULL,
  last_completed_at INTEGER,
  status TEXT NOT NULL CHECK (status IN (''RUNNING'', ''OK'', ''DEGRADED'', ''FAILED'')),
  last_error_code TEXT,
  updated_at INTEGER NOT NULL
)'),
    ('table', 'operational_queue_canaries', 'operational_queue_canaries', 'CREATE TABLE operational_queue_canaries (
  canary_id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN (''PENDING'', ''QUEUED'', ''RECEIVED'', ''SEND_FAILED'', ''STALE'')),
  queued_at INTEGER NOT NULL,
  received_at INTEGER,
  updated_at INTEGER NOT NULL
)'),
    ('table', 'payment_blocks', 'payment_blocks', 'CREATE TABLE payment_blocks (
  payment_id TEXT PRIMARY KEY,
  reason_code TEXT NOT NULL CHECK (reason_code IN (''REFUND'', ''DISPUTE'')),
  event_id TEXT NOT NULL,
  created_at INTEGER NOT NULL
)'),
    ('table', 'physical_checkout_bindings', 'physical_checkout_bindings', 'CREATE TABLE physical_checkout_bindings (
  request_key TEXT PRIMARY KEY,
  square_payment_link_id TEXT NOT NULL UNIQUE,
  square_order_id TEXT NOT NULL UNIQUE,
  square_payment_id TEXT UNIQUE,
  items_json TEXT NOT NULL,
  address_hmac TEXT NOT NULL,
  state_code TEXT NOT NULL,
  county_fips TEXT,
  combined_rate_bps INTEGER NOT NULL,
  dataset_version TEXT,
  rate_table_version TEXT,
  resolution_method TEXT NOT NULL,
  merchandise_cents INTEGER NOT NULL CHECK (merchandise_cents >= 0),
  shipping_cents INTEGER NOT NULL CHECK (shipping_cents >= 0),
  shipping_tax_cents INTEGER NOT NULL CHECK (shipping_tax_cents >= 0),
  tax_cents INTEGER NOT NULL CHECK (tax_cents >= 0),
  total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
  status TEXT NOT NULL CHECK (
    status IN (''LINK_CREATED'', ''PAYMENT_PROCESSING'', ''PAID_REVIEW_READY'', ''HELD'', ''REFUNDED'', ''DISPUTED'', ''EXPIRED'')
  ),
  hold_reason TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (request_key) REFERENCES checkout_requests(request_key)
)'),
    ('table', 'physical_inventory_reservations', 'physical_inventory_reservations', 'CREATE TABLE physical_inventory_reservations (
  request_key TEXT NOT NULL,
  sku TEXT NOT NULL,
  catalog_object_id TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 6),
  source_in_stock_count INTEGER NOT NULL,
  claim_token TEXT NOT NULL,
  status TEXT NOT NULL CHECK (
    status IN (''ACTIVE'', ''ORPHANED_REVIEW'', ''PAID_PENDING'', ''SOLD_VERIFIED'', ''RELEASED'')
  ),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (request_key, sku),
  FOREIGN KEY (request_key) REFERENCES checkout_requests(request_key)
)'),
    ('table', 'rate_limits', 'rate_limits', 'CREATE TABLE rate_limits (
  bucket_key TEXT NOT NULL,
  bucket_start INTEGER NOT NULL,
  request_count INTEGER NOT NULL CHECK (request_count >= 0),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (bucket_key, bucket_start)
)'),
    ('table', 'subscription_events', 'subscription_events', 'CREATE TABLE subscription_events (
  subscription_id TEXT PRIMARY KEY,
  last_event_id TEXT NOT NULL,
  status TEXT,
  plan_variation_id TEXT,
  square_version INTEGER NOT NULL CHECK (square_version >= 0),
  updated_at INTEGER NOT NULL
)'),
    ('table', 'webhook_events', 'webhook_events', 'CREATE TABLE webhook_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  object_id TEXT,
  payment_id TEXT,
  payload_sha256 TEXT NOT NULL,
  event_created_at TEXT,
  status TEXT NOT NULL CHECK (status IN (''RECEIVED'', ''QUEUED'', ''PROCESSING'', ''PROCESSED'', ''FAILED'')),
  attempts INTEGER NOT NULL DEFAULT 0,
  received_at INTEGER NOT NULL,
  processing_started_at INTEGER,
  processing_token TEXT,
  processed_at INTEGER,
  last_error_code TEXT
)')
),
actual(type, name, tbl_name, sql) AS (
  SELECT type, name, tbl_name, sql
  FROM sqlite_schema
  WHERE type IN ('table', 'index')
    AND name NOT LIKE 'sqlite_%'
    AND name NOT LIKE '_cf_%'
    AND name <> 'd1_migrations'
),
mismatches(direction, type, name, tbl_name, sql) AS (
  SELECT 'MISSING_OR_CHANGED', type, name, tbl_name, sql FROM expected
  EXCEPT
  SELECT 'MISSING_OR_CHANGED', type, name, tbl_name, sql FROM actual
  UNION ALL
  SELECT 'UNEXPECTED_OR_CHANGED', type, name, tbl_name, sql FROM actual
  EXCEPT
  SELECT 'UNEXPECTED_OR_CHANGED', type, name, tbl_name, sql FROM expected
)
SELECT
  'schema_definition_set' AS check_name,
  CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END AS status,
  COUNT(*) AS mismatch_count
FROM mismatches;

SELECT
  'foreign_key_check' AS check_name,
  CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END AS status,
  COUNT(*) AS mismatch_count
FROM pragma_foreign_key_check;

SELECT
  'checkout_request_kinds' AS check_name,
  CASE
    WHEN sql LIKE '%request_kind IN (''ONE_TIME'', ''MONTHLY'', ''EPUB'', ''PHYSICAL'')%'
      THEN 'PASS'
    ELSE 'FAIL'
  END AS status,
  CASE
    WHEN sql LIKE '%request_kind IN (''ONE_TIME'', ''MONTHLY'', ''EPUB'', ''PHYSICAL'')%'
      THEN 0
    ELSE 1
  END AS mismatch_count
FROM sqlite_schema
WHERE type = 'table' AND name = 'checkout_requests';

-- Preserve the full application schema text as private evidence for exact review.
SELECT type, name, tbl_name, sql
FROM sqlite_schema
WHERE type IN ('table', 'index')
  AND name NOT LIKE 'sqlite_%'
  AND name NOT LIKE '_cf_%'
ORDER BY type, name;
