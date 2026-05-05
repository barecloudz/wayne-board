CREATE TABLE "drivers" (
	"id" serial PRIMARY KEY NOT NULL,
	"driver_id" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" text DEFAULT 'driver' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "drivers_driver_id_unique" UNIQUE("driver_id")
);
--> statement-breakpoint
CREATE TABLE "inspection_results" (
	"id" serial PRIMARY KEY NOT NULL,
	"inspection_id" integer NOT NULL,
	"component_id" integer NOT NULL,
	"status" text NOT NULL,
	"date_repaired" text,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "inspections" (
	"id" serial PRIMARY KEY NOT NULL,
	"vehicle_id" integer NOT NULL,
	"inspector_name" text NOT NULL,
	"inspector_id" text NOT NULL,
	"station_name" text NOT NULL,
	"station_number" text NOT NULL,
	"inspection_date" date NOT NULL,
	"out_of_service" boolean DEFAULT false NOT NULL,
	"out_of_service_docs" text,
	"notification_date" date,
	"notified_aobc_name" text,
	"agreed_repair_date" date,
	"status" text DEFAULT 'Draft' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ryde_reviews" (
	"id" serial PRIMARY KEY NOT NULL,
	"driver_id" text NOT NULL,
	"type" text NOT NULL,
	"category" text,
	"content" text NOT NULL,
	"week" text,
	"improvement" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ryde_scores" (
	"id" serial PRIMARY KEY NOT NULL,
	"driver_id" text NOT NULL,
	"score" real NOT NULL,
	"week" text NOT NULL,
	"deliveries" integer DEFAULT 0 NOT NULL,
	"positive_reviews" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "vehicles" (
	"id" serial PRIMARY KEY NOT NULL,
	"unit_number" text NOT NULL,
	"make" text NOT NULL,
	"model" text NOT NULL,
	"year" integer NOT NULL,
	"mileage" integer NOT NULL,
	"vin" text DEFAULT '' NOT NULL,
	"type" text DEFAULT 'van' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "vehicles_unit_number_unique" UNIQUE("unit_number")
);
--> statement-breakpoint
ALTER TABLE "inspection_results" ADD CONSTRAINT "inspection_results_inspection_id_inspections_id_fk" FOREIGN KEY ("inspection_id") REFERENCES "public"."inspections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ryde_reviews" ADD CONSTRAINT "ryde_reviews_driver_id_drivers_driver_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("driver_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ryde_scores" ADD CONSTRAINT "ryde_scores_driver_id_drivers_driver_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("driver_id") ON DELETE no action ON UPDATE no action;