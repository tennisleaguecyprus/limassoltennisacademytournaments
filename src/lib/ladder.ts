import { LadderChallengeStatus, LadderLevel, LadderStatus } from "@prisma/client";

export const LADDER_LEVEL_OPTIONS: { value: LadderLevel; label: string }[] = [
  { value: LadderLevel.BEGINNER, label: "Beginner" },
  { value: LadderLevel.BEGINNER_INTERMEDIATE, label: "Beginner / Intermediate" },
  { value: LadderLevel.INTERMEDIATE, label: "Intermediate" },
  { value: LadderLevel.ADVANCED, label: "Advanced" },
];

export function parseLadderLevel(raw: string): LadderLevel | null {
  if (raw === LadderLevel.BEGINNER) return LadderLevel.BEGINNER;
  if (raw === LadderLevel.BEGINNER_INTERMEDIATE) return LadderLevel.BEGINNER_INTERMEDIATE;
  if (raw === LadderLevel.INTERMEDIATE) return LadderLevel.INTERMEDIATE;
  if (raw === LadderLevel.ADVANCED) return LadderLevel.ADVANCED;
  return null;
}

export function formatLadderLevelLabel(level: LadderLevel): string {
  return LADDER_LEVEL_OPTIONS.find((option) => option.value === level)?.label ?? level;
}

export function normalizePhone(phone: string): string {
  return phone.trim().replace(/\s+/g, " ");
}

export function isValidPhone(phone: string): boolean {
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 8 && digits.length <= 15;
}

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

export type SetGames = {
  challengerGames: number;
  challengedGames: number;
};

export type MatchSetScores = {
  set1: SetGames;
  set2: SetGames;
  set3?: SetGames | null;
};

export type FirstRoundStandingInput = {
  playerId: string;
  fullName: string;
  won: boolean;
  setsWon: number;
  setsLost: number;
  gamesWon: number;
  gamesLost: number;
};

/** Pair players in current order: 1v2, 3v4, ... */
export function buildFirstRoundPairs<T extends { id: string }>(
  players: T[],
): Array<{ challenger: T; challenged: T }> {
  const pairs: Array<{ challenger: T; challenged: T }> = [];
  for (let i = 0; i + 1 < players.length; i += 2) {
    // Lower on the list challenges the one above (same as normal ladder direction).
    pairs.push({
      challenged: players[i],
      challenger: players[i + 1],
    });
  }
  return pairs;
}

export function isValidSetGames(winnerGames: number, loserGames: number): boolean {
  if (
    !Number.isInteger(winnerGames) ||
    !Number.isInteger(loserGames) ||
    winnerGames < 0 ||
    loserGames < 0 ||
    winnerGames > 7 ||
    loserGames > 7
  ) {
    return false;
  }

  // Standard set: 6 games with margin of 2, or 7-5 / 7-6 tie-break style.
  if (winnerGames === 6 && loserGames <= 4) {
    return true;
  }
  if (winnerGames === 7 && (loserGames === 5 || loserGames === 6)) {
    return true;
  }
  return false;
}

export function resolveSetWinner(
  challengerGames: number,
  challengedGames: number,
): "challenger" | "challenged" | null {
  if (challengerGames === challengedGames) {
    return null;
  }
  const challengerWins = challengerGames > challengedGames;
  const winnerGames = challengerWins ? challengerGames : challengedGames;
  const loserGames = challengerWins ? challengedGames : challengerGames;
  if (!isValidSetGames(winnerGames, loserGames)) {
    return null;
  }
  return challengerWins ? "challenger" : "challenged";
}

export function parseBestOfThreeSetScores(scores: MatchSetScores): {
  challengerSets: number;
  challengedSets: number;
  gamesWonByChallenger: number;
  gamesWonByChallenged: number;
  error: string | null;
} {
  const empty = {
    challengerSets: 0,
    challengedSets: 0,
    gamesWonByChallenger: 0,
    gamesWonByChallenged: 0,
  };

  const playedSets: SetGames[] = [scores.set1, scores.set2];
  if (scores.set3) {
    playedSets.push(scores.set3);
  }

  let challengerSets = 0;
  let challengedSets = 0;
  let gamesWonByChallenger = 0;
  let gamesWonByChallenged = 0;

  for (let i = 0; i < playedSets.length; i += 1) {
    const set = playedSets[i];
    const winner = resolveSetWinner(set.challengerGames, set.challengedGames);
    if (!winner) {
      return { ...empty, error: `Set ${i + 1} score is invalid.` };
    }

    gamesWonByChallenger += set.challengerGames;
    gamesWonByChallenged += set.challengedGames;
    if (winner === "challenger") {
      challengerSets += 1;
    } else {
      challengedSets += 1;
    }
  }

  if (challengerSets === 2 && challengedSets === 0) {
    if (scores.set3) {
      return { ...empty, error: "Do not enter a 3rd set when the match finished 2-0." };
    }
    if (playedSets.length !== 2) {
      return { ...empty, error: "A 2-0 match needs exactly 2 set scores." };
    }
  } else if (challengerSets === 0 && challengedSets === 2) {
    if (scores.set3) {
      return { ...empty, error: "Do not enter a 3rd set when the match finished 2-0." };
    }
    if (playedSets.length !== 2) {
      return { ...empty, error: "A 2-0 match needs exactly 2 set scores." };
    }
  } else if (
    (challengerSets === 2 && challengedSets === 1) ||
    (challengerSets === 1 && challengedSets === 2)
  ) {
    if (!scores.set3) {
      return { ...empty, error: "Enter the 3rd set score for a 2-1 match." };
    }
  } else {
    return { ...empty, error: "Match must finish 2-0 or 2-1." };
  }

  return {
    challengerSets,
    challengedSets,
    gamesWonByChallenger,
    gamesWonByChallenged,
    error: null,
  };
}

/**
 * First-round ladder order:
 * 1) All winners above all losers
 * 2) Among winners: fewer sets lost, then fewer games lost, then more games won
 *    so 6-0 6-0 ranks above 6-0 6-1, which ranks above 6-2 6-3, and all 2-0 above 2-1
 * 3) Among losers: more sets won, then more games won (closer losses rank higher)
 */
export function sortFirstRoundStandings(
  rows: FirstRoundStandingInput[],
): FirstRoundStandingInput[] {
  return [...rows].sort((a, b) => {
    if (a.won !== b.won) {
      return a.won ? -1 : 1;
    }

    if (a.won) {
      if (a.setsLost !== b.setsLost) return a.setsLost - b.setsLost;
      if (a.gamesLost !== b.gamesLost) return a.gamesLost - b.gamesLost;
      if (a.gamesWon !== b.gamesWon) return b.gamesWon - a.gamesWon;
      return a.fullName.localeCompare(b.fullName);
    }

    if (a.setsWon !== b.setsWon) return b.setsWon - a.setsWon;
    if (a.gamesWon !== b.gamesWon) return b.gamesWon - a.gamesWon;
    if (a.gamesLost !== b.gamesLost) return a.gamesLost - b.gamesLost;
    return a.fullName.localeCompare(b.fullName);
  });
}

export function formatSetScoreLine(params: {
  set1ChallengerGames: number | null;
  set1ChallengedGames: number | null;
  set2ChallengerGames: number | null;
  set2ChallengedGames: number | null;
  set3ChallengerGames: number | null;
  set3ChallengedGames: number | null;
  challengerSets: number | null;
  challengedSets: number | null;
}): string {
  const parts: string[] = [];
  if (params.set1ChallengerGames != null && params.set1ChallengedGames != null) {
    parts.push(`${params.set1ChallengerGames}-${params.set1ChallengedGames}`);
  }
  if (params.set2ChallengerGames != null && params.set2ChallengedGames != null) {
    parts.push(`${params.set2ChallengerGames}-${params.set2ChallengedGames}`);
  }
  if (params.set3ChallengerGames != null && params.set3ChallengedGames != null) {
    parts.push(`${params.set3ChallengerGames}-${params.set3ChallengedGames}`);
  }

  if (parts.length > 0) {
    return parts.join(" ");
  }

  if (params.challengerSets != null && params.challengedSets != null) {
    return `${params.challengerSets}-${params.challengedSets} sets`;
  }

  return "—";
}
