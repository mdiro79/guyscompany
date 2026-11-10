CREATE TABLE "posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"author_id" uuid,
	"target_id" uuid,
	"body" text DEFAULT '' NOT NULL,
	"did" text DEFAULT '' NOT NULL,
	"blockers" text DEFAULT '' NOT NULL,
	"badge" text DEFAULT '' NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"day" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "post_kind" CHECK ("posts"."kind" in ('announcement', 'kudos', 'standup'))
);
--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_author_id_profiles_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_target_id_profiles_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "posts_created_idx" ON "posts" USING btree ("created_at");