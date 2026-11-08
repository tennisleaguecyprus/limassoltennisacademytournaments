"use client";

import { formatMatchTime } from "@/lib/match-schedule";

type MatchResultFormProps = {
  matchId: string;
  tournamentId: string;
  homePlayerId: string;
  awayPlayerId: string;
  initialScheduledAt: Date | null;
  initialCourt: number | null;
  initialHomeGames: number | null;
  initialAwayGames: number | null;
  initialSet1HomeGames?: number | null;
  initialSet1AwayGames?: number | null;
  initialSet2HomeGames?: number | null;
  initialSet2AwayGames?: number | null;
  initialSet3HomeGames?: number | null;
  initialSet3AwayGames?: number | null;
  updateMatchResult: (formData: FormData) => Promise<void>;
  scoreInputLabel?: string;
  useSetsScoring?: boolean;
  compact?: boolean;
  /** When true, only set scores are editable (for public users). */
  scoresOnly?: boolean;
  submitLabel?: string;
};

export default function MatchResultForm({
  matchId,
  tournamentId,
  homePlayerId,
  awayPlayerId,
  initialScheduledAt,
  initialCourt,
  initialSet1HomeGames = null,
  initialSet1AwayGames = null,
  initialSet2HomeGames = null,
  initialSet2AwayGames = null,
  initialSet3HomeGames = null,
  initialSet3AwayGames = null,
  updateMatchResult,
  compact = false,
  scoresOnly = false,
  submitLabel = "Save",
}: MatchResultFormProps) {
  const inputClass = `rounded-md border border-black/15 px-2 py-1 text-xs dark:border-white/20 ${
    compact ? "w-12" : "w-14"
  }`;

  return (
    <form
      action={updateMatchResult}
      className="flex flex-wrap items-center gap-2"
    >
      <input type="hidden" name="matchId" value={matchId} />
      <input type="hidden" name="tournamentId" value={tournamentId} />
      <input type="hidden" name="homePlayerId" value={homePlayerId} />
      <input type="hidden" name="awayPlayerId" value={awayPlayerId} />
      {scoresOnly ? <input type="hidden" name="scoresOnly" value="1" /> : null}

      {!scoresOnly && (
        <>
          <label className="flex items-center gap-1 text-xs text-zinc-600 dark:text-zinc-300">
            <span className="sr-only">Time</span>
            <input
              name="scheduledTime"
              type="time"
              defaultValue={formatMatchTime(initialScheduledAt)}
              className="rounded-md border border-black/15 px-2 py-1 text-xs dark:border-white/20"
            />
          </label>
          <label className="flex items-center gap-1 text-xs text-zinc-600 dark:text-zinc-300">
            <span className="sr-only">Court</span>
            <select
              name="court"
              defaultValue={initialCourt ? String(initialCourt) : ""}
              className="rounded-md border border-black/15 px-2 py-1 text-xs dark:border-white/20"
            >
              <option value="">Court</option>
              <option value="1">Court 1</option>
              <option value="2">Court 2</option>
              <option value="3">Court 3</option>
            </select>
          </label>
        </>
      )}

      <span className="text-[10px] text-zinc-500">S1</span>
      <input
        name="set1HomeGames"
        type="number"
        min={0}
        max={20}
        required
        placeholder="H"
        title="Set 1 home games"
        defaultValue={initialSet1HomeGames ?? ""}
        className={inputClass}
      />
      <span className="text-xs">-</span>
      <input
        name="set1AwayGames"
        type="number"
        min={0}
        max={20}
        required
        placeholder="A"
        title="Set 1 away games"
        defaultValue={initialSet1AwayGames ?? ""}
        className={inputClass}
      />

      <span className="text-[10px] text-zinc-500">S2</span>
      <input
        name="set2HomeGames"
        type="number"
        min={0}
        max={20}
        placeholder="H"
        title="Set 2 home games (optional for 1-set matches)"
        defaultValue={initialSet2HomeGames ?? ""}
        className={inputClass}
      />
      <span className="text-xs">-</span>
      <input
        name="set2AwayGames"
        type="number"
        min={0}
        max={20}
        placeholder="A"
        title="Set 2 away games"
        defaultValue={initialSet2AwayGames ?? ""}
        className={inputClass}
      />

      <span className="text-[10px] text-zinc-500">S3</span>
      <input
        name="set3HomeGames"
        type="number"
        min={0}
        max={20}
        placeholder="H"
        title="Set 3 / super TB (only if 1-1)"
        defaultValue={initialSet3HomeGames ?? ""}
        className={inputClass}
      />
      <span className="text-xs">-</span>
      <input
        name="set3AwayGames"
        type="number"
        min={0}
        max={20}
        placeholder="A"
        title="Set 3 / super TB away"
        defaultValue={initialSet3AwayGames ?? ""}
        className={inputClass}
      />

      <button
        type="submit"
        className="rounded-md border border-black/15 px-2 py-1 text-xs hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
      >
        {submitLabel}
      </button>
    </form>
  );
}
