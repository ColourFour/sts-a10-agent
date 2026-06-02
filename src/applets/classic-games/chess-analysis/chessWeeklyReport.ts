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
  label: "blunder / major eval loss" | "missed engine best move" | "uncategorized critical move";
};

export type WeeklyReport = {
  analyzedDays: DailyEngineAnalysisReport[];
  availableAnalysisDays: string[];
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

const timeClasses: ChessComTrackedTimeClass[] = ["blitz", "rapid"];

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
  const hasAnyRating = timeClasses.some((timeClass) => day.byTimeClass[timeClass]?.netChange !== null);

  return hasAnyRating ? { date: day.date, netChange } : null;
}

function classifyTheme(move: CriticalMoveAnalysis): WeeklyIssueTheme["label"] {
  if (move.centipawnLoss >= 300 || move.mateSwing !== null) {
    return "blunder / major eval loss";
  }

  if (move.bestMove && move.bestMove !== move.playedMoveUci) {
    return "missed engine best move";
  }

  return "uncategorized critical move";
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

export function buildWeeklyAnalysisCacheKey({
  date,
  day,
  username,
}: {
  date: string;
  day: DailyChessSummary;
  username: string;
}): string {
  return buildAnalysisCacheKey({
    date,
    gameUrls: day.games.slice(0, defaultSelectedDayAnalysisSettings.maxGames).map((game) => game.gameUrl),
    settings: defaultSelectedDayAnalysisSettings,
    username,
  });
}

export function buildWeeklyReport({
  days,
  username,
  weekKey,
}: {
  days: DailyChessSummary[];
  username: string;
  weekKey: string;
}): WeeklyReport {
  const weekEnd = addDays(weekKey, 6);
  const weekDays = days
    .filter((day) => day.date >= weekKey && day.date <= weekEnd)
    .sort((left, right) => left.date.localeCompare(right.date));
  const analyzedDays = weekDays
    .map((day) => readCachedDailyAnalysis(buildWeeklyAnalysisCacheKey({ date: day.date, day, username })))
    .filter((report): report is DailyEngineAnalysisReport => Boolean(report));
  const availableAnalysisDays = new Set(analyzedDays.map((report) => report.completedAt ? report.analyzedGameUrls.join("|") : ""));
  const analyzedDates = new Set(
    weekDays
      .filter((day) => readCachedDailyAnalysis(buildWeeklyAnalysisCacheKey({ date: day.date, day, username })))
      .map((day) => day.date),
  );
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
    availableAnalysisDays: [...availableAnalysisDays].filter(Boolean),
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
      blitz: summarizeTimeClass(weekDays, "blitz"),
      rapid: summarizeTimeClass(weekDays, "rapid"),
    },
    topCriticalMoves,
    weekKey,
    worstDay: dailyNetChanges.length > 0 ? [...dailyNetChanges].sort((left, right) => left.netChange - right.netChange)[0] : null,
  };
}

