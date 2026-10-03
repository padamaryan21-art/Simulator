ALTER TABLE "schedules" ADD COLUMN "weekly_pattern" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "schedules" ADD COLUMN "date_overrides" jsonb DEFAULT '{}'::jsonb NOT NULL;