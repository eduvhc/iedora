ALTER TABLE "menu"."restaurant" ADD COLUMN IF NOT EXISTS "onboarding_completed_at" timestamp;
--> statement-breakpoint
-- Backfill is idempotent by definition: the WHERE clause skips rows
-- that already carry a value, so re-running after a partial / retried
-- apply leaves prior completions intact. Existing restaurants predate
-- the onboarding-resume gate; treat created_at as the completion
-- timestamp so they don't bounce their owners into the wizard on the
-- next visit to /menu/onboarding.
UPDATE "menu"."restaurant"
SET "onboarding_completed_at" = "created_at"
WHERE "onboarding_completed_at" IS NULL;
