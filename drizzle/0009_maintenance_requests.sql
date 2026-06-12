CREATE TABLE IF NOT EXISTS maintenance_requests (
  id           SERIAL PRIMARY KEY,
  driver_id    TEXT NOT NULL,
  driver_name  TEXT NOT NULL,
  truck_number TEXT NOT NULL,
  description  TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending',
  admin_note   TEXT,
  created_at   TIMESTAMP DEFAULT NOW(),
  updated_at   TIMESTAMP DEFAULT NOW()
);
