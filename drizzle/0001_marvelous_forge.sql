CREATE TABLE "attendance_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"driver_id" text NOT NULL,
	"driver_name" text NOT NULL,
	"date" date NOT NULL,
	"status" text NOT NULL,
	"note" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "badgeTypes" (
	"id" serial PRIMARY KEY NOT NULL,
	"organizationId" integer NOT NULL,
	"rank" integer,
	"name" text NOT NULL,
	"iconUrl" text,
	"shine" boolean DEFAULT false NOT NULL,
	"category" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_work_area_assignments" (
	"id" serial PRIMARY KEY NOT NULL,
	"driver_id" text NOT NULL,
	"date" date NOT NULL,
	"work_area_id" integer NOT NULL,
	"vehicle_id" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "driverBadges" (
	"id" serial PRIMARY KEY NOT NULL,
	"organizationId" integer NOT NULL,
	"driverId" text NOT NULL,
	"badgeTypeId" integer NOT NULL,
	"weekStart" date NOT NULL,
	"awardedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "driver_locations" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"driver_id" text NOT NULL,
	"location_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "driver_milestone_claims" (
	"id" serial PRIMARY KEY NOT NULL,
	"driver_id" text NOT NULL,
	"milestone_id" integer NOT NULL,
	"earned_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "driver_schedules" (
	"id" serial PRIMARY KEY NOT NULL,
	"driver_id" text NOT NULL,
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
--> statement-breakpoint
CREATE TABLE "dro_anchor_areas" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"anchor_area_id" double precision NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"shape_json" text DEFAULT '{}' NOT NULL,
	"enabled_route_plans" text DEFAULT '[]' NOT NULL,
	"wkt_poly" text,
	"vehicle_id" integer,
	"hex_code" text,
	"synced_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "dro_daily_totals" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"date" date NOT NULL,
	"routes" integer DEFAULT 0 NOT NULL,
	"total_stops" integer DEFAULT 0 NOT NULL,
	"total_packages" integer DEFAULT 0 NOT NULL,
	"total_distance" real DEFAULT 0 NOT NULL,
	"synced_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "dro_route_plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"plan_id" integer NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"total_routes" integer DEFAULT 0 NOT NULL,
	"lp_routes" integer DEFAULT 0 NOT NULL,
	"bulk_routes" integer DEFAULT 0 NOT NULL,
	"reg_routes" integer DEFAULT 0 NOT NULL,
	"small_routes" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"last_used_date" text DEFAULT '' NOT NULL,
	"synced_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "dro_routes" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"work_area_name" text NOT NULL,
	"work_area_number" text NOT NULL,
	"route_type" text DEFAULT '' NOT NULL,
	"stops" integer DEFAULT 0 NOT NULL,
	"packages" integer DEFAULT 0 NOT NULL,
	"distance" real DEFAULT 0 NOT NULL,
	"time_hours" real DEFAULT 0 NOT NULL,
	"cube" real DEFAULT 0 NOT NULL,
	"vehicle_capacity" text DEFAULT '' NOT NULL,
	"sort_date" date NOT NULL,
	"lp_stops" integer DEFAULT 0 NOT NULL,
	"lp_packages" integer DEFAULT 0 NOT NULL,
	"sm_stops" integer DEFAULT 0 NOT NULL,
	"sm_packages" integer DEFAULT 0 NOT NULL,
	"bulk_stops" integer DEFAULT 0 NOT NULL,
	"bulk_packages" integer DEFAULT 0 NOT NULL,
	"reg_stops" integer DEFAULT 0 NOT NULL,
	"reg_packages" integer DEFAULT 0 NOT NULL,
	"exceeded_target_duration" boolean DEFAULT false NOT NULL,
	"time_critical_stops" integer DEFAULT 0 NOT NULL,
	"synced_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "dro_stop_overrides" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"override_id" text NOT NULL,
	"stop_id" text DEFAULT '' NOT NULL,
	"recipient_name" text DEFAULT '' NOT NULL,
	"address" text DEFAULT '' NOT NULL,
	"postal_code" text DEFAULT '' NOT NULL,
	"type" text DEFAULT '' NOT NULL,
	"value" text DEFAULT '' NOT NULL,
	"window_open" text DEFAULT '' NOT NULL,
	"window_close" text DEFAULT '' NOT NULL,
	"work_area_num" text DEFAULT '' NOT NULL,
	"route_plan_ids" json,
	"synced_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "dro_stops" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"waypoint_id" text NOT NULL,
	"stop_id" text NOT NULL,
	"firm_name" text DEFAULT '' NOT NULL,
	"address" text DEFAULT '' NOT NULL,
	"city" text DEFAULT '' NOT NULL,
	"state" text DEFAULT '' NOT NULL,
	"postal_code" text DEFAULT '' NOT NULL,
	"actual_route" text DEFAULT '' NOT NULL,
	"actual_sequence" integer,
	"arrival_time" text DEFAULT '' NOT NULL,
	"stop_class" text DEFAULT '' NOT NULL,
	"no_packages" integer DEFAULT 0 NOT NULL,
	"total_weight" real DEFAULT 0 NOT NULL,
	"total_cube" real DEFAULT 0 NOT NULL,
	"is_lp_package" boolean DEFAULT false NOT NULL,
	"is_bulk_stop" boolean DEFAULT false NOT NULL,
	"work_area_number" text DEFAULT '' NOT NULL,
	"lat" double precision,
	"lng" double precision,
	"sort_date" date NOT NULL,
	"wid" bigint,
	"optimal_route" text DEFAULT '' NOT NULL,
	"optimal_sequence" integer,
	"window_open" text DEFAULT '' NOT NULL,
	"window_close" text DEFAULT '' NOT NULL,
	"is_small_stop" boolean DEFAULT false NOT NULL,
	"is_cdo_stop" boolean DEFAULT false NOT NULL,
	"is_hazardous" boolean DEFAULT false NOT NULL,
	"is_heavyweight" boolean DEFAULT false NOT NULL,
	"tracking_ids" json,
	"actual_assignment_type" text DEFAULT '' NOT NULL,
	"pickup_type" text DEFAULT '' NOT NULL,
	"reason_code" text DEFAULT '' NOT NULL,
	"overflowed_route" text DEFAULT '' NOT NULL,
	"num_lp_packages" integer DEFAULT 0 NOT NULL,
	"synced_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "dsw_name_mappings" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"dsw_name" text NOT NULL,
	"driver_id" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "dsw_route_days" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"date" date NOT NULL,
	"driver_id" text,
	"driver_name_raw" text DEFAULT '' NOT NULL,
	"wa_name" text DEFAULT '' NOT NULL,
	"wa_number" text DEFAULT '' NOT NULL,
	"ils_pct" real,
	"act_del_stps" integer,
	"act_del_pkgs" integer,
	"non_delvd_stps" integer,
	"dna" integer,
	"code_85" integer,
	"ils_impact_pkgs" integer,
	"all_status_code_pkgs" integer,
	"miles" integer,
	"on_road_hours" text,
	"on_duty_hours" text,
	"vscan_pkgs" integer,
	"del_stps_planned" integer,
	"code_breakdown" text,
	"pld_impact_pkgs" integer,
	"pld_ghost_pkgs" integer,
	"location_id" integer,
	"synced_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "gate_code_reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"gate_code_id" integer NOT NULL,
	"driver_id" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "gate_codes" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"location" text NOT NULL,
	"road_name" text,
	"code" text NOT NULL,
	"added_by" text NOT NULL,
	"added_by_name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "gc_name_mappings" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"gc_name" text NOT NULL,
	"driver_id" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "gc_route_days" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"gc_route_day_id" integer NOT NULL,
	"driver_id" text,
	"driver_name" text DEFAULT '' NOT NULL,
	"route_name" text DEFAULT '' NOT NULL,
	"date" date NOT NULL,
	"stops_per_hour" real,
	"miles_total" real,
	"miles_traveled" real,
	"drive_time" integer,
	"status" text DEFAULT '' NOT NULL,
	"location_id" integer,
	"synced_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "locations" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"name" text NOT NULL,
	"terminal_id" text,
	"gc_terminal_id" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "maintenance_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"driver_id" text NOT NULL,
	"driver_name" text NOT NULL,
	"truck_number" text NOT NULL,
	"description" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"admin_note" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "milestone_rewards" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"days_required" integer NOT NULL,
	"type" text DEFAULT 'physical' NOT NULL,
	"bonus_amount" real,
	"icon" text DEFAULT '🏅' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"plan" text DEFAULT 'starter' NOT NULL,
	"subscription_status" text DEFAULT 'trialing' NOT NULL,
	"logo_url" text,
	"accent_color" text,
	"og_image_url" text,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"trial_ends_at" timestamp,
	"demo_mode" boolean DEFAULT false NOT NULL,
	"demo_expires_at" timestamp,
	"email" text,
	"super_admin_note" text,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "organizations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "platform_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prospects" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"email" text,
	"status" text DEFAULT 'prospect' NOT NULL,
	"notes" text,
	"application_done" text DEFAULT 'pending' NOT NULL,
	"interview_done" text DEFAULT 'pending' NOT NULL,
	"drug_test_passed" text DEFAULT 'pending' NOT NULL,
	"background_check_passed" text DEFAULT 'pending' NOT NULL,
	"road_test_passed" text DEFAULT 'pending' NOT NULL,
	"orientation_done" text DEFAULT 'pending' NOT NULL,
	"fedex_id_assigned" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "schedule_overrides" (
	"id" serial PRIMARY KEY NOT NULL,
	"driver_id" text NOT NULL,
	"date" date NOT NULL,
	"note" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"key" text NOT NULL,
	"value" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_completions" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"task_id" integer NOT NULL,
	"completed_by_id" text NOT NULL,
	"completed_by_name" text NOT NULL,
	"date" date NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "task_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"days_of_week" text DEFAULT '1,2,3,4,5,6,0' NOT NULL,
	"due_time" text DEFAULT '17:00' NOT NULL,
	"assigned_roles" text DEFAULT 'bc,co_owner,owner' NOT NULL,
	"created_by_role" text DEFAULT 'owner' NOT NULL,
	"created_by_id" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "time_off_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"driver_id" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"note" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "trainee_work_days" (
	"id" serial PRIMARY KEY NOT NULL,
	"driver_id" text NOT NULL,
	"date" date NOT NULL,
	"week_start" date NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "user_locations" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"location_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "user_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"driver_id" text NOT NULL,
	"key" text NOT NULL,
	"value" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vehicle_conditions" (
	"id" serial PRIMARY KEY NOT NULL,
	"vehicle_id" integer NOT NULL,
	"description" text NOT NULL,
	"severity" text DEFAULT 'medium' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"repair_estimate" real,
	"route_status" text DEFAULT 'confirm' NOT NULL,
	"note" text,
	"reported_at" timestamp DEFAULT now(),
	"resolved_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "vehicle_maintenance_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"vehicle_id" integer,
	"truck_number" text NOT NULL,
	"service_date" date NOT NULL,
	"type" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"mileage" integer,
	"cost" real,
	"vendor" text,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "work_areas" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"name" text NOT NULL,
	"shape" text DEFAULT 'circle' NOT NULL,
	"color" text DEFAULT '#6366f1' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "drivers" DROP CONSTRAINT "drivers_driver_id_unique";--> statement-breakpoint
ALTER TABLE "vehicles" DROP CONSTRAINT "vehicles_unit_number_unique";--> statement-breakpoint
ALTER TABLE "ryde_reviews" DROP CONSTRAINT "ryde_reviews_driver_id_drivers_driver_id_fk";
--> statement-breakpoint
ALTER TABLE "ryde_scores" DROP CONSTRAINT "ryde_scores_driver_id_drivers_driver_id_fk";
--> statement-breakpoint
ALTER TABLE "drivers" ADD COLUMN "organization_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "drivers" ADD COLUMN "username" text;--> statement-breakpoint
ALTER TABLE "drivers" ADD COLUMN "is_admin" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "drivers" ADD COLUMN "avatar_url" text;--> statement-breakpoint
ALTER TABLE "drivers" ADD COLUMN "work_area" text;--> statement-breakpoint
ALTER TABLE "drivers" ADD COLUMN "default_work_area_id" integer;--> statement-breakpoint
ALTER TABLE "drivers" ADD COLUMN "location_id" integer;--> statement-breakpoint
ALTER TABLE "drivers" ADD COLUMN "all_locations" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "drivers" ADD COLUMN "login_disabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "drivers" ADD COLUMN "is_trainee" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "drivers" ADD COLUMN "notice_date" date;--> statement-breakpoint
ALTER TABLE "drivers" ADD COLUMN "last_day" date;--> statement-breakpoint
ALTER TABLE "drivers" ADD COLUMN "first_login_at" timestamp;--> statement-breakpoint
ALTER TABLE "drivers" ADD COLUMN "termination_type" text;--> statement-breakpoint
ALTER TABLE "drivers" ADD COLUMN "termination_note" text;--> statement-breakpoint
ALTER TABLE "drivers" ADD COLUMN "terminated_at" timestamp;--> statement-breakpoint
ALTER TABLE "inspection_results" ADD COLUMN "repair_instructions" text;--> statement-breakpoint
ALTER TABLE "inspection_results" ADD COLUMN "repair_cost" real;--> statement-breakpoint
ALTER TABLE "inspections" ADD COLUMN "organization_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "ryde_reviews" ADD COLUMN "organization_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "ryde_reviews" ADD COLUMN "stars" integer;--> statement-breakpoint
ALTER TABLE "ryde_reviews" ADD COLUMN "at_fault" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "ryde_reviews" ADD COLUMN "customer_initials" text;--> statement-breakpoint
ALTER TABLE "ryde_reviews" ADD COLUMN "source" text;--> statement-breakpoint
ALTER TABLE "ryde_reviews" ADD COLUMN "track_id" text;--> statement-breakpoint
ALTER TABLE "ryde_scores" ADD COLUMN "organization_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN "organization_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN "ownership" text DEFAULT 'owned' NOT NULL;--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN "mmr_due" date;--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN "federal_inspection_due" date;--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN "registration_expiry" date;--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN "license_plate" text;--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN "location_id" integer;--> statement-breakpoint
ALTER TABLE "attendance_log" ADD CONSTRAINT "attendance_log_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "badgeTypes" ADD CONSTRAINT "badgeTypes_organizationId_organizations_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_work_area_assignments" ADD CONSTRAINT "daily_work_area_assignments_work_area_id_work_areas_id_fk" FOREIGN KEY ("work_area_id") REFERENCES "public"."work_areas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_work_area_assignments" ADD CONSTRAINT "daily_work_area_assignments_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driverBadges" ADD CONSTRAINT "driverBadges_organizationId_organizations_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driverBadges" ADD CONSTRAINT "driverBadges_driverId_drivers_driver_id_fk" FOREIGN KEY ("driverId") REFERENCES "public"."drivers"("driver_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driverBadges" ADD CONSTRAINT "driverBadges_badgeTypeId_badgeTypes_id_fk" FOREIGN KEY ("badgeTypeId") REFERENCES "public"."badgeTypes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_locations" ADD CONSTRAINT "driver_locations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_locations" ADD CONSTRAINT "driver_locations_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_milestone_claims" ADD CONSTRAINT "driver_milestone_claims_milestone_id_milestone_rewards_id_fk" FOREIGN KEY ("milestone_id") REFERENCES "public"."milestone_rewards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dro_anchor_areas" ADD CONSTRAINT "dro_anchor_areas_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dro_daily_totals" ADD CONSTRAINT "dro_daily_totals_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dro_route_plans" ADD CONSTRAINT "dro_route_plans_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dro_routes" ADD CONSTRAINT "dro_routes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dro_stop_overrides" ADD CONSTRAINT "dro_stop_overrides_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dro_stops" ADD CONSTRAINT "dro_stops_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dsw_name_mappings" ADD CONSTRAINT "dsw_name_mappings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dsw_route_days" ADD CONSTRAINT "dsw_route_days_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dsw_route_days" ADD CONSTRAINT "dsw_route_days_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gate_code_reports" ADD CONSTRAINT "gate_code_reports_gate_code_id_gate_codes_id_fk" FOREIGN KEY ("gate_code_id") REFERENCES "public"."gate_codes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gate_codes" ADD CONSTRAINT "gate_codes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gc_name_mappings" ADD CONSTRAINT "gc_name_mappings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gc_route_days" ADD CONSTRAINT "gc_route_days_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gc_route_days" ADD CONSTRAINT "gc_route_days_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_requests" ADD CONSTRAINT "maintenance_requests_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospects" ADD CONSTRAINT "prospects_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_completions" ADD CONSTRAINT "task_completions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_completions" ADD CONSTRAINT "task_completions_task_id_task_templates_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."task_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_templates" ADD CONSTRAINT "task_templates_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_locations" ADD CONSTRAINT "user_locations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_locations" ADD CONSTRAINT "user_locations_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_conditions" ADD CONSTRAINT "vehicle_conditions_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_maintenance_records" ADD CONSTRAINT "vehicle_maintenance_records_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_maintenance_records" ADD CONSTRAINT "vehicle_maintenance_records_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_areas" ADD CONSTRAINT "work_areas_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_log_org_driver_date_unique" ON "attendance_log" USING btree ("organization_id","driver_id","date");--> statement-breakpoint
CREATE INDEX "attendance_log_org_driver_date_idx" ON "attendance_log" USING btree ("organization_id","driver_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "badgeTypes_orgId_rank_uniq" ON "badgeTypes" USING btree ("organizationId","rank") WHERE "badgeTypes"."rank" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "driverBadges_org_badgeType_week_uniq" ON "driverBadges" USING btree ("organizationId","badgeTypeId","weekStart");--> statement-breakpoint
CREATE UNIQUE INDEX "driver_locations_driver_location_unique" ON "driver_locations" USING btree ("organization_id","driver_id","location_id");--> statement-breakpoint
CREATE INDEX "driver_locations_org_driver_idx" ON "driver_locations" USING btree ("organization_id","driver_id");--> statement-breakpoint
CREATE UNIQUE INDEX "dro_anchor_areas_org_anchor_unique" ON "dro_anchor_areas" USING btree ("organization_id","anchor_area_id");--> statement-breakpoint
CREATE UNIQUE INDEX "dro_daily_totals_org_date_unique" ON "dro_daily_totals" USING btree ("organization_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "dro_route_plans_org_plan_unique" ON "dro_route_plans" USING btree ("organization_id","plan_id");--> statement-breakpoint
CREATE UNIQUE INDEX "dro_stop_overrides_org_override_unique" ON "dro_stop_overrides" USING btree ("organization_id","override_id");--> statement-breakpoint
CREATE UNIQUE INDEX "dsw_name_mappings_org_name_unique" ON "dsw_name_mappings" USING btree ("organization_id","dsw_name");--> statement-breakpoint
CREATE INDEX "dsw_route_days_org_date_idx" ON "dsw_route_days" USING btree ("organization_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "gc_name_mappings_org_name_unique" ON "gc_name_mappings" USING btree ("organization_id","gc_name");--> statement-breakpoint
CREATE UNIQUE INDEX "gc_route_days_org_gc_day_unique" ON "gc_route_days" USING btree ("organization_id","gc_route_day_id");--> statement-breakpoint
CREATE UNIQUE INDEX "settings_org_key_unique" ON "settings" USING btree ("organization_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "task_completions_org_task_date_user_unique" ON "task_completions" USING btree ("organization_id","task_id","date","completed_by_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_locations_user_location_unique" ON "user_locations" USING btree ("user_id","location_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_settings_driver_key_unique" ON "user_settings" USING btree ("driver_id","key");--> statement-breakpoint
CREATE INDEX "vehicle_conditions_org_vehicle_idx" ON "vehicle_conditions" USING btree ("vehicle_id");--> statement-breakpoint
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_default_work_area_id_work_areas_id_fk" FOREIGN KEY ("default_work_area_id") REFERENCES "public"."work_areas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ryde_reviews" ADD CONSTRAINT "ryde_reviews_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ryde_scores" ADD CONSTRAINT "ryde_scores_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "drivers_org_driver_unique" ON "drivers" USING btree ("organization_id","driver_id");--> statement-breakpoint
CREATE UNIQUE INDEX "drivers_org_username_unique" ON "drivers" USING btree ("organization_id","username");--> statement-breakpoint
CREATE INDEX "inspections_org_vehicle_idx" ON "inspections" USING btree ("organization_id","vehicle_id");--> statement-breakpoint
CREATE INDEX "ryde_scores_org_week_idx" ON "ryde_scores" USING btree ("organization_id","week");--> statement-breakpoint
CREATE UNIQUE INDEX "vehicles_org_unit_unique" ON "vehicles" USING btree ("organization_id","unit_number");