import { Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
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

const timeClasses: ChessComTrackedTimeClass[] = ["blitz", "rapid"];
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
}: {
  bestMove?: string;
  fen: string;
  orientation: "black" | "white";
  playedMove?: string;
}) {
  const rows = parseFenBoard(fen);
  const orientedRows = orientation === "black" ? [...rows].reverse().map((row) => [...row].reverse()) : rows;
  const highlightedPlayed = moveSquares(playedMove ?? "");
  const highlightedBest = moveSquares(bestMove ?? "");

  return (
    <div className="fen-board-wrap" aria-label="Chess position">
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
              <span className="rating-change-value">{formatNetChange(value)}</span>
              <div className="rating-change-track">
                <span
                  className={`rating-change-bar ${value >= 0 ? "positive" : "negative"}`}
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
            <strong>{formatNetChange(dailyNetChange(day))}</strong>
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
        <span className={`rating-delta ${summary.netChange && summary.netChange > 0 ? "positive" : summary.netChange && summary.netChange < 0 ? "negative" : ""}`}>
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

function WeeklyTimeClassCard({ summary }: { summary: WeeklyTimeClassSummary }) {
  return (
    <article className="weekly-summary-card">
      <div className="card-topline">
        <h3>{summary.timeClass}</h3>
        <span className={`rating-delta ${summary.netChange && summary.netChange > 0 ? "positive" : summary.netChange && summary.netChange < 0 ? "negative" : ""}`}>
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
  onSelectDay,
  report,
  selectedWeek,
  setSelectedWeek,
  weeks,
}: {
  onSelectDay: (date: string) => void;
  report: WeeklyReport;
  selectedWeek: string;
  setSelectedWeek: (week: string) => void;
  weeks: string[];
}) {
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const missingSelectedDay = report.missingAnalysisDates[0] ?? null;

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
          <h2>{getWeekLabel(report.weekKey)}</h2>
          <p className="helper-text">
            Fetched game and rating data covers every loaded blitz/rapid game in this week. Engine-analyzed data comes only from cached selected-day Stockfish runs.
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
        <WeeklyTimeClassCard summary={report.timeClassSummaries.blitz} />
        <WeeklyTimeClassCard summary={report.timeClassSummaries.rapid} />
        <article className="weekly-summary-card">
          <h3>Best day</h3>
          <strong>{report.bestDay ? formatDateLabel(report.bestDay.date) : "n/a"}</strong>
          <p>{report.bestDay ? formatNetChange(report.bestDay.netChange) : "No rating movement found."}</p>
        </article>
        <article className="weekly-summary-card">
          <h3>Worst day</h3>
          <strong>{report.worstDay ? formatDateLabel(report.worstDay.date) : "n/a"}</strong>
          <p>{report.worstDay ? formatNetChange(report.worstDay.netChange) : "No rating movement found."}</p>
        </article>
      </div>
      <RatingChangeGraph days={report.days} />
      <DailySummaryReport days={report.days} onSelectDay={onSelectDay} />
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
          <CriticalMoveList moves={report.topCriticalMoves} />
        </section>
        <section className="analysis-placeholder-panel">
          <h3>Weekly homework</h3>
          <HomeworkPuzzleList puzzles={report.homeworkPuzzles} />
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
  day,
  onAnalysisReport,
  username,
}: {
  day: DailyChessSummary;
  onAnalysisReport: () => void;
  username: string;
}) {
  const engineRef = useRef<ChessStockfishEngine | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [analysisReport, setAnalysisReport] = useState<DailyEngineAnalysisReport | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analysisRunning, setAnalysisRunning] = useState(false);
  const [progress, setProgress] = useState<SelectedDayAnalysisProgress | null>(null);

  useEffect(() => {
    setAnalysisReport(null);
    setAnalysisError(null);
    setProgress(null);
    abortControllerRef.current?.abort();
    engineRef.current?.stop();
    setAnalysisRunning(false);
  }, [day.date]);

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
        games: day.games,
        onProgress: setProgress,
        signal: abortController.signal,
        username,
      });
      setAnalysisReport(report);
      onAnalysisReport();
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

  return (
    <section className="chess-daily-review" aria-label="Daily review">
      <div>
        <p className="eyebrow">Daily Review</p>
        <h2>{formatDateLabel(day.date)}</h2>
        <p className="helper-text">
          Low-depth browser Stockfish is coaching-grade, not master-level truth. This analyzes up to{" "}
          {defaultSelectedDayAnalysisSettings.maxGames} recent games and{" "}
          {defaultSelectedDayAnalysisSettings.maxMoves} of your moves for the selected day. Stockfish is provided under
          GPLv3; license text is included at public/vendor/stockfish/Copying.txt.
        </p>
        <div className="chess-analysis-actions">
          <button className="secondary-button primary-action" disabled={analysisRunning} onClick={analyzeDay} type="button">
            Analyze selected day
          </button>
          <button className="secondary-button" disabled={!analysisRunning} onClick={stopAnalysis} type="button">
            Stop
          </button>
          {analysisReport ? <span className="status-tag">Stockfish cached after run</span> : null}
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
      <div className="chess-review-grid">
        <section>
          <h3>Recent games</h3>
          <div className="chess-game-list">
            {day.games.map((game) => (
              <div className="chess-game-row" key={game.gameUrl}>
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
              </div>
            ))}
          </div>
        </section>
        <section className="analysis-placeholder-panel">
          <h3>Top 5 critical moves</h3>
          {analysisReport ? (
            <CriticalMoveList moves={analysisReport.criticalMoves} />
          ) : (
            <p className="helper-text">Run selected-day analysis to replace this placeholder with real Stockfish output.</p>
          )}
        </section>
        <section className="analysis-placeholder-panel">
          <h3>Homework puzzles</h3>
          {analysisReport ? (
            <HomeworkPuzzleList puzzles={analysisReport.homeworkPuzzles} />
          ) : (
            <p className="helper-text">Run selected-day analysis to generate simple “find the best move” puzzles.</p>
          )}
        </section>
        <section className="analysis-placeholder-panel">
          <h3>Weekly report summary</h3>
          <p>
            {analysisReport
              ? `Analyzed ${analysisReport.analyzedGameUrls.length} game(s) with Stockfish 18 lite single-threaded. The weekly report above will use this cached analysis.`
              : "Engine analysis not wired yet for weekly reports."}
          </p>
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
  const [archiveCount, setArchiveCount] = useState(0);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadedUsername, setLoadedUsername] = useState("");
  const [selectedWeek, setSelectedWeek] = useState<string | null>(null);
  const [analysisRevision, setAnalysisRevision] = useState(0);

  const summaries = useMemo(() => summarizeDailyChessGames(games), [games]);
  const selectedDay = summaries.find((summary) => summary.date === selectedDate) ?? summaries[0] ?? null;
  const availableWeeks = useMemo(() => getAvailableWeeks(summaries), [summaries]);
  const weeklyReport = useMemo(() => {
    if (!loadedUsername || !selectedWeek) {
      return null;
    }

    return buildWeeklyReport({
      days: summaries,
      username: loadedUsername,
      weekKey: selectedWeek,
    });
  }, [analysisRevision, loadedUsername, selectedWeek, summaries]);

  useEffect(() => {
    if (!selectedDate && summaries.length > 0) {
      setSelectedDate(summaries[0].date);
    } else if (selectedDate && summaries.length > 0 && !summaries.some((summary) => summary.date === selectedDate)) {
      setSelectedDate(summaries[0].date);
    }
  }, [selectedDate, summaries]);

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
      setSelectedDate(normalizedGames.at(-1)?.endDate ?? null);
      setAnalysisRevision((revision) => revision + 1);
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
            <span>{games.length} rated blitz/rapid games</span>
            <span>{archiveCount} monthly archives checked</span>
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
          {weeklyReport ? (
            <WeeklyReportPanel
              onSelectDay={(date) => setSelectedDate(date)}
              report={weeklyReport}
              selectedWeek={selectedWeek ?? weeklyReport.weekKey}
              setSelectedWeek={setSelectedWeek}
              weeks={availableWeeks}
            />
          ) : null}
          {selectedDay ? (
            <SelectedDayReview
              day={selectedDay}
              onAnalysisReport={() => setAnalysisRevision((revision) => revision + 1)}
              username={loadedUsername}
            />
          ) : null}
        </>
      ) : null}
    </section>
  );
}
