import type {
  ChessComTrackedTimeClass,
  ChessGameResult,
  ChessPlayerColor,
  EngineEvaluation,
  NormalizedChessGame,
} from "./chessReportTypes";

export type PersonalChessTimeClass = ChessComTrackedTimeClass | "daily" | "other";

export type PersonalChessOutcome = "draw" | "loss" | "other" | "win";

export type PersonalChessLeakTag =
  | "opening-plan-failure"
  | "missed-tactic"
  | "ignored-threat"
  | "hung-piece"
  | "bad-trade"
  | "king-safety"
  | "time-pressure"
  | "conversion-failure"
  | "endgame-technique"
  | "tilt-game"
  | "unknown";

export type PersonalChessGame = {
  eco: string | null;
  endDate: string;
  endTimestamp: number;
  gameId: string;
  gameUrl: string;
  importedAt: string;
  moveCount: number | null;
  normalizedResult: PersonalChessOutcome;
  opening: string | null;
  opponentRating: number | null;
  opponentUsername: string;
  pgn: string;
  playerColor: ChessPlayerColor;
  playerRatingAfterGame: number | null;
  rated: boolean;
  ratingChange: number | null;
  rawTimeClass: string | null;
  result: ChessGameResult;
  rules: string;
  termination: string | null;
  timeClass: PersonalChessTimeClass;
  timeControl: string | null;
};

export type PersonalChessMistake = {
  bestMove: string;
  centipawnLoss: number;
  createdAt: string;
  date: string;
  evalAfter: EngineEvaluation;
  evalBefore: EngineEvaluation;
  evalDrop: number;
  fenAfter: string;
  fenBefore: string;
  gameId: string;
  gameUrl: string;
  id: string;
  leakTag: PersonalChessLeakTag;
  moveNumber: number;
  playedMove: string;
  playedMoveUci: string;
  playerColor: ChessPlayerColor;
  sideToMove: ChessPlayerColor;
  source: "stockfish-lite-single";
  timeClass: PersonalChessTimeClass;
};

export type PersonalDrillStatus = "failed" | "needs-review" | "solved";

export type PersonalDrillReview = {
  attempts: number;
  correct: number;
  incorrect: number;
  intervalDays: number;
  lastReviewedDate: string | null;
  nextDueDate: string;
  status: PersonalDrillStatus;
};

export type PersonalChessSyncMeta = {
  archiveUrls: string[];
  importedGameCount: number;
  lastError: string | null;
  lastSyncedAt: string | null;
  username: string;
};

export type PersonalChessImportResult = {
  duplicateCount: number;
  importedCount: number;
  insertedCount: number;
  totalCount: number;
  updatedCount: number;
};

export function isTrackedPersonalTimeClass(timeClass: PersonalChessTimeClass): timeClass is ChessComTrackedTimeClass {
  return timeClass === "bullet" || timeClass === "blitz" || timeClass === "rapid";
}

export function personalGameToNormalized(game: PersonalChessGame): NormalizedChessGame | null {
  if (!isTrackedPersonalTimeClass(game.timeClass)) {
    return null;
  }

  return {
    endDate: game.endDate,
    endTimestamp: game.endTimestamp,
    gameUrl: game.gameUrl,
    opponentRating: game.opponentRating,
    opponentUsername: game.opponentUsername,
    pgn: game.pgn,
    playerColor: game.playerColor,
    playerRatingAfterGame: game.playerRatingAfterGame,
    rated: game.rated,
    result: game.normalizedResult === "other" ? game.result : game.normalizedResult,
    timeClass: game.timeClass,
  };
}

export function personalGamesToNormalized(games: PersonalChessGame[]): NormalizedChessGame[] {
  return games
    .map(personalGameToNormalized)
    .filter((game): game is NormalizedChessGame => Boolean(game))
    .sort((left, right) => left.endTimestamp - right.endTimestamp);
}
