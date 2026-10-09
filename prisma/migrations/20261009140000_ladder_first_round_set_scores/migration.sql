-- AlterTable
ALTER TABLE "LadderChallenge" ADD COLUMN "isFirstRound" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "LadderChallenge" ADD COLUMN "set1ChallengerGames" INTEGER;
ALTER TABLE "LadderChallenge" ADD COLUMN "set1ChallengedGames" INTEGER;
ALTER TABLE "LadderChallenge" ADD COLUMN "set2ChallengerGames" INTEGER;
ALTER TABLE "LadderChallenge" ADD COLUMN "set2ChallengedGames" INTEGER;
ALTER TABLE "LadderChallenge" ADD COLUMN "set3ChallengerGames" INTEGER;
ALTER TABLE "LadderChallenge" ADD COLUMN "set3ChallengedGames" INTEGER;

-- CreateIndex
CREATE INDEX "LadderChallenge_ladderId_isFirstRound_idx" ON "LadderChallenge"("ladderId", "isFirstRound");
