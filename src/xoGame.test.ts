import { describe, expect, it } from "vitest";
import {
  applyMove,
  createBoard,
  getIllegalMoveReason,
  hasNoValidMove,
  listLegalMoves,
  parseStripLengths,
  type Board,
} from "./xoGame";

describe("parseStripLengths", () => {
  it("parses comma-separated strip lengths", () => {
    expect(parseStripLengths("1,2,3,5,8")).toEqual([1, 2, 3, 5, 8]);
  });

  it("rejects invalid lengths", () => {
    expect(() => parseStripLengths("2, 0, 4")).toThrow(/at least 1/);
    expect(() => parseStripLengths("2, x, 4")).toThrow(/whole numbers/);
  });
});

describe("XO move rules", () => {
  it("requires moves on blank strips while any blank strip remains", () => {
    const board = createBoard([2, 2]);
    const firstMove = applyMove(board, "X", {
      stripIndex: 0,
      cellIndex: 0,
      color: "red",
    });

    expect(firstMove.ok).toBe(true);
    if (!firstMove.ok) {
      return;
    }

    expect(
      getIllegalMoveReason(firstMove.board, "O", {
        stripIndex: 0,
        cellIndex: 1,
        color: "blue",
      }),
    ).toMatch(/blank strip/);

    expect(
      getIllegalMoveReason(firstMove.board, "O", {
        stripIndex: 1,
        cellIndex: 0,
        color: "blue",
      }),
    ).toBeNull();
  });

  it("blocks adjacent same symbol", () => {
    const board: Board = [[{ symbol: "X", color: "red" }, null]];

    expect(
      getIllegalMoveReason(board, "X", {
        stripIndex: 0,
        cellIndex: 1,
        color: "blue",
      }),
    ).toMatch(/different symbols/);
  });

  it("blocks adjacent same color", () => {
    const board: Board = [[{ symbol: "X", color: "red" }, null]];

    expect(
      getIllegalMoveReason(board, "O", {
        stripIndex: 0,
        cellIndex: 1,
        color: "red",
      }),
    ).toMatch(/different colors/);
  });

  it("allows adjacent different symbol and different color", () => {
    const board: Board = [[{ symbol: "X", color: "red" }, null]];

    expect(
      getIllegalMoveReason(board, "O", {
        stripIndex: 0,
        cellIndex: 1,
        color: "blue",
      }),
    ).toBeNull();
  });

  it("detects game over when the current player has no legal moves", () => {
    const board: Board = [
      [{ symbol: "X", color: "red" }, null, { symbol: "O", color: "blue" }],
    ];

    expect(listLegalMoves(board, "O")).toEqual([]);
    expect(hasNoValidMove(board, "O")).toBe(true);
  });

  it("sets the previous mover as winner when the next player has no move", () => {
    const board: Board = [[{ symbol: "O", color: "red" }, null]];
    const result = applyMove(board, "X", {
      stripIndex: 0,
      cellIndex: 1,
      color: "blue",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.winner).toBe("X");
    }
  });
});
