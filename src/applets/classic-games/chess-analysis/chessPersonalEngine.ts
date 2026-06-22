import type {
  CriticalMoveAnalysis,
  EngineEvaluation,
  ExtractedMovePosition,
} from "./chessReportTypes";
import type { ChessStockfishEngine } from "./chessStockfishEngine";
import {
  classifyMoveImpact,
  defaultSelectedDayAnalysisSettings,
  type SelectedDayAnalysisSettings,
  type SelectedDayAnalysisProgress,
} from "./chessSelectedDayAnalysis";
import { extractPlayerMovePositions } from "./chessPgnPositionExtraction";
import { classifyPersonalLeakTag } from "./chessPersonalInsights";
import type { PersonalChessGame, PersonalChessMistake } from "./chessPersonalTypes";
import { personalGameToNormalized } from "./chessPersonalTypes";

export type PersonalRapidLossAnalysisSettings = SelectedDayAnalysisSettings & {
  dropThreshold: number;
  maxLosses: number;
};

export type PersonalRapidLossAnalysisReport = {
  analyzedGameCount: number;
  completedAt: string;
  mistakes: PersonalChessMistake[];
  settings: PersonalRapidLossAnalysisSettings;
  skippedGames: {
    gameUrl: string;
    reason: string;
  }[];
  source: "stockfish-lite-single";
};

const mateCentipawn = 100000;

export const defaultPersonalRapidLossAnalysisSettings: PersonalRapidLossAnalysisSettings = {
  ...defaultSelectedDayAnalysisSettings,
  dropThreshold: 250,
  maxLosses: 4,
  maxMoves: 36,
};

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

function normalizeSettings(settings: Partial<PersonalRapidLossAnalysisSettings> = {}): PersonalRapidLossAnalysisSettings {
  return {
    depth: Math.min(18, Math.max(1, Math.round(settings.depth ?? defaultPersonalRapidLossAnalysisSettings.depth))),
    dropThreshold: Math.min(1200, Math.max(75, Math.round(settings.dropThreshold ?? defaultPersonalRapidLossAnalysisSettings.dropThreshold))),
    maxGames: Math.min(8, Math.max(1, Math.round(settings.maxGames ?? defaultPersonalRapidLossAnalysisSettings.maxGames))),
    maxLosses: Math.min(12, Math.max(1, Math.round(settings.maxLosses ?? defaultPersonalRapidLossAnalysisSettings.maxLosses))),
    maxMoves: Math.min(80, Math.max(1, Math.round(settings.maxMoves ?? defaultPersonalRapidLossAnalysisSettings.maxMoves))),
    moveTimeMs: Math.min(3000, Math.max(100, Math.round(settings.moveTimeMs ?? defaultPersonalRapidLossAnalysisSettings.moveTimeMs))),
  };
}

function mistakeId(game: PersonalChessGame, position: ExtractedMovePosition): string {
  return `${game.gameId}:${position.moveNumber}:${position.playedMoveUci}`;
}

function personalMistakeFromCriticalMove(game: PersonalChessGame, criticalMove: CriticalMoveAnalysis): PersonalChessMistake {
  return {
    bestMove: criticalMove.bestMove,
    centipawnLoss: criticalMove.centipawnLoss,
    createdAt: new Date().toISOString(),
    date: game.endDate,
    evalAfter: criticalMove.evalAfter,
    evalBefore: criticalMove.evalBefore,
    evalDrop: criticalMove.centipawnLoss,
    fenAfter: criticalMove.fenAfter,
    fenBefore: criticalMove.fenBefore,
    gameId: game.gameId,
    gameUrl: game.gameUrl,
    id: mistakeId(game, criticalMove),
    leakTag: classifyPersonalLeakTag({
      bestMove: criticalMove.bestMove,
      centipawnLoss: criticalMove.centipawnLoss,
      evalBefore: criticalMove.evalBefore,
      fenAfter: criticalMove.fenAfter,
      fenBefore: criticalMove.fenBefore,
      game,
      moveNumber: criticalMove.moveNumber,
      playedMove: criticalMove.playedMove,
      sideToMove: criticalMove.sideToMove,
    }),
    moveNumber: criticalMove.moveNumber,
    playedMove: criticalMove.playedMove,
    playedMoveUci: criticalMove.playedMoveUci,
    playerColor: criticalMove.playerColor,
    sideToMove: criticalMove.sideToMove,
    source: "stockfish-lite-single",
    timeClass: game.timeClass,
  };
}

async function analyzeCandidate({
  candidate,
  engine,
  settings,
  signal,
}: {
  candidate: ExtractedMovePosition;
  engine: ChessStockfishEngine;
  settings: PersonalRapidLossAnalysisSettings;
  signal?: AbortSignal;
}): Promise<CriticalMoveAnalysis> {
  const before = await engine.analyzeFen(candidate.fenBefore, {
    depth: settings.depth,
    moveTimeMs: settings.moveTimeMs,
    signal,
  });
  const after = await engine.analyzeFen(candidate.fenAfter, {
    depth: settings.depth,
    moveTimeMs: settings.moveTimeMs,
    signal,
  });
  const evalBeforeFromPlayer = evaluationFromPlayerPerspective(before.evaluation);
  const evalAfterFromPlayer = evaluationFromPlayerPerspective(after.evaluation, true);
  const evalBefore = evaluationToPlayerCentipawns(evalBeforeFromPlayer);
  const evalAfter = evaluationToPlayerCentipawns(evalAfterFromPlayer);
  const centipawnLoss = Math.max(0, evalBefore - evalAfter);
  const moveMateSwing = mateSwing(evalBeforeFromPlayer, evalAfterFromPlayer);

  return {
    ...candidate,
    bestMove: before.bestMove,
    centipawnLoss,
    evalAfter: evalAfterFromPlayer,
    evalBefore: evalBeforeFromPlayer,
    impact: classifyMoveImpact({
      centipawnLoss,
      evalAfter: evalAfterFromPlayer,
      evalBefore: evalBeforeFromPlayer,
      mateSwing: moveMateSwing,
    }),
    mateSwing: moveMateSwing,
  };
}

export async function analyzeRecentRapidLosses({
  engine,
  games,
  onProgress,
  settings,
  signal,
}: {
  engine: ChessStockfishEngine;
  games: PersonalChessGame[];
  onProgress?: (progress: SelectedDayAnalysisProgress) => void;
  settings?: Partial<PersonalRapidLossAnalysisSettings>;
  signal?: AbortSignal;
}): Promise<PersonalRapidLossAnalysisReport> {
  const normalizedSettings = normalizeSettings(settings);
  const rapidLosses = [...games]
    .filter((game) => game.timeClass === "rapid" && game.normalizedResult === "loss")
    .sort((left, right) => right.endTimestamp - left.endTimestamp)
    .slice(0, normalizedSettings.maxLosses);
  const mistakes: PersonalChessMistake[] = [];
  const skippedGames: PersonalRapidLossAnalysisReport["skippedGames"] = [];

  onProgress?.({
    current: 0,
    message: "Initializing Stockfish for recent rapid losses.",
    total: rapidLosses.length,
  });
  if (rapidLosses.length === 0) {
    onProgress?.({
      current: 0,
      message: "No recent rapid losses to analyze.",
      total: 0,
    });

    return {
      analyzedGameCount: 0,
      completedAt: new Date().toISOString(),
      mistakes: [],
      settings: normalizedSettings,
      skippedGames,
      source: "stockfish-lite-single",
    };
  }

  await engine.initialize();

  for (const [gameIndex, game] of rapidLosses.entries()) {
    if (signal?.aborted) {
      break;
    }

    onProgress?.({
      current: gameIndex,
      message: `Analyzing rapid loss ${gameIndex + 1} of ${rapidLosses.length}.`,
      total: rapidLosses.length,
    });

    const normalizedGame = personalGameToNormalized(game);
    if (!normalizedGame) {
      skippedGames.push({
        gameUrl: game.gameUrl,
        reason: "Game is not compatible with rapid-loss analysis.",
      });
      continue;
    }

    let positions: ExtractedMovePosition[];
    try {
      positions = extractPlayerMovePositions(normalizedGame).slice(0, normalizedSettings.maxMoves);
    } catch (error) {
      skippedGames.push({
        gameUrl: game.gameUrl,
        reason: error instanceof Error ? error.message : "Could not parse PGN.",
      });
      continue;
    }

    let foundMistake = false;
    for (const candidate of positions) {
      if (signal?.aborted) {
        break;
      }

      try {
        const criticalMove = await analyzeCandidate({
          candidate,
          engine,
          settings: normalizedSettings,
          signal,
        });
        if (criticalMove.centipawnLoss >= normalizedSettings.dropThreshold) {
          mistakes.push(personalMistakeFromCriticalMove(game, criticalMove));
          foundMistake = true;
          break;
        }
      } catch (error) {
        if (signal?.aborted) {
          break;
        }

        skippedGames.push({
          gameUrl: game.gameUrl,
          reason: error instanceof Error ? error.message : "Could not analyze position.",
        });
        break;
      }
    }

    if (!foundMistake && !signal?.aborted) {
      skippedGames.push({
        gameUrl: game.gameUrl,
        reason: "No major evaluation drop found within the move cap.",
      });
    }
  }

  onProgress?.({
    current: rapidLosses.length,
    message: signal?.aborted ? "Rapid-loss analysis stopped." : "Rapid-loss analysis complete.",
    total: rapidLosses.length,
  });

  return {
    analyzedGameCount: rapidLosses.length - skippedGames.filter((game) => game.reason !== "No major evaluation drop found within the move cap.").length,
    completedAt: new Date().toISOString(),
    mistakes: mistakes.sort((left, right) => right.centipawnLoss - left.centipawnLoss),
    settings: normalizedSettings,
    skippedGames,
    source: "stockfish-lite-single",
  };
}
