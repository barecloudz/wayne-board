CREATE TABLE trainee_work_days (
  id          SERIAL PRIMARY KEY,
  driver_id   TEXT NOT NULL REFERENCES drivers(driver_id) ON DELETE CASCADE,
  date        DATE NOT NULL,
  week_start  DATE NOT NULL,
  created_at  TIMESTAMP DEFAULT NOW(),
  UNIQUE(driver_id, date)
);
