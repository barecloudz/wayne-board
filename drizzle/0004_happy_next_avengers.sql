CREATE TABLE "driver_notes" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"driver_db_id" integer NOT NULL,
	"content" text NOT NULL,
	"author_name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gc_vehicle_mileage" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"date" date NOT NULL,
	"gc_vehicle_id" integer,
	"vehicle_name" text,
	"vehicle_id" integer,
	"unit_number" text,
	"odometer" integer,
	"is_anomaly" boolean DEFAULT false NOT NULL,
	"anomaly_reason" text,
	"pulled_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ppod_days" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"date" date NOT NULL,
	"driver_id" text,
	"driver_name_raw" text DEFAULT '' NOT NULL,
	"ppod_pct" real,
	"total_pkgs" integer,
	"pod_captured" integer,
	"photo_total" integer,
	"photo_no_pkg_pct" real,
	"photo_sensitive_pct" real,
	"photo_other_pct" real,
	"loc_total" integer,
	"loc_good_pct" real,
	"loc_poor_pct" real,
	"loc_over_mile_pct" real,
	"loc_total_applied" integer,
	"dtc_pct" real,
	"location_id" integer,
	"synced_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ppod_name_mappings" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"ppod_name" text NOT NULL,
	"driver_id" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "driver_schedules" ADD COLUMN "alt_sat" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "driver_schedules" ADD COLUMN "alt_sat_start" date;--> statement-breakpoint
ALTER TABLE "ryde_reviews" ADD COLUMN "review_date" text;--> statement-breakpoint
ALTER TABLE "driver_notes" ADD CONSTRAINT "driver_notes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_notes" ADD CONSTRAINT "driver_notes_driver_db_id_drivers_id_fk" FOREIGN KEY ("driver_db_id") REFERENCES "public"."drivers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gc_vehicle_mileage" ADD CONSTRAINT "gc_vehicle_mileage_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gc_vehicle_mileage" ADD CONSTRAINT "gc_vehicle_mileage_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ppod_days" ADD CONSTRAINT "ppod_days_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ppod_days" ADD CONSTRAINT "ppod_days_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ppod_name_mappings" ADD CONSTRAINT "ppod_name_mappings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "driver_notes_driver_idx" ON "driver_notes" USING btree ("driver_db_id");--> statement-breakpoint
CREATE UNIQUE INDEX "gc_vehicle_mileage_org_date_vehicle_unique" ON "gc_vehicle_mileage" USING btree ("organization_id","date","vehicle_name");--> statement-breakpoint
CREATE INDEX "gc_vehicle_mileage_org_date_idx" ON "gc_vehicle_mileage" USING btree ("organization_id","date");--> statement-breakpoint
CREATE INDEX "ppod_days_org_date_idx" ON "ppod_days" USING btree ("organization_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "ppod_days_org_date_name_unique" ON "ppod_days" USING btree ("organization_id","date","driver_name_raw");--> statement-breakpoint
CREATE UNIQUE INDEX "ppod_name_mappings_org_name_unique" ON "ppod_name_mappings" USING btree ("organization_id","ppod_name");--> statement-breakpoint
CREATE INDEX "badge_types_org_idx" ON "badgeTypes" USING btree ("organizationId");--> statement-breakpoint
CREATE INDEX "driver_badges_org_driver_idx" ON "driverBadges" USING btree ("organizationId","driverId");--> statement-breakpoint
CREATE INDEX "driver_milestone_claims_driver_idx" ON "driver_milestone_claims" USING btree ("driver_id");--> statement-breakpoint
CREATE INDEX "driver_schedules_driver_idx" ON "driver_schedules" USING btree ("driver_id");--> statement-breakpoint
CREATE INDEX "dro_routes_org_date_idx" ON "dro_routes" USING btree ("organization_id","sort_date");--> statement-breakpoint
CREATE INDEX "dro_stops_org_date_idx" ON "dro_stops" USING btree ("organization_id","sort_date");--> statement-breakpoint
CREATE INDEX "gate_codes_org_idx" ON "gate_codes" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "gc_route_days_org_date_idx" ON "gc_route_days" USING btree ("organization_id","date");--> statement-breakpoint
CREATE INDEX "gc_route_days_org_driver_idx" ON "gc_route_days" USING btree ("organization_id","driver_id");--> statement-breakpoint
CREATE INDEX "maintenance_requests_org_idx" ON "maintenance_requests" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "maintenance_requests_org_status_idx" ON "maintenance_requests" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "ryde_reviews_org_driver_idx" ON "ryde_reviews" USING btree ("organization_id","driver_id");--> statement-breakpoint
CREATE INDEX "task_completions_org_date_idx" ON "task_completions" USING btree ("organization_id","date");--> statement-breakpoint
CREATE INDEX "time_off_entries_driver_idx" ON "time_off_entries" USING btree ("driver_id");--> statement-breakpoint
CREATE INDEX "vehicle_maintenance_records_org_idx" ON "vehicle_maintenance_records" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "vehicle_maintenance_records_org_date_idx" ON "vehicle_maintenance_records" USING btree ("organization_id","service_date");--> statement-breakpoint
CREATE INDEX "vehicles_org_location_idx" ON "vehicles" USING btree ("organization_id","location_id");--> statement-breakpoint
CREATE INDEX "work_areas_org_idx" ON "work_areas" USING btree ("organization_id");