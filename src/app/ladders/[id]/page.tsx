import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { LadderChallengeStatus, LadderStatus } from "@prisma/client";

import {
  formatLadderLevelLabel,
  isValidPhone,
  normalizePhone,
  normalizePlayerName,
} from "@/lib/ladder";
import { prisma } from "@/lib/prisma";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; message?: string }>;
};

async function registerPlayer(formData: FormData) {
  "use server";

  const ladderId = String(formData.get("ladderId") ?? "");
  const fullName = String(formData.get("fullName") ?? "").trim().replace(/\s+/g, " ");
  const phone = normalizePhone(String(formData.get("phone") ?? ""));

  if (!ladderId || !fullName || !phone) {
    redirect(
      `/ladders/${ladderId || ""}?error=${encodeURIComponent("Please enter full name and telephone number.")}`,
    );
  }

  if (!isValidPhone(phone)) {
    redirect(`/ladders/${ladderId}?error=${encodeURIComponent("Please enter a valid telephone number.")}`);
  }

  const ladder = await prisma.ladder.findUnique({
    where: { id: ladderId },
    include: {
      players: {
        where: { active: true },
        select: { fullName: true, phone: true },
      },
    },
  });

  if (!ladder || ladder.status !== LadderStatus.ACTIVE) {
    redirect(`/ladders/${ladderId}?error=${encodeURIComponent("This ladder is not open for registration.")}`);
  }

  if (!ladder.registrationOpen) {
    redirect(`/ladders/${ladderId}?error=${encodeURIComponent("Registration is currently closed.")}`);
  }

  if (ladder.maxPlayers !== null && ladder.players.length >= ladder.maxPlayers) {
    redirect(`/ladders/${ladderId}?error=${encodeURIComponent("This ladder is full.")}`);
  }

  const duplicate = ladder.players.find(
    (player) =>
      normalizePlayerName(player.fullName) === normalizePlayerName(fullName) ||
      normalizePhone(player.phone) === phone,
  );
  if (duplicate) {
    redirect(
      `/ladders/${ladderId}?error=${encodeURIComponent("This name or telephone is already registered on this ladder.")}`,
    );
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
      phone,
      position: (bottom?.position ?? 0) + 1,
      active: true,
    },
  });

  revalidatePath(`/ladders/${ladderId}`);
  revalidatePath(`/admin/ladders/${ladderId}`);
  revalidatePath("/ladders");
  redirect(`/ladders/${ladderId}?message=${encodeURIComponent("You are registered on the ladder.")}`);
}

export default async function LadderDetailPage({ params, searchParams }: PageProps) {
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
        where: {
          status: {
            in: [
              LadderChallengeStatus.PENDING,
              LadderChallengeStatus.ACCEPTED,
              LadderChallengeStatus.COMPLETED,
            ],
          },
        },
        orderBy: { createdAt: "desc" },
        include: {
          challenger: true,
          challenged: true,
        },
        take: 20,
      },
    },
  });

  if (!ladder) {
    return (
      <div className="min-h-screen bg-zinc-50 px-3 py-6 sm:px-6 sm:py-12">
        <p>Ladder not found.</p>
        <Link href="/ladders" className="mt-4 inline-block underline">
          Back to ladders
        </Link>
      </div>
    );
  }

  const canRegister =
    ladder.status === LadderStatus.ACTIVE &&
    ladder.registrationOpen &&
    (ladder.maxPlayers === null || ladder.players.length < ladder.maxPlayers);

  const openChallenges = ladder.challenges.filter(
    (challenge) =>
      challenge.status === LadderChallengeStatus.PENDING ||
      challenge.status === LadderChallengeStatus.ACCEPTED,
  );
  const recentResults = ladder.challenges.filter(
    (challenge) => challenge.status === LadderChallengeStatus.COMPLETED,
  );

  return (
    <div className="min-h-screen bg-zinc-50 px-3 py-6 text-zinc-900 dark:bg-black dark:text-zinc-100 sm:px-6 sm:py-12">
      <main className="mx-auto w-full max-w-5xl">
        <div className="mb-4 text-sm">
          <Link href="/ladders" className="underline underline-offset-2">
            ← All ladders
          </Link>
        </div>

        <header className="rounded-2xl border border-black/10 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-zinc-950 sm:p-8">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{ladder.name}</h1>
            <span className="rounded-full bg-zinc-900 px-2 py-1 text-xs font-medium text-white dark:bg-zinc-100 dark:text-zinc-900">
              {formatLadderLevelLabel(ladder.level)}
            </span>
          </div>
          {ladder.description ? (
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">{ladder.description}</p>
          ) : null}
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
            {ladder.location ?? "Location to be announced"}
            {" • "}
            Challenge up to {ladder.challengeRange} places
            {" • "}
            Best of 3 sets
            {" • "}
            Cooldown {ladder.cooldownDays} days
          </p>
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
          <h2 className="text-lg font-medium">Register for {formatLadderLevelLabel(ladder.level)}</h2>
          {canRegister ? (
            <>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
                New players join at the bottom of this ladder.
              </p>
              <form action={registerPlayer} className="mt-4 grid gap-3 sm:grid-cols-2">
                <input type="hidden" name="ladderId" value={ladder.id} />
                <label className="flex flex-col gap-2">
                  <span className="text-sm">Full name</span>
                  <input
                    name="fullName"
                    required
                    placeholder="Full name"
                    className="rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/20"
                  />
                </label>
                <label className="flex flex-col gap-2">
                  <span className="text-sm">Telephone number</span>
                  <input
                    name="phone"
                    type="tel"
                    required
                    placeholder="e.g. 99 123456"
                    className="rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/20"
                  />
                </label>
                <div className="sm:col-span-2">
                  <button
                    type="submit"
                    className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900"
                  >
                    Register
                  </button>
                </div>
              </form>
            </>
          ) : (
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
              Registration is not available for this ladder right now.
            </p>
          )}
        </section>

        <section className="mt-6 rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-950 sm:p-6">
          <h2 className="text-lg font-medium">Ladder ranking</h2>
          {ladder.players.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">No players yet.</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[360px] text-left text-sm">
                <thead className="border-b border-black/10 dark:border-white/10">
                  <tr>
                    <th className="px-2 py-2 font-medium">Pos</th>
                    <th className="px-2 py-2 font-medium">Player</th>
                  </tr>
                </thead>
                <tbody>
                  {ladder.players.map((player) => (
                    <tr key={player.id} className="border-b border-black/5 dark:border-white/5">
                      <td className="px-2 py-2 font-medium">{player.position}</td>
                      <td className="px-2 py-2">{player.fullName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="mt-6 rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-950 sm:p-6">
          <h2 className="text-lg font-medium">Open challenges</h2>
          {openChallenges.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">No open challenges.</p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {openChallenges.map((challenge) => (
                <li key={challenge.id}>
                  #{challenge.challenger.position} {challenge.challenger.fullName} challenged #
                  {challenge.challenged.position} {challenge.challenged.fullName} (
                  {challenge.status.toLowerCase()})
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-6 rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-950 sm:p-6">
          <h2 className="text-lg font-medium">Recent results</h2>
          {recentResults.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">No results yet.</p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {recentResults.map((challenge) => (
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
