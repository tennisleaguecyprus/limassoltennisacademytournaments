-- CreateEnum
CREATE TYPE "LadderStatus" AS ENUM ('ACTIVE', 'PAUSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "LadderChallengeStatus" AS ENUM ('PENDING', 'ACCEPTED', 'COMPLETED', 'DECLINED', 'CANCELLED', 'EXPIRED');

-- CreateTable
CREATE TABLE "Ladder" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "location" TEXT,
    "challengeRange" INTEGER NOT NULL DEFAULT 3,
    "cooldownDays" INTEGER NOT NULL DEFAULT 3,
    "inactivityDays" INTEGER NOT NULL DEFAULT 30,
    "registrationOpen" BOOLEAN NOT NULL DEFAULT true,
    "maxPlayers" INTEGER,
    "status" "LadderStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ladder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LadderPlayer" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "countryCode" VARCHAR(3),
    "position" INTEGER NOT NULL,
    "lastMatchAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ladderId" TEXT NOT NULL,

    CONSTRAINT "LadderPlayer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LadderChallenge" (
    "id" TEXT NOT NULL,
    "ladderId" TEXT NOT NULL,
    "challengerId" TEXT NOT NULL,
    "challengedId" TEXT NOT NULL,
    "status" "LadderChallengeStatus" NOT NULL DEFAULT 'PENDING',
    "scheduledAt" TIMESTAMP(3),
    "court" INTEGER,
    "challengerSets" INTEGER,
    "challengedSets" INTEGER,
    "winnerId" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LadderChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LadderPlayer_ladderId_position_idx" ON "LadderPlayer"("ladderId", "position");

-- CreateIndex
CREATE INDEX "LadderPlayer_ladderId_active_idx" ON "LadderPlayer"("ladderId", "active");

-- CreateIndex
CREATE INDEX "LadderChallenge_ladderId_status_idx" ON "LadderChallenge"("ladderId", "status");

-- AddForeignKey
ALTER TABLE "LadderPlayer" ADD CONSTRAINT "LadderPlayer_ladderId_fkey" FOREIGN KEY ("ladderId") REFERENCES "Ladder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LadderChallenge" ADD CONSTRAINT "LadderChallenge_ladderId_fkey" FOREIGN KEY ("ladderId") REFERENCES "Ladder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LadderChallenge" ADD CONSTRAINT "LadderChallenge_challengerId_fkey" FOREIGN KEY ("challengerId") REFERENCES "LadderPlayer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LadderChallenge" ADD CONSTRAINT "LadderChallenge_challengedId_fkey" FOREIGN KEY ("challengedId") REFERENCES "LadderPlayer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
