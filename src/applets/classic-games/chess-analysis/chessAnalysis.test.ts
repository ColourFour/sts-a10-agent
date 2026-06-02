import { describe, expect, it } from "vitest";
import type { ChessComApiGame } from "./chessComApi";
import { summarizeDailyChessGames } from "./chessDailySummary";
import { normalizeChessComGames } from "./chessGameNormalization";
import { extractPlayerMovePositions } from "./chessPgnPositionExtraction";
import { buildAnalysisCacheKey, rankCriticalMoves } from "./chessSelectedDayAnalysis";
import type { CriticalMoveAnalysis, NormalizedChessGame } from "./chessReportTypes";

const dayOneMorning = Date.UTC(2026, 5, 2, 12, 0, 0) / 1000;
const dayOneAfternoon = Date.UTC(2026, 5, 2, 14, 0, 0) / 1000;
const dayTwo = Date.UTC(2026, 5, 3, 12, 0, 0) / 1000;

function game(overrides: Partial<ChessComApiGame>): ChessComApiGame {
  return {
    end_time: dayOneMorning,
    pgn: "[Event \"Rated Blitz\"]\n\n1. e4 e5",
    rated: true,
    rules: "chess",
    time_class: "blitz",
    url: "https://www.chess.com/game/live/1",
    white: {
      rating: 1500,
      result: "win",
      username: "TestPlayer",
    },
    black: {
      rating: 1490,
      result: "checkmated",
      username: "Opponent",
    },
    ...overrides,
  };
}

describe("Chess.com game normalization", () => {
  it("normalizes rated blitz and rapid games for either player color", () => {
    const games = normalizeChessComGames(
      [
        game({ end_time: dayOneMorning, white: { rating: 1500, result: "win", username: "TestPlayer" } }),
        game({
          end_time: dayOneAfternoon,
          time_class: "rapid",
          url: "https://www.chess.com/game/live/2",
          white: { rating: 1420, result: "win", username: "OtherUser" },
          black: { rating: 1510, result: "resigned", username: "testplayer" },
        }),
        game({ time_class: "bullet", url: "https://www.chess.com/game/live/3" }),
        game({ rated: false, url: "https://www.chess.com/game/live/4" }),
      ],
      "TestPlayer",
    );

    expect(games).toHaveLength(2);
    expect(games[0]).toMatchObject({
      gameUrl: "https://www.chess.com/game/live/1",
      opponentUsername: "Opponent",
      playerColor: "white",
      playerRatingAfterGame: 1500,
      result: "win",
      timeClass: "blitz",
    });
    expect(games[1]).toMatchObject({
      gameUrl: "https://www.chess.com/game/live/2",
      opponentUsername: "OtherUser",
      playerColor: "black",
      playerRatingAfterGame: 1510,
      result: "loss",
      timeClass: "rapid",
    });
  });
});

describe("daily chess summaries", () => {
  it("groups games by local date and time class with rating movement and result counts", () => {
    const games = normalizeChessComGames(
      [
        game({ end_time: dayOneMorning, url: "https://www.chess.com/game/live/1", white: { rating: 1500, result: "win", username: "TestPlayer" } }),
        game({ end_time: dayOneAfternoon, url: "https://www.chess.com/game/live/2", white: { rating: 1514, result: "agreed", username: "TestPlayer" } }),
        game({ end_time: dayTwo, time_class: "rapid", url: "https://www.chess.com/game/live/3", white: { rating: 1530, result: "timeout", username: "TestPlayer" }, black: { rating: 1510, result: "win", username: "Opponent" } }),
      ],
      "TestPlayer",
    );

    const summaries = summarizeDailyChessGames(games);

    expect(summaries).toHaveLength(2);
    expect(summaries[0].date).toBe("2026-06-03");
    expect(summaries[1].byTimeClass.blitz).toMatchObject({
      finalRating: 1514,
      firstKnownRating: 1500,
      gamesPlayed: 2,
      netChange: 14,
      wins: 1,
      draws: 1,
    });
    expect(summaries[0].byTimeClass.rapid).toMatchObject({
      gamesPlayed: 1,
      losses: 1,
      netChange: 0,
    });
  });
});

describe("PGN position extraction", () => {
  it("extracts only the tracked player's move positions with before and after FENs", () => {
    const normalizedGame: NormalizedChessGame = {
      endDate: "2026-06-02",
      endTimestamp: dayOneMorning,
      gameUrl: "https://www.chess.com/game/live/5",
      opponentRating: 1500,
      opponentUsername: "Opponent",
      pgn: '[Event "Rated Blitz"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 *',
      playerColor: "white",
      playerRatingAfterGame: 1510,
      rated: true,
      result: "win",
      timeClass: "blitz",
    };

    const positions = extractPlayerMovePositions(normalizedGame);

    expect(positions).toHaveLength(3);
    expect(positions[0]).toMatchObject({
      fenBefore: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      gameUrl: "https://www.chess.com/game/live/5",
      moveNumber: 1,
      playedMove: "e4",
      playedMoveUci: "e2e4",
      sideToMove: "white",
    });
    expect(positions[1].fenAfter).toContain(" b ");
  });
});

describe("selected-day analysis helpers", () => {
  it("ranks critical moves by centipawn loss and keys cache by settings", () => {
    const moves = [
      { centipawnLoss: 80, gameUrl: "a", moveNumber: 1, playedMove: "e4", playedMoveUci: "e2e4" },
      { centipawnLoss: 220, gameUrl: "b", moveNumber: 2, playedMove: "Nf3", playedMoveUci: "g1f3" },
    ].map((move) => ({
      bestMove: "d2d4",
      evalAfter: { type: "cp", value: 10 },
      evalBefore: { type: "cp", value: 100 },
      fenAfter: "after",
      fenBefore: "before",
      mateSwing: null,
      playerColor: "white",
      sideToMove: "white",
      ...move,
    })) as CriticalMoveAnalysis[];

    expect(rankCriticalMoves(moves).map((move) => move.gameUrl)).toEqual(["b", "a"]);
    expect(
      buildAnalysisCacheKey({
        date: "2026-06-02",
        gameUrls: ["a", "b"],
        settings: { maxGames: 3, maxMoves: 18, moveTimeMs: 400 },
        username: "TestPlayer",
      }),
    ).toContain("testplayer.2026-06-02.g3.m18.t400.a|b");
  });
});
