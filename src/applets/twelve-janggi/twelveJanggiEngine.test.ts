import { describe, expect, it } from "vitest";
import {
  applyDrop,
  applyMove,
  createInitialTwelveJanggiState,
  getLegalDrops,
  getLegalMoves,
} from "./twelveJanggiEngine";
import {
  type Board,
  type GameState,
  type PieceKind,
  type Player,
  squareKey,
} from "./twelveJanggiRules";

function emptyBoard(): Board {
  return Array.from({ length: 4 }, () => Array.from({ length: 3 }, () => null));
}

function piece(owner: Player, kind: PieceKind, id = `${owner}-${kind}`) {
  return { owner, kind, id };
}

function customState(
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

function legalMoveKeys(state: GameState, row: number, col: number): string[] {
  return getLegalMoves(state, { row, col }).map(squareKey).sort();
}

describe("Twelve Janggi setup", () => {
  it("creates the required starting position", () => {
    const state = createInitialTwelveJanggiState();

    expect(state.currentPlayer).toBe("A");
    expect(state.board[3].map((cell) => cell?.kind)).toEqual([
      "minister",
      "king",
      "general",
    ]);
    expect(state.board[2][1]?.kind).toBe("man");
    expect(state.board[0].map((cell) => cell?.kind)).toEqual([
      "minister",
      "king",
      "general",
    ]);
    expect(state.board[1][1]?.kind).toBe("man");
  });
});

describe("Twelve Janggi movement", () => {
  it("allows King movement in every direction within the board", () => {
    const board = emptyBoard();
    board[1][1] = piece("A", "king");
    const state = customState(board, "A");

    expect(legalMoveKeys(state, 1, 1)).toEqual([
      "0:0",
      "0:1",
      "0:2",
      "1:0",
      "1:2",
      "2:0",
      "2:1",
      "2:2",
    ]);
  });

  it("allows General movement orthogonally only", () => {
    const board = emptyBoard();
    board[1][1] = piece("A", "general");
    const state = customState(board, "A");

    expect(legalMoveKeys(state, 1, 1)).toEqual(["0:1", "1:0", "1:2", "2:1"]);
  });

  it("allows Minister movement diagonally only", () => {
    const board = emptyBoard();
    board[1][1] = piece("A", "minister");
    const state = customState(board, "A");

    expect(legalMoveKeys(state, 1, 1)).toEqual(["0:0", "0:2", "2:0", "2:2"]);
  });

  it("moves Men forward for both players", () => {
    const boardA = emptyBoard();
    boardA[2][1] = piece("A", "man");
    expect(legalMoveKeys(customState(boardA, "A"), 2, 1)).toEqual(["1:1"]);

    const boardB = emptyBoard();
    boardB[1][1] = piece("B", "man");
    expect(legalMoveKeys(customState(boardB, "B"), 1, 1)).toEqual(["2:1"]);
  });

  it("promotes a Man reaching the opponent's territory", () => {
    const board = emptyBoard();
    board[1][1] = piece("A", "man", "A-advanced-man");
    const result = applyMove(customState(board, "A"), { row: 1, col: 1 }, { row: 0, col: 1 });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.promoted).toBe(true);
      expect(result.state.board[0][1]?.kind).toBe("feudalLord");
    }
  });

  it("allows Feudal Lord movement except diagonally backward", () => {
    const board = emptyBoard();
    board[1][1] = piece("A", "feudalLord");
    const state = customState(board, "A");

    expect(legalMoveKeys(state, 1, 1)).toEqual([
      "0:0",
      "0:1",
      "0:2",
      "1:0",
      "1:2",
      "2:1",
    ]);
  });

  it("rejects illegal moves", () => {
    const state = createInitialTwelveJanggiState();
    const result = applyMove(state, { row: 3, col: 0 }, { row: 2, col: 0 });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/not legal/);
    }
  });
});

describe("Twelve Janggi captures, drops, and wins", () => {
  it("adds captured normal pieces to the capturer's hand", () => {
    const board = emptyBoard();
    board[2][1] = piece("A", "general");
    board[1][1] = piece("B", "minister");
    const result = applyMove(customState(board, "A"), { row: 2, col: 1 }, { row: 1, col: 1 });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.capturedPiece?.kind).toBe("minister");
      expect(result.state.capturedHands.A).toEqual(["minister"]);
    }
  });

  it("captures Feudal Lords as Men", () => {
    const board = emptyBoard();
    board[1][0] = piece("B", "general");
    board[1][1] = piece("A", "feudalLord");
    const result = applyMove(customState(board, "B"), { row: 1, col: 0 }, { row: 1, col: 1 });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.capturedHands.B).toEqual(["man"]);
    }
  });

  it("wins immediately by capturing the enemy King", () => {
    const board = emptyBoard();
    board[1][0] = piece("A", "general");
    board[1][1] = piece("B", "king");
    const result = applyMove(customState(board, "A"), { row: 1, col: 0 }, { row: 1, col: 1 });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.winner).toBe("A");
      expect(result.winnerReason).toMatch(/captured/);
    }
  });

  it("blocks drops into the opponent's territory", () => {
    const board = emptyBoard();
    const state = customState(board, "A", {
      capturedHands: { A: ["general"], B: [] },
    });

    expect(getLegalDrops(state, "A", "general").map(squareKey)).not.toContain("0:0");

    const result = applyDrop(state, "A", "general", { row: 0, col: 0 });
    expect(result.ok).toBe(false);
  });

  it("drops a captured piece as a full turn", () => {
    const board = emptyBoard();
    const state = customState(board, "A", {
      capturedHands: { A: ["man"], B: [] },
    });
    const result = applyDrop(state, "A", "man", { row: 2, col: 0 });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.board[2][0]?.kind).toBe("man");
      expect(result.state.board[2][0]?.owner).toBe("A");
      expect(result.state.currentPlayer).toBe("B");
      expect(result.state.capturedHands.A).toEqual([]);
    }
  });

  it("lets the capturer replay a captured piece as their own piece instead of moving", () => {
    const board = emptyBoard();
    board[2][1] = piece("A", "general", "A-general");
    board[1][1] = piece("B", "minister", "B-minister");

    const capture = applyMove(
      customState(board, "A"),
      { row: 2, col: 1 },
      { row: 1, col: 1 },
    );

    expect(capture.ok).toBe(true);
    if (!capture.ok) {
      return;
    }

    expect(capture.state.capturedHands.A).toEqual(["minister"]);
    expect(capture.state.currentPlayer).toBe("B");

    const afterBPassByDrop = applyDrop(
      {
        ...capture.state,
        capturedHands: { ...capture.state.capturedHands, B: ["man"] },
      },
      "B",
      "man",
      { row: 2, col: 0 },
    );

    expect(afterBPassByDrop.ok).toBe(true);
    if (!afterBPassByDrop.ok) {
      return;
    }

    const replay = applyDrop(
      afterBPassByDrop.state,
      "A",
      "minister",
      { row: 2, col: 2 },
    );

    expect(replay.ok).toBe(true);
    if (replay.ok) {
      expect(replay.state.board[2][2]).toMatchObject({
        owner: "A",
        kind: "minister",
      });
      expect(replay.state.currentPlayer).toBe("B");
      expect(replay.state.capturedHands.A).toEqual([]);
    }
  });

  it("requires King territory wins to survive until the next turn begins", () => {
    const board = emptyBoard();
    board[1][1] = piece("A", "king", "A-king");
    const entry = applyMove(customState(board, "A"), { row: 1, col: 1 }, { row: 0, col: 1 });

    expect(entry.ok).toBe(true);
    if (!entry.ok) {
      return;
    }

    expect(entry.state.winner).toBeNull();
    expect(entry.state.pendingKingTerritoryThreat?.player).toBe("A");

    const response = applyDrop(
      {
        ...entry.state,
        capturedHands: { A: [], B: ["general"] },
      },
      "B",
      "general",
      { row: 2, col: 0 },
    );

    expect(response.ok).toBe(true);
    if (response.ok) {
      expect(response.state.winner).toBe("A");
      expect(response.winnerReason).toMatch(/survived/);
    }
  });
});
