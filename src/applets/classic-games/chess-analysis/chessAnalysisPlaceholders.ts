import type { DailyReviewPlaceholders, NormalizedChessGame } from "./chessReportTypes";

export type ChessAnalyzer = {
  analyzeDailyGames: (games: NormalizedChessGame[]) => Promise<DailyReviewPlaceholders>;
};

export function createEngineAnalysisPlaceholder(): DailyReviewPlaceholders {
  return {
    criticalMoves: Array.from({ length: 5 }, (_, index) => ({
      label: `Critical move slot ${index + 1}`,
      status: "not_wired",
    })),
    homeworkPuzzles: Array.from({ length: 3 }, (_, index) => ({
      label: `Homework puzzle slot ${index + 1}`,
      status: "not_wired",
    })),
    weeklyReportSummary: "Engine analysis not wired yet.",
  };
}

export const placeholderChessAnalyzer: ChessAnalyzer = {
  async analyzeDailyGames() {
    return createEngineAnalysisPlaceholder();
  },
};
