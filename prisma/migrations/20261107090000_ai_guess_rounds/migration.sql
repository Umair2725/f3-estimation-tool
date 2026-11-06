-- AI guess sized in rounds (specs/feature-matching "Minutes per round for an AI guess",
-- specs/estimate-defaults "Default minutes per round"). Additive; existing guesses keep their hours.
ALTER TABLE "estimate_defaults" ADD COLUMN "minutes_per_round" INTEGER NOT NULL DEFAULT 60;
ALTER TABLE "task_suggestion" ADD COLUMN "minutes_per_round" INTEGER;
ALTER TABLE "task_suggestion" ADD COLUMN "guess_risks" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
