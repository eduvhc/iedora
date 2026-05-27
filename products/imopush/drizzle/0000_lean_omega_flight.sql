CREATE SCHEMA "imopush";
--> statement-breakpoint
CREATE TABLE "imopush"."integrator_status" (
	"property_reference" text NOT NULL,
	"integrator_key" text NOT NULL,
	"state" text DEFAULT 'idle' NOT NULL,
	"published_at" timestamp with time zone,
	"published_url" text,
	"last_error" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "integrator_status_property_reference_integrator_key_pk" PRIMARY KEY("property_reference","integrator_key")
);
--> statement-breakpoint
CREATE TABLE "imopush"."property" (
	"reference" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"operation" text NOT NULL,
	"rent_duration" text,
	"occupancy" text,
	"price_cents" integer NOT NULL,
	"community_fee_cents" integer,
	"size_sqm" integer,
	"rooms" integer,
	"bathrooms" integer,
	"description" text,
	"source_url" text,
	"photo_urls" text[] DEFAULT '{}' NOT NULL,
	"address" jsonb NOT NULL,
	"contact" jsonb NOT NULL,
	"features" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "imopush"."integrator_status" ADD CONSTRAINT "integrator_status_property_reference_property_reference_fk" FOREIGN KEY ("property_reference") REFERENCES "imopush"."property"("reference") ON DELETE cascade ON UPDATE no action;