import { MatchSetupType } from "@prisma/client";

export function parseMatchSetupType(raw: string): MatchSetupType {
  if (raw === MatchSetupType.SHORT_SET_TO_4) {
    return MatchSetupType.SHORT_SET_TO_4;
  }

  if (raw === MatchSetupType.BEST_OF_3_SUPER_TIEBREAK) {
    return MatchSetupType.BEST_OF_3_SUPER_TIEBREAK;
  }

  return MatchSetupType.NORMAL_SET;
}

export function isBestOfThreeSuperTiebreak(matchSetupType: MatchSetupType): boolean {
  return matchSetupType === MatchSetupType.BEST_OF_3_SUPER_TIEBREAK;
}

export function formatMatchSetupLabel(matchSetupType: MatchSetupType): string {
  switch (matchSetupType) {
    case MatchSetupType.SHORT_SET_TO_4:
      return "Short Set (to 4)";
    case MatchSetupType.BEST_OF_3_SUPER_TIEBREAK:
      return "Best of 3 (super tie-break)";
    default:
      return "Normal Set";
  }
}

export function resolveNumberOfSets(matchSetupType: MatchSetupType, numberOfSets: number): number {
  if (isBestOfThreeSuperTiebreak(matchSetupType)) {
    return 3;
  }

  return numberOfSets;
}

export function getMatchSetupRulesDescription(matchSetupType: MatchSetupType): string {
  switch (matchSetupType) {
    case MatchSetupType.SHORT_SET_TO_4:
      return "Short Set rule: 1 set up to 4 games. At 4-4, a tie-break is played to decide the winner. Enter the exact set score (for example 4-2).";
    case MatchSetupType.BEST_OF_3_SUPER_TIEBREAK:
      return "Best of 3 sets: first to 2 sets wins (2-0 or 2-1). Enter exact set scores (for example 6-4 6-2, or 6-4 3-6 10-8 for the super tie-break). Standings use real games won/lost from those sets.";
    default:
      return "Normal Set: enter exact set scores (for example 6-4 6-2). Standings use real games won/lost.";
  }
}

export function getScoreInputLabel(matchSetupType: MatchSetupType): string {
  return isBestOfThreeSuperTiebreak(matchSetupType) ? "Set scores" : "Games";
}

export function isValidBestOfThreeSetsScore(homeSets: number, awaySets: number): boolean {
  return (
    (homeSets === 2 && awaySets === 0) ||
    (homeSets === 0 && awaySets === 2) ||
    (homeSets === 2 && awaySets === 1) ||
    (homeSets === 1 && awaySets === 2)
  );
}

export function validateMatchScoreForSave(
  homeScore: number,
  awayScore: number,
  matchSetupType: MatchSetupType,
): boolean {
  if (homeScore < 0 || awayScore < 0) {
    return false;
  }

  if (isBestOfThreeSuperTiebreak(matchSetupType)) {
    return isValidBestOfThreeSetsScore(homeScore, awayScore);
  }

  return true;
}

export type MatchSetGames = {
  homeGames: number;
  awayGames: number;
};

export type DetailedMatchSetScores = {
  set1: MatchSetGames;
  set2?: MatchSetGames | null;
  set3?: MatchSetGames | null;
};

export type MatchScoreFields = {
  homeGames: number | null;
  awayGames: number | null;
  homeSets?: number | null;
  awaySets?: number | null;
  set1HomeGames?: number | null;
  set1AwayGames?: number | null;
  set2HomeGames?: number | null;
  set2AwayGames?: number | null;
  set3HomeGames?: number | null;
  set3AwayGames?: number | null;
};

function isValidStandardSetGames(winnerGames: number, loserGames: number): boolean {
  if (
    !Number.isInteger(winnerGames) ||
    !Number.isInteger(loserGames) ||
    winnerGames < 0 ||
    loserGames < 0
  ) {
    return false;
  }

  if (winnerGames === 6 && loserGames <= 4) return true;
  if (winnerGames === 7 && (loserGames === 5 || loserGames === 6)) return true;
  return false;
}

function isValidShortSetGames(winnerGames: number, loserGames: number): boolean {
  if (
    !Number.isInteger(winnerGames) ||
    !Number.isInteger(loserGames) ||
    winnerGames < 0 ||
    loserGames < 0
  ) {
    return false;
  }

  // Short set to 4, or tie-break after 4-4 represented as 5-4 / higher.
  if (winnerGames === 4 && loserGames <= 2) return true;
  if (winnerGames >= 5 && winnerGames > loserGames) return true;
  return false;
}

function isValidDecidingSuperTiebreak(homeGames: number, awayGames: number): boolean {
  if (!Number.isInteger(homeGames) || !Number.isInteger(awayGames)) return false;
  if (homeGames === awayGames) return false;
  const winner = Math.max(homeGames, awayGames);
  const loser = Math.min(homeGames, awayGames);
  if (winner < 10) return false;
  return winner - loser >= 2;
}

function resolveSetSide(
  homeGames: number,
  awayGames: number,
  matchSetupType: MatchSetupType,
  isDecidingSuperTiebreak: boolean,
): "home" | "away" | null {
  if (homeGames === awayGames) return null;

  if (isDecidingSuperTiebreak) {
    return isValidDecidingSuperTiebreak(homeGames, awayGames)
      ? homeGames > awayGames
        ? "home"
        : "away"
      : null;
  }

  const homeWins = homeGames > awayGames;
  const winnerGames = homeWins ? homeGames : awayGames;
  const loserGames = homeWins ? awayGames : homeGames;
  const valid =
    matchSetupType === MatchSetupType.SHORT_SET_TO_4
      ? isValidShortSetGames(winnerGames, loserGames)
      : isValidStandardSetGames(winnerGames, loserGames);

  if (!valid) return null;
  return homeWins ? "home" : "away";
}

export function parseDetailedMatchSetScores(
  scores: DetailedMatchSetScores,
  matchSetupType: MatchSetupType,
): {
  homeSets: number;
  awaySets: number;
  homeGamesTotal: number;
  awayGamesTotal: number;
  error: string | null;
} {
  const empty = {
    homeSets: 0,
    awaySets: 0,
    homeGamesTotal: 0,
    awayGamesTotal: 0,
  };

  const played: MatchSetGames[] = [scores.set1];
  if (scores.set2) played.push(scores.set2);
  if (scores.set3) played.push(scores.set3);

  let homeSets = 0;
  let awaySets = 0;
  let homeGamesTotal = 0;
  let awayGamesTotal = 0;

  for (let i = 0; i < played.length; i += 1) {
    const set = played[i];
    const isDecidingSuper =
      isBestOfThreeSuperTiebreak(matchSetupType) && homeSets === 1 && awaySets === 1 && i === 2;
    const winner = resolveSetSide(
      set.homeGames,
      set.awayGames,
      matchSetupType,
      isDecidingSuper,
    );
    if (!winner) {
      return { ...empty, error: `Set ${i + 1} score is invalid.` };
    }

    homeGamesTotal += set.homeGames;
    awayGamesTotal += set.awayGames;
    if (winner === "home") homeSets += 1;
    else awaySets += 1;
  }

  if (isBestOfThreeSuperTiebreak(matchSetupType)) {
    if (!isValidBestOfThreeSetsScore(homeSets, awaySets)) {
      return { ...empty, error: "Best of 3 must finish 2-0 or 2-1. Enter exact set scores." };
    }
    if ((homeSets === 2 && awaySets === 0) || (homeSets === 0 && awaySets === 2)) {
      if (scores.set3) {
        return { ...empty, error: "Do not enter a 3rd set when the match finished 2-0." };
      }
      if (!scores.set2) {
        return { ...empty, error: "Enter both set scores for a 2-0 match." };
      }
    }
    if (
      ((homeSets === 2 && awaySets === 1) || (homeSets === 1 && awaySets === 2)) &&
      !scores.set3
    ) {
      return { ...empty, error: "Enter the 3rd set score for a 2-1 match." };
    }
  } else if (homeSets === awaySets) {
    return { ...empty, error: "Match cannot end in a draw." };
  }

  return {
    homeSets,
    awaySets,
    homeGamesTotal,
    awayGamesTotal,
    error: null,
  };
}

export function hasDetailedSetScores(match: MatchScoreFields): boolean {
  return match.set1HomeGames != null && match.set1AwayGames != null;
}

export function getMatchStandingContribution(
  match: MatchScoreFields,
  matchSetupType: MatchSetupType,
): {
  homeGamesForStandings: number;
  awayGamesForStandings: number;
  homeWon: boolean;
  awayWon: boolean;
  homePoints: number;
  awayPoints: number;
} | null {
  if (hasDetailedSetScores(match)) {
    const homeGames =
      (match.set1HomeGames ?? 0) +
      (match.set2HomeGames ?? 0) +
      (match.set3HomeGames ?? 0);
    const awayGames =
      (match.set1AwayGames ?? 0) +
      (match.set2AwayGames ?? 0) +
      (match.set3AwayGames ?? 0);
    const homeSets = match.homeSets ?? 0;
    const awaySets = match.awaySets ?? 0;
    const homeWon = homeSets > awaySets;
    const awayWon = awaySets > homeSets;

    return {
      homeGamesForStandings: homeGames,
      awayGamesForStandings: awayGames,
      homeWon,
      awayWon,
      homePoints: isBestOfThreeSuperTiebreak(matchSetupType) ? homeSets : homeGames,
      awayPoints: isBestOfThreeSuperTiebreak(matchSetupType) ? awaySets : awayGames,
    };
  }

  if (match.homeGames === null || match.awayGames === null) {
    return null;
  }

  // Legacy best-of-3 entries stored only sets (2-0 / 2-1).
  if (
    isBestOfThreeSuperTiebreak(matchSetupType) &&
    match.homeGames <= 2 &&
    match.awayGames <= 2
  ) {
    return {
      homeGamesForStandings: 0,
      awayGamesForStandings: 0,
      homeWon: match.homeGames > match.awayGames,
      awayWon: match.awayGames > match.homeGames,
      homePoints: match.homeGames,
      awayPoints: match.awayGames,
    };
  }

  return {
    homeGamesForStandings: match.homeGames,
    awayGamesForStandings: match.awayGames,
    homeWon: match.homeGames > match.awayGames,
    awayWon: match.awayGames > match.homeGames,
    homePoints: match.homeGames,
    awayPoints: match.awayGames,
  };
}

export function formatMatchScoreDisplay(
  homeGames: number | null,
  awayGames: number | null,
  matchSetupType: MatchSetupType,
  detailed?: MatchScoreFields | null,
): string {
  if (detailed && hasDetailedSetScores(detailed)) {
    const parts: string[] = [];
    if (detailed.set1HomeGames != null && detailed.set1AwayGames != null) {
      parts.push(`${detailed.set1HomeGames}-${detailed.set1AwayGames}`);
    }
    if (detailed.set2HomeGames != null && detailed.set2AwayGames != null) {
      parts.push(`${detailed.set2HomeGames}-${detailed.set2AwayGames}`);
    }
    if (detailed.set3HomeGames != null && detailed.set3AwayGames != null) {
      parts.push(`${detailed.set3HomeGames}-${detailed.set3AwayGames}`);
    }
    if (parts.length > 0) {
      return parts.join(" ");
    }
  }

  if (homeGames === null || awayGames === null) {
    return "-";
  }

  const score = `${homeGames} - ${awayGames}`;

  if (isBestOfThreeSuperTiebreak(matchSetupType) && homeGames <= 2 && awayGames <= 2) {
    return `${score} (sets)`;
  }

  return score;
}
