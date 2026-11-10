ALTER TABLE "tasks" ADD COLUMN "priority" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "checklist" jsonb DEFAULT '[]'::jsonb NOT NULL;