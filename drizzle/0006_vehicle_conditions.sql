CREATE TABLE IF NOT EXISTS "vehicle_conditions" (
  "id" serial PRIMARY KEY NOT NULL,
  "vehicle_id" integer NOT NULL REFERENCES "vehicles"("id") ON DELETE CASCADE,
  "description" text NOT NULL,
  "severity" text DEFAULT 'medium' NOT NULL,
  "status" text DEFAULT 'open' NOT NULL,
  "repair_estimate" real,
  "route_status" text DEFAULT 'confirm' NOT NULL,
  "note" text,
  "reported_at" timestamp DEFAULT now(),
  "resolved_at" timestamp
);
