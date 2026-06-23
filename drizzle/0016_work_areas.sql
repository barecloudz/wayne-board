CREATE TABLE IF NOT EXISTS work_areas (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  shape      TEXT NOT NULL DEFAULT 'circle',
  color      TEXT NOT NULL DEFAULT '#6366f1',
  active     BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE drivers ADD COLUMN IF NOT EXISTS default_work_area_id INTEGER REFERENCES work_areas(id);

CREATE TABLE IF NOT EXISTS daily_work_area_assignments (
  id           SERIAL PRIMARY KEY,
  driver_id    TEXT NOT NULL REFERENCES drivers(driver_id) ON DELETE CASCADE,
  date         DATE NOT NULL,
  work_area_id INTEGER NOT NULL REFERENCES work_areas(id) ON DELETE CASCADE,
  created_at   TIMESTAMP DEFAULT NOW(),
  UNIQUE(driver_id, date)
);
