import {
  BOARD_COLS,
  BOARD_ROWS,
  type Board,
  type CapturedHands,
  type GameState,
  type PendingKingTerritoryThreat,
  type Piece,
  type PieceKind,
  type Player,
  type Square,
  isInsideBoard,
  isOpponentTerritory,
  kindForHand,
  movementDeltas,
  opponentOf,
  sameSquare,
} from "./twelveJanggiRules";

export type ApplyMoveResult =
  | {
      ok: true;
      state: GameState;
      capturedPiece: Piece | null;
      promoted: boolean;
      winnerReason: string | null;
    }
  | { ok: false; reason: string };

export type ApplyDropResult =
  | {
      ok: true;
      state: GameState;
      winnerReason: string | null;
    }
  | { ok: false; reason: string };

function makePiece(owner: Player, kind: PieceKind, id: string): Piece {
  return { id, owner, kind };
}

function emptyBoard(): Board {
  return Array.from({ length: BOARD_ROWS }, () =>
    Array.from({ length: BOARD_COLS }, () => null),
  );
}

function cloneBoard(board: Board): Board {
  return board.map((row) => row.map((piece) => (piece ? { ...piece } : null)));
}

function cloneHands(hands: CapturedHands): CapturedHands {
  return {
    A: [...hands.A],
    B: [...hands.B],
  };
}

function getPieceAt(board: Board, square: Square): Piece | null {
  if (!isInsideBoard(square)) {
    return null;
  }

  return board[square.row][square.col];
}

function findPiece(board: Board, pieceId: string): Square | null {
  for (let row = 0; row < BOARD_ROWS; row += 1) {
    for (let col = 0; col < BOARD_COLS; col += 1) {
      if (board[row][col]?.id === pieceId) {
        return { row, col };
      }
    }
  }

  return null;
}

function findKing(board: Board, player: Player): Square | null {
  for (let row = 0; row < BOARD_ROWS; row += 1) {
    for (let col = 0; col < BOARD_COLS; col += 1) {
      const piece = board[row][col];

      if (piece?.owner === player && piece.kind === "king") {
        return { row, col };
      }
    }
  }

  return null;
}

function clearSelection(state: GameState): GameState {
  return {
    ...state,
    selectedSquare: null,
    selectedCapturedPiece: null,
    legalTargets: [],
  };
}

export function createInitialTwelveJanggiState(): GameState {
  const board = emptyBoard();

  board[3][0] = makePiece("A", "minister", "A-minister");
  board[3][1] = makePiece("A", "king", "A-king");
  board[3][2] = makePiece("A", "general", "A-general");
  board[2][1] = makePiece("A", "man", "A-man");

  board[0][0] = makePiece("B", "minister", "B-minister");
  board[0][1] = makePiece("B", "king", "B-king");
  board[0][2] = makePiece("B", "general", "B-general");
  board[1][1] = makePiece("B", "man", "B-man");

  return {
    board,
    currentPlayer: "A",
    capturedHands: { A: [], B: [] },
    selectedSquare: null,
    selectedCapturedPiece: null,
    legalTargets: [],
    winner: null,
    pendingKingTerritoryThreat: null,
    nextPieceId: 1,
  };
}

export function getLegalMoves(state: GameState, fromSquare: Square): Square[] {
  if (state.winner || !isInsideBoard(fromSquare)) {
    return [];
  }

  const piece = getPieceAt(state.board, fromSquare);

  if (!piece || piece.owner !== state.currentPlayer) {
    return [];
  }

  return movementDeltas(piece)
    .map((delta) => ({
      row: fromSquare.row + delta.row,
      col: fromSquare.col + delta.col,
    }))
    .filter((target) => {
      if (!isInsideBoard(target)) {
        return false;
      }

      const targetPiece = getPieceAt(state.board, target);
      return !targetPiece || targetPiece.owner !== piece.owner;
    });
}

export function getLegalDrops(
  state: GameState,
  player: Player,
  pieceKind: PieceKind,
): Square[] {
  if (state.winner || player !== state.currentPlayer) {
    return [];
  }

  if (!state.capturedHands[player].includes(pieceKind)) {
    return [];
  }

  const drops: Square[] = [];

  for (let row = 0; row < BOARD_ROWS; row += 1) {
    for (let col = 0; col < BOARD_COLS; col += 1) {
      const square = { row, col };

      if (state.board[row][col] === null && !isOpponentTerritory(player, square)) {
        drops.push(square);
      }
    }
  }

  return drops;
}

function buildKingThreat(
  piece: Piece,
  toSquare: Square,
): PendingKingTerritoryThreat | null {
  if (piece.kind !== "king" || !isOpponentTerritory(piece.owner, toSquare)) {
    return null;
  }

  return {
    player: piece.owner,
    kingId: piece.id,
    square: toSquare,
  };
}

export function checkWinState(state: GameState): {
  state: GameState;
  winnerReason: string | null;
} {
  if (state.winner || !state.pendingKingTerritoryThreat) {
    return { state, winnerReason: null };
  }

  const threat = state.pendingKingTerritoryThreat;

  if (state.currentPlayer !== threat.player) {
    return { state, winnerReason: null };
  }

  const kingSquare = findPiece(state.board, threat.kingId);
  const king = kingSquare ? getPieceAt(state.board, kingSquare) : null;

  if (
    kingSquare &&
    king &&
    king.kind === "king" &&
    king.owner === threat.player &&
    isOpponentTerritory(threat.player, kingSquare)
  ) {
    return {
      state: clearSelection({
        ...state,
        winner: threat.player,
      }),
      winnerReason: `${threat.player}'s King survived one turn in the opponent's territory.`,
    };
  }

  return {
    state: {
      ...state,
      pendingKingTerritoryThreat: null,
    },
    winnerReason: null,
  };
}

export function applyMove(
  state: GameState,
  fromSquare: Square,
  toSquare: Square,
): ApplyMoveResult {
  if (state.winner) {
    return { ok: false, reason: "The game is already over." };
  }

  if (!isInsideBoard(fromSquare) || !isInsideBoard(toSquare)) {
    return { ok: false, reason: "That square is outside the board." };
  }

  const legalMoves = getLegalMoves(state, fromSquare);

  if (!legalMoves.some((square) => sameSquare(square, toSquare))) {
    return { ok: false, reason: "That move is not legal for this piece." };
  }

  const board = cloneBoard(state.board);
  const movingPiece = board[fromSquare.row][fromSquare.col];
  const capturedPiece = board[toSquare.row][toSquare.col];

  if (!movingPiece || movingPiece.owner !== state.currentPlayer) {
    return { ok: false, reason: "Select one of the current player's pieces." };
  }

  if (capturedPiece?.kind === "king") {
    board[fromSquare.row][fromSquare.col] = null;
    board[toSquare.row][toSquare.col] = { ...movingPiece };

    return {
      ok: true,
      state: clearSelection({
        ...state,
        board,
        winner: movingPiece.owner,
        pendingKingTerritoryThreat: null,
      }),
      capturedPiece,
      promoted: false,
      winnerReason: `${movingPiece.owner} captured the enemy King.`,
    };
  }

  const capturedHands = cloneHands(state.capturedHands);

  if (capturedPiece) {
    capturedHands[movingPiece.owner].push(kindForHand(capturedPiece.kind));
  }

  const promoted =
    movingPiece.kind === "man" && isOpponentTerritory(movingPiece.owner, toSquare);
  const movedPiece: Piece = promoted
    ? { ...movingPiece, kind: "feudalLord" }
    : { ...movingPiece };

  board[fromSquare.row][fromSquare.col] = null;
  board[toSquare.row][toSquare.col] = movedPiece;

  const nextState: GameState = clearSelection({
    ...state,
    board,
    capturedHands,
    currentPlayer: opponentOf(state.currentPlayer),
    pendingKingTerritoryThreat:
      state.pendingKingTerritoryThreat ?? buildKingThreat(movedPiece, toSquare),
  });
  const checked = checkWinState(nextState);

  return {
    ok: true,
    state: checked.state,
    capturedPiece,
    promoted,
    winnerReason: checked.winnerReason,
  };
}

export function applyDrop(
  state: GameState,
  player: Player,
  pieceKind: PieceKind,
  toSquare: Square,
): ApplyDropResult {
  if (state.winner) {
    return { ok: false, reason: "The game is already over." };
  }

  if (player !== state.currentPlayer) {
    return { ok: false, reason: "Only the current player can drop a piece." };
  }

  if (!isInsideBoard(toSquare)) {
    return { ok: false, reason: "That square is outside the board." };
  }

  if (state.board[toSquare.row][toSquare.col]) {
    return { ok: false, reason: "Drops must be placed on an empty square." };
  }

  if (isOpponentTerritory(player, toSquare)) {
    return {
      ok: false,
      reason: "A captured piece cannot be dropped into the opponent's territory.",
    };
  }

  const handIndex = state.capturedHands[player].indexOf(pieceKind);

  if (handIndex === -1) {
    return { ok: false, reason: "That piece is not in the player's hand." };
  }

  const board = cloneBoard(state.board);
  const capturedHands = cloneHands(state.capturedHands);
  const handPieceKind = pieceKind === "feudalLord" ? "man" : pieceKind;

  capturedHands[player].splice(handIndex, 1);
  board[toSquare.row][toSquare.col] = {
    id: `${player}-${handPieceKind}-drop-${state.nextPieceId}`,
    owner: player,
    kind: handPieceKind,
  };

  const nextState: GameState = clearSelection({
    ...state,
    board,
    capturedHands,
    currentPlayer: opponentOf(player),
    nextPieceId: state.nextPieceId + 1,
  });
  const checked = checkWinState(nextState);

  return {
    ok: true,
    state: checked.state,
    winnerReason: checked.winnerReason,
  };
}

export function selectBoardSquare(
  state: GameState,
  square: Square,
): GameState {
  const legalTargets = getLegalMoves(state, square);

  if (legalTargets.length === 0) {
    return clearSelection(state);
  }

  return {
    ...state,
    selectedSquare: square,
    selectedCapturedPiece: null,
    legalTargets,
  };
}

export function selectCapturedPiece(
  state: GameState,
  player: Player,
  pieceKind: PieceKind,
): GameState {
  const legalTargets = getLegalDrops(state, player, pieceKind);

  if (legalTargets.length === 0) {
    return clearSelection(state);
  }

  return {
    ...state,
    selectedSquare: null,
    selectedCapturedPiece: pieceKind,
    legalTargets,
  };
}

export function getKingSquare(state: GameState, player: Player): Square | null {
  return findKing(state.board, player);
}
