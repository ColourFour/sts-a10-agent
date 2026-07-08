/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildIndividualGameReviewCacheKey,
  summarizeIndividualGameReview,
  writeCachedIndividualGameReview,
  type IndividualGameReviewMove,
  type IndividualGameReviewReport,
} from "./chessIndividualGameReview";
import { ChessComAnalysisPanel } from "./ChessComAnalysisPanel";
import type { PersonalChessGame } from "./chessPersonalTypes";

const gamesKey = "sts2.blakeChessTrainer.games";
const initialFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const afterE4Fen = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
const afterE5Fen = "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2";

function game(overrides: Partial<PersonalChessGame>): PersonalChessGame {
  return {
    eco: null,
    endDate: "2026-06-02",
    endTimestamp: 1780401600,
    gameId: "panel-game",
    gameUrl: "https://www.chess.com/game/live/panel-game",
    importedAt: "2026-06-02T12:00:00.000Z",
    moveCount: 2,
    normalizedResult: "win",
    opening: "King Pawn Game",
    opponentRating: 1490,
    opponentUsername: "Opponent",
    pgn: '[Event "Rated Blitz"]\n\n1. e4 e5 *',
    playerColor: "white",
    playerRatingAfterGame: 1500,
    rated: true,
    ratingChange: 8,
    rawTimeClass: "blitz",
    result: "win",
    rules: "chess",
    termination: null,
    timeClass: "blitz",
    timeControl: "300",
    ...overrides,
  };
}

function move(overrides: Partial<IndividualGameReviewMove>): IndividualGameReviewMove {
  return {
    accuracy: 100,
    bestMove: "e2e4",
    centipawnLoss: 0,
    classification: "best",
    evalAfter: { type: "cp", value: 20 },
    evalBefore: { type: "cp", value: 20 },
    expectedPointAfter: 52,
    expectedPointBefore: 52,
    expectedPointLoss: 0,
    fenAfter: afterE4Fen,
    fenBefore: initialFen,
    gameUrl: "https://www.chess.com/game/live/panel-game",
    isPlayerMove: true,
    moveNumber: 1,
    playedMove: "e4",
    playedMoveUci: "e2e4",
    playerColor: "white",
    ply: 1,
    punishmentLines: [],
    sacrificedMaterialCp: 0,
    sideToMove: "white",
    topLineExpectedGap: 0,
    topLines: [{ evaluation: { type: "cp", value: 20 }, line: ["e2e4", "e7e5"], move: "e2e4", rank: 1 }],
    ...overrides,
  };
}

function cacheReview(personalGame: PersonalChessGame): void {
  const settings = { depth: 10, lineCount: 5, moveTimeMs: 400 };
  const moves = [
    move({ gameUrl: personalGame.gameUrl }),
    move({
      bestMove: "e7e5",
      classification: "good",
      evalAfter: { type: "cp", value: -10 },
      evalBefore: { type: "cp", value: 0 },
      expectedPointAfter: 49,
      expectedPointBefore: 50,
      fenAfter: afterE5Fen,
      fenBefore: afterE4Fen,
      gameUrl: personalGame.gameUrl,
      isPlayerMove: false,
      moveNumber: 1,
      playedMove: "e5",
      playedMoveUci: "e7e5",
      ply: 2,
      sideToMove: "black",
      topLines: [{ evaluation: { type: "cp", value: 0 }, line: ["e7e5", "g1f3"], move: "e7e5", rank: 1 }],
    }),
  ];
  const cacheKey = buildIndividualGameReviewCacheKey({ game: personalGame, settings });
  const report: IndividualGameReviewReport = {
    cacheKey,
    completedAt: "2026-06-02T12:00:00.000Z",
    gameId: personalGame.gameId,
    gameUrl: personalGame.gameUrl,
    incomplete: false,
    moves,
    settings,
    skippedMoves: [],
    source: "stockfish-lite-single",
    summary: summarizeIndividualGameReview({ accountColor: personalGame.playerColor, moves }),
  };
  writeCachedIndividualGameReview(cacheKey, report);
}

beforeEach(() => {
  Object.defineProperty(globalThis, "indexedDB", {
    configurable: true,
    value: undefined,
  });
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  Reflect.deleteProperty(globalThis, "indexedDB");
});

describe("individual game review panel", () => {
  it("selects an older imported game and filters review moves by side", async () => {
    const user = userEvent.setup();
    const olderGame = game({
      endTimestamp: 1780401600,
      gameId: "older-game",
      gameUrl: "https://www.chess.com/game/live/older-game",
      opponentUsername: "OlderOpponent",
    });
    const newerGame = game({
      endDate: "2026-06-03",
      endTimestamp: 1780488000,
      gameId: "newer-game",
      gameUrl: "https://www.chess.com/game/live/newer-game",
      opponentUsername: "NewerOpponent",
    });
    window.localStorage.setItem(gamesKey, JSON.stringify([olderGame, newerGame]));
    cacheReview(olderGame);
    cacheReview(newerGame);

    render(<ChessComAnalysisPanel />);

    expect(await screen.findByRole("heading", { name: /Win vs NewerOpponent/i })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /OlderOpponent/i }));
    expect(await screen.findByRole("heading", { name: /Win vs OlderOpponent/i })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Black" }));
    expect(await screen.findByRole("heading", { name: /1\.\.\. e5/i })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Account" }));
    expect(await screen.findByRole("heading", { name: /1\. e4/i })).toBeTruthy();
  });
});
