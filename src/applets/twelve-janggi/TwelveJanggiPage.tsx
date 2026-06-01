import { RotateCcw, Undo2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { KeyboardHints, TutorialButton, type TutorialStep } from "../GameUi";
import {
  applyTwelveJanggiComputerMove,
  computerThinkingDelayMs,
  selectTwelveJanggiComputerMove,
  type GameMode,
  type OpponentDifficulty,
} from "../boardGameOpponents";
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

const twelveJanggiTutorial: TutorialStep[] = [
  {
    title: "Select a token",
    text: "Choose one of the current player's pieces. Legal move targets glow on the board.",
    highlight: "Board",
  },
  {
    title: "Captured pieces return",
    text: "Captured pieces move to your hand and can be dropped on a later turn.",
    highlight: "Hands",
  },
  {
    title: "Watch territory",
    text: "A King entering the far territory creates a threat. Capture it immediately or it wins next turn.",
    highlight: "Territory",
  },
];

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
  disabled = false,
  player,
  state,
  onSelect,
}: {
  disabled?: boolean;
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
                disabled={disabled || !isActive}
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
  const [gameMode, setGameMode] = useState<GameMode>("twoPlayer");
  const [difficulty, setDifficulty] = useState<OpponentDifficulty>("normal");
  const [computerThinking, setComputerThinking] = useState(false);
  const [message, setMessage] = useState(
    "Player A starts. Select a piece to see legal moves.",
  );
  const aiTurnRef = useRef(0);
  const isComputerTurn = gameMode === "computer" && state.currentPlayer === "B" && !state.winner;

  function resetGame() {
    aiTurnRef.current += 1;
    setState(createInitialTwelveJanggiState());
    setComputerThinking(false);
    setMessage("New game started. Player A to move.");
  }

  function handleSquareClick(square: Square) {
    if (computerThinking || isComputerTurn) {
      return;
    }

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
    if (computerThinking || isComputerTurn) {
      return;
    }

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

  useEffect(() => {
    if (!isComputerTurn) {
      return;
    }

    const turnId = aiTurnRef.current + 1;
    aiTurnRef.current = turnId;
    setComputerThinking(true);
    const timer = window.setTimeout(() => {
      if (aiTurnRef.current !== turnId) {
        return;
      }

      setState((currentState) => {
        if (currentState.winner || currentState.currentPlayer !== "B") {
          setComputerThinking(false);
          return currentState;
        }

        const move = selectTwelveJanggiComputerMove({ state: currentState, difficulty });
        if (!move) {
          setComputerThinking(false);
          setMessage("Player A wins because Player B has no legal move.");
          return { ...currentState, winner: "A" };
        }

        const nextState = applyTwelveJanggiComputerMove(currentState, move);
        if (!nextState) {
          setComputerThinking(false);
          return currentState;
        }

        setMessage(nextState.winner ? "Player B wins." : "Computer moved. Player A to move.");
        setComputerThinking(false);
        return nextState;
      });
    }, computerThinkingDelayMs);

    return () => {
      window.clearTimeout(timer);
    };
  }, [difficulty, isComputerTurn, state]);

  const pendingThreat = state.pendingKingTerritoryThreat;

  return (
    <main className="shell game-shell theme-twelve-janggi">
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
          <p className="page-subtitle">
            A 3 by 4 strategy game with captures, drops, promotion, and a
            delayed King-territory win condition.
          </p>
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
                : computerThinking
                  ? "Computer thinking"
                  : `Player ${state.currentPlayer} to move`}
            </h2>
            {pendingThreat && !state.winner ? (
              <p className="threat-note">
                Player {pendingThreat.player}'s King is threatening escape.
                Capture it this turn or Player {pendingThreat.player} wins.
              </p>
            ) : null}
          </div>

          <section className="turn-card solo-mode-card" aria-label="Game mode">
            <p className="eyebrow">Mode</p>
            <div className="button-row">
              <button
                aria-pressed={gameMode === "twoPlayer"}
                className={`secondary-button ${gameMode === "twoPlayer" ? "primary-action" : ""}`}
                onClick={() => {
                  aiTurnRef.current += 1;
                  setComputerThinking(false);
                  setGameMode("twoPlayer");
                }}
                type="button"
              >
                Two Player
              </button>
              <button
                aria-pressed={gameMode === "computer"}
                className={`secondary-button ${gameMode === "computer" ? "primary-action" : ""}`}
                onClick={() => {
                  aiTurnRef.current += 1;
                  setComputerThinking(false);
                  setGameMode("computer");
                }}
                type="button"
              >
                Play vs Computer
              </button>
            </div>
            {gameMode === "computer" ? (
              <label className="field">
                <span>Difficulty</span>
                <select value={difficulty} onChange={(event) => setDifficulty(event.target.value as OpponentDifficulty)}>
                  <option value="easy">Easy</option>
                  <option value="normal">Normal</option>
                </select>
              </label>
            ) : null}
          </section>

          <TutorialButton gameId="twelve-janggi" steps={twelveJanggiTutorial} />
          <KeyboardHints hints={["Tab: focus square", "Enter/Space: select", "Esc: close tutorial"]} />
          <HandPanel disabled={computerThinking || isComputerTurn} player="A" state={state} onSelect={handleHandSelect} />
          <HandPanel disabled={computerThinking || isComputerTurn} player="B" state={state} onSelect={handleHandSelect} />
        </aside>

        <section className="board-panel" aria-label="Twelve Janggi play area">
          {state.winner ? (
            <div className="winner-banner" role="status">
              Player {state.winner} wins
            </div>
          ) : null}

          <TwelveJanggiBoard disabled={computerThinking || isComputerTurn} state={state} onSquareClick={handleSquareClick} />

          <div className="feedback" role="status" aria-live="polite">
            <strong>{state.winner ? "Game over" : "Rule check"}</strong>
            <span>{gameMode === "computer" ? `Playing vs Computer. You control Player A; the computer controls Player B. ${computerThinking ? "Computer is thinking." : message}` : message}</span>
          </div>
        </section>

        <aside className="rules-panel" aria-label="Twelve Janggi instructions">
          <p className="eyebrow">Instructions</p>
          <h2>How to play</h2>
          <p className="instructions-intro">
            Player A starts at the bottom and moves upward. Player B starts at
            the top and moves downward. Select a piece or hand piece, then choose
            one of the highlighted legal squares.
          </p>

          <section className="rules-section">
            <h3>Goal</h3>
            <ul>
              <li>Capture the enemy King to win immediately.</li>
              <li>You can also win by moving your King into the opponent's territory and having it survive the opponent's next turn.</li>
            </ul>
          </section>

          <section className="rules-section">
            <h3>Turn</h3>
            <ul>
              <li>Move one board piece to a highlighted square, or drop one captured hand piece onto a highlighted empty square.</li>
              <li>Captured non-King pieces enter the capturer's hand and may be dropped later as that player's piece.</li>
              <li>Feudal Lords become Men when captured.</li>
              <li>Hand pieces cannot be dropped into the opponent's territory row.</li>
            </ul>
          </section>

          <section className="rules-section">
            <h3>Solo mode</h3>
            <ul>
              <li>Choose Play vs Computer to play Player A against a computer Player B.</li>
              <li>The computer uses legal moves and drops, preferring captures on Normal.</li>
            </ul>
          </section>

          <section className="rules-section">
            <h3>Pieces</h3>
            <ul>
              <li>King moves one square in any direction.</li>
              <li>General moves one square orthogonally: up, down, left, or right.</li>
              <li>Minister moves one square diagonally.</li>
              <li>Man moves one square forward and promotes to Feudal Lord when it enters opponent territory.</li>
              <li>Feudal Lord moves like a King except it cannot move diagonally backward.</li>
            </ul>
          </section>
        </aside>
      </section>
    </main>
  );
}
