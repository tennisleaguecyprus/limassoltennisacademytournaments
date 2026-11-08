import { EventType, MatchSetupType } from "@prisma/client";

import { formatEntryName } from "@/lib/entry-name";
import { getMatchStandingContribution } from "@/lib/match-setup";

export type StandingRow = {
  playerId: string;
  playerName: string;
  played: number;
  wins: number;
  losses: number;
  gamesWon: number;
  gamesLost: number;
  gamePoints: number;
};

type TournamentForStandings = {
  eventType: EventType;
  standingsUseGamePoints: boolean;
  matchSetupType: MatchSetupType;
  players: Array<{
    id: string;
    fullName: string;
    partnerName: string | null;
    groupNumber: number | null;
  }>;
  matches: Array<{
    homePlayerId: string;
    awayPlayerId: string;
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
    round: string;
  }>;
};

type TournamentForQualification = TournamentForStandings & {
  qualifiedPerGroup: number | null;
  qualifyBestSecond: boolean;
  qualifyBestThird: boolean;
};

export type StandingMatchResult = {
  homePlayerId: string;
  awayPlayerId: string;
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
  winnerId?: string | null;
};

function arePrimaryStatsEqual(
  a: StandingRow,
  b: StandingRow,
  useGamePoints: boolean,
): boolean {
  if (useGamePoints && a.gamePoints !== b.gamePoints) {
    return false;
  }
  return a.wins === b.wins;
}

function compareByGameDifference(a: StandingRow, b: StandingRow): number {
  const diffA = a.gamesWon - a.gamesLost;
  const diffB = b.gamesWon - b.gamesLost;
  if (diffB !== diffA) {
    return diffB - diffA;
  }
  if (b.gamesWon !== a.gamesWon) {
    return b.gamesWon - a.gamesWon;
  }
  return a.playerName.localeCompare(b.playerName);
}

/** Returns the winner playerId of the completed match between a and b, if any. */
export function getHeadToHeadWinnerId(
  playerAId: string,
  playerBId: string,
  matches: StandingMatchResult[],
): string | null {
  for (const match of matches) {
    const isPair =
      (match.homePlayerId === playerAId && match.awayPlayerId === playerBId) ||
      (match.homePlayerId === playerBId && match.awayPlayerId === playerAId);

    if (!isPair) {
      continue;
    }

    if (match.winnerId === playerAId || match.winnerId === playerBId) {
      return match.winnerId;
    }

    if (match.homeSets != null && match.awaySets != null && match.homeSets !== match.awaySets) {
      return match.homeSets > match.awaySets ? match.homePlayerId : match.awayPlayerId;
    }

    if (match.homeGames === null || match.awayGames === null || match.homeGames === match.awayGames) {
      continue;
    }

    return match.homeGames > match.awayGames ? match.homePlayerId : match.awayPlayerId;
  }

  return null;
}

export function compareStandingRows(
  a: StandingRow,
  b: StandingRow,
  useGamePoints: boolean,
): number {
  if (useGamePoints && b.gamePoints !== a.gamePoints) {
    return b.gamePoints - a.gamePoints;
  }
  if (b.wins !== a.wins) {
    return b.wins - a.wins;
  }
  return compareByGameDifference(a, b);
}

/**
 * Sort standings with tennis-style tie-breaks:
 * 1) Points (optional) / wins
 * 2) If exactly two players are tied → winner of their mutual match ranks higher
 * 3) If three or more are tied → games difference (won − lost), then games won
 */
export function sortStandingRows(
  rows: StandingRow[],
  useGamePoints: boolean,
  matches: StandingMatchResult[] = [],
) {
  const byPrimary = [...rows].sort((a, b) => {
    if (useGamePoints && b.gamePoints !== a.gamePoints) {
      return b.gamePoints - a.gamePoints;
    }
    if (b.wins !== a.wins) {
      return b.wins - a.wins;
    }
    return 0;
  });

  const result: StandingRow[] = [];
  let index = 0;

  while (index < byPrimary.length) {
    const bucket = [byPrimary[index]];
    let next = index + 1;

    while (
      next < byPrimary.length &&
      arePrimaryStatsEqual(byPrimary[index], byPrimary[next], useGamePoints)
    ) {
      bucket.push(byPrimary[next]);
      next += 1;
    }

    if (bucket.length === 2) {
      const winnerId = getHeadToHeadWinnerId(
        bucket[0].playerId,
        bucket[1].playerId,
        matches,
      );

      if (winnerId === bucket[0].playerId) {
        result.push(bucket[0], bucket[1]);
      } else if (winnerId === bucket[1].playerId) {
        result.push(bucket[1], bucket[0]);
      } else {
        // No head-to-head result yet → fall back to games difference
        result.push(...[...bucket].sort(compareByGameDifference));
      }
    } else if (bucket.length > 2) {
      result.push(...[...bucket].sort(compareByGameDifference));
    } else {
      result.push(bucket[0]);
    }

    index = next;
  }

  return result;
}

export function sortByBestDiff(a: StandingRow, b: StandingRow) {
  const diffA = a.gamesWon - a.gamesLost;
  const diffB = b.gamesWon - b.gamesLost;
  if (diffB !== diffA) return diffB - diffA;
  if (b.gamesWon !== a.gamesWon) return b.gamesWon - a.gamesWon;
  if (b.wins !== a.wins) return b.wins - a.wins;
  return a.playerName.localeCompare(b.playerName);
}

export function buildStandingsByGroup(tournament: TournamentForStandings) {
  const playersByGroup = new Map<number, typeof tournament.players>();

  for (const player of tournament.players) {
    if (!player.groupNumber) {
      continue;
    }

    const list = playersByGroup.get(player.groupNumber) ?? [];
    list.push(player);
    playersByGroup.set(player.groupNumber, list);
  }

  const standingsByGroup = new Map<number, StandingRow[]>();

  for (const [groupNumber, groupPlayers] of playersByGroup.entries()) {
    const rows = new Map<string, StandingRow>();

    groupPlayers.forEach((player) => {
      rows.set(player.id, {
        playerId: player.id,
        playerName: formatEntryName(player, tournament.eventType),
        played: 0,
        wins: 0,
        losses: 0,
        gamesWon: 0,
        gamesLost: 0,
        gamePoints: 0,
      });
    });

    for (const match of tournament.matches) {
      if (!match.round.startsWith("Group ")) {
        continue;
      }

      const home = rows.get(match.homePlayerId);
      const away = rows.get(match.awayPlayerId);
      if (!home || !away) {
        continue;
      }

      const contribution = getMatchStandingContribution(match, tournament.matchSetupType);
      if (!contribution) {
        continue;
      }

      home.played += 1;
      away.played += 1;
      home.gamesWon += contribution.homeGamesForStandings;
      home.gamesLost += contribution.awayGamesForStandings;
      away.gamesWon += contribution.awayGamesForStandings;
      away.gamesLost += contribution.homeGamesForStandings;

      home.gamePoints += contribution.homePoints;
      away.gamePoints += contribution.awayPoints;

      if (contribution.homeWon) {
        home.wins += 1;
        away.losses += 1;
      } else if (contribution.awayWon) {
        away.wins += 1;
        home.losses += 1;
      }
    }

    const groupMatches = tournament.matches.filter(
      (match) =>
        match.round.startsWith("Group ") &&
        rows.has(match.homePlayerId) &&
        rows.has(match.awayPlayerId),
    );

    standingsByGroup.set(
      groupNumber,
      sortStandingRows(
        [...rows.values()],
        tournament.standingsUseGamePoints,
        groupMatches,
      ),
    );
  }

  return standingsByGroup;
}

export function computeQualifiedPlayerIds(
  tournament: TournamentForQualification,
  standingsByGroup: Map<number, StandingRow[]>,
) {
  const qualifiedIds = new Set<string>();
  const perGroup = tournament.qualifiedPerGroup ?? 1;

  for (const rows of standingsByGroup.values()) {
    rows.slice(0, perGroup).forEach((row) => qualifiedIds.add(row.playerId));
  }

  const secondPlaceRows = [...standingsByGroup.values()]
    .map((rows) => rows[1])
    .filter((row): row is StandingRow => Boolean(row));
  const thirdPlaceRows = [...standingsByGroup.values()]
    .map((rows) => rows[2])
    .filter((row): row is StandingRow => Boolean(row));

  if (tournament.qualifyBestSecond && secondPlaceRows.length > 0) {
    secondPlaceRows.sort(sortByBestDiff);
    qualifiedIds.add(secondPlaceRows[0].playerId);
  }

  if (tournament.qualifyBestThird && thirdPlaceRows.length > 0) {
    thirdPlaceRows.sort(sortByBestDiff);
    qualifiedIds.add(thirdPlaceRows[0].playerId);
  }

  return qualifiedIds;
}

export function getQualifiedStandingRows(
  tournament: TournamentForStandings,
  qualifiedPlayerIds: Set<string>,
) {
  const standingsByGroup = buildStandingsByGroup(tournament);
  const qualifiedRows: StandingRow[] = [];

  for (const playerId of qualifiedPlayerIds) {
    let row: StandingRow | undefined;

    for (const rows of standingsByGroup.values()) {
      row = rows.find((standingRow) => standingRow.playerId === playerId);
      if (row) {
        break;
      }
    }

    if (row) {
      qualifiedRows.push(row);
    }
  }

  return sortStandingRows(qualifiedRows, tournament.standingsUseGamePoints);
}

export type KnockoutBracketMatch = {
  round: string;
  homePlayerId: string;
  awayPlayerId: string;
};

export function buildKnockoutBracketMatches(
  qualifiedRows: StandingRow[],
): { matches: KnockoutBracketMatch[] } | { error: string } {
  const count = qualifiedRows.length;

  if (count < 2) {
    return {
      error: "Need at least 2 qualified entries. Complete group matches and run qualification first.",
    };
  }

  if (count === 2) {
    return {
      matches: [
        {
          round: "Knockout Final",
          homePlayerId: qualifiedRows[0].playerId,
          awayPlayerId: qualifiedRows[1].playerId,
        },
      ],
    };
  }

  if (count === 4) {
    return {
      matches: [
        {
          round: "Knockout SF1",
          homePlayerId: qualifiedRows[0].playerId,
          awayPlayerId: qualifiedRows[3].playerId,
        },
        {
          round: "Knockout SF2",
          homePlayerId: qualifiedRows[1].playerId,
          awayPlayerId: qualifiedRows[2].playerId,
        },
      ],
    };
  }

  if (count === 8) {
    const pairings = [
      [0, 7],
      [3, 4],
      [2, 5],
      [1, 6],
    ] as const;

    return {
      matches: pairings.map(([homeIndex, awayIndex], index) => ({
        round: `Knockout QF${index + 1}`,
        homePlayerId: qualifiedRows[homeIndex].playerId,
        awayPlayerId: qualifiedRows[awayIndex].playerId,
      })),
    };
  }

  return {
    error: `This tournament has ${count} qualified entries. Knockout generation currently supports 2, 4, or 8 qualifiers.`,
  };
}
