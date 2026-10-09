-- CreateEnum
CREATE TYPE "LadderLevel" AS ENUM ('BEGINNER', 'BEGINNER_INTERMEDIATE', 'INTERMEDIATE', 'ADVANCED');

-- AlterTable: add level with a temporary default for existing rows, then drop default
ALTER TABLE "Ladder" ADD COLUMN "level" "LadderLevel" NOT NULL DEFAULT 'BEGINNER';
ALTER TABLE "Ladder" ALTER COLUMN "level" DROP DEFAULT;

-- AlterTable: add phone for existing players
ALTER TABLE "LadderPlayer" ADD COLUMN "phone" TEXT NOT NULL DEFAULT '';
ALTER TABLE "LadderPlayer" ALTER COLUMN "phone" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "Ladder_level_status_idx" ON "Ladder"("level", "status");
