ALTER TABLE "drivers" ADD COLUMN "username" text;
--> statement-breakpoint
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_username_unique" UNIQUE("username");
