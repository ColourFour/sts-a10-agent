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
