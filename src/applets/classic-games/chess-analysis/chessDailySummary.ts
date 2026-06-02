import type {
  ChessComTrackedTimeClass,
  DailyChessSummary,
  DailyTimeClassSummary,
  NormalizedChessGame,
} from "./chessReportTypes";

const timeClassOrder: ChessComTrackedTimeClass[] = ["blitz", "rapid"];

function emptySummary(date: string, timeClass: ChessComTrackedTimeClass): DailyTimeClassSummary {
  return {
    date,
    finalRating: null,
    firstKnownRating: null,
    games: [],
    gamesPlayed: 0,
    losses: 0,
    netChange: null,
    timeClass,
    wins: 0,
    draws: 0,
  };
}

export function summarizeDailyChessGames(games: NormalizedChessGame[]): DailyChessSummary[] {
  const summaryMap = new Map<string, DailyChessSummary>();

  for (const game of games) {
    const dailySummary =
      summaryMap.get(game.endDate) ??
      ({
        byTimeClass: {},
        date: game.endDate,
        games: [],
      } satisfies DailyChessSummary);
    const timeClassSummary =
      dailySummary.byTimeClass[game.timeClass] ?? emptySummary(game.endDate, game.timeClass);

    timeClassSummary.games.push(game);
    timeClassSummary.gamesPlayed += 1;
    if (game.result === "win") {
      timeClassSummary.wins += 1;
    } else if (game.result === "loss") {
      timeClassSummary.losses += 1;
    } else if (game.result === "draw") {
      timeClassSummary.draws += 1;
    }

    if (game.playerRatingAfterGame !== null) {
      timeClassSummary.firstKnownRating ??= game.playerRatingAfterGame;
      timeClassSummary.finalRating = game.playerRatingAfterGame;
      timeClassSummary.netChange =
        timeClassSummary.firstKnownRating === null || timeClassSummary.finalRating === null
          ? null
          : timeClassSummary.finalRating - timeClassSummary.firstKnownRating;
    }

    dailySummary.games.push(game);
    dailySummary.byTimeClass[game.timeClass] = timeClassSummary;
    summaryMap.set(game.endDate, dailySummary);
  }

  return [...summaryMap.values()]
    .map((summary) => ({
      ...summary,
      games: [...summary.games].sort((left, right) => right.endTimestamp - left.endTimestamp),
      byTimeClass: Object.fromEntries(
        timeClassOrder
          .map((timeClass) => summary.byTimeClass[timeClass])
          .filter((timeClassSummary): timeClassSummary is DailyTimeClassSummary => Boolean(timeClassSummary))
          .map((timeClassSummary) => [
            timeClassSummary.timeClass,
            {
              ...timeClassSummary,
              games: [...timeClassSummary.games].sort((left, right) => right.endTimestamp - left.endTimestamp),
            },
          ]),
      ),
    }))
    .sort((left, right) => right.date.localeCompare(left.date));
}
