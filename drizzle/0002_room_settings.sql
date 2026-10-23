CREATE TABLE "rooms" (
	"id" text PRIMARY KEY NOT NULL,
	"light" smallint DEFAULT 100 NOT NULL,
	"warmth" smallint DEFAULT 40 NOT NULL,
	"frost" smallint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "room_ranges" CHECK ("rooms"."light" between 0 and 100 and "rooms"."warmth" between 0 and 100 and "rooms"."frost" between 0 and 100)
);
