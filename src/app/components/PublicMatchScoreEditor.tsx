import MatchResultForm from "@/app/components/MatchResultForm";
import { formatMatchScoreDisplay } from "@/lib/match-setup";
import { updateMatchResult } from "@/lib/match-result-actions";
import type { MatchSetupType } from "@prisma/client";

type PublicMatchScoreEditorProps = {
  match: {
    id: string;
    homePlayerId: string;
    awayPlayerId: string;
    scheduledAt: Date | null;
    court: number | null;
    homeGames: number | null;
    awayGames: number | null;
    set1HomeGames: number | null;
    set1AwayGames: number | null;
    set2HomeGames: number | null;
    set2AwayGames: number | null;
    set3HomeGames: number | null;
    set3AwayGames: number | null;
  };
  tournamentId: string;
  matchSetupType: MatchSetupType;
};

export default function PublicMatchScoreEditor({
  match,
  tournamentId,
  matchSetupType,
}: PublicMatchScoreEditorProps) {
  const hasScore = match.set1HomeGames != null || match.homeGames != null;

  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold">
        Score:{" "}
        {formatMatchScoreDisplay(
          match.homeGames,
          match.awayGames,
          matchSetupType,
          match,
        )}
      </p>
      <MatchResultForm
        matchId={match.id}
        tournamentId={tournamentId}
        homePlayerId={match.homePlayerId}
        awayPlayerId={match.awayPlayerId}
        initialScheduledAt={match.scheduledAt}
        initialCourt={match.court}
        initialHomeGames={match.homeGames}
        initialAwayGames={match.awayGames}
        initialSet1HomeGames={match.set1HomeGames}
        initialSet1AwayGames={match.set1AwayGames}
        initialSet2HomeGames={match.set2HomeGames}
        initialSet2AwayGames={match.set2AwayGames}
        initialSet3HomeGames={match.set3HomeGames}
        initialSet3AwayGames={match.set3AwayGames}
        updateMatchResult={updateMatchResult}
        scoresOnly
        compact
        submitLabel={hasScore ? "Update score" : "Enter score"}
      />
    </div>
  );
}
