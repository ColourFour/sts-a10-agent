import { Chess, type Move as ChessMove, type Square as ChessSquare } from "chess.js";
import {
  applyDrop as applyTwelveJanggiDrop,
  applyMove as applyTwelveJanggiMove,
  getLegalDrops as getTwelveJanggiLegalDrops,
  getLegalMoves as getTwelveJanggiLegalMoves,
} from "./twelve-janggi/twelveJanggiEngine";
import {
  BOARD_COLS,
  BOARD_ROWS,
  type GameState as TwelveJanggiState,
  type PieceKind as TwelveJanggiPieceKind,
  type Player as TwelveJanggiPlayer,
  type Square as TwelveJanggiSquare,
} from "./twelve-janggi/twelveJanggiRules";
import { applyMove as applyXoMove, listLegalMoves as listXoLegalMoves, type Board as XoBoard, type Move as XoMove, type SymbolMark } from "../xoGame";

export type OpponentDifficulty = "easy" | "normal" | "hard";
export type GameMode = "twoPlayer" | "computer";
export type Point = { row: number; col: number };
export type PlayerMark = "A" | "B";
export type CellOwner = PlayerMark | null;
export type DomineeringPlayer = "V" | "H";
export type KonanePlayer = "B" | "W";
export type KonanePiece = KonanePlayer | null;

export const computerThinkingDelayMs = 450;

export function otherPlayer(player: PlayerMark): PlayerMark {
  return player === "A" ? "B" : "A";
}

export function pointKey(point: Point): string {
  return `${point.row}:${point.col}`;
}

export function inBounds(point: Point, size: number): boolean {
  return point.row >= 0 && point.row < size && point.col >= 0 && point.col < size;
}

export function makeMatrix<T>(size: number, value: T): T[][] {
  return Array.from({ length: size }, () => Array.from({ length: size }, () => value));
}

export function cloneMatrix<T>(board: T[][]): T[][] {
  return board.map((row) => row.slice());
}

export function chooseRandomMove<T>(moves: readonly T[], random = Math.random): T | null {
  if (moves.length === 0) {
    return null;
  }

  return moves[Math.floor(random() * moves.length)];
}

function chooseBestByScore<T>(
  moves: readonly T[],
  scoreMove: (move: T) => number,
  random = Math.random,
): T | null {
  if (moves.length === 0) {
    return null;
  }

  const scored = moves.map((move) => ({ move, score: scoreMove(move) }));
  const bestScore = Math.max(...scored.map((entry) => entry.score));
  return chooseRandomMove(scored.filter((entry) => entry.score === bestScore), random)?.move ?? null;
}

export function selectXoComputerMove({
  board,
  player,
  difficulty,
  random,
}: {
  board: XoBoard;
  player: SymbolMark;
  difficulty: OpponentDifficulty;
  random?: () => number;
}): XoMove | null {
  const moves = listXoLegalMoves(board, player);
  if (difficulty === "easy") {
    return chooseRandomMove(moves, random);
  }

  const boardSize = board.reduce((total, strip) => total + strip.length, 0);
  return chooseBestByScore(
    moves,
    (move) => {
      const result = applyXoMove(board, player, move);
      if (!result.ok) {
        return Number.NEGATIVE_INFINITY;
      }

      let score = result.winner ? 1000 : 0;
      const opponentMoves = listXoLegalMoves(result.board, result.nextPlayer).length;
      score -= opponentMoves * 4;
      score += Math.max(0, boardSize - Math.abs(move.cellIndex - (board[move.stripIndex].length - 1) / 2));
      if (move.cellIndex === 0 || move.cellIndex === board[move.stripIndex].length - 1) {
        score += 2;
      }
      return score;
    },
    random,
  );
}

export function neighborsHex(point: Point, size: number): Point[] {
  return [
    { row: point.row - 1, col: point.col },
    { row: point.row - 1, col: point.col + 1 },
    { row: point.row, col: point.col - 1 },
    { row: point.row, col: point.col + 1 },
    { row: point.row + 1, col: point.col - 1 },
    { row: point.row + 1, col: point.col },
  ].filter((next) => inBounds(next, size));
}

export function hexHasConnection(board: CellOwner[][], player: PlayerMark): boolean {
  const size = board.length;
  const queue: Point[] = [];
  const seen = new Set<string>();

  for (let index = 0; index < size; index += 1) {
    const start = player === "A" ? { row: index, col: 0 } : { row: 0, col: index };
    if (board[start.row][start.col] === player) {
      queue.push(start);
      seen.add(pointKey(start));
    }
  }

  while (queue.length > 0) {
    const point = queue.shift()!;
    if ((player === "A" && point.col === size - 1) || (player === "B" && point.row === size - 1)) {
      return true;
    }

    neighborsHex(point, size).forEach((next) => {
      const key = pointKey(next);
      if (!seen.has(key) && board[next.row][next.col] === player) {
        seen.add(key);
        queue.push(next);
      }
    });
  }

  return false;
}

export function listHexLegalMoves(board: CellOwner[][]): Point[] {
  return board.flatMap((row, rowIndex) =>
    row.flatMap((cell, colIndex) => (cell === null ? [{ row: rowIndex, col: colIndex }] : [])),
  );
}

export function applyHexMove(board: CellOwner[][], player: PlayerMark, point: Point): { board: CellOwner[][]; winner: PlayerMark | null } | null {
  if (!inBounds(point, board.length) || board[point.row][point.col] !== null) {
    return null;
  }

  const nextBoard = cloneMatrix(board);
  nextBoard[point.row][point.col] = player;
  return { board: nextBoard, winner: hexHasConnection(nextBoard, player) ? player : null };
}

export function selectHexComputerMove({
  board,
  player,
  difficulty,
  random,
}: {
  board: CellOwner[][];
  player: PlayerMark;
  difficulty: OpponentDifficulty;
  random?: () => number;
}): Point | null {
  const moves = listHexLegalMoves(board);
  if (difficulty === "easy") {
    return chooseRandomMove(moves, random);
  }

  const size = board.length;
  const opponent = otherPlayer(player);
  const center = (size - 1) / 2;
  return chooseBestByScore(
    moves,
    (move) => {
      const ownNeighbors = neighborsHex(move, size).filter((next) => board[next.row][next.col] === player).length;
      const opponentNeighbors = neighborsHex(move, size).filter((next) => board[next.row][next.col] === opponent).length;
      const directionScore = player === "A"
        ? Math.min(move.col, size - 1 - move.col)
        : Math.min(move.row, size - 1 - move.row);
      const centerScore = size - Math.abs(move.row - center) - Math.abs(move.col - center);
      return ownNeighbors * 8 + opponentNeighbors * 4 + directionScore * 2 + centerScore;
    },
    random,
  );
}

export function otherDomineeringPlayer(player: DomineeringPlayer): DomineeringPlayer {
  return player === "V" ? "H" : "V";
}

export function canPlaceDomino(board: (DomineeringPlayer | null)[][], player: DomineeringPlayer, point: Point): boolean {
  const size = board.length;
  const second = player === "V" ? { row: point.row + 1, col: point.col } : { row: point.row, col: point.col + 1 };
  return inBounds(point, size) && inBounds(second, size) && !board[point.row][point.col] && !board[second.row][second.col];
}

export function listDomineeringLegalMoves(board: (DomineeringPlayer | null)[][], player: DomineeringPlayer): Point[] {
  return board.flatMap((row, rowIndex) =>
    row.flatMap((_, colIndex) => {
      const move = { row: rowIndex, col: colIndex };
      return canPlaceDomino(board, player, move) ? [move] : [];
    }),
  );
}

export function applyDomineeringMove(
  board: (DomineeringPlayer | null)[][],
  player: DomineeringPlayer,
  point: Point,
): { board: (DomineeringPlayer | null)[][]; winner: DomineeringPlayer | null; nextPlayer: DomineeringPlayer } | null {
  if (!canPlaceDomino(board, player, point)) {
    return null;
  }

  const nextBoard = cloneMatrix(board);
  const second = player === "V" ? { row: point.row + 1, col: point.col } : { row: point.row, col: point.col + 1 };
  nextBoard[point.row][point.col] = player;
  nextBoard[second.row][second.col] = player;
  const nextPlayer = otherDomineeringPlayer(player);
  return {
    board: nextBoard,
    nextPlayer,
    winner: listDomineeringLegalMoves(nextBoard, nextPlayer).length > 0 ? null : player,
  };
}

export function selectDomineeringComputerMove({
  board,
  player,
  difficulty,
  random,
}: {
  board: (DomineeringPlayer | null)[][];
  player: DomineeringPlayer;
  difficulty: OpponentDifficulty;
  random?: () => number;
}): Point | null {
  const moves = listDomineeringLegalMoves(board, player);
  if (difficulty === "easy") {
    return chooseRandomMove(moves, random);
  }

  return chooseBestByScore(
    moves,
    (move) => {
      const result = applyDomineeringMove(board, player, move);
      if (!result) {
        return Number.NEGATIVE_INFINITY;
      }
      const ownMobility = listDomineeringLegalMoves(result.board, player).length;
      const opponentMobility = listDomineeringLegalMoves(result.board, result.nextPlayer).length;
      return (result.winner ? 1000 : 0) + ownMobility * 3 - opponentMobility * 6;
    },
    random,
  );
}

export function initialKonaneBoard(size = 6): KonanePiece[][] {
  const board: KonanePiece[][] = makeMatrix<KonanePiece>(size, null).map((row, rowIndex) =>
    row.map<KonanePiece>((_, colIndex) => ((rowIndex + colIndex) % 2 === 0 ? "B" : "W")),
  );
  board[2][2] = null;
  board[3][3] = null;
  return board;
}

export function otherKonanePlayer(player: KonanePlayer): KonanePlayer {
  return player === "B" ? "W" : "B";
}

export function legalKonaneJumps(board: KonanePiece[][], from: Point, player: KonanePlayer): Point[] {
  if (!inBounds(from, board.length) || board[from.row][from.col] !== player) {
    return [];
  }

  return [
    { row: -2, col: 0 },
    { row: 2, col: 0 },
    { row: 0, col: -2 },
    { row: 0, col: 2 },
  ]
    .map((delta) => ({ row: from.row + delta.row, col: from.col + delta.col }))
    .filter((to) => {
      const middle = { row: (from.row + to.row) / 2, col: (from.col + to.col) / 2 };
      return (
        inBounds(to, board.length) &&
        board[to.row][to.col] === null &&
        board[middle.row][middle.col] === otherKonanePlayer(player)
      );
    });
}

export type KonaneMove = { from: Point; to: Point };

export function listKonaneLegalMoves(board: KonanePiece[][], player: KonanePlayer): KonaneMove[] {
  return board.flatMap((row, rowIndex) =>
    row.flatMap((cell, colIndex) =>
      cell === player
        ? legalKonaneJumps(board, { row: rowIndex, col: colIndex }, player).map((to) => ({
            from: { row: rowIndex, col: colIndex },
            to,
          }))
        : [],
    ),
  );
}

export function applyKonaneMove(
  board: KonanePiece[][],
  player: KonanePlayer,
  move: KonaneMove,
): { board: KonanePiece[][]; winner: KonanePlayer | null; nextPlayer: KonanePlayer } | null {
  if (!legalKonaneJumps(board, move.from, player).some((jump) => pointKey(jump) === pointKey(move.to))) {
    return null;
  }

  const nextBoard = cloneMatrix(board);
  const middle = { row: (move.from.row + move.to.row) / 2, col: (move.from.col + move.to.col) / 2 };
  nextBoard[move.to.row][move.to.col] = player;
  nextBoard[move.from.row][move.from.col] = null;
  nextBoard[middle.row][middle.col] = null;
  const nextPlayer = otherKonanePlayer(player);
  return {
    board: nextBoard,
    nextPlayer,
    winner: listKonaneLegalMoves(nextBoard, nextPlayer).length > 0 ? null : player,
  };
}

export function selectKonaneComputerMove({
  board,
  player,
  difficulty,
  random,
}: {
  board: KonanePiece[][];
  player: KonanePlayer;
  difficulty: OpponentDifficulty;
  random?: () => number;
}): KonaneMove | null {
  const moves = listKonaneLegalMoves(board, player);
  if (difficulty === "easy") {
    return chooseRandomMove(moves, random);
  }

  return chooseBestByScore(
    moves,
    (move) => {
      const result = applyKonaneMove(board, player, move);
      if (!result) {
        return Number.NEGATIVE_INFINITY;
      }
      const ownMobility = listKonaneLegalMoves(result.board, player).length;
      const opponentMobility = listKonaneLegalMoves(result.board, result.nextPlayer).length;
      const center = (board.length - 1) / 2;
      const centerScore = board.length - Math.abs(move.to.row - center) - Math.abs(move.to.col - center);
      return (result.winner ? 1000 : 0) + ownMobility * 5 - opponentMobility * 4 + centerScore;
    },
    random,
  );
}

export type MorrisPhase = "placing" | "moving" | "removing";
export type MorrisState = {
  board: Record<string, CellOwner>;
  currentPlayer: PlayerMark;
  phase: MorrisPhase;
  placed: Record<PlayerMark, number>;
  selected: string | null;
  winner: PlayerMark | null;
  message: string;
};
export type MorrisAction =
  | { type: "place"; key: string }
  | { type: "move"; from: string; to: string }
  | { type: "remove"; key: string };

export const morrisPoints = [
  [0, 0], [0, 3], [0, 6], [1, 1], [1, 3], [1, 5], [2, 2], [2, 3],
  [2, 4], [3, 0], [3, 1], [3, 2], [3, 4], [3, 5], [3, 6], [4, 2],
  [4, 3], [4, 4], [5, 1], [5, 3], [5, 5], [6, 0], [6, 3], [6, 6],
].map(([row, col]) => `${row}:${col}`);

export const morrisAdjacency: Record<string, string[]> = {
  "0:0": ["0:3", "3:0"], "0:3": ["0:0", "0:6", "1:3"], "0:6": ["0:3", "3:6"],
  "1:1": ["1:3", "3:1"], "1:3": ["0:3", "1:1", "1:5", "2:3"], "1:5": ["1:3", "3:5"],
  "2:2": ["2:3", "3:2"], "2:3": ["1:3", "2:2", "2:4"], "2:4": ["2:3", "3:4"],
  "3:0": ["0:0", "3:1", "6:0"], "3:1": ["1:1", "3:0", "3:2", "5:1"], "3:2": ["2:2", "3:1", "4:2"],
  "3:4": ["2:4", "3:5", "4:4"], "3:5": ["1:5", "3:4", "3:6", "5:5"], "3:6": ["0:6", "3:5", "6:6"],
  "4:2": ["3:2", "4:3"], "4:3": ["4:2", "4:4", "5:3"], "4:4": ["3:4", "4:3"],
  "5:1": ["3:1", "5:3"], "5:3": ["4:3", "5:1", "5:5", "6:3"], "5:5": ["3:5", "5:3"],
  "6:0": ["3:0", "6:3"], "6:3": ["5:3", "6:0", "6:6"], "6:6": ["3:6", "6:3"],
};

export const morrisMills = [
  ["0:0", "0:3", "0:6"], ["1:1", "1:3", "1:5"], ["2:2", "2:3", "2:4"],
  ["3:0", "3:1", "3:2"], ["3:4", "3:5", "3:6"], ["4:2", "4:3", "4:4"],
  ["5:1", "5:3", "5:5"], ["6:0", "6:3", "6:6"], ["0:0", "3:0", "6:0"],
  ["1:1", "3:1", "5:1"], ["2:2", "3:2", "4:2"], ["0:3", "1:3", "2:3"],
  ["4:3", "5:3", "6:3"], ["2:4", "3:4", "4:4"], ["1:5", "3:5", "5:5"],
  ["0:6", "3:6", "6:6"],
];

export function initialMorrisState(): MorrisState {
  return {
    board: Object.fromEntries(morrisPoints.map((key) => [key, null])),
    currentPlayer: "A",
    phase: "placing",
    placed: { A: 0, B: 0 },
    selected: null,
    winner: null,
    message: "Player A places first.",
  };
}

export function formsMorrisMill(board: Record<string, CellOwner>, player: PlayerMark, key: string): boolean {
  return morrisMills.some((mill) => mill.includes(key) && mill.every((point) => board[point] === player));
}

export function morrisPieceCount(board: Record<string, CellOwner>, player: PlayerMark): number {
  return Object.values(board).filter((cell) => cell === player).length;
}

export function morrisPieces(board: Record<string, CellOwner>, player: PlayerMark): string[] {
  return morrisPoints.filter((key) => board[key] === player);
}

export function morrisPieceIsInMill(board: Record<string, CellOwner>, player: PlayerMark, key: string): boolean {
  return morrisMills.some((mill) => mill.includes(key) && mill.every((point) => board[point] === player));
}

export function canRemoveMorrisPiece(board: Record<string, CellOwner>, remover: PlayerMark, key: string): boolean {
  const opponent = otherPlayer(remover);
  if (board[key] !== opponent) {
    return false;
  }
  const opponentPieces = morrisPieces(board, opponent);
  return opponentPieces.every((pieceKey) => morrisPieceIsInMill(board, opponent, pieceKey)) || !morrisPieceIsInMill(board, opponent, key);
}

export function morrisLegalDestinations(board: Record<string, CellOwner>, from: string, player: PlayerMark): string[] {
  if (board[from] !== player) {
    return [];
  }
  return morrisPieceCount(board, player) === 3
    ? morrisPoints.filter((key) => board[key] === null)
    : morrisAdjacency[from].filter((key) => board[key] === null);
}

export function morrisHasMove(board: Record<string, CellOwner>, player: PlayerMark): boolean {
  if (morrisPieceCount(board, player) < 3) {
    return false;
  }
  return morrisPieces(board, player).some((key) => morrisLegalDestinations(board, key, player).length > 0);
}

function finishMorrisTurn(next: MorrisState, millKey: string | null): MorrisState {
  if (millKey && formsMorrisMill(next.board, next.currentPlayer, millKey)) {
    return { ...next, phase: "removing", message: `Player ${next.currentPlayer} formed a mill. Remove one enemy piece.` };
  }

  const nextPlayer = otherPlayer(next.currentPlayer);
  const movingPhase = next.placed.A >= 9 && next.placed.B >= 9;
  const nextPhase = movingPhase ? "moving" : "placing";

  if (movingPhase && !morrisHasMove(next.board, nextPlayer)) {
    return {
      ...next,
      winner: next.currentPlayer,
      selected: null,
      message: `Player ${next.currentPlayer} wins because Player ${nextPlayer} has no legal move.`,
    };
  }

  return {
    ...next,
    currentPlayer: nextPlayer,
    phase: nextPhase,
    selected: null,
    message: `Player ${nextPlayer} to ${movingPhase ? "move" : "place"}.`,
  };
}

export function listMorrisLegalActions(state: MorrisState): MorrisAction[] {
  if (state.winner) {
    return [];
  }
  if (state.phase === "removing") {
    return morrisPoints
      .filter((key) => canRemoveMorrisPiece(state.board, state.currentPlayer, key))
      .map((key) => ({ type: "remove", key }));
  }
  if (state.phase === "placing") {
    return morrisPoints
      .filter((key) => state.board[key] === null && state.placed[state.currentPlayer] < 9)
      .map((key) => ({ type: "place", key }));
  }
  return morrisPieces(state.board, state.currentPlayer).flatMap((from) =>
    morrisLegalDestinations(state.board, from, state.currentPlayer).map((to) => ({ type: "move", from, to })),
  );
}

export function applyMorrisAction(state: MorrisState, action: MorrisAction): MorrisState | null {
  if (state.winner) {
    return null;
  }
  if (action.type === "remove") {
    if (state.phase !== "removing" || !canRemoveMorrisPiece(state.board, state.currentPlayer, action.key)) {
      return null;
    }
    const board = { ...state.board, [action.key]: null };
    const opponent = otherPlayer(state.currentPlayer);
    const movingPhase = state.placed.A >= 9 && state.placed.B >= 9;
    const winner = movingPhase && !morrisHasMove(board, opponent) ? state.currentPlayer : null;
    const nextPhase = movingPhase ? "moving" : "placing";
    return {
      ...state,
      board,
      currentPlayer: winner ? state.currentPlayer : opponent,
      phase: winner ? "removing" : nextPhase,
      winner,
      selected: null,
      message: winner
        ? `Player ${state.currentPlayer} wins because Player ${opponent} cannot continue.`
        : `Player ${opponent} to ${nextPhase === "moving" ? "move" : "place"}.`,
    };
  }
  if (action.type === "place") {
    if (state.phase !== "placing" || state.board[action.key] || state.placed[state.currentPlayer] >= 9) {
      return null;
    }
    const board = { ...state.board, [action.key]: state.currentPlayer };
    return finishMorrisTurn(
      { ...state, board, placed: { ...state.placed, [state.currentPlayer]: state.placed[state.currentPlayer] + 1 } },
      action.key,
    );
  }
  if (state.phase !== "moving" || !morrisLegalDestinations(state.board, action.from, state.currentPlayer).includes(action.to)) {
    return null;
  }
  const board = { ...state.board, [action.from]: null, [action.to]: state.currentPlayer };
  return finishMorrisTurn({ ...state, board, selected: null }, action.to);
}

export function selectMorrisComputerAction({
  state,
  difficulty,
  random,
}: {
  state: MorrisState;
  difficulty: OpponentDifficulty;
  random?: () => number;
}): MorrisAction | null {
  const actions = listMorrisLegalActions(state);
  if (difficulty === "easy") {
    return chooseRandomMove(actions, random);
  }
  return chooseBestByScore(
    actions,
    (action) => {
      const next = applyMorrisAction(state, action);
      if (!next) {
        return Number.NEGATIVE_INFINITY;
      }
      const millBonus =
        (action.type === "place" && formsMorrisMill({ ...state.board, [action.key]: state.currentPlayer }, state.currentPlayer, action.key)) ||
        (action.type === "move" && formsMorrisMill({ ...state.board, [action.from]: null, [action.to]: state.currentPlayer }, state.currentPlayer, action.to))
          ? 60
          : 0;
      const captureBonus = action.type === "remove" ? 80 : 0;
      const mobility = listMorrisLegalActions(next).length;
      const pieceScore = morrisPieceCount(next.board, state.currentPlayer) - morrisPieceCount(next.board, otherPlayer(state.currentPlayer));
      return (next.winner ? 1000 : 0) + millBonus + captureBonus + pieceScore * 10 - mobility;
    },
    random,
  );
}

export type MiniKind = "K" | "G" | "S" | "B" | "R" | "P" | "+S" | "+B" | "+R" | "+P";
export type MiniPiece = { owner: PlayerMark; kind: MiniKind };
export type MiniBoard = (MiniPiece | null)[][];
export type MiniMove = { type: "move"; from: Point; to: Point } | { type: "drop"; kind: MiniKind; to: Point };

export function initialMiniShogiBoard(): MiniBoard {
  const board = makeMatrix<MiniPiece | null>(5, null);
  board[0] = ["R", "B", "S", "G", "K"].map((kind) => ({ owner: "B", kind: kind as MiniKind }));
  board[1][4] = { owner: "B", kind: "P" };
  board[3][0] = { owner: "A", kind: "P" };
  board[4] = ["K", "G", "S", "B", "R"].map((kind) => ({ owner: "A", kind: kind as MiniKind }));
  return board;
}

export function demoteMini(kind: MiniKind): MiniKind {
  return kind.startsWith("+") ? (kind.slice(1) as MiniKind) : kind;
}

export function miniPromotionRow(player: PlayerMark): number {
  return player === "A" ? 0 : 4;
}

export function miniCanPromote(piece: MiniPiece, to: Point): boolean {
  return (piece.kind === "P" || piece.kind === "S" || piece.kind === "B" || piece.kind === "R") && to.row === miniPromotionRow(piece.owner);
}

export function miniLegalDrops(board: MiniBoard, player: PlayerMark, kind: MiniKind): Point[] {
  const dropKind = demoteMini(kind);
  return board.flatMap((row, rowIndex) =>
    row.flatMap((cell, colIndex) =>
      cell || (dropKind === "P" && rowIndex === miniPromotionRow(player)) ? [] : [{ row: rowIndex, col: colIndex }],
    ),
  );
}

export function removeOneMiniHandPiece(hand: MiniKind[], kindToRemove: MiniKind): MiniKind[] {
  const index = hand.indexOf(kindToRemove);
  return index === -1 ? hand : hand.filter((_, itemIndex) => itemIndex !== index);
}

function miniDeltas(piece: MiniPiece): Point[] {
  const forward = piece.owner === "A" ? -1 : 1;
  const backward = -forward;
  const gold = [
    { row: forward, col: -1 }, { row: forward, col: 0 }, { row: forward, col: 1 },
    { row: 0, col: -1 }, { row: 0, col: 1 }, { row: backward, col: 0 },
  ];
  if (piece.kind === "K") {
    return [-1, 0, 1].flatMap((row) => [-1, 0, 1].map((col) => ({ row, col }))).filter((d) => d.row !== 0 || d.col !== 0);
  }
  if (piece.kind === "G" || piece.kind === "+S" || piece.kind === "+P") return gold;
  if (piece.kind === "S") return [{ row: forward, col: -1 }, { row: forward, col: 0 }, { row: forward, col: 1 }, { row: backward, col: -1 }, { row: backward, col: 1 }];
  if (piece.kind === "P") return [{ row: forward, col: 0 }];
  if (piece.kind === "+B") return [{ row: -1, col: 0 }, { row: 1, col: 0 }, { row: 0, col: -1 }, { row: 0, col: 1 }];
  if (piece.kind === "+R") return [{ row: -1, col: -1 }, { row: -1, col: 1 }, { row: 1, col: -1 }, { row: 1, col: 1 }];
  return [];
}

export function miniLegalMoves(board: MiniBoard, from: Point): Point[] {
  const piece = board[from.row][from.col];
  if (!piece) {
    return [];
  }
  const slideDirs =
    piece.kind === "B" || piece.kind === "+B"
      ? [{ row: -1, col: -1 }, { row: -1, col: 1 }, { row: 1, col: -1 }, { row: 1, col: 1 }]
      : piece.kind === "R" || piece.kind === "+R"
        ? [{ row: -1, col: 0 }, { row: 1, col: 0 }, { row: 0, col: -1 }, { row: 0, col: 1 }]
        : [];
  const targets: Point[] = [];
  slideDirs.forEach((dir) => {
    let next = { row: from.row + dir.row, col: from.col + dir.col };
    while (inBounds(next, 5)) {
      const occupant = board[next.row][next.col];
      if (!occupant) targets.push(next);
      else {
        if (occupant.owner !== piece.owner) targets.push(next);
        break;
      }
      next = { row: next.row + dir.row, col: next.col + dir.col };
    }
  });
  miniDeltas(piece).forEach((delta) => {
    const next = { row: from.row + delta.row, col: from.col + delta.col };
    if (inBounds(next, 5) && board[next.row][next.col]?.owner !== piece.owner) targets.push(next);
  });
  return targets;
}

export function listMiniShogiLegalMoves(board: MiniBoard, hands: Record<PlayerMark, MiniKind[]>, player: PlayerMark): MiniMove[] {
  const boardMoves = board.flatMap((row, rowIndex) =>
    row.flatMap((cell, colIndex) =>
      cell?.owner === player
        ? miniLegalMoves(board, { row: rowIndex, col: colIndex }).map((to) => ({ type: "move" as const, from: { row: rowIndex, col: colIndex }, to }))
        : [],
    ),
  );
  const dropMoves = hands[player].flatMap((kind) => miniLegalDrops(board, player, kind).map((to) => ({ type: "drop" as const, kind, to })));
  return [...boardMoves, ...dropMoves];
}

export function applyMiniShogiMove(
  board: MiniBoard,
  hands: Record<PlayerMark, MiniKind[]>,
  player: PlayerMark,
  move: MiniMove,
): { board: MiniBoard; hands: Record<PlayerMark, MiniKind[]>; winner: PlayerMark | null; nextPlayer: PlayerMark } | null {
  const nextBoard = cloneMatrix(board);
  const nextHands = { A: [...hands.A], B: [...hands.B] };
  if (move.type === "drop") {
    if (!hands[player].includes(move.kind) || !miniLegalDrops(board, player, move.kind).some((target) => pointKey(target) === pointKey(move.to))) return null;
    nextBoard[move.to.row][move.to.col] = { owner: player, kind: move.kind };
    nextHands[player] = removeOneMiniHandPiece(nextHands[player], move.kind);
    return { board: nextBoard, hands: nextHands, winner: null, nextPlayer: otherPlayer(player) };
  }
  if (!miniLegalMoves(board, move.from).some((target) => pointKey(target) === pointKey(move.to))) return null;
  const piece = nextBoard[move.from.row][move.from.col];
  if (!piece || piece.owner !== player) return null;
  const captured = nextBoard[move.to.row][move.to.col];
  const promote = miniCanPromote(piece, move.to);
  nextBoard[move.to.row][move.to.col] = promote ? { ...piece, kind: `+${piece.kind}` as MiniKind } : piece;
  nextBoard[move.from.row][move.from.col] = null;
  if (captured?.kind === "K") return { board: nextBoard, hands: nextHands, winner: player, nextPlayer: otherPlayer(player) };
  if (captured) nextHands[player].push(demoteMini(captured.kind));
  return { board: nextBoard, hands: nextHands, winner: null, nextPlayer: otherPlayer(player) };
}

export function selectMiniShogiComputerMove({
  board,
  difficulty,
  hands,
  player,
  random,
}: {
  board: MiniBoard;
  difficulty: OpponentDifficulty;
  hands: Record<PlayerMark, MiniKind[]>;
  player: PlayerMark;
  random?: () => number;
}): MiniMove | null {
  const moves = listMiniShogiLegalMoves(board, hands, player);
  if (difficulty === "easy") return chooseRandomMove(moves, random);
  return chooseBestByScore(
    moves,
    (move) => {
      const target = move.to;
      const captured = move.type === "move" ? board[target.row][target.col] : null;
      const result = applyMiniShogiMove(board, hands, player, move);
      if (!result) return Number.NEGATIVE_INFINITY;
      return (result.winner ? 1000 : 0) + (captured ? miniPieceValue(captured.kind) * 10 : 0) + listMiniShogiLegalMoves(result.board, result.hands, player).length;
    },
    random,
  );
}

function miniPieceValue(kind: MiniKind): number {
  return { K: 100, R: 9, "+R": 10, B: 7, "+B": 8, G: 5, S: 4, "+S": 5, P: 1, "+P": 5 }[kind];
}

export type TwelveJanggiMove =
  | { type: "move"; from: TwelveJanggiSquare; to: TwelveJanggiSquare }
  | { type: "drop"; kind: TwelveJanggiPieceKind; to: TwelveJanggiSquare };

export function listTwelveJanggiLegalMoves(state: TwelveJanggiState): TwelveJanggiMove[] {
  if (state.winner) return [];
  const boardMoves: TwelveJanggiMove[] = [];
  for (let row = 0; row < BOARD_ROWS; row += 1) {
    for (let col = 0; col < BOARD_COLS; col += 1) {
      const piece = state.board[row][col];
      if (piece?.owner === state.currentPlayer) {
        const from = { row, col };
        getTwelveJanggiLegalMoves(state, from).forEach((to) => boardMoves.push({ type: "move", from, to }));
      }
    }
  }
  const dropMoves = state.capturedHands[state.currentPlayer].flatMap((kind) =>
    getTwelveJanggiLegalDrops(state, state.currentPlayer, kind).map((to) => ({ type: "drop" as const, kind, to })),
  );
  return [...boardMoves, ...dropMoves];
}

export function applyTwelveJanggiComputerMove(state: TwelveJanggiState, move: TwelveJanggiMove): TwelveJanggiState | null {
  const result = move.type === "move"
    ? applyTwelveJanggiMove(state, move.from, move.to)
    : applyTwelveJanggiDrop(state, state.currentPlayer, move.kind, move.to);
  return result.ok ? result.state : null;
}

export function selectTwelveJanggiComputerMove({
  difficulty,
  random,
  state,
}: {
  difficulty: OpponentDifficulty;
  random?: () => number;
  state: TwelveJanggiState;
}): TwelveJanggiMove | null {
  const moves = listTwelveJanggiLegalMoves(state);
  if (difficulty === "easy") return chooseRandomMove(moves, random);
  return chooseBestByScore(
    moves,
    (move) => {
      const targetPiece = move.type === "move" ? state.board[move.to.row][move.to.col] : null;
      const next = applyTwelveJanggiComputerMove(state, move);
      if (!next) return Number.NEGATIVE_INFINITY;
      const dropPenalty = move.type === "drop" ? -1 : 0;
      return (next.winner ? 1000 : 0) + (targetPiece ? twelveJanggiPieceValue(targetPiece.kind) * 10 : 0) + dropPenalty;
    },
    random,
  );
}

function twelveJanggiPieceValue(kind: TwelveJanggiPieceKind): number {
  return { king: 100, general: 5, minister: 4, feudalLord: 6, man: 1 }[kind];
}

export function selectChessComputerMove({
  difficulty,
  fen,
  random,
}: {
  difficulty: OpponentDifficulty;
  fen: string;
  random?: () => number;
}): ChessMove | null {
  const game = new Chess(fen);
  const moves = game.moves({ verbose: true });
  if (moves.length === 0) return null;
  if (difficulty === "easy") return chooseRandomMove(moves, random);
  return chooseBestByScore(
    moves,
    (move) => {
      const next = new Chess(fen);
      next.move({ from: move.from as ChessSquare, to: move.to as ChessSquare, promotion: move.promotion ?? "q" });
      return (next.isCheckmate() ? 10000 : 0) + (move.captured ? chessPieceValue(move.captured) * 100 : 0) + (next.inCheck() ? 25 : 0);
    },
    random,
  );
}

function chessPieceValue(piece: string): number {
  return { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 }[piece] ?? 0;
}
