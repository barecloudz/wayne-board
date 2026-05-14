ALTER TABLE "ryde_reviews" ADD COLUMN "at_fault" boolean DEFAULT false NOT NULL;
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
INSERT INTO "milestone_rewards" ("name", "description", "days_required", "type", "icon", "sort_order") VALUES
  ('Name Badge', 'Driver earns a personalized name badge for their uniform.', 30, 'physical', '🪪', 0),
  ('FedEx Branded Shirt', 'Driver earns an official FedEx branded shirt.', 60, 'physical', '👕', 1),
  ('Safety & Reviews Bonus', 'Contractor pays a performance bonus on the driver''s paycheck for maintaining high Ryde scores.', 90, 'bonus', '💰', 2);
