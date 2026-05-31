import { RotateCcw, Undo2 } from "lucide-react";
import { useState } from "react";
import {
  applyDrop,
  applyMove,
  createInitialTwelveJanggiState,
  selectBoardSquare,
  selectCapturedPiece,
} from "./twelveJanggiEngine";
import { TwelveJanggiBoard } from "./TwelveJanggiBoard";
import {
  PIECE_LABELS,
  type GameState,
  type PieceKind,
  type Player,
  type Square,
  sameSquare,
} from "./twelveJanggiRules";

type HandCounts = Partial<Record<PieceKind, number>>;

const handOrder: PieceKind[] = ["general", "minister", "man", "feudalLord"];

function countHandPieces(pieces: PieceKind[]): HandCounts {
  return pieces.reduce<HandCounts>((counts, kind) => {
    counts[kind] = (counts[kind] ?? 0) + 1;
    return counts;
  }, {});
}

function describeAction(result: ReturnType<typeof applyMove>): string {
  if (!result.ok) {
    return result.reason;
  }

  if (result.winnerReason) {
    return result.winnerReason;
  }

  const parts: string[] = [];

  if (result.capturedPiece) {
    parts.push(
      `Captured Player ${result.capturedPiece.owner}'s ${
        PIECE_LABELS[result.capturedPiece.kind]
      }.`,
    );
  }

  if (result.promoted) {
    parts.push("Man promoted to Feudal Lord.");
  }

  parts.push(`Player ${result.state.currentPlayer} to move.`);
  return parts.join(" ");
}

function handButtonLabel(player: Player, kind: PieceKind, count: number) {
  return `Drop Player ${player}'s captured ${PIECE_LABELS[kind]}${
    count > 1 ? `, ${count} available` : ""
  }`;
}

function HandPanel({
  player,
  state,
  onSelect,
}: {
  player: Player;
  state: GameState;
  onSelect: (player: Player, kind: PieceKind) => void;
}) {
  const counts = countHandPieces(state.capturedHands[player]);
  const hasPieces = state.capturedHands[player].length > 0;
  const isActive = state.currentPlayer === player && !state.winner;

  return (
    <section className={`hand-panel player-${player}`} aria-label={`Player ${player} hand`}>
      <div>
        <p className="eyebrow">Player {player}</p>
        <h3>{player === "A" ? "South side" : "North side"}</h3>
      </div>
      <div className="hand-pieces">
        {hasPieces ? (
          handOrder.map((kind) => {
            const count = counts[kind] ?? 0;

            if (count === 0) {
              return null;
            }

            return (
              <button
                aria-label={handButtonLabel(player, kind, count)}
                className={[
                  "hand-piece",
                  state.selectedCapturedPiece === kind && isActive ? "selected" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                disabled={!isActive}
                key={kind}
                onClick={() => onSelect(player, kind)}
                type="button"
              >
                <span>{PIECE_LABELS[kind]}</span>
                <strong>x{count}</strong>
              </button>
            );
          })
        ) : (
          <p className="empty-hand">No captured pieces</p>
        )}
      </div>
    </section>
  );
}

export function TwelveJanggiPage() {
  const [state, setState] = useState<GameState>(() =>
    createInitialTwelveJanggiState(),
  );
  const [message, setMessage] = useState(
    "Player A starts. Select a piece to see legal moves.",
  );

  function resetGame() {
    setState(createInitialTwelveJanggiState());
    setMessage("New game started. Player A to move.");
  }

  function handleSquareClick(square: Square) {
    if (state.winner) {
      setMessage("The game is over. Reset to play again.");
      return;
    }

    if (
      state.selectedSquare &&
      state.legalTargets.some((target) => sameSquare(target, square))
    ) {
      const result = applyMove(state, state.selectedSquare, square);

      if (result.ok) {
        setState(result.state);
      }

      setMessage(describeAction(result));
      return;
    }

    if (
      state.selectedCapturedPiece &&
      state.legalTargets.some((target) => sameSquare(target, square))
    ) {
      const result = applyDrop(
        state,
        state.currentPlayer,
        state.selectedCapturedPiece,
        square,
      );

      if (result.ok) {
        setState(result.state);
        setMessage(
          result.winnerReason ??
            `Player ${state.currentPlayer} dropped ${
              PIECE_LABELS[state.selectedCapturedPiece]
            }. Player ${result.state.currentPlayer} to move.`,
        );
        return;
      }

      setMessage(result.reason);
      return;
    }

    const piece = state.board[square.row][square.col];
    const selectedState = selectBoardSquare(state, square);
    setState(selectedState);

    if (!piece) {
      setMessage("Select one of the current player's pieces or a hand piece.");
      return;
    }

    if (piece.owner !== state.currentPlayer) {
      setMessage(`It is Player ${state.currentPlayer}'s turn.`);
      return;
    }

    setMessage(
      selectedState.legalTargets.length > 0
        ? `${PIECE_LABELS[piece.kind]} selected. Choose a highlighted square.`
        : `${PIECE_LABELS[piece.kind]} has no legal moves.`,
    );
  }

  function handleHandSelect(player: Player, kind: PieceKind) {
    if (state.winner) {
      return;
    }

    if (player !== state.currentPlayer) {
      setMessage(`It is Player ${state.currentPlayer}'s turn.`);
      return;
    }

    const selectedState = selectCapturedPiece(state, player, kind);
    setState(selectedState);
    setMessage(
      selectedState.legalTargets.length > 0
        ? `${PIECE_LABELS[kind]} selected from Player ${player}'s hand. Choose a highlighted empty square.`
        : `${PIECE_LABELS[kind]} has no legal drop squares.`,
    );
  }

  const pendingThreat = state.pendingKingTerritoryThreat;

  return (
    <main className="shell game-shell">
      <nav className="page-nav" aria-label="Applet navigation">
        <a className="back-link" href="#/applets">
          <Undo2 size={17} aria-hidden="true" />
          Back to Applets
        </a>
      </nav>

      <section className="game-header">
        <div>
          <p className="eyebrow">Playable prototype</p>
          <h1>Twelve Janggi</h1>
        </div>
        <button className="secondary-button" onClick={resetGame} type="button">
          <RotateCcw size={17} aria-hidden="true" />
          Reset
        </button>
      </section>

      <section className="game-layout">
        <aside className="side-panel" aria-label="Game status and captured pieces">
          <div className="turn-card">
            <p className="eyebrow">Current state</p>
            <h2>
              {state.winner
                ? `Player ${state.winner} wins`
                : `Player ${state.currentPlayer} to move`}
            </h2>
            {pendingThreat && !state.winner ? (
              <p className="threat-note">
                Player {pendingThreat.player}'s King is threatening escape.
                Capture it this turn or Player {pendingThreat.player} wins.
              </p>
            ) : null}
          </div>

          <HandPanel player="A" state={state} onSelect={handleHandSelect} />
          <HandPanel player="B" state={state} onSelect={handleHandSelect} />
        </aside>

        <section className="board-panel" aria-label="Twelve Janggi play area">
          {state.winner ? (
            <div className="winner-banner" role="status">
              Player {state.winner} wins
            </div>
          ) : null}

          <TwelveJanggiBoard state={state} onSquareClick={handleSquareClick} />

          <div className="feedback" role="status" aria-live="polite">
            <strong>{state.winner ? "Game over" : "Rule check"}</strong>
            <span>{message}</span>
          </div>
        </section>

        <aside className="rules-panel" aria-label="Twelve Janggi rules">
          <p className="eyebrow">Rules</p>
          <h2>Quick reference</h2>
          <ul>
            <li>King moves one square in any direction.</li>
            <li>General moves one square orthogonally.</li>
            <li>Minister moves one square diagonally.</li>
            <li>Man moves one square forward and promotes on entry.</li>
            <li>Feudal Lord moves like a King except diagonally backward.</li>
            <li>Captured non-Kings go to hand; Feudal Lords become Men.</li>
            <li>Hand pieces drop on empty squares, never in opponent territory.</li>
            <li>Capturing the King wins immediately.</li>
            <li>
              A King in opponent territory wins only if it survives the
              opponent's next turn.
            </li>
          </ul>
        </aside>
      </section>
    </main>
  );
}
