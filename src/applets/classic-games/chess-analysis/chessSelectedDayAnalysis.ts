import type {
  CriticalMoveAnalysis,
  DailyAnalysisStatus,
  DailyEngineAnalysisReport,
  EngineEvaluation,
  ExtractedMovePosition,
  GameAnalysisStatus,
  HomeworkPuzzleCandidate,
  MoveImpactClassification,
  NormalizedChessGame,
} from "./chessReportTypes";
import type { ChessStockfishEngine } from "./chessStockfishEngine";
import { extractPlayerMovePositions } from "./chessPgnPositionExtraction";

export type SelectedDayAnalysisSettings = {
  depth: number;
  maxGames: number;
  maxMoves: number;
  moveTimeMs: number;
};

export type SelectedDayAnalysisProgress = {
  current: number;
  message: string;
  total: number;
};

export const defaultSelectedDayAnalysisSettings: SelectedDayAnalysisSettings = {
  depth: 10,
  maxGames: 3,
  maxMoves: 18,
  moveTimeMs: 400,
};

const cachePrefix = "sts2.chessComAnalysis.stockfish.v3";
const mateCentipawn = 100000;

function canUseLocalStorage(): boolean {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

function evaluationToPlayerCentipawns(evaluation: EngineEvaluation, isOpponentTurn = false): number {
  const rawValue = evaluation.type === "mate" ? Math.sign(evaluation.value || 1) * mateCentipawn : evaluation.value;
  return isOpponentTurn ? -rawValue : rawValue;
}

function evaluationFromPlayerPerspective(evaluation: EngineEvaluation, isOpponentTurn = false): EngineEvaluation {
  if (!isOpponentTurn) {
    return evaluation;
  }

  return {
    type: evaluation.type,
    value: -evaluation.value,
  };
}

function mateSwing(before: EngineEvaluation, after: EngineEvaluation): number | null {
  if (before.type !== "mate" && after.type !== "mate") {
    return null;
  }

  return evaluationToPlayerCentipawns(before) - evaluationToPlayerCentipawns(after);
}

function explainPuzzle(criticalMove: CriticalMoveAnalysis): string {
  if (criticalMove.impact.theme === "missed mate") {
    return "Find the forcing move. Browser Stockfish saw a mating swing before the played move.";
  }

  if (criticalMove.impact.theme === "missed win") {
    return "Find the move that keeps the winning advantage. The played move gave back a large part of the edge.";
  }

  return `Find the best move. ${criticalMove.impact.label} in browser Stockfish analysis, about ${Math.round(criticalMove.centipawnLoss)} centipawns.`;
}

function createHomeworkPuzzle(criticalMove: CriticalMoveAnalysis): HomeworkPuzzleCandidate {
  return {
    bestMove: criticalMove.bestMove,
    centipawnLoss: criticalMove.centipawnLoss,
    explanation: explainPuzzle(criticalMove),
    fen: criticalMove.fenBefore,
    gameUrl: criticalMove.gameUrl,
    impact: criticalMove.impact,
    playedMove: criticalMove.playedMove,
    sideToMove: criticalMove.sideToMove,
  };
}

function normalizeSettings(settings: Partial<SelectedDayAnalysisSettings> = {}): SelectedDayAnalysisSettings {
  return {
    depth: clampWholeNumber(settings.depth, 1, 18, defaultSelectedDayAnalysisSettings.depth),
    maxGames: clampWholeNumber(settings.maxGames, 1, 8, defaultSelectedDayAnalysisSettings.maxGames),
    maxMoves: clampWholeNumber(settings.maxMoves, 1, 60, defaultSelectedDayAnalysisSettings.maxMoves),
    moveTimeMs: clampWholeNumber(settings.moveTimeMs, 100, 3000, defaultSelectedDayAnalysisSettings.moveTimeMs),
  };
}

function clampWholeNumber(value: number | undefined, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.round(value ?? fallback)));
}

export function classifyMoveImpact({
  centipawnLoss,
  evalAfter,
  evalBefore,
  mateSwing,
}: {
  centipawnLoss: number;
  evalAfter: EngineEvaluation;
  evalBefore: EngineEvaluation;
  mateSwing: number | null;
}): MoveImpactClassification {
  if (mateSwing !== null && mateSwing > 0) {
    return {
      label: "Missed mate or mating defense",
      severity: "mate",
      theme: "missed mate",
    };
  }

  const beforeCp = evaluationToPlayerCentipawns(evalBefore);
  const afterCp = evaluationToPlayerCentipawns(evalAfter);
  if (beforeCp >= 300 && afterCp < 150 && centipawnLoss >= 150) {
    return {
      label: "Missed winning advantage",
      severity: centipawnLoss >= 300 ? "major" : "mistake",
      theme: "missed win",
    };
  }

  if (centipawnLoss >= 600) {
    return { label: "Blunder", severity: "blunder", theme: "blunder" };
  }

  if (centipawnLoss >= 300) {
    return { label: "Major evaluation loss", severity: "major", theme: "major eval loss" };
  }

  if (centipawnLoss >= 150) {
    return { label: "Mistake", severity: "mistake", theme: "missed best move" };
  }

  if (centipawnLoss >= 75) {
    return { label: "Inaccuracy", severity: "inaccuracy", theme: "missed best move" };
  }

  return { label: "Small improvement", severity: "minor", theme: "small improvement" };
}

export function buildAnalysisCacheKey({
  date,
  gameUrls,
  settings,
  username,
}: {
  date: string;
  gameUrls: string[];
  settings: SelectedDayAnalysisSettings;
  username: string;
}): string {
  return [
    cachePrefix,
    username.trim().toLowerCase(),
    date,
    `g${settings.maxGames}`,
    `m${settings.maxMoves}`,
    `d${settings.depth}`,
    `t${settings.moveTimeMs}`,
    gameUrls.join("|"),
  ].join(".");
}

export function buildDayAnalysisCacheKey({
  date,
  games,
  settings,
  username,
}: {
  date: string;
  games: NormalizedChessGame[];
  settings: SelectedDayAnalysisSettings;
  username: string;
}): string {
  const normalizedSettings = normalizeSettings(settings);
  return buildAnalysisCacheKey({
    date,
    gameUrls: games.slice(0, normalizedSettings.maxGames).map((game) => game.gameUrl),
    settings: normalizedSettings,
    username,
  });
}

function buildAnalysisStatusKey(cacheKey: string): string {
  return `${cacheKey}.status`;
}

export function readCachedDailyAnalysis(cacheKey: string): DailyEngineAnalysisReport | null {
  if (!canUseLocalStorage()) {
    return null;
  }

  try {
    const value = window.localStorage.getItem(cacheKey);
    return value ? (JSON.parse(value) as DailyEngineAnalysisReport) : null;
  } catch {
    return null;
  }
}

export function writeCachedDailyAnalysis(cacheKey: string, report: DailyEngineAnalysisReport): void {
  if (!canUseLocalStorage()) {
    return;
  }

  try {
    window.localStorage.setItem(cacheKey, JSON.stringify(report));
  } catch {
    // Analysis cache is helpful but not required.
  }
}

function countAnalyzedMoves(report: DailyEngineAnalysisReport): number {
  return report.gameStatuses.reduce((total, gameStatus) => total + gameStatus.analyzedMoveCount, 0);
}

function statusFromReport(report: DailyEngineAnalysisReport, gameCount: number): DailyAnalysisStatus {
  return {
    analyzedGameCount: report.analyzedGameUrls.length,
    analyzedMoveCount: countAnalyzedMoves(report),
    cacheKey: report.cacheKey,
    criticalMoveCount: report.criticalMoves.length,
    date: report.completedAt.slice(0, 10),
    gameCount,
    lastAnalyzedAt: report.completedAt,
    reason: report.incomplete ? "Analysis is incomplete. Some games, moves, or positions were skipped." : undefined,
    settings: report.settings,
    status: report.incomplete ? "cached_partial" : "cached_complete",
  };
}

export function readStoredDailyAnalysisStatus(cacheKey: string): DailyAnalysisStatus | null {
  if (!canUseLocalStorage()) {
    return null;
  }

  try {
    const value = window.localStorage.getItem(buildAnalysisStatusKey(cacheKey));
    return value ? (JSON.parse(value) as DailyAnalysisStatus) : null;
  } catch {
    return null;
  }
}

export function writeDailyAnalysisStatus(cacheKey: string, status: DailyAnalysisStatus): void {
  if (!canUseLocalStorage()) {
    return;
  }

  try {
    window.localStorage.setItem(buildAnalysisStatusKey(cacheKey), JSON.stringify(status));
  } catch {
    // Analysis status is helpful but not required.
  }
}

export function summarizeCachedAnalysisStatus({
  date,
  games,
  settings,
  username,
}: {
  date: string;
  games: NormalizedChessGame[];
  settings: SelectedDayAnalysisSettings;
  username: string;
}): DailyAnalysisStatus {
  const normalizedSettings = normalizeSettings(settings);
  const cacheKey = buildDayAnalysisCacheKey({ date, games, settings: normalizedSettings, username });
  if (games.length === 0) {
    return {
      analyzedGameCount: 0,
      analyzedMoveCount: 0,
      cacheKey,
      criticalMoveCount: 0,
      date,
      gameCount: 0,
      lastAnalyzedAt: null,
      reason: "No games for the selected time control.",
      settings: normalizedSettings,
      status: "skipped_no_games",
    };
  }

  const cached = readCachedDailyAnalysis(cacheKey);
  if (cached) {
    const status = {
      ...statusFromReport(cached, games.length),
      date,
    };
    writeDailyAnalysisStatus(cacheKey, status);
    return status;
  }

  const stored = readStoredDailyAnalysisStatus(cacheKey);
  if (stored) {
    return {
      ...stored,
      date,
      gameCount: games.length,
    };
  }

  return {
    analyzedGameCount: 0,
    analyzedMoveCount: 0,
    cacheKey,
    criticalMoveCount: 0,
    date,
    gameCount: games.length,
    lastAnalyzedAt: null,
    settings: normalizedSettings,
    status: "not_analyzed",
  };
}

export function writeFailedDailyAnalysisStatus({
  date,
  games,
  reason,
  settings,
  username,
}: {
  date: string;
  games: NormalizedChessGame[];
  reason: string;
  settings: SelectedDayAnalysisSettings;
  username: string;
}): void {
  const normalizedSettings = normalizeSettings(settings);
  const cacheKey = buildDayAnalysisCacheKey({ date, games, settings: normalizedSettings, username });
  writeDailyAnalysisStatus(cacheKey, {
    analyzedGameCount: 0,
    analyzedMoveCount: 0,
    cacheKey,
    criticalMoveCount: 0,
    date,
    gameCount: games.length,
    lastAnalyzedAt: new Date().toISOString(),
    reason,
    settings: normalizedSettings,
    status: "failed",
  });
}

export function rankCriticalMoves(moves: CriticalMoveAnalysis[]): CriticalMoveAnalysis[] {
  return [...moves].sort((left, right) => right.centipawnLoss - left.centipawnLoss);
}

export async function analyzeSelectedDayGames({
  date,
  engine,
  games,
  onProgress,
  settings,
  signal,
  username,
}: {
  date: string;
  engine: ChessStockfishEngine;
  games: NormalizedChessGame[];
  onProgress?: (progress: SelectedDayAnalysisProgress) => void;
  settings?: Partial<SelectedDayAnalysisSettings>;
  signal?: AbortSignal;
  username: string;
}): Promise<DailyEngineAnalysisReport> {
  const normalizedSettings = normalizeSettings(settings);
  const selectedGames = games.slice(0, normalizedSettings.maxGames);
  const cacheKey = buildAnalysisCacheKey({
    date,
    gameUrls: selectedGames.map((game) => game.gameUrl),
    settings: normalizedSettings,
    username,
  });
  const cached = readCachedDailyAnalysis(cacheKey);
  if (cached) {
    writeDailyAnalysisStatus(cacheKey, {
      ...statusFromReport(cached, selectedGames.length),
      date,
    });
    onProgress?.({ current: cached.criticalMoves.length, message: "Loaded cached analysis.", total: cached.criticalMoves.length });
    return cached;
  }

  writeDailyAnalysisStatus(cacheKey, {
    analyzedGameCount: 0,
    analyzedMoveCount: 0,
    cacheKey,
    criticalMoveCount: 0,
    date,
    gameCount: selectedGames.length,
    lastAnalyzedAt: null,
    settings: normalizedSettings,
    status: "in_progress",
  });

  const skippedGames: DailyEngineAnalysisReport["skippedGames"] = [];
  const candidates: ExtractedMovePosition[] = [];
  const extractionCounts = new Map<string, number>();
  const analysisCounts = new Map<string, number>();
  const criticalCounts = new Map<string, number>();
  const statusReasons = new Map<string, string>();
  for (const game of selectedGames) {
    try {
      const positions = extractPlayerMovePositions(game);
      extractionCounts.set(game.gameUrl, positions.length);
      candidates.push(...positions);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Could not parse PGN.";
      statusReasons.set(game.gameUrl, reason);
      skippedGames.push({
        gameUrl: game.gameUrl,
        reason,
      });
    }
  }

  const selectedCandidates = candidates.slice(0, normalizedSettings.maxMoves);
  const selectedCandidateCounts = selectedCandidates.reduce((counts, candidate) => {
    counts.set(candidate.gameUrl, (counts.get(candidate.gameUrl) ?? 0) + 1);
    return counts;
  }, new Map<string, number>());
  const criticalMoves: CriticalMoveAnalysis[] = [];
  onProgress?.({ current: 0, message: "Initializing Stockfish.", total: selectedCandidates.length });
  await engine.initialize();

  for (const [index, candidate] of selectedCandidates.entries()) {
    if (signal?.aborted) {
      break;
    }

    onProgress?.({
      current: index,
      message: `Analyzing ${candidate.playedMove} from move ${candidate.moveNumber}.`,
      total: selectedCandidates.length,
    });

    try {
      const before = await engine.analyzeFen(candidate.fenBefore, {
        depth: normalizedSettings.depth,
        moveTimeMs: normalizedSettings.moveTimeMs,
        signal,
      });
      const after = await engine.analyzeFen(candidate.fenAfter, {
        depth: normalizedSettings.depth,
        moveTimeMs: normalizedSettings.moveTimeMs,
        signal,
      });
      const evalBeforeFromPlayer = evaluationFromPlayerPerspective(before.evaluation);
      const evalAfterFromPlayer = evaluationFromPlayerPerspective(after.evaluation, true);
      const evalBefore = evaluationToPlayerCentipawns(evalBeforeFromPlayer);
      const evalAfter = evaluationToPlayerCentipawns(evalAfterFromPlayer);
      const centipawnLoss = Math.max(0, evalBefore - evalAfter);
      const moveMateSwing = mateSwing(evalBeforeFromPlayer, evalAfterFromPlayer);
      const impact = classifyMoveImpact({
        centipawnLoss,
        evalAfter: evalAfterFromPlayer,
        evalBefore: evalBeforeFromPlayer,
        mateSwing: moveMateSwing,
      });
      analysisCounts.set(candidate.gameUrl, (analysisCounts.get(candidate.gameUrl) ?? 0) + 1);
      if (impact.severity !== "minor") {
        criticalCounts.set(candidate.gameUrl, (criticalCounts.get(candidate.gameUrl) ?? 0) + 1);
      }

      criticalMoves.push({
        ...candidate,
        bestMove: before.bestMove,
        centipawnLoss,
        evalAfter: evalAfterFromPlayer,
        evalBefore: evalBeforeFromPlayer,
        impact,
        mateSwing: moveMateSwing,
      });
    } catch (error) {
      if (signal?.aborted) {
        statusReasons.set(candidate.gameUrl, "Analysis stopped.");
        break;
      }

      const reason = error instanceof Error ? error.message : "Could not analyze position.";
      statusReasons.set(candidate.gameUrl, reason);
      skippedGames.push({
        gameUrl: candidate.gameUrl,
        reason,
      });
    }
  }

  const rankedCriticalMoves = rankCriticalMoves(criticalMoves)
    .filter((move) => move.impact.severity !== "minor")
    .slice(0, 5);
  const gameStatuses: GameAnalysisStatus[] = selectedGames.map((game) => {
    const candidateMoveCount = selectedCandidateCounts.get(game.gameUrl) ?? 0;
    const extractedMoveCount = extractionCounts.get(game.gameUrl) ?? 0;
    const analyzedMoveCount = analysisCounts.get(game.gameUrl) ?? 0;
    const criticalMoveCount = criticalCounts.get(game.gameUrl) ?? 0;
    const reason = statusReasons.get(game.gameUrl);
    let status: GameAnalysisStatus["status"] = "analyzed";

    if (candidateMoveCount === 0 || analyzedMoveCount === 0) {
      status = "skipped";
    } else if (analyzedMoveCount < candidateMoveCount || reason) {
      status = "partial";
    }

    return {
      analyzedMoveCount,
      candidateMoveCount,
      criticalMoveCount,
      gameUrl: game.gameUrl,
      reason:
        reason ??
        (candidateMoveCount === 0 && extractedMoveCount > 0
          ? "Move cap reached before this game."
          : candidateMoveCount === 0
            ? "No tracked player moves found."
            : undefined),
      status,
    };
  });
  const report: DailyEngineAnalysisReport = {
    analyzedGameUrls: selectedGames.map((game) => game.gameUrl),
    cacheKey,
    completedAt: new Date().toISOString(),
    criticalMoves: rankedCriticalMoves,
    gameStatuses,
    homeworkPuzzles: rankedCriticalMoves.map(createHomeworkPuzzle),
    incomplete: Boolean(signal?.aborted) || skippedGames.length > 0 || selectedCandidates.length === 0,
    settings: normalizedSettings,
    skippedGames,
    source: "stockfish-lite-single",
  };

  if (!signal?.aborted) {
    writeCachedDailyAnalysis(cacheKey, report);
    writeDailyAnalysisStatus(cacheKey, {
      ...statusFromReport(report, selectedGames.length),
      date,
    });
  }

  onProgress?.({
    current: selectedCandidates.length,
    message: signal?.aborted ? "Analysis stopped." : "Analysis complete.",
    total: selectedCandidates.length,
  });
  return report;
}
