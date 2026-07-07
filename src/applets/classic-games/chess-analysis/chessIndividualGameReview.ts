import type { ExtractedGameMovePosition } from "./chessPgnPositionExtraction";
import { extractGameMovePositions } from "./chessPgnPositionExtraction";
import type { PersonalChessGame } from "./chessPersonalTypes";
import type { ChessPlayerColor, EngineEvaluation } from "./chessReportTypes";
import type { SelectedDayAnalysisProgress, SelectedDayAnalysisSettings } from "./chessSelectedDayAnalysis";
import type { ChessStockfishEngine, StockfishTopMove } from "./chessStockfishEngine";

export type IndividualReviewPerspective = "account" | "black" | "both" | "white";

export type IndividualMoveClassification =
  | "best"
  | "blunder"
  | "book"
  | "brilliant"
  | "excellent"
  | "good"
  | "great"
  | "inaccuracy"
  | "miss"
  | "mistake";

export type IndividualGameReviewSettings = {
  depth: number;
  lineCount: number;
  moveTimeMs: number;
};

export type IndividualClassificationCounts = Record<IndividualMoveClassification, number>;

export type IndividualGameReviewMove = ExtractedGameMovePosition & {
  accuracy: number;
  bestMove: string;
  centipawnLoss: number;
  classification: IndividualMoveClassification;
  evalAfter: EngineEvaluation;
  evalBefore: EngineEvaluation;
  expectedPointAfter: number;
  expectedPointBefore: number;
  expectedPointLoss: number;
  sacrificedMaterialCp: number;
  topLineExpectedGap: number;
  topLines: StockfishTopMove[];
};

export type IndividualGameReviewSummary = {
  accountAccuracy: number | null;
  accountColor: ChessPlayerColor;
  blackAccuracy: number | null;
  blackCounts: IndividualClassificationCounts;
  classificationCounts: IndividualClassificationCounts;
  keyMoveCount: number;
  totalAnalyzedMoves: number;
  whiteAccuracy: number | null;
  whiteCounts: IndividualClassificationCounts;
};

export type IndividualGameReviewReport = {
  cacheKey: string;
  completedAt: string;
  gameId: string;
  gameUrl: string;
  incomplete: boolean;
  moves: IndividualGameReviewMove[];
  settings: IndividualGameReviewSettings;
  skippedMoves: {
    moveNumber: number;
    playedMove: string;
    ply: number;
    reason: string;
  }[];
  source: "stockfish-lite-single";
  summary: IndividualGameReviewSummary;
};

export const individualClassificationOrder: IndividualMoveClassification[] = [
  "brilliant",
  "great",
  "best",
  "excellent",
  "good",
  "book",
  "inaccuracy",
  "mistake",
  "miss",
  "blunder",
];

export const individualKeyClassifications = new Set<IndividualMoveClassification>([
  "blunder",
  "inaccuracy",
  "miss",
  "mistake",
]);

const reviewCachePrefix = "sts2.chessComAnalysis.individualGameReview.v1";
const mateCentipawn = 100000;
const pieceValues: Record<string, number> = {
  b: 330,
  k: 0,
  n: 320,
  p: 100,
  q: 900,
  r: 500,
};

function canUseLocalStorage(): boolean {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

function clampWholeNumber(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.round(value)));
}

export function normalizeIndividualGameReviewSettings(settings: SelectedDayAnalysisSettings): IndividualGameReviewSettings {
  return {
    depth: clampWholeNumber(settings.depth, 1, 18, 10),
    lineCount: 5,
    moveTimeMs: clampWholeNumber(settings.moveTimeMs, 100, 3000, 400),
  };
}

function cacheSegment(value: string): string {
  return value.replace(/[^a-z0-9_-]+/gi, "_").slice(0, 160) || "game";
}

export function buildIndividualGameReviewCacheKey({
  game,
  settings,
}: {
  game: PersonalChessGame;
  settings: IndividualGameReviewSettings;
}): string {
  return [
    reviewCachePrefix,
    cacheSegment(game.gameId || game.gameUrl),
    `t${game.endTimestamp}`,
    `d${settings.depth}`,
    `m${settings.moveTimeMs}`,
    `l${settings.lineCount}`,
  ].join(".");
}

export function readCachedIndividualGameReview(cacheKey: string): IndividualGameReviewReport | null {
  if (!canUseLocalStorage()) {
    return null;
  }

  try {
    const value = window.localStorage.getItem(cacheKey);
    return value ? (JSON.parse(value) as IndividualGameReviewReport) : null;
  } catch {
    return null;
  }
}

export function writeCachedIndividualGameReview(cacheKey: string, report: IndividualGameReviewReport): void {
  if (!canUseLocalStorage()) {
    return;
  }

  try {
    window.localStorage.setItem(cacheKey, JSON.stringify(report));
  } catch {
    // Single-game reviews can be recomputed if browser storage is full.
  }
}

function sameMove(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

function evaluationToCentipawns(evaluation: EngineEvaluation): number {
  return evaluation.type === "mate" ? Math.sign(evaluation.value || 1) * mateCentipawn : evaluation.value;
}

function reverseEvaluation(evaluation: EngineEvaluation): EngineEvaluation {
  return {
    type: evaluation.type,
    value: -evaluation.value,
  };
}

export function evaluationToExpectedPoints(evaluation: EngineEvaluation): number {
  if (evaluation.type === "mate") {
    return evaluation.value > 0 ? 100 : 0;
  }

  return 100 / (1 + Math.exp(-evaluation.value / 250));
}

export function expectedPointLoss(before: EngineEvaluation, after: EngineEvaluation): number {
  return Math.max(0, evaluationToExpectedPoints(before) - evaluationToExpectedPoints(after));
}

export function accuracyFromExpectedPointLoss(loss: number): number {
  if (!Number.isFinite(loss)) {
    return 0;
  }

  if (loss <= 1) {
    return 100;
  }

  return Math.max(0, Math.min(100, 100 - Math.pow(loss - 1, 0.82) * 4.35));
}

function materialBalance(fen: string, side: ChessPlayerColor): number {
  const placement = fen.split(" ")[0] ?? "";
  let total = 0;

  for (const char of placement) {
    if (char === "/") {
      continue;
    }

    if (Number.isInteger(Number(char))) {
      continue;
    }

    const value = pieceValues[char.toLowerCase()] ?? 0;
    const isWhitePiece = char === char.toUpperCase();
    const isMoverPiece = side === "white" ? isWhitePiece : !isWhitePiece;
    total += isMoverPiece ? value : -value;
  }

  return total;
}

function sacrificedMaterialCp(fenBefore: string, fenAfter: string, side: ChessPlayerColor): number {
  return Math.max(0, materialBalance(fenBefore, side) - materialBalance(fenAfter, side));
}

function topLineExpectedGap(topLines: StockfishTopMove[]): number {
  if (topLines.length < 2) {
    return 0;
  }

  return Math.max(
    0,
    evaluationToExpectedPoints(topLines[0].evaluation) - evaluationToExpectedPoints(topLines[1].evaluation),
  );
}

export function classifyIndividualMove({
  bestMove,
  centipawnLoss,
  evalAfter,
  evalBefore,
  expectedPointLoss: loss,
  playedMoveUci,
  ply,
  sacrificedMaterialCp: sacrificed,
  topLineExpectedGap: lineGap,
}: {
  bestMove: string;
  centipawnLoss: number;
  evalAfter: EngineEvaluation;
  evalBefore: EngineEvaluation;
  expectedPointLoss: number;
  playedMoveUci: string;
  ply: number;
  sacrificedMaterialCp: number;
  topLineExpectedGap: number;
}): IndividualMoveClassification {
  const isEngineMove = bestMove ? sameMove(bestMove, playedMoveUci) : false;
  const isNearBest = isEngineMove || loss <= 1.25 || centipawnLoss <= 18;
  const beforeCp = evaluationToCentipawns(evalBefore);
  const afterCp = evaluationToCentipawns(evalAfter);
  const beforeExpected = evaluationToExpectedPoints(evalBefore);
  const afterExpected = evaluationToExpectedPoints(evalAfter);

  if (ply <= 12 && loss <= 1.5 && centipawnLoss <= 18) {
    return "book";
  }

  if (isNearBest && sacrificed >= 250 && afterExpected >= 45 && centipawnLoss <= 28) {
    return "brilliant";
  }

  if (isNearBest && lineGap >= 10 && afterExpected >= beforeExpected - 2) {
    return "great";
  }

  if (isEngineMove || loss <= 1.5 || centipawnLoss <= 22) {
    return "best";
  }

  if (loss <= 3.5 || centipawnLoss <= 60) {
    return "excellent";
  }

  if (loss <= 7.5 || centipawnLoss <= 120) {
    return "good";
  }

  if ((beforeCp >= 300 && afterCp < 150 && centipawnLoss >= 150) || (beforeExpected >= 72 && afterExpected <= 60 && loss >= 15)) {
    return "miss";
  }

  if (loss >= 25 || centipawnLoss >= 450) {
    return "blunder";
  }

  if (loss >= 13 || centipawnLoss >= 220) {
    return "mistake";
  }

  return "inaccuracy";
}

function emptyClassificationCounts(): IndividualClassificationCounts {
  return individualClassificationOrder.reduce(
    (counts, classification) => ({
      ...counts,
      [classification]: 0,
    }),
    {} as IndividualClassificationCounts,
  );
}

function averageAccuracy(moves: IndividualGameReviewMove[]): number | null {
  if (moves.length === 0) {
    return null;
  }

  const total = moves.reduce((sum, move) => sum + move.accuracy, 0);
  return Math.round((total / moves.length) * 10) / 10;
}

function countsForMoves(moves: IndividualGameReviewMove[]): IndividualClassificationCounts {
  const counts = emptyClassificationCounts();
  for (const move of moves) {
    counts[move.classification] += 1;
  }
  return counts;
}

export function summarizeIndividualGameReview({
  accountColor,
  moves,
}: {
  accountColor: ChessPlayerColor;
  moves: IndividualGameReviewMove[];
}): IndividualGameReviewSummary {
  const whiteMoves = moves.filter((move) => move.sideToMove === "white");
  const blackMoves = moves.filter((move) => move.sideToMove === "black");
  const accountMoves = moves.filter((move) => move.sideToMove === accountColor);

  return {
    accountAccuracy: averageAccuracy(accountMoves),
    accountColor,
    blackAccuracy: averageAccuracy(blackMoves),
    blackCounts: countsForMoves(blackMoves),
    classificationCounts: countsForMoves(moves),
    keyMoveCount: moves.filter((move) => individualKeyClassifications.has(move.classification)).length,
    totalAnalyzedMoves: moves.length,
    whiteAccuracy: averageAccuracy(whiteMoves),
    whiteCounts: countsForMoves(whiteMoves),
  };
}

function progressMoveLabel(position: ExtractedGameMovePosition): string {
  return `${position.moveNumber}${position.sideToMove === "black" ? "..." : "."} ${position.playedMove}`;
}

export async function analyzeIndividualGameReview({
  engine,
  game,
  onProgress,
  settings,
  signal,
}: {
  engine: ChessStockfishEngine;
  game: PersonalChessGame;
  onProgress?: (progress: SelectedDayAnalysisProgress) => void;
  settings: IndividualGameReviewSettings;
  signal?: AbortSignal;
}): Promise<IndividualGameReviewReport> {
  const cacheKey = buildIndividualGameReviewCacheKey({ game, settings });
  const positions = extractGameMovePositions(game);
  const moves: IndividualGameReviewMove[] = [];
  const skippedMoves: IndividualGameReviewReport["skippedMoves"] = [];

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
      summary: summarizeIndividualGameReview({ accountColor: game.playerColor, moves }),
    };
  }

  onProgress?.({ current: 0, message: "Initializing individual game review.", total: positions.length });
  await engine.initialize();

  for (const [index, position] of positions.entries()) {
    if (signal?.aborted) {
      break;
    }

    onProgress?.({
      current: index,
      message: `Reviewing ${progressMoveLabel(position)}.`,
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
      const evalBefore = topLines[0]?.evaluation;
      const evalAfter = reverseEvaluation(after.evaluation);
      if (!evalBefore) {
        throw new Error("Stockfish did not return a top move.");
      }

      const moveCentipawnLoss = Math.max(0, evaluationToCentipawns(evalBefore) - evaluationToCentipawns(evalAfter));
      const moveExpectedPointLoss = expectedPointLoss(evalBefore, evalAfter);
      const moveSacrifice = sacrificedMaterialCp(position.fenBefore, position.fenAfter, position.sideToMove);
      const moveLineGap = topLineExpectedGap(topLines);
      const classification = classifyIndividualMove({
        bestMove,
        centipawnLoss: moveCentipawnLoss,
        evalAfter,
        evalBefore,
        expectedPointLoss: moveExpectedPointLoss,
        playedMoveUci: position.playedMoveUci,
        ply: position.ply,
        sacrificedMaterialCp: moveSacrifice,
        topLineExpectedGap: moveLineGap,
      });

      moves.push({
        ...position,
        accuracy: accuracyFromExpectedPointLoss(moveExpectedPointLoss),
        bestMove,
        centipawnLoss: moveCentipawnLoss,
        classification,
        evalAfter,
        evalBefore,
        expectedPointAfter: evaluationToExpectedPoints(evalAfter),
        expectedPointBefore: evaluationToExpectedPoints(evalBefore),
        expectedPointLoss: moveExpectedPointLoss,
        sacrificedMaterialCp: moveSacrifice,
        topLineExpectedGap: moveLineGap,
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
        reason: error instanceof Error ? error.message : "Could not review move.",
      });
    }
  }

  const report: IndividualGameReviewReport = {
    cacheKey,
    completedAt: new Date().toISOString(),
    gameId: game.gameId,
    gameUrl: game.gameUrl,
    incomplete: Boolean(signal?.aborted) || skippedMoves.length > 0 || moves.length < positions.length,
    moves,
    settings,
    skippedMoves,
    source: "stockfish-lite-single",
    summary: summarizeIndividualGameReview({ accountColor: game.playerColor, moves }),
  };

  if (!signal?.aborted) {
    writeCachedIndividualGameReview(cacheKey, report);
  }

  onProgress?.({
    current: positions.length,
    message: signal?.aborted ? "Individual game review stopped." : "Individual game review complete.",
    total: positions.length,
  });

  return report;
}
