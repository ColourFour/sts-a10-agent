import { afterEach, describe, expect, it } from "vitest";
import type { ChessComApiGame } from "./chessComApi";
import { summarizeDailyChessGames } from "./chessDailySummary";
import { normalizeChessComGames } from "./chessGameNormalization";
import {
  accuracyFromExpectedPointLoss,
  buildIndividualGameReviewCacheKey,
  classifyIndividualMove,
  evaluationToExpectedPoints,
  expectedPointLoss,
  readCachedIndividualGameReview,
  summarizeIndividualGameReview,
  writeCachedIndividualGameReview,
  type IndividualGameReviewMove,
  type IndividualGameReviewReport,
} from "./chessIndividualGameReview";
import { classifyLatestGameMoveGrade } from "./chessLatestGameReview";
import { blakeChessTrainerConfig } from "./chessPersonalConfig";
import { buildPersonalChessReport, classifyPersonalLeakTag } from "./chessPersonalInsights";
import { normalizePersonalChessComGames } from "./chessPersonalImport";
import { importPersonalChessGames, readPersonalChessGames, schedulePersonalDrillReview } from "./chessPersonalStore";
import type { PersonalChessMistake } from "./chessPersonalTypes";
import { extractGameMovePositions, extractPlayerMovePositions } from "./chessPgnPositionExtraction";
import {
  buildAnalysisCacheKey,
  buildDayAnalysisCacheKey,
  classifyMoveImpact,
  defaultSelectedDayAnalysisSettings,
  rankCriticalMoves,
  readRelatedDailyAnalysisStatuses,
  summarizeCachedAnalysisStatus,
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
  Reflect.deleteProperty(globalThis, "indexedDB");
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

describe("personal chess trainer import and reports", () => {
  const scandinavianLossPgn = [
    '[Event "Rated Rapid"]',
    '[Site "Chess.com"]',
    '[Date "2026.06.02"]',
    '[Round "-"]',
    '[White "TestPlayer"]',
    '[Black "Opponent"]',
    '[Result "0-1"]',
    '[ECO "B01"]',
    '[Opening "Scandinavian Defense"]',
    '[TimeControl "600"]',
    '[Termination "TestPlayer resigned"]',
    "",
    "1. e4 d5 2. exd5 Qxd5 3. Nc3 Qe5+ 0-1",
  ].join("\n");

  function personalMistake(overrides: Partial<PersonalChessMistake> = {}): PersonalChessMistake {
    return {
      bestMove: "g1f3",
      centipawnLoss: 360,
      createdAt: "2026-06-22T12:00:00.000Z",
      date: "2026-06-02",
      evalAfter: { type: "cp", value: -250 },
      evalBefore: { type: "cp", value: 110 },
      evalDrop: 360,
      fenAfter: "rnbqkbnr/ppp1pppp/8/3q4/8/2N5/PPPP1PPP/R1BQKBNR b KQkq - 1 3",
      fenBefore: "rnb1kbnr/ppp1pppp/8/3q4/8/8/PPPP1PPP/RNBQKBNR w KQkq - 0 3",
      gameId: "report-1",
      gameUrl: "https://www.chess.com/game/live/report-1",
      id: "report-1:3:b1c3",
      leakTag: "opening-plan-failure",
      moveNumber: 3,
      playedMove: "Nc3",
      playedMoveUci: "b1c3",
      playerColor: "white",
      sideToMove: "white",
      source: "stockfish-lite-single",
      timeClass: "rapid",
      ...overrides,
    };
  }

  it("defaults Blake's configured Chess.com username to sbrooker02", () => {
    expect(blakeChessTrainerConfig.defaultUsername).toBe("sbrooker02");
  });

  it("schedules personal drill reviews later after success and sooner after misses", () => {
    const firstSolved = schedulePersonalDrillReview(undefined, "solved", "2026-06-22");
    const secondSolved = schedulePersonalDrillReview(firstSolved, "solved", "2026-06-25");
    const failed = schedulePersonalDrillReview(secondSolved, "failed", "2026-07-01");
    const needsReview = schedulePersonalDrillReview(failed, "needs-review", "2026-07-02");

    expect(firstSolved).toMatchObject({
      attempts: 1,
      correct: 1,
      incorrect: 0,
      intervalDays: 3,
      lastReviewedDate: "2026-06-22",
      nextDueDate: "2026-06-25",
      status: "solved",
    });
    expect(secondSolved).toMatchObject({
      attempts: 2,
      correct: 2,
      intervalDays: 6,
      nextDueDate: "2026-07-01",
    });
    expect(failed).toMatchObject({
      attempts: 3,
      correct: 2,
      incorrect: 1,
      intervalDays: 1,
      nextDueDate: "2026-07-02",
      status: "failed",
    });
    expect(needsReview).toMatchObject({
      attempts: 4,
      incorrect: 2,
      intervalDays: 0,
      nextDueDate: "2026-07-02",
      status: "needs-review",
    });
  });

  it("normalizes full personal game metadata and computes rating changes by time class", () => {
    const personalGames = normalizePersonalChessComGames(
      [
        game({
          end_time: dayOneMorning,
          pgn: scandinavianLossPgn,
          time_class: "rapid",
          url: "https://www.chess.com/game/live/personal-1",
          white: { rating: 1600, result: "resigned", username: "TestPlayer" },
          black: { rating: 1590, result: "win", username: "Opponent" },
        }),
        game({
          end_time: dayOneAfternoon,
          pgn: scandinavianLossPgn,
          time_class: "rapid",
          url: "https://www.chess.com/game/live/personal-2",
          white: { rating: 1584, result: "resigned", username: "TestPlayer" },
          black: { rating: 1588, result: "win", username: "Opponent" },
        }),
        game({
          end_time: dayTwo,
          pgn: scandinavianLossPgn,
          time_class: "daily",
          url: "https://www.chess.com/game/daily/personal-3",
          white: { rating: 1200, result: "resigned", username: "TestPlayer" },
          black: { rating: 1210, result: "win", username: "Opponent" },
        }),
      ],
      "TestPlayer",
    );

    expect(personalGames).toHaveLength(3);
    expect(personalGames[0]).toMatchObject({
      eco: "B01",
      gameId: "personal-1",
      moveCount: 3,
      normalizedResult: "loss",
      opening: "Scandinavian Defense",
      ratingChange: null,
      result: "resigned",
      timeClass: "rapid",
      timeControl: "600",
    });
    expect(personalGames[1].ratingChange).toBe(-16);
    expect(personalGames[2]).toMatchObject({
      timeClass: "daily",
    });
  });

  it("stores personal imports without duplicating existing game URLs", async () => {
    installLocalStorageMock();
    Object.defineProperty(globalThis, "indexedDB", {
      configurable: true,
      value: undefined,
    });
    const personalGames = normalizePersonalChessComGames(
      [
        game({
          pgn: scandinavianLossPgn,
          time_class: "rapid",
          url: "https://www.chess.com/game/live/personal-store-1",
          white: { rating: 1600, result: "resigned", username: "TestPlayer" },
          black: { rating: 1590, result: "win", username: "Opponent" },
        }),
      ],
      "TestPlayer",
    );

    const firstImport = await importPersonalChessGames(personalGames);
    const secondImport = await importPersonalChessGames(personalGames);
    const storedGames = await readPersonalChessGames();

    expect(firstImport).toMatchObject({ duplicateCount: 0, insertedCount: 1, totalCount: 1 });
    expect(secondImport).toMatchObject({ duplicateCount: 1, insertedCount: 0, totalCount: 1, updatedCount: 0 });
    expect(storedGames).toHaveLength(1);
  });

  it("builds Blake's personal dashboard and leak report from recent games", () => {
    const personalGames = normalizePersonalChessComGames(
      [
        game({
          end_time: dayOneMorning,
          pgn: scandinavianLossPgn,
          time_class: "rapid",
          url: "https://www.chess.com/game/live/report-1",
          white: { rating: 1600, result: "resigned", username: "TestPlayer" },
          black: { rating: 1590, result: "win", username: "Opponent" },
        }),
        game({
          end_time: dayOneAfternoon,
          pgn: scandinavianLossPgn,
          time_class: "rapid",
          url: "https://www.chess.com/game/live/report-2",
          white: { rating: 1578, result: "resigned", username: "TestPlayer" },
          black: { rating: 1588, result: "win", username: "Opponent" },
        }),
        game({
          end_time: dayTwo,
          pgn: '[Event "Rated Blitz"]\n[ECO "C20"]\n[Opening "King Pawn Game"]\n[Result "1-0"]\n\n1. e4 e5 1-0',
          time_class: "blitz",
          url: "https://www.chess.com/game/live/report-3",
          white: { rating: 1510, result: "win", username: "TestPlayer" },
          black: { rating: 1500, result: "checkmated", username: "Opponent" },
        }),
      ],
      "TestPlayer",
    );

    const report = buildPersonalChessReport({
      games: personalGames,
      now: new Date("2026-06-22T12:00:00Z"),
    });

    expect(report.totalGames).toBe(3);
    expect(report.currentRatings.rapid).toBe(1578);
    expect(report.timeClassSummaries.find((summary) => summary.timeClass === "rapid")).toMatchObject({
      gamesPlayed: 2,
      losses: 2,
      ratingChange90: -22,
    });
    expect(report.openingLeakTable[0]).toMatchObject({
      color: "white",
      eco: "B01",
      losses: 2,
      opening: "Scandinavian Defense",
      recommendation: "Quarantine",
      scorePercent: 0,
      shortLosses: 2,
    });
    expect(report.sessionRules).toMatchObject({
      reviewRapidLossBeforeNextRapid: true,
      stopAfterLosses: 2,
    });
    expect(report.rapidDeclineReport).toContain("Rapid is down 22 point");
  });

  it("builds due drill queues and links weak openings to matching drills", () => {
    const personalGames = normalizePersonalChessComGames(
      [
        game({
          end_time: dayOneMorning,
          pgn: scandinavianLossPgn,
          time_class: "rapid",
          url: "https://www.chess.com/game/live/report-1",
          white: { rating: 1600, result: "resigned", username: "TestPlayer" },
          black: { rating: 1590, result: "win", username: "Opponent" },
        }),
        game({
          end_time: dayOneAfternoon,
          pgn: scandinavianLossPgn,
          time_class: "rapid",
          url: "https://www.chess.com/game/live/report-2",
          white: { rating: 1578, result: "resigned", username: "TestPlayer" },
          black: { rating: 1588, result: "win", username: "Opponent" },
        }),
      ],
      "TestPlayer",
    );
    const mistake = personalMistake();

    const report = buildPersonalChessReport({
      games: personalGames,
      mistakes: [mistake],
      now: new Date("2026-06-22T12:00:00Z"),
    });

    expect(report.dueDrillCount).toBe(1);
    expect(report.dueDrillQueue[0]).toMatchObject({
      dueToday: true,
      id: mistake.id,
      status: "needs-review",
    });
    expect(report.dueDrillQueue[0].review).toMatchObject({
      attempts: 0,
      nextDueDate: "2026-06-22",
    });
    expect(report.sessionGuardrails).toContain("Do today's repair before rated rapid.");
    expect(report.openingLeakTable[0]).toMatchObject({
      drillIds: [mistake.id],
      recommendation: "Quarantine",
    });
  });

  it("classifies simple personal leak tags", () => {
    const timeoutGame = normalizePersonalChessComGames(
      [
        game({
          pgn: scandinavianLossPgn,
          time_class: "rapid",
          url: "https://www.chess.com/game/live/tag-1",
          white: { rating: 1600, result: "timeout", username: "TestPlayer" },
          black: { rating: 1590, result: "win", username: "Opponent" },
        }),
      ],
      "TestPlayer",
    )[0];

    expect(classifyPersonalLeakTag({ game: timeoutGame })).toBe("time-pressure");
    expect(classifyPersonalLeakTag({ moveNumber: 5 })).toBe("opening-plan-failure");
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

  it("extracts every game ply and marks player versus opponent moves", () => {
    const normalizedGame: NormalizedChessGame = {
      endDate: "2026-06-02",
      endTimestamp: dayOneMorning,
      gameUrl: "https://www.chess.com/game/live/6",
      opponentRating: 1500,
      opponentUsername: "Opponent",
      pgn: '[Event "Rated Blitz"]\n\n1. e4 e5 2. Nf3 Nc6 *',
      playerColor: "black",
      playerRatingAfterGame: 1510,
      rated: true,
      result: "draw",
      timeClass: "blitz",
    };

    const positions = extractGameMovePositions(normalizedGame);

    expect(positions).toHaveLength(4);
    expect(positions.map((position) => position.playedMove)).toEqual(["e4", "e5", "Nf3", "Nc6"]);
    expect(positions.map((position) => position.isPlayerMove)).toEqual([false, true, false, true]);
    expect(positions[1]).toMatchObject({
      moveNumber: 1,
      playedMoveUci: "e7e5",
      ply: 2,
      sideToMove: "black",
    });
  });
});

describe("individual game review helpers", () => {
  function reviewMove(overrides: Partial<IndividualGameReviewMove>): IndividualGameReviewMove {
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
      fenAfter: "after",
      fenBefore: "before",
      gameUrl: "https://www.chess.com/game/live/review-1",
      isPlayerMove: true,
      moveNumber: 1,
      playedMove: "e4",
      playedMoveUci: "e2e4",
      playerColor: "white",
      ply: 1,
      sacrificedMaterialCp: 0,
      sideToMove: "white",
      topLineExpectedGap: 0,
      topLines: [],
      ...overrides,
    };
  }

  it("converts engine evaluations to expected points and local accuracy", () => {
    expect(evaluationToExpectedPoints({ type: "cp", value: 0 })).toBeCloseTo(50, 1);
    expect(evaluationToExpectedPoints({ type: "cp", value: 500 })).toBeGreaterThan(85);
    expect(evaluationToExpectedPoints({ type: "cp", value: -500 })).toBeLessThan(15);
    expect(expectedPointLoss({ type: "cp", value: 300 }, { type: "cp", value: 0 })).toBeGreaterThan(20);
    expect(accuracyFromExpectedPointLoss(0)).toBe(100);
    expect(accuracyFromExpectedPointLoss(28)).toBeLessThan(40);
  });

  it("classifies book, brilliant, great, miss, and blunder moves with local heuristics", () => {
    expect(
      classifyIndividualMove({
        bestMove: "e2e4",
        centipawnLoss: 0,
        evalAfter: { type: "cp", value: 20 },
        evalBefore: { type: "cp", value: 20 },
        expectedPointLoss: 0,
        playedMoveUci: "e2e4",
        ply: 3,
        sacrificedMaterialCp: 0,
        topLineExpectedGap: 0,
      }),
    ).toBe("book");
    expect(
      classifyIndividualMove({
        bestMove: "b1c3",
        centipawnLoss: 12,
        evalAfter: { type: "cp", value: 90 },
        evalBefore: { type: "cp", value: 100 },
        expectedPointLoss: 1,
        playedMoveUci: "b1c3",
        ply: 18,
        sacrificedMaterialCp: 330,
        topLineExpectedGap: 2,
      }),
    ).toBe("brilliant");
    expect(
      classifyIndividualMove({
        bestMove: "g1f3",
        centipawnLoss: 8,
        evalAfter: { type: "cp", value: 70 },
        evalBefore: { type: "cp", value: 78 },
        expectedPointLoss: 1,
        playedMoveUci: "g1f3",
        ply: 20,
        sacrificedMaterialCp: 0,
        topLineExpectedGap: 16,
      }),
    ).toBe("great");
    expect(
      classifyIndividualMove({
        bestMove: "d1h5",
        centipawnLoss: 320,
        evalAfter: { type: "cp", value: 40 },
        evalBefore: { type: "cp", value: 360 },
        expectedPointLoss: 28,
        playedMoveUci: "a2a3",
        ply: 22,
        sacrificedMaterialCp: 0,
        topLineExpectedGap: 0,
      }),
    ).toBe("miss");
    expect(
      classifyIndividualMove({
        bestMove: "g8f6",
        centipawnLoss: 620,
        evalAfter: { type: "cp", value: -560 },
        evalBefore: { type: "cp", value: 60 },
        expectedPointLoss: 55,
        playedMoveUci: "a7a5",
        ply: 24,
        sacrificedMaterialCp: 0,
        topLineExpectedGap: 0,
      }),
    ).toBe("blunder");
  });

  it("summarizes local accuracy and classification counts by side", () => {
    const summary = summarizeIndividualGameReview({
      accountColor: "black",
      moves: [
        reviewMove({ accuracy: 96, classification: "best", sideToMove: "white" }),
        reviewMove({ accuracy: 80, classification: "inaccuracy", isPlayerMove: true, sideToMove: "black" }),
        reviewMove({ accuracy: 52, classification: "blunder", isPlayerMove: false, sideToMove: "white" }),
      ],
    });

    expect(summary.whiteAccuracy).toBe(74);
    expect(summary.blackAccuracy).toBe(80);
    expect(summary.accountAccuracy).toBe(80);
    expect(summary.classificationCounts.best).toBe(1);
    expect(summary.classificationCounts.blunder).toBe(1);
    expect(summary.keyMoveCount).toBe(2);
  });

  it("keys and restores cached individual game reviews independently", () => {
    installLocalStorageMock();
    const personalGame = normalizePersonalChessComGames(
      [game({ end_time: dayOneMorning, url: "https://www.chess.com/game/live/review-cache-1" })],
      "TestPlayer",
    )[0];
    const settings = { depth: 10, lineCount: 5, moveTimeMs: 400 };
    const cacheKey = buildIndividualGameReviewCacheKey({ game: personalGame, settings });
    const cachedReport: IndividualGameReviewReport = {
      cacheKey,
      completedAt: "2026-06-02T12:00:00.000Z",
      gameId: personalGame.gameId,
      gameUrl: personalGame.gameUrl,
      incomplete: false,
      moves: [reviewMove({ gameUrl: personalGame.gameUrl })],
      settings,
      skippedMoves: [],
      source: "stockfish-lite-single",
      summary: summarizeIndividualGameReview({ accountColor: personalGame.playerColor, moves: [] }),
    };

    writeCachedIndividualGameReview(cacheKey, cachedReport);

    expect(cacheKey).toContain("review-cache-1");
    expect(readCachedIndividualGameReview(cacheKey)).toMatchObject({
      gameUrl: personalGame.gameUrl,
      moves: [{ playedMove: "e4" }],
    });
  });
});

describe("selected-day analysis helpers", () => {
  it("classifies latest-game move grades into five review buckets", () => {
    expect(
      classifyLatestGameMoveGrade({
        bestMove: "e2e4",
        centipawnLoss: 240,
        playedMoveUci: "e2e4",
      }),
    ).toBe("best");
    expect(
      classifyLatestGameMoveGrade({
        bestMove: "g1f3",
        centipawnLoss: 55,
        playedMoveUci: "d2d4",
      }),
    ).toBe("good");
    expect(
      classifyLatestGameMoveGrade({
        bestMove: "g1f3",
        centipawnLoss: 120,
        playedMoveUci: "d2d4",
      }),
    ).toBe("neutral");
    expect(
      classifyLatestGameMoveGrade({
        bestMove: "g1f3",
        centipawnLoss: 300,
        playedMoveUci: "d2d4",
      }),
    ).toBe("mistake");
    expect(
      classifyLatestGameMoveGrade({
        bestMove: "g1f3",
        centipawnLoss: 650,
        playedMoveUci: "d2d4",
      }),
    ).toBe("blunder");
  });

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

  it("treats all-day and single-game saved analysis as separate scopes", () => {
    installLocalStorageMock();
    const normalizedGames = normalizeChessComGames(
      [
        game({ end_time: dayOneMorning, url: "https://www.chess.com/game/live/scope-1" }),
        game({ end_time: dayOneAfternoon, url: "https://www.chess.com/game/live/scope-2" }),
      ],
      "TestPlayer",
    );
    const day = summarizeDailyChessGames(normalizedGames)[0];
    const cacheKey = buildDayAnalysisCacheKey({
      date: day.date,
      games: day.games,
      settings: defaultSelectedDayAnalysisSettings,
      username: "TestPlayer",
    });
    const cachedReport: DailyEngineAnalysisReport = {
      analyzedGameUrls: day.games.map((cachedGame) => cachedGame.gameUrl),
      cacheKey,
      completedAt: "2026-06-02T12:00:00.000Z",
      criticalMoves: [],
      gameStatuses: day.games.map((cachedGame) => ({
        analyzedMoveCount: 1,
        candidateMoveCount: 1,
        criticalMoveCount: 0,
        gameUrl: cachedGame.gameUrl,
        status: "analyzed",
      })),
      homeworkPuzzles: [],
      incomplete: false,
      settings: defaultSelectedDayAnalysisSettings,
      skippedGames: [],
      source: "stockfish-lite-single",
    };
    writeCachedDailyAnalysis(cacheKey, cachedReport);

    const allDayStatus = summarizeCachedAnalysisStatus({
      date: day.date,
      games: day.games,
      settings: defaultSelectedDayAnalysisSettings,
      username: "TestPlayer",
    });
    const singleGameStatus = summarizeCachedAnalysisStatus({
      date: day.date,
      games: [day.games[0]],
      settings: defaultSelectedDayAnalysisSettings,
      username: "TestPlayer",
    });
    const relatedStatuses = readRelatedDailyAnalysisStatuses({ date: day.date, username: "TestPlayer" });

    expect(allDayStatus).toMatchObject({
      analyzedGameCount: 2,
      gameCount: 2,
      status: "cached_complete",
    });
    expect(singleGameStatus).toMatchObject({
      analyzedGameCount: 0,
      gameCount: 1,
      status: "not_analyzed",
    });
    expect(relatedStatuses.map((status) => status.cacheKey)).toContain(cacheKey);
  });

  it("finds related saved runs when current settings do not match", () => {
    installLocalStorageMock();
    const normalizedGames = normalizeChessComGames(
      [game({ end_time: dayOneMorning, url: "https://www.chess.com/game/live/settings-1" })],
      "TestPlayer",
    );
    const day = summarizeDailyChessGames(normalizedGames)[0];
    const cacheKey = buildDayAnalysisCacheKey({
      date: day.date,
      games: day.games,
      settings: defaultSelectedDayAnalysisSettings,
      username: "TestPlayer",
    });
    writeCachedDailyAnalysis(cacheKey, {
      analyzedGameUrls: day.games.map((cachedGame) => cachedGame.gameUrl),
      cacheKey,
      completedAt: "2026-06-02T12:00:00.000Z",
      criticalMoves: [],
      gameStatuses: [
        {
          analyzedMoveCount: 1,
          candidateMoveCount: 1,
          criticalMoveCount: 0,
          gameUrl: day.games[0].gameUrl,
          status: "analyzed",
        },
      ],
      homeworkPuzzles: [],
      incomplete: false,
      settings: defaultSelectedDayAnalysisSettings,
      skippedGames: [],
      source: "stockfish-lite-single",
    });

    const mismatchedSettings = { ...defaultSelectedDayAnalysisSettings, depth: 12 };
    const currentStatus = summarizeCachedAnalysisStatus({
      date: day.date,
      games: day.games,
      settings: mismatchedSettings,
      username: "TestPlayer",
    });
    const relatedStatuses = readRelatedDailyAnalysisStatuses({ date: day.date, username: "TestPlayer" });

    expect(currentStatus).toMatchObject({
      analyzedGameCount: 0,
      gameCount: 1,
      settings: mismatchedSettings,
      status: "not_analyzed",
    });
    expect(relatedStatuses).toHaveLength(1);
    expect(relatedStatuses[0]).toMatchObject({
      cacheKey,
      settings: defaultSelectedDayAnalysisSettings,
      status: "cached_complete",
    });
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
