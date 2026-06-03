import { afterEach, describe, expect, it } from "vitest";
import type { ChessComApiGame } from "./chessComApi";
import { summarizeDailyChessGames } from "./chessDailySummary";
import { normalizeChessComGames } from "./chessGameNormalization";
import { extractPlayerMovePositions } from "./chessPgnPositionExtraction";
import {
  buildAnalysisCacheKey,
  classifyMoveImpact,
  defaultSelectedDayAnalysisSettings,
  rankCriticalMoves,
  writeCachedDailyAnalysis,
} from "./chessSelectedDayAnalysis";
import type { CriticalMoveAnalysis, DailyEngineAnalysisReport, NormalizedChessGame } from "./chessReportTypes";
import { buildWeeklyAnalysisCacheKey, buildWeeklyReport, getAvailableWeeks, getMostRecentWeek } from "./chessWeeklyReport";

const dayOneMorning = Date.UTC(2026, 5, 2, 12, 0, 0) / 1000;
const dayOneAfternoon = Date.UTC(2026, 5, 2, 14, 0, 0) / 1000;
const dayTwo = Date.UTC(2026, 5, 3, 12, 0, 0) / 1000;
const nextWeek = Date.UTC(2026, 5, 8, 12, 0, 0) / 1000;

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

function installLocalStorageMock() {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: {
        get length() {
          return store.size;
        },
        clear: () => store.clear(),
        key: (index: number) => [...store.keys()][index] ?? null,
        getItem: (key: string) => store.get(key) ?? null,
        removeItem: (key: string) => {
          store.delete(key);
        },
        setItem: (key: string, value: string) => {
          store.set(key, value);
        },
      } satisfies Storage,
    },
  });
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, "window");
});

describe("Chess.com game normalization", () => {
  it("normalizes rated bullet, blitz, and rapid games for either player color", () => {
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

    expect(games).toHaveLength(3);
    expect(games.find((normalizedGame) => normalizedGame.gameUrl === "https://www.chess.com/game/live/1")).toMatchObject({
      gameUrl: "https://www.chess.com/game/live/1",
      opponentUsername: "Opponent",
      playerColor: "white",
      playerRatingAfterGame: 1500,
      result: "win",
      timeClass: "blitz",
    });
    expect(games.find((normalizedGame) => normalizedGame.gameUrl === "https://www.chess.com/game/live/2")).toMatchObject({
      gameUrl: "https://www.chess.com/game/live/2",
      opponentUsername: "OtherUser",
      playerColor: "black",
      playerRatingAfterGame: 1510,
      result: "loss",
      timeClass: "rapid",
    });
    expect(games.find((normalizedGame) => normalizedGame.gameUrl === "https://www.chess.com/game/live/3")).toMatchObject({
      gameUrl: "https://www.chess.com/game/live/3",
      timeClass: "bullet",
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
      impact: { label: "Inaccuracy", severity: "inaccuracy", theme: "missed best move" },
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
        settings: { depth: 10, maxGames: 3, maxMoves: 18, moveTimeMs: 400 },
        username: "TestPlayer",
      }),
    ).toContain("testplayer.2026-06-02.g3.m18.d10.t400.a|b");
    expect(
      classifyMoveImpact({
        centipawnLoss: 360,
        evalAfter: { type: "cp", value: 20 },
        evalBefore: { type: "cp", value: 380 },
        mateSwing: null,
      }),
    ).toMatchObject({ label: "Missed winning advantage", theme: "missed win" });
  });
});

describe("weekly chess reports", () => {
  it("selects available weeks and aggregates fetched data plus cached engine analysis", () => {
    installLocalStorageMock();
    const games = normalizeChessComGames(
      [
        game({ end_time: dayOneMorning, url: "https://www.chess.com/game/live/w1", white: { rating: 1500, result: "win", username: "TestPlayer" } }),
        game({ end_time: dayOneAfternoon, url: "https://www.chess.com/game/live/w2", white: { rating: 1512, result: "agreed", username: "TestPlayer" } }),
        game({
          end_time: dayTwo,
          time_class: "rapid",
          url: "https://www.chess.com/game/live/w3",
          white: { rating: 1600, result: "timeout", username: "TestPlayer" },
          black: { rating: 1500, result: "win", username: "Opponent" },
        }),
        game({
          end_time: nextWeek,
          url: "https://www.chess.com/game/live/w4",
          white: { rating: 1520, result: "win", username: "TestPlayer" },
        }),
      ],
      "TestPlayer",
    );
    const summaries = summarizeDailyChessGames(games);
    const weekKey = "2026-06-01";
    const cachedDay = summaries.find((summary) => summary.date === "2026-06-02");
    expect(cachedDay).toBeTruthy();
    const cacheKey = buildWeeklyAnalysisCacheKey({
      date: cachedDay!.date,
      day: cachedDay!,
      username: "TestPlayer",
    });
    const cachedReport: DailyEngineAnalysisReport = {
      analyzedGameUrls: cachedDay!.games.slice(0, defaultSelectedDayAnalysisSettings.maxGames).map((cachedGame) => cachedGame.gameUrl),
      cacheKey,
      completedAt: "2026-06-02T12:00:00.000Z",
      criticalMoves: [
        {
          bestMove: "e2e4",
          centipawnLoss: 320,
          evalAfter: { type: "cp", value: -250 },
          evalBefore: { type: "cp", value: 70 },
          fenAfter: "after",
          fenBefore: "before",
          gameUrl: "https://www.chess.com/game/live/w1",
          impact: { label: "Major evaluation loss", severity: "major", theme: "major eval loss" },
          mateSwing: null,
          moveNumber: 1,
          playedMove: "b4",
          playedMoveUci: "b2b4",
          playerColor: "white",
          sideToMove: "white",
        },
      ],
      gameStatuses: [
        {
          analyzedMoveCount: 2,
          candidateMoveCount: 2,
          criticalMoveCount: 1,
          gameUrl: "https://www.chess.com/game/live/w1",
          status: "analyzed",
        },
      ],
      homeworkPuzzles: [
        {
          bestMove: "e2e4",
          centipawnLoss: 320,
          explanation: "Find the best move.",
          fen: "before",
          gameUrl: "https://www.chess.com/game/live/w1",
          impact: { label: "Major evaluation loss", severity: "major", theme: "major eval loss" },
          playedMove: "b4",
          sideToMove: "white",
        },
      ],
      incomplete: false,
      settings: defaultSelectedDayAnalysisSettings,
      skippedGames: [],
      source: "stockfish-lite-single",
    };
    writeCachedDailyAnalysis(cacheKey, cachedReport);

    const report = buildWeeklyReport({ days: summaries, username: "TestPlayer", weekKey });

    expect(getAvailableWeeks(summaries)).toEqual(["2026-06-08", "2026-06-01"]);
    expect(getMostRecentWeek(summaries)).toBe("2026-06-08");
    expect(report.timeClassSummaries.blitz).toMatchObject({
      finalRating: 1512,
      firstKnownRating: 1500,
      gamesPlayed: 2,
      netChange: 12,
      wins: 1,
      draws: 1,
    });
    expect(report.timeClassSummaries.rapid).toMatchObject({
      gamesPlayed: 1,
      losses: 1,
      netChange: 0,
    });
    expect(report.bestDay).toEqual({ date: "2026-06-02", netChange: 12 });
    expect(report.analysisCoverage).toMatchObject({
      analyzedDayCount: 1,
      totalDayCount: 2,
    });
    expect(report.analysisCoverage.days.map((day) => day.status)).toEqual(["cached_complete", "not_analyzed"]);
    expect(report.engineAnalyzedDayCount).toBe(1);
    expect(report.engineAnalyzedGameCount).toBe(2);
    expect(report.missingAnalysisDates).toEqual(["2026-06-03"]);
    expect(report.topCriticalMoves[0].centipawnLoss).toBe(320);
    expect(report.themeCounts[0]).toEqual({ count: 1, label: "major eval loss" });
  });
});
