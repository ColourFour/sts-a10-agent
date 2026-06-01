import { describe, expect, it } from "vitest";
import { applyMove as applyXoMove, createBoard, listLegalMoves as listXoLegalMoves } from "../xoGame";
import { createInitialTwelveJanggiState } from "./twelve-janggi/twelveJanggiEngine";
import { Chess } from "chess.js";
import {
  applyDomineeringMove,
  applyHexMove,
  applyKonaneMove,
  initialKonaneBoard,
  initialMiniShogiBoard,
  initialMorrisState,
  applyMiniShogiMove,
  applyMorrisAction,
  applyTwelveJanggiComputerMove,
  listMiniShogiLegalMoves,
  listMorrisLegalActions,
  listTwelveJanggiLegalMoves,
  listDomineeringLegalMoves,
  listHexLegalMoves,
  listKonaneLegalMoves,
  makeMatrix,
  selectChessComputerMove,
  selectDomineeringComputerMove,
  selectHexComputerMove,
  selectKonaneComputerMove,
  selectMiniShogiComputerMove,
  selectMorrisComputerAction,
  selectTwelveJanggiComputerMove,
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

  it("returns legal Morris actions and leaves the state unchanged", () => {
    const state = { ...initialMorrisState(), currentPlayer: "B" as const };
    const before = JSON.stringify(state);
    const action = selectMorrisComputerAction({ state, difficulty: "normal", random: () => 0 });

    expect(action).not.toBeNull();
    expect(listMorrisLegalActions(state)).toContainEqual(action);
    expect(applyMorrisAction(state, action!)).not.toBeNull();
    expect(JSON.stringify(state)).toBe(before);
  });

  it("returns legal Mini Shogi moves and leaves inputs unchanged", () => {
    const board = initialMiniShogiBoard();
    const hands = { A: [], B: [] };
    const before = JSON.stringify({ board, hands });
    const move = selectMiniShogiComputerMove({ board, hands, player: "B", difficulty: "normal", random: () => 0 });

    expect(move).not.toBeNull();
    expect(listMiniShogiLegalMoves(board, hands, "B")).toContainEqual(move);
    expect(applyMiniShogiMove(board, hands, "B", move!)).not.toBeNull();
    expect(JSON.stringify({ board, hands })).toBe(before);
  });

  it("returns legal Twelve Janggi moves and leaves state unchanged", () => {
    const state = { ...createInitialTwelveJanggiState(), currentPlayer: "B" as const };
    const before = JSON.stringify(state);
    const move = selectTwelveJanggiComputerMove({ state, difficulty: "normal", random: () => 0 });

    expect(move).not.toBeNull();
    expect(listTwelveJanggiLegalMoves(state)).toContainEqual(move);
    expect(applyTwelveJanggiComputerMove(state, move!)).not.toBeNull();
    expect(JSON.stringify(state)).toBe(before);
  });

  it("returns legal chess moves and null when no legal move exists", () => {
    const game = new Chess();
    game.move("f3");
    const move = selectChessComputerMove({ fen: game.fen(), difficulty: "normal", random: () => 0 });

    expect(move).not.toBeNull();
    expect(game.moves({ verbose: true }).map((legal) => `${legal.from}${legal.to}`)).toContain(`${move!.from}${move!.to}`);

    const mate = new Chess();
    mate.move("f3");
    mate.move("e5");
    mate.move("g4");
    mate.move("Qh4#");
    expect(selectChessComputerMove({ fen: mate.fen(), difficulty: "normal" })).toBeNull();
  });
});
