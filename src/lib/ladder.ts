import { LadderChallengeStatus, LadderStatus } from "@prisma/client";

export type LadderPlayerRef = {
  id: string;
  position: number;
  active: boolean;
  lastMatchAt: Date | null;
};

export function isValidBestOfThreeSetsScore(challengerSets: number, challengedSets: number): boolean {
  return (
    (challengerSets === 2 && challengedSets === 0) ||
    (challengerSets === 0 && challengedSets === 2) ||
    (challengerSets === 2 && challengedSets === 1) ||
    (challengerSets === 1 && challengedSets === 2)
  );
}

export function isPlayerInCooldown(
  player: Pick<LadderPlayerRef, "lastMatchAt">,
  cooldownDays: number,
  now = new Date(),
): boolean {
  if (!player.lastMatchAt || cooldownDays <= 0) {
    return false;
  }

  const cooldownEndsAt = new Date(player.lastMatchAt);
  cooldownEndsAt.setDate(cooldownEndsAt.getDate() + cooldownDays);
  return now < cooldownEndsAt;
}

export function cooldownEndsAt(
  lastMatchAt: Date | null,
  cooldownDays: number,
): Date | null {
  if (!lastMatchAt || cooldownDays <= 0) {
    return null;
  }

  const endsAt = new Date(lastMatchAt);
  endsAt.setDate(endsAt.getDate() + cooldownDays);
  return endsAt;
}

export function canChallengePosition(
  challengerPosition: number,
  challengedPosition: number,
  challengeRange: number,
): boolean {
  const gap = challengerPosition - challengedPosition;
  return gap >= 1 && gap <= challengeRange;
}

export function getChallengeValidationError(params: {
  ladderStatus: LadderStatus;
  challengeRange: number;
  cooldownDays: number;
  challenger: LadderPlayerRef;
  challenged: LadderPlayerRef;
  openStatuses?: LadderChallengeStatus[];
  challengerHasOpenChallenge: boolean;
  challengedHasOpenChallenge: boolean;
  now?: Date;
}): string | null {
  const {
    ladderStatus,
    challengeRange,
    cooldownDays,
    challenger,
    challenged,
    challengerHasOpenChallenge,
    challengedHasOpenChallenge,
    now = new Date(),
  } = params;

  if (ladderStatus !== LadderStatus.ACTIVE) {
    return "This ladder is not active.";
  }

  if (!challenger.active || !challenged.active) {
    return "Both players must be active on the ladder.";
  }

  if (challenger.id === challenged.id) {
    return "A player cannot challenge themselves.";
  }

  if (!canChallengePosition(challenger.position, challenged.position, challengeRange)) {
    return `You can only challenge a player 1 to ${challengeRange} places above you.`;
  }

  if (isPlayerInCooldown(challenger, cooldownDays, now)) {
    return "The challenger is still in cooldown after a recent match.";
  }

  if (isPlayerInCooldown(challenged, cooldownDays, now)) {
    return "The challenged player is still in cooldown after a recent match.";
  }

  if (challengerHasOpenChallenge || challengedHasOpenChallenge) {
    return "One of the players already has an open challenge.";
  }

  return null;
}

export function shouldSwapPositions(winnerId: string, challengerId: string): boolean {
  return winnerId === challengerId;
}

export function normalizePlayerName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

export function isInactivePlayer(
  player: Pick<LadderPlayerRef, "lastMatchAt" | "active"> & { registeredAt?: Date },
  inactivityDays: number,
  now = new Date(),
): boolean {
  if (!player.active || inactivityDays <= 0) {
    return false;
  }

  const referenceDate = player.lastMatchAt ?? player.registeredAt ?? null;
  if (!referenceDate) {
    return false;
  }

  const inactiveSince = new Date(referenceDate);
  inactiveSince.setDate(inactiveSince.getDate() + inactivityDays);
  return now >= inactiveSince;
}

export const OPEN_CHALLENGE_STATUSES: LadderChallengeStatus[] = [
  LadderChallengeStatus.PENDING,
  LadderChallengeStatus.ACCEPTED,
];
