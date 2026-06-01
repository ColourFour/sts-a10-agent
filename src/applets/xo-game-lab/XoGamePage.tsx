import { Eye, EyeOff, FlaskConical, RotateCcw, Undo2 } from "lucide-react";
import { useMemo, useState } from "react";
import {
  DEFAULT_STRIP_INPUT,
  applyMove,
  createBoard,
  hasBlankStrip,
  listLegalMoves,
  parseStripLengths,
  type Board,
  type MoveColor,
  type SymbolMark,
} from "../../xoGame";

type XoGameState = {
  board: Board;
  currentPlayer: SymbolMark;
  winner: SymbolMark | null;
};

function buildInitialGame(input: string): XoGameState {
  return {
    board: createBoard(parseStripLengths(input)),
    currentPlayer: "X",
    winner: null,
  };
}

const colorLabels: Record<MoveColor, string> = {
  red: "Red",
  blue: "Blue",
};

export function XoGamePage() {
  const [stripInput, setStripInput] = useState(DEFAULT_STRIP_INPUT);
  const [game, setGame] = useState<XoGameState>(() =>
    buildInitialGame(DEFAULT_STRIP_INPUT),
  );
  const [selectedColor, setSelectedColor] = useState<MoveColor>("red");
  const [feedback, setFeedback] = useState(
    "X starts. Because blank strips exist, the opening phase must fill a blank strip each turn.",
  );
  const [showValidMoves, setShowValidMoves] = useState(true);
  const [inputError, setInputError] = useState<string | null>(null);

  const legalMoves = useMemo(
    () =>
      game.winner
        ? []
        : listLegalMoves(game.board, game.currentPlayer).filter(
            (move) => move.color === selectedColor,
          ),
    [game.board, game.currentPlayer, game.winner, selectedColor],
  );

  const legalMoveKeys = useMemo(
    () =>
      new Set(
        legalMoves.map((move) => `${move.stripIndex}:${move.cellIndex}`),
      ),
    [legalMoves],
  );

  const blankStripRuleActive = hasBlankStrip(game.board);
  const totalLegalMoves = game.winner
    ? 0
    : listLegalMoves(game.board, game.currentPlayer).length;

  function resetGame(nextInput = stripInput) {
    try {
      const nextGame = buildInitialGame(nextInput);
      setGame(nextGame);
      setStripInput(nextInput);
      setInputError(null);
      setFeedback(
        "Board reset. X starts, and the blank-strip rule is active until every strip has at least one mark.",
      );
    } catch (error) {
      setInputError(error instanceof Error ? error.message : "Invalid strips.");
    }
  }

  function playSquare(stripIndex: number, cellIndex: number) {
    if (game.winner) {
      setFeedback("The game is over. Reset the board to play again.");
      return;
    }

    const result = applyMove(game.board, game.currentPlayer, {
      stripIndex,
      cellIndex,
      color: selectedColor,
    });

    if (!result.ok) {
      setFeedback(`Move blocked: ${result.reason}`);
      return;
    }

    setGame({
      board: result.board,
      currentPlayer: result.nextPlayer,
      winner: result.winner,
    });

    if (result.winner) {
      setFeedback(`${result.winner} wins. ${result.nextPlayer} has no valid move.`);
      return;
    }

    setFeedback(
      `${game.currentPlayer} placed a ${selectedColor} mark. ${result.nextPlayer} to move.`,
    );
  }

  return (
    <main className="shell xo-shell game-shell theme-xo-game-lab">
      <nav className="page-nav" aria-label="Applet navigation">
        <a className="back-link" href="#/applets">
          <Undo2 size={17} aria-hidden="true" />
          Back to Applets
        </a>
      </nav>

      <section className="game-header">
        <div>
          <p className="eyebrow">Playable prototype</p>
          <h1>XO Game Lab</h1>
          <p className="page-subtitle">
            A strip-placement game about avoiding matching neighbors while
            choosing both a symbol turn and a color.
          </p>
        </div>
        <button className="secondary-button" onClick={() => resetGame()} type="button">
          <RotateCcw size={17} aria-hidden="true" />
          Reset
        </button>
      </section>

      <section className="xo-layout">
        <aside className="side-panel" aria-label="XO game controls">
          <div className="panel-heading">
            <FlaskConical size={18} aria-hidden="true" />
            <span>Lab Controls</span>
          </div>

          <label className="field">
            <span>Strip lengths</span>
            <input
              aria-invalid={inputError ? "true" : "false"}
              onBlur={() => resetGame(stripInput)}
              onChange={(event) => {
                setStripInput(event.target.value);
                setInputError(null);
              }}
              placeholder="1,2,3,5,8"
              value={stripInput}
            />
          </label>
          {inputError ? <p className="error-text">{inputError}</p> : null}

          <div className="button-row" aria-label="Color choice">
            {(["red", "blue"] as MoveColor[]).map((color) => (
              <button
                className={`color-choice ${color} ${
                  selectedColor === color ? "selected" : ""
                }`}
                aria-pressed={selectedColor === color}
                key={color}
                onClick={() => setSelectedColor(color)}
                type="button"
              >
                {colorLabels[color]}
              </button>
            ))}
          </div>

          <button
            className="secondary-button wide"
            aria-pressed={showValidMoves}
            onClick={() => setShowValidMoves((value) => !value)}
            type="button"
          >
            {showValidMoves ? (
              <EyeOff size={17} aria-hidden="true" />
            ) : (
              <Eye size={17} aria-hidden="true" />
            )}
            {showValidMoves ? "Hide valid moves" : "Show valid moves"}
          </button>

          <div className="turn-card">
            <p className="eyebrow">Forced phase</p>
            <h2>{blankStripRuleActive ? "Active" : "Complete"}</h2>
            <p className="helper-text">
              {blankStripRuleActive
                ? "At least one strip is blank, so the next move must land on a blank strip."
                : "Every strip has a mark. Moves may now target any legal blank square."}
            </p>
          </div>
        </aside>

        <section className="board-panel" aria-label="XO game board">
          <div className="xo-status">
            <div>
              <p className="eyebrow">Turn</p>
              <h2>
                {game.winner
                  ? `${game.winner} wins`
                  : `${game.currentPlayer} to move`}
              </h2>
            </div>
            <div className={`xo-token token-${game.currentPlayer}`}>
              {game.currentPlayer}
            </div>
          </div>

          <div className="xo-board" role="grid" aria-label="Game strips">
            {game.board.map((strip, stripIndex) => {
              const stripIsBlank = strip.every((cell) => cell === null);

              return (
                <div className="xo-strip-row" key={stripIndex}>
                  <div className="xo-strip-meta">
                    <span>Strip {stripIndex + 1}</span>
                    <small>
                      {strip.length} square{strip.length === 1 ? "" : "s"}
                    </small>
                  </div>
                  <div
                    className={`xo-strip ${stripIsBlank ? "blank-strip" : ""}`}
                    style={{
                      gridTemplateColumns: `repeat(${strip.length}, minmax(42px, 64px))`,
                    }}
                  >
                    {strip.map((cell, cellIndex) => {
                      const key = `${stripIndex}:${cellIndex}`;
                      const isLegal = legalMoveKeys.has(key);

                      return (
                        <button
                          aria-label={
                            cell
                              ? `${cell.symbol} ${cell.color}`
                              : `Blank square ${cellIndex + 1} on strip ${
                                  stripIndex + 1
                                }`
                          }
                          className={`xo-square ${
                            cell ? `filled ${cell.color}` : "blank"
                          } ${showValidMoves && isLegal ? "valid-move" : ""}`}
                          key={cellIndex}
                          onClick={() => playSquare(stripIndex, cellIndex)}
                          type="button"
                        >
                          {cell ? cell.symbol : ""}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="feedback" role="status" aria-live="polite">
            <strong>{game.winner ? "Game over" : "Rule check"}</strong>
            <span>{feedback}</span>
          </div>

          <p className="helper-text legal-move-count">
            {game.winner
              ? "Reset the board to explore another strip layout."
              : `${totalLegalMoves} legal move${
                  totalLegalMoves === 1 ? "" : "s"
                } available for ${game.currentPlayer}.`}
          </p>
        </section>

        <aside className="rules-panel" aria-label="XO game instructions">
          <p className="eyebrow">Instructions</p>
          <h2>How to play</h2>
          <p className="instructions-intro">
            XO Game Lab is a two-player placement puzzle. The turn decides
            whether the mark is X or O; the player chooses whether that mark is
            red or blue.
          </p>

          <section className="rules-section">
            <h3>Goal</h3>
            <ul>
              <li>Keep making legal placements while limiting the opponent's options.</li>
              <li>The player who leaves the next player with no legal move wins.</li>
            </ul>
          </section>

          <section className="rules-section">
            <h3>Turn</h3>
            <ul>
              <li>X starts, then turns alternate between X and O.</li>
              <li>Choose Red or Blue before placing the current symbol.</li>
              <li>Click a highlighted blank square to place the mark.</li>
            </ul>
          </section>

          <section className="rules-section">
            <h3>Legal placement</h3>
            <ul>
              <li>While any strip is completely blank, you must play on a completely blank strip.</li>
              <li>After every strip has at least one mark, any legal blank square may be used.</li>
              <li>A new mark cannot match the symbol or color of an adjacent filled square on the same strip.</li>
            </ul>
          </section>

          <section className="rules-section">
            <h3>Board setup</h3>
            <ul>
              <li>Strip lengths are comma-separated positive whole numbers.</li>
              <li>Changing the strip lengths and leaving the field resets the board.</li>
            </ul>
          </section>
        </aside>
      </section>
    </main>
  );
}
