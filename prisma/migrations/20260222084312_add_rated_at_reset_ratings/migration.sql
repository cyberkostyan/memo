-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "ratedAt" TIMESTAMP(3);

-- Reset all existing user-set ratings (semantic change: user subjective → AI health score)
UPDATE "Event" SET "rating" = NULL WHERE "rating" IS NOT NULL;
