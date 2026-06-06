ALTER TABLE "Workout" ADD COLUMN "finishedAt" DATETIME;
UPDATE "Workout" SET "finishedAt" = "date" WHERE "duration" IS NOT NULL;
