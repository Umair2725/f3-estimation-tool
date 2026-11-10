-- The default minutes per round for AI estimates is 6, not 60 (specs/estimate-defaults
-- "Default minutes per round"). The row still on the old starting value moves to 6; a value an
-- Admin chose stays. Existing estimates keep their hours.
ALTER TABLE "estimate_defaults" ALTER COLUMN "minutes_per_round" SET DEFAULT 6;
UPDATE "estimate_defaults" SET "minutes_per_round" = 6 WHERE "minutes_per_round" = 60;
