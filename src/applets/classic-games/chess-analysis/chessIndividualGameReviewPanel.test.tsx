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
  it("shows the openings navigation item and opens the direct openings route", async () => {
    window.location.hash = "#/applets/chess-com-analysis/openings";

    render(<ChessComAnalysisPanel />);

    expect(await screen.findByRole("button", { name: /Openings/i })).toBeTruthy();
    expect(await screen.findByRole("heading", { name: /Opening Reference/i })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: /Search openings/i })).toBeTruthy();
  });

  it("searches the bundled opening book by ECO and name", async () => {
    const user = userEvent.setup();
    window.location.hash = "#/applets/chess-com-analysis";

    render(<ChessComAnalysisPanel />);
    await user.click(await screen.findByRole("button", { name: /Openings/i }));
    await user.type(screen.getByRole("textbox", { name: /Search openings/i }), "B01 Scandinavian");

    expect((await screen.findAllByRole("button", { name: /B01.*Scandinavian Defense/i })).length).toBeGreaterThan(0);
    expect(await screen.findByRole("heading", { name: /Scandinavian Defense/i })).toBeTruthy();
  });

  it("filters opening study results to weak personal openings", async () => {
    const user = userEvent.setup();
    const scandinavianLossPgn = [
      '[Event "Rated Blitz"]',
      '[ECO "B01"]',
      '[Opening "Scandinavian Defense"]',
      '[Result "0-1"]',
      "",
      "1. e4 d5 2. exd5 Qxd5 3. Nc3 Qe5+ 0-1",
    ].join("\n");
    const losses = [
      game({
        eco: "B01",
        gameId: "scandi-loss-1",
        gameUrl: "https://www.chess.com/game/live/scandi-loss-1",
        moveCount: 6,
        normalizedResult: "loss",
        opening: "Scandinavian Defense",
        pgn: scandinavianLossPgn,
      }),
      game({
        eco: "B01",
        endDate: "2026-06-03",
        endTimestamp: 1780488000,
        gameId: "scandi-loss-2",
        gameUrl: "https://www.chess.com/game/live/scandi-loss-2",
        moveCount: 6,
        normalizedResult: "loss",
        opening: "Scandinavian Defense",
        pgn: scandinavianLossPgn,
      }),
    ];
    window.localStorage.setItem(gamesKey, JSON.stringify(losses));
    window.location.hash = "#/applets/chess-com-analysis/openings";

    render(<ChessComAnalysisPanel />);
    expect(await screen.findByText(/2 imported games/i)).toBeTruthy();
    await user.click(screen.getByRole("checkbox", { name: /Personal repair only/i }));

    expect((await screen.findAllByRole("button", { name: /B01.*Scandinavian Defense/i })).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /King Pawn Game/i })).toBeNull();
  });

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
    await user.click(screen.getByRole("button", { name: /Analysis/i }));

    expect(await screen.findByRole("heading", { name: /Win vs NewerOpponent/i })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /OlderOpponent/i }));
    expect(await screen.findByRole("heading", { name: /Win vs OlderOpponent/i })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Black" }));
    expect(await screen.findByRole("heading", { name: /1\.\.\. e5/i })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Account" }));
    expect(await screen.findByRole("heading", { name: /1\. e4/i })).toBeTruthy();
  });
});
