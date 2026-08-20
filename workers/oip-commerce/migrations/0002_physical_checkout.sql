PRAGMA foreign_keys = OFF;

CREATE TABLE checkout_requests_v2 (
  request_key TEXT PRIMARY KEY,
  request_kind TEXT NOT NULL CHECK (request_kind IN ('ONE_TIME', 'MONTHLY', 'EPUB', 'PHYSICAL')),
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

INSERT INTO checkout_requests_v2
SELECT request_key, request_kind, request_hash, square_idempotency_key, status,
       checkout_url, square_payment_link_id, created_at, updated_at, last_error_code,
       processing_started_at, processing_token
FROM checkout_requests;

DROP TABLE checkout_requests;
ALTER TABLE checkout_requests_v2 RENAME TO checkout_requests;
CREATE INDEX idx_checkout_requests_status_updated ON checkout_requests(status, updated_at);

CREATE TABLE florida_jurisdiction_datasets (
  dataset_version TEXT PRIMARY KEY,
  schema_version TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'RETIRED')),
  effective_from INTEGER NOT NULL,
  effective_through INTEGER NOT NULL,
  stale_after INTEGER NOT NULL,
  row_count INTEGER NOT NULL CHECK (row_count > 0),
  content_sha256 TEXT NOT NULL,
  source_url TEXT NOT NULL,
  imported_at INTEGER NOT NULL
);

CREATE TABLE florida_sales_tax_rate_manifests (
  rate_version TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'RETIRED')),
  effective_from INTEGER NOT NULL,
  effective_through INTEGER NOT NULL,
  stale_after INTEGER NOT NULL,
  row_count INTEGER NOT NULL CHECK (row_count = 67),
  content_sha256 TEXT NOT NULL,
  source_url TEXT NOT NULL,
  imported_at INTEGER NOT NULL
);

CREATE TABLE florida_county_sales_tax_rates (
  rate_version TEXT NOT NULL,
  county_fips TEXT NOT NULL,
  state_rate_bps INTEGER NOT NULL CHECK (state_rate_bps = 600),
  surtax_rate_bps INTEGER NOT NULL CHECK (surtax_rate_bps BETWEEN 0 AND 200),
  combined_rate_bps INTEGER NOT NULL,
  PRIMARY KEY (rate_version, county_fips),
  FOREIGN KEY (rate_version) REFERENCES florida_sales_tax_rate_manifests(rate_version),
  CHECK (combined_rate_bps = state_rate_bps + surtax_rate_bps)
);

CREATE TABLE physical_checkout_bindings (
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
    status IN ('LINK_CREATED', 'PAYMENT_PROCESSING', 'PAID_REVIEW_READY', 'HELD', 'REFUNDED', 'DISPUTED', 'EXPIRED')
  ),
  hold_reason TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (request_key) REFERENCES checkout_requests(request_key)
);

CREATE INDEX idx_physical_checkout_order ON physical_checkout_bindings(square_order_id);
CREATE INDEX idx_physical_checkout_payment ON physical_checkout_bindings(square_payment_id);
CREATE INDEX idx_physical_checkout_expiry ON physical_checkout_bindings(status, expires_at);

CREATE TABLE physical_inventory_reservations (
  request_key TEXT NOT NULL,
  sku TEXT NOT NULL,
  catalog_object_id TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 6),
  source_in_stock_count INTEGER NOT NULL,
  claim_token TEXT NOT NULL,
  status TEXT NOT NULL CHECK (
    status IN ('ACTIVE', 'ORPHANED_REVIEW', 'PAID_PENDING', 'SOLD_VERIFIED', 'RELEASED')
  ),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (request_key, sku),
  FOREIGN KEY (request_key) REFERENCES checkout_requests(request_key)
);

CREATE INDEX idx_physical_inventory_active
ON physical_inventory_reservations(catalog_object_id, status, expires_at);

PRAGMA foreign_keys = ON;
