CREATE TABLE IF NOT EXISTS schedule_overrides (
  id         SERIAL PRIMARY KEY,
  driver_id  TEXT NOT NULL REFERENCES drivers(driver_id) ON DELETE CASCADE,
  date       DATE NOT NULL,
  note       TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(driver_id, date)
);
