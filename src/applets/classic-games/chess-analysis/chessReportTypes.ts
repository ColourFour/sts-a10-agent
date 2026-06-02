export type ChessComTrackedTimeClass = "blitz" | "rapid";

export type ChessGameResult =
  | "win"
  | "loss"
  | "draw"
  | "resigned"
  | "timeout"
  | "checkmated"
  | "agreed"
  | "repetition"
  | "stalemate"
  | "insufficient"
  | "abandoned"
  | "unknown";

export type ChessPlayerColor = "white" | "black";

export type NormalizedChessGame = {
  gameUrl: string;
  pgn: string;
  timeClass: ChessComTrackedTimeClass;
  endTimestamp: number;
  endDate: string;
  playerColor: ChessPlayerColor;
  result: ChessGameResult;
  playerRatingAfterGame: number | null;
  opponentUsername: string;
  opponentRating: number | null;
  rated: boolean;
};

export type DailyTimeClassSummary = {
  date: string;
  timeClass: ChessComTrackedTimeClass;
  gamesPlayed: number;
  firstKnownRating: number | null;
  finalRating: number | null;
  netChange: number | null;
  wins: number;
  losses: number;
  draws: number;
  games: NormalizedChessGame[];
};

export type DailyChessSummary = {
  date: string;
  byTimeClass: Partial<Record<ChessComTrackedTimeClass, DailyTimeClassSummary>>;
  games: NormalizedChessGame[];
};

export type CriticalMovePlaceholder = {
  status: "not_wired";
  label: string;
};

export type HomeworkPuzzlePlaceholder = {
  status: "not_wired";
  label: string;
};

export type DailyReviewPlaceholders = {
  criticalMoves: CriticalMovePlaceholder[];
  homeworkPuzzles: HomeworkPuzzlePlaceholder[];
  weeklyReportSummary: string;
};

export type EngineEvaluation =
  | {
      type: "cp";
      value: number;
    }
  | {
      type: "mate";
      value: number;
    };

export type MoveImpactSeverity = "minor" | "inaccuracy" | "mistake" | "major" | "blunder" | "mate";

export type MoveImpactClassification = {
  label: string;
  severity: MoveImpactSeverity;
  theme:
    | "blunder"
    | "major eval loss"
    | "missed win"
    | "missed mate"
    | "missed best move"
    | "small improvement";
};

export type ExtractedMovePosition = {
  gameUrl: string;
  moveNumber: number;
  sideToMove: ChessPlayerColor;
  playedMove: string;
  playedMoveUci: string;
  fenBefore: string;
  fenAfter: string;
  playerColor: ChessPlayerColor;
};

export type CriticalMoveAnalysis = ExtractedMovePosition & {
  bestMove: string;
  evalBefore: EngineEvaluation;
  evalAfter: EngineEvaluation;
  centipawnLoss: number;
  impact: MoveImpactClassification;
  mateSwing: number | null;
  incomplete?: boolean;
};

export type HomeworkPuzzleCandidate = {
  bestMove: string;
  centipawnLoss: number;
  explanation: string;
  fen: string;
  gameUrl: string;
  impact: MoveImpactClassification;
  playedMove: string;
  sideToMove: ChessPlayerColor;
};

export type GameAnalysisStatus = {
  analyzedMoveCount: number;
  candidateMoveCount: number;
  criticalMoveCount: number;
  gameUrl: string;
  reason?: string;
  status: "analyzed" | "partial" | "skipped";
};

export type DailyEngineAnalysisReport = {
  analyzedGameUrls: string[];
  cacheKey: string;
  completedAt: string;
  criticalMoves: CriticalMoveAnalysis[];
  gameStatuses: GameAnalysisStatus[];
  homeworkPuzzles: HomeworkPuzzleCandidate[];
  incomplete: boolean;
  settings: {
    depth: number;
    maxGames: number;
    maxMoves: number;
    moveTimeMs: number;
  };
  skippedGames: {
    gameUrl: string;
    reason: string;
  }[];
  source: "stockfish-lite-single";
};
