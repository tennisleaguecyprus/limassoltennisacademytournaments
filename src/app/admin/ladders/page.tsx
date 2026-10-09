import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { LadderStatus } from "@prisma/client";

import DeleteLadderButton from "@/app/components/DeleteLadderButton";
import {
  LADDER_LEVEL_OPTIONS,
  formatLadderLevelLabel,
  parseLadderLevel,
} from "@/lib/ladder";
import { prisma } from "@/lib/prisma";

async function createLadder(formData: FormData) {
  "use server";

  const name = String(formData.get("name") ?? "").trim();
  const level = parseLadderLevel(String(formData.get("level") ?? ""));
  const description = String(formData.get("description") ?? "").trim();
  const location = String(formData.get("location") ?? "").trim();
  const maxPlayersRaw = String(formData.get("maxPlayers") ?? "").trim();
  const challengeRangeRaw = String(formData.get("challengeRange") ?? "3").trim();
  const cooldownDaysRaw = String(formData.get("cooldownDays") ?? "3").trim();
  const inactivityDaysRaw = String(formData.get("inactivityDays") ?? "30").trim();

  if (!name || !level) {
    return;
  }

  const maxPlayers = maxPlayersRaw ? Number.parseInt(maxPlayersRaw, 10) : null;
  const challengeRange = Number.parseInt(challengeRangeRaw, 10);
  const cooldownDays = Number.parseInt(cooldownDaysRaw, 10);
  const inactivityDays = Number.parseInt(inactivityDaysRaw, 10);

  if (
    Number.isNaN(challengeRange) ||
    challengeRange < 1 ||
    Number.isNaN(cooldownDays) ||
    cooldownDays < 0 ||
    Number.isNaN(inactivityDays) ||
    inactivityDays < 1 ||
    (maxPlayers !== null && (Number.isNaN(maxPlayers) || maxPlayers < 2))
  ) {
    return;
  }

  const existingActive = await prisma.ladder.findFirst({
    where: {
      level,
      status: { in: [LadderStatus.ACTIVE, LadderStatus.PAUSED] },
    },
    select: { id: true, name: true },
  });

  if (existingActive) {
    redirect(
      `/admin/ladders?error=${encodeURIComponent(
        `An active ${formatLadderLevelLabel(level)} ladder already exists (${existingActive.name}).`,
      )}`,
    );
  }

  await prisma.ladder.create({
    data: {
      name,
      level,
      description: description || null,
      location: location || null,
      maxPlayers,
      challengeRange,
      cooldownDays,
      inactivityDays,
      registrationOpen: true,
      status: LadderStatus.ACTIVE,
    },
  });

  revalidatePath("/admin/ladders");
  revalidatePath("/ladders");
  revalidatePath("/");
  redirect("/admin/ladders");
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
}

type PageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function AdminLaddersPage({ searchParams }: PageProps) {
  const { error } = await searchParams;

  const ladders = await prisma.ladder.findMany({
    orderBy: [{ status: "asc" }, { level: "asc" }, { name: "asc" }],
    include: {
      _count: {
        select: {
          players: true,
          challenges: true,
        },
      },
    },
  });

  return (
    <div className="min-h-screen bg-zinc-50 px-3 py-6 text-zinc-900 dark:bg-black dark:text-zinc-100 sm:px-6 sm:py-12">
      <main className="mx-auto w-full max-w-5xl">
        <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
          <Link href="/admin" className="underline underline-offset-2">
            ← Admin tournaments
          </Link>
          <Link href="/ladders" className="underline underline-offset-2">
            Public ladders
          </Link>
        </div>

        <header className="rounded-2xl border border-black/10 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-zinc-950 sm:p-8">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Ladder Leagues</h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
            Create one ladder per level (Beginner, Beginner/Intermediate, Intermediate, Advanced).
            Players register with full name, telephone, and level.
          </p>
        </header>

        {error ? (
          <p className="mt-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
            {error}
          </p>
        ) : null}

        <section className="mt-6 rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-950 sm:mt-8 sm:p-6">
          <h2 className="text-lg font-medium">Create ladder league</h2>
          <form action={createLadder} className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-2">
              <span className="text-sm text-zinc-700 dark:text-zinc-300">League name</span>
              <input
                name="name"
                required
                className="rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-500 dark:border-white/20"
                placeholder="Beginners Ladder"
              />
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-sm text-zinc-700 dark:text-zinc-300">Level</span>
              <select
                name="level"
                required
                defaultValue=""
                className="rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-500 dark:border-white/20"
              >
                <option value="" disabled>
                  Select level
                </option>
                {LADDER_LEVEL_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-2 sm:col-span-2">
              <span className="text-sm text-zinc-700 dark:text-zinc-300">Description</span>
              <input
                name="description"
                className="rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-500 dark:border-white/20"
                placeholder="For new players learning match play"
              />
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-sm text-zinc-700 dark:text-zinc-300">Location</span>
              <input
                name="location"
                className="rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-500 dark:border-white/20"
                placeholder="Limassol"
              />
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-sm text-zinc-700 dark:text-zinc-300">Max players (optional)</span>
              <input
                name="maxPlayers"
                type="number"
                min={2}
                className="rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-500 dark:border-white/20"
                placeholder="32"
              />
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-sm text-zinc-700 dark:text-zinc-300">Challenge range</span>
              <input
                name="challengeRange"
                type="number"
                min={1}
                defaultValue={3}
                className="rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-500 dark:border-white/20"
              />
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-sm text-zinc-700 dark:text-zinc-300">Cooldown days</span>
              <input
                name="cooldownDays"
                type="number"
                min={0}
                defaultValue={3}
                className="rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-500 dark:border-white/20"
              />
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-sm text-zinc-700 dark:text-zinc-300">Inactivity days</span>
              <input
                name="inactivityDays"
                type="number"
                min={1}
                defaultValue={30}
                className="rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-500 dark:border-white/20"
              />
            </label>

            <div className="sm:col-span-2">
              <button
                type="submit"
                className="w-full rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 sm:w-auto dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
              >
                Create ladder
              </button>
            </div>
          </form>
        </section>

        <section className="mt-6 rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-950 sm:mt-8 sm:p-6">
          <h2 className="text-lg font-medium">All ladders</h2>
          {ladders.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">No ladder leagues yet.</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="border-b border-black/10 dark:border-white/10">
                  <tr>
                    <th className="px-2 py-2 font-medium">Name</th>
                    <th className="px-2 py-2 font-medium">Level</th>
                    <th className="px-2 py-2 font-medium">Status</th>
                    <th className="px-2 py-2 font-medium">Players</th>
                    <th className="px-2 py-2 font-medium hidden sm:table-cell">Registration</th>
                    <th className="px-2 py-2 font-medium">Manage</th>
                    <th className="px-2 py-2 font-medium">Delete</th>
                  </tr>
                </thead>
                <tbody>
                  {ladders.map((ladder) => (
                    <tr key={ladder.id} className="border-b border-black/5 dark:border-white/5">
                      <td className="px-2 py-2 font-medium">{ladder.name}</td>
                      <td className="px-2 py-2">{formatLadderLevelLabel(ladder.level)}</td>
                      <td className="px-2 py-2">{ladder.status}</td>
                      <td className="px-2 py-2">{ladder._count.players}</td>
                      <td className="px-2 py-2 hidden sm:table-cell">
                        {ladder.registrationOpen ? "Open" : "Closed"}
                      </td>
                      <td className="px-2 py-2">
                        <Link
                          href={`/admin/ladders/${ladder.id}`}
                          className="underline underline-offset-2"
                        >
                          Open
                        </Link>
                      </td>
                      <td className="px-2 py-2">
                        <DeleteLadderButton
                          ladderId={ladder.id}
                          ladderName={ladder.name}
                          deleteLadder={deleteLadder}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
