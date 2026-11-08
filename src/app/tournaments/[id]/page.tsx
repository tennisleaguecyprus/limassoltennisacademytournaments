import Link from "next/link";
import { notFound } from "next/navigation";
import { EventType, TournamentFormat } from "@prisma/client";

import AutoRefresh from "@/app/components/AutoRefresh";
import PublicMatchScoreEditor from "@/app/components/PublicMatchScoreEditor";
import { formatEntryName, formatEntryVersus } from "@/lib/entry-name";
import { formatMatchScheduleDisplay } from "@/lib/match-schedule";
import { getMatchStandingContribution } from "@/lib/match-setup";
import { prisma } from "@/lib/prisma";
import { sortStandingRows, type StandingRow } from "@/lib/tournament-standings";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ phase?: string; group?: string }>;
};

function resolveActivePhase(phase: string | undefined) {
  if (phase === "knockout") return "knockout";
  if (phase === "entries") return "entries";
  return "group";
}

function resolveActiveGroupNumber(
  groupParam: string | undefined,
  groupNumbers: number[],
): number | null {
  if (groupNumbers.length === 0) return null;
  const parsed = groupParam ? Number.parseInt(groupParam, 10) : Number.NaN;
  if (!Number.isNaN(parsed) && groupNumbers.includes(parsed)) {
    return parsed;
  }
  return groupNumbers[0];
}

function formatKnockoutRound(round: string) {
  const withoutPrefix = round.replace(/^Knockout\s+/i, "").trim();
  if (/^final$/i.test(withoutPrefix)) return "FINAL";
  if (/^sf\d*$/i.test(withoutPrefix)) return withoutPrefix.toUpperCase();
  return withoutPrefix;
}

function formatTournamentDateRange(startsAt: Date, endsAt: Date) {
  const toDayMonthYear = (value: Date) => {
    const day = String(value.getDate()).padStart(2, "0");
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const year = value.getFullYear();
    return `${day}/${month}/${year}`;
  };

  const startDate = toDayMonthYear(startsAt);
  const endDate = toDayMonthYear(endsAt);
  return startDate === endDate ? startDate : `${startDate} - ${endDate}`;
}

export default async function TournamentPublicPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const activePhase = resolveActivePhase(resolvedSearchParams?.phase);
  const requestedGroup = resolvedSearchParams?.group;

  const tournament = await prisma.tournament.findUnique({
    where: { id },
    include: {
      players: {
        orderBy: [{ groupNumber: "asc" }, { fullName: "asc" }],
      },
      matches: {
        orderBy: [{ scheduledAt: "asc" }, { round: "asc" }],
        include: {
          homePlayer: true,
          awayPlayer: true,
        },
      },
    },
  });

  if (!tournament) {
    notFound();
  }

  const playersByGroup = new Map<number, typeof tournament.players>();
  for (const player of tournament.players) {
    if (!player.groupNumber) continue;
    const groupPlayers = playersByGroup.get(player.groupNumber) ?? [];
    groupPlayers.push(player);
    playersByGroup.set(player.groupNumber, groupPlayers);
  }

  const standingsByGroup = new Map<number, StandingRow[]>();
  const groupMatchesByGroup = new Map<number, typeof tournament.matches>();
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
      const home = rows.get(match.homePlayerId);
      const away = rows.get(match.awayPlayerId);
      if (!home || !away) continue;

      const contribution = getMatchStandingContribution(match, tournament.matchSetupType);
      if (!contribution) continue;

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

    const groupPlayerIds = new Set(groupPlayers.map((player) => player.id));
    const groupMatches = tournament.matches.filter(
      (match) =>
        groupPlayerIds.has(match.homePlayerId) &&
        groupPlayerIds.has(match.awayPlayerId) &&
        match.round === `Group ${groupNumber}`,
    );
    standingsByGroup.set(
      groupNumber,
      sortStandingRows(
        [...rows.values()],
        tournament.standingsUseGamePoints,
        groupMatches,
      ),
    );
    groupMatchesByGroup.set(groupNumber, groupMatches);
  }

  const now = new Date();
  const tournamentStatus =
    now < tournament.startsAt ? "Upcoming" : now > tournament.endsAt ? "Completed" : "Live";
  const isDoubles = tournament.eventType === EventType.DOUBLES;
  const groupNumbers = [...standingsByGroup.keys()].sort((a, b) => a - b);
  const activeGroupNumber = resolveActiveGroupNumber(requestedGroup, groupNumbers);
  const activeGroupRows =
    activeGroupNumber == null ? null : (standingsByGroup.get(activeGroupNumber) ?? null);
  const activeGroupMatches =
    activeGroupNumber == null ? [] : (groupMatchesByGroup.get(activeGroupNumber) ?? []);
  const knockoutMatches = tournament.matches
    .filter((match) => !match.round.startsWith("Group "))
    .sort((a, b) => {
      const aIsFinal = a.round.toLowerCase().includes("final");
      const bIsFinal = b.round.toLowerCase().includes("final");
      if (aIsFinal && !bIsFinal) return 1;
      if (!aIsFinal && bIsFinal) return -1;
      return 0;
    });

  return (
    <div className="min-h-screen bg-zinc-50 px-3 py-6 text-zinc-900 dark:bg-black dark:text-zinc-100 sm:px-6 sm:py-12">
      <AutoRefresh enabled={tournamentStatus === "Live"} />
      <main className="mx-auto w-full max-w-6xl">
        <header className="rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-950 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{tournament.name}</h1>
              <p className="mt-2 text-sm font-bold text-zinc-800 dark:text-zinc-100 sm:text-base">
                {isDoubles ? "Doubles" : "Singles"}
                {" • "}
                {tournament.category ?? "Open category"}
                {" • "}
                {formatTournamentDateRange(tournament.startsAt, tournament.endsAt)}
              </p>
            </div>
            <div className="sm:text-right">
              <span className="rounded-full bg-zinc-900 px-3 py-1 text-xs font-medium text-white dark:bg-zinc-100 dark:text-zinc-900">
                {tournamentStatus}
              </span>
              <p className="mt-3">
                <Link
                  href="/"
                  className="inline-block rounded-md border border-black/10 px-3 py-2 text-sm hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
                >
                  Back to all tournaments
                </Link>
              </p>
            </div>
          </div>
        </header>

        <section className="mt-6 rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-950 sm:mt-8 sm:p-6">
          <div className="grid grid-cols-3 gap-2 border-b border-black/10 pb-4 dark:border-white/10 sm:flex sm:flex-wrap">
            <Link
              href={`/tournaments/${tournament.id}?phase=entries`}
              className={`rounded-md px-3 py-2 text-center text-sm ${
                activePhase === "entries"
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "border border-black/10 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
              }`}
            >
              Entry List
            </Link>
            <Link
              href={`/tournaments/${tournament.id}?phase=group${
                activeGroupNumber ? `&group=${activeGroupNumber}` : ""
              }`}
              className={`rounded-md px-3 py-2 text-center text-sm ${
                activePhase === "group"
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "border border-black/10 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
              }`}
            >
              Group Phase
            </Link>
            <Link
              href={`/tournaments/${tournament.id}?phase=knockout`}
              className={`rounded-md px-3 py-2 text-center text-sm ${
                activePhase === "knockout"
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "border border-black/10 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
              }`}
            >
              Knockout Phase
            </Link>
          </div>

          {activePhase === "entries" && (
            <>
              <h2 className="mt-6 text-lg font-medium">Entry List</h2>
              {tournament.players.length === 0 ? (
                <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">
                  No entries yet.
                </p>
              ) : (
                <>
                  <div className="mt-4 grid gap-3 sm:hidden">
                    {tournament.players.map((player, index) => (
                      <article
                        key={player.id}
                        className="rounded-md border border-black/10 p-3 dark:border-white/10"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-semibold">
                            {formatEntryName(player, tournament.eventType)}
                          </p>
                          <span className="rounded-full bg-zinc-900 px-2 py-1 text-[11px] font-medium text-white dark:bg-zinc-100 dark:text-zinc-900">
                            #{index + 1}
                          </span>
                        </div>
                        <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
                          <span className="text-zinc-500 dark:text-zinc-400">Telephone</span>{" "}
                          {player.phone ? (
                            <a href={`tel:${player.phone}`} className="underline-offset-2 hover:underline">
                              {player.phone}
                            </a>
                          ) : (
                            "—"
                          )}
                        </p>
                      </article>
                    ))}
                  </div>

                  <div className="mt-4 hidden overflow-x-auto sm:block">
                    <table className="w-full min-w-[480px] text-left text-sm">
                      <thead className="border-b border-black/10 dark:border-white/10">
                        <tr>
                          <th className="px-2 py-2">#</th>
                          <th className="px-2 py-2">{isDoubles ? "Pair" : "Player"}</th>
                          <th className="px-2 py-2">Telephone</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tournament.players.map((player, index) => (
                          <tr
                            key={player.id}
                            className="border-b border-black/5 dark:border-white/10"
                          >
                            <td className="px-2 py-2">{index + 1}</td>
                            <td className="px-2 py-2">
                              {formatEntryName(player, tournament.eventType)}
                            </td>
                            <td className="px-2 py-2">
                              {player.phone ? (
                                <a
                                  href={`tel:${player.phone}`}
                                  className="underline-offset-2 hover:underline"
                                >
                                  {player.phone}
                                </a>
                              ) : (
                                "—"
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          )}

          {activePhase === "group" && (
            <>
              <h2 className="mt-6 text-lg font-medium">Group standings</h2>
              {tournament.format !== TournamentFormat.ROUND_ROBIN_AND_KNOCKOUT ? (
                <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">
                  Group Phase is not used for this Tournament format.
                </p>
              ) : standingsByGroup.size === 0 || activeGroupNumber == null || !activeGroupRows ? (
                <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">
                  Standings will appear once players are assigned to groups.
                </p>
              ) : (
                <div className="mt-4">
                  {groupNumbers.length > 1 && (
                    <div className="mb-4 flex flex-wrap gap-2">
                      {groupNumbers.map((groupNumber) => (
                        <Link
                          key={groupNumber}
                          href={`/tournaments/${tournament.id}?phase=group&group=${groupNumber}`}
                          className={`rounded-md px-3 py-2 text-sm ${
                            activeGroupNumber === groupNumber
                              ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                              : "border border-black/10 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
                          }`}
                        >
                          Group {groupNumber}
                        </Link>
                      ))}
                    </div>
                  )}

                  <div className="rounded-xl border border-black/10 bg-gradient-to-br from-white to-zinc-50 p-3 shadow-sm dark:border-white/10 dark:from-zinc-950 dark:to-zinc-900 sm:p-4">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold sm:text-base">
                        Group {activeGroupNumber}
                      </p>
                      <span className="rounded-full bg-zinc-900 px-2 py-1 text-[11px] font-medium text-white dark:bg-zinc-100 dark:text-zinc-900">
                        Standings
                      </span>
                    </div>

                    <div className="mt-3 space-y-2 sm:hidden">
                      {activeGroupRows.map((row, index) => (
                        <article
                          key={`${row.playerId}-mobile-standing`}
                          className="rounded-lg border border-black/10 bg-white p-3 dark:border-white/10 dark:bg-zinc-950"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-semibold">{row.playerName}</p>
                            <span className="rounded-full bg-zinc-900 px-2 py-1 text-[11px] font-medium text-white dark:bg-zinc-100 dark:text-zinc-900">
                              #{index + 1}
                            </span>
                          </div>
                          <div className="mt-3 grid grid-cols-5 gap-2 text-[11px]">
                            <p><span className="text-zinc-500 dark:text-zinc-400">P</span> {row.played}</p>
                            <p><span className="text-zinc-500 dark:text-zinc-400">GW</span> {row.gamesWon}</p>
                            <p><span className="text-zinc-500 dark:text-zinc-400">GL</span> {row.gamesLost}</p>
                            <p>
                              <span className="text-zinc-500 dark:text-zinc-400">Diff</span>{" "}
                              {row.gamesWon - row.gamesLost}
                            </p>
                            <p>
                              <span className="text-zinc-500 dark:text-zinc-400">Set Points</span>{" "}
                              {row.gamePoints}
                            </p>
                          </div>
                        </article>
                      ))}
                    </div>

                    <div className="mt-2 hidden overflow-x-auto sm:block">
                      <table className="w-full min-w-[700px] text-left text-xs">
                        <thead className="border-b border-black/10 dark:border-white/10">
                          <tr>
                            <th className="px-2 py-2">#</th>
                            <th className="px-2 py-2">{isDoubles ? "Pair" : "Player"}</th>
                            <th className="px-2 py-2">P</th>
                            <th className="px-2 py-2">GW</th>
                            <th className="px-2 py-2">GL</th>
                            <th className="px-2 py-2">Diff</th>
                            <th className="px-2 py-2">Set Points</th>
                          </tr>
                        </thead>
                        <tbody>
                          {activeGroupRows.map((row, index) => (
                            <tr
                              key={row.playerId}
                              className="border-b border-black/5 dark:border-white/10"
                            >
                              <td className="px-2 py-2">{index + 1}</td>
                              <td className="px-2 py-2">{row.playerName}</td>
                              <td className="px-2 py-2">{row.played}</td>
                              <td className="px-2 py-2">{row.gamesWon}</td>
                              <td className="px-2 py-2">{row.gamesLost}</td>
                              <td className="px-2 py-2">{row.gamesWon - row.gamesLost}</td>
                              <td className="px-2 py-2">{row.gamePoints}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="mt-4">
                      <p className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
                        Group {activeGroupNumber} Matches
                      </p>
                      {activeGroupMatches.length === 0 ? (
                        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                          No matches yet for this group.
                        </p>
                      ) : (
                        <>
                          <div className="mt-2 space-y-2 sm:hidden">
                            {activeGroupMatches.map((match) => (
                              <article
                                key={`${match.id}-mobile-match`}
                                className="rounded-lg border border-black/10 bg-white p-3 dark:border-white/10 dark:bg-zinc-950"
                              >
                                <p className="text-xs font-semibold">
                                  {formatEntryVersus(
                                    match.homePlayer,
                                    match.awayPlayer,
                                    tournament.eventType,
                                  )}
                                </p>
                                <div className="mt-2">
                                  <PublicMatchScoreEditor
                                    match={match}
                                    tournamentId={tournament.id}
                                    matchSetupType={tournament.matchSetupType}
                                  />
                                </div>
                                <p className="mt-1 text-[11px] text-zinc-600 dark:text-zinc-300">
                                  Schedule:{" "}
                                  {formatMatchScheduleDisplay(match.scheduledAt, match.court)}
                                </p>
                                <p className="mt-1 text-[11px] text-zinc-600 dark:text-zinc-300">
                                  Winner:{" "}
                                  {match.winnerId === match.homePlayerId
                                    ? formatEntryName(match.homePlayer, tournament.eventType)
                                    : match.winnerId === match.awayPlayerId
                                      ? formatEntryName(match.awayPlayer, tournament.eventType)
                                      : "-"}
                                </p>
                              </article>
                            ))}
                          </div>

                          <div className="mt-2 hidden overflow-x-auto sm:block">
                            <table className="w-full min-w-[700px] text-left text-xs">
                              <thead className="border-b border-black/10 dark:border-white/10">
                                <tr>
                                  <th className="px-2 py-2 font-medium">Home</th>
                                  <th className="px-2 py-2 font-medium">Away</th>
                                  <th className="px-2 py-2 font-medium">Schedule</th>
                                  <th className="px-2 py-2 font-medium">Score / Update</th>
                                  <th className="px-2 py-2 font-medium">Winner</th>
                                </tr>
                              </thead>
                              <tbody>
                                {activeGroupMatches.map((match) => (
                                  <tr
                                    key={match.id}
                                    className="border-b border-black/5 dark:border-white/10"
                                  >
                                    <td className="px-2 py-2">
                                      {formatEntryName(match.homePlayer, tournament.eventType)}
                                    </td>
                                    <td className="px-2 py-2">
                                      {formatEntryName(match.awayPlayer, tournament.eventType)}
                                    </td>
                                    <td className="px-2 py-2">
                                      {formatMatchScheduleDisplay(match.scheduledAt, match.court)}
                                    </td>
                                    <td className="px-2 py-2">
                                      <PublicMatchScoreEditor
                                        match={match}
                                        tournamentId={tournament.id}
                                        matchSetupType={tournament.matchSetupType}
                                      />
                                    </td>
                                    <td className="px-2 py-2">
                                      {match.winnerId === match.homePlayerId
                                        ? formatEntryName(match.homePlayer, tournament.eventType)
                                        : match.winnerId === match.awayPlayerId
                                          ? formatEntryName(match.awayPlayer, tournament.eventType)
                                          : "-"}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {activePhase === "knockout" && (
            <>
              <h2 className="mt-6 text-lg font-medium">Knockout matches</h2>
              {knockoutMatches.length === 0 ? (
                <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">
                  No Knockout matches available yet.
                </p>
              ) : (
                <>
                  <div className="mt-4 space-y-3 sm:hidden">
                    {knockoutMatches.map((match) => (
                      <article
                        key={`${match.id}-mobile-knockout`}
                        className="rounded-lg border border-black/10 bg-white p-3 dark:border-white/10 dark:bg-zinc-950"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-semibold">{formatKnockoutRound(match.round)}</p>
                          <span className="rounded-full bg-zinc-900 px-2 py-1 text-[11px] font-medium text-white dark:bg-zinc-100 dark:text-zinc-900">
                            Knockout
                          </span>
                        </div>
                        <p className="mt-2 text-sm font-semibold">
                          {formatEntryVersus(
                            match.homePlayer,
                            match.awayPlayer,
                            tournament.eventType,
                          )}
                        </p>
                        <div className="mt-2">
                          <PublicMatchScoreEditor
                            match={match}
                            tournamentId={tournament.id}
                            matchSetupType={tournament.matchSetupType}
                          />
                        </div>
                        <p className="mt-1 text-[11px] text-zinc-600 dark:text-zinc-300">
                          Schedule: {formatMatchScheduleDisplay(match.scheduledAt, match.court)}
                        </p>
                        <p className="mt-1 text-[11px] text-zinc-600 dark:text-zinc-300">
                          Winner:{" "}
                          {match.winnerId === match.homePlayerId
                            ? formatEntryName(match.homePlayer, tournament.eventType)
                            : match.winnerId === match.awayPlayerId
                              ? formatEntryName(match.awayPlayer, tournament.eventType)
                              : "-"}
                        </p>
                      </article>
                    ))}
                  </div>

                  <div className="mt-4 hidden overflow-x-auto sm:block">
                    <table className="w-full min-w-[700px] text-left text-sm">
                      <thead className="border-b border-black/10 dark:border-white/10">
                        <tr>
                          <th className="px-2 py-2 font-medium">Round</th>
                          <th className="px-2 py-2 font-medium">Home</th>
                          <th className="px-2 py-2 font-medium">Away</th>
                          <th className="px-2 py-2 font-medium">Schedule</th>
                          <th className="px-2 py-2 font-medium">Score / Update</th>
                          <th className="px-2 py-2 font-medium">Winner</th>
                        </tr>
                      </thead>
                      <tbody>
                        {knockoutMatches.map((match) => (
                          <tr key={match.id} className="border-b border-black/5 dark:border-white/10">
                            <td className="px-2 py-2">{formatKnockoutRound(match.round)}</td>
                            <td className="px-2 py-2">
                              {formatEntryName(match.homePlayer, tournament.eventType)}
                            </td>
                            <td className="px-2 py-2">
                              {formatEntryName(match.awayPlayer, tournament.eventType)}
                            </td>
                            <td className="px-2 py-2">
                              {formatMatchScheduleDisplay(match.scheduledAt, match.court)}
                            </td>
                            <td className="px-2 py-2">
                              <PublicMatchScoreEditor
                                match={match}
                                tournamentId={tournament.id}
                                matchSetupType={tournament.matchSetupType}
                              />
                            </td>
                            <td className="px-2 py-2">
                              {match.winnerId === match.homePlayerId
                                ? formatEntryName(match.homePlayer, tournament.eventType)
                                : match.winnerId === match.awayPlayerId
                                  ? formatEntryName(match.awayPlayer, tournament.eventType)
                                  : "-"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          )}
        </section>

      </main>
    </div>
  );
}
