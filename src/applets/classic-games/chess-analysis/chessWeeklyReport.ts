import type {
  ChessComTrackedTimeClass,
  CriticalMoveAnalysis,
  DailyChessSummary,
  DailyEngineAnalysisReport,
  DailyTimeClassSummary,
  HomeworkPuzzleCandidate,
} from "./chessReportTypes";
import {
  buildAnalysisCacheKey,
  defaultSelectedDayAnalysisSettings,
  rankCriticalMoves,
  readCachedDailyAnalysis,
  type SelectedDayAnalysisSettings,
} from "./chessSelectedDayAnalysis";

export type WeeklyTimeClassSummary = {
  finalRating: number | null;
  firstKnownRating: number | null;
  gamesPlayed: number;
  losses: number;
  netChange: number | null;
  timeClass: ChessComTrackedTimeClass;
  wins: number;
  draws: number;
};

export type WeeklyRatingDay = {
  date: string;
  netChange: number;
};

export type WeeklyIssueTheme = {
  count: number;
  label: "blunder" | "major eval loss" | "missed win" | "missed mate" | "missed best move" | "small improvement";
};

export type WeeklyReport = {
  analyzedDays: DailyEngineAnalysisReport[];
  analyzedDates: string[];
  bestDay: WeeklyRatingDay | null;
  dateRange: {
    end: string;
    start: string;
  };
  days: DailyChessSummary[];
  engineAnalyzedDayCount: number;
  engineAnalyzedGameCount: number;
  homeworkPuzzles: HomeworkPuzzleCandidate[];
  missingAnalysisDates: string[];
  themeCounts: WeeklyIssueTheme[];
  timeClassSummaries: Record<ChessComTrackedTimeClass, WeeklyTimeClassSummary>;
  topCriticalMoves: CriticalMoveAnalysis[];
  weekKey: string;
  worstDay: WeeklyRatingDay | null;
};

const timeClasses: ChessComTrackedTimeClass[] = ["bullet", "blitz", "rapid"];

function parseLocalDate(date: string): Date {
  return new Date(`${date}T12:00:00`);
}

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfWeek(date: string): string {
  const parsedDate = parseLocalDate(date);
  const day = parsedDate.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  parsedDate.setDate(parsedDate.getDate() + mondayOffset);
  return formatLocalDate(parsedDate);
}

function addDays(date: string, count: number): string {
  const parsedDate = parseLocalDate(date);
  parsedDate.setDate(parsedDate.getDate() + count);
  return formatLocalDate(parsedDate);
}

function emptyWeeklyTimeClassSummary(timeClass: ChessComTrackedTimeClass): WeeklyTimeClassSummary {
  return {
    draws: 0,
    finalRating: null,
    firstKnownRating: null,
    gamesPlayed: 0,
    losses: 0,
    netChange: null,
    timeClass,
    wins: 0,
  };
}

function summarizeTimeClass(
  days: DailyChessSummary[],
  timeClass: ChessComTrackedTimeClass,
): WeeklyTimeClassSummary {
  const summary = emptyWeeklyTimeClassSummary(timeClass);
  const games = days
    .flatMap((day) => day.byTimeClass[timeClass]?.games ?? [])
    .sort((left, right) => left.endTimestamp - right.endTimestamp);

  summary.gamesPlayed = games.length;
  summary.wins = games.filter((game) => game.result === "win").length;
  summary.losses = games.filter((game) => game.result === "loss").length;
  summary.draws = games.filter((game) => game.result === "draw").length;
  const firstRatedGame = games.find((game) => game.playerRatingAfterGame !== null);
  const finalRatedGame = [...games].reverse().find((game) => game.playerRatingAfterGame !== null);
  summary.firstKnownRating = firstRatedGame?.playerRatingAfterGame ?? null;
  summary.finalRating = finalRatedGame?.playerRatingAfterGame ?? null;
  summary.netChange =
    summary.firstKnownRating === null || summary.finalRating === null
      ? null
      : summary.finalRating - summary.firstKnownRating;

  return summary;
}

function summarizeDailyNetChange(day: DailyChessSummary): WeeklyRatingDay | null {
  const netChange = timeClasses.reduce((total, timeClass) => {
    const timeClassSummary = day.byTimeClass[timeClass];
    return total + (timeClassSummary?.netChange ?? 0);
  }, 0);
  const hasAnyRating = timeClasses.some((timeClass) => day.byTimeClass[timeClass]?.netChange != null);

  return hasAnyRating ? { date: day.date, netChange } : null;
}

function classifyTheme(move: CriticalMoveAnalysis): WeeklyIssueTheme["label"] {
  if (move.impact?.theme) {
    return move.impact.theme;
  }

  if (move.mateSwing !== null) {
    return "missed mate";
  }

  if (move.centipawnLoss >= 600) {
    return "blunder";
  }

  if (move.centipawnLoss >= 300) {
    return "major eval loss";
  }

  if (move.bestMove && move.bestMove !== move.playedMoveUci) {
    return "missed best move";
  }

  return "small improvement";
}

function summarizeThemes(moves: CriticalMoveAnalysis[]): WeeklyIssueTheme[] {
  const counts = new Map<WeeklyIssueTheme["label"], number>();
  for (const move of moves) {
    const label = classifyTheme(move);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([label, count]) => ({ count, label }))
    .sort((left, right) => right.count - left.count);
}

export function getAvailableWeeks(days: DailyChessSummary[]): string[] {
  return [...new Set(days.map((day) => startOfWeek(day.date)))].sort((left, right) => right.localeCompare(left));
}

export function getMostRecentWeek(days: DailyChessSummary[]): string | null {
  return getAvailableWeeks(days)[0] ?? null;
}

export function getWeekLabel(weekKey: string): string {
  return `${weekKey} to ${addDays(weekKey, 6)}`;
}

function formatRating(value: number | null): string {
  return value === null ? "n/a" : `${value}`;
}

function formatNetChange(value: number | null): string {
  if (value === null) {
    return "n/a";
  }

  return value > 0 ? `+${value}` : `${value}`;
}

export function buildWeeklyAnalysisCacheKey({
  date,
  day,
  settings = defaultSelectedDayAnalysisSettings,
  username,
}: {
  date: string;
  day: DailyChessSummary;
  settings?: SelectedDayAnalysisSettings;
  username: string;
}): string {
  return buildAnalysisCacheKey({
    date,
    gameUrls: day.games.slice(0, settings.maxGames).map((game) => game.gameUrl),
    settings,
    username,
  });
}

export function buildWeeklyReport({
  days,
  settings = defaultSelectedDayAnalysisSettings,
  username,
  weekKey,
}: {
  days: DailyChessSummary[];
  settings?: SelectedDayAnalysisSettings;
  username: string;
  weekKey: string;
}): WeeklyReport {
  const weekEnd = addDays(weekKey, 6);
  const weekDays = days
    .filter((day) => day.date >= weekKey && day.date <= weekEnd)
    .sort((left, right) => left.date.localeCompare(right.date));
  const analyzedEntries = weekDays
    .map((day) => ({
      date: day.date,
      report: readCachedDailyAnalysis(buildWeeklyAnalysisCacheKey({ date: day.date, day, settings, username })),
    }))
    .filter((entry): entry is { date: string; report: DailyEngineAnalysisReport } => Boolean(entry.report));
  const analyzedDays = analyzedEntries.map((entry) => entry.report);
  const analyzedDates = new Set(analyzedEntries.map((entry) => entry.date));
  const dailyNetChanges = weekDays
    .map(summarizeDailyNetChange)
    .filter((day): day is WeeklyRatingDay => Boolean(day));
  const topCriticalMoves = rankCriticalMoves(analyzedDays.flatMap((report) => report.criticalMoves)).slice(0, 5);
  const homeworkPuzzles = analyzedDays
    .flatMap((report) => report.homeworkPuzzles)
    .sort((left, right) => right.centipawnLoss - left.centipawnLoss)
    .slice(0, 5);
  const analyzedGameUrls = new Set(analyzedDays.flatMap((report) => report.analyzedGameUrls));

  return {
    analyzedDays,
    analyzedDates: [...analyzedDates],
    bestDay: dailyNetChanges.length > 0 ? [...dailyNetChanges].sort((left, right) => right.netChange - left.netChange)[0] : null,
    dateRange: {
      end: weekEnd,
      start: weekKey,
    },
    days: weekDays,
    engineAnalyzedDayCount: analyzedDates.size,
    engineAnalyzedGameCount: analyzedGameUrls.size,
    homeworkPuzzles,
    missingAnalysisDates: weekDays.filter((day) => !analyzedDates.has(day.date)).map((day) => day.date),
    themeCounts: summarizeThemes(topCriticalMoves),
    timeClassSummaries: {
      bullet: summarizeTimeClass(weekDays, "bullet"),
      blitz: summarizeTimeClass(weekDays, "blitz"),
      rapid: summarizeTimeClass(weekDays, "rapid"),
    },
    topCriticalMoves,
    weekKey,
    worstDay: dailyNetChanges.length > 0 ? [...dailyNetChanges].sort((left, right) => left.netChange - right.netChange)[0] : null,
  };
}

export function formatWeeklyReportMarkdown(report: WeeklyReport): string {
  const bullet = report.timeClassSummaries.bullet;
  const blitz = report.timeClassSummaries.blitz;
  const rapid = report.timeClassSummaries.rapid;
  const lines = [
    `# Chess.com Weekly Report: ${getWeekLabel(report.weekKey)}`,
    "",
    "## Fetched Game / Rating Data",
    `- Bullet: ${bullet.gamesPlayed} games, ${bullet.wins}-${bullet.losses}-${bullet.draws}, ${formatRating(bullet.firstKnownRating)} to ${formatRating(bullet.finalRating)} (${formatNetChange(bullet.netChange)})`,
    `- Blitz: ${blitz.gamesPlayed} games, ${blitz.wins}-${blitz.losses}-${blitz.draws}, ${formatRating(blitz.firstKnownRating)} to ${formatRating(blitz.finalRating)} (${formatNetChange(blitz.netChange)})`,
    `- Rapid: ${rapid.gamesPlayed} games, ${rapid.wins}-${rapid.losses}-${rapid.draws}, ${formatRating(rapid.firstKnownRating)} to ${formatRating(rapid.finalRating)} (${formatNetChange(rapid.netChange)})`,
    `- Best day: ${report.bestDay ? `${report.bestDay.date} (${formatNetChange(report.bestDay.netChange)})` : "n/a"}`,
    `- Worst day: ${report.worstDay ? `${report.worstDay.date} (${formatNetChange(report.worstDay.netChange)})` : "n/a"}`,
    "",
    "## Engine Analysis Coverage",
    `- Analyzed days: ${report.engineAnalyzedDayCount}/${report.days.length}`,
    `- Stockfish-analyzed games: ${report.engineAnalyzedGameCount}`,
    `- Settings: ${report.analyzedDays[0] ? `depth ${report.analyzedDays[0].settings.depth}, ${report.analyzedDays[0].settings.moveTimeMs}ms, ${report.analyzedDays[0].settings.maxGames} game(s), ${report.analyzedDays[0].settings.maxMoves} move(s)` : "no cached engine analysis"}`,
    `- Missing analysis: ${report.missingAnalysisDates.length > 0 ? report.missingAnalysisDates.join(", ") : "none"}`,
    "",
    "## Top Critical Moments",
    ...(report.topCriticalMoves.length > 0
      ? report.topCriticalMoves.map(
          (move, index) =>
            `${index + 1}. ${move.impact?.label ?? "Engine improvement"}: ${move.playedMove} on move ${move.moveNumber}, best ${move.bestMove}, loss ${Math.round(move.centipawnLoss)} cp`,
        )
      : ["No cached engine analysis yet."]),
    "",
    "## Homework",
    ...(report.homeworkPuzzles.length > 0
      ? report.homeworkPuzzles.map(
          (puzzle, index) =>
            `${index + 1}. Find the best move for ${puzzle.sideToMove}: ${puzzle.bestMove}. FEN: ${puzzle.fen}`,
        )
      : ["Analyze at least one day to generate homework candidates."]),
  ];

  return lines.join("\n");
}
