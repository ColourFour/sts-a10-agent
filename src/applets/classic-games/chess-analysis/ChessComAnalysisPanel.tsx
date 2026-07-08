import { Chess, type Square as ChessSquare } from "chess.js";
import { Brain, CheckCircle2, ChevronLeft, ChevronRight, Download, Eye, RefreshCw, Repeat2, Search, Square, XCircle } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
import {
  fetchRecentChessComGames,
  readLastChessComUsername,
  saveLastChessComUsername,
} from "./chessComApi";
import { summarizeDailyChessGames } from "./chessDailySummary";
import { normalizeChessComGames } from "./chessGameNormalization";
import {
  analyzeIndividualGameReview,
  buildIndividualGameReviewCacheKey,
  individualClassificationOrder,
  individualKeyClassifications,
  normalizeIndividualGameReviewSettings,
  readCachedIndividualGameReview,
  type IndividualGameReviewMove,
  type IndividualGameReviewReport,
  type IndividualMoveClassification,
  type IndividualReviewPerspective,
} from "./chessIndividualGameReview";
import { blakeChessTrainerConfig, readConfiguredChessComUsername, saveConfiguredChessComUsername } from "./chessPersonalConfig";
import { analyzeRecentRapidLosses } from "./chessPersonalEngine";
import {
  buildPersonalChessReport,
  leakTagLabels,
  type PersonalChessReport,
  type PersonalOpeningLeak,
  type PersonalTimeClassSummary,
} from "./chessPersonalInsights";
import { normalizePersonalChessComGames } from "./chessPersonalImport";
import {
  importPersonalChessGames,
  readPersonalChessGames,
  readPersonalChessMistakes,
  readPersonalChessSyncMeta,
  readPersonalDrillReviews,
  replacePersonalChessMistakes,
  writePersonalChessSyncMeta,
  writePersonalDrillReview,
} from "./chessPersonalStore";
import { fetchPersonalChessComHistory, type PersonalChessSyncProgress, type PersonalChessSyncScope } from "./chessPersonalSync";
import type {
  PersonalChessGame,
  PersonalChessImportResult,
  PersonalChessMistake,
  PersonalChessOutcome,
  PersonalChessSyncMeta,
  PersonalChessTimeClass,
  PersonalDrillReview,
  PersonalDrillStatus,
} from "./chessPersonalTypes";
import { personalGamesToNormalized } from "./chessPersonalTypes";
import {
  analyzeSelectedDayGames,
  buildDayAnalysisCacheKey,
  defaultSelectedDayAnalysisSettings,
  readCachedDailyAnalysis,
  readRelatedDailyAnalysisStatuses,
  summarizeCachedAnalysisStatus,
  writeFailedDailyAnalysisStatus,
  type SelectedDayAnalysisProgress,
  type SelectedDayAnalysisSettings,
} from "./chessSelectedDayAnalysis";
import { createStockfishEngine, type ChessStockfishEngine, type StockfishTopMove } from "./chessStockfishEngine";
import {
  buildWeeklyReport,
  formatWeeklyReportMarkdown,
  getAvailableWeeks,
  getMostRecentWeek,
  getWeekLabel,
  type WeeklyReport,
  type WeeklyTimeClassSummary,
} from "./chessWeeklyReport";
import type {
  ChessComTrackedTimeClass,
  ChessPlayerColor,
  CriticalMoveAnalysis,
  DailyAnalysisStatus,
  DailyChessSummary,
  DailyEngineAnalysisReport,
  DailyTimeClassSummary,
  EngineEvaluation,
  HomeworkPuzzleCandidate,
  NormalizedChessGame,
} from "./chessReportTypes";

const timeClasses: ChessComTrackedTimeClass[] = ["bullet", "blitz", "rapid"];
const personalTimeClasses: PersonalChessTimeClass[] = ["rapid", "blitz", "bullet", "daily", "other"];
type AnalysisView = "analysis" | "critical" | "homework" | "personal" | "rating" | "weekly";
type PlayerLevel = "beginner" | "intermediate" | "advanced";

const analysisViews: { id: AnalysisView; labels: Record<PlayerLevel, string> }[] = [
  { id: "personal", labels: { advanced: "Dashboard", beginner: "Dashboard", intermediate: "Dashboard" } },
  { id: "analysis", labels: { advanced: "Analysis", beginner: "Coach Review", intermediate: "Review" } },
  { id: "rating", labels: { advanced: "Rating Trend", beginner: "Rating", intermediate: "Rating Trend" } },
  { id: "critical", labels: { advanced: "Critical Moves", beginner: "Mistakes", intermediate: "Critical Moves" } },
  { id: "homework", labels: { advanced: "Homework", beginner: "Practice", intermediate: "Homework" } },
  { id: "weekly", labels: { advanced: "Weekly Report", beginner: "Weekly Plan", intermediate: "Weekly Report" } },
];
const boardFiles = ["a", "b", "c", "d", "e", "f", "g", "h"];
const fenPieceGlyphs: Record<string, string> = {
  B: "♗",
  K: "♔",
  N: "♘",
  P: "♙",
  Q: "♕",
  R: "♖",
  b: "♝",
  k: "♚",
  n: "♞",
  p: "♟",
  q: "♛",
  r: "♜",
};
const pieceNames: Record<string, string> = {
  b: "bishop",
  k: "king",
  n: "knight",
  p: "pawn",
  q: "queen",
  r: "rook",
};
const individualClassificationLabels: Record<IndividualMoveClassification, string> = {
  best: "Best",
  blunder: "Blunder",
  book: "Book",
  brilliant: "Brilliant",
  excellent: "Excellent",
  good: "Good",
  great: "Great",
  inaccuracy: "Inaccuracy",
  miss: "Miss",
  mistake: "Mistake",
};
const reviewPerspectiveLabels: Record<IndividualReviewPerspective, string> = {
  account: "Account",
  black: "Black",
  both: "Both",
  white: "White",
};

function formatRating(value: number | null): string {
  return value === null ? "n/a" : `${value}`;
}

function formatNetChange(value: number | null): string {
  if (value === null) {
    return "n/a";
  }

  return value > 0 ? `+${value}` : `${value}`;
}

function ratingDeltaClass(value: number | null): string {
  if (value === null || value === 0) {
    return "neutral";
  }

  return value > 0 ? "positive" : "negative";
}

function analysisStatusLabel(status: DailyAnalysisStatus["status"]): string {
  const labels: Record<DailyAnalysisStatus["status"], string> = {
    cached_complete: "Saved run matches",
    cached_partial: "Saved partial run matches",
    failed: "Previous run stopped",
    in_progress: "In progress",
    not_analyzed: "No matching saved run",
    skipped_no_games: "No games",
  };

  return labels[status];
}

function analysisStatusClass(status: DailyAnalysisStatus["status"]): string {
  return status.replaceAll("_", "-");
}

function timeControlLabel(timeClass: ChessComTrackedTimeClass): string {
  return timeClass[0].toUpperCase() + timeClass.slice(1);
}

function formatGameTime(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(timestamp * 1000));
}

function formatDateLabel(date: string): string {
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${date}T12:00:00`));
}

function resultLabel(game: NormalizedChessGame): string {
  if (game.result === "win") {
    return "Win";
  }

  if (game.result === "loss") {
    return "Loss";
  }

  if (game.result === "draw") {
    return "Draw";
  }

  return game.result;
}

function formatEvaluation(evaluation: EngineEvaluation): string {
  if (evaluation.type === "mate") {
    return `M${evaluation.value}`;
  }

  return `${evaluation.value > 0 ? "+" : ""}${(evaluation.value / 100).toFixed(2)}`;
}

function formatCentipawnLoss(value: number): string {
  return `${Math.round(value)} cp`;
}

function clampAnalysisSetting(key: keyof SelectedDayAnalysisSettings, value: number): number {
  const limits: Record<keyof SelectedDayAnalysisSettings, { max: number; min: number }> = {
    depth: { max: 18, min: 1 },
    maxGames: { max: 8, min: 1 },
    maxMoves: { max: 60, min: 1 },
    moveTimeMs: { max: 3000, min: 100 },
  };
  const limit = limits[key];
  const fallback = defaultSelectedDayAnalysisSettings[key];

  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(limit.max, Math.max(limit.min, Math.round(value)));
}

function parseFenBoard(fen: string): string[][] {
  const placement = fen.split(" ")[0] ?? "";
  return placement.split("/").map((rank) => {
    const squares: string[] = [];
    for (const char of rank) {
      const emptyCount = Number(char);
      if (Number.isInteger(emptyCount) && emptyCount > 0) {
        squares.push(...Array(emptyCount).fill(""));
      } else {
        squares.push(char);
      }
    }
    return squares;
  });
}

function moveSquares(move: string): Set<string> {
  if (!/^[a-h][1-8][a-h][1-8]/.test(move)) {
    return new Set();
  }

  return new Set([move.slice(0, 2), move.slice(2, 4)]);
}

function legalMoveSquares(game: Chess, square: ChessSquare | null): Set<string> {
  if (!square) {
    return new Set();
  }

  return new Set(game.moves({ square, verbose: true }).map((move) => move.to));
}

function squareAt(rowIndex: number, colIndex: number, orientation: "black" | "white"): ChessSquare {
  const rank = orientation === "black" ? rowIndex + 1 : 8 - rowIndex;
  const file = orientation === "black" ? boardFiles[7 - colIndex] : boardFiles[colIndex];
  return `${file}${rank}` as ChessSquare;
}

function formatUciMove(move: string): string {
  if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/i.test(move)) {
    return move || "n/a";
  }

  const promotion = move[4] ? `=${move[4].toUpperCase()}` : "";
  return `${move.slice(0, 2)}-${move.slice(2, 4)}${promotion}`;
}

function formatMoveLabel(fen: string, uciMove: string, fallback?: string): string {
  if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/i.test(uciMove)) {
    return fallback ?? uciMove ?? "n/a";
  }

  try {
    const game = new Chess(fen);
    const move = game.move({
      from: uciMove.slice(0, 2) as ChessSquare,
      promotion: uciMove[4] ?? "q",
      to: uciMove.slice(2, 4) as ChessSquare,
    });
    return move?.san ?? fallback ?? formatUciMove(uciMove);
  } catch {
    return fallback ?? formatUciMove(uciMove);
  }
}

function sideLabel(color: ChessPlayerColor): string {
  return color === "white" ? "White" : "Black";
}

function evaluationToCentipawns(evaluation: EngineEvaluation): number {
  return evaluation.type === "mate" ? Math.sign(evaluation.value || 1) * 100000 : evaluation.value;
}

function materialBalance(fen: string, side: ChessPlayerColor): number {
  const pieceValues: Record<string, number> = {
    b: 330,
    k: 0,
    n: 320,
    p: 100,
    q: 900,
    r: 500,
  };
  const game = new Chess(fen);
  return game
    .board()
    .flat()
    .filter(Boolean)
    .reduce((total, piece) => {
      if (!piece) {
        return total;
      }
      const value = pieceValues[piece.type] ?? 0;
      const isPlayerPiece = side === "white" ? piece.color === "w" : piece.color === "b";
      return total + (isPlayerPiece ? value : -value);
    }, 0);
}

function fenAfterMove(fen: string, move: string): string | null {
  if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/i.test(move)) {
    return null;
  }

  try {
    const game = new Chess(fen);
    const madeMove = game.move({
      from: move.slice(0, 2) as ChessSquare,
      promotion: move[4] ?? "q",
      to: move.slice(2, 4) as ChessSquare,
    });
    return madeMove ? game.fen() : null;
  } catch {
    return null;
  }
}

function explainCriticalMove(move: CriticalMoveAnalysis): string {
  const bestSan = formatMoveLabel(move.fenBefore, move.bestMove);
  const bestAfterFen = fenAfterMove(move.fenBefore, move.bestMove);
  if (bestAfterFen && materialBalance(bestAfterFen, move.sideToMove) - materialBalance(move.fenAfter, move.sideToMove) >= 300) {
    return `Your move dropped material. ${sideLabel(move.sideToMove)} had a better move with ${bestSan}.`;
  }

  if (move.impact?.theme === "missed mate" || (move.mateSwing !== null && move.mateSwing > 0)) {
    return `Your move missed a mating resource or defense. Stockfish preferred ${bestSan}.`;
  }

  if (move.impact?.theme === "missed win") {
    return `Your move gave up a winning advantage. Stockfish preferred ${bestSan}.`;
  }

  if (bestSan.includes("x")) {
    return `Your move missed a stronger capture. Stockfish preferred ${bestSan}.`;
  }

  if (move.centipawnLoss >= 600) {
    return `Your move caused a large engine swing. Stockfish preferred ${bestSan}.`;
  }

  return `Your move missed Stockfish's stronger move: ${bestSan}.`;
}

function shortCoachSummary(move: CriticalMoveAnalysis): string {
  const before = evaluationToCentipawns(move.evalBefore);
  const after = evaluationToCentipawns(move.evalAfter);
  if (before >= 300 && after < 150) {
    return "This position moved from clearly better to much less comfortable.";
  }

  if (move.centipawnLoss >= 600) {
    return "This was the biggest kind of swing to review slowly.";
  }

  return "The review goal is to compare your move with the engine's simpler improvement.";
}

function homeworkHintOne(puzzle: HomeworkPuzzleCandidate): string {
  try {
    const game = new Chess(puzzle.fen);
    const from = puzzle.bestMove.slice(0, 2) as ChessSquare;
    const piece = game.get(from);
    const pieceName = piece ? pieceNames[piece.type] ?? "piece" : "piece";
    return `Hint 1: Look at the ${pieceName} on ${from}.`;
  } catch {
    return `Hint 1: The key square starts on ${puzzle.bestMove.slice(0, 2)}.`;
  }
}

function homeworkHintTwo(puzzle: HomeworkPuzzleCandidate): string {
  const bestSan = formatMoveLabel(puzzle.fen, puzzle.bestMove);
  return `Hint 2: Compare your game move ${puzzle.playedMove} with Stockfish's candidate ${bestSan}.`;
}

function formatPvLine(fen: string, line: string[]): string {
  try {
    const game = new Chess(fen);
    return line
      .slice(0, 5)
      .map((uciMove) => {
        const move = game.move({
          from: uciMove.slice(0, 2) as ChessSquare,
          promotion: uciMove[4] ?? "q",
          to: uciMove.slice(2, 4) as ChessSquare,
        });
        return move?.san ?? formatUciMove(uciMove);
      })
      .join(" ");
  } catch {
    return line.slice(0, 5).map(formatUciMove).join(" ");
  }
}

function formatPvSnippet(fen: string, line: string[], moveLimit = 3): string {
  try {
    const game = new Chess(fen);
    return line
      .slice(0, moveLimit)
      .map((uciMove) => {
        const move = game.move({
          from: uciMove.slice(0, 2) as ChessSquare,
          promotion: uciMove[4] ?? "q",
          to: uciMove.slice(2, 4) as ChessSquare,
        });
        return move?.san ?? formatUciMove(uciMove);
      })
      .join(" ");
  } catch {
    return line.slice(0, moveLimit).map(formatUciMove).join(" ");
  }
}

function topMoveEvaluationLabel(move: StockfishTopMove): string {
  return formatEvaluation(move.evaluation);
}

function PlayableAnalysisBoard({
  analysisSettings,
  allowEnginePanel = false,
  autoAnalyzeAfterMove = false,
  bestMove,
  enginePanelIdleCopy = "Use this only when you want extra Stockfish lines for the current board position.",
  enginePanelTitle = "Top 3 moves for current position",
  fen,
  lastMove: providedLastMove,
  orientation,
  playedMove,
}: {
  analysisSettings: SelectedDayAnalysisSettings;
  allowEnginePanel?: boolean;
  autoAnalyzeAfterMove?: boolean;
  bestMove?: string;
  enginePanelIdleCopy?: string;
  enginePanelTitle?: string;
  fen: string;
  lastMove?: string;
  orientation: "black" | "white";
  playedMove?: string;
}) {
  const engineRef = useRef<ChessStockfishEngine | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [game, setGame] = useState(() => new Chess(fen));
  const [selectedSquare, setSelectedSquare] = useState<ChessSquare | null>(null);
  const [lastMove, setLastMove] = useState<string | undefined>(undefined);
  const [topMoves, setTopMoves] = useState<StockfishTopMove[]>([]);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analysisRunning, setAnalysisRunning] = useState(false);
  const [analyzedFen, setAnalyzedFen] = useState<string | null>(null);
  const currentFen = game.fen();
  const legalTargets = useMemo(() => legalMoveSquares(game, selectedSquare), [game, selectedSquare]);
  const topMoveSquares = useMemo(() => moveSquares(topMoves[0]?.move ?? ""), [topMoves]);
  const topMoveFen = analyzedFen ?? currentFen;

  useEffect(() => {
    abortControllerRef.current?.abort();
    engineRef.current?.stop();
    setGame(new Chess(fen));
    setSelectedSquare(null);
    setLastMove(undefined);
    setTopMoves([]);
    setAnalysisError(null);
    setAnalysisRunning(false);
    setAnalyzedFen(null);
  }, [fen]);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      engineRef.current?.dispose();
    };
  }, []);

  function resetPosition() {
    abortControllerRef.current?.abort();
    engineRef.current?.stop();
    setGame(new Chess(fen));
    setSelectedSquare(null);
    setLastMove(undefined);
    setTopMoves([]);
    setAnalysisError(null);
    setAnalysisRunning(false);
    setAnalyzedFen(null);
  }

  async function analyzePosition(fenToAnalyze: string) {
    abortControllerRef.current?.abort();
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    engineRef.current?.dispose();
    engineRef.current = createStockfishEngine();
    setAnalysisError(null);
    setAnalysisRunning(true);
    setAnalyzedFen(fenToAnalyze);

    try {
      const moves = await engineRef.current.analyzeTopMoves(fenToAnalyze, {
        depth: analysisSettings.depth,
        lineCount: 3,
        moveTimeMs: analysisSettings.moveTimeMs,
        signal: abortController.signal,
      });
      if (abortControllerRef.current !== abortController) {
        return;
      }
      setTopMoves(moves);
    } catch (error) {
      if (abortControllerRef.current !== abortController) {
        return;
      }
      setTopMoves([]);
      setAnalysisError(error instanceof Error ? error.message : "Could not analyze this position.");
    } finally {
      if (abortControllerRef.current === abortController) {
        setAnalysisRunning(false);
      }
    }
  }

  function handleSquareClick(square: ChessSquare) {
    const piece = game.get(square);
    if (selectedSquare && legalTargets.has(square)) {
      const nextGame = new Chess(game.fen());
      const move = nextGame.move({
        from: selectedSquare,
        promotion: "q",
        to: square,
      });
      if (move) {
        setGame(nextGame);
        setLastMove(`${move.from}${move.to}${move.promotion ?? ""}`);
        setSelectedSquare(null);
        setTopMoves([]);
        setAnalysisError(null);
        setAnalyzedFen(null);
        if (autoAnalyzeAfterMove) {
          void analyzePosition(nextGame.fen());
        }
      }
      return;
    }

    if (piece && piece.color === game.turn()) {
      setSelectedSquare(square);
      return;
    }

    setSelectedSquare(null);
  }

  function analyzeCurrentPosition() {
    void analyzePosition(game.fen());
  }

  const boardRows = Array.from({ length: 8 }, (_, rowIndex) =>
    Array.from({ length: 8 }, (_, colIndex) => squareAt(rowIndex, colIndex, orientation)),
  );
  const highlightedPlayed = moveSquares(playedMove ?? "");
  const highlightedBest = moveSquares(bestMove ?? "");
  const highlightedLast = moveSquares(lastMove ?? providedLastMove ?? "");

  return (
    <div className="playable-analysis-board">
      <div className="fen-board-wrap large" aria-label="Playable chess analysis board">
        <div className="fen-board interactive">
          {boardRows.map((row, rowIndex) =>
            row.map((square, colIndex) => {
              const piece = game.get(square);
              const isSelected = selectedSquare === square;
              const isLegal = legalTargets.has(square);
              const isPlayed = highlightedPlayed.has(square);
              const isLast = highlightedLast.has(square);
              const isBest = highlightedBest.has(square) || topMoveSquares.has(square);
              const rank = square[1];
              const file = square[0];

              return (
                <button
                  aria-label={`${square}${piece ? ` ${piece.color === "w" ? "white" : "black"} ${piece.type}` : " empty"}`}
                  className={`fen-square ${(rowIndex + colIndex) % 2 === 0 ? "light" : "dark"} ${isPlayed ? "played" : ""} ${isLast ? "last" : ""} ${isBest ? "best" : ""} ${isSelected ? "selected" : ""} ${isLegal ? "legal" : ""}`}
                  key={square}
                  onClick={() => handleSquareClick(square)}
                  type="button"
                >
                  {colIndex === 0 ? <span className="fen-rank-label">{rank}</span> : null}
                  {rowIndex === 7 ? <span className="fen-file-label">{file}</span> : null}
                  {piece ? (
                    <span className={`fen-piece ${piece.color === "w" ? "piece-white" : "piece-black"}`}>
                      {fenPieceGlyphs[piece.color === "w" ? piece.type.toUpperCase() : piece.type]}
                    </span>
                  ) : ""}
                  {isLegal ? <span className="fen-legal-dot" aria-hidden="true" /> : null}
                </button>
              );
            }),
          )}
        </div>
      </div>
      <div className="playable-board-actions">
        {allowEnginePanel ? (
          <button className="secondary-button primary-action" disabled={analysisRunning} onClick={analyzeCurrentPosition} type="button">
            {analysisRunning ? "Analyzing" : "Analyze position"}
          </button>
        ) : null}
        <button className="secondary-button" disabled={analysisRunning} onClick={resetPosition} type="button">
          Reset position
        </button>
      </div>
      <div className="position-status-row">
        <span>{game.turn() === "w" ? "White" : "Black"} to move</span>
        {lastMove ? <span>Last move {formatUciMove(lastMove)}</span> : null}
        {topMoves[0] ? <span>Engine eval {topMoveEvaluationLabel(topMoves[0])}</span> : null}
        {game.isCheck() ? <span>Check</span> : null}
        {game.isGameOver() ? <span>Game over</span> : null}
      </div>
      {analysisError ? <p className="error-text">Stockfish analysis unavailable. {analysisError}</p> : null}
      {allowEnginePanel ? (
        <div className="top-move-panel" aria-label="Top engine moves">
          <h4>{enginePanelTitle}</h4>
          {topMoves.length > 0 ? (
            <ol>
              {topMoves.map((move) => (
                <li key={`${move.rank}-${move.move}`}>
                  <strong>#{move.rank} {formatMoveLabel(topMoveFen, move.move)}</strong>
                  <span> · {topMoveEvaluationLabel(move)}</span>
                  <small>{formatPvLine(topMoveFen, move.line)}</small>
                </li>
              ))}
            </ol>
          ) : (
            <p className="helper-text">
              {analysisRunning
                ? "Analyzing top moves for this board position."
                : enginePanelIdleCopy}
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}

function dailyNetChange(day: DailyChessSummary): number | null {
  const changes = timeClasses
    .map((timeClass) => day.byTimeClass[timeClass]?.netChange)
    .filter((value): value is number => value !== null && value !== undefined);

  if (changes.length === 0) {
    return null;
  }

  return changes.reduce((total, value) => total + value, 0);
}

function dailySummaryText(day: DailyChessSummary): string {
  const parts = timeClasses
    .map((timeClass) => day.byTimeClass[timeClass])
    .filter((summary): summary is DailyTimeClassSummary => Boolean(summary))
    .map(
      (summary) =>
        `${summary.timeClass}: ${summary.gamesPlayed} games, ${summary.wins}-${summary.losses}-${summary.draws}, ${formatNetChange(summary.netChange)}`,
    );

  return parts.length > 0 ? parts.join(" | ") : "No blitz or rapid games.";
}

function FenBoard({
  bestMove,
  fen,
  lastMove,
  mistakeMove,
  orientation,
  playedMove,
  size = "compact",
}: {
  bestMove?: string;
  fen: string;
  lastMove?: string;
  mistakeMove?: string;
  orientation: "black" | "white";
  playedMove?: string;
  size?: "compact" | "large";
}) {
  const rows = parseFenBoard(fen);
  const orientedRows = orientation === "black" ? [...rows].reverse().map((row) => [...row].reverse()) : rows;
  const highlightedPlayed = moveSquares(playedMove ?? "");
  const highlightedBest = moveSquares(bestMove ?? "");
  const highlightedLast = moveSquares(lastMove ?? "");
  const highlightedMistake = moveSquares(mistakeMove ?? "");

  return (
    <div className={`fen-board-wrap ${size === "large" ? "large" : ""}`} aria-label="Chess position">
      <div className="fen-board">
        {orientedRows.map((row, rowIndex) =>
          row.map((piece, colIndex) => {
            const rank = orientation === "black" ? rowIndex + 1 : 8 - rowIndex;
            const file = orientation === "black" ? boardFiles[7 - colIndex] : boardFiles[colIndex];
            const square = `${file}${rank}`;
            const isPlayed = highlightedPlayed.has(square);
            const isBest = highlightedBest.has(square);
            const isLast = highlightedLast.has(square);
            const isMistake = highlightedMistake.has(square);
            return (
              <span
                aria-label={`${square}${piece ? ` ${piece}` : " empty"}`}
                className={`fen-square ${(rowIndex + colIndex) % 2 === 0 ? "light" : "dark"} ${isPlayed ? "played" : ""} ${isLast ? "last" : ""} ${isBest ? "best" : ""} ${isMistake ? "mistake" : ""}`}
                key={`${square}-${rowIndex}-${colIndex}`}
              >
                {colIndex === 0 ? <span className="fen-rank-label">{rank}</span> : null}
                {rowIndex === 7 ? <span className="fen-file-label">{file}</span> : null}
                {piece ? (
                  <span className={`fen-piece ${piece === piece.toUpperCase() ? "piece-white" : "piece-black"}`}>
                    {fenPieceGlyphs[piece]}
                  </span>
                ) : ""}
              </span>
            );
          }),
        )}
      </div>
    </div>
  );
}

function personalGameResultLabel(game: PersonalChessGame): string {
  if (game.normalizedResult === "win") {
    return "Win";
  }

  if (game.normalizedResult === "loss") {
    return "Loss";
  }

  if (game.normalizedResult === "draw") {
    return "Draw";
  }

  return game.result;
}

function formatAccuracy(value: number | null): string {
  return value === null ? "n/a" : `${value.toFixed(1)}%`;
}

function individualReviewMoveLabel(move: IndividualGameReviewMove): string {
  return `${move.moveNumber}${move.sideToMove === "black" ? "..." : "."} ${move.playedMove}`;
}

function individualReviewMoveActor(game: PersonalChessGame, move: IndividualGameReviewMove): string {
  return move.sideToMove === game.playerColor ? sideLabel(game.playerColor) : game.opponentUsername;
}

function individualReviewMoveSummary(move: IndividualGameReviewMove): string {
  if (move.classification === "brilliant") {
    return "This local review marks the move as a strong engine-approved sacrifice or material concession.";
  }

  if (move.classification === "great") {
    return "This was close to the engine's top move in a position where the next alternatives dropped off quickly.";
  }

  if (move.classification === "book") {
    return "This early move stayed within the local book-style range with almost no engine loss.";
  }

  if (move.classification === "best") {
    return "This matched the engine's first choice or lost almost no expected points.";
  }

  if (move.classification === "excellent") {
    return "This kept nearly all of the position's expected result.";
  }

  if (move.classification === "good") {
    return "This was playable and kept the position healthy.";
  }

  if (move.classification === "inaccuracy") {
    return "This gave up a small but visible part of the position.";
  }

  if (move.classification === "mistake") {
    return "This gave up a meaningful part of the position and is worth replaying.";
  }

  if (move.classification === "miss") {
    return "This missed a locally winning or clearly better chance.";
  }

  return "This caused the largest expected-points swing in the review.";
}

function moveMatchesPerspective(game: PersonalChessGame, move: IndividualGameReviewMove, perspective: IndividualReviewPerspective): boolean {
  if (perspective === "both") {
    return true;
  }

  if (perspective === "account") {
    return move.sideToMove === game.playerColor;
  }

  return move.sideToMove === perspective;
}

function whitePerspectiveCentipawns(move: IndividualGameReviewMove): number {
  const moverCentipawns = evaluationToCentipawns(move.evalAfter);
  return move.sideToMove === "white" ? moverCentipawns : -moverCentipawns;
}

function graphPointTop(move: IndividualGameReviewMove): number {
  const whiteCentipawns = Math.max(-700, Math.min(700, whitePerspectiveCentipawns(move)));
  return Math.max(8, Math.min(92, 50 - whiteCentipawns / 16));
}

function isRetryMove(move: IndividualGameReviewMove): boolean {
  return move.classification === "blunder" || move.classification === "miss" || move.classification === "mistake";
}

function IndividualReviewGraph({
  moves,
  onSelectMove,
  selectedMove,
}: {
  moves: IndividualGameReviewMove[];
  onSelectMove: (move: IndividualGameReviewMove) => void;
  selectedMove: IndividualGameReviewMove | null;
}) {
  if (moves.length === 0) {
    return null;
  }

  return (
    <div className="individual-review-graph" aria-label="Local advantage graph">
      {moves.map((move, index) => (
        <button
          aria-label={`Move ${move.ply}: ${individualReviewMoveLabel(move)}, ${formatEvaluation(move.evalAfter)}`}
          aria-pressed={selectedMove?.ply === move.ply}
          className={`individual-graph-point class-${move.classification} ${selectedMove?.ply === move.ply ? "selected" : ""}`}
          key={`${move.ply}-${move.playedMoveUci}`}
          onClick={() => onSelectMove(move)}
          style={
            {
              "--graph-position": moves.length <= 1 ? 0 : index / (moves.length - 1),
              top: `${graphPointTop(move)}%`,
            } as CSSProperties
          }
          type="button"
        />
      ))}
      <span className="individual-graph-midline" />
    </div>
  );
}

function IndividualMetricCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="individual-review-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function IndividualGameReviewPanel({
  analysisSettings,
  game,
}: {
  analysisSettings: SelectedDayAnalysisSettings;
  game: PersonalChessGame;
}) {
  const engineRef = useRef<ChessStockfishEngine | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [report, setReport] = useState<IndividualGameReviewReport | null>(null);
  const [reviewPerspective, setReviewPerspective] = useState<IndividualReviewPerspective>("both");
  const [retryMode, setRetryMode] = useState(false);
  const [retryAnswerVisible, setRetryAnswerVisible] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewProgress, setReviewProgress] = useState<SelectedDayAnalysisProgress | null>(null);
  const [reviewRunning, setReviewRunning] = useState(false);
  const reviewSettings = useMemo(
    () => normalizeIndividualGameReviewSettings(analysisSettings),
    [analysisSettings.depth, analysisSettings.moveTimeMs],
  );
  const cacheKey = useMemo(
    () => buildIndividualGameReviewCacheKey({ game, settings: reviewSettings }),
    [game, reviewSettings.depth, reviewSettings.lineCount, reviewSettings.moveTimeMs],
  );
  const allMoves = report?.moves ?? [];
  const visibleMoves = useMemo(
    () =>
      allMoves
        .filter((move) => moveMatchesPerspective(game, move, reviewPerspective))
        .filter((move) => !retryMode || isRetryMove(move)),
    [allMoves, game, retryMode, reviewPerspective],
  );
  const boundedIndex = Math.min(selectedIndex, Math.max(0, visibleMoves.length - 1));
  const selectedMove = visibleMoves[boundedIndex] ?? null;
  const selectedMoveIsRetry = Boolean(selectedMove && retryMode && isRetryMove(selectedMove));
  const showMoveAnswer = !selectedMoveIsRetry || retryAnswerVisible;
  const selectedBoardFen = selectedMoveIsRetry && !retryAnswerVisible ? selectedMove?.fenBefore : selectedMove?.fenAfter;
  const nextKeyIndex = visibleMoves.findIndex((move, index) => index > boundedIndex && individualKeyClassifications.has(move.classification));
  const progressValue =
    reviewProgress && reviewProgress.total > 0
      ? `${Math.min(reviewProgress.current + 1, reviewProgress.total)} / ${reviewProgress.total}`
      : null;

  const startReview = useCallback(
    async (force = false) => {
      abortControllerRef.current?.abort();
      engineRef.current?.stop();
      setReviewError(null);
      setSelectedIndex(0);
      setRetryAnswerVisible(false);

      const cached = force ? null : readCachedIndividualGameReview(cacheKey);
      if (cached) {
        setReport(cached);
        setReviewProgress({
          current: cached.moves.length,
          message: "Loaded cached individual game review.",
          total: cached.moves.length,
        });
        setReviewRunning(false);
        return;
      }

      const abortController = new AbortController();
      abortControllerRef.current = abortController;
      engineRef.current?.dispose();
      engineRef.current = createStockfishEngine();
      setReport(null);
      setReviewRunning(true);
      setReviewProgress({ current: 0, message: "Preparing individual game review.", total: 0 });

      try {
        const nextReport = await analyzeIndividualGameReview({
          engine: engineRef.current,
          game,
          onProgress: setReviewProgress,
          settings: reviewSettings,
          signal: abortController.signal,
        });
        if (!abortController.signal.aborted) {
          setReport(nextReport);
          if (nextReport.skippedMoves.length > 0) {
            setReviewError(`${nextReport.skippedMoves.length} move(s) could not be reviewed.`);
          }
        }
      } catch (error) {
        if (!abortController.signal.aborted) {
          setReviewError(error instanceof Error ? error.message : "Engine analysis unavailable in this browser/build.");
        }
      } finally {
        if (abortControllerRef.current === abortController) {
          setReviewRunning(false);
        }
      }
    },
    [cacheKey, game, reviewSettings],
  );

  useEffect(() => {
    void startReview(false);
  }, [startReview]);

  useEffect(() => {
    setSelectedIndex(0);
    setRetryAnswerVisible(false);
  }, [game.gameUrl, report, retryMode, reviewPerspective]);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      engineRef.current?.dispose();
    };
  }, []);

  function stopReview() {
    abortControllerRef.current?.abort();
    engineRef.current?.stop();
    setReviewRunning(false);
    setReviewProgress((currentProgress) => ({
      current: currentProgress?.current ?? 0,
      message: "Individual game review stopped.",
      total: currentProgress?.total ?? 0,
    }));
  }

  return (
    <section className="individual-game-review-panel" aria-label="Individual game review">
      <div className="individual-review-header">
        <div>
          <p className="eyebrow">Individual game review</p>
          <h3>
            {personalGameResultLabel(game)} vs {game.opponentUsername}
          </h3>
          <div className="individual-review-meta">
            <span>{formatDateLabel(game.endDate)} at {formatGameTime(game.endTimestamp)}</span>
            <span>{personalTimeControlLabel(game.timeClass)} as {sideLabel(game.playerColor)}</span>
            <span>{game.rated ? "Rated" : "Unrated"} {formatRating(game.playerRatingAfterGame)}</span>
          </div>
        </div>
        <div className="individual-review-actions">
          <button
            className="secondary-button"
            disabled={!selectedMove || boundedIndex === 0}
            onClick={() => {
              setRetryAnswerVisible(false);
              setSelectedIndex((current) => Math.max(0, current - 1));
            }}
            type="button"
          >
            <ChevronLeft size={17} aria-hidden="true" />
            Previous
          </button>
          <span>{visibleMoves.length > 0 ? `${boundedIndex + 1} of ${visibleMoves.length}` : "0 of 0"}</span>
          <button
            className="secondary-button"
            disabled={!selectedMove || boundedIndex >= visibleMoves.length - 1}
            onClick={() => {
              setRetryAnswerVisible(false);
              setSelectedIndex((current) => Math.min(visibleMoves.length - 1, current + 1));
            }}
            type="button"
          >
            Next
            <ChevronRight size={17} aria-hidden="true" />
          </button>
          <button
            className="secondary-button"
            disabled={nextKeyIndex < 0}
            onClick={() => {
              setRetryAnswerVisible(false);
              setSelectedIndex(nextKeyIndex);
            }}
            type="button"
          >
            Next key move
          </button>
          <button className="secondary-button" disabled={reviewRunning} onClick={() => void startReview(true)} type="button">
            <RefreshCw size={17} aria-hidden="true" />
            Re-run
          </button>
          <button className="secondary-button" disabled={!reviewRunning} onClick={stopReview} type="button">
            <Square size={15} aria-hidden="true" />
            Stop
          </button>
        </div>
      </div>

      <div className="individual-review-controls">
        <div className="coach-mode-selector" role="group" aria-label="Review as">
          {(Object.keys(reviewPerspectiveLabels) as IndividualReviewPerspective[]).map((perspective) => (
            <button
              aria-pressed={reviewPerspective === perspective}
              className={reviewPerspective === perspective ? "selected" : ""}
              key={perspective}
              onClick={() => setReviewPerspective(perspective)}
              type="button"
            >
              {reviewPerspectiveLabels[perspective]}
            </button>
          ))}
        </div>
        <button
          aria-pressed={retryMode}
          className={`secondary-button ${retryMode ? "selected" : ""}`}
          disabled={!report || report.summary.keyMoveCount === 0}
          onClick={() => {
            setRetryMode((current) => !current);
            setRetryAnswerVisible(false);
          }}
          type="button"
        >
          <Repeat2 size={17} aria-hidden="true" />
          Retry key moves
        </button>
      </div>

      {report ? (
        <>
          <div className="individual-review-summary-grid" aria-label="Local review summary">
            <IndividualMetricCard label="White local accuracy" value={formatAccuracy(report.summary.whiteAccuracy)} />
            <IndividualMetricCard label="Black local accuracy" value={formatAccuracy(report.summary.blackAccuracy)} />
            <IndividualMetricCard label="Account local accuracy" value={formatAccuracy(report.summary.accountAccuracy)} />
            <IndividualMetricCard label="Key moves" value={`${report.summary.keyMoveCount}`} />
          </div>
          <IndividualReviewGraph
            moves={allMoves}
            onSelectMove={(move) => {
              setReviewPerspective("both");
              setRetryMode(false);
              setRetryAnswerVisible(false);
              setSelectedIndex(Math.max(0, allMoves.findIndex((candidate) => candidate.ply === move.ply)));
            }}
            selectedMove={selectedMove}
          />
        </>
      ) : null}

      <div className="individual-review-grade-legend" aria-label="Move classifications">
        {individualClassificationOrder.map((classification) => (
          <span className={`move-grade-pill class-${classification}`} key={classification}>
            {individualClassificationLabels[classification]} {report?.summary.classificationCounts[classification] ? report.summary.classificationCounts[classification] : ""}
          </span>
        ))}
      </div>

      {reviewProgress ? (
        <p className="helper-text" role="status">
          {reviewProgress.message}
          {progressValue ? ` ${progressValue}` : ""}
        </p>
      ) : null}
      {reviewError ? <p className="error-text">Stockfish review issue: {reviewError}</p> : null}

      {selectedMove && selectedBoardFen ? (
        <>
          <div className="individual-review-layout">
            <div className="individual-review-board-column">
              <PlayableAnalysisBoard
                allowEnginePanel
                analysisSettings={analysisSettings}
                autoAnalyzeAfterMove
                bestMove={selectedMoveIsRetry && retryAnswerVisible ? selectedMove.bestMove : undefined}
                fen={selectedBoardFen}
                lastMove={showMoveAnswer ? selectedMove.playedMoveUci : undefined}
                playedMove={showMoveAnswer && individualKeyClassifications.has(selectedMove.classification) ? selectedMove.playedMoveUci : undefined}
                orientation={game.playerColor}
                enginePanelTitle="Try a move, then Stockfish evaluates"
                enginePanelIdleCopy="Play a legal move on the board. Stockfish will run automatically and show the resulting evaluation and best continuations."
              />
              {selectedMoveIsRetry ? (
                <div className="individual-retry-panel">
                  <strong>{retryAnswerVisible ? "Answer revealed" : "Retry this move"}</strong>
                  <span>{retryAnswerVisible ? `Best move: ${formatMoveLabel(selectedMove.fenBefore, selectedMove.bestMove)}` : `Find a better move for ${sideLabel(selectedMove.sideToMove)}.`}</span>
                  <button className="secondary-button primary-action" onClick={() => setRetryAnswerVisible((current) => !current)} type="button">
                    {retryAnswerVisible ? "Hide answer" : "Reveal answer"}
                  </button>
                </div>
              ) : null}
            </div>
            <div className="individual-review-copy">
              <div className="card-topline">
                <div>
                  <p className="eyebrow">{selectedMove.sideToMove === game.playerColor ? "Account move" : "Opponent move"}</p>
                  <h3>{individualReviewMoveLabel(selectedMove)}</h3>
                </div>
                <span className={`move-grade-pill class-${selectedMove.classification}`}>
                  {individualClassificationLabels[selectedMove.classification]}
                </span>
              </div>
              <p className="coach-explanation">{individualReviewMoveSummary(selectedMove)}</p>
              <dl className="move-detail-grid individual-review-detail-grid">
                <div>
                  <dt>Played by</dt>
                  <dd>{individualReviewMoveActor(game, selectedMove)}</dd>
                </div>
                <div>
                  <dt>Played</dt>
                  <dd>{formatMoveLabel(selectedMove.fenBefore, selectedMove.playedMoveUci, selectedMove.playedMove)}</dd>
                </div>
                <div>
                  <dt>Best move</dt>
                  <dd>{formatMoveLabel(selectedMove.fenBefore, selectedMove.bestMove)}</dd>
                </div>
                <div>
                  <dt>Eval</dt>
                  <dd>{formatEvaluation(selectedMove.evalBefore)} to {formatEvaluation(selectedMove.evalAfter)}</dd>
                </div>
                <div>
                  <dt>Expected loss</dt>
                  <dd>{selectedMove.expectedPointLoss.toFixed(1)} pts</dd>
                </div>
                <div>
                  <dt>Local accuracy</dt>
                  <dd>{formatAccuracy(selectedMove.accuracy)}</dd>
                </div>
                <div>
                  <dt>Centipawns</dt>
                  <dd>{formatCentipawnLoss(selectedMove.centipawnLoss)}</dd>
                </div>
              </dl>
              {individualKeyClassifications.has(selectedMove.classification) ? (
                <div className="individual-review-lines punishment-lines">
                  <h4>Why this is costly</h4>
                  {(selectedMove.punishmentLines ?? []).length > 0 ? (
                    <ol>
                      {(selectedMove.punishmentLines ?? []).slice(0, 3).map((line) => (
                        <li key={`punish-${line.rank}-${line.move}`}>
                          <strong>#{line.rank} {formatMoveLabel(selectedMove.fenAfter, line.move)}</strong>
                          <span>{formatEvaluation(line.evaluation)}</span>
                          <small>{formatPvSnippet(selectedMove.fenAfter, line.line, 3)}</small>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="helper-text">Re-run this review to add the opponent continuation that punishes this move.</p>
                  )}
                </div>
              ) : null}
              {showMoveAnswer ? (
                <div className="individual-review-lines">
                  <h4>Top positive lines</h4>
                  <ol>
                    {selectedMove.topLines.slice(0, 5).map((line) => (
                      <li key={`${line.rank}-${line.move}`}>
                        <strong>#{line.rank} {formatMoveLabel(selectedMove.fenBefore, line.move)}</strong>
                        <span>{formatEvaluation(line.evaluation)}</span>
                        <small>{formatPvLine(selectedMove.fenBefore, line.line)}</small>
                      </li>
                    ))}
                  </ol>
                </div>
              ) : null}
              <a className="source-game-link" href={game.gameUrl} target="_blank" rel="noreferrer">
                Source game
              </a>
            </div>
          </div>
          <div className="individual-review-move-strip" aria-label="Individual game move list">
            {visibleMoves.map((move, index) => (
              <button
                aria-pressed={boundedIndex === index}
                className={`individual-review-move-tab class-${move.classification} ${move.sideToMove === game.playerColor ? "account-move" : ""} ${boundedIndex === index ? "selected" : ""}`}
                key={`${move.ply}-${move.playedMoveUci}`}
                onClick={() => {
                  setRetryAnswerVisible(false);
                  setSelectedIndex(index);
                }}
                type="button"
              >
                <strong>{move.ply}</strong>
                <span>{move.playedMove}</span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <section className="analysis-placeholder-panel">
          <h3>{reviewRunning ? "Review running" : retryMode ? "No retry moves in this filter" : "No reviewed moves yet"}</h3>
          <p className="helper-text">
            {reviewRunning
              ? "Stockfish is preparing the first analyzed move."
              : retryMode
                ? "Switch review-as filters or leave retry mode to see the full game."
                : "The selected game PGN did not produce reviewed moves."}
          </p>
        </section>
      )}
    </section>
  );
}

type ReviewTimeFilter = PersonalChessTimeClass | "all";
type ReviewResultFilter = "all" | PersonalChessOutcome;
type ReviewRatedFilter = "all" | "rated" | "unrated";

function IndividualGameReviewShell({
  analysisSettings,
  games,
  onSelectGame,
  selectedGameUrl,
}: {
  analysisSettings: SelectedDayAnalysisSettings;
  games: PersonalChessGame[];
  onSelectGame: (gameUrl: string) => void;
  selectedGameUrl: string | null;
}) {
  const [timeFilter, setTimeFilter] = useState<ReviewTimeFilter>("all");
  const [resultFilter, setResultFilter] = useState<ReviewResultFilter>("all");
  const [ratedFilter, setRatedFilter] = useState<ReviewRatedFilter>("all");
  const [dateFilter, setDateFilter] = useState("");
  const [opponentFilter, setOpponentFilter] = useState("");
  const filteredReviewGames = useMemo(() => {
    const opponent = opponentFilter.trim().toLowerCase();
    return [...games]
      .filter((game) => timeFilter === "all" || game.timeClass === timeFilter)
      .filter((game) => resultFilter === "all" || game.normalizedResult === resultFilter)
      .filter((game) => ratedFilter === "all" || (ratedFilter === "rated" ? game.rated : !game.rated))
      .filter((game) => !dateFilter || game.endDate === dateFilter)
      .filter((game) => !opponent || game.opponentUsername.toLowerCase().includes(opponent))
      .sort((left, right) => right.endTimestamp - left.endTimestamp);
  }, [dateFilter, games, opponentFilter, ratedFilter, resultFilter, timeFilter]);
  const selectedGame =
    filteredReviewGames.find((game) => game.gameUrl === selectedGameUrl) ??
    filteredReviewGames[0] ??
    games.find((game) => game.gameUrl === selectedGameUrl) ??
    null;

  useEffect(() => {
    if (selectedGame && selectedGame.gameUrl !== selectedGameUrl) {
      onSelectGame(selectedGame.gameUrl);
    }
  }, [onSelectGame, selectedGame, selectedGameUrl]);

  return (
    <section className="individual-review-shell" aria-label="Account game review picker">
      <div className="individual-review-picker">
        <div className="analysis-section-heading">
          <p className="eyebrow">Account games</p>
          <h3>Choose a game to review</h3>
        </div>
        <div className="individual-review-filter-grid">
          <label className="field">
            <span>Time</span>
            <select value={timeFilter} onChange={(event) => setTimeFilter(event.target.value as ReviewTimeFilter)}>
              <option value="all">All</option>
              {personalTimeClasses.map((timeClass) => (
                <option key={timeClass} value={timeClass}>
                  {personalTimeControlLabel(timeClass)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Result</span>
            <select value={resultFilter} onChange={(event) => setResultFilter(event.target.value as ReviewResultFilter)}>
              <option value="all">All</option>
              <option value="win">Wins</option>
              <option value="loss">Losses</option>
              <option value="draw">Draws</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label className="field">
            <span>Rated</span>
            <select value={ratedFilter} onChange={(event) => setRatedFilter(event.target.value as ReviewRatedFilter)}>
              <option value="all">All</option>
              <option value="rated">Rated</option>
              <option value="unrated">Unrated</option>
            </select>
          </label>
          <label className="field">
            <span>Date</span>
            <input type="date" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} />
          </label>
          <label className="field">
            <span>Opponent</span>
            <input value={opponentFilter} onChange={(event) => setOpponentFilter(event.target.value)} placeholder="Search opponent" />
          </label>
        </div>
        <div className="individual-game-picker-list">
          {filteredReviewGames.slice(0, 80).map((game) => (
            <button
              aria-pressed={selectedGame?.gameUrl === game.gameUrl}
              className={`individual-game-picker-row ${selectedGame?.gameUrl === game.gameUrl ? "selected" : ""}`}
              key={game.gameUrl}
              onClick={() => onSelectGame(game.gameUrl)}
              type="button"
            >
              <span>
                <strong>{formatDateLabel(game.endDate)} {formatGameTime(game.endTimestamp)}</strong>
                {personalTimeControlLabel(game.timeClass)} as {sideLabel(game.playerColor)}
              </span>
              <span>
                {personalGameResultLabel(game)} vs {game.opponentUsername}
                {game.opponentRating ? ` (${game.opponentRating})` : ""}
              </span>
              <span>{game.rated ? "Rated" : "Unrated"} {formatRating(game.playerRatingAfterGame)}</span>
            </button>
          ))}
          {filteredReviewGames.length === 0 ? (
            <p className="helper-text">No imported games match the current individual review filters.</p>
          ) : null}
        </div>
      </div>
      {selectedGame ? (
        <IndividualGameReviewPanel analysisSettings={analysisSettings} game={selectedGame} />
      ) : (
        <section className="analysis-placeholder-panel">
          <h3>No game selected</h3>
          <p className="helper-text">Sync or load account games, then select an individual game to review.</p>
        </section>
      )}
    </section>
  );
}

function RatingChangeGraph({ days }: { days: DailyChessSummary[] }) {
  const orderedDays = [...days].sort((left, right) => left.date.localeCompare(right.date));
  const values = orderedDays.map((day) => dailyNetChange(day) ?? 0);
  const maxAbs = Math.max(1, ...values.map((value) => Math.abs(value)));

  return (
    <section className="rating-graph-panel" aria-label="Daily rating change graph">
      <div>
        <p className="eyebrow">Rating change graph</p>
        <h3>Daily net movement</h3>
      </div>
      <div className="rating-change-chart">
        {orderedDays.map((day) => {
          const value = dailyNetChange(day) ?? 0;
          const barHeight = Math.max(8, Math.round((Math.abs(value) / maxAbs) * 88));
          return (
            <div className="rating-change-bar-wrap" key={day.date}>
              <span className={`rating-change-value ${ratingDeltaClass(value)}`}>{formatNetChange(value)}</span>
              <div className="rating-change-track">
                <span
                  className={`rating-change-bar ${ratingDeltaClass(value)}`}
                  style={{ height: `${barHeight}px` }}
                />
              </div>
              <span className="rating-change-date">{formatDateLabel(day.date)}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function DailySummaryReport({ days, onSelectDay }: { days: DailyChessSummary[]; onSelectDay: (date: string) => void }) {
  return (
    <section className="daily-report-panel" aria-label="Daily summary report">
      <div>
        <p className="eyebrow">Daily reports</p>
        <h3>Brief day-by-day summary</h3>
      </div>
      <div className="daily-report-list">
        {[...days].sort((left, right) => right.date.localeCompare(left.date)).map((day) => (
          <button className="daily-report-row" key={day.date} onClick={() => onSelectDay(day.date)} type="button">
            <strong>{formatDateLabel(day.date)}</strong>
            <span>{dailySummaryText(day)}</span>
            <strong className={`rating-delta ${ratingDeltaClass(dailyNetChange(day))}`}>{formatNetChange(dailyNetChange(day))}</strong>
          </button>
        ))}
      </div>
    </section>
  );
}

function SummaryMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <span>
      <strong>{value}</strong>
      {label}
    </span>
  );
}

function TimeClassSummaryCard({ summary }: { summary: DailyTimeClassSummary }) {
  return (
    <article className="chess-analysis-time-card">
      <div className="card-topline">
        <h4>{summary.timeClass}</h4>
        <span className={`rating-delta ${ratingDeltaClass(summary.netChange)}`}>
          {formatNetChange(summary.netChange)}
        </span>
      </div>
      <div className="chess-analysis-metrics">
        <SummaryMetric label="games" value={summary.gamesPlayed} />
        <SummaryMetric label="first" value={formatRating(summary.firstKnownRating)} />
        <SummaryMetric label="final" value={formatRating(summary.finalRating)} />
        <SummaryMetric label="W-L-D" value={`${summary.wins}-${summary.losses}-${summary.draws}`} />
      </div>
    </article>
  );
}

function DaySummaryButton({
  day,
  isSelected,
  onSelect,
}: {
  day: DailyChessSummary;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      aria-pressed={isSelected}
      className={`chess-analysis-day ${isSelected ? "selected" : ""}`}
      onClick={onSelect}
      type="button"
    >
      <div className="card-topline">
        <h3>{formatDateLabel(day.date)}</h3>
        <span>{day.games.length} games</span>
      </div>
      <div className="chess-analysis-day-classes">
        {timeClasses.map((timeClass) =>
          day.byTimeClass[timeClass] ? (
            <TimeClassSummaryCard key={timeClass} summary={day.byTimeClass[timeClass]} />
          ) : null,
        )}
      </div>
    </button>
  );
}

function AnalysisViewNav({
  activeView,
  onChange,
  playerLevel,
}: {
  activeView: AnalysisView;
  onChange: (view: AnalysisView) => void;
  playerLevel: PlayerLevel;
}) {
  return (
    <nav className="analysis-view-nav" aria-label="Chess.com analysis sections">
      {analysisViews.map((view) => (
        <button
          aria-pressed={activeView === view.id}
          className={activeView === view.id ? "selected" : ""}
          key={view.id}
          onClick={() => onChange(view.id)}
          type="button"
        >
          {view.labels[playerLevel]}
        </button>
      ))}
    </nav>
  );
}

function CopyTextButton({ label, text }: { label: string; text: string }) {
  const [status, setStatus] = useState<string | null>(null);

  async function copyText() {
    try {
      await navigator.clipboard.writeText(text);
      setStatus("Copied");
      window.setTimeout(() => setStatus(null), 1600);
    } catch {
      setStatus("Copy unavailable");
    }
  }

  return (
    <span className="copy-action-wrap">
      <button className="secondary-button" onClick={copyText} type="button">
        {label}
      </button>
      {status ? <small>{status}</small> : null}
    </span>
  );
}

function CriticalMoveList({ moves, showEngineDetails }: { moves: CriticalMoveAnalysis[]; showEngineDetails: boolean }) {
  if (moves.length === 0) {
    return <p className="helper-text">No critical moments found yet.</p>;
  }

  return (
    <ol className="critical-move-list">
      {moves.map((move) => (
        <li key={`${move.gameUrl}-${move.moveNumber}-${move.playedMoveUci}`}>
          <FenBoard bestMove={move.bestMove} fen={move.fenBefore} orientation={move.sideToMove} playedMove={move.playedMoveUci} />
          <div className="analysis-card-copy">
            <div className="card-topline">
              <strong>
                Move {move.moveNumber}: {move.playedMove}
              </strong>
              {showEngineDetails ? <span>{formatCentipawnLoss(move.centipawnLoss)}</span> : null}
            </div>
            <span className={`impact-pill impact-${move.impact?.severity ?? "minor"}`}>
              {move.impact?.label ?? "Engine improvement"}
            </span>
            <p>{explainCriticalMove(move)}</p>
            <p>
              Played {move.playedMove}; Stockfish preferred {formatMoveLabel(move.fenBefore, move.bestMove)}.
            </p>
            {showEngineDetails ? (
              <>
                <p>
                  Eval before {formatEvaluation(move.evalBefore)}, after played move {formatEvaluation(move.evalAfter)}.
                </p>
                <code>{move.fenBefore}</code>
              </>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

function FocusedCriticalMove({
  analysisSettings,
  move,
  playerLevel,
  showEngineDetails,
}: {
  analysisSettings: SelectedDayAnalysisSettings;
  move: CriticalMoveAnalysis;
  playerLevel: PlayerLevel;
  showEngineDetails: boolean;
}) {
  const [positionView, setPositionView] = useState<"after" | "before">("before");
  const bestMoveSan = formatMoveLabel(move.fenBefore, move.bestMove);
  const boardFen = positionView === "before" ? move.fenBefore : move.fenAfter;
  const allowEnginePanel = playerLevel === "advanced" || showEngineDetails;

  useEffect(() => {
    setPositionView("before");
  }, [move]);

  return (
    <article className="focused-review-card">
      <PlayableAnalysisBoard
        analysisSettings={analysisSettings}
        allowEnginePanel={allowEnginePanel}
        bestMove={positionView === "before" ? move.bestMove : undefined}
        fen={boardFen}
        lastMove={positionView === "after" ? move.playedMoveUci : undefined}
        orientation={move.sideToMove}
        playedMove={positionView === "before" ? move.playedMoveUci : undefined}
      />
      <div className="focused-review-copy">
        <div className="card-topline">
          <div>
            <p className="eyebrow">{playerLevel === "beginner" ? "Mistake" : "Critical move"} #{move.moveNumber}</p>
            <h3>Move {move.moveNumber}: {move.playedMove}</h3>
          </div>
          <span className={`impact-pill impact-${move.impact?.severity ?? "minor"}`}>
            {move.impact?.label ?? "Engine improvement"}
          </span>
        </div>
        <p className="coach-explanation">{explainCriticalMove(move)}</p>
        <p>{shortCoachSummary(move)}</p>
        <div className="move-replay-controls" aria-label="Move replay controls">
          <button
            aria-pressed={positionView === "before"}
            className={positionView === "before" ? "selected" : ""}
            onClick={() => setPositionView("before")}
            type="button"
          >
            Before move
          </button>
          <button
            aria-pressed={positionView === "after"}
            className={positionView === "after" ? "selected" : ""}
            onClick={() => setPositionView("after")}
            type="button"
          >
            After your move
          </button>
        </div>
        <dl className="move-detail-grid coach-detail-grid">
          <div>
            <dt>Played</dt>
            <dd>{move.playedMove}</dd>
          </div>
          <div>
            <dt>Coach move</dt>
            <dd>{bestMoveSan}</dd>
          </div>
          {showEngineDetails || playerLevel === "advanced" ? (
            <>
              <div>
                <dt>Loss</dt>
                <dd>{formatCentipawnLoss(move.centipawnLoss)}</dd>
              </div>
              <div>
                <dt>Eval change</dt>
                <dd>{formatEvaluation(move.evalBefore)} to {formatEvaluation(move.evalAfter)}</dd>
              </div>
            </>
          ) : null}
        </dl>
        {showEngineDetails || playerLevel === "advanced" ? (
          <div className="engine-detail-box">
            <p>
              Browser Stockfish preferred {bestMoveSan} ({move.bestMove}); the played move {move.playedMove} ({move.playedMoveUci}) changed the player-perspective evaluation from {formatEvaluation(move.evalBefore)} to {formatEvaluation(move.evalAfter)}.
            </p>
            <code>{move.fenBefore}</code>
            <div className="copy-action-row">
              <CopyTextButton label="Copy FEN" text={move.fenBefore} />
            </div>
          </div>
        ) : null}
        <a className="source-game-link" href={move.gameUrl} target="_blank" rel="noreferrer">
          Source game
        </a>
      </div>
    </article>
  );
}

function CriticalMovesSection({
  analysisSettings,
  moves,
  playerLevel,
  showEngineDetails,
}: {
  analysisSettings: SelectedDayAnalysisSettings;
  moves: CriticalMoveAnalysis[];
  playerLevel: PlayerLevel;
  showEngineDetails: boolean;
}) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const selectedMove = moves[Math.min(selectedIndex, Math.max(0, moves.length - 1))] ?? null;

  useEffect(() => {
    setSelectedIndex(0);
  }, [moves]);

  if (!selectedMove) {
    return (
      <section className="analysis-placeholder-panel">
        <h3>{playerLevel === "beginner" ? "Mistakes" : "Critical Moves"}</h3>
        <p className="helper-text">Run review for a selected date or game to populate coach moments.</p>
      </section>
    );
  }

  return (
    <section className="analysis-focus-section" aria-label={playerLevel === "beginner" ? "Mistakes" : "Critical Moves"}>
      <div className="analysis-section-heading">
        <p className="eyebrow">{playerLevel === "beginner" ? "Mistakes" : "Critical Moves"}</p>
        <h3>{playerLevel === "beginner" ? "Moves to review first" : "Top engine-impact moments"}</h3>
      </div>
      <FocusedCriticalMove
        analysisSettings={analysisSettings}
        move={selectedMove}
        playerLevel={playerLevel}
        showEngineDetails={showEngineDetails}
      />
      {moves.length > 1 ? (
        <div className="selectable-review-list">
          {moves.map((move, index) => (
            <button
              aria-pressed={selectedIndex === index}
              className={selectedIndex === index ? "selected" : ""}
              key={`${move.gameUrl}-${move.moveNumber}-${move.playedMoveUci}`}
              onClick={() => setSelectedIndex(index)}
              type="button"
            >
              <strong>#{index + 1} Move {move.moveNumber}: {move.playedMove}</strong>
              <span>
                {move.impact?.label ?? "Engine improvement"}
                {showEngineDetails || playerLevel === "advanced" ? ` · ${formatCentipawnLoss(move.centipawnLoss)}` : ""}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function CriticalMovePager({
  analysisSettings,
  moves,
  playerLevel,
  showEngineDetails,
}: {
  analysisSettings: SelectedDayAnalysisSettings;
  moves: CriticalMoveAnalysis[];
  playerLevel: PlayerLevel;
  showEngineDetails: boolean;
}) {
  const [index, setIndex] = useState(0);
  const boundedIndex = Math.min(index, Math.max(0, moves.length - 1));
  const selectedMove = moves[boundedIndex] ?? null;

  useEffect(() => {
    setIndex(0);
  }, [moves]);

  if (!selectedMove) {
    return <p className="helper-text">No saved critical moments match the current week and settings yet.</p>;
  }

  return (
    <div className="analysis-carousel">
      <div className="analysis-carousel-controls">
        <button className="secondary-button" disabled={boundedIndex === 0} onClick={() => setIndex((current) => Math.max(0, current - 1))} type="button">
          Previous
        </button>
        <span>{boundedIndex + 1} of {moves.length}</span>
        <button
          className="secondary-button"
          disabled={boundedIndex >= moves.length - 1}
          onClick={() => setIndex((current) => Math.min(moves.length - 1, current + 1))}
          type="button"
        >
          Next
        </button>
      </div>
      <FocusedCriticalMove
        analysisSettings={analysisSettings}
        move={selectedMove}
        playerLevel={playerLevel}
        showEngineDetails={showEngineDetails}
      />
    </div>
  );
}

function HomeworkPuzzleList({ puzzles, showEngineDetails }: { puzzles: HomeworkPuzzleCandidate[]; showEngineDetails: boolean }) {
  if (puzzles.length === 0) {
    return <p className="helper-text">No homework puzzles generated yet.</p>;
  }

  return (
    <ol className="homework-puzzle-list">
      {puzzles.map((puzzle) => (
        <li key={`${puzzle.gameUrl}-${puzzle.fen}`}>
          <FenBoard fen={puzzle.fen} orientation={puzzle.sideToMove} />
          <div className="analysis-card-copy">
            <strong>Find the best move for {sideLabel(puzzle.sideToMove)}.</strong>
            <span className={`impact-pill impact-${puzzle.impact?.severity ?? "minor"}`}>
              {puzzle.impact?.label ?? "Engine improvement"}
            </span>
            <p>{puzzle.explanation}</p>
            {showEngineDetails ? <code>{puzzle.fen}</code> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

function FocusedHomeworkPuzzle({
  analysisSettings,
  playerLevel,
  puzzle,
  showEngineDetails,
}: {
  analysisSettings: SelectedDayAnalysisSettings;
  playerLevel: PlayerLevel;
  puzzle: HomeworkPuzzleCandidate;
  showEngineDetails: boolean;
}) {
  const [revealed, setRevealed] = useState(false);
  const [hintCount, setHintCount] = useState(0);
  const [status, setStatus] = useState<"active" | "skipped" | "solved">("active");
  const bestMoveSan = formatMoveLabel(puzzle.fen, puzzle.bestMove);
  const allowEnginePanel = playerLevel === "advanced" || showEngineDetails;

  useEffect(() => {
    setRevealed(false);
    setHintCount(0);
    setStatus("active");
  }, [puzzle]);

  return (
    <article className="focused-review-card">
      <PlayableAnalysisBoard
        analysisSettings={analysisSettings}
        allowEnginePanel={allowEnginePanel}
        bestMove={revealed ? puzzle.bestMove : undefined}
        fen={puzzle.fen}
        orientation={puzzle.sideToMove}
      />
      <div className="focused-review-copy">
        <div className="card-topline">
          <div>
            <p className="eyebrow">Homework</p>
            <h3>Find the best move for {sideLabel(puzzle.sideToMove)}</h3>
          </div>
          <span className={`impact-pill impact-${puzzle.impact?.severity ?? "minor"}`}>
            {puzzle.impact?.label ?? "Engine improvement"}
          </span>
        </div>
        <p>{puzzle.explanation}</p>
        <div className={`homework-state-pill state-${status}`}>
          {status === "solved" ? "Solved locally" : status === "skipped" ? "Skipped locally" : "Ready to solve"}
        </div>
        <div className="homework-action-row">
          <button className="secondary-button" disabled={hintCount >= 2} onClick={() => setHintCount((current) => Math.min(2, current + 1))} type="button">
            {hintCount === 0 ? "Hint" : "Next hint"}
          </button>
          <button className="secondary-button primary-action" onClick={() => setRevealed((current) => !current)} type="button">
            {revealed ? "Hide answer" : "Reveal answer"}
          </button>
          <button className="secondary-button" onClick={() => setStatus("solved")} type="button">
            Mark solved
          </button>
          <button className="secondary-button" onClick={() => setStatus("skipped")} type="button">
            Skip
          </button>
          <button
            className="secondary-button"
            onClick={() => {
              setHintCount(0);
              setRevealed(false);
              setStatus("active");
            }}
            type="button"
          >
            Retry
          </button>
        </div>
        {hintCount >= 1 ? <p className="homework-hint">{homeworkHintOne(puzzle)}</p> : null}
        {hintCount >= 2 ? <p className="homework-hint">{homeworkHintTwo(puzzle)}</p> : null}
        {revealed ? (
          <dl className="move-detail-grid">
            <div>
              <dt>Best move</dt>
              <dd>{bestMoveSan}</dd>
            </div>
            <div>
              <dt>Played</dt>
              <dd>{puzzle.playedMove}</dd>
            </div>
            <div>
              <dt>Eval loss</dt>
              <dd>{formatCentipawnLoss(puzzle.centipawnLoss)}</dd>
            </div>
          </dl>
        ) : null}
        {showEngineDetails || playerLevel === "advanced" ? (
          <div className="engine-detail-box">
            <p>Engine move {puzzle.bestMove}; source position below.</p>
            <code>{puzzle.fen}</code>
            <div className="copy-action-row">
              <CopyTextButton label="Copy FEN" text={puzzle.fen} />
            </div>
          </div>
        ) : null}
        <a className="source-game-link" href={puzzle.gameUrl} target="_blank" rel="noreferrer">
          Source game
        </a>
      </div>
    </article>
  );
}

function HomeworkSection({
  analysisSettings,
  playerLevel,
  puzzles,
  showEngineDetails,
}: {
  analysisSettings: SelectedDayAnalysisSettings;
  playerLevel: PlayerLevel;
  puzzles: HomeworkPuzzleCandidate[];
  showEngineDetails: boolean;
}) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const selectedPuzzle = puzzles[Math.min(selectedIndex, Math.max(0, puzzles.length - 1))] ?? null;

  useEffect(() => {
    setSelectedIndex(0);
  }, [puzzles]);

  if (!selectedPuzzle) {
    return (
      <section className="analysis-placeholder-panel">
        <h3>Homework</h3>
        <p className="helper-text">Run Analysis for a selected date or game to generate homework puzzles.</p>
      </section>
    );
  }

  return (
    <section className="analysis-focus-section" aria-label="Homework">
      <div className="analysis-section-heading">
        <p className="eyebrow">{playerLevel === "beginner" ? "Practice" : "Homework"}</p>
        <h3>Practice positions</h3>
      </div>
      <FocusedHomeworkPuzzle
        analysisSettings={analysisSettings}
        playerLevel={playerLevel}
        puzzle={selectedPuzzle}
        showEngineDetails={showEngineDetails}
      />
      {puzzles.length > 1 ? (
        <div className="selectable-review-list">
          {puzzles.map((puzzle, index) => (
            <button
              aria-pressed={selectedIndex === index}
              className={selectedIndex === index ? "selected" : ""}
              key={`${puzzle.gameUrl}-${puzzle.fen}`}
              onClick={() => setSelectedIndex(index)}
              type="button"
            >
              <strong>#{index + 1} {sideLabel(puzzle.sideToMove)} to move</strong>
              <span>
                {puzzle.impact?.label ?? "Engine improvement"}
                {showEngineDetails || playerLevel === "advanced" ? ` · ${formatCentipawnLoss(puzzle.centipawnLoss)}` : ""}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function HomeworkPuzzlePager({
  analysisSettings,
  playerLevel,
  puzzles,
  showEngineDetails,
}: {
  analysisSettings: SelectedDayAnalysisSettings;
  playerLevel: PlayerLevel;
  puzzles: HomeworkPuzzleCandidate[];
  showEngineDetails: boolean;
}) {
  const [index, setIndex] = useState(0);
  const boundedIndex = Math.min(index, Math.max(0, puzzles.length - 1));
  const selectedPuzzle = puzzles[boundedIndex] ?? null;

  useEffect(() => {
    setIndex(0);
  }, [puzzles]);

  if (!selectedPuzzle) {
    return <p className="helper-text">No saved homework puzzles match the current week and settings yet.</p>;
  }

  return (
    <div className="analysis-carousel">
      <div className="analysis-carousel-controls">
        <button className="secondary-button" disabled={boundedIndex === 0} onClick={() => setIndex((current) => Math.max(0, current - 1))} type="button">
          Previous
        </button>
        <span>{boundedIndex + 1} of {puzzles.length}</span>
        <button
          className="secondary-button"
          disabled={boundedIndex >= puzzles.length - 1}
          onClick={() => setIndex((current) => Math.min(puzzles.length - 1, current + 1))}
          type="button"
        >
          Next
        </button>
      </div>
      <FocusedHomeworkPuzzle
        analysisSettings={analysisSettings}
        playerLevel={playerLevel}
        puzzle={selectedPuzzle}
        showEngineDetails={showEngineDetails}
      />
    </div>
  );
}

function WeeklyTimeClassCard({ summary }: { summary: WeeklyTimeClassSummary }) {
  return (
    <article className="weekly-summary-card">
      <div className="card-topline">
        <h3>{summary.timeClass}</h3>
        <span className={`rating-delta ${ratingDeltaClass(summary.netChange)}`}>
          {formatNetChange(summary.netChange)}
        </span>
      </div>
      <div className="chess-analysis-metrics">
        <SummaryMetric label="games" value={summary.gamesPlayed} />
        <SummaryMetric label="first" value={formatRating(summary.firstKnownRating)} />
        <SummaryMetric label="final" value={formatRating(summary.finalRating)} />
        <SummaryMetric label="W-L-D" value={`${summary.wins}-${summary.losses}-${summary.draws}`} />
      </div>
    </article>
  );
}

function EngineSettingsControls({
  analysisRunning,
  analysisSettings,
  onSettingChange,
}: {
  analysisRunning: boolean;
  analysisSettings: SelectedDayAnalysisSettings;
  onSettingChange: (key: keyof SelectedDayAnalysisSettings, value: number) => void;
}) {
  return (
    <div className="analysis-settings-grid" aria-label="Stockfish analysis settings">
      <label className="field">
        <span>Depth</span>
        <input
          disabled={analysisRunning}
          max={18}
          min={1}
          type="number"
          value={analysisSettings.depth}
          onChange={(event) => onSettingChange("depth", Number(event.target.value))}
        />
      </label>
      <label className="field">
        <span>Time / position (ms)</span>
        <input
          disabled={analysisRunning}
          max={3000}
          min={100}
          step={100}
          type="number"
          value={analysisSettings.moveTimeMs}
          onChange={(event) => onSettingChange("moveTimeMs", Number(event.target.value))}
        />
      </label>
      <label className="field">
        <span>Max games</span>
        <input
          disabled={analysisRunning}
          max={8}
          min={1}
          type="number"
          value={analysisSettings.maxGames}
          onChange={(event) => onSettingChange("maxGames", Number(event.target.value))}
        />
      </label>
      <label className="field">
        <span>Max player moves</span>
        <input
          disabled={analysisRunning}
          max={60}
          min={1}
          type="number"
          value={analysisSettings.maxMoves}
          onChange={(event) => onSettingChange("maxMoves", Number(event.target.value))}
        />
      </label>
    </div>
  );
}

function formatAnalysisSettingsSummary(settings: SelectedDayAnalysisSettings): string {
  return `depth ${settings.depth}, ${settings.moveTimeMs}ms per position, up to ${settings.maxGames} game(s), ${settings.maxMoves} player move(s)`;
}

function formatGameScope(status: DailyAnalysisStatus | null, fallbackGameCount: number): string {
  const gameCount = status?.gameCount ?? fallbackGameCount;
  const analyzedCount = status?.analyzedGameCount ?? 0;
  if (!status || status.status === "not_analyzed") {
    return `selected day, ${gameCount} game(s)`;
  }

  if (status.status === "cached_complete" || status.status === "cached_partial") {
    return `${analyzedCount}/${gameCount} saved game(s)`;
  }

  return `${gameCount} game(s) in current scope`;
}

function savedRunStatusCopy(status: DailyAnalysisStatus | null, relatedStatuses: DailyAnalysisStatus[]): string {
  if (!status) {
    return "Load games to check saved analysis.";
  }

  if (status.status === "cached_complete") {
    return "Saved analysis matches current settings.";
  }

  if (status.status === "cached_partial") {
    return "A saved partial run matches current settings.";
  }

  if (status.status === "in_progress") {
    return "A run was started for this exact scope.";
  }

  if (status.status === "failed") {
    return "A previous run stopped for this exact scope; retry is available.";
  }

  if (status.status === "skipped_no_games") {
    return "No games exist for this time control and day.";
  }

  if (relatedStatuses.length > 0) {
    return "A saved run exists for this day, but settings or game scope differ.";
  }

  return "No saved analysis for this day yet.";
}

function selectedDaySavedAnalysisNote(settings: SelectedDayAnalysisSettings): string {
  return `Saved analysis is matched by username, date, game scope, and settings (${formatAnalysisSettingsSummary(settings)}). Changing settings or switching between all-day and single-game review only changes which saved run is reused.`;
}

function weeklySavedAnalysisNote(settings: SelectedDayAnalysisSettings): string {
  return `Weekly coverage counts saved selected-day reviews that match the current time control and settings (${formatAnalysisSettingsSummary(settings)}). Single-game reviews stay useful in the day review, but they are not counted as weekly day coverage.`;
}

function weeklyCoverageCopy(report: WeeklyReport): string {
  if (report.analysisCoverage.totalDayCount === 0) {
    return "No active days in this week for the selected time control.";
  }

  if (report.analysisCoverage.analyzedDayCount === report.analysisCoverage.totalDayCount) {
    return "Every active day in this week has a matching saved selected-day review.";
  }

  const mismatchCount = report.analysisCoverage.days.filter(
    (status) => status.status === "not_analyzed" && status.lastAnalyzedAt,
  ).length;
  if (mismatchCount > 0) {
    return `${mismatchCount} day(s) have a saved status that does not match the current settings or scope. Reuse the old settings or analyze the day again.`;
  }

  return "Some active days do not have matching selected-day analysis yet. Analyze one missing day at a time.";
}

function analysisSettingsEqual(left: SelectedDayAnalysisSettings, right: SelectedDayAnalysisSettings): boolean {
  return (
    left.depth === right.depth &&
    left.maxGames === right.maxGames &&
    left.maxMoves === right.maxMoves &&
    left.moveTimeMs === right.moveTimeMs
  );
}

function personalTimeControlLabel(timeClass: PersonalChessTimeClass): string {
  return timeClass[0].toUpperCase() + timeClass.slice(1);
}

function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}

function formatStoredDate(date: string | null): string {
  return date ? formatDateLabel(date) : "n/a";
}

function formatSyncTime(value: string | null | undefined): string {
  if (!value) {
    return "Never";
  }

  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
  }).format(new Date(value));
}

function PersonalStatCard({ label, tone = "neutral", value }: { label: string; tone?: "negative" | "neutral" | "positive"; value: string }) {
  return (
    <article className={`personal-stat-card tone-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function PersonalTimeSummaryCard({ summary }: { summary: PersonalTimeClassSummary }) {
  return (
    <article className="personal-time-summary-card">
      <div className="card-topline">
        <h3>{personalTimeControlLabel(summary.timeClass)}</h3>
        <span className={`rating-delta ${ratingDeltaClass(summary.ratingChange90)}`}>
          {formatNetChange(summary.ratingChange90)}
        </span>
      </div>
      <div className="chess-analysis-metrics">
        <SummaryMetric label="current" value={formatRating(summary.currentRating)} />
        <SummaryMetric label="games" value={summary.gamesPlayed} />
        <SummaryMetric label="score" value={formatPercent(summary.scorePercent)} />
        <SummaryMetric label="W-L-D" value={`${summary.wins}-${summary.losses}-${summary.draws}`} />
      </div>
    </article>
  );
}

function PersonalSyncPanel({
  importResult,
  loading,
  meta,
  onSync,
  onUsernameChange,
  progress,
  syncError,
  username,
}: {
  importResult: PersonalChessImportResult | null;
  loading: boolean;
  meta: PersonalChessSyncMeta | null;
  onSync: (scope: PersonalChessSyncScope) => void;
  onUsernameChange: (username: string) => void;
  progress: PersonalChessSyncProgress | null;
  syncError: string | null;
  username: string;
}) {
  const [scope, setScope] = useState<PersonalChessSyncScope>("all");
  const progressCopy =
    progress && progress.total > 0
      ? `${progress.message} ${Math.min(progress.current + 1, progress.total)} / ${progress.total}`
      : progress?.message ?? null;

  return (
    <section className="personal-sync-panel" aria-label="Game sync and import">
      <div>
        <p className="eyebrow">Game sync</p>
        <h3>Chess.com import</h3>
      </div>
      <div className="personal-sync-controls">
        <label className="field">
          <span>Blake's Chess.com username</span>
          <input
            autoComplete="off"
            placeholder={blakeChessTrainerConfig.defaultUsername}
            value={username}
            onChange={(event) => onUsernameChange(event.target.value)}
          />
        </label>
        <label className="field">
          <span>Archives</span>
          <select value={scope} onChange={(event) => setScope(event.target.value as PersonalChessSyncScope)}>
            <option value="all">All public archives</option>
            <option value="recent">Recent 3 archives</option>
          </select>
        </label>
        <button className="secondary-button primary-action" disabled={loading} onClick={() => onSync(scope)} type="button">
          <Download size={17} aria-hidden="true" />
          {loading ? "Syncing" : "Sync games"}
        </button>
      </div>
      <div className="personal-sync-meta">
        <span>Last sync: {formatSyncTime(meta?.lastSyncedAt)}</span>
        <span>Imported games: {meta?.importedGameCount ?? 0}</span>
        <span>Archives: {meta?.archiveUrls.length ?? 0}</span>
        {importResult ? (
          <span>
            New {importResult.insertedCount}, updated {importResult.updatedCount}, duplicates {importResult.duplicateCount}
          </span>
        ) : null}
      </div>
      {progressCopy ? <p className="helper-text" role="status">{progressCopy}</p> : null}
      {syncError ? <p className="error-text">{syncError}</p> : null}
    </section>
  );
}

function PersonalDashboardSection({ report }: { report: PersonalChessReport }) {
  const rapidSummary = report.timeClassSummaries.find((summary) => summary.timeClass === "rapid");
  const worst = report.worstRecentTimeClass;

  return (
    <section className="personal-dashboard-section" aria-label="Personal dashboard">
      <div className="personal-focus-panel">
        <div>
          <p className="eyebrow">Today's focus</p>
          <h3>{report.todaysFocus}</h3>
        </div>
        <div className="personal-focus-stats">
          <PersonalStatCard label="Imported" value={`${report.totalGames}`} />
          <PersonalStatCard label="Range" value={`${formatStoredDate(report.importedRange.start)} - ${formatStoredDate(report.importedRange.end)}`} />
          <PersonalStatCard
            label="Worst recent"
            tone={(worst?.ratingChange90 ?? 0) < 0 ? "negative" : "neutral"}
            value={worst ? `${personalTimeControlLabel(worst.timeClass)} ${formatNetChange(worst.ratingChange90)}` : "n/a"}
          />
          <PersonalStatCard
            label="Rapid 90d"
            tone={(rapidSummary?.ratingChange90 ?? 0) < 0 ? "negative" : (rapidSummary?.ratingChange90 ?? 0) > 0 ? "positive" : "neutral"}
            value={formatNetChange(rapidSummary?.ratingChange90 ?? null)}
          />
        </div>
      </div>
      <div className="personal-summary-grid">
        {report.timeClassSummaries.map((summary) => (
          <PersonalTimeSummaryCard key={summary.timeClass} summary={summary} />
        ))}
      </div>
      <div className="personal-output-grid">
        <article>
          <p className="eyebrow">Rating trend summary</p>
          <strong>{report.ratingTrendSummary}</strong>
        </article>
        <article>
          <p className="eyebrow">Rapid decline report</p>
          <strong>{report.rapidDeclineReport}</strong>
        </article>
        <article>
          <p className="eyebrow">Tilt/session report</p>
          <strong>{report.tiltSessionReport}</strong>
        </article>
      </div>
      <div className="personal-color-grid">
        {report.scoreByColor.map((summary) => (
          <article key={summary.color}>
            <p className="eyebrow">{sideLabel(summary.color)}</p>
            <strong>{formatPercent(summary.scorePercent)} score</strong>
            <span>
              {summary.gamesPlayed} game(s), {summary.wins}-{summary.losses}-{summary.draws}
            </span>
          </article>
        ))}
      </div>
      <div className="personal-streak-row">
        {report.lossStreaks
          .filter((streak) => personalTimeClasses.includes(streak.timeClass))
          .map((streak) => (
            <span key={streak.timeClass}>
              {personalTimeControlLabel(streak.timeClass)} streak: current {streak.current}, max {streak.max}
            </span>
          ))}
      </div>
    </section>
  );
}

function recommendationClass(recommendation: PersonalOpeningLeak["recommendation"]): string {
  return recommendation.toLowerCase();
}

function OpeningLeakTable({
  onSelectDrill,
  openings,
}: {
  onSelectDrill: (drillId: string) => void;
  openings: PersonalOpeningLeak[];
}) {
  if (openings.length === 0) {
    return <p className="helper-text">No repeated opening leak is visible in the current 90-day window.</p>;
  }

  return (
    <div className="personal-opening-table-wrap">
      <div className="recommendation-legend" aria-label="Opening repair recommendation labels">
        {(["Keep", "Repair", "Quarantine"] as PersonalOpeningLeak["recommendation"][]).map((recommendation) => (
          <span className={`recommendation-pill recommendation-${recommendationClass(recommendation)}`} key={recommendation}>
            {recommendation}
          </span>
        ))}
      </div>
      <table className="personal-opening-table">
        <thead>
          <tr>
            <th>Opening</th>
            <th>Color</th>
            <th>Score</th>
            <th>Games</th>
            <th>Losses</th>
            <th>Avg moves</th>
            <th>Failure phase</th>
            <th>Drills</th>
            <th>Recommendation</th>
          </tr>
        </thead>
        <tbody>
          {openings.map((opening) => (
            <tr className={`opening-row-${recommendationClass(opening.recommendation)}`} key={`${opening.color}-${opening.eco}-${opening.opening}`}>
              <td>
                <a href={opening.sampleGameUrl} target="_blank" rel="noreferrer">
                  {opening.eco} {opening.opening}
                </a>
              </td>
              <td>{sideLabel(opening.color)}</td>
              <td>{formatPercent(opening.scorePercent)}</td>
              <td>{opening.gamesPlayed}</td>
              <td>{opening.losses}/{opening.gamesPlayed}</td>
              <td>{opening.averageMoveCount ?? "n/a"}</td>
              <td>{opening.commonFailurePhase ?? "n/a"}</td>
              <td>
                {opening.drillIds.length > 0 ? (
                  <div className="opening-drill-links">
                    {opening.drillIds.slice(0, 3).map((drillId, index) => (
                      <button className="inline-link-button" key={drillId} onClick={() => onSelectDrill(drillId)} type="button">
                        Drill {index + 1}
                      </button>
                    ))}
                  </div>
                ) : (
                  "None yet"
                )}
              </td>
              <td>
                <span className={`recommendation-pill recommendation-${recommendationClass(opening.recommendation)}`}>
                  {opening.recommendation}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PersonalLeakReportSection({
  onSelectDrill,
  report,
}: {
  onSelectDrill: (drillId: string) => void;
  report: PersonalChessReport;
}) {
  const leakReport = report.leakReport;

  return (
    <section className="personal-leak-section" aria-label="Leak report">
      <div className="analysis-section-heading">
        <p className="eyebrow">Leak report v1</p>
        <h3>Metadata leaks from Blake's recent games</h3>
      </div>
      <div className="personal-leak-grid">
        <article>
          <p className="eyebrow">Repeated losses by color</p>
          <strong>
            {leakReport.repeatedLossColor
              ? `${sideLabel(leakReport.repeatedLossColor.color)} loss rate ${formatPercent(leakReport.repeatedLossColor.lossRate)}`
              : "No color-specific loss pattern yet"}
          </strong>
        </article>
        <article>
          <p className="eyebrow">Short losses</p>
          <strong>{leakReport.shortLosses.length} under 25 moves</strong>
        </article>
        <article>
          <p className="eyebrow">Timeouts</p>
          <strong>{leakReport.timeouts.length} recent timeout loss(es)</strong>
        </article>
        <article>
          <p className="eyebrow">Resignations</p>
          <strong>{leakReport.resignationLosses} recent resignation loss(es)</strong>
        </article>
        <article>
          <p className="eyebrow">After a loss</p>
          <strong>{formatPercent(leakReport.lossAfterLoss.scorePercent)} score</strong>
          <span>{leakReport.lossAfterLoss.games} follow-up game(s)</span>
        </article>
        <article>
          <p className="eyebrow">Bullet before rapid</p>
          <strong>{leakReport.bulletBeforeRapidWarning ? "Avoid before rapid" : "No clear warning"}</strong>
        </article>
      </div>
      <section className="analysis-placeholder-panel">
        <h3>Opening repair table</h3>
        <OpeningLeakTable onSelectDrill={onSelectDrill} openings={report.openingLeakTable} />
      </section>
      <section className="analysis-placeholder-panel">
        <h3>Rapid/blitz/bullet volume over time</h3>
        <div className="personal-volume-list">
          {leakReport.volumeBuckets.map((bucket) => (
            <span key={bucket.label}>
              <strong>{bucket.label}</strong>
              Rapid {bucket.rapid}, blitz {bucket.blitz}, bullet {bucket.bullet}
            </span>
          ))}
        </div>
      </section>
    </section>
  );
}

function PersonalSessionRulesPanel({ report }: { report: PersonalChessReport }) {
  const rules = report.sessionRules;

  return (
    <section className="personal-session-panel" aria-label="Session rules">
      <div>
        <p className="eyebrow">Session/play rules</p>
        <h3>Rules for Blake's next rated session</h3>
      </div>
      <div className="personal-rule-grid">
        <article>
          <strong>{rules.maxRapidGames}</strong>
          <span>max rapid games per session</span>
        </article>
        <article>
          <strong>{rules.stopAfterLosses}</strong>
          <span>stop after losses</span>
        </article>
        <article>
          <strong>{rules.noBulletBeforeRapid ? "No" : "Allowed"}</strong>
          <span>bullet before rapid</span>
        </article>
        <article>
          <strong>{rules.reviewRapidLossBeforeNextRapid ? "Required" : "Optional"}</strong>
          <span>review rapid loss before next rapid</span>
        </article>
      </div>
      <p className="coach-explanation">{rules.dangerPattern}</p>
      {report.sessionGuardrails.length > 0 ? (
        <div className="session-guardrail-list" aria-label="Session guardrails">
          {report.sessionGuardrails.map((guardrail) => (
            <span key={guardrail}>{guardrail}</span>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function PersonalDrillCard({
  isSelected,
  drill,
  onStatusChange,
}: {
  drill: PersonalChessReport["drillQueue"][number];
  isSelected: boolean;
  onStatusChange: (id: string, status: PersonalDrillStatus) => void;
}) {
  const [candidateMoves, setCandidateMoves] = useState("");
  const [revealed, setRevealed] = useState(false);
  const bestMoveLabel = formatMoveLabel(drill.fenBefore, drill.bestMove);
  const playedMoveLabel = formatMoveLabel(drill.fenBefore, drill.playedMoveUci, drill.playedMove);
  const drillState = drill.dueToday ? "due" : drill.status;
  const drillStateLabel = drill.dueToday
    ? "Due today"
    : drill.status === "solved"
      ? "Solved"
      : drill.status === "failed"
        ? "Failed"
        : "Needs review";

  useEffect(() => {
    setCandidateMoves("");
    setRevealed(false);
  }, [drill.id]);

  return (
    <article className={`personal-drill-card drill-${drillState} ${isSelected ? "selected" : ""}`}>
      <FenBoard
        bestMove={revealed ? drill.bestMove : undefined}
        fen={drill.fenBefore}
        mistakeMove={revealed ? drill.playedMoveUci : undefined}
        orientation={drill.sideToMove}
        playedMove={revealed ? drill.playedMoveUci : undefined}
      />
      <div className="personal-drill-copy">
        <div className="card-topline">
          <div>
            <p className="eyebrow">Replay my mistake</p>
            <h3>{sideLabel(drill.sideToMove)} to move before Blake's mistake</h3>
          </div>
          <span className="impact-pill impact-major">{leakTagLabels[drill.leakTag]}</span>
        </div>
        <label className="field">
          <span>Candidate move / chosen move</span>
          <input placeholder="Example: Nf3 or g1f3" value={candidateMoves} onChange={(event) => setCandidateMoves(event.target.value)} />
        </label>
        <div className="homework-action-row">
          <button className="secondary-button primary-action" onClick={() => setRevealed((current) => !current)} type="button">
            <Eye size={17} aria-hidden="true" />
            {revealed ? "Hide answer" : "Reveal mistake"}
          </button>
          <button className="secondary-button" onClick={() => onStatusChange(drill.id, "solved")} type="button">
            <CheckCircle2 size={17} aria-hidden="true" />
            Solved
          </button>
          <button className="secondary-button" onClick={() => onStatusChange(drill.id, "failed")} type="button">
            <Repeat2 size={17} aria-hidden="true" />
            Failed
          </button>
          <button className="secondary-button" onClick={() => onStatusChange(drill.id, "needs-review")} type="button">
            <XCircle size={17} aria-hidden="true" />
            Needs review
          </button>
        </div>
        <div className={`homework-state-pill state-${drillState}`}>
          {drillStateLabel}
        </div>
        {revealed ? (
          <dl className="move-detail-grid">
            <div>
              <dt>Best move</dt>
              <dd>{bestMoveLabel}</dd>
            </div>
            <div>
              <dt>Blake played</dt>
              <dd>{playedMoveLabel}</dd>
            </div>
            <div>
              <dt>Eval drop</dt>
              <dd>{formatCentipawnLoss(drill.evalDrop)}</dd>
            </div>
            <div>
              <dt>Leak tag</dt>
              <dd>{leakTagLabels[drill.leakTag]}</dd>
            </div>
          </dl>
        ) : null}
        <dl className="move-detail-grid drill-review-grid">
          <div>
            <dt>Attempts</dt>
            <dd>{drill.review.attempts}</dd>
          </div>
          <div>
            <dt>Correct / incorrect</dt>
            <dd>{drill.review.correct}/{drill.review.incorrect}</dd>
          </div>
          <div>
            <dt>Last reviewed</dt>
            <dd>{drill.review.lastReviewedDate ? formatDateLabel(drill.review.lastReviewedDate) : "Never"}</dd>
          </div>
          <div>
            <dt>Next due</dt>
            <dd>{formatDateLabel(drill.review.nextDueDate)}</dd>
          </div>
          <div>
            <dt>Interval</dt>
            <dd>{drill.review.intervalDays === 0 ? "Today" : `${drill.review.intervalDays} day(s)`}</dd>
          </div>
        </dl>
        <a className="source-game-link" href={drill.gameUrl} target="_blank" rel="noreferrer">
          Source game
        </a>
      </div>
    </article>
  );
}

function PersonalDrillBank({
  analysisError,
  analysisProgress,
  analysisRunning,
  onAnalyzeRapidLosses,
  onDrillStatusChange,
  onStopAnalysis,
  report,
  selectedDrillId,
}: {
  analysisError: string | null;
  analysisProgress: SelectedDayAnalysisProgress | null;
  analysisRunning: boolean;
  onAnalyzeRapidLosses: () => void;
  onDrillStatusChange: (id: string, status: PersonalDrillStatus) => void;
  onStopAnalysis: () => void;
  report: PersonalChessReport;
  selectedDrillId: string | null;
}) {
  const progressCopy =
    analysisProgress && analysisProgress.total > 0
      ? `${analysisProgress.message} ${Math.min(analysisProgress.current + 1, analysisProgress.total)} / ${analysisProgress.total}`
      : analysisProgress?.message ?? null;
  const visibleDrills = report.dueDrillQueue.length > 0 ? report.dueDrillQueue : report.drillQueue;
  const selectedDrill = selectedDrillId ? report.drillQueue.find((drill) => drill.id === selectedDrillId) : null;
  const orderedVisibleDrills = selectedDrill
    ? [selectedDrill, ...visibleDrills.filter((drill) => drill.id !== selectedDrill.id)]
    : visibleDrills;

  return (
    <section className="personal-drill-bank" aria-label="Personal drill bank">
      <div className="card-topline">
        <div>
          <p className="eyebrow">Personal drill bank</p>
          <h3>Drills from Blake's games</h3>
        </div>
        <div className="homework-action-row">
          <button className="secondary-button primary-action" disabled={analysisRunning} onClick={onAnalyzeRapidLosses} type="button">
            <Brain size={17} aria-hidden="true" />
            Analyze recent rapid losses
          </button>
          <button className="secondary-button" disabled={!analysisRunning} onClick={onStopAnalysis} type="button">
            Stop
          </button>
        </div>
      </div>
      <div className="personal-sync-meta">
        <span>Stockfish: {analysisError ? "skipped/unavailable" : report.drillQueue.length > 0 ? "saved drills available" : "optional"}</span>
        <span>Due today: {report.dueDrillCount}</span>
        <span>Saved drills: {report.drillQueue.length}</span>
      </div>
      {progressCopy ? <p className="helper-text" role="status">{progressCopy}</p> : null}
      {analysisError ? <p className="error-text">Stockfish analysis unavailable. {analysisError}</p> : null}
      {report.drillQueue.length === 0 ? (
        <section className="analysis-placeholder-panel">
          <h3>Personal drill queue</h3>
          <p className="helper-text">No saved FEN drills yet. Metadata reports still work without Stockfish.</p>
        </section>
      ) : (
        <>
          <section className={`due-repair-panel ${report.dueDrillCount > 0 ? "has-due" : ""}`}>
            <strong>{report.dueDrillCount > 0 ? "Due-today repair queue" : "No drills due today"}</strong>
            <span>
              {report.dueDrillCount > 0
                ? "Finish these replay cards before rated rapid."
                : "The next saved drill appears when its review date arrives."}
            </span>
          </section>
          <div className="personal-drill-list">
            {orderedVisibleDrills.slice(0, 6).map((drill) => (
              <PersonalDrillCard
                drill={drill}
                isSelected={selectedDrillId === drill.id}
                key={drill.id}
                onStatusChange={onDrillStatusChange}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function PersonalTrainerPanel({
  analysisError,
  analysisProgress,
  analysisRunning,
  games,
  importResult,
  loading,
  meta,
  onAnalyzeRapidLosses,
  onSelectDrill,
  onDrillStatusChange,
  onStopAnalysis,
  onSync,
  onUsernameChange,
  progress,
  report,
  selectedDrillId,
  syncError,
  username,
}: {
  analysisError: string | null;
  analysisProgress: SelectedDayAnalysisProgress | null;
  analysisRunning: boolean;
  games: PersonalChessGame[];
  importResult: PersonalChessImportResult | null;
  loading: boolean;
  meta: PersonalChessSyncMeta | null;
  onAnalyzeRapidLosses: () => void;
  onSelectDrill: (drillId: string) => void;
  onDrillStatusChange: (id: string, status: PersonalDrillStatus) => void;
  onStopAnalysis: () => void;
  onSync: (scope: PersonalChessSyncScope) => void;
  onUsernameChange: (username: string) => void;
  progress: PersonalChessSyncProgress | null;
  report: PersonalChessReport;
  selectedDrillId: string | null;
  syncError: string | null;
  username: string;
}) {
  return (
    <section className="personal-trainer-panel" aria-label="Blake personal chess trainer">
      <PersonalSyncPanel
        importResult={importResult}
        loading={loading}
        meta={meta}
        onSync={onSync}
        onUsernameChange={onUsernameChange}
        progress={progress}
        syncError={syncError}
        username={username}
      />
      {games.length === 0 ? (
        <section className="analysis-placeholder-panel">
          <h3>No imported games</h3>
          <p className="helper-text">The dashboard will populate after the first Chess.com sync.</p>
        </section>
      ) : null}
      <PersonalDashboardSection report={report} />
      <PersonalLeakReportSection onSelectDrill={onSelectDrill} report={report} />
      <PersonalSessionRulesPanel report={report} />
      <PersonalDrillBank
        analysisError={analysisError}
        analysisProgress={analysisProgress}
        analysisRunning={analysisRunning}
        onAnalyzeRapidLosses={onAnalyzeRapidLosses}
        onDrillStatusChange={onDrillStatusChange}
        onStopAnalysis={onStopAnalysis}
        report={report}
        selectedDrillId={selectedDrillId}
      />
    </section>
  );
}

function weekKeyForDate(date: string): string {
  const parsedDate = new Date(`${date}T12:00:00`);
  const day = parsedDate.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  parsedDate.setDate(parsedDate.getDate() + mondayOffset);
  const year = parsedDate.getFullYear();
  const month = `${parsedDate.getMonth() + 1}`.padStart(2, "0");
  const dayOfMonth = `${parsedDate.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${dayOfMonth}`;
}

function weeklyMainTakeaway(report: WeeklyReport, selectedTimeClass: ChessComTrackedTimeClass): string {
  const summary = report.timeClassSummaries[selectedTimeClass];
  if (summary.gamesPlayed === 0) {
    return `No ${selectedTimeClass} games were loaded for this week.`;
  }

  const movement = summary.netChange ?? 0;
  if (report.topCriticalMoves[0]) {
    return `${timeControlLabel(selectedTimeClass)} moved ${formatNetChange(summary.netChange)}. The review priority is move ${report.topCriticalMoves[0].moveNumber}: ${explainCriticalMove(report.topCriticalMoves[0])}`;
  }

  if (movement > 0) {
    return `${timeControlLabel(selectedTimeClass)} gained rating this week. Analyze one day to turn the result into specific practice.`;
  }

  if (movement < 0) {
    return `${timeControlLabel(selectedTimeClass)} lost rating this week. Start by analyzing the largest down day.`;
  }

  return `${timeControlLabel(selectedTimeClass)} rating was steady. Analyze a day to find one concrete practice target.`;
}

function weeklyHomeworkPlan(report: WeeklyReport): string {
  if (report.homeworkPuzzles.length > 0) {
    const firstPuzzle = report.homeworkPuzzles[0];
    return `Solve ${report.homeworkPuzzles.length} saved puzzle(s), starting with ${sideLabel(firstPuzzle.sideToMove)} to move from the biggest reviewed mistake.`;
  }

  if (report.analysisCoverage.analyzedDayCount === 0) {
    return "Analyze one selected day, then solve the first generated homework puzzle.";
  }

  return "Review the saved critical move cards and re-run a missing day if you want more puzzle candidates.";
}

function WeeklyReportPanel({
  analysisSettings,
  onAnalysisReport,
  onCoverageChange,
  onSelectDay,
  playerLevel,
  report,
  selectedTimeClass,
  selectedWeek,
  setSelectedWeek,
  showEngineDetails,
  username,
  weeks,
}: {
  analysisSettings: SelectedDayAnalysisSettings;
  onAnalysisReport: (report: DailyEngineAnalysisReport | null) => void;
  onCoverageChange: () => void;
  onSelectDay: (date: string) => void;
  playerLevel: PlayerLevel;
  report: WeeklyReport;
  selectedTimeClass: ChessComTrackedTimeClass;
  selectedWeek: string;
  setSelectedWeek: (week: string) => void;
  showEngineDetails: boolean;
  username: string;
  weeks: string[];
}) {
  const engineRef = useRef<ChessStockfishEngine | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [queuedDate, setQueuedDate] = useState<string | null>(null);
  const [queueProgress, setQueueProgress] = useState<SelectedDayAnalysisProgress | null>(null);
  const [queueRunning, setQueueRunning] = useState(false);
  const nextMissingStatus =
    report.analysisCoverage.days.find((status) => status.status === "not_analyzed") ??
    report.analysisCoverage.days.find((status) => status.status === "failed") ??
    null;
  const selectedSummary = report.timeClassSummaries[selectedTimeClass];
  const biggestMistake = report.topCriticalMoves[0] ?? null;

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      engineRef.current?.dispose();
    };
  }, []);

  async function copyMarkdown() {
    setCopyStatus(null);
    try {
      await navigator.clipboard.writeText(formatWeeklyReportMarkdown(report));
      setCopyStatus("Copied weekly report Markdown.");
    } catch {
      setCopyStatus("Could not copy Markdown in this browser.");
    }
  }

  async function analyzeCoverageDay(date: string) {
    if (!username) {
      setQueueError("Load a Chess.com username before running weekly analysis.");
      return;
    }

    const day = report.days.find((candidate) => candidate.date === date);
    if (!day) {
      setQueueError("That day is not in the selected week.");
      return;
    }

    if (day.games.length === 0) {
      setQueueError("That day has no games for the selected time control.");
      return;
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    engineRef.current?.dispose();
    engineRef.current = createStockfishEngine();
    setQueueError(null);
    setQueuedDate(date);
    setQueueRunning(true);
    setQueueProgress({ current: 0, message: `Preparing ${formatDateLabel(date)}.`, total: 0 });

    try {
      const dayReport = await analyzeSelectedDayGames({
        date,
        engine: engineRef.current,
        games: day.games,
        onProgress: setQueueProgress,
        settings: analysisSettings,
        signal: abortController.signal,
        username,
      });
      if (abortController.signal.aborted) {
        writeFailedDailyAnalysisStatus({
          date,
          games: day.games,
          reason: "Analysis stopped.",
          settings: analysisSettings,
          username,
        });
        onCoverageChange();
        return;
      }
      onAnalysisReport(dayReport);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Engine analysis unavailable in this browser/build.";
      writeFailedDailyAnalysisStatus({
        date,
        games: day.games,
        reason,
        settings: analysisSettings,
        username,
      });
      setQueueError(reason);
      onCoverageChange();
    } finally {
      setQueueRunning(false);
    }
  }

  function stopQueuedAnalysis() {
    abortControllerRef.current?.abort();
    engineRef.current?.stop();
    setQueueRunning(false);
    setQueueProgress((currentProgress) => ({
      current: currentProgress?.current ?? 0,
      message: "Analysis stopped.",
      total: currentProgress?.total ?? 0,
    }));
  }

  const progressValue =
    queueProgress && queueProgress.total > 0
      ? `${Math.min(queueProgress.current + 1, queueProgress.total)} / ${queueProgress.total}`
      : null;

  return (
    <section className="weekly-report-panel" aria-label="Weekly Report">
      <div className="weekly-report-header">
        <div>
          <p className="eyebrow">{playerLevel === "beginner" ? "Weekly Plan" : "Weekly Report"}</p>
          <h2>{timeControlLabel(selectedTimeClass)} · {getWeekLabel(report.weekKey)}</h2>
          <p className="helper-text">{weeklyMainTakeaway(report, selectedTimeClass)}</p>
        </div>
        <label className="field weekly-selector">
          <span>Week</span>
          <select value={selectedWeek} onChange={(event) => setSelectedWeek(event.target.value)}>
            {weeks.map((week) => (
              <option key={week} value={week}>
                {getWeekLabel(week)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="weekly-insight-grid">
        <article>
          <p className="eyebrow">Main takeaway</p>
          <strong>{weeklyMainTakeaway(report, selectedTimeClass)}</strong>
        </article>
        <article>
          <p className="eyebrow">Rating movement</p>
          <strong className={`rating-delta ${ratingDeltaClass(selectedSummary.netChange)}`}>
            {formatNetChange(selectedSummary.netChange)}
          </strong>
          <span>{selectedSummary.gamesPlayed} game(s), {selectedSummary.wins}-{selectedSummary.losses}-{selectedSummary.draws}</span>
        </article>
        <article>
          <p className="eyebrow">Biggest reviewed mistake</p>
          {biggestMistake ? (
            <>
              <strong>Move {biggestMistake.moveNumber}: {biggestMistake.playedMove}</strong>
              <span>{explainCriticalMove(biggestMistake)}</span>
            </>
          ) : (
            <span>Analyze a selected day to identify the biggest mistake.</span>
          )}
        </article>
        <article>
          <p className="eyebrow">Homework plan</p>
          <strong>{weeklyHomeworkPlan(report)}</strong>
        </article>
      </div>
      <div className="weekly-summary-grid">
        <WeeklyTimeClassCard summary={selectedSummary} />
        <article className="weekly-summary-card">
          <h3>Best day</h3>
          <strong>{report.bestDay ? formatDateLabel(report.bestDay.date) : "n/a"}</strong>
          <p className={`rating-delta ${ratingDeltaClass(report.bestDay?.netChange ?? null)}`}>{report.bestDay ? formatNetChange(report.bestDay.netChange) : "No rating movement found."}</p>
        </article>
        <article className="weekly-summary-card">
          <h3>Worst day</h3>
          <strong>{report.worstDay ? formatDateLabel(report.worstDay.date) : "n/a"}</strong>
          <p className={`rating-delta ${ratingDeltaClass(report.worstDay?.netChange ?? null)}`}>{report.worstDay ? formatNetChange(report.worstDay.netChange) : "No rating movement found."}</p>
        </article>
      </div>
      <div className="weekly-coverage-row secondary-detail">
        <span>Fetched game/rating data: {report.days.length} active day(s)</span>
        <span>
          Engine coverage: {report.analysisCoverage.analyzedDayCount}/{report.analysisCoverage.totalDayCount} day(s)
        </span>
        <span>Stockfish-analyzed games: {report.engineAnalyzedGameCount}</span>
        <span>{weeklyCoverageCopy(report)}</span>
        {(showEngineDetails || playerLevel === "advanced") ? (
          <span>Saved-run lookup: {formatAnalysisSettingsSummary(analysisSettings)}</span>
        ) : null}
      </div>
      <section className="weekly-analysis-queue" aria-label="Weekly analysis coverage">
        <div className="card-topline">
          <div>
            <h3>Analysis coverage</h3>
            <p className="helper-text">
              {weeklySavedAnalysisNote(analysisSettings)} Missing means there is no matching all-day run for this week view; it does not remove any saved single-game or differently configured review.
            </p>
          </div>
          <div className="weekly-queue-actions">
            <button
              className="secondary-button primary-action"
              disabled={queueRunning || !nextMissingStatus}
              onClick={() => nextMissingStatus && analyzeCoverageDay(nextMissingStatus.date)}
              type="button"
            >
              Analyze next missing day
            </button>
            <button className="secondary-button" disabled={!queueRunning} onClick={stopQueuedAnalysis} type="button">
              Stop
            </button>
          </div>
        </div>
        {queueProgress ? (
          <p className="helper-text" role="status">
            {queuedDate ? `${formatDateLabel(queuedDate)}: ` : ""}
            {queueProgress.message}
            {progressValue ? ` ${progressValue}` : ""}
          </p>
        ) : null}
        {queueError ? <p className="error-text">Engine analysis unavailable in this browser/build. {queueError}</p> : null}
        <div className="weekly-analysis-status-list">
          {report.analysisCoverage.days.map((status) => {
            const statusClass = analysisStatusClass(status.status);
            const isQueued = queueRunning && queuedDate === status.date;
            const canAnalyze = status.status !== "skipped_no_games";
            const actionLabel =
              status.status === "failed"
                ? "Retry"
                : status.status === "cached_complete" || status.status === "cached_partial"
                  ? "Reanalyze"
                  : "Analyze";

            return (
              <article className="weekly-analysis-status-row" key={status.date}>
                <div>
                  <strong>{formatDateLabel(status.date)}</strong>
                  <span>
                    {status.gameCount} game(s), {status.analyzedMoveCount} analyzed move(s),{" "}
                    {status.criticalMoveCount} critical
                  </span>
                  <small>
                    {status.reason ??
                      (status.status === "not_analyzed"
                        ? "No matching all-day saved run for the current time control and settings."
                        : status.status === "cached_complete" || status.status === "cached_partial"
                          ? "This saved selected-day run counts toward weekly coverage."
                          : "")}
                  </small>
                </div>
                <span className={`analysis-status-chip status-${statusClass}`}>
                  {isQueued ? "In progress" : analysisStatusLabel(status.status)}
                </span>
                <div className="weekly-status-actions">
                  <button className="secondary-button" onClick={() => onSelectDay(status.date)} type="button">
                    Open day
                  </button>
                  <button
                    className="secondary-button"
                    disabled={queueRunning || !canAnalyze}
                    onClick={() => analyzeCoverageDay(status.date)}
                    type="button"
                  >
                    {actionLabel}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>
      <div className="weekly-report-columns">
        <section className="analysis-placeholder-panel">
          <h3>Coaching motifs from saved analysis</h3>
          {report.themeCounts.length > 0 ? (
            <ul className="skipped-game-list">
              {report.themeCounts.map((theme) => (
                <li key={theme.label}>{theme.label}: {theme.count}</li>
              ))}
            </ul>
          ) : (
            <p className="helper-text">Uncategorized critical move. Analyze days first for basic labels.</p>
          )}
        </section>
        <section className="analysis-placeholder-panel">
          <h3>{playerLevel === "beginner" ? "Top weekly mistakes" : "Top weekly critical moments"}</h3>
          <CriticalMovePager
            analysisSettings={analysisSettings}
            moves={report.topCriticalMoves}
            playerLevel={playerLevel}
            showEngineDetails={showEngineDetails}
          />
        </section>
        <section className="analysis-placeholder-panel">
          <h3>Weekly homework</h3>
          <HomeworkPuzzlePager
            analysisSettings={analysisSettings}
            playerLevel={playerLevel}
            puzzles={report.homeworkPuzzles}
            showEngineDetails={showEngineDetails}
          />
        </section>
      </div>
      <div className="chess-analysis-actions">
        <button className="secondary-button" onClick={copyMarkdown} type="button">
          Copy Markdown report
        </button>
        {copyStatus ? <span className="helper-text">{copyStatus}</span> : null}
      </div>
    </section>
  );
}

function CoachStatusRow({
  activeDay,
  fallbackGameCount,
  relatedStatuses,
  savedStatus,
  selectedTimeClass,
  username,
}: {
  activeDay: DailyChessSummary | null;
  fallbackGameCount: number;
  relatedStatuses: DailyAnalysisStatus[];
  savedStatus: DailyAnalysisStatus | null;
  selectedTimeClass: ChessComTrackedTimeClass;
  username: string;
}) {
  return (
    <div className="coach-status-row" aria-label="Current chess review status">
      <span>
        <strong>User</strong>
        {username || "not loaded"}
      </span>
      <span>
        <strong>Time</strong>
        {timeControlLabel(selectedTimeClass)}
      </span>
      <span>
        <strong>Date</strong>
        {activeDay ? formatDateLabel(activeDay.date) : "no active day"}
      </span>
      <span>
        <strong>Scope</strong>
        {formatGameScope(savedStatus, fallbackGameCount)}
      </span>
      <span className={savedStatus ? `status-${analysisStatusClass(savedStatus.status)}` : ""}>
        <strong>Saved</strong>
        {savedRunStatusCopy(savedStatus, relatedStatuses)}
      </span>
    </div>
  );
}

function CoachNextStepPanel({
  activeDay,
  onViewChange,
  playerLevel,
  reviewReport,
  savedStatus,
  selectedTimeClass,
  weeklyReport,
}: {
  activeDay: DailyChessSummary | null;
  onViewChange: (view: AnalysisView) => void;
  playerLevel: PlayerLevel;
  reviewReport: DailyEngineAnalysisReport | null;
  savedStatus: DailyAnalysisStatus | null;
  selectedTimeClass: ChessComTrackedTimeClass;
  weeklyReport: WeeklyReport | null;
}) {
  const selectedSummary = activeDay?.byTimeClass[selectedTimeClass] ?? null;
  const ratingMove = selectedSummary ? formatNetChange(selectedSummary.netChange) : "n/a";
  const hasSavedReview = Boolean(reviewReport || savedStatus?.status === "cached_complete" || savedStatus?.status === "cached_partial");
  const primaryView: AnalysisView =
    playerLevel === "advanced"
      ? "analysis"
      : playerLevel === "beginner" && hasSavedReview
        ? "critical"
        : "analysis";
  const primaryLabel =
    playerLevel === "beginner"
      ? hasSavedReview
        ? "Review biggest mistake"
        : "Review selected day"
      : playerLevel === "advanced"
        ? "Open analysis controls"
        : hasSavedReview
          ? "Continue review"
          : "Review selected day";

  let body = "Load games, choose a time control, then review one day.";
  if (!activeDay) {
    body = `No ${selectedTimeClass} day is selected. Try another time control or load more archives.`;
  } else if (playerLevel === "beginner") {
    body = hasSavedReview
      ? `Start simple: ${timeControlLabel(selectedTimeClass)} moved ${ratingMove}, then review the biggest mistake and solve one practice position.`
      : `Start simple: check the ${ratingMove} rating move for this day, run review, then solve one practice position.`;
  } else if (playerLevel === "intermediate") {
    body = hasSavedReview
      ? "Use the selected day first, then work through critical moves, homework, and the weekly plan."
      : "Review the selected day first so critical moves, homework, and weekly coverage have matching data.";
  } else {
    body = "Use the analysis path for replay, saved-run matching, and expert settings. Engine controls stay visible in this mode.";
  }

  const weeklyCoverage =
    weeklyReport && weeklyReport.analysisCoverage.totalDayCount > 0
      ? `${weeklyReport.analysisCoverage.analyzedDayCount}/${weeklyReport.analysisCoverage.totalDayCount} weekly day(s) covered`
      : "No weekly coverage yet";

  return (
    <section className={`coach-next-step-panel level-${playerLevel}`} aria-label="Coach next step">
      <div>
        <p className="eyebrow">Next step</p>
        <h3>{primaryLabel}</h3>
        <p className="helper-text">{body}</p>
      </div>
      <div className="coach-next-step-actions">
        <button className="secondary-button primary-action" disabled={!activeDay} onClick={() => onViewChange(primaryView)} type="button">
          {primaryLabel}
        </button>
        {playerLevel === "beginner" ? (
          <button className="secondary-button" disabled={!hasSavedReview} onClick={() => onViewChange("homework")} type="button">
            Practice one position
          </button>
        ) : null}
        {playerLevel === "intermediate" ? (
          <button className="secondary-button" onClick={() => onViewChange("weekly")} type="button">
            Open weekly plan
          </button>
        ) : null}
        {playerLevel === "advanced" ? (
          <>
            <button className="secondary-button" onClick={() => onViewChange("critical")} type="button">
              Critical moves
            </button>
            <button className="secondary-button" onClick={() => onViewChange("weekly")} type="button">
              Settings coverage
            </button>
          </>
        ) : null}
      </div>
      <div className="coach-next-step-meta">
        <span>{weeklyCoverage}</span>
        <span>{savedStatus ? analysisStatusLabel(savedStatus.status) : "No saved-run check yet"}</span>
      </div>
    </section>
  );
}

function SelectedDayReview({
  analysisSettings,
  analysisReport,
  day,
  days,
  onAnalysisSettingsChange,
  onAnalysisReport,
  onAnalysisStatusChange,
  onDateChange,
  onIndividualGameSelect,
  onUseAnalysisInWeeklyReport,
  onViewChange,
  playerLevel,
  showEngineDetails,
  username,
}: {
  analysisSettings: SelectedDayAnalysisSettings;
  analysisReport: DailyEngineAnalysisReport | null;
  day: DailyChessSummary;
  days: DailyChessSummary[];
  onAnalysisSettingsChange: (settings: SelectedDayAnalysisSettings) => void;
  onAnalysisReport: (report: DailyEngineAnalysisReport | null) => void;
  onAnalysisStatusChange: () => void;
  onDateChange: (date: string) => void;
  onIndividualGameSelect: (gameUrl: string) => void;
  onUseAnalysisInWeeklyReport: (report: DailyEngineAnalysisReport, date: string) => void;
  onViewChange: (view: AnalysisView) => void;
  playerLevel: PlayerLevel;
  showEngineDetails: boolean;
  username: string;
}) {
  const engineRef = useRef<ChessStockfishEngine | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [selectedGameUrl, setSelectedGameUrl] = useState("all");
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analysisRunning, setAnalysisRunning] = useState(false);
  const [progress, setProgress] = useState<SelectedDayAnalysisProgress | null>(null);
  const selectedGames = selectedGameUrl === "all" ? day.games : day.games.filter((game) => game.gameUrl === selectedGameUrl);
  const selectedSingleGame = selectedGameUrl === "all" ? null : day.games.find((game) => game.gameUrl === selectedGameUrl) ?? null;
  const selectedScopeCacheKey = useMemo(
    () =>
      username
        ? buildDayAnalysisCacheKey({
            date: day.date,
            games: selectedGames,
            settings: analysisSettings,
            username,
          })
        : null,
    [analysisSettings, day.date, selectedGames, username],
  );
  const selectedScopeStatus = useMemo(
    () =>
      username
        ? summarizeCachedAnalysisStatus({
            date: day.date,
            games: selectedGames,
            settings: analysisSettings,
            username,
          })
        : null,
    [analysisReport, analysisSettings, day.date, selectedGames, username],
  );
  const scopedAnalysisReport =
    analysisReport && selectedScopeCacheKey && analysisReport.cacheKey === selectedScopeCacheKey ? analysisReport : null;
  const relatedScopeStatuses = useMemo(
    () =>
      username
        ? readRelatedDailyAnalysisStatuses({ date: day.date, username }).filter(
            (status) => status.cacheKey !== selectedScopeStatus?.cacheKey,
          )
        : [],
    [analysisReport, day.date, selectedScopeStatus?.cacheKey, username],
  );

  useEffect(() => {
    setSelectedGameUrl("all");
    setAnalysisError(null);
    setProgress(null);
    abortControllerRef.current?.abort();
    engineRef.current?.stop();
    setAnalysisRunning(false);
    onAnalysisReport(null);
  }, [analysisSettings.depth, analysisSettings.maxGames, analysisSettings.maxMoves, analysisSettings.moveTimeMs, day.date, onAnalysisReport]);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      engineRef.current?.dispose();
    };
  }, []);

  async function analyzeDay() {
    if (!username) {
      setAnalysisError("Load a Chess.com username before running engine analysis.");
      return;
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    engineRef.current?.dispose();
    engineRef.current = createStockfishEngine();
    setAnalysisError(null);
    setAnalysisRunning(true);
    setProgress({ current: 0, message: "Preparing selected-day analysis.", total: 0 });

    try {
      const report = await analyzeSelectedDayGames({
        date: day.date,
        engine: engineRef.current,
        games: selectedGames,
        onProgress: setProgress,
        settings: analysisSettings,
        signal: abortController.signal,
        username,
      });
      if (abortController.signal.aborted) {
        writeFailedDailyAnalysisStatus({
          date: day.date,
          games: selectedGames,
          reason: "Analysis stopped.",
          settings: analysisSettings,
          username,
        });
        onAnalysisStatusChange();
        return;
      }
      onAnalysisReport(report);
    } catch (error) {
      const reason =
        error instanceof Error
          ? error.message
          : "Engine analysis unavailable in this browser/build.";
      writeFailedDailyAnalysisStatus({
        date: day.date,
        games: selectedGames,
        reason,
        settings: analysisSettings,
        username,
      });
      onAnalysisStatusChange();
      setAnalysisError(
        reason,
      );
    } finally {
      setAnalysisRunning(false);
    }
  }

  function stopAnalysis() {
    abortControllerRef.current?.abort();
    engineRef.current?.stop();
    setAnalysisRunning(false);
    setProgress((currentProgress) => ({
      current: currentProgress?.current ?? 0,
      message: "Analysis stopped.",
      total: currentProgress?.total ?? 0,
    }));
  }

  const progressValue =
    progress && progress.total > 0 ? `${Math.min(progress.current + 1, progress.total)} / ${progress.total}` : null;
  const gameStatuses = new Map((scopedAnalysisReport?.gameStatuses ?? []).map((status) => [status.gameUrl, status]));
  const canUseInWeeklyReport = Boolean(scopedAnalysisReport) && selectedGameUrl === "all";

  function updateAnalysisSetting(key: keyof SelectedDayAnalysisSettings, value: number) {
    onAnalysisSettingsChange({
      ...analysisSettings,
      [key]: clampAnalysisSetting(key, value),
    });
  }

  return (
    <section className="chess-daily-review" aria-label="Analysis">
      <div>
        <p className="eyebrow">{playerLevel === "beginner" ? "Coach Review" : "Analysis"}</p>
        <h2>{formatDateLabel(day.date)}</h2>
        <p className="helper-text">
          {playerLevel === "beginner"
            ? "Start with the rating move, review the biggest mistake, then solve one practice position."
            : "Follow the review path from rating swing to mistakes to practice. Stockfish only runs when you ask for selected-day analysis."}
        </p>
        <CoachStatusRow
          activeDay={day}
          fallbackGameCount={selectedGames.length}
          relatedStatuses={relatedScopeStatuses}
          savedStatus={selectedScopeStatus}
          selectedTimeClass={day.games[0]?.timeClass ?? "blitz"}
          username={username}
        />
        <div className="coach-flow-grid" aria-label="Guided review flow">
          <article>
            <span>1</span>
            <strong>Rating movement</strong>
            <p className={`rating-delta ${ratingDeltaClass(dailyNetChange(day))}`}>
              {formatNetChange(dailyNetChange(day))} on {formatDateLabel(day.date)}
            </p>
          </article>
          <article>
            <span>2</span>
            <strong>{playerLevel === "beginner" ? "Mistakes" : "Critical moves"}</strong>
            <p>{scopedAnalysisReport ? `${scopedAnalysisReport.criticalMoves.length} review card(s) found` : "Run review to find the biggest swings."}</p>
          </article>
          <article>
            <span>3</span>
            <strong>Practice</strong>
            <p>{scopedAnalysisReport ? `${scopedAnalysisReport.homeworkPuzzles.length} puzzle(s) ready` : "Homework appears after review."}</p>
          </article>
        </div>
        <div className="analysis-context-grid">
          <label className="field">
            <span>Date</span>
            <select value={day.date} onChange={(event) => onDateChange(event.target.value)} disabled={analysisRunning}>
              {days.map((summary) => (
                <option key={summary.date} value={summary.date}>
                  {formatDateLabel(summary.date)} · {summary.games.length} game(s)
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Game scope</span>
            <select
              value={selectedGameUrl}
              onChange={(event) => {
                setSelectedGameUrl(event.target.value);
                if (event.target.value !== "all") {
                  onIndividualGameSelect(event.target.value);
                }
              }}
              disabled={analysisRunning}
            >
              <option value="all">Selected date: {day.games.length} game(s)</option>
              {day.games.map((game) => (
                <option key={game.gameUrl} value={game.gameUrl}>
                  {formatGameTime(game.endTimestamp)} · {resultLabel(game)} vs {game.opponentUsername}
                </option>
              ))}
            </select>
          </label>
          <div className="analysis-context-card">
            <strong>{selectedGameUrl === "all" ? `${day.games.length} game(s) selected` : "1 game selected"}</strong>
            <span>
              {selectedGameUrl === "all"
                ? "All-day review can count toward weekly coverage when settings match."
                : "Single-game review is saved separately and is not counted as weekly day coverage."}
            </span>
          </div>
        </div>
        {playerLevel === "beginner" && showEngineDetails ? (
          <details className="analysis-settings-drawer">
            <summary>Engine details</summary>
            <p className="helper-text">{selectedDaySavedAnalysisNote(analysisSettings)}</p>
            <EngineSettingsControls
              analysisRunning={analysisRunning}
              analysisSettings={analysisSettings}
              onSettingChange={updateAnalysisSetting}
            />
          </details>
        ) : null}
        {playerLevel === "intermediate" ? (
          <details className="analysis-settings-drawer">
            <summary>Analysis settings</summary>
            <p className="helper-text">{selectedDaySavedAnalysisNote(analysisSettings)}</p>
            <EngineSettingsControls
              analysisRunning={analysisRunning}
              analysisSettings={analysisSettings}
              onSettingChange={updateAnalysisSetting}
            />
          </details>
        ) : null}
        {playerLevel === "advanced" ? (
          <details className="analysis-settings-drawer expert" open>
            <summary>Expert engine drawer</summary>
            <p className="helper-text">
              Browser Stockfish settings: {formatAnalysisSettingsSummary(analysisSettings)}. {selectedDaySavedAnalysisNote(analysisSettings)}
            </p>
            <EngineSettingsControls
              analysisRunning={analysisRunning}
              analysisSettings={analysisSettings}
              onSettingChange={updateAnalysisSetting}
            />
          </details>
        ) : null}
        <div className="chess-analysis-actions">
          <button className="secondary-button primary-action" disabled={analysisRunning} onClick={analyzeDay} type="button">
            {playerLevel === "beginner" ? "Review selected day" : "Analyze selected day"}
          </button>
          <button className="secondary-button" disabled={!analysisRunning} onClick={stopAnalysis} type="button">
            Stop
          </button>
          {scopedAnalysisReport && (showEngineDetails || playerLevel === "advanced") ? (
            <span className="status-tag">
              Saved run: d{scopedAnalysisReport.settings.depth} / {scopedAnalysisReport.settings.moveTimeMs}ms
            </span>
          ) : null}
          {playerLevel === "advanced" && selectedSingleGame ? (
            <CopyTextButton label="Copy PGN" text={selectedSingleGame.pgn} />
          ) : null}
        </div>
        {progress ? (
          <p className="helper-text" role="status">
            {progress.message}
            {progressValue ? ` ${progressValue}` : ""}
          </p>
        ) : null}
        {analysisError ? <p className="error-text">Engine analysis unavailable in this browser/build. {analysisError}</p> : null}
        {scopedAnalysisReport?.incomplete ? (
          <p className="error-text">Analysis is incomplete. Some PGNs or positions were skipped.</p>
        ) : null}
      </div>
      <div className="analysis-results-grid">
        <section>
          <h3>Games for {formatDateLabel(day.date)}</h3>
          <div className="chess-game-list">
            {day.games.map((game) => (
              <button
                aria-pressed={selectedGameUrl === game.gameUrl}
                className={`chess-game-row ${selectedGameUrl === game.gameUrl ? "selected" : ""}`}
                key={game.gameUrl}
                onClick={() => {
                  setSelectedGameUrl(game.gameUrl);
                  onIndividualGameSelect(game.gameUrl);
                }}
                type="button"
              >
                <span>
                  <strong>{formatGameTime(game.endTimestamp)}</strong>
                  {game.timeClass} as {game.playerColor}
                </span>
                <span>
                  {resultLabel(game)} vs {game.opponentUsername}
                  {game.opponentRating ? ` (${game.opponentRating})` : ""}
                </span>
                <span>
                  {formatRating(game.playerRatingAfterGame)}
                </span>
                {(showEngineDetails || playerLevel === "advanced") && gameStatuses.has(game.gameUrl) ? (
                  <span className={`game-analysis-status status-${gameStatuses.get(game.gameUrl)?.status}`}>
                    {gameStatuses.get(game.gameUrl)?.status}: {gameStatuses.get(game.gameUrl)?.analyzedMoveCount}/
                    {gameStatuses.get(game.gameUrl)?.candidateMoveCount} moves
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        </section>
        <section className="analysis-placeholder-panel">
          <h3>{playerLevel === "beginner" ? "Coach summary" : "Run summary"}</h3>
          <p>
            {scopedAnalysisReport
              ? `Reviewed ${scopedAnalysisReport.analyzedGameUrls.length} game(s). Start with ${scopedAnalysisReport.criticalMoves.length} ${playerLevel === "beginner" ? "mistake" : "critical move"} card(s), then solve ${scopedAnalysisReport.homeworkPuzzles.length} homework puzzle(s).`
              : playerLevel === "beginner"
                ? `${savedRunStatusCopy(selectedScopeStatus, relatedScopeStatuses)} Run review for this day to get mistake cards and practice positions.`
                : savedRunStatusCopy(selectedScopeStatus, relatedScopeStatuses)}
          </p>
          {scopedAnalysisReport ? (
            <>
              <div className="review-next-actions">
                <button className="secondary-button" onClick={() => onViewChange("critical")} type="button">
                  Review {playerLevel === "beginner" ? "mistakes" : "critical moves"}
                </button>
                <button className="secondary-button" onClick={() => onViewChange("homework")} type="button">
                  Open homework
                </button>
                <button
                  className="secondary-button primary-action"
                  disabled={!canUseInWeeklyReport}
                  onClick={() => scopedAnalysisReport && onUseAnalysisInWeeklyReport(scopedAnalysisReport, day.date)}
                  type="button"
                >
                  Use this analyzed day in Weekly Report
                </button>
              </div>
              <p className="helper-text">
                {canUseInWeeklyReport
                  ? "This opens Weekly Report with this saved run's settings so the weekly motifs, biggest mistake, and homework plan can include this day."
                  : "Weekly Report uses selected-date reviews. Single-game reviews stay available here, but they do not stand in for the full day."}
              </p>
            </>
          ) : null}
          {(showEngineDetails || playerLevel === "advanced") && scopedAnalysisReport?.gameStatuses?.length ? (
            <ul className="game-status-list">
              {scopedAnalysisReport.gameStatuses.map((status) => (
                <li key={status.gameUrl}>
                  <strong>{status.status}</strong>: {status.analyzedMoveCount}/{status.candidateMoveCount} moves,{" "}
                  {status.criticalMoveCount} critical
                  {status.reason ? ` - ${status.reason}` : ""}
                </li>
              ))}
            </ul>
          ) : null}
          {(showEngineDetails || playerLevel === "advanced") && scopedAnalysisReport?.skippedGames.length ? (
            <ul className="skipped-game-list">
              {scopedAnalysisReport.skippedGames.slice(0, 4).map((game, index) => (
                <li key={`${game.gameUrl}-${index}`}>{game.reason}</li>
              ))}
            </ul>
          ) : null}
        </section>
      </div>
    </section>
  );
}

export function ChessComAnalysisPanel() {
  const [username, setUsername] = useState(() => readConfiguredChessComUsername() || readLastChessComUsername());
  const [monthCount, setMonthCount] = useState(3);
  const [ratedOnly, setRatedOnly] = useState(true);
  const [games, setGames] = useState<NormalizedChessGame[]>([]);
  const [personalGames, setPersonalGames] = useState<PersonalChessGame[]>([]);
  const [personalMistakes, setPersonalMistakes] = useState<PersonalChessMistake[]>([]);
  const [personalDrillReviews, setPersonalDrillReviews] = useState<Record<string, PersonalDrillReview>>(() =>
    readPersonalDrillReviews(),
  );
  const [selectedPersonalDrillId, setSelectedPersonalDrillId] = useState<string | null>(null);
  const [personalSyncMeta, setPersonalSyncMeta] = useState<PersonalChessSyncMeta | null>(() => readPersonalChessSyncMeta());
  const [personalImportResult, setPersonalImportResult] = useState<PersonalChessImportResult | null>(null);
  const [personalSyncProgress, setPersonalSyncProgress] = useState<PersonalChessSyncProgress | null>(null);
  const [personalSyncLoading, setPersonalSyncLoading] = useState(false);
  const [personalSyncError, setPersonalSyncError] = useState<string | null>(null);
  const [personalAnalysisProgress, setPersonalAnalysisProgress] = useState<SelectedDayAnalysisProgress | null>(null);
  const [personalAnalysisRunning, setPersonalAnalysisRunning] = useState(false);
  const [personalAnalysisError, setPersonalAnalysisError] = useState<string | null>(null);
  const [selectedTimeClass, setSelectedTimeClass] = useState<ChessComTrackedTimeClass>("blitz");
  const [playerLevel, setPlayerLevel] = useState<PlayerLevel>("intermediate");
  const [showEngineDetails, setShowEngineDetails] = useState(false);
  const [archiveCount, setArchiveCount] = useState(0);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadedUsername, setLoadedUsername] = useState("");
  const [selectedWeek, setSelectedWeek] = useState<string | null>(null);
  const [analysisRevision, setAnalysisRevision] = useState(0);
  const [analysisSettings, setAnalysisSettings] = useState<SelectedDayAnalysisSettings>(defaultSelectedDayAnalysisSettings);
  const [activeView, setActiveView] = useState<AnalysisView>("personal");
  const [selectedAnalysisReport, setSelectedAnalysisReport] = useState<DailyEngineAnalysisReport | null>(null);
  const [selectedIndividualGameUrl, setSelectedIndividualGameUrl] = useState<string | null>(null);
  const personalEngineRef = useRef<ChessStockfishEngine | null>(null);
  const personalAbortControllerRef = useRef<AbortController | null>(null);

  const filteredGames = useMemo(
    () => games.filter((game) => game.timeClass === selectedTimeClass),
    [games, selectedTimeClass],
  );
  const summaries = useMemo(() => summarizeDailyChessGames(filteredGames), [filteredGames]);
  const selectedDay = summaries.find((summary) => summary.date === selectedDate) ?? summaries[0] ?? null;
  const availableWeeks = useMemo(() => getAvailableWeeks(summaries), [summaries]);
  const availableCounts = useMemo(
    () =>
      timeClasses.reduce(
        (counts, timeClass) => ({
          ...counts,
          [timeClass]: games.filter((game) => game.timeClass === timeClass).length,
        }),
        {} as Record<ChessComTrackedTimeClass, number>,
      ),
    [games],
  );
  const weeklyReport = useMemo(() => {
    if (!loadedUsername || !selectedWeek) {
      return null;
    }

    return buildWeeklyReport({
      days: summaries,
      settings: analysisSettings,
      username: loadedUsername,
      weekKey: selectedWeek,
    });
  }, [analysisRevision, analysisSettings, loadedUsername, selectedWeek, summaries]);
  const selectedDaySavedStatus = useMemo(() => {
    if (!loadedUsername || !selectedDay) {
      return null;
    }

    return summarizeCachedAnalysisStatus({
      date: selectedDay.date,
      games: selectedDay.games,
      settings: analysisSettings,
      username: loadedUsername,
    });
  }, [analysisRevision, analysisSettings, loadedUsername, selectedDay]);
  const relatedSelectedDayStatuses = useMemo(() => {
    if (!loadedUsername || !selectedDay) {
      return [];
    }

    return readRelatedDailyAnalysisStatuses({ date: selectedDay.date, username: loadedUsername }).filter(
      (status) => status.cacheKey !== selectedDaySavedStatus?.cacheKey,
    );
  }, [analysisRevision, loadedUsername, selectedDay, selectedDaySavedStatus?.cacheKey]);
  const cachedSelectedDayReport = useMemo(() => {
    if (!loadedUsername || !selectedDay) {
      return null;
    }

    return readCachedDailyAnalysis(
      buildDayAnalysisCacheKey({
        date: selectedDay.date,
        games: selectedDay.games,
        settings: analysisSettings,
        username: loadedUsername,
      }),
    );
  }, [analysisRevision, analysisSettings, loadedUsername, selectedDay]);
  const activeReviewReport = selectedAnalysisReport ?? cachedSelectedDayReport;
  const personalReport = useMemo(
    () =>
      buildPersonalChessReport({
        drillReviews: personalDrillReviews,
        games: personalGames,
        mistakes: personalMistakes,
      }),
    [personalDrillReviews, personalGames, personalMistakes],
  );
  const bumpAnalysisRevision = useCallback(() => {
    setAnalysisRevision((revision) => revision + 1);
  }, []);

  const handleAnalysisReport = useCallback((report: DailyEngineAnalysisReport | null) => {
    setSelectedAnalysisReport(report);
    if (report) {
      setAnalysisRevision((revision) => revision + 1);
    }
  }, []);

  const handleUseAnalysisInWeeklyReport = useCallback(
    (report: DailyEngineAnalysisReport, date: string) => {
      setAnalysisSettings((currentSettings) =>
        analysisSettingsEqual(currentSettings, report.settings) ? currentSettings : report.settings,
      );
      setSelectedWeek(weekKeyForDate(date));
      setAnalysisRevision((revision) => revision + 1);
      setActiveView("weekly");
    },
    [],
  );

  const refreshPersonalData = useCallback(async () => {
    const [storedGames, storedMistakes] = await Promise.all([
      readPersonalChessGames(),
      readPersonalChessMistakes(),
    ]);
    const storedMeta = readPersonalChessSyncMeta();
    setPersonalGames(storedGames);
    setPersonalMistakes(storedMistakes);
    setPersonalSyncMeta(storedMeta);

    if (storedGames.length > 0) {
      const normalizedGames = personalGamesToNormalized(storedGames);
      setGames(normalizedGames);
      setLoadedUsername(storedMeta?.username ?? username.trim());
      setSelectedIndividualGameUrl((currentUrl) =>
        currentUrl && storedGames.some((game) => game.gameUrl === currentUrl) ? currentUrl : storedGames.at(-1)?.gameUrl ?? null,
      );
      setSelectedDate(
        normalizedGames.filter((game) => game.timeClass === selectedTimeClass).at(-1)?.endDate ??
          normalizedGames.at(-1)?.endDate ??
          null,
      );
    }
  }, [selectedTimeClass, username]);

  useEffect(() => {
    if (!selectedDate && summaries.length > 0) {
      setSelectedDate(summaries[0].date);
    } else if (selectedDate && summaries.length > 0 && !summaries.some((summary) => summary.date === selectedDate)) {
      setSelectedDate(summaries[0].date);
    }
  }, [selectedDate, summaries]);

  useEffect(() => {
    setSelectedAnalysisReport(null);
  }, [analysisSettings, selectedDate, selectedTimeClass]);

  useEffect(() => {
    void refreshPersonalData();
  }, [refreshPersonalData]);

  useEffect(() => {
    return () => {
      personalAbortControllerRef.current?.abort();
      personalEngineRef.current?.dispose();
    };
  }, []);

  useEffect(() => {
    const mostRecentWeek = getMostRecentWeek(summaries);
    if (!mostRecentWeek) {
      setSelectedWeek(null);
      return;
    }

    setSelectedWeek((currentWeek) => currentWeek && availableWeeks.includes(currentWeek) ? currentWeek : mostRecentWeek);
  }, [availableWeeks, summaries]);

  function updateUsername(nextUsername: string) {
    setUsername(nextUsername);
    saveConfiguredChessComUsername(nextUsername);
  }

  async function syncPersonalGames(scope: PersonalChessSyncScope) {
    const trimmedUsername = username.trim() || blakeChessTrainerConfig.defaultUsername;
    if (!trimmedUsername) {
      setPersonalSyncError("Enter Blake's Chess.com username.");
      return;
    }
    setUsername(trimmedUsername);

    setPersonalSyncLoading(true);
    setPersonalSyncError(null);
    setPersonalSyncProgress({ current: 0, message: "Starting Chess.com sync.", total: 0 });
    setPersonalImportResult(null);

    try {
      saveConfiguredChessComUsername(trimmedUsername);
      saveLastChessComUsername(trimmedUsername);
      const response = await fetchPersonalChessComHistory({
        onProgress: setPersonalSyncProgress,
        scope,
        username: trimmedUsername,
      });
      const importResult = await importPersonalChessGames(response.games);
      const storedGames = await readPersonalChessGames();
      const storedMistakes = await readPersonalChessMistakes();
      const normalizedStoredGames = personalGamesToNormalized(storedGames);
      const syncMeta: PersonalChessSyncMeta = {
        archiveUrls: response.archiveUrls,
        importedGameCount: storedGames.length,
        lastError: null,
        lastSyncedAt: new Date().toISOString(),
        username: trimmedUsername,
      };

      writePersonalChessSyncMeta(syncMeta);
      setPersonalGames(storedGames);
      setPersonalMistakes(storedMistakes);
      setPersonalSyncMeta(syncMeta);
      setPersonalImportResult(importResult);
      setGames(normalizedStoredGames);
      setSelectedIndividualGameUrl(storedGames.at(-1)?.gameUrl ?? null);
      setArchiveCount(response.archiveUrls.length);
      setLoadedUsername(trimmedUsername);
      setSelectedDate(
        normalizedStoredGames.filter((game) => game.timeClass === selectedTimeClass).at(-1)?.endDate ??
          normalizedStoredGames.at(-1)?.endDate ??
          null,
      );
      setAnalysisRevision((revision) => revision + 1);
      setSelectedAnalysisReport(null);
      setActiveView("personal");
      setPersonalSyncProgress({
        current: response.archiveUrls.length,
        message: `Imported ${importResult.importedCount} game(s); ${importResult.duplicateCount} duplicate(s) skipped.`,
        total: response.archiveUrls.length,
      });
    } catch (syncError) {
      const reason =
        syncError instanceof Error
          ? `${syncError.message}. Metadata reports keep working from already imported games.`
          : "Could not sync Chess.com games.";
      const nextMeta: PersonalChessSyncMeta = {
        archiveUrls: personalSyncMeta?.archiveUrls ?? [],
        importedGameCount: personalGames.length,
        lastError: reason,
        lastSyncedAt: personalSyncMeta?.lastSyncedAt ?? null,
        username: trimmedUsername,
      };
      writePersonalChessSyncMeta(nextMeta);
      setPersonalSyncMeta(nextMeta);
      setPersonalSyncError(reason);
    } finally {
      setPersonalSyncLoading(false);
    }
  }

  async function analyzePersonalRapidLosses() {
    if (personalGames.length === 0) {
      setPersonalAnalysisError("Sync games before running rapid-loss analysis.");
      return;
    }

    const abortController = new AbortController();
    personalAbortControllerRef.current = abortController;
    personalEngineRef.current?.dispose();
    personalEngineRef.current = createStockfishEngine();
    setPersonalAnalysisError(null);
    setPersonalAnalysisRunning(true);
    setPersonalAnalysisProgress({ current: 0, message: "Preparing recent rapid losses.", total: 0 });

    try {
      const report = await analyzeRecentRapidLosses({
        engine: personalEngineRef.current,
        games: personalGames,
        onProgress: setPersonalAnalysisProgress,
        settings: {
          depth: analysisSettings.depth,
          maxMoves: Math.max(analysisSettings.maxMoves, 36),
          moveTimeMs: analysisSettings.moveTimeMs,
        },
        signal: abortController.signal,
      });

      if (abortController.signal.aborted) {
        return;
      }

      await replacePersonalChessMistakes(report.mistakes);
      setPersonalMistakes(report.mistakes);
      setAnalysisRevision((revision) => revision + 1);
      if (report.mistakes.length === 0 && report.skippedGames.length > 0) {
        setPersonalAnalysisError(report.skippedGames[0].reason);
      }
    } catch (error) {
      if (!abortController.signal.aborted) {
        setPersonalAnalysisError(error instanceof Error ? error.message : "Engine analysis unavailable in this browser/build.");
      }
    } finally {
      setPersonalAnalysisRunning(false);
    }
  }

  function stopPersonalAnalysis() {
    personalAbortControllerRef.current?.abort();
    personalEngineRef.current?.stop();
    setPersonalAnalysisRunning(false);
    setPersonalAnalysisProgress((currentProgress) => ({
      current: currentProgress?.current ?? 0,
      message: "Rapid-loss analysis stopped.",
      total: currentProgress?.total ?? 0,
    }));
  }

  function updatePersonalDrillStatus(id: string, status: PersonalDrillStatus) {
    setPersonalDrillReviews(writePersonalDrillReview(id, status));
    setSelectedPersonalDrillId(id);
  }

  async function loadGames(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const trimmedUsername = username.trim() || blakeChessTrainerConfig.defaultUsername;
    if (!trimmedUsername) {
      setError("Enter a Chess.com username.");
      return;
    }
    setUsername(trimmedUsername);

    setLoading(true);
    setError(null);
    try {
      const response = await fetchRecentChessComGames({
        monthCount,
        username: trimmedUsername,
      });
      const normalizedGames = normalizeChessComGames(response.games, trimmedUsername, { ratedOnly });
      const personalImport = await importPersonalChessGames(normalizePersonalChessComGames(response.games, trimmedUsername));
      const storedPersonalGames = await readPersonalChessGames();
      const syncMeta: PersonalChessSyncMeta = {
        archiveUrls: response.archiveUrls,
        importedGameCount: storedPersonalGames.length,
        lastError: null,
        lastSyncedAt: new Date().toISOString(),
        username: trimmedUsername,
      };
      writePersonalChessSyncMeta(syncMeta);
      saveConfiguredChessComUsername(trimmedUsername);
      setPersonalGames(storedPersonalGames);
      setPersonalMistakes(await readPersonalChessMistakes());
      setPersonalSyncMeta(syncMeta);
      setPersonalImportResult(personalImport);
      setArchiveCount(response.archiveUrls.length);
      setGames(normalizedGames);
      setSelectedIndividualGameUrl(storedPersonalGames.at(-1)?.gameUrl ?? null);
      setLoadedUsername(trimmedUsername);
      setSelectedDate(normalizedGames.filter((game) => game.timeClass === selectedTimeClass).at(-1)?.endDate ?? normalizedGames.at(-1)?.endDate ?? null);
      setAnalysisRevision((revision) => revision + 1);
      setSelectedAnalysisReport(null);
      setActiveView("personal");
      saveLastChessComUsername(trimmedUsername);
    } catch (fetchError) {
      setGames([]);
      setArchiveCount(0);
      setLoadedUsername("");
      setSelectedDate(null);
      setError(
        fetchError instanceof Error
          ? `${fetchError.message}. If this browser blocks direct Chess.com API calls with CORS, the fetcher module is isolated so a static-safe proxy can be added later.`
          : "Could not load Chess.com games.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="chess-analysis-panel" aria-label="Blake chess trainer">
      <div className="chess-analysis-header">
        <div>
          <p className="eyebrow">Blake chess trainer</p>
          <h2>Personal leak repair surface</h2>
          <p className="helper-text">
            Import games, diagnose leaks, build drills, and set rules for the next rated session.
          </p>
        </div>
        {loadedUsername ? <span className="status-tag">Loaded {loadedUsername}</span> : null}
      </div>
      <form className="chess-analysis-form" onSubmit={loadGames}>
        <label className="field">
          <span>Chess.com username</span>
          <input
            autoComplete="off"
            placeholder={blakeChessTrainerConfig.defaultUsername}
            value={username}
            onChange={(event) => updateUsername(event.target.value)}
          />
        </label>
        <label className="field">
          <span>Recent archives</span>
          <select value={monthCount} onChange={(event) => setMonthCount(Number(event.target.value))}>
            <option value={1}>1 month</option>
            <option value={2}>2 months</option>
            <option value={3}>3 months</option>
          </select>
        </label>
        <label className="chess-analysis-checkbox">
          <input checked={ratedOnly} type="checkbox" onChange={(event) => setRatedOnly(event.target.checked)} />
          Rated only
        </label>
        <button className="secondary-button primary-action" disabled={loading} type="submit">
          <Search size={17} aria-hidden="true" />
          {loading ? "Loading" : "Load games"}
        </button>
      </form>
      {error ? <p className="error-text">{error}</p> : null}
      {loading ? <p className="helper-text">Fetching Chess.com archive URLs and recent games sequentially to avoid aggressive API traffic.</p> : null}
      {!loading && !error && personalGames.length === 0 ? (
        <p className="helper-text">Sync {blakeChessTrainerConfig.defaultUsername}'s Chess.com games to populate the personal dashboard.</p>
      ) : null}
      {personalGames.length > 0 || games.length > 0 ? (
          <div className="chess-analysis-loaded-note">
            <span>{personalGames.length} imported personal games</span>
            <span>{filteredGames.length} {selectedTimeClass} games in review scope</span>
            <span>{archiveCount} monthly archives checked this run</span>
          </div>
      ) : null}
      {personalGames.length > 0 ? (
        <IndividualGameReviewShell
          analysisSettings={analysisSettings}
          games={personalGames}
          onSelectGame={setSelectedIndividualGameUrl}
          selectedGameUrl={selectedIndividualGameUrl}
        />
      ) : null}
      {games.length > 0 ? (
        <>
          <div className="coach-mode-panel" aria-label="Player review mode">
            <div>
              <p className="eyebrow">Review mode</p>
              <h3>{playerLevel === "beginner" ? "Beginner coach" : playerLevel === "advanced" ? "Advanced analysis" : "Intermediate review"}</h3>
            </div>
            <div className="coach-mode-selector" role="group" aria-label="Player level">
              {(["beginner", "intermediate", "advanced"] as PlayerLevel[]).map((level) => (
                <button
                  aria-pressed={playerLevel === level}
                  className={playerLevel === level ? "selected" : ""}
                  key={level}
                  onClick={() => setPlayerLevel(level)}
                  type="button"
                >
                  {level[0].toUpperCase() + level.slice(1)}
                </button>
              ))}
            </div>
            {playerLevel === "beginner" ? (
              <button className="secondary-button" onClick={() => setShowEngineDetails((current) => !current)} type="button">
                {showEngineDetails ? "Hide engine details" : "Show engine details"}
              </button>
            ) : null}
          </div>
          <label className="field time-control-selector">
            <span>Time control</span>
            <select
              value={selectedTimeClass}
              onChange={(event) => {
                setSelectedTimeClass(event.target.value as ChessComTrackedTimeClass);
                setActiveView("analysis");
              }}
            >
              {timeClasses.map((timeClass) => (
                <option key={timeClass} value={timeClass}>
                  {timeControlLabel(timeClass)} ({availableCounts[timeClass] ?? 0})
                </option>
              ))}
            </select>
          </label>
          <CoachStatusRow
            activeDay={selectedDay}
            fallbackGameCount={filteredGames.length}
            relatedStatuses={relatedSelectedDayStatuses}
            savedStatus={selectedDaySavedStatus}
            selectedTimeClass={selectedTimeClass}
            username={loadedUsername}
          />
          <CoachNextStepPanel
            activeDay={selectedDay}
            onViewChange={setActiveView}
            playerLevel={playerLevel}
            reviewReport={activeReviewReport}
            savedStatus={selectedDaySavedStatus}
            selectedTimeClass={selectedTimeClass}
            weeklyReport={weeklyReport}
          />
        </>
      ) : null}
      <AnalysisViewNav activeView={activeView} onChange={setActiveView} playerLevel={playerLevel} />
      <div className="analysis-view-panel">
        {activeView === "personal" ? (
          <PersonalTrainerPanel
            analysisError={personalAnalysisError}
            analysisProgress={personalAnalysisProgress}
            analysisRunning={personalAnalysisRunning}
            games={personalGames}
            importResult={personalImportResult}
            loading={personalSyncLoading}
            meta={personalSyncMeta}
            onAnalyzeRapidLosses={analyzePersonalRapidLosses}
            onSelectDrill={(drillId) => setSelectedPersonalDrillId(drillId)}
            onDrillStatusChange={updatePersonalDrillStatus}
            onStopAnalysis={stopPersonalAnalysis}
            onSync={syncPersonalGames}
            onUsernameChange={updateUsername}
            progress={personalSyncProgress}
            report={personalReport}
            selectedDrillId={selectedPersonalDrillId}
            syncError={personalSyncError}
            username={username}
          />
        ) : null}
        {activeView !== "personal" && games.length === 0 ? (
          <section className="analysis-placeholder-panel">
            <h3>No review games loaded</h3>
            <p className="helper-text">Use the Dashboard sync first, or run the recent archive loader above.</p>
          </section>
        ) : null}
        {activeView !== "personal" && games.length > 0 && filteredGames.length === 0 ? (
          <section className="analysis-placeholder-panel">
            <h3>No {timeControlLabel(selectedTimeClass)} games found</h3>
            <p className="helper-text">
              No loaded games match this time control and rated-only setting. Try another time control, include unrated games, or load more archives.
            </p>
          </section>
        ) : null}
        {activeView === "rating" && filteredGames.length > 0 ? (
          <section aria-label="Rating summaries">
            <div className="analysis-section-heading">
              <p className="eyebrow">Rating</p>
              <h3>{timeControlLabel(selectedTimeClass)} trend and daily cards</h3>
            </div>
            <RatingChangeGraph days={summaries} />
            <div className="chess-analysis-days">
              {summaries.map((summary) => (
                <DaySummaryButton
                  day={summary}
                  isSelected={selectedDay?.date === summary.date}
                  key={summary.date}
                  onSelect={() => setSelectedDate(summary.date)}
                />
              ))}
            </div>
          </section>
        ) : null}
        {activeView === "analysis" && selectedDay ? (
          <SelectedDayReview
            analysisReport={activeReviewReport}
            analysisSettings={analysisSettings}
            day={selectedDay}
            days={summaries}
            onAnalysisSettingsChange={setAnalysisSettings}
            onAnalysisReport={handleAnalysisReport}
            onAnalysisStatusChange={bumpAnalysisRevision}
            onDateChange={setSelectedDate}
            onIndividualGameSelect={setSelectedIndividualGameUrl}
            onUseAnalysisInWeeklyReport={handleUseAnalysisInWeeklyReport}
            onViewChange={setActiveView}
            playerLevel={playerLevel}
            showEngineDetails={showEngineDetails}
            username={loadedUsername}
          />
        ) : null}
        {activeView === "analysis" && filteredGames.length > 0 && !selectedDay ? (
          <section className="analysis-placeholder-panel">
            <h3>No selected day</h3>
            <p className="helper-text">Choose a day from Rating, or reload games so the app can select the most recent active day.</p>
          </section>
        ) : null}
        {activeView === "critical" ? (
          <CriticalMovesSection
            analysisSettings={analysisSettings}
            moves={activeReviewReport?.criticalMoves ?? []}
            playerLevel={playerLevel}
            showEngineDetails={showEngineDetails}
          />
        ) : null}
        {activeView === "homework" ? (
          <HomeworkSection
            analysisSettings={analysisSettings}
            playerLevel={playerLevel}
            puzzles={activeReviewReport?.homeworkPuzzles ?? []}
            showEngineDetails={showEngineDetails}
          />
        ) : null}
        {activeView === "weekly" && weeklyReport ? (
          <WeeklyReportPanel
            analysisSettings={analysisSettings}
            onAnalysisReport={handleAnalysisReport}
            onCoverageChange={bumpAnalysisRevision}
            selectedTimeClass={selectedTimeClass}
            onSelectDay={(date) => {
              setSelectedDate(date);
              setActiveView("analysis");
            }}
            playerLevel={playerLevel}
            report={weeklyReport}
            selectedWeek={selectedWeek ?? weeklyReport.weekKey}
            setSelectedWeek={setSelectedWeek}
            showEngineDetails={showEngineDetails}
            username={loadedUsername}
            weeks={availableWeeks}
          />
        ) : null}
        {activeView === "weekly" && !weeklyReport ? (
          <section className="analysis-placeholder-panel">
            <h3>No weekly plan yet</h3>
            <p className="helper-text">Load games with at least one active day for the selected time control, then the weekly plan can show coverage.</p>
          </section>
        ) : null}
      </div>
    </section>
  );
}
