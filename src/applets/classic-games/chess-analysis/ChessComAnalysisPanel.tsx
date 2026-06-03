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
  defaultSelectedDayAnalysisSettings,
  type SelectedDayAnalysisProgress,
  type SelectedDayAnalysisSettings,
} from "./chessSelectedDayAnalysis";
import { createStockfishEngine, type ChessStockfishEngine } from "./chessStockfishEngine";
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
  CriticalMoveAnalysis,
  DailyChessSummary,
  DailyEngineAnalysisReport,
  DailyTimeClassSummary,
  EngineEvaluation,
  HomeworkPuzzleCandidate,
  NormalizedChessGame,
} from "./chessReportTypes";

const timeClasses: ChessComTrackedTimeClass[] = ["bullet", "blitz", "rapid"];
type AnalysisView = "analysis" | "rating" | "critical" | "homework" | "change" | "weekly";

const analysisViews: { id: AnalysisView; label: string }[] = [
  { id: "analysis", label: "Analysis" },
  { id: "rating", label: "Rating" },
  { id: "change", label: "Rating Change" },
  { id: "critical", label: "Critical Moves" },
  { id: "homework", label: "Homework" },
  { id: "weekly", label: "Weekly Report" },
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
}: {
  activeView: AnalysisView;
  onChange: (view: AnalysisView) => void;
}) {
  return (
    <nav className="analysis-view-nav" aria-label="Chess.com analysis sections">
      <a href="#/applets/chess">Chess</a>
      {analysisViews.map((view) => (
        <button
          aria-pressed={activeView === view.id}
          className={activeView === view.id ? "selected" : ""}
          key={view.id}
          onClick={() => onChange(view.id)}
          type="button"
        >
          {view.label}
        </button>
      ))}
    </nav>
  );
}

function CriticalMoveList({ moves }: { moves: CriticalMoveAnalysis[] }) {
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
              <span>{formatCentipawnLoss(move.centipawnLoss)}</span>
            </div>
            <span className={`impact-pill impact-${move.impact?.severity ?? "minor"}`}>
              {move.impact?.label ?? "Engine improvement"}
            </span>
            <p>
              Position before the move. Played {move.playedMoveUci}; correct move {move.bestMove}.
            </p>
            <p>
              Player-perspective eval before {formatEvaluation(move.evalBefore)}, after played move{" "}
              {formatEvaluation(move.evalAfter)}.
            </p>
            <code>{move.fenBefore}</code>
          </div>
        </li>
      ))}
    </ol>
  );
}

function FocusedCriticalMove({ move }: { move: CriticalMoveAnalysis }) {
  return (
    <article className="focused-review-card">
      <FenBoard bestMove={move.bestMove} fen={move.fenBefore} orientation={move.sideToMove} playedMove={move.playedMoveUci} size="large" />
      <div className="focused-review-copy">
        <div className="card-topline">
          <div>
            <p className="eyebrow">Critical move #{move.moveNumber}</p>
            <h3>Move {move.moveNumber}: {move.playedMove}</h3>
          </div>
          <span className={`impact-pill impact-${move.impact?.severity ?? "minor"}`}>
            {move.impact?.label ?? "Engine improvement"}
          </span>
        </div>
        <dl className="move-detail-grid">
          <div>
            <dt>Played</dt>
            <dd>{move.playedMoveUci}</dd>
          </div>
          <div>
            <dt>Best move</dt>
            <dd>{move.bestMove}</dd>
          </div>
          <div>
            <dt>Eval before</dt>
            <dd>{formatEvaluation(move.evalBefore)}</dd>
          </div>
          <div>
            <dt>Eval after</dt>
            <dd>{formatEvaluation(move.evalAfter)}</dd>
          </div>
          <div>
            <dt>Loss</dt>
            <dd>{formatCentipawnLoss(move.centipawnLoss)}</dd>
          </div>
        </dl>
        <p>
          Position before the played move. Browser Stockfish preferred {move.bestMove}; the played move {move.playedMoveUci} changed the player-perspective evaluation from {formatEvaluation(move.evalBefore)} to {formatEvaluation(move.evalAfter)}.
        </p>
        <a className="source-game-link" href={move.gameUrl} target="_blank" rel="noreferrer">
          Source game
        </a>
      </div>
    </article>
  );
}

function CriticalMovesSection({ moves }: { moves: CriticalMoveAnalysis[] }) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const selectedMove = moves[Math.min(selectedIndex, Math.max(0, moves.length - 1))] ?? null;

  useEffect(() => {
    setSelectedIndex(0);
  }, [moves]);

  if (!selectedMove) {
    return (
      <section className="analysis-placeholder-panel">
        <h3>Critical Moves</h3>
        <p className="helper-text">Run Analysis for a selected date or game to populate critical moves.</p>
      </section>
    );
  }

  return (
    <section className="analysis-focus-section" aria-label="Critical Moves">
      <div className="analysis-section-heading">
        <p className="eyebrow">Critical Moves</p>
        <h3>Top engine-impact moments</h3>
      </div>
      <FocusedCriticalMove move={selectedMove} />
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
              <span>{move.impact?.label ?? "Engine improvement"} · {formatCentipawnLoss(move.centipawnLoss)}</span>
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function CriticalMovePager({ moves }: { moves: CriticalMoveAnalysis[] }) {
  const [index, setIndex] = useState(0);
  const boundedIndex = Math.min(index, Math.max(0, moves.length - 1));
  const selectedMove = moves[boundedIndex] ?? null;

  useEffect(() => {
    setIndex(0);
  }, [moves]);

  if (!selectedMove) {
    return <p className="helper-text">No cached critical moments yet.</p>;
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
      <FocusedCriticalMove move={selectedMove} />
    </div>
  );
}

function HomeworkPuzzleList({ puzzles }: { puzzles: HomeworkPuzzleCandidate[] }) {
  if (puzzles.length === 0) {
    return <p className="helper-text">No homework puzzles generated yet.</p>;
  }

  return (
    <ol className="homework-puzzle-list">
      {puzzles.map((puzzle) => (
        <li key={`${puzzle.gameUrl}-${puzzle.fen}`}>
          <FenBoard bestMove={puzzle.bestMove} fen={puzzle.fen} orientation={puzzle.sideToMove} />
          <div className="analysis-card-copy">
            <strong>Find the best move for {puzzle.sideToMove}.</strong>
            <span className={`impact-pill impact-${puzzle.impact?.severity ?? "minor"}`}>
              {puzzle.impact?.label ?? "Engine improvement"}
            </span>
            <p>
              Played: {puzzle.playedMove}. Correct move: {puzzle.bestMove}.
            </p>
            <p>{puzzle.explanation}</p>
            <code>{puzzle.fen}</code>
          </div>
        </li>
      ))}
    </ol>
  );
}

function FocusedHomeworkPuzzle({ puzzle }: { puzzle: HomeworkPuzzleCandidate }) {
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    setRevealed(false);
  }, [puzzle]);

  return (
    <article className="focused-review-card">
      <FenBoard bestMove={revealed ? puzzle.bestMove : undefined} fen={puzzle.fen} orientation={puzzle.sideToMove} size="large" />
      <div className="focused-review-copy">
        <div className="card-topline">
          <div>
            <p className="eyebrow">Homework</p>
            <h3>Find the best move for {puzzle.sideToMove}</h3>
          </div>
          <span className={`impact-pill impact-${puzzle.impact?.severity ?? "minor"}`}>
            {puzzle.impact?.label ?? "Engine improvement"}
          </span>
        </div>
        <p>{puzzle.explanation}</p>
        <button className="secondary-button primary-action" onClick={() => setRevealed((current) => !current)} type="button">
          {revealed ? "Hide answer" : "Reveal answer"}
        </button>
        {revealed ? (
          <dl className="move-detail-grid">
            <div>
              <dt>Best move</dt>
              <dd>{puzzle.bestMove}</dd>
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
        <a className="source-game-link" href={puzzle.gameUrl} target="_blank" rel="noreferrer">
          Source game
        </a>
      </div>
    </article>
  );
}

function HomeworkSection({ puzzles }: { puzzles: HomeworkPuzzleCandidate[] }) {
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
        <p className="eyebrow">Homework</p>
        <h3>Practice positions</h3>
      </div>
      <FocusedHomeworkPuzzle puzzle={selectedPuzzle} />
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
              <strong>#{index + 1} {puzzle.sideToMove} to move</strong>
              <span>{puzzle.impact?.label ?? "Engine improvement"} · {formatCentipawnLoss(puzzle.centipawnLoss)}</span>
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function HomeworkPuzzlePager({ puzzles }: { puzzles: HomeworkPuzzleCandidate[] }) {
  const [index, setIndex] = useState(0);
  const boundedIndex = Math.min(index, Math.max(0, puzzles.length - 1));
  const selectedPuzzle = puzzles[boundedIndex] ?? null;

  useEffect(() => {
    setIndex(0);
  }, [puzzles]);

  if (!selectedPuzzle) {
    return <p className="helper-text">No cached homework puzzles yet.</p>;
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
      <FocusedHomeworkPuzzle puzzle={selectedPuzzle} />
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

function WeeklyReportPanel({
  analysisSettings,
  onSelectDay,
  report,
  selectedTimeClass,
  selectedWeek,
  setSelectedWeek,
  weeks,
}: {
  analysisSettings: SelectedDayAnalysisSettings;
  onSelectDay: (date: string) => void;
  report: WeeklyReport;
  selectedTimeClass: ChessComTrackedTimeClass;
  selectedWeek: string;
  setSelectedWeek: (week: string) => void;
  weeks: string[];
}) {
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const missingSelectedDay = report.missingAnalysisDates[0] ?? null;
  const selectedSummary = report.timeClassSummaries[selectedTimeClass];

  async function copyMarkdown() {
    setCopyStatus(null);
    try {
      await navigator.clipboard.writeText(formatWeeklyReportMarkdown(report));
      setCopyStatus("Copied weekly report Markdown.");
    } catch {
      setCopyStatus("Could not copy Markdown in this browser.");
    }
  }

  return (
    <section className="weekly-report-panel" aria-label="Weekly Report">
      <div className="weekly-report-header">
        <div>
          <p className="eyebrow">Weekly Report</p>
          <h2>{timeControlLabel(selectedTimeClass)} · {getWeekLabel(report.weekKey)}</h2>
          <p className="helper-text">
            Fetched game and rating data covers loaded {selectedTimeClass} games in this week. Engine-analyzed data comes only from cached selected-day Stockfish runs for this time control.
            Current cache lookup: depth {analysisSettings.depth}, {analysisSettings.moveTimeMs}ms, {analysisSettings.maxGames} game(s), {analysisSettings.maxMoves} move(s).
          </p>
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
      <div className="weekly-coverage-row">
        <span>Fetched game/rating data: {report.days.length} active day(s)</span>
        <span>Engine-analyzed data: {report.engineAnalyzedDayCount}/{report.days.length} day(s)</span>
        <span>Stockfish-analyzed games: {report.engineAnalyzedGameCount}</span>
      </div>
      {report.missingAnalysisDates.length > 0 ? (
        <div className="weekly-missing-analysis">
          <strong>Missing analysis:</strong>
          <span>{report.missingAnalysisDates.map(formatDateLabel).join(", ")}</span>
          {missingSelectedDay ? (
            <button className="secondary-button" onClick={() => onSelectDay(missingSelectedDay)} type="button">
              Analyze selected day first
            </button>
          ) : null}
        </div>
      ) : (
        <p className="helper-text">Every loaded day in this week has cached selected-day engine analysis.</p>
      )}
      <div className="weekly-report-columns">
        <section className="analysis-placeholder-panel">
          <h3>Recurring issue labels</h3>
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
          <h3>Top weekly critical moments</h3>
          <CriticalMovePager moves={report.topCriticalMoves} />
        </section>
        <section className="analysis-placeholder-panel">
          <h3>Weekly homework</h3>
          <HomeworkPuzzlePager puzzles={report.homeworkPuzzles} />
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

function SelectedDayReview({
  analysisSettings,
  analysisReport,
  day,
  days,
  onAnalysisSettingsChange,
  onAnalysisReport,
  onDateChange,
  username,
}: {
  analysisSettings: SelectedDayAnalysisSettings;
  analysisReport: DailyEngineAnalysisReport | null;
  day: DailyChessSummary;
  days: DailyChessSummary[];
  onAnalysisSettingsChange: (settings: SelectedDayAnalysisSettings) => void;
  onAnalysisReport: (report: DailyEngineAnalysisReport | null) => void;
  onDateChange: (date: string) => void;
  username: string;
}) {
  const engineRef = useRef<ChessStockfishEngine | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [selectedGameUrl, setSelectedGameUrl] = useState("all");
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analysisRunning, setAnalysisRunning] = useState(false);
  const [progress, setProgress] = useState<SelectedDayAnalysisProgress | null>(null);
  const selectedGames = selectedGameUrl === "all" ? day.games : day.games.filter((game) => game.gameUrl === selectedGameUrl);

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
      onAnalysisReport(report);
    } catch (error) {
      setAnalysisError(
        error instanceof Error
          ? error.message
          : "Engine analysis unavailable in this browser/build.",
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

  function updateAnalysisSetting(key: keyof SelectedDayAnalysisSettings, value: number) {
    onAnalysisSettingsChange({
      ...analysisSettings,
      [key]: clampAnalysisSetting(key, value),
    });
  }

  return (
    <section className="chess-daily-review" aria-label="Analysis">
      <div>
        <p className="eyebrow">Analysis</p>
        <h2>{formatDateLabel(day.date)}</h2>
        <p className="helper-text">
          Browser Stockfish is coaching-grade, not master-level truth. This analyzes up to{" "}
          {analysisSettings.maxGames} recent game(s) and{" "}
          {analysisSettings.maxMoves} of your moves for the selected day. Stockfish is provided under
          GPLv3; license text is included at public/vendor/stockfish/Copying.txt.
        </p>
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
            <span>{day.games[0]?.timeClass ?? "selected time control"}</span>
          </div>
        </div>
        <div className="analysis-settings-grid" aria-label="Stockfish analysis settings">
          <label className="field">
            <span>Depth</span>
            <input
              disabled={analysisRunning}
              max={18}
              min={1}
              type="number"
              value={analysisSettings.depth}
              onChange={(event) => updateAnalysisSetting("depth", Number(event.target.value))}
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
              onChange={(event) => updateAnalysisSetting("moveTimeMs", Number(event.target.value))}
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
              onChange={(event) => updateAnalysisSetting("maxGames", Number(event.target.value))}
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
              onChange={(event) => updateAnalysisSetting("maxMoves", Number(event.target.value))}
            />
          </label>
        </div>
        <div className="chess-analysis-actions">
          <button className="secondary-button primary-action" disabled={analysisRunning} onClick={analyzeDay} type="button">
            Analyze selected day
          </button>
          <button className="secondary-button" disabled={!analysisRunning} onClick={stopAnalysis} type="button">
            Stop
          </button>
          {analysisReport ? (
            <span className="status-tag">
              Cached d{analysisReport.settings.depth} / {analysisReport.settings.moveTimeMs}ms
            </span>
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
                {gameStatuses.has(game.gameUrl) ? (
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
          <h3>Run summary</h3>
          <p>
            {analysisReport
              ? `Analyzed ${analysisReport.analyzedGameUrls.length} game(s) at depth ${analysisReport.settings.depth}, ${analysisReport.settings.moveTimeMs}ms per position. Use Critical Moves and Homework for the board review.`
              : "No matching cached engine analysis yet for these settings."}
          </p>
          {analysisReport?.gameStatuses?.length ? (
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
          {analysisReport?.skippedGames.length ? (
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

  const handleAnalysisReport = useCallback((report: DailyEngineAnalysisReport | null) => {
    setSelectedAnalysisReport(report);
    if (report) {
      setAnalysisRevision((revision) => revision + 1);
    }
  }, []);

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
          <h2>Recent rating movement</h2>
          <p className="helper-text">
            Loads public Chess.com archives in the browser, filters rated blitz and rapid games, and groups rating movement by local day.
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
          <AnalysisViewNav activeView={activeView} onChange={setActiveView} />
          <div className="analysis-view-panel">
            {filteredGames.length === 0 ? (
              <section className="analysis-placeholder-panel">
                <h3>No {selectedTimeClass} games loaded</h3>
                <p className="helper-text">Try another time control or load more archives.</p>
              </section>
            ) : null}
            {activeView === "rating" && filteredGames.length > 0 ? (
              <section aria-label="Rating summaries">
                <div className="analysis-section-heading">
                  <p className="eyebrow">Rating</p>
                  <h3>{timeControlLabel(selectedTimeClass)} daily rating cards</h3>
                </div>
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
                analysisReport={selectedAnalysisReport}
                analysisSettings={analysisSettings}
                day={selectedDay}
                days={summaries}
                onAnalysisSettingsChange={setAnalysisSettings}
                onAnalysisReport={handleAnalysisReport}
                onDateChange={setSelectedDate}
                username={loadedUsername}
              />
            ) : null}
            {activeView === "change" && filteredGames.length > 0 ? <RatingChangeGraph days={summaries} /> : null}
            {activeView === "critical" ? (
              <CriticalMovesSection moves={selectedAnalysisReport?.criticalMoves ?? []} />
            ) : null}
            {activeView === "homework" ? (
              <HomeworkSection puzzles={selectedAnalysisReport?.homeworkPuzzles ?? []} />
            ) : null}
            {activeView === "weekly" && weeklyReport ? (
              <WeeklyReportPanel
                analysisSettings={analysisSettings}
                selectedTimeClass={selectedTimeClass}
                onSelectDay={(date) => {
                  setSelectedDate(date);
                  setActiveView("analysis");
                }}
                report={weeklyReport}
                selectedWeek={selectedWeek ?? weeklyReport.weekKey}
                setSelectedWeek={setSelectedWeek}
                weeks={availableWeeks}
              />
            ) : null}
          </div>
        </>
      ) : null}
    </section>
  );
}
