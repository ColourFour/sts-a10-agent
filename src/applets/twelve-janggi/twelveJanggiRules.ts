export type Player = "A" | "B";

export type PieceKind =
  | "king"
  | "general"
  | "minister"
  | "man"
  | "feudalLord";

export type Square = {
  row: number;
  col: number;
};

export type Piece = {
  id: string;
  owner: Player;
  kind: PieceKind;
};

export type BoardSquare = Piece | null;
export type Board = BoardSquare[][];

export type CapturedHands = Record<Player, PieceKind[]>;

export type PendingKingTerritoryThreat = {
  player: Player;
  kingId: string;
  square: Square;
};

export type GameState = {
  board: Board;
  currentPlayer: Player;
  capturedHands: CapturedHands;
  selectedSquare: Square | null;
  selectedCapturedPiece: PieceKind | null;
  legalTargets: Square[];
  winner: Player | null;
  pendingKingTerritoryThreat: PendingKingTerritoryThreat | null;
  nextPieceId: number;
};

export const BOARD_ROWS = 4;
export const BOARD_COLS = 3;

export const PLAYERS: Player[] = ["A", "B"];

export const PIECE_LABELS: Record<PieceKind, string> = {
  king: "King",
  general: "General",
  minister: "Minister",
  man: "Man",
  feudalLord: "Feudal Lord",
};

export const PIECE_SHORT_LABELS: Record<PieceKind, string> = {
  king: "王",
  general: "將",
  minister: "相",
  man: "卒",
  feudalLord: "侯",
};

export function opponentOf(player: Player): Player {
  return player === "A" ? "B" : "A";
}

export function forwardDelta(player: Player): number {
  return player === "A" ? -1 : 1;
}

export function ownTerritoryRow(player: Player): number {
  return player === "A" ? BOARD_ROWS - 1 : 0;
}

export function opponentTerritoryRow(player: Player): number {
  return ownTerritoryRow(opponentOf(player));
}

export function isOpponentTerritory(player: Player, square: Square): boolean {
  return square.row === opponentTerritoryRow(player);
}

export function isInsideBoard(square: Square): boolean {
  return (
    square.row >= 0 &&
    square.row < BOARD_ROWS &&
    square.col >= 0 &&
    square.col < BOARD_COLS
  );
}

export function sameSquare(a: Square, b: Square): boolean {
  return a.row === b.row && a.col === b.col;
}

export function squareKey(square: Square): string {
  return `${square.row}:${square.col}`;
}

export function kindForHand(capturedKind: PieceKind): PieceKind {
  return capturedKind === "feudalLord" ? "man" : capturedKind;
}

export function movementDeltas(piece: Piece): Square[] {
  const diagonals = [
    { row: -1, col: -1 },
    { row: -1, col: 1 },
    { row: 1, col: -1 },
    { row: 1, col: 1 },
  ];
  const orthogonals = [
    { row: -1, col: 0 },
    { row: 1, col: 0 },
    { row: 0, col: -1 },
    { row: 0, col: 1 },
  ];

  if (piece.kind === "king") {
    return [...orthogonals, ...diagonals];
  }

  if (piece.kind === "general") {
    return orthogonals;
  }

  if (piece.kind === "minister") {
    return diagonals;
  }

  if (piece.kind === "man") {
    return [{ row: forwardDelta(piece.owner), col: 0 }];
  }

  const backward = -forwardDelta(piece.owner);

  return [...orthogonals, ...diagonals].filter(
    (delta) => !(delta.row === backward && Math.abs(delta.col) === 1),
  );
}
