import { describe, expect, it } from "vitest";
import { applyMove as applyXoMove, createBoard, listLegalMoves as listXoLegalMoves } from "../xoGame";
import {
  applyDomineeringMove,
  applyHexMove,
  applyKonaneMove,
  initialKonaneBoard,
  listDomineeringLegalMoves,
  listHexLegalMoves,
  listKonaneLegalMoves,
  makeMatrix,
  selectDomineeringComputerMove,
  selectHexComputerMove,
  selectKonaneComputerMove,
  selectXoComputerMove,
  type CellOwner,
  type DomineeringPlayer,
} from "./boardGameOpponents";

describe("board game opponent selectors", () => {
  it("returns only legal XO moves and does not mutate the input board", () => {
    const board = createBoard([2, 3]);
    const before = JSON.stringify(board);
    const move = selectXoComputerMove({ board, player: "X", difficulty: "normal", random: () => 0 });

    expect(move).not.toBeNull();
    expect(listXoLegalMoves(board, "X")).toContainEqual(move);
    expect(applyXoMove(board, "X", move!)).toMatchObject({ ok: true });
    expect(JSON.stringify(board)).toBe(before);
  });

  it("returns null when XO has no legal move", () => {
    const board = [[{ symbol: "X" as const, color: "red" as const }]];
    expect(selectXoComputerMove({ board, player: "O", difficulty: "easy" })).toBeNull();
  });

  it("returns only legal Hex moves and leaves the board unchanged", () => {
    const board = makeMatrix<CellOwner>(3, null);
    board[1][1] = "A";
    const before = JSON.stringify(board);
    const move = selectHexComputerMove({ board, player: "B", difficulty: "normal", random: () => 0 });

    expect(move).not.toBeNull();
    expect(listHexLegalMoves(board)).toContainEqual(move);
    expect(applyHexMove(board, "B", move!)).not.toBeNull();
    expect(JSON.stringify(board)).toBe(before);
  });

  it("returns null when Hex has no empty cell", () => {
    const board: CellOwner[][] = [
      ["A", "B"],
      ["B", "A"],
    ];
    expect(selectHexComputerMove({ board, player: "B", difficulty: "normal" })).toBeNull();
  });

  it("returns only legal Domineering moves and leaves the board unchanged", () => {
    const board = makeMatrix<DomineeringPlayer | null>(4, null);
    board[0][0] = "V";
    const before = JSON.stringify(board);
    const move = selectDomineeringComputerMove({ board, player: "H", difficulty: "normal", random: () => 0 });

    expect(move).not.toBeNull();
    expect(listDomineeringLegalMoves(board, "H")).toContainEqual(move);
    expect(applyDomineeringMove(board, "H", move!)).not.toBeNull();
    expect(JSON.stringify(board)).toBe(before);
  });

  it("returns null when Domineering has no legal placement", () => {
    const board = makeMatrix<DomineeringPlayer | null>(2, "V");
    expect(selectDomineeringComputerMove({ board, player: "H", difficulty: "easy" })).toBeNull();
  });

  it("returns only legal Konane moves and leaves the board unchanged", () => {
    const board = initialKonaneBoard();
    const before = JSON.stringify(board);
    const move = selectKonaneComputerMove({ board, player: "B", difficulty: "normal", random: () => 0 });

    expect(move).not.toBeNull();
    expect(listKonaneLegalMoves(board, "B")).toContainEqual(move);
    expect(applyKonaneMove(board, "B", move!)).not.toBeNull();
    expect(JSON.stringify(board)).toBe(before);
  });

  it("returns null when Konane has no legal jump", () => {
    const board = makeMatrix<"B" | "W" | null>(4, null);
    board[0][0] = "B";
    expect(selectKonaneComputerMove({ board, player: "B", difficulty: "easy" })).toBeNull();
  });
});
