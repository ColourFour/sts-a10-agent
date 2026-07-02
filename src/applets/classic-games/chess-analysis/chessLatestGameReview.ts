import type { ExtractedGameMovePosition } from "./chessPgnPositionExtraction";
import { extractGameMovePositions } from "./chessPgnPositionExtraction";
import type { PersonalChessGame } from "./chessPersonalTypes";
import type { EngineEvaluation } from "./chessReportTypes";
import type { SelectedDayAnalysisProgress, SelectedDayAnalysisSettings } from "./chessSelectedDayAnalysis";
import type { ChessStockfishEngine, StockfishTopMove } from "./chessStockfishEngine";

export type LatestGameMoveGrade = "best" | "blunder" | "good" | "mistake" | "neutral";

export type LatestGameReviewSettings = {
  depth: number;
  lineCount: number;
  moveTimeMs: number;
};

export type LatestGameReviewMove = ExtractedGameMovePosition & {
  bestMove: string;
  centipawnLoss: number;
  evalAfter: EngineEvaluation;
  evalBefore: EngineEvaluation;
  grade: LatestGameMoveGrade;
  topLines: StockfishTopMove[];
};

export type LatestGameReviewReport = {
  cacheKey: string;
  completedAt: string;
  gameId: string;
  gameUrl: string;
  incomplete: boolean;
  moves: LatestGameReviewMove[];
  settings: LatestGameReviewSettings;
  skippedMoves: {
    moveNumber: number;
    playedMove: string;
    ply: number;
    reason: string;
  }[];
  source: "stockfish-lite-single";
};

const latestGameReviewCachePrefix = "sts2.blakeChessTrainer.latestGameReview.v1";
const mateCentipawn = 100000;

function canUseLocalStorage(): boolean {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

function clampWholeNumber(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.round(value)));
}

export function normalizeLatestGameReviewSettings(settings: SelectedDayAnalysisSettings): LatestGameReviewSettings {
  return {
    depth: clampWholeNumber(settings.depth, 1, 18, 10),
    lineCount: 5,
    moveTimeMs: clampWholeNumber(settings.moveTimeMs, 100, 3000, 400),
  };
}

function cacheSegment(value: string): string {
  return value.replace(/[^a-z0-9_-]+/gi, "_").slice(0, 160) || "game";
}

export function buildLatestGameReviewCacheKey({
  game,
  settings,
}: {
  game: PersonalChessGame;
  settings: LatestGameReviewSettings;
}): string {
  return [
    latestGameReviewCachePrefix,
    cacheSegment(game.gameId || game.gameUrl),
    `t${game.endTimestamp}`,
    `d${settings.depth}`,
    `m${settings.moveTimeMs}`,
    `l${settings.lineCount}`,
  ].join(".");
}

export function readCachedLatestGameReview(cacheKey: string): LatestGameReviewReport | null {
  if (!canUseLocalStorage()) {
    return null;
  }

  try {
    const value = window.localStorage.getItem(cacheKey);
    return value ? (JSON.parse(value) as LatestGameReviewReport) : null;
  } catch {
    return null;
  }
}

export function writeCachedLatestGameReview(cacheKey: string, report: LatestGameReviewReport): void {
  if (!canUseLocalStorage()) {
    return;
  }

  try {
    window.localStorage.setItem(cacheKey, JSON.stringify(report));
  } catch {
    // The latest-game review is useful but can be recomputed if storage is full.
  }
}

function sameMove(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

export function classifyLatestGameMoveGrade({
  bestMove,
  centipawnLoss,
  playedMoveUci,
}: {
  bestMove: string;
  centipawnLoss: number;
  playedMoveUci: string;
}): LatestGameMoveGrade {
  if (bestMove && sameMove(bestMove, playedMoveUci)) {
    return "best";
  }

  if (centipawnLoss <= 20) {
    return "best";
  }

  if (centipawnLoss <= 75) {
    return "good";
  }

  if (centipawnLoss <= 175) {
    return "neutral";
  }

  if (centipawnLoss <= 500) {
    return "mistake";
  }

  return "blunder";
}

function evaluationToCentipawns(evaluation: EngineEvaluation): number {
  return evaluation.type === "mate" ? Math.sign(evaluation.value || 1) * mateCentipawn : evaluation.value;
}

function evaluationFromMoverPerspective(evaluation: EngineEvaluation, afterMove = false): EngineEvaluation {
  if (!afterMove) {
    return evaluation;
  }

  return {
    type: evaluation.type,
    value: -evaluation.value,
  };
}

function progressMoveLabel(position: ExtractedGameMovePosition): string {
  return `${position.moveNumber}${position.sideToMove === "black" ? "..." : "."} ${position.playedMove}`;
}

export async function analyzeLatestGameReview({
  engine,
  game,
  onProgress,
  settings,
  signal,
}: {
  engine: ChessStockfishEngine;
  game: PersonalChessGame;
  onProgress?: (progress: SelectedDayAnalysisProgress) => void;
  settings: LatestGameReviewSettings;
  signal?: AbortSignal;
}): Promise<LatestGameReviewReport> {
  const cacheKey = buildLatestGameReviewCacheKey({ game, settings });
  const positions = extractGameMovePositions(game);
  const moves: LatestGameReviewMove[] = [];
  const skippedMoves: LatestGameReviewReport["skippedMoves"] = [];

  if (positions.length === 0) {
    return {
      cacheKey,
      completedAt: new Date().toISOString(),
      gameId: game.gameId,
      gameUrl: game.gameUrl,
      incomplete: true,
      moves,
      settings,
      skippedMoves,
      source: "stockfish-lite-single",
    };
  }

  onProgress?.({ current: 0, message: "Initializing latest-game review.", total: positions.length });
  await engine.initialize();

  for (const [index, position] of positions.entries()) {
    if (signal?.aborted) {
      break;
    }

    onProgress?.({
      current: index,
      message: `Analyzing ${progressMoveLabel(position)}.`,
      total: positions.length,
    });

    try {
      const topLines = await engine.analyzeTopMoves(position.fenBefore, {
        depth: settings.depth,
        lineCount: settings.lineCount,
        moveTimeMs: settings.moveTimeMs,
        signal,
      });
      const after = await engine.analyzeFen(position.fenAfter, {
        depth: settings.depth,
        moveTimeMs: settings.moveTimeMs,
        signal,
      });
      const bestMove = topLines[0]?.move ?? "";
      const evalBefore = evaluationFromMoverPerspective(topLines[0].evaluation);
      const evalAfter = evaluationFromMoverPerspective(after.evaluation, true);
      const centipawnLoss = Math.max(0, evaluationToCentipawns(evalBefore) - evaluationToCentipawns(evalAfter));

      moves.push({
        ...position,
        bestMove,
        centipawnLoss,
        evalAfter,
        evalBefore,
        grade: classifyLatestGameMoveGrade({
          bestMove,
          centipawnLoss,
          playedMoveUci: position.playedMoveUci,
        }),
        topLines,
      });
    } catch (error) {
      if (signal?.aborted) {
        break;
      }

      skippedMoves.push({
        moveNumber: position.moveNumber,
        playedMove: position.playedMove,
        ply: position.ply,
        reason: error instanceof Error ? error.message : "Could not analyze move.",
      });
    }
  }

  const report: LatestGameReviewReport = {
    cacheKey,
    completedAt: new Date().toISOString(),
    gameId: game.gameId,
    gameUrl: game.gameUrl,
    incomplete: Boolean(signal?.aborted) || skippedMoves.length > 0 || moves.length < positions.length,
    moves,
    settings,
    skippedMoves,
    source: "stockfish-lite-single",
  };

  if (!signal?.aborted) {
    writeCachedLatestGameReview(cacheKey, report);
  }

  onProgress?.({
    current: positions.length,
    message: signal?.aborted ? "Latest-game review stopped." : "Latest-game review complete.",
    total: positions.length,
  });

  return report;
}
