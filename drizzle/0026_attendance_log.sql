CREATE TABLE IF NOT EXISTS "attendance_log" (
  "id"              serial PRIMARY KEY,
  "organization_id" integer NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "driver_id"       text NOT NULL,
  "driver_name"     text NOT NULL,
  "date"            date NOT NULL,
  "status"          text NOT NULL,
  "note"            text,
  "created_at"      timestamp DEFAULT now(),
  "updated_at"      timestamp DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "attendance_log_org_driver_date_unique"
  ON "attendance_log" ("organization_id", "driver_id", "date");
