ALTER TABLE "website_facts" ADD COLUMN "evidence" text;--> statement-breakpoint
ALTER TABLE "website_pages" ADD COLUMN "fetch_mode" text;--> statement-breakpoint
ALTER TABLE "website_pages" ADD COLUMN "last_error" text;