CREATE TABLE "prompt_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"topic" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"situations" jsonb NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"conversations" integer NOT NULL,
	"lines_min" integer NOT NULL,
	"lines_max" integer NOT NULL,
	"batch_size" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "prompt_templates" ENABLE ROW LEVEL SECURITY;