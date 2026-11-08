"use server";

import { revalidatePath } from "next/cache";

import { buildScheduledAt, parseCourt } from "@/lib/match-schedule";
import { parseDetailedMatchSetScores } from "@/lib/match-setup";
import { prisma } from "@/lib/prisma";

function readOptionalScoreInt(formData: FormData, key: string): number | null {
  const raw = String(formData.get(key) ?? "").trim();
  if (!raw) return null;
  const value = Number.parseInt(raw, 10);
  return Number.isNaN(value) ? null : value;
}

export async function updateMatchResult(formData: FormData) {
  const matchId = String(formData.get("matchId") ?? "");
  const tournamentId = String(formData.get("tournamentId") ?? "");
  const homePlayerId = String(formData.get("homePlayerId") ?? "");
  const awayPlayerId = String(formData.get("awayPlayerId") ?? "");
  const scheduledTimeRaw = String(formData.get("scheduledTime") ?? "").trim();
  const courtRaw = String(formData.get("court") ?? "").trim();
  const scoresOnly = String(formData.get("scoresOnly") ?? "") === "1";

  if (!matchId || !tournamentId || !homePlayerId || !awayPlayerId) {
    return;
  }

  const existingMatch = await prisma.match.findUnique({
    where: { id: matchId },
    select: {
      tournamentId: true,
      homePlayerId: true,
      awayPlayerId: true,
      homeGames: true,
      awayGames: true,
      homeSets: true,
      awaySets: true,
      set1HomeGames: true,
      set1AwayGames: true,
      set2HomeGames: true,
      set2AwayGames: true,
      set3HomeGames: true,
      set3AwayGames: true,
      winnerId: true,
      scheduledAt: true,
      court: true,
    },
  });

  if (
    !existingMatch ||
    existingMatch.tournamentId !== tournamentId ||
    existingMatch.homePlayerId !== homePlayerId ||
    existingMatch.awayPlayerId !== awayPlayerId
  ) {
    return;
  }

  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: { startsAt: true, matchSetupType: true },
  });

  if (!tournament) {
    return;
  }

  let homeGames = existingMatch.homeGames;
  let awayGames = existingMatch.awayGames;
  let homeSets = existingMatch.homeSets;
  let awaySets = existingMatch.awaySets;
  let set1HomeGames = existingMatch.set1HomeGames;
  let set1AwayGames = existingMatch.set1AwayGames;
  let set2HomeGames = existingMatch.set2HomeGames;
  let set2AwayGames = existingMatch.set2AwayGames;
  let set3HomeGames = existingMatch.set3HomeGames;
  let set3AwayGames = existingMatch.set3AwayGames;
  let winnerId = existingMatch.winnerId;

  const parsedSet1Home = readOptionalScoreInt(formData, "set1HomeGames");
  const parsedSet1Away = readOptionalScoreInt(formData, "set1AwayGames");
  const parsedSet2Home = readOptionalScoreInt(formData, "set2HomeGames");
  const parsedSet2Away = readOptionalScoreInt(formData, "set2AwayGames");
  const parsedSet3Home = readOptionalScoreInt(formData, "set3HomeGames");
  const parsedSet3Away = readOptionalScoreInt(formData, "set3AwayGames");

  const anySetScoreEntered =
    parsedSet1Home != null ||
    parsedSet1Away != null ||
    parsedSet2Home != null ||
    parsedSet2Away != null ||
    parsedSet3Home != null ||
    parsedSet3Away != null;

  if (anySetScoreEntered) {
    if (parsedSet1Home == null || parsedSet1Away == null) {
      return;
    }

    if (
      (parsedSet2Home == null) !== (parsedSet2Away == null) ||
      (parsedSet3Home == null) !== (parsedSet3Away == null)
    ) {
      return;
    }

    const set2 =
      parsedSet2Home != null && parsedSet2Away != null
        ? { homeGames: parsedSet2Home, awayGames: parsedSet2Away }
        : null;
    const set3 =
      parsedSet3Home != null && parsedSet3Away != null
        ? { homeGames: parsedSet3Home, awayGames: parsedSet3Away }
        : null;

    const parsed = parseDetailedMatchSetScores(
      {
        set1: { homeGames: parsedSet1Home, awayGames: parsedSet1Away },
        set2,
        set3,
      },
      tournament.matchSetupType,
    );

    if (parsed.error) {
      return;
    }

    set1HomeGames = parsedSet1Home;
    set1AwayGames = parsedSet1Away;
    set2HomeGames = set2?.homeGames ?? null;
    set2AwayGames = set2?.awayGames ?? null;
    set3HomeGames = set3?.homeGames ?? null;
    set3AwayGames = set3?.awayGames ?? null;
    homeSets = parsed.homeSets;
    awaySets = parsed.awaySets;
    homeGames = parsed.homeGamesTotal;
    awayGames = parsed.awayGamesTotal;
    winnerId = parsed.homeSets > parsed.awaySets ? homePlayerId : awayPlayerId;
  }

  const scheduledAt = scoresOnly
    ? existingMatch.scheduledAt
    : buildScheduledAt(tournament.startsAt, scheduledTimeRaw);
  const court = scoresOnly ? existingMatch.court : parseCourt(courtRaw);

  await prisma.match.update({
    where: { id: matchId },
    data: {
      homeGames,
      awayGames,
      homeSets,
      awaySets,
      set1HomeGames,
      set1AwayGames,
      set2HomeGames,
      set2AwayGames,
      set3HomeGames,
      set3AwayGames,
      winnerId,
      scheduledAt,
      court,
    },
  });

  const updatedMatch = await prisma.match.findUnique({
    where: { id: matchId },
    select: { round: true },
  });

  if (updatedMatch?.round === "Knockout SF1" || updatedMatch?.round === "Knockout SF2") {
    const sfMatches = await prisma.match.findMany({
      where: {
        tournamentId,
        round: {
          in: ["Knockout SF1", "Knockout SF2"],
        },
      },
      select: {
        round: true,
        winnerId: true,
      },
    });

    const sf1 = sfMatches.find((m) => m.round === "Knockout SF1");
    const sf2 = sfMatches.find((m) => m.round === "Knockout SF2");

    const finalMatch = await prisma.match.findFirst({
      where: {
        tournamentId,
        round: "Knockout Final",
      },
      select: { id: true, homePlayerId: true, awayPlayerId: true },
    });

    if (sf1?.winnerId && sf2?.winnerId && sf1.winnerId !== sf2.winnerId) {
      if (finalMatch) {
        const finalistsChanged =
          finalMatch.homePlayerId !== sf1.winnerId || finalMatch.awayPlayerId !== sf2.winnerId;
        if (finalistsChanged) {
          await prisma.match.update({
            where: { id: finalMatch.id },
            data: {
              homePlayerId: sf1.winnerId,
              awayPlayerId: sf2.winnerId,
              winnerId: null,
              homeGames: null,
              awayGames: null,
              homeSets: null,
              awaySets: null,
              set1HomeGames: null,
              set1AwayGames: null,
              set2HomeGames: null,
              set2AwayGames: null,
              set3HomeGames: null,
              set3AwayGames: null,
              scheduledAt: null,
            },
          });
        }
      } else {
        await prisma.match.create({
          data: {
            tournamentId,
            round: "Knockout Final",
            homePlayerId: sf1.winnerId,
            awayPlayerId: sf2.winnerId,
          },
        });
      }
    } else if (finalMatch) {
      await prisma.match.delete({
        where: { id: finalMatch.id },
      });
    }
  }

  revalidatePath(`/admin/tournaments/${tournamentId}`);
  revalidatePath(`/tournaments/${tournamentId}`);
}
