import { Chess, type Square as ChessSquare } from "chess.js";
import { Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  fetchRecentChessComGames,
  readLastChessComUsername,
  saveLastChessComUsername,
} from "./chessComApi";
import { summarizeDailyChessGames } from "./chessDailySummary";
import { normalizeChessComGames } from "./chessGameNormalization";
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
type AnalysisView = "analysis" | "rating" | "critical" | "homework" | "weekly";
type PlayerLevel = "beginner" | "intermediate" | "advanced";

const analysisViews: { id: AnalysisView; labels: Record<PlayerLevel, string> }[] = [
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

function topMoveEvaluationLabel(move: StockfishTopMove): string {
  return formatEvaluation(move.evaluation);
}

function PlayableAnalysisBoard({
  analysisSettings,
  allowEnginePanel = false,
  bestMove,
  fen,
  orientation,
  playedMove,
}: {
  analysisSettings: SelectedDayAnalysisSettings;
  allowEnginePanel?: boolean;
  bestMove?: string;
  fen: string;
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
  const currentFen = game.fen();
  const legalTargets = useMemo(() => legalMoveSquares(game, selectedSquare), [game, selectedSquare]);
  const topMoveSquares = useMemo(() => moveSquares(topMoves[0]?.move ?? ""), [topMoves]);

  useEffect(() => {
    abortControllerRef.current?.abort();
    engineRef.current?.stop();
    setGame(new Chess(fen));
    setSelectedSquare(null);
    setLastMove(undefined);
    setTopMoves([]);
    setAnalysisError(null);
    setAnalysisRunning(false);
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
      }
      return;
    }

    if (piece && piece.color === game.turn()) {
      setSelectedSquare(square);
      return;
    }

    setSelectedSquare(null);
  }

  async function analyzeCurrentPosition() {
    abortControllerRef.current?.abort();
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    engineRef.current?.dispose();
    engineRef.current = createStockfishEngine();
    setAnalysisError(null);
    setAnalysisRunning(true);

    try {
      const moves = await engineRef.current.analyzeTopMoves(game.fen(), {
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
      setAnalysisError(error instanceof Error ? error.message : "Could not analyze this position.");
    } finally {
      if (abortControllerRef.current === abortController) {
        setAnalysisRunning(false);
      }
    }
  }

  const boardRows = Array.from({ length: 8 }, (_, rowIndex) =>
    Array.from({ length: 8 }, (_, colIndex) => squareAt(rowIndex, colIndex, orientation)),
  );
  const highlightedPlayed = moveSquares(playedMove ?? "");
  const highlightedBest = moveSquares(bestMove ?? "");
  const highlightedLast = moveSquares(lastMove ?? "");

  return (
    <div className="playable-analysis-board">
      <div className="fen-board-wrap large" aria-label="Playable chess analysis board">
        <div className="fen-board interactive">
          {boardRows.map((row, rowIndex) =>
            row.map((square, colIndex) => {
              const piece = game.get(square);
              const isSelected = selectedSquare === square;
              const isLegal = legalTargets.has(square);
              const isPlayed = highlightedPlayed.has(square) || highlightedLast.has(square);
              const isBest = highlightedBest.has(square) || topMoveSquares.has(square);
              const rank = square[1];
              const file = square[0];

              return (
                <button
                  aria-label={`${square}${piece ? ` ${piece.color === "w" ? "white" : "black"} ${piece.type}` : " empty"}`}
                  className={`fen-square ${(rowIndex + colIndex) % 2 === 0 ? "light" : "dark"} ${isPlayed ? "played" : ""} ${isBest ? "best" : ""} ${isSelected ? "selected" : ""} ${isLegal ? "legal" : ""}`}
                  key={square}
                  onClick={() => handleSquareClick(square)}
                  type="button"
                >
                  {colIndex === 0 ? <span className="fen-rank-label">{rank}</span> : null}
                  {rowIndex === 7 ? <span className="fen-file-label">{file}</span> : null}
                  {piece ? fenPieceGlyphs[piece.color === "w" ? piece.type.toUpperCase() : piece.type] : ""}
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
        {game.isCheck() ? <span>Check</span> : null}
        {game.isGameOver() ? <span>Game over</span> : null}
      </div>
      {analysisError ? <p className="error-text">Stockfish analysis unavailable. {analysisError}</p> : null}
      {allowEnginePanel ? (
        <div className="top-move-panel" aria-label="Top engine moves">
          <h4>Top 3 moves for current position</h4>
          {topMoves.length > 0 ? (
            <ol>
              {topMoves.map((move) => (
                <li key={`${move.rank}-${move.move}`}>
                  <strong>#{move.rank} {formatMoveLabel(currentFen, move.move)}</strong>
                  <span> · {topMoveEvaluationLabel(move)}</span>
                  <small>{formatPvLine(currentFen, move.line)}</small>
                </li>
              ))}
            </ol>
          ) : (
            <p className="helper-text">
              {analysisRunning
                ? "Analyzing top moves for this board position."
                : "Use this only when you want extra Stockfish lines for the current board position."}
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
  orientation,
  playedMove,
  size = "compact",
}: {
  bestMove?: string;
  fen: string;
  orientation: "black" | "white";
  playedMove?: string;
  size?: "compact" | "large";
}) {
  const rows = parseFenBoard(fen);
  const orientedRows = orientation === "black" ? [...rows].reverse().map((row) => [...row].reverse()) : rows;
  const highlightedPlayed = moveSquares(playedMove ?? "");
  const highlightedBest = moveSquares(bestMove ?? "");

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
            return (
              <span
                aria-label={`${square}${piece ? ` ${piece}` : " empty"}`}
                className={`fen-square ${(rowIndex + colIndex) % 2 === 0 ? "light" : "dark"} ${isPlayed ? "played" : ""} ${isBest ? "best" : ""}`}
                key={`${square}-${rowIndex}-${colIndex}`}
              >
                {colIndex === 0 ? <span className="fen-rank-label">{rank}</span> : null}
                {rowIndex === 7 ? <span className="fen-file-label">{file}</span> : null}
                {piece ? fenPieceGlyphs[piece] : ""}
              </span>
            );
          }),
        )}
      </div>
    </div>
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
        orientation={move.sideToMove}
        playedMove={move.playedMoveUci}
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
  const gameStatuses = new Map((analysisReport?.gameStatuses ?? []).map((status) => [status.gameUrl, status]));
  const canUseInWeeklyReport = Boolean(analysisReport) && selectedGameUrl === "all";

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
            <p>{analysisReport ? `${analysisReport.criticalMoves.length} review card(s) found` : "Run review to find the biggest swings."}</p>
          </article>
          <article>
            <span>3</span>
            <strong>Practice</strong>
            <p>{analysisReport ? `${analysisReport.homeworkPuzzles.length} puzzle(s) ready` : "Homework appears after review."}</p>
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
            <select value={selectedGameUrl} onChange={(event) => setSelectedGameUrl(event.target.value)} disabled={analysisRunning}>
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
          {analysisReport && (showEngineDetails || playerLevel === "advanced") ? (
            <span className="status-tag">
              Saved run: d{analysisReport.settings.depth} / {analysisReport.settings.moveTimeMs}ms
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
        {analysisReport?.incomplete ? (
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
                onClick={() => setSelectedGameUrl(game.gameUrl)}
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
            {analysisReport
              ? `Reviewed ${analysisReport.analyzedGameUrls.length} game(s). Start with ${analysisReport.criticalMoves.length} ${playerLevel === "beginner" ? "mistake" : "critical move"} card(s), then solve ${analysisReport.homeworkPuzzles.length} homework puzzle(s).`
              : playerLevel === "beginner"
                ? `${savedRunStatusCopy(selectedScopeStatus, relatedScopeStatuses)} Run review for this day to get mistake cards and practice positions.`
                : savedRunStatusCopy(selectedScopeStatus, relatedScopeStatuses)}
          </p>
          {analysisReport ? (
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
                  onClick={() => analysisReport && onUseAnalysisInWeeklyReport(analysisReport, day.date)}
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
          {(showEngineDetails || playerLevel === "advanced") && analysisReport?.gameStatuses?.length ? (
            <ul className="game-status-list">
              {analysisReport.gameStatuses.map((status) => (
                <li key={status.gameUrl}>
                  <strong>{status.status}</strong>: {status.analyzedMoveCount}/{status.candidateMoveCount} moves,{" "}
                  {status.criticalMoveCount} critical
                  {status.reason ? ` - ${status.reason}` : ""}
                </li>
              ))}
            </ul>
          ) : null}
          {(showEngineDetails || playerLevel === "advanced") && analysisReport?.skippedGames.length ? (
            <ul className="skipped-game-list">
              {analysisReport.skippedGames.slice(0, 4).map((game, index) => (
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
  const [username, setUsername] = useState(() => readLastChessComUsername());
  const [monthCount, setMonthCount] = useState(3);
  const [ratedOnly, setRatedOnly] = useState(true);
  const [games, setGames] = useState<NormalizedChessGame[]>([]);
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
  const [activeView, setActiveView] = useState<AnalysisView>("analysis");
  const [selectedAnalysisReport, setSelectedAnalysisReport] = useState<DailyEngineAnalysisReport | null>(null);

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
    const mostRecentWeek = getMostRecentWeek(summaries);
    if (!mostRecentWeek) {
      setSelectedWeek(null);
      return;
    }

    setSelectedWeek((currentWeek) => currentWeek && availableWeeks.includes(currentWeek) ? currentWeek : mostRecentWeek);
  }, [availableWeeks, summaries]);

  async function loadGames(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const trimmedUsername = username.trim();
    if (!trimmedUsername) {
      setError("Enter a Chess.com username.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await fetchRecentChessComGames({
        monthCount,
        username: trimmedUsername,
      });
      const normalizedGames = normalizeChessComGames(response.games, trimmedUsername, { ratedOnly });
      setArchiveCount(response.archiveUrls.length);
      setGames(normalizedGames);
      setLoadedUsername(trimmedUsername);
      setSelectedDate(normalizedGames.filter((game) => game.timeClass === selectedTimeClass).at(-1)?.endDate ?? normalizedGames.at(-1)?.endDate ?? null);
      setAnalysisRevision((revision) => revision + 1);
      setSelectedAnalysisReport(null);
      setActiveView("analysis");
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
    <section className="chess-analysis-panel" aria-label="Chess.com Analysis">
      <div className="chess-analysis-header">
        <div>
          <p className="eyebrow">Chess.com Analysis</p>
          <h2>Coach review surface</h2>
          <p className="helper-text">
            Loads public Chess.com games in the browser, then guides review by player level.
          </p>
        </div>
        {loadedUsername ? <span className="status-tag">Loaded {loadedUsername}</span> : null}
      </div>
      <form className="chess-analysis-form" onSubmit={loadGames}>
        <label className="field">
          <span>Chess.com username</span>
          <input
            autoComplete="off"
            placeholder="e.g. hikaru"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
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
      {!loading && !error && games.length === 0 ? (
        <p className="helper-text">Enter a username to load recent public rated blitz and rapid games.</p>
      ) : null}
      {!loading && games.length > 0 ? (
        <>
          <div className="chess-analysis-loaded-note">
            <span>{filteredGames.length} rated {selectedTimeClass} games</span>
            <span>{archiveCount} monthly archives checked</span>
          </div>
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
          <AnalysisViewNav activeView={activeView} onChange={setActiveView} playerLevel={playerLevel} />
          <div className="analysis-view-panel">
            {filteredGames.length === 0 ? (
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
        </>
      ) : null}
    </section>
  );
}
