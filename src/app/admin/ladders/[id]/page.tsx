import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  LadderChallengeStatus,
  LadderStatus,
} from "@prisma/client";

import DeleteLadderButton from "@/app/components/DeleteLadderButton";
import {
  OPEN_CHALLENGE_STATUSES,
  getChallengeValidationError,
  isInactivePlayer,
  isValidBestOfThreeSetsScore,
  normalizePlayerName,
  shouldSwapPositions,
} from "@/lib/ladder";
import { prisma } from "@/lib/prisma";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; message?: string }>;
};

function redirectWithMessage(ladderId: string, message: string) {
  redirect(`/admin/ladders/${ladderId}?message=${encodeURIComponent(message)}`);
}

function redirectWithError(ladderId: string, error: string) {
  redirect(`/admin/ladders/${ladderId}?error=${encodeURIComponent(error)}`);
}

async function updateLadderSettings(formData: FormData) {
  "use server";

  const ladderId = String(formData.get("ladderId") ?? "");
  const description = String(formData.get("description") ?? "").trim();
  const location = String(formData.get("location") ?? "").trim();
  const statusRaw = String(formData.get("status") ?? LadderStatus.ACTIVE);
  const registrationOpen = formData.get("registrationOpen") === "on";
  const maxPlayersRaw = String(formData.get("maxPlayers") ?? "").trim();
  const challengeRange = Number.parseInt(String(formData.get("challengeRange") ?? "3"), 10);
  const cooldownDays = Number.parseInt(String(formData.get("cooldownDays") ?? "3"), 10);
  const inactivityDays = Number.parseInt(String(formData.get("inactivityDays") ?? "30"), 10);

  if (!ladderId) {
    return;
  }

  const status =
    statusRaw === LadderStatus.PAUSED || statusRaw === LadderStatus.ARCHIVED
      ? statusRaw
      : LadderStatus.ACTIVE;

  const maxPlayers = maxPlayersRaw ? Number.parseInt(maxPlayersRaw, 10) : null;

  if (
    Number.isNaN(challengeRange) ||
    challengeRange < 1 ||
    Number.isNaN(cooldownDays) ||
    cooldownDays < 0 ||
    Number.isNaN(inactivityDays) ||
    inactivityDays < 1 ||
    (maxPlayers !== null && (Number.isNaN(maxPlayers) || maxPlayers < 2))
  ) {
    redirectWithError(ladderId, "Invalid ladder settings.");
  }

  await prisma.ladder.update({
    where: { id: ladderId },
    data: {
      description: description || null,
      location: location || null,
      status,
      registrationOpen,
      maxPlayers,
      challengeRange,
      cooldownDays,
      inactivityDays,
    },
  });

  revalidatePath(`/admin/ladders/${ladderId}`);
  revalidatePath(`/ladders/${ladderId}`);
  revalidatePath("/ladders");
  revalidatePath("/admin/ladders");
  redirectWithMessage(ladderId, "Ladder settings saved.");
}

async function addPlayer(formData: FormData) {
  "use server";

  const ladderId = String(formData.get("ladderId") ?? "");
  const fullName = String(formData.get("fullName") ?? "").trim().replace(/\s+/g, " ");
  const countryCode = String(formData.get("countryCode") ?? "")
    .trim()
    .toUpperCase()
    .slice(0, 3);

  if (!ladderId || !fullName) {
    return;
  }

  const ladder = await prisma.ladder.findUnique({
    where: { id: ladderId },
    include: { players: { where: { active: true }, select: { id: true, fullName: true } } },
  });

  if (!ladder) {
    return;
  }

  if (ladder.maxPlayers !== null && ladder.players.length >= ladder.maxPlayers) {
    redirectWithError(ladderId, "Ladder is full.");
  }

  const duplicate = ladder.players.find(
    (player) => normalizePlayerName(player.fullName) === normalizePlayerName(fullName),
  );
  if (duplicate) {
    redirectWithError(ladderId, "A player with this name is already on the ladder.");
  }

  const bottom = await prisma.ladderPlayer.findFirst({
    where: { ladderId },
    orderBy: { position: "desc" },
    select: { position: true },
  });

  await prisma.ladderPlayer.create({
    data: {
      ladderId,
      fullName,
      countryCode: countryCode || null,
      position: (bottom?.position ?? 0) + 1,
      active: true,
    },
  });

  revalidatePath(`/admin/ladders/${ladderId}`);
  revalidatePath(`/ladders/${ladderId}`);
  redirectWithMessage(ladderId, "Player added.");
}

async function removePlayer(formData: FormData) {
  "use server";

  const ladderId = String(formData.get("ladderId") ?? "");
  const playerId = String(formData.get("playerId") ?? "");

  if (!ladderId || !playerId) {
    return;
  }

  const openChallenge = await prisma.ladderChallenge.findFirst({
    where: {
      ladderId,
      status: { in: OPEN_CHALLENGE_STATUSES },
      OR: [{ challengerId: playerId }, { challengedId: playerId }],
    },
  });

  if (openChallenge) {
    redirectWithError(ladderId, "Cannot remove a player with an open challenge.");
  }

  const player = await prisma.ladderPlayer.findUnique({
    where: { id: playerId },
    select: { position: true, ladderId: true },
  });

  if (!player || player.ladderId !== ladderId) {
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.ladderChallenge.deleteMany({
      where: {
        ladderId,
        OR: [{ challengerId: playerId }, { challengedId: playerId }],
      },
    });

    await tx.ladderPlayer.delete({ where: { id: playerId } });

    await tx.ladderPlayer.updateMany({
      where: {
        ladderId,
        position: { gt: player.position },
      },
      data: {
        position: { decrement: 1 },
      },
    });
  });

  revalidatePath(`/admin/ladders/${ladderId}`);
  revalidatePath(`/ladders/${ladderId}`);
  redirectWithMessage(ladderId, "Player removed.");
}

async function createChallenge(formData: FormData) {
  "use server";

  const ladderId = String(formData.get("ladderId") ?? "");
  const challengerId = String(formData.get("challengerId") ?? "");
  const challengedId = String(formData.get("challengedId") ?? "");

  if (!ladderId || !challengerId || !challengedId) {
    return;
  }

  const ladder = await prisma.ladder.findUnique({
    where: { id: ladderId },
  });

  if (!ladder) {
    return;
  }

  const [challenger, challenged] = await Promise.all([
    prisma.ladderPlayer.findUnique({ where: { id: challengerId } }),
    prisma.ladderPlayer.findUnique({ where: { id: challengedId } }),
  ]);

  if (!challenger || !challenged || challenger.ladderId !== ladderId || challenged.ladderId !== ladderId) {
    redirectWithError(ladderId, "Invalid players for challenge.");
    return;
  }

  const [challengerOpen, challengedOpen] = await Promise.all([
    prisma.ladderChallenge.count({
      where: {
        ladderId,
        status: { in: OPEN_CHALLENGE_STATUSES },
        OR: [{ challengerId }, { challengedId: challengerId }],
      },
    }),
    prisma.ladderChallenge.count({
      where: {
        ladderId,
        status: { in: OPEN_CHALLENGE_STATUSES },
        OR: [{ challengerId: challengedId }, { challengedId }],
      },
    }),
  ]);

  const validationError = getChallengeValidationError({
    ladderStatus: ladder.status,
    challengeRange: ladder.challengeRange,
    cooldownDays: ladder.cooldownDays,
    challenger: {
      id: challenger.id,
      position: challenger.position,
      active: challenger.active,
      lastMatchAt: challenger.lastMatchAt,
    },
    challenged: {
      id: challenged.id,
      position: challenged.position,
      active: challenged.active,
      lastMatchAt: challenged.lastMatchAt,
    },
    challengerHasOpenChallenge: challengerOpen > 0,
    challengedHasOpenChallenge: challengedOpen > 0,
  });

  if (validationError) {
    redirectWithError(ladderId, validationError);
  }

  await prisma.ladderChallenge.create({
    data: {
      ladderId,
      challengerId,
      challengedId,
      status: LadderChallengeStatus.PENDING,
    },
  });

  revalidatePath(`/admin/ladders/${ladderId}`);
  revalidatePath(`/ladders/${ladderId}`);
  redirectWithMessage(ladderId, "Challenge created.");
}

async function acceptChallenge(formData: FormData) {
  "use server";

  const ladderId = String(formData.get("ladderId") ?? "");
  const challengeId = String(formData.get("challengeId") ?? "");

  if (!ladderId || !challengeId) {
    return;
  }

  await prisma.ladderChallenge.updateMany({
    where: {
      id: challengeId,
      ladderId,
      status: LadderChallengeStatus.PENDING,
    },
    data: { status: LadderChallengeStatus.ACCEPTED },
  });

  revalidatePath(`/admin/ladders/${ladderId}`);
  revalidatePath(`/ladders/${ladderId}`);
  redirectWithMessage(ladderId, "Challenge accepted.");
}

async function cancelChallenge(formData: FormData) {
  "use server";

  const ladderId = String(formData.get("ladderId") ?? "");
  const challengeId = String(formData.get("challengeId") ?? "");

  if (!ladderId || !challengeId) {
    return;
  }

  await prisma.ladderChallenge.updateMany({
    where: {
      id: challengeId,
      ladderId,
      status: { in: OPEN_CHALLENGE_STATUSES },
    },
    data: { status: LadderChallengeStatus.CANCELLED },
  });

  revalidatePath(`/admin/ladders/${ladderId}`);
  revalidatePath(`/ladders/${ladderId}`);
  redirectWithMessage(ladderId, "Challenge cancelled.");
}

async function completeChallenge(formData: FormData) {
  "use server";

  const ladderId = String(formData.get("ladderId") ?? "");
  const challengeId = String(formData.get("challengeId") ?? "");
  const challengerSets = Number.parseInt(String(formData.get("challengerSets") ?? ""), 10);
  const challengedSets = Number.parseInt(String(formData.get("challengedSets") ?? ""), 10);
  const courtRaw = String(formData.get("court") ?? "").trim();
  const court = courtRaw ? Number.parseInt(courtRaw, 10) : null;

  if (!ladderId || !challengeId || Number.isNaN(challengerSets) || Number.isNaN(challengedSets)) {
    redirectWithError(ladderId || "unknown", "Enter a valid best-of-3 set score.");
  }

  if (!isValidBestOfThreeSetsScore(challengerSets, challengedSets)) {
    redirectWithError(ladderId, "Valid scores are 2-0, 2-1, 1-2, or 0-2.");
  }

  const challenge = await prisma.ladderChallenge.findUnique({
    where: { id: challengeId },
    include: {
      challenger: true,
      challenged: true,
    },
  });

  if (!challenge || challenge.ladderId !== ladderId) {
    return;
  }

  if (
    challenge.status !== LadderChallengeStatus.PENDING &&
    challenge.status !== LadderChallengeStatus.ACCEPTED
  ) {
    redirectWithError(ladderId, "This challenge is already closed.");
  }

  const winnerId =
    challengerSets > challengedSets ? challenge.challengerId : challenge.challengedId;
  const completedAt = new Date();
  const swap = shouldSwapPositions(winnerId, challenge.challengerId);

  await prisma.$transaction(async (tx) => {
    await tx.ladderChallenge.update({
      where: { id: challengeId },
      data: {
        status: LadderChallengeStatus.COMPLETED,
        challengerSets,
        challengedSets,
        winnerId,
        completedAt,
        court: court && !Number.isNaN(court) ? court : null,
      },
    });

    await tx.ladderPlayer.update({
      where: { id: challenge.challengerId },
      data: { lastMatchAt: completedAt },
    });
    await tx.ladderPlayer.update({
      where: { id: challenge.challengedId },
      data: { lastMatchAt: completedAt },
    });

    if (swap) {
      const challengerPosition = challenge.challenger.position;
      const challengedPosition = challenge.challenged.position;
      const tempPosition = -challengerPosition;

      await tx.ladderPlayer.update({
        where: { id: challenge.challengerId },
        data: { position: tempPosition },
      });
      await tx.ladderPlayer.update({
        where: { id: challenge.challengedId },
        data: { position: challengerPosition },
      });
      await tx.ladderPlayer.update({
        where: { id: challenge.challengerId },
        data: { position: challengedPosition },
      });
    }
  });

  revalidatePath(`/admin/ladders/${ladderId}`);
  revalidatePath(`/ladders/${ladderId}`);
  redirectWithMessage(
    ladderId,
    swap ? "Result saved. Players swapped positions." : "Result saved. Rankings unchanged.",
  );
}

async function runInactivityCheck(formData: FormData) {
  "use server";

  const ladderId = String(formData.get("ladderId") ?? "");
  if (!ladderId) {
    return;
  }

  const ladder = await prisma.ladder.findUnique({
    where: { id: ladderId },
    include: {
      players: {
        where: { active: true },
        orderBy: { position: "asc" },
      },
    },
  });

  if (!ladder) {
    return;
  }

  const now = new Date();
  let drops = 0;

  // Process from bottom of ladder upward so one drop does not cascade incorrectly.
  const candidates = [...ladder.players].sort((a, b) => b.position - a.position);

  for (const player of candidates) {
    const current = await prisma.ladderPlayer.findUnique({
      where: { id: player.id },
    });

    if (
      !current ||
      !isInactivePlayer(
        {
          active: current.active,
          lastMatchAt: current.lastMatchAt,
          registeredAt: current.registeredAt,
        },
        ladder.inactivityDays,
        now,
      )
    ) {
      continue;
    }

    const playerBelow = await prisma.ladderPlayer.findFirst({
      where: {
        ladderId,
        active: true,
        position: current.position + 1,
      },
    });

    if (!playerBelow) {
      continue;
    }

    const tempPosition = -current.position;
    await prisma.$transaction([
      prisma.ladderPlayer.update({
        where: { id: current.id },
        data: { position: tempPosition },
      }),
      prisma.ladderPlayer.update({
        where: { id: playerBelow.id },
        data: { position: current.position },
      }),
      prisma.ladderPlayer.update({
        where: { id: current.id },
        data: { position: playerBelow.position },
      }),
    ]);
    drops += 1;
  }

  revalidatePath(`/admin/ladders/${ladderId}`);
  revalidatePath(`/ladders/${ladderId}`);
  redirectWithMessage(
    ladderId,
    drops > 0
      ? `Inactivity check complete. ${drops} player(s) dropped 1 spot.`
      : "Inactivity check complete. No drops needed.",
  );
}

async function deleteLadder(formData: FormData) {
  "use server";

  const ladderId = String(formData.get("ladderId") ?? "");

  if (!ladderId) {
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.ladderChallenge.deleteMany({ where: { ladderId } });
    await tx.ladderPlayer.deleteMany({ where: { ladderId } });
    await tx.ladder.delete({ where: { id: ladderId } });
  });

  revalidatePath("/admin/ladders");
  revalidatePath("/ladders");
  revalidatePath(`/ladders/${ladderId}`);
  revalidatePath("/");
  redirect("/admin/ladders");
}

export default async function AdminLadderDetailPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { error, message } = await searchParams;

  const ladder = await prisma.ladder.findUnique({
    where: { id },
    include: {
      players: {
        where: { active: true },
        orderBy: { position: "asc" },
      },
      challenges: {
        orderBy: { createdAt: "desc" },
        include: {
          challenger: true,
          challenged: true,
        },
        take: 40,
      },
    },
  });

  if (!ladder) {
    return (
      <div className="min-h-screen bg-zinc-50 px-3 py-6 sm:px-6 sm:py-12">
        <p>Ladder not found.</p>
        <Link href="/admin/ladders" className="mt-4 inline-block underline">
          Back
        </Link>
      </div>
    );
  }

  const openChallenges = ladder.challenges.filter((challenge) =>
    OPEN_CHALLENGE_STATUSES.includes(challenge.status),
  );
  const completedChallenges = ladder.challenges.filter(
    (challenge) => challenge.status === LadderChallengeStatus.COMPLETED,
  );

  return (
    <div className="min-h-screen bg-zinc-50 px-3 py-6 text-zinc-900 dark:bg-black dark:text-zinc-100 sm:px-6 sm:py-12">
      <main className="mx-auto w-full max-w-5xl">
        <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
          <Link href="/admin/ladders" className="underline underline-offset-2">
            ← All ladders
          </Link>
          <Link href={`/ladders/${ladder.id}`} className="underline underline-offset-2">
            Public page
          </Link>
        </div>

        <header className="rounded-2xl border border-black/10 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-zinc-950 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{ladder.name}</h1>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
                Challenge up to {ladder.challengeRange} places · Cooldown {ladder.cooldownDays} days ·
                Inactivity {ladder.inactivityDays} days · Best of 3 sets
              </p>
            </div>
            <DeleteLadderButton
              ladderId={ladder.id}
              ladderName={ladder.name}
              deleteLadder={deleteLadder}
            />
          </div>
        </header>

        {error ? (
          <p className="mt-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
            {error}
          </p>
        ) : null}
        {message ? (
          <p className="mt-4 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
            {message}
          </p>
        ) : null}

        <section className="mt-6 rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-950 sm:p-6">
          <h2 className="text-lg font-medium">Settings</h2>
          <form action={updateLadderSettings} className="mt-4 grid gap-4 sm:grid-cols-2">
            <input type="hidden" name="ladderId" value={ladder.id} />
            <label className="flex flex-col gap-2 sm:col-span-2">
              <span className="text-sm">Description</span>
              <input
                name="description"
                defaultValue={ladder.description ?? ""}
                className="rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/20"
              />
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-sm">Location</span>
              <input
                name="location"
                defaultValue={ladder.location ?? ""}
                className="rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/20"
              />
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-sm">Status</span>
              <select
                name="status"
                defaultValue={ladder.status}
                className="rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/20"
              >
                <option value={LadderStatus.ACTIVE}>ACTIVE</option>
                <option value={LadderStatus.PAUSED}>PAUSED</option>
                <option value={LadderStatus.ARCHIVED}>ARCHIVED</option>
              </select>
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-sm">Max players</span>
              <input
                name="maxPlayers"
                type="number"
                min={2}
                defaultValue={ladder.maxPlayers ?? ""}
                className="rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/20"
              />
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-sm">Challenge range</span>
              <input
                name="challengeRange"
                type="number"
                min={1}
                defaultValue={ladder.challengeRange}
                className="rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/20"
              />
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-sm">Cooldown days</span>
              <input
                name="cooldownDays"
                type="number"
                min={0}
                defaultValue={ladder.cooldownDays}
                className="rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/20"
              />
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-sm">Inactivity days</span>
              <input
                name="inactivityDays"
                type="number"
                min={1}
                defaultValue={ladder.inactivityDays}
                className="rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/20"
              />
            </label>
            <label className="flex items-center gap-2 sm:col-span-2">
              <input
                type="checkbox"
                name="registrationOpen"
                defaultChecked={ladder.registrationOpen}
                className="h-4 w-4"
              />
              <span className="text-sm">Public registration open</span>
            </label>
            <div className="sm:col-span-2">
              <button
                type="submit"
                className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900"
              >
                Save settings
              </button>
            </div>
          </form>
        </section>

        <section className="mt-6 rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-950 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-medium">Players ({ladder.players.length})</h2>
            <form action={runInactivityCheck}>
              <input type="hidden" name="ladderId" value={ladder.id} />
              <button
                type="submit"
                className="rounded-md border border-black/15 px-3 py-2 text-sm hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
              >
                Run inactivity check
              </button>
            </form>
          </div>

          <form action={addPlayer} className="mt-4 flex flex-wrap gap-2">
            <input type="hidden" name="ladderId" value={ladder.id} />
            <input
              name="fullName"
              required
              placeholder="Full name"
              className="min-w-[180px] flex-1 rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/20"
            />
            <input
              name="countryCode"
              placeholder="CYP"
              maxLength={3}
              className="w-20 rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/20"
            />
            <button
              type="submit"
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900"
            >
              Add player
            </button>
          </form>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead className="border-b border-black/10 dark:border-white/10">
                <tr>
                  <th className="px-2 py-2 font-medium">Pos</th>
                  <th className="px-2 py-2 font-medium">Player</th>
                  <th className="px-2 py-2 font-medium hidden sm:table-cell">Last match</th>
                  <th className="px-2 py-2 font-medium">Remove</th>
                </tr>
              </thead>
              <tbody>
                {ladder.players.map((player) => (
                  <tr key={player.id} className="border-b border-black/5 dark:border-white/5">
                    <td className="px-2 py-2">{player.position}</td>
                    <td className="px-2 py-2">
                      {player.fullName}
                      {player.countryCode ? ` (${player.countryCode})` : ""}
                    </td>
                    <td className="px-2 py-2 hidden sm:table-cell">
                      {player.lastMatchAt
                        ? player.lastMatchAt.toLocaleDateString("en-GB")
                        : "—"}
                    </td>
                    <td className="px-2 py-2">
                      <form action={removePlayer}>
                        <input type="hidden" name="ladderId" value={ladder.id} />
                        <input type="hidden" name="playerId" value={player.id} />
                        <button type="submit" className="text-red-700 underline dark:text-red-300">
                          Remove
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-6 rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-950 sm:p-6">
          <h2 className="text-lg font-medium">Create challenge</h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
            Challenger must be 1–{ladder.challengeRange} places below the challenged player.
          </p>
          <form action={createChallenge} className="mt-4 grid gap-3 sm:grid-cols-3">
            <input type="hidden" name="ladderId" value={ladder.id} />
            <label className="flex flex-col gap-2">
              <span className="text-sm">Challenger (lower rank)</span>
              <select
                name="challengerId"
                required
                className="rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/20"
              >
                <option value="">Select</option>
                {ladder.players.map((player) => (
                  <option key={player.id} value={player.id}>
                    #{player.position} {player.fullName}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-sm">Challenged (higher rank)</span>
              <select
                name="challengedId"
                required
                className="rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/20"
              >
                <option value="">Select</option>
                {ladder.players.map((player) => (
                  <option key={player.id} value={player.id}>
                    #{player.position} {player.fullName}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-end">
              <button
                type="submit"
                className="w-full rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900"
              >
                Create challenge
              </button>
            </div>
          </form>
        </section>

        <section className="mt-6 rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-950 sm:p-6">
          <h2 className="text-lg font-medium">Open challenges</h2>
          {openChallenges.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">No open challenges.</p>
          ) : (
            <div className="mt-4 grid gap-4">
              {openChallenges.map((challenge) => (
                <article
                  key={challenge.id}
                  className="rounded-lg border border-black/10 p-3 dark:border-white/10"
                >
                  <p className="text-sm font-medium">
                    #{challenge.challenger.position} {challenge.challenger.fullName} vs #
                    {challenge.challenged.position} {challenge.challenged.fullName}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">{challenge.status}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {challenge.status === LadderChallengeStatus.PENDING ? (
                      <form action={acceptChallenge}>
                        <input type="hidden" name="ladderId" value={ladder.id} />
                        <input type="hidden" name="challengeId" value={challenge.id} />
                        <button
                          type="submit"
                          className="rounded-md border border-black/15 px-3 py-1.5 text-xs hover:bg-black/5 dark:border-white/20"
                        >
                          Accept
                        </button>
                      </form>
                    ) : null}
                    <form action={cancelChallenge}>
                      <input type="hidden" name="ladderId" value={ladder.id} />
                      <input type="hidden" name="challengeId" value={challenge.id} />
                      <button
                        type="submit"
                        className="rounded-md border border-black/15 px-3 py-1.5 text-xs hover:bg-black/5 dark:border-white/20"
                      >
                        Cancel
                      </button>
                    </form>
                  </div>
                  <form action={completeChallenge} className="mt-3 flex flex-wrap items-center gap-2">
                    <input type="hidden" name="ladderId" value={ladder.id} />
                    <input type="hidden" name="challengeId" value={challenge.id} />
                    <input
                      name="challengerSets"
                      type="number"
                      min={0}
                      max={2}
                      required
                      placeholder="Ch sets"
                      className="w-20 rounded-md border border-black/15 px-2 py-1 text-xs dark:border-white/20"
                    />
                    <span className="text-xs">-</span>
                    <input
                      name="challengedSets"
                      type="number"
                      min={0}
                      max={2}
                      required
                      placeholder="Def sets"
                      className="w-20 rounded-md border border-black/15 px-2 py-1 text-xs dark:border-white/20"
                    />
                    <select
                      name="court"
                      className="rounded-md border border-black/15 px-2 py-1 text-xs dark:border-white/20"
                    >
                      <option value="">Court</option>
                      <option value="1">Court 1</option>
                      <option value="2">Court 2</option>
                      <option value="3">Court 3</option>
                    </select>
                    <button
                      type="submit"
                      className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
                    >
                      Save result (best of 3)
                    </button>
                  </form>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="mt-6 rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-950 sm:p-6">
          <h2 className="text-lg font-medium">Recent results</h2>
          {completedChallenges.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">No completed matches yet.</p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {completedChallenges.slice(0, 15).map((challenge) => (
                <li key={challenge.id}>
                  {challenge.challenger.fullName} {challenge.challengerSets}-
                  {challenge.challengedSets} {challenge.challenged.fullName}
                  {challenge.completedAt
                    ? ` · ${challenge.completedAt.toLocaleDateString("en-GB")}`
                    : ""}
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
