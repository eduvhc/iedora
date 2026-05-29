CREATE SCHEMA IF NOT EXISTS "menu";
--> statement-breakpoint
CREATE TABLE "menu"."ai_menu_generation" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "menu"."category" (
	"id" text PRIMARY KEY NOT NULL,
	"menu_id" text NOT NULL,
	"restaurant_id" text NOT NULL,
	"name" text NOT NULL,
	"name_i18n" jsonb,
	"description" text,
	"description_i18n" jsonb,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"translations_synced_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "menu"."daily_view" (
	"tenant_id" text NOT NULL,
	"restaurant_id" text NOT NULL,
	"day" text NOT NULL,
	"language" text NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "daily_view_restaurant_id_day_language_pk" PRIMARY KEY("restaurant_id","day","language")
);
--> statement-breakpoint
CREATE TABLE "menu"."item" (
	"id" text PRIMARY KEY NOT NULL,
	"category_id" text NOT NULL,
	"restaurant_id" text NOT NULL,
	"name" text NOT NULL,
	"name_i18n" jsonb,
	"description" text,
	"description_i18n" jsonb,
	"price_cents" integer NOT NULL,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"image_url" text,
	"position" integer DEFAULT 0 NOT NULL,
	"available" boolean DEFAULT true NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"variants" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"translations_synced_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "menu"."menu" (
	"id" text PRIMARY KEY NOT NULL,
	"restaurant_id" text NOT NULL,
	"name" text NOT NULL,
	"name_i18n" jsonb,
	"description" text,
	"description_i18n" jsonb,
	"position" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "menu"."qr_code" (
	"code" text PRIMARY KEY NOT NULL,
	"restaurant_id" text,
	"label" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"bound_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "menu"."rate_limit_event" (
	"key" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "menu"."restaurant" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"description_i18n" jsonb,
	"logo_url" text,
	"banner_url" text,
	"theme" jsonb,
	"default_language" text DEFAULT 'en' NOT NULL,
	"supported_languages" jsonb DEFAULT '["en"]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "restaurant_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "menu"."view_seen" (
	"visitor_id" text NOT NULL,
	"restaurant_id" text NOT NULL,
	"hour_bucket" text NOT NULL,
	"seen_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "view_seen_visitor_id_restaurant_id_hour_bucket_pk" PRIMARY KEY("visitor_id","restaurant_id","hour_bucket")
);
--> statement-breakpoint
ALTER TABLE "menu"."category" ADD CONSTRAINT "category_menu_id_menu_id_fk" FOREIGN KEY ("menu_id") REFERENCES "menu"."menu"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu"."category" ADD CONSTRAINT "category_restaurant_id_restaurant_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "menu"."restaurant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu"."daily_view" ADD CONSTRAINT "daily_view_restaurant_id_restaurant_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "menu"."restaurant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu"."item" ADD CONSTRAINT "item_category_id_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "menu"."category"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu"."item" ADD CONSTRAINT "item_restaurant_id_restaurant_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "menu"."restaurant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu"."menu" ADD CONSTRAINT "menu_restaurant_id_restaurant_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "menu"."restaurant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu"."qr_code" ADD CONSTRAINT "qr_code_restaurant_id_restaurant_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "menu"."restaurant"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu"."view_seen" ADD CONSTRAINT "view_seen_restaurant_id_restaurant_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "menu"."restaurant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_menu_generation_tenant_time_idx" ON "menu"."ai_menu_generation" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "category_menu_idx" ON "menu"."category" USING btree ("menu_id");--> statement-breakpoint
CREATE INDEX "category_restaurant_idx" ON "menu"."category" USING btree ("restaurant_id");--> statement-breakpoint
CREATE INDEX "daily_view_tenant_day_idx" ON "menu"."daily_view" USING btree ("tenant_id","day");--> statement-breakpoint
CREATE INDEX "item_category_idx" ON "menu"."item" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "item_restaurant_idx" ON "menu"."item" USING btree ("restaurant_id");--> statement-breakpoint
CREATE INDEX "menu_restaurant_idx" ON "menu"."menu" USING btree ("restaurant_id");--> statement-breakpoint
CREATE INDEX "qr_code_restaurant_idx" ON "menu"."qr_code" USING btree ("restaurant_id");--> statement-breakpoint
CREATE INDEX "rate_limit_event_key_time_idx" ON "menu"."rate_limit_event" USING btree ("key","occurred_at");--> statement-breakpoint
CREATE INDEX "restaurant_tenant_idx" ON "menu"."restaurant" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "view_seen_seen_at_idx" ON "menu"."view_seen" USING btree ("seen_at");