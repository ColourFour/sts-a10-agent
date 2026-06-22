import { Chess, type Square as ChessSquare } from "chess.js";
import type { ChessPlayerColor, EngineEvaluation } from "./chessReportTypes";
import type {
  PersonalChessGame,
  PersonalChessLeakTag,
  PersonalChessMistake,
  PersonalChessTimeClass,
  PersonalDrillReview,
} from "./chessPersonalTypes";

export const leakTagLabels: Record<PersonalChessLeakTag, string> = {
  "bad-trade": "Bad trade",
  "conversion-failure": "Conversion failure",
  "endgame-technique": "Endgame technique",
  "hung-piece": "Hung piece",
  "ignored-threat": "Ignored threat",
  "king-safety": "King safety",
  "missed-tactic": "Missed tactic",
  "opening-plan-failure": "Opening plan failure",
  "tilt-game": "Tilt game",
  "time-pressure": "Time pressure",
  unknown: "Unknown",
};

export type PersonalTimeClassSummary = {
  currentRating: number | null;
  draws: number;
  firstRatingInWindow: number | null;
  gamesPlayed: number;
  lastPlayedDate: string | null;
  losses: number;
  lossRate: number;
  ratingChange90: number | null;
  scorePercent: number;
  timeClass: PersonalChessTimeClass;
  wins: number;
};

export type PersonalColorSummary = {
  color: ChessPlayerColor;
  draws: number;
  gamesPlayed: number;
  losses: number;
  lossRate: number;
  scorePercent: number;
  wins: number;
};

export type PersonalOpeningLeak = {
  averageMoveCount: number | null;
  color: ChessPlayerColor;
  commonFailurePhase: string | null;
  drillIds: string[];
  eco: string;
  gamesPlayed: number;
  losses: number;
  opening: string;
  recommendation: "Keep" | "Quarantine" | "Repair";
  sampleGameUrl: string;
  scorePercent: number;
  shortLosses: number;
};

export type PersonalVolumeBucket = {
  bullet: number;
  blitz: number;
  daily: number;
  label: string;
  other: number;
  rapid: number;
};

export type PersonalLeakReport = {
  badOpenings: PersonalOpeningLeak[];
  bulletBeforeRapidWarning: boolean;
  lossAfterLoss: {
    games: number;
    scorePercent: number;
  };
  repeatedLossColor: {
    color: ChessPlayerColor;
    lossRate: number;
  } | null;
  resignationLosses: number;
  shortLosses: PersonalChessGame[];
  timeouts: PersonalChessGame[];
  volumeBuckets: PersonalVolumeBucket[];
};

export type PersonalLossStreak = {
  current: number;
  max: number;
  timeClass: PersonalChessTimeClass;
};

export type PersonalSessionRules = {
  dangerPattern: string;
  maxRapidGames: number;
  noBulletBeforeRapid: boolean;
  reviewRapidLossBeforeNextRapid: boolean;
  stopAfterLosses: number;
};

export type PersonalDrillQueueItem = PersonalChessMistake & {
  dueToday: boolean;
  review: PersonalDrillReview;
  status: PersonalDrillReview["status"];
};

export type PersonalChessReport = {
  currentRatings: Partial<Record<PersonalChessTimeClass, number | null>>;
  dueDrillCount: number;
  dueDrillQueue: PersonalDrillQueueItem[];
  drillQueue: PersonalDrillQueueItem[];
  importedRange: {
    end: string | null;
    start: string | null;
  };
  leakReport: PersonalLeakReport;
  lossStreaks: PersonalLossStreak[];
  openingLeakTable: PersonalOpeningLeak[];
  rapidDeclineReport: string;
  ratingTrendSummary: string;
  recentGames: PersonalChessGame[];
  scoreByColor: PersonalColorSummary[];
  sessionGuardrails: string[];
  sessionRules: PersonalSessionRules;
  tiltSessionReport: string;
  timeClassSummaries: PersonalTimeClassSummary[];
  todaysFocus: string;
  totalGames: number;
  worstRecentTimeClass: PersonalTimeClassSummary | null;
};

const timeClassOrder: PersonalChessTimeClass[] = ["rapid", "blitz", "bullet", "daily", "other"];
const trackedFastTimeClasses: PersonalChessTimeClass[] = ["rapid", "blitz", "bullet"];
const mateCentipawn = 100000;

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number): Date {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function dateKey(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function gameDate(game: PersonalChessGame): Date {
  return new Date(game.endTimestamp * 1000);
}

function scoreForGames(games: PersonalChessGame[]): number {
  return games.reduce((total, game) => {
    if (game.normalizedResult === "win") {
      return total + 1;
    }

    if (game.normalizedResult === "draw") {
      return total + 0.5;
    }

    return total;
  }, 0);
}

function percent(value: number, total: number): number {
  if (total <= 0) {
    return 0;
  }

  return Math.round((value / total) * 100);
}

function summarizeTimeClass(games: PersonalChessGame[], timeClass: PersonalChessTimeClass): PersonalTimeClassSummary {
  const timeClassGames = games
    .filter((game) => game.timeClass === timeClass)
    .sort((left, right) => left.endTimestamp - right.endTimestamp);
  const firstRated = timeClassGames.find((game) => game.playerRatingAfterGame !== null);
  const latestRated = [...timeClassGames].reverse().find((game) => game.playerRatingAfterGame !== null);
  const firstRating = firstRated?.playerRatingAfterGame ?? null;
  const latestRating = latestRated?.playerRatingAfterGame ?? null;
  const losses = timeClassGames.filter((game) => game.normalizedResult === "loss").length;
  const wins = timeClassGames.filter((game) => game.normalizedResult === "win").length;
  const draws = timeClassGames.filter((game) => game.normalizedResult === "draw").length;

  return {
    currentRating: latestRating,
    draws,
    firstRatingInWindow: firstRating,
    gamesPlayed: timeClassGames.length,
    lastPlayedDate: timeClassGames.at(-1)?.endDate ?? null,
    losses,
    lossRate: percent(losses, timeClassGames.length),
    ratingChange90: firstRating === null || latestRating === null ? null : latestRating - firstRating,
    scorePercent: percent(scoreForGames(timeClassGames), timeClassGames.length),
    timeClass,
    wins,
  };
}

function summarizeColor(games: PersonalChessGame[], color: ChessPlayerColor): PersonalColorSummary {
  const colorGames = games.filter((game) => game.playerColor === color);
  const losses = colorGames.filter((game) => game.normalizedResult === "loss").length;
  const wins = colorGames.filter((game) => game.normalizedResult === "win").length;
  const draws = colorGames.filter((game) => game.normalizedResult === "draw").length;

  return {
    color,
    draws,
    gamesPlayed: colorGames.length,
    losses,
    lossRate: percent(losses, colorGames.length),
    scorePercent: percent(scoreForGames(colorGames), colorGames.length),
    wins,
  };
}

function openingKey(game: PersonalChessGame): string {
  return `${game.playerColor}|${game.eco ?? "No ECO"}|${game.opening ?? "Unknown opening"}`;
}

function failurePhase(game: PersonalChessGame): string | null {
  if (game.normalizedResult !== "loss" || game.moveCount === null) {
    return null;
  }

  if (game.moveCount <= 16) {
    return "Opening";
  }

  if (game.moveCount <= 32) {
    return "Middlegame";
  }

  return "Endgame";
}

function mostCommonFailurePhase(games: PersonalChessGame[]): string | null {
  const phaseCounts = games.reduce((counts, game) => {
    const phase = failurePhase(game);
    if (phase) {
      counts.set(phase, (counts.get(phase) ?? 0) + 1);
    }
    return counts;
  }, new Map<string, number>());

  return [...phaseCounts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? null;
}

function openingRecommendation({
  gamesPlayed,
  losses,
  scorePercent,
  shortLosses,
}: {
  gamesPlayed: number;
  losses: number;
  scorePercent: number;
  shortLosses: number;
}): PersonalOpeningLeak["recommendation"] {
  if (gamesPlayed >= 2 && losses >= 2 && (scorePercent <= 25 || shortLosses >= 2)) {
    return "Quarantine";
  }

  if (scorePercent < 50 || losses / Math.max(1, gamesPlayed) >= 0.5 || shortLosses > 0) {
    return "Repair";
  }

  return "Keep";
}

function buildOpeningLeaks(games: PersonalChessGame[], mistakes: PersonalChessMistake[]): PersonalOpeningLeak[] {
  const groups = new Map<string, PersonalChessGame[]>();

  for (const game of games) {
    if (!trackedFastTimeClasses.includes(game.timeClass)) {
      continue;
    }

    const key = openingKey(game);
    groups.set(key, [...(groups.get(key) ?? []), game]);
  }

  return [...groups.values()]
    .filter((groupGames) => groupGames.length >= 2)
    .map((groupGames) => {
      const firstGame = groupGames[0];
      const losses = groupGames.filter((game) => game.normalizedResult === "loss").length;
      const scorePercent = percent(scoreForGames(groupGames), groupGames.length);
      const shortLosses = groupGames.filter((game) => game.normalizedResult === "loss" && (game.moveCount ?? 99) < 25).length;
      const gameUrls = new Set(groupGames.map((game) => game.gameUrl));
      const drillIds = mistakes.filter((mistake) => gameUrls.has(mistake.gameUrl)).map((mistake) => mistake.id);
      const moveCounts = groupGames
        .map((game) => game.moveCount)
        .filter((moveCount): moveCount is number => moveCount !== null);
      const averageMoveCount =
        moveCounts.length > 0
          ? Math.round(moveCounts.reduce((total, moveCount) => total + moveCount, 0) / moveCounts.length)
          : null;

      return {
        averageMoveCount,
        color: firstGame.playerColor,
        commonFailurePhase: mostCommonFailurePhase(groupGames),
        drillIds,
        eco: firstGame.eco ?? "No ECO",
        gamesPlayed: groupGames.length,
        losses,
        opening: firstGame.opening ?? "Unknown opening",
        recommendation: openingRecommendation({
          gamesPlayed: groupGames.length,
          losses,
          scorePercent,
          shortLosses,
        }),
        sampleGameUrl: groupGames.find((game) => game.normalizedResult === "loss")?.gameUrl ?? firstGame.gameUrl,
        scorePercent,
        shortLosses,
      };
    })
    .sort(
      (left, right) =>
        recommendationRank(left.recommendation) - recommendationRank(right.recommendation) ||
        left.scorePercent - right.scorePercent ||
        right.losses - left.losses,
    )
    .slice(0, 8);
}

function recommendationRank(recommendation: PersonalOpeningLeak["recommendation"]): number {
  if (recommendation === "Quarantine") {
    return 0;
  }

  if (recommendation === "Repair") {
    return 1;
  }

  return 2;
}

function buildLossStreaks(games: PersonalChessGame[]): PersonalLossStreak[] {
  return timeClassOrder.map((timeClass) => {
    const orderedGames = games
      .filter((game) => game.timeClass === timeClass)
      .sort((left, right) => left.endTimestamp - right.endTimestamp);
    let currentStreak = 0;
    let maxStreak = 0;

    for (const game of orderedGames) {
      if (game.normalizedResult === "loss") {
        currentStreak += 1;
        maxStreak = Math.max(maxStreak, currentStreak);
      } else {
        currentStreak = 0;
      }
    }

    return {
      current: currentStreak,
      max: maxStreak,
      timeClass,
    };
  });
}

function startOfWeekLabel(game: PersonalChessGame): string {
  const date = startOfDay(gameDate(game));
  const day = date.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + mondayOffset);
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const dayOfMonth = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${dayOfMonth}`;
}

function buildVolumeBuckets(games: PersonalChessGame[]): PersonalVolumeBucket[] {
  const buckets = new Map<string, PersonalVolumeBucket>();

  for (const game of games) {
    const label = startOfWeekLabel(game);
    const bucket =
      buckets.get(label) ??
      ({
        bullet: 0,
        blitz: 0,
        daily: 0,
        label,
        other: 0,
        rapid: 0,
      } satisfies PersonalVolumeBucket);
    bucket[game.timeClass] += 1;
    buckets.set(label, bucket);
  }

  return [...buckets.values()].sort((left, right) => right.label.localeCompare(left.label)).slice(0, 8);
}

function buildPerformanceAfterLoss(games: PersonalChessGame[]): PersonalLeakReport["lossAfterLoss"] {
  const orderedGames = games
    .filter((game) => trackedFastTimeClasses.includes(game.timeClass))
    .sort((left, right) => left.endTimestamp - right.endTimestamp);
  const afterLossGames: PersonalChessGame[] = [];

  for (let index = 1; index < orderedGames.length; index += 1) {
    if (orderedGames[index - 1].normalizedResult === "loss") {
      afterLossGames.push(orderedGames[index]);
    }
  }

  return {
    games: afterLossGames.length,
    scorePercent: percent(scoreForGames(afterLossGames), afterLossGames.length),
  };
}

function bulletBeforeRapidWarning(games: PersonalChessGame[]): boolean {
  const gamesByDate = games.reduce((groups, game) => {
    groups.set(game.endDate, [...(groups.get(game.endDate) ?? []), game]);
    return groups;
  }, new Map<string, PersonalChessGame[]>());
  const rapidAfterBullet: PersonalChessGame[] = [];
  const rapidWithoutBullet: PersonalChessGame[] = [];

  for (const dayGames of gamesByDate.values()) {
    const orderedDayGames = [...dayGames].sort((left, right) => left.endTimestamp - right.endTimestamp);
    let bulletSeen = false;
    for (const game of orderedDayGames) {
      if (game.timeClass === "bullet") {
        bulletSeen = true;
      }

      if (game.timeClass === "rapid") {
        if (bulletSeen) {
          rapidAfterBullet.push(game);
        } else {
          rapidWithoutBullet.push(game);
        }
      }
    }
  }

  if (rapidAfterBullet.length < 3 || rapidWithoutBullet.length < 3) {
    return false;
  }

  return percent(scoreForGames(rapidAfterBullet), rapidAfterBullet.length) + 15 <
    percent(scoreForGames(rapidWithoutBullet), rapidWithoutBullet.length);
}

function buildLeakReport(
  games: PersonalChessGame[],
  scoreByColor: PersonalColorSummary[],
  mistakes: PersonalChessMistake[],
): PersonalLeakReport {
  const repeatedLossColor =
    [...scoreByColor]
      .filter((summary) => summary.gamesPlayed >= 3)
      .sort((left, right) => right.losses / Math.max(1, right.gamesPlayed) - left.losses / Math.max(1, left.gamesPlayed))[0] ?? null;

  return {
    badOpenings: buildOpeningLeaks(games, mistakes),
    bulletBeforeRapidWarning: bulletBeforeRapidWarning(games),
    lossAfterLoss: buildPerformanceAfterLoss(games),
    repeatedLossColor:
      repeatedLossColor && repeatedLossColor.losses > 0
        ? {
            color: repeatedLossColor.color,
            lossRate: repeatedLossColor.lossRate,
          }
        : null,
    resignationLosses: games.filter((game) => game.result === "resigned").length,
    shortLosses: games.filter((game) => game.normalizedResult === "loss" && (game.moveCount ?? 99) < 25).slice(-8),
    timeouts: games.filter((game) => game.result === "timeout").slice(-8),
    volumeBuckets: buildVolumeBuckets(games),
  };
}

function ratingTrendSummary(summaries: PersonalTimeClassSummary[], totalGames: number): string {
  if (totalGames === 0) {
    return "No imported games yet. Sync Blake's public Chess.com archives to build the trend.";
  }

  const parts = summaries
    .filter((summary) => trackedFastTimeClasses.includes(summary.timeClass) && summary.gamesPlayed > 0)
    .map(
      (summary) =>
        `${summary.timeClass}: ${summary.currentRating ?? "n/a"} (${summary.ratingChange90 === null ? "n/a" : summary.ratingChange90 > 0 ? `+${summary.ratingChange90}` : summary.ratingChange90})`,
    );

  return parts.length > 0 ? `Last-90-day rating snapshot - ${parts.join(", ")}.` : "No rapid, blitz, or bullet games in the 90-day window.";
}

function rapidDeclineReport(summary: PersonalTimeClassSummary | undefined): string {
  if (!summary || summary.gamesPlayed === 0) {
    return "No recent rapid games are imported.";
  }

  const change = summary.ratingChange90;
  if (change === null) {
    return `Rapid has ${summary.gamesPlayed} recent game(s), but not enough rating data for a 90-day change.`;
  }

  if (change < 0) {
    return `Rapid is down ${Math.abs(change)} point(s) across ${summary.gamesPlayed} recent game(s). Review one rapid loss before playing the next rated rapid game.`;
  }

  return `Rapid is ${change === 0 ? "flat" : `up ${change} point(s)`} across ${summary.gamesPlayed} recent game(s). Keep rapid volume controlled and review losses.`;
}

function tiltSessionReport(leakReport: PersonalLeakReport): string {
  if (leakReport.lossAfterLoss.games === 0) {
    return "No post-loss sample yet.";
  }

  if (leakReport.lossAfterLoss.scorePercent < 40) {
    return `After a loss, Blake scores ${leakReport.lossAfterLoss.scorePercent}% over ${leakReport.lossAfterLoss.games} follow-up game(s). Stop rules should be active.`;
  }

  return `After a loss, Blake scores ${leakReport.lossAfterLoss.scorePercent}% over ${leakReport.lossAfterLoss.games} follow-up game(s). Keep the two-loss stop rule.`;
}

function buildTodaysFocus({
  dueDrillCount,
  leakReport,
  mistakes,
  rapidSummary,
  worstRecentTimeClass,
}: {
  dueDrillCount: number;
  leakReport: PersonalLeakReport;
  mistakes: PersonalChessMistake[];
  rapidSummary: PersonalTimeClassSummary | undefined;
  worstRecentTimeClass: PersonalTimeClassSummary | null;
}): string {
  if (dueDrillCount > 0) {
    return `${dueDrillCount} personal repair drill(s) are due before rated rapid.`;
  }

  if (mistakes[0]) {
    return `${leakTagLabels[mistakes[0].leakTag]}: solve the top personal drill before any rated rapid.`;
  }

  if ((rapidSummary?.ratingChange90 ?? 0) < -50) {
    return "Rapid repair: review the most recent rapid loss, then play no more than the session cap.";
  }

  if (leakReport.badOpenings[0]) {
    return `${leakReport.badOpenings[0].opening}: fix the lowest-scoring opening sample first.`;
  }

  if (leakReport.timeouts.length > 0) {
    return "Time pressure: review timeout losses and slow the first 15 moves.";
  }

  if (worstRecentTimeClass) {
    return `${worstRecentTimeClass.timeClass}: reduce losses before increasing game volume.`;
  }

  return "Import games, then review one rapid loss to create a personal drill.";
}

function buildSessionRules({
  leakReport,
  rapidSummary,
  todaysFocus,
}: {
  leakReport: PersonalLeakReport;
  rapidSummary: PersonalTimeClassSummary | undefined;
  todaysFocus: string;
}): PersonalSessionRules {
  const rapidChange = rapidSummary?.ratingChange90 ?? 0;

  return {
    dangerPattern: todaysFocus,
    maxRapidGames: rapidChange < -100 ? 2 : rapidChange < 0 ? 3 : 4,
    noBulletBeforeRapid: leakReport.bulletBeforeRapidWarning,
    reviewRapidLossBeforeNextRapid: rapidChange < 0 || (rapidSummary?.losses ?? 0) > 0,
    stopAfterLosses: 2,
  };
}

function buildSessionGuardrails({
  dueDrillCount,
  leakReport,
  rapidSummary,
}: {
  dueDrillCount: number;
  leakReport: PersonalLeakReport;
  rapidSummary: PersonalTimeClassSummary | undefined;
}): string[] {
  const guardrails: string[] = [];
  const latestVolume = leakReport.volumeBuckets[0] ?? null;
  const rapidChange = rapidSummary?.ratingChange90 ?? 0;

  if (dueDrillCount > 0) {
    guardrails.push("Do today's repair before rated rapid.");
  }

  if (
    rapidChange <= -50 &&
    latestVolume &&
    latestVolume.bullet + latestVolume.blitz >= Math.max(4, latestVolume.rapid * 2)
  ) {
    guardrails.push("Rapid is down sharply while fast-game volume is high. Avoid bullet or blitz before rapid.");
  } else if (leakReport.bulletBeforeRapidWarning) {
    guardrails.push("Avoid bullet before rapid today.");
  }

  return guardrails;
}

function evaluationToCentipawns(evaluation: EngineEvaluation): number {
  return evaluation.type === "mate" ? Math.sign(evaluation.value || 1) * mateCentipawn : evaluation.value;
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

  try {
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
  } catch {
    return 0;
  }
}

function moveSan(fen: string, uciMove: string): string {
  if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/i.test(uciMove)) {
    return "";
  }

  try {
    const game = new Chess(fen);
    const move = game.move({
      from: uciMove.slice(0, 2) as ChessSquare,
      promotion: uciMove[4] ?? "q",
      to: uciMove.slice(2, 4) as ChessSquare,
    });
    return move?.san ?? "";
  } catch {
    return "";
  }
}

export function classifyPersonalLeakTag({
  bestMove,
  centipawnLoss,
  evalBefore,
  fenAfter,
  fenBefore,
  game,
  moveNumber,
  playedMove,
  sideToMove,
}: {
  bestMove?: string;
  centipawnLoss?: number;
  evalBefore?: EngineEvaluation;
  fenAfter?: string;
  fenBefore?: string;
  game?: PersonalChessGame;
  moveNumber?: number;
  playedMove?: string;
  sideToMove?: ChessPlayerColor;
}): PersonalChessLeakTag {
  if (game?.result === "timeout") {
    return "time-pressure";
  }

  if (game?.result === "checkmated") {
    return "king-safety";
  }

  if (game && game.normalizedResult === "loss" && (game.moveCount ?? 99) < 18) {
    return "opening-plan-failure";
  }

  if (moveNumber !== undefined && moveNumber <= 10) {
    return "opening-plan-failure";
  }

  if (fenBefore && fenAfter && sideToMove) {
    const materialDrop = materialBalance(fenBefore, sideToMove) - materialBalance(fenAfter, sideToMove);
    if (materialDrop >= 300) {
      return "hung-piece";
    }
  }

  if (fenBefore && bestMove) {
    const bestSan = moveSan(fenBefore, bestMove);
    if (bestSan.includes("#") || bestSan.includes("+") || bestSan.includes("x")) {
      return "missed-tactic";
    }
  }

  if (playedMove?.includes("x") && (centipawnLoss ?? 0) >= 250) {
    return "bad-trade";
  }

  if ((moveNumber ?? 0) >= 35) {
    const beforeCp = evalBefore ? evaluationToCentipawns(evalBefore) : 0;
    return beforeCp >= 250 ? "conversion-failure" : "endgame-technique";
  }

  if ((centipawnLoss ?? 0) >= 600) {
    return "ignored-threat";
  }

  return "unknown";
}

export function buildPersonalChessReport({
  drillReviews = {},
  games,
  mistakes = [],
  now = new Date(),
}: {
  drillReviews?: Record<string, PersonalDrillReview>;
  games: PersonalChessGame[];
  mistakes?: PersonalChessMistake[];
  now?: Date;
}): PersonalChessReport {
  const orderedGames = [...games].sort((left, right) => left.endTimestamp - right.endTimestamp);
  const cutoffDate = addDays(startOfDay(now), -90);
  const recentGames = orderedGames.filter((game) => gameDate(game) >= cutoffDate);
  const activeWindowGames =
    recentGames.length > 0 || orderedGames.length === 0
      ? recentGames
      : orderedGames.filter((game) => gameDate(game) >= addDays(gameDate(orderedGames.at(-1)!), -90));
  const summaries = timeClassOrder.map((timeClass) => summarizeTimeClass(activeWindowGames, timeClass));
  const currentRatings = timeClassOrder.reduce<Partial<Record<PersonalChessTimeClass, number | null>>>((ratings, timeClass) => {
    ratings[timeClass] = summarizeTimeClass(orderedGames, timeClass).currentRating;
    return ratings;
  }, {});
  const scoreByColor = [summarizeColor(activeWindowGames, "white"), summarizeColor(activeWindowGames, "black")];
  const leakReport = buildLeakReport(activeWindowGames, scoreByColor, mistakes);
  const worstRecentTimeClass =
    summaries
      .filter((summary) => trackedFastTimeClasses.includes(summary.timeClass) && summary.gamesPlayed > 0)
      .sort(
        (left, right) =>
          (left.ratingChange90 ?? 0) - (right.ratingChange90 ?? 0) ||
          right.lossRate - left.lossRate,
      )[0] ?? null;
  const rapidSummary = summaries.find((summary) => summary.timeClass === "rapid");
  const today = dateKey(now);
  const statusRank: Record<PersonalDrillReview["status"], number> = {
    "needs-review": 0,
    failed: 1,
    solved: 2,
  };
  const drillItems = mistakes.map((mistake) => {
    const review =
      drillReviews[mistake.id] ??
      ({
        attempts: 0,
        correct: 0,
        incorrect: 0,
        intervalDays: 0,
        lastReviewedDate: null,
        nextDueDate: today,
        status: "needs-review",
      } satisfies PersonalDrillReview);

    return {
      ...mistake,
      dueToday: review.nextDueDate <= today,
      review,
      status: review.status,
    } satisfies PersonalDrillQueueItem;
  });
  const sortedDrillItems = drillItems.sort((left, right) => {
    const leftDueRank = left.dueToday ? 0 : 1;
    const rightDueRank = right.dueToday ? 0 : 1;
    return (
      leftDueRank - rightDueRank ||
      left.review.nextDueDate.localeCompare(right.review.nextDueDate) ||
      statusRank[left.status] - statusRank[right.status] ||
      right.centipawnLoss - left.centipawnLoss
    );
  });
  const dueDrillQueue = sortedDrillItems.filter((drill) => drill.dueToday);
  const dueDrillCount = dueDrillQueue.length;
  const todaysFocus = buildTodaysFocus({
    dueDrillCount,
    leakReport,
    mistakes,
    rapidSummary,
    worstRecentTimeClass,
  });
  const drillQueue = sortedDrillItems.slice(0, 12);
  const sessionGuardrails = buildSessionGuardrails({
    dueDrillCount,
    leakReport,
    rapidSummary,
  });

  return {
    currentRatings,
    dueDrillCount,
    dueDrillQueue,
    drillQueue,
    importedRange: {
      end: orderedGames.at(-1)?.endDate ?? null,
      start: orderedGames[0]?.endDate ?? null,
    },
    leakReport,
    lossStreaks: buildLossStreaks(activeWindowGames),
    openingLeakTable: leakReport.badOpenings,
    rapidDeclineReport: rapidDeclineReport(rapidSummary),
    ratingTrendSummary: ratingTrendSummary(summaries, orderedGames.length),
    recentGames: activeWindowGames,
    scoreByColor,
    sessionGuardrails,
    sessionRules: buildSessionRules({ leakReport, rapidSummary, todaysFocus }),
    tiltSessionReport: tiltSessionReport(leakReport),
    timeClassSummaries: summaries,
    todaysFocus,
    totalGames: orderedGames.length,
    worstRecentTimeClass,
  };
}
