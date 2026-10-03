ALTER TABLE "conversation_sessions" ADD COLUMN "source" text DEFAULT 'GENERATED' NOT NULL;--> statement-breakpoint
ALTER TABLE "conversation_sessions" ADD COLUMN "title" text;