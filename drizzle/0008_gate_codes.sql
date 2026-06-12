CREATE TABLE IF NOT EXISTS gate_codes (
  id           SERIAL PRIMARY KEY,
  location     TEXT NOT NULL,
  code         TEXT NOT NULL,
  added_by     TEXT NOT NULL,
  added_by_name TEXT NOT NULL,
  active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gate_code_reports (
  id           SERIAL PRIMARY KEY,
  gate_code_id INTEGER NOT NULL REFERENCES gate_codes(id) ON DELETE CASCADE,
  driver_id    TEXT NOT NULL,
  created_at   TIMESTAMP DEFAULT NOW(),
  UNIQUE(gate_code_id, driver_id)
);
