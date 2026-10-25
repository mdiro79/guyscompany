CREATE TABLE "todo_stats" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"xp" integer DEFAULT 0 NOT NULL,
	"counters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "todos" ADD COLUMN "category" text DEFAULT 'personal' NOT NULL;--> statement-breakpoint
ALTER TABLE "todos" ADD COLUMN "xp" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "todo_stats" ADD CONSTRAINT "todo_stats_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "todos" ADD CONSTRAINT "todo_category" CHECK ("todos"."category" in ('personal', 'work', 'learning', 'health'));