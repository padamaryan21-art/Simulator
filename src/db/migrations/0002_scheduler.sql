CREATE TABLE "scheduled_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"schedule_id" uuid NOT NULL,
	"run_date" text NOT NULL,
	"run_at" timestamp with time zone NOT NULL,
	"planned_messages" integer NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"session_id" uuid,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scheduled_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "conversation_sessions" ADD COLUMN "schedule_id" uuid;--> statement-breakpoint
ALTER TABLE "schedules" ADD COLUMN "messages_per_account_per_day" integer DEFAULT 400 NOT NULL;--> statement-breakpoint
ALTER TABLE "schedules" ADD COLUMN "min_gap_per_account_sec" integer DEFAULT 20 NOT NULL;--> statement-breakpoint
ALTER TABLE "scheduled_runs" ADD CONSTRAINT "scheduled_runs_schedule_id_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."schedules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "scheduled_runs_status_run_at_idx" ON "scheduled_runs" USING btree ("status","run_at");