export type SymbolMark = "X" | "O";
export type MoveColor = "red" | "blue";

export type FilledCell = {
  symbol: SymbolMark;
  color: MoveColor;
};

export type Cell = FilledCell | null;
export type Board = Cell[][];

export type Move = {
  stripIndex: number;
  cellIndex: number;
  color: MoveColor;
};

export type MoveResult =
  | { ok: true; board: Board; nextPlayer: SymbolMark; winner: null | SymbolMark }
  | { ok: false; reason: string };

export const DEFAULT_STRIP_INPUT = "1,2,3,5,8";

export function parseStripLengths(input: string): number[] {
  const values = input
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (values.length === 0) {
    throw new Error("Enter at least one strip length.");
  }

  return values.map((value) => {
    if (!/^\d+$/.test(value)) {
      throw new Error("Strip lengths must be positive whole numbers.");
    }

    const length = Number(value);

    if (!Number.isSafeInteger(length) || length < 1) {
      throw new Error("Every strip length must be at least 1.");
    }

    if (length > 20) {
      throw new Error("Keep each strip at 20 squares or fewer for this demo.");
    }

    return length;
  });
}

export function createBoard(lengths: number[]): Board {
  return lengths.map((length) => Array<Cell>(length).fill(null));
}

export function isStripBlank(strip: Cell[]): boolean {
  return strip.every((cell) => cell === null);
}

export function hasBlankStrip(board: Board): boolean {
  return board.some(isStripBlank);
}

export function isAdjacentPlacementValid(
  strip: Cell[],
  cellIndex: number,
  symbol: SymbolMark,
  color: MoveColor,
): boolean {
  const adjacentCells = [strip[cellIndex - 1], strip[cellIndex + 1]].filter(
    (cell): cell is FilledCell => cell !== null && cell !== undefined,
  );

  return adjacentCells.every(
    (cell) => cell.symbol !== symbol && cell.color !== color,
  );
}

export function isBlankStripRuleActive(board: Board): boolean {
  return hasBlankStrip(board);
}

export function getIllegalMoveReason(
  board: Board,
  player: SymbolMark,
  move: Move,
): string | null {
  const strip = board[move.stripIndex];

  if (!strip) {
    return "That strip does not exist.";
  }

  if (move.cellIndex < 0 || move.cellIndex >= strip.length) {
    return "That square does not exist.";
  }

  if (strip[move.cellIndex] !== null) {
    return "That square is already filled.";
  }

  if (isBlankStripRuleActive(board) && !isStripBlank(strip)) {
    return "A completely blank strip still exists, so this turn must be played on a completely blank strip.";
  }

  const left = strip[move.cellIndex - 1];
  const right = strip[move.cellIndex + 1];
  const matchingSymbol = [left, right].some(
    (cell) => cell?.symbol === player,
  );
  const matchingColor = [left, right].some(
    (cell) => cell?.color === move.color,
  );

  if (matchingSymbol && matchingColor) {
    return "Adjacent filled squares must differ by both symbol and color; this move repeats an adjacent symbol and color.";
  }

  if (matchingSymbol) {
    return "Adjacent filled squares must have different symbols.";
  }

  if (matchingColor) {
    return "Adjacent filled squares must have different colors.";
  }

  return null;
}

export function listLegalMoves(board: Board, player: SymbolMark): Move[] {
  const moves: Move[] = [];
  const colors: MoveColor[] = ["red", "blue"];

  board.forEach((strip, stripIndex) => {
    strip.forEach((cell, cellIndex) => {
      if (cell !== null) {
        return;
      }

      colors.forEach((color) => {
        const move = { stripIndex, cellIndex, color };

        if (getIllegalMoveReason(board, player, move) === null) {
          moves.push(move);
        }
      });
    });
  });

  return moves;
}

export function hasNoValidMove(board: Board, player: SymbolMark): boolean {
  return listLegalMoves(board, player).length === 0;
}

export function nextPlayer(player: SymbolMark): SymbolMark {
  return player === "X" ? "O" : "X";
}

export function applyMove(
  board: Board,
  player: SymbolMark,
  move: Move,
): MoveResult {
  const reason = getIllegalMoveReason(board, player, move);

  if (reason) {
    return { ok: false, reason };
  }

  const nextBoard = board.map((strip) => strip.slice());
  nextBoard[move.stripIndex][move.cellIndex] = {
    symbol: player,
    color: move.color,
  };

  const upcomingPlayer = nextPlayer(player);
  const winner = hasNoValidMove(nextBoard, upcomingPlayer) ? player : null;

  return {
    ok: true,
    board: nextBoard,
    nextPlayer: upcomingPlayer,
    winner,
  };
}

