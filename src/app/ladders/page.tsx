import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { LadderStatus } from "@prisma/client";

import {
  LADDER_LEVEL_OPTIONS,
  formatLadderLevelLabel,
  isValidPhone,
  normalizePhone,
  normalizePlayerName,
  parseLadderLevel,
} from "@/lib/ladder";
import { prisma } from "@/lib/prisma";

type PageProps = {
  searchParams: Promise<{ error?: string; message?: string }>;
};

async function registerPlayer(formData: FormData) {
  "use server";

  const fullName = String(formData.get("fullName") ?? "").trim().replace(/\s+/g, " ");
  const phone = normalizePhone(String(formData.get("phone") ?? ""));
  const level = parseLadderLevel(String(formData.get("level") ?? ""));

  if (!fullName || !phone || !level) {
    redirect(`/ladders?error=${encodeURIComponent("Please enter full name, telephone, and level.")}`);
  }

  if (!isValidPhone(phone)) {
    redirect(`/ladders?error=${encodeURIComponent("Please enter a valid telephone number.")}`);
  }

  const ladder = await prisma.ladder.findFirst({
    where: {
      level,
      status: LadderStatus.ACTIVE,
      registrationOpen: true,
    },
    include: {
      players: {
        where: { active: true },
        select: { fullName: true, phone: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  if (!ladder) {
    redirect(
      `/ladders?error=${encodeURIComponent(
        `No open ${formatLadderLevelLabel(level)} ladder is available for registration.`,
      )}`,
    );
  }

  if (ladder.maxPlayers !== null && ladder.players.length >= ladder.maxPlayers) {
    redirect(`/ladders?error=${encodeURIComponent("That ladder is full.")}`);
  }

  const duplicate = ladder.players.find(
    (player) =>
      normalizePlayerName(player.fullName) === normalizePlayerName(fullName) ||
      normalizePhone(player.phone) === phone,
  );
  if (duplicate) {
    redirect(
      `/ladders?error=${encodeURIComponent("This name or telephone is already registered on that ladder.")}`,
    );
  }

  const bottom = await prisma.ladderPlayer.findFirst({
    where: { ladderId: ladder.id },
    orderBy: { position: "desc" },
    select: { position: true },
  });

  await prisma.ladderPlayer.create({
    data: {
      ladderId: ladder.id,
      fullName,
      phone,
      position: (bottom?.position ?? 0) + 1,
      active: true,
    },
  });

  revalidatePath(`/ladders/${ladder.id}`);
  revalidatePath(`/admin/ladders/${ladder.id}`);
  revalidatePath("/ladders");
  redirect(
    `/ladders/${ladder.id}?message=${encodeURIComponent(
      `You are registered on the ${formatLadderLevelLabel(level)} ladder.`,
    )}`,
  );
}

export default async function LaddersPage({ searchParams }: PageProps) {
  const { error, message } = await searchParams;

  const ladders = await prisma.ladder.findMany({
    where: {
      status: { in: [LadderStatus.ACTIVE, LadderStatus.PAUSED] },
    },
    orderBy: [{ level: "asc" }, { name: "asc" }],
    include: {
      _count: {
        select: {
          players: {
            where: { active: true },
          },
        },
      },
    },
  });

  const openLevels = new Set(
    ladders
      .filter(
        (ladder) =>
          ladder.status === LadderStatus.ACTIVE &&
          ladder.registrationOpen &&
          (ladder.maxPlayers === null || ladder._count.players < ladder.maxPlayers),
      )
      .map((ladder) => ladder.level),
  );

  return (
    <div className="min-h-screen bg-zinc-50 px-3 py-6 text-zinc-900 dark:bg-black dark:text-zinc-100 sm:px-6 sm:py-12">
      <main className="mx-auto w-full max-w-5xl">
        <div className="mb-4 text-sm">
          <Link href="/" className="underline underline-offset-2">
            ← Home
          </Link>
        </div>

        <header className="rounded-2xl border border-black/10 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-zinc-950 sm:p-8">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Ladder Leagues</h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
            Register with your full name, telephone, and level. Each level has its own ladder.
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
          <h2 className="text-lg font-medium">Register</h2>
          {openLevels.size === 0 ? (
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
              Registration is not open for any ladder right now.
            </p>
          ) : (
            <form action={registerPlayer} className="mt-4 grid gap-3 sm:grid-cols-2">
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
              <label className="flex flex-col gap-2 sm:col-span-2">
                <span className="text-sm">Level</span>
                <select
                  name="level"
                  required
                  defaultValue=""
                  className="rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/20"
                >
                  <option value="" disabled>
                    Select your level
                  </option>
                  {LADDER_LEVEL_OPTIONS.filter((option) => openLevels.has(option.value)).map(
                    (option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ),
                  )}
                </select>
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
          )}
        </section>

        <section className="mt-6">
          <h2 className="text-xl font-semibold">Ladders by level</h2>
          {ladders.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">No ladder leagues are open yet.</p>
          ) : (
            <div className="mt-4 grid gap-3">
              {ladders.map((ladder) => (
                <article
                  key={ladder.id}
                  className="rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-950"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-base font-semibold sm:text-lg">{ladder.name}</h3>
                    <span className="rounded-full bg-zinc-900 px-2 py-1 text-xs font-medium text-white dark:bg-zinc-100 dark:text-zinc-900">
                      {formatLadderLevelLabel(ladder.level)}
                    </span>
                  </div>
                  {ladder.description ? (
                    <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
                      {ladder.description}
                    </p>
                  ) : null}
                  <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
                    {ladder.location ?? "Location to be announced"}
                    {" • "}
                    {ladder._count.players} players
                    {" • "}
                    {ladder.registrationOpen ? "Registration open" : "Registration closed"}
                  </p>
                  <Link
                    href={`/ladders/${ladder.id}`}
                    className="mt-3 block rounded-md border border-black/10 px-3 py-2 text-center text-sm hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10 sm:inline-block"
                  >
                    View ranking
                  </Link>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
