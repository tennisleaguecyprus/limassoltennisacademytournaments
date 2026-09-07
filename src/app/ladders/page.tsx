import Link from "next/link";
import { LadderStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export default async function LaddersPage() {
  const ladders = await prisma.ladder.findMany({
    where: {
      status: { in: [LadderStatus.ACTIVE, LadderStatus.PAUSED] },
    },
    orderBy: { name: "asc" },
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
            Choose a league to view the ranking and register.
          </p>
        </header>

        <section className="mt-6">
          {ladders.length === 0 ? (
            <p className="text-sm text-zinc-600 dark:text-zinc-300">No ladder leagues are open yet.</p>
          ) : (
            <div className="grid gap-3">
              {ladders.map((ladder) => (
                <article
                  key={ladder.id}
                  className="rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-950"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-base font-semibold sm:text-lg">{ladder.name}</h2>
                    <span className="rounded-full bg-zinc-900 px-2 py-1 text-xs font-medium text-white dark:bg-zinc-100 dark:text-zinc-900">
                      {ladder.status === LadderStatus.ACTIVE ? "Active" : "Paused"}
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
                    View ladder & register
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
