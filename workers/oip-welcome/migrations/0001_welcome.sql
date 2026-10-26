-- Permanent reservations; never delete/reset rows to retry uncertain sends.
-- No email, email hash, raw webhook, IP, or provider error body is stored.
CREATE TABLE welcome_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  cutover_at TEXT NOT NULL
);
CREATE TABLE welcome_enrollments (
  subscriber_id TEXT PRIMARY KEY,
  enrollment_ref TEXT NOT NULL UNIQUE,
  sequence_version TEXT NOT NULL,
  event_name TEXT NOT NULL,
  subscriber_created_at TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('pending', 'dispatching', 'accepted', 'uncertain', 'rejected')),
  attempted_at TEXT,
  finished_at TEXT,
  error_code TEXT
);
CREATE INDEX welcome_enrollments_state ON welcome_enrollments(state);
