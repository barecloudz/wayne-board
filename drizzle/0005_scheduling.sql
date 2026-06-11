CREATE TABLE "driver_schedules" (
  "id" serial PRIMARY KEY NOT NULL,
  "driver_id" text NOT NULL UNIQUE REFERENCES "drivers"("driver_id") ON DELETE CASCADE,
  "mon" boolean DEFAULT false NOT NULL,
  "tue" boolean DEFAULT false NOT NULL,
  "wed" boolean DEFAULT false NOT NULL,
  "thu" boolean DEFAULT false NOT NULL,
  "fri" boolean DEFAULT false NOT NULL,
  "sat" boolean DEFAULT false NOT NULL,
  "sun" boolean DEFAULT false NOT NULL,
  "notes" text,
  "updated_at" timestamp DEFAULT now()
);

CREATE TABLE "time_off_entries" (
  "id" serial PRIMARY KEY NOT NULL,
  "driver_id" text NOT NULL REFERENCES "drivers"("driver_id") ON DELETE CASCADE,
  "start_date" date NOT NULL,
  "end_date" date NOT NULL,
  "reason" text DEFAULT '' NOT NULL,
  "note" text,
  "created_at" timestamp DEFAULT now()
);
