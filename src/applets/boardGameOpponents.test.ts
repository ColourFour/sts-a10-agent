import { describe, expect, it } from "vitest";
import { applyMove as applyXoMove, createBoard, listLegalMoves as listXoLegalMoves } from "../xoGame";
import { createInitialTwelveJanggiState } from "./twelve-janggi/twelveJanggiEngine";
import type { Board, GameState, PieceKind, Player } from "./twelve-janggi/twelveJanggiRules";
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

function emptyTwelveJanggiBoard(): Board {
  return Array.from({ length: 4 }, () => Array.from({ length: 3 }, () => null));
}

function twelveJanggiPiece(owner: Player, kind: PieceKind, id = `${owner}-${kind}`) {
  return { owner, kind, id };
}

function customTwelveJanggiState(
  board: Board,
  currentPlayer: Player,
  extra?: Partial<GameState>,
): GameState {
  return {
    ...createInitialTwelveJanggiState(),
    board,
    currentPlayer,
    capturedHands: { A: [], B: [] },
    pendingKingTerritoryThreat: null,
    winner: null,
    selectedSquare: null,
    selectedCapturedPiece: null,
    legalTargets: [],
    nextPieceId: 1,
    ...extra,
  };
}

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

  it("Twelve Janggi normal search takes an immediate King capture", () => {
    const board = emptyTwelveJanggiBoard();
    board[1][1] = twelveJanggiPiece("B", "general", "B-general");
    board[2][1] = twelveJanggiPiece("A", "king", "A-target-king");
    board[3][2] = twelveJanggiPiece("B", "king", "B-king");
    const state = customTwelveJanggiState(board, "B");

    const move = selectTwelveJanggiComputerMove({ state, difficulty: "normal" });
    const result = move ? applyTwelveJanggiComputerMove(state, move) : null;

    expect(move).toMatchObject({ type: "move", to: { row: 2, col: 1 } });
    expect(result?.winner).toBe("B");
  });

  it("Twelve Janggi normal search does not leave its King open to an immediate capture", () => {
    const board = emptyTwelveJanggiBoard();
    board[1][1] = twelveJanggiPiece("B", "king", "B-king");
    board[2][1] = twelveJanggiPiece("A", "general", "A-general");
    board[3][2] = twelveJanggiPiece("A", "king", "A-king");
    board[3][0] = twelveJanggiPiece("B", "man", "B-man");
    const state = customTwelveJanggiState(board, "B");

    const move = selectTwelveJanggiComputerMove({ state, difficulty: "normal" });
    const result = move ? applyTwelveJanggiComputerMove(state, move) : null;
    const bKingSquare = result?.board.flatMap((row, rowIndex) =>
      row.flatMap((piece, colIndex) => piece?.owner === "B" && piece.kind === "king" ? [{ row: rowIndex, col: colIndex }] : []),
    )[0];
    const opponentReplies = result ? listTwelveJanggiLegalMoves({ ...result, currentPlayer: "A" }) : [];

    expect(move).not.toBeNull();
    expect(bKingSquare).toBeTruthy();
    expect(
      opponentReplies.some(
        (reply) =>
          reply.type === "move" &&
          reply.to.row === bKingSquare!.row &&
          reply.to.col === bKingSquare!.col,
      ),
    ).toBe(false);
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
