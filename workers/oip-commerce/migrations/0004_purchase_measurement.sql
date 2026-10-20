-- Disabled by default. No existing orders are eligible or backfilled.
CREATE TABLE purchase_measurement_checkouts (
  request_key TEXT PRIMARY KEY,
  square_order_id TEXT UNIQUE,
  transaction_id TEXT NOT NULL UNIQUE,
  measurement_id TEXT,
  mode TEXT NOT NULL CHECK (mode IN ('live', 'test', 'excluded')),
  product_sku TEXT,
  merchant_item_id TEXT,
  client_id TEXT,
  session_id TEXT,
  captured_at INTEGER,
  created_at INTEGER NOT NULL,
  CHECK (mode != 'live' OR (product_sku IS NOT NULL AND merchant_item_id IS NOT NULL)),
  CHECK ((mode = 'live' AND measurement_id IS NOT NULL AND client_id IS NOT NULL AND session_id IS NOT NULL AND captured_at IS NOT NULL)
      OR (client_id IS NULL AND session_id IS NULL AND captured_at IS NULL))
);

-- Owner-controlled suppression, installed before any controlled payment.
-- There is deliberately no public endpoint for writing or deleting exclusions.
CREATE TABLE purchase_measurement_exclusions (
  square_order_id TEXT PRIMARY KEY,
  reason TEXT NOT NULL CHECK (reason = 'CONTROLLED_TEST'),
  created_at INTEGER NOT NULL
);

-- A row is committed BEFORE fetch. An interrupted ATTEMPTING row is uncertain
-- and can never be reclaimed automatically. Keep this ledger across cleanup.
CREATE TABLE purchase_measurement_deliveries (
  square_order_id TEXT PRIMARY KEY,
  transaction_id TEXT NOT NULL UNIQUE,
  measurement_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ATTEMPTING', 'SENT_UNVERIFIED', 'REJECTED', 'UNKNOWN', 'EXCLUDED')),
  attempted_at INTEGER NOT NULL,
  finished_at INTEGER,
  http_status INTEGER,
  reason_code TEXT
);
