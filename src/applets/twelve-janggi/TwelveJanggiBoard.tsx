import {
  BOARD_COLS,
  BOARD_ROWS,
  PIECE_LABELS,
  PIECE_SHORT_LABELS,
  type GameState,
  type Square,
  squareKey,
} from "./twelveJanggiRules";

type TwelveJanggiBoardProps = {
  state: GameState;
  onSquareClick: (square: Square) => void;
};

export function TwelveJanggiBoard({
  state,
  onSquareClick,
}: TwelveJanggiBoardProps) {
  const legalTargetKeys = new Set(state.legalTargets.map(squareKey));
  const selectedKey = state.selectedSquare
    ? squareKey(state.selectedSquare)
    : null;
  const threatenedKey = state.pendingKingTerritoryThreat
    ? squareKey(state.pendingKingTerritoryThreat.square)
    : null;

  return (
    <div className="board-wrap" aria-label="Twelve Janggi board">
      <div className="territory-label top">Player B territory</div>
      <div
        className="janggi-board"
        role="grid"
        aria-rowcount={BOARD_ROWS}
        aria-colcount={BOARD_COLS}
      >
        {state.board.map((row, rowIndex) =>
          row.map((piece, colIndex) => {
            const square = { row: rowIndex, col: colIndex };
            const key = squareKey(square);
            const isLegalTarget = legalTargetKeys.has(key);
            const isSelected = selectedKey === key;
            const isThreatenedKing = threatenedKey === key;

            return (
              <button
                aria-label={
                  piece
                    ? `${PIECE_LABELS[piece.kind]} for Player ${piece.owner}`
                    : `Empty square row ${rowIndex + 1}, column ${colIndex + 1}`
                }
                className={[
                  "janggi-square",
                  piece ? `owned-${piece.owner}` : "empty",
                  isLegalTarget ? "legal-target" : "",
                  isSelected ? "selected" : "",
                  isThreatenedKing ? "territory-threat" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                key={key}
                onClick={() => onSquareClick(square)}
                role="gridcell"
                type="button"
              >
                {piece ? (
                  <span className="piece-token">
                    <span className="piece-kind">
                      {PIECE_SHORT_LABELS[piece.kind]}
                    </span>
                    <span className="piece-owner">P{piece.owner}</span>
                  </span>
                ) : isLegalTarget ? (
                  <span className="target-dot" aria-hidden="true" />
                ) : null}
              </button>
            );
          }),
        )}
      </div>
      <div className="territory-label bottom">Player A territory</div>
    </div>
  );
}
