ALTER TABLE "drivers" ADD COLUMN IF NOT EXISTS "assigned_vehicle_id" integer REFERENCES "vehicles"("id") ON DELETE SET NULL;
