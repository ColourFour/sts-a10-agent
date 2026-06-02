import type {
  CriticalMoveAnalysis,
  DailyEngineAnalysisReport,
  EngineEvaluation,
  ExtractedMovePosition,
  HomeworkPuzzleCandidate,
  NormalizedChessGame,
} from "./chessReportTypes";
import type { ChessStockfishEngine } from "./chessStockfishEngine";
import { extractPlayerMovePositions } from "./chessPgnPositionExtraction";

export type SelectedDayAnalysisSettings = {
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
  maxGames: 3,
  maxMoves: 18,
  moveTimeMs: 400,
};

const cachePrefix = "sts2.chessComAnalysis.stockfish.v2";
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
  if (criticalMove.mateSwing !== null) {
    return "Find the best move. The played move changed the mating outlook in low-depth browser analysis.";
  }

  return `Find the best move. The played move lost about ${Math.round(criticalMove.centipawnLoss)} centipawns in low-depth browser analysis.`;
}

function createHomeworkPuzzle(criticalMove: CriticalMoveAnalysis): HomeworkPuzzleCandidate {
  return {
    bestMove: criticalMove.bestMove,
    centipawnLoss: criticalMove.centipawnLoss,
    explanation: explainPuzzle(criticalMove),
    fen: criticalMove.fenBefore,
    gameUrl: criticalMove.gameUrl,
    playedMove: criticalMove.playedMove,
    sideToMove: criticalMove.sideToMove,
  };
}

function normalizeSettings(settings: Partial<SelectedDayAnalysisSettings> = {}): SelectedDayAnalysisSettings {
  return {
    maxGames: settings.maxGames ?? defaultSelectedDayAnalysisSettings.maxGames,
    maxMoves: settings.maxMoves ?? defaultSelectedDayAnalysisSettings.maxMoves,
    moveTimeMs: settings.moveTimeMs ?? defaultSelectedDayAnalysisSettings.moveTimeMs,
  };
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
    `t${settings.moveTimeMs}`,
    gameUrls.join("|"),
  ].join(".");
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
    onProgress?.({ current: cached.criticalMoves.length, message: "Loaded cached analysis.", total: cached.criticalMoves.length });
    return cached;
  }

  const skippedGames: DailyEngineAnalysisReport["skippedGames"] = [];
  const candidates: ExtractedMovePosition[] = [];
  for (const game of selectedGames) {
    try {
      candidates.push(...extractPlayerMovePositions(game));
    } catch (error) {
      skippedGames.push({
        gameUrl: game.gameUrl,
        reason: error instanceof Error ? error.message : "Could not parse PGN.",
      });
    }
  }

  const selectedCandidates = candidates.slice(0, normalizedSettings.maxMoves);
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
        moveTimeMs: normalizedSettings.moveTimeMs,
        signal,
      });
      const after = await engine.analyzeFen(candidate.fenAfter, {
        moveTimeMs: normalizedSettings.moveTimeMs,
        signal,
      });
      const evalBeforeFromPlayer = evaluationFromPlayerPerspective(before.evaluation);
      const evalAfterFromPlayer = evaluationFromPlayerPerspective(after.evaluation, true);
      const evalBefore = evaluationToPlayerCentipawns(evalBeforeFromPlayer);
      const evalAfter = evaluationToPlayerCentipawns(evalAfterFromPlayer);
      const centipawnLoss = Math.max(0, evalBefore - evalAfter);

      criticalMoves.push({
        ...candidate,
        bestMove: before.bestMove,
        centipawnLoss,
        evalAfter: evalAfterFromPlayer,
        evalBefore: evalBeforeFromPlayer,
        mateSwing: mateSwing(evalBeforeFromPlayer, evalAfterFromPlayer),
      });
    } catch (error) {
      if (signal?.aborted) {
        break;
      }

      skippedGames.push({
        gameUrl: candidate.gameUrl,
        reason: error instanceof Error ? error.message : "Could not analyze position.",
      });
    }
  }

  const rankedCriticalMoves = rankCriticalMoves(criticalMoves).slice(0, 5);
  const report: DailyEngineAnalysisReport = {
    analyzedGameUrls: selectedGames.map((game) => game.gameUrl),
    cacheKey,
    completedAt: new Date().toISOString(),
    criticalMoves: rankedCriticalMoves,
    homeworkPuzzles: rankedCriticalMoves.map(createHomeworkPuzzle),
    incomplete: Boolean(signal?.aborted) || skippedGames.length > 0 || selectedCandidates.length === 0,
    settings: normalizedSettings,
    skippedGames,
    source: "stockfish-lite-single",
  };

  if (!signal?.aborted && report.criticalMoves.length > 0) {
    writeCachedDailyAnalysis(cacheKey, report);
  }

  onProgress?.({
    current: selectedCandidates.length,
    message: signal?.aborted ? "Analysis stopped." : "Analysis complete.",
    total: selectedCandidates.length,
  });
  return report;
}
