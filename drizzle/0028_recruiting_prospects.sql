CREATE TABLE IF NOT EXISTS "prospects" (
  "id"                      SERIAL PRIMARY KEY,
  "organization_id"         INTEGER NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "name"                    TEXT NOT NULL,
  "phone"                   TEXT,
  "email"                   TEXT,
  "status"                  TEXT NOT NULL DEFAULT 'prospect',
  "notes"                   TEXT,
  "application_done"        BOOLEAN NOT NULL DEFAULT false,
  "interview_done"          BOOLEAN NOT NULL DEFAULT false,
  "drug_test_passed"        BOOLEAN NOT NULL DEFAULT false,
  "background_check_passed" BOOLEAN NOT NULL DEFAULT false,
  "road_test_passed"        BOOLEAN NOT NULL DEFAULT false,
  "orientation_done"        BOOLEAN NOT NULL DEFAULT false,
  "fedex_id_assigned"       BOOLEAN NOT NULL DEFAULT false,
  "created_at"              TIMESTAMP DEFAULT NOW(),
  "updated_at"              TIMESTAMP DEFAULT NOW()
);
