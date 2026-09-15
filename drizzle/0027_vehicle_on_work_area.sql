-- Vehicle assignment moves from drivers → daily_work_area_assignments
-- License plate added to vehicles

ALTER TABLE "daily_work_area_assignments"
  ADD COLUMN IF NOT EXISTS "vehicle_id" integer REFERENCES "vehicles"("id") ON DELETE SET NULL;

ALTER TABLE "vehicles"
  ADD COLUMN IF NOT EXISTS "license_plate" text;

ALTER TABLE "drivers"
  DROP COLUMN IF EXISTS "assigned_vehicle_id";
