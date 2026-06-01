import { Chess, type Square as ChessSquare } from "chess.js";
import { Pause, Play, RotateCcw, Undo2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { BoardCoordinates, HighScorePanel, KeyboardHints, TutorialButton, type TutorialStep } from "../GameUi";
import {
  applyDomineeringMove,
  applyHexMove,
  applyKonaneMove,
  canPlaceDomino,
  computerThinkingDelayMs,
  initialKonaneBoard,
  legalKonaneJumps,
  makeMatrix,
  otherPlayer,
  pointKey,
  selectDomineeringComputerMove,
  selectHexComputerMove,
  selectKonaneComputerMove,
  type CellOwner,
  type DomineeringPlayer,
  type GameMode,
  type KonanePiece,
  type OpponentDifficulty,
  type PlayerMark,
  type Point,
} from "../boardGameOpponents";
import { getHighScores, recordHighScore, type HighScoreEntry } from "../gameScoring";
import { isSuperHexagonCollision, normalizeAngle, type SuperHexagonWall } from "./superHexagonMath";

function themeClass(title: string): string {
  return `theme-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
}

function parsePoint(key: string): Point {
  const [row, col] = key.split(":").map(Number);
  return { row, col };
}

function AppletPageShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <main className={`shell game-shell ${themeClass(title)}`}>
      <nav className="page-nav" aria-label="Applet navigation">
        <a className="back-link" href="#/applets">
          <Undo2 size={17} aria-hidden="true" />
          Back to Applets
        </a>
      </nav>
      <section className="game-header">
        <div>
          <p className="eyebrow">Playable prototype</p>
          <h1>{title}</h1>
          <p className="page-subtitle">{subtitle}</p>
        </div>
      </section>
      {children}
    </main>
  );
}

function ResetButton({ onClick }: { onClick: () => void }) {
  return (
    <button className="secondary-button" onClick={onClick} type="button">
      <RotateCcw size={17} aria-hidden="true" />
      Reset
    </button>
  );
}

function SoloModeControls({
  difficulty,
  gameMode,
  onDifficultyChange,
  onModeChange,
}: {
  difficulty: OpponentDifficulty;
  gameMode: GameMode;
  onDifficultyChange: (difficulty: OpponentDifficulty) => void;
  onModeChange: (mode: GameMode) => void;
}) {
  return (
    <section className="turn-card solo-mode-card" aria-label="Game mode">
      <p className="eyebrow">Mode</p>
      <div className="button-row">
        <button
          aria-pressed={gameMode === "twoPlayer"}
          className={`secondary-button ${gameMode === "twoPlayer" ? "primary-action" : ""}`}
          onClick={() => onModeChange("twoPlayer")}
          type="button"
        >
          Two Player
        </button>
        <button
          aria-pressed={gameMode === "computer"}
          className={`secondary-button ${gameMode === "computer" ? "primary-action" : ""}`}
          onClick={() => onModeChange("computer")}
          type="button"
        >
          Play vs Computer
        </button>
      </div>
      {gameMode === "computer" ? (
        <label className="field">
          <span>Difficulty</span>
          <select value={difficulty} onChange={(event) => onDifficultyChange(event.target.value as OpponentDifficulty)}>
            <option value="easy">Easy</option>
            <option value="normal">Normal</option>
          </select>
        </label>
      ) : null}
    </section>
  );
}

function StatusCard({
  title,
  message,
  winner,
}: {
  title: string;
  message: string;
  winner?: PlayerMark | string | null;
}) {
  return (
    <section className="turn-card">
      <p className="eyebrow">{winner ? "Game over" : "Turn"}</p>
      <h2>{winner ? `${winner} wins` : title}</h2>
      <p className="helper-text">{message}</p>
    </section>
  );
}

type InstructionSection = {
  title: string;
  items: string[];
};

function RulesList({
  intro,
  sections,
}: {
  intro: string;
  sections: InstructionSection[];
}) {
  return (
    <aside className="rules-panel" aria-label="Instructions">
      <p className="eyebrow">Instructions</p>
      <h2>How to play</h2>
      <p className="instructions-intro">{intro}</p>
      {sections.map((section) => (
        <section className="rules-section" key={section.title}>
          <h3>{section.title}</h3>
          <ul>
            {section.items.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
        </section>
      ))}
    </aside>
  );
}

function inBounds(point: Point, size: number): boolean {
  return point.row >= 0 && point.row < size && point.col >= 0 && point.col < size;
}

function neighbors4(point: Point): Point[] {
  return [
    { row: point.row - 1, col: point.col },
    { row: point.row + 1, col: point.col },
    { row: point.row, col: point.col - 1 },
    { row: point.row, col: point.col + 1 },
  ];
}

export function HexPage() {
  const size = 7;
  const [board, setBoard] = useState<CellOwner[][]>(() => makeMatrix(size, null));
  const [currentPlayer, setCurrentPlayer] = useState<PlayerMark>("A");
  const [winner, setWinner] = useState<PlayerMark | null>(null);
  const [gameMode, setGameMode] = useState<GameMode>("twoPlayer");
  const [difficulty, setDifficulty] = useState<OpponentDifficulty>("normal");
  const [computerThinking, setComputerThinking] = useState(false);
  const aiTurnRef = useRef(0);
  const isComputerTurn = gameMode === "computer" && currentPlayer === "B" && !winner;

  function play(point: Point) {
    if (winner || computerThinking || (gameMode === "computer" && currentPlayer === "B")) {
      return;
    }

    const result = applyHexMove(board, currentPlayer, point);
    if (!result) {
      return;
    }

    setBoard(result.board);
    setWinner(result.winner);
    setCurrentPlayer(otherPlayer(currentPlayer));
  }

  function reset() {
    aiTurnRef.current += 1;
    setBoard(makeMatrix(size, null));
    setCurrentPlayer("A");
    setWinner(null);
    setComputerThinking(false);
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

      setBoard((currentBoard) => {
        const move = selectHexComputerMove({ board: currentBoard, player: "B", difficulty });
        if (!move) {
          setWinner("A");
          setComputerThinking(false);
          return currentBoard;
        }

        const result = applyHexMove(currentBoard, "B", move);
        if (!result) {
          setComputerThinking(false);
          return currentBoard;
        }

        setWinner(result.winner);
        setCurrentPlayer("A");
        setComputerThinking(false);
        return result.board;
      });
    }, computerThinkingDelayMs);

    return () => {
      window.clearTimeout(timer);
    };
  }, [difficulty, isComputerTurn]);

  return (
    <AppletPageShell title="Hex" subtitle="Connect your two sides before your opponent completes theirs.">
      <section className="mini-game-layout">
        <aside className="side-panel">
          <ResetButton onClick={reset} />
          <SoloModeControls
            difficulty={difficulty}
            gameMode={gameMode}
            onDifficultyChange={setDifficulty}
            onModeChange={(mode) => {
              aiTurnRef.current += 1;
              setComputerThinking(false);
              setGameMode(mode);
            }}
          />
          <StatusCard
            message={`${gameMode === "computer" ? "Playing vs Computer. You control Player A; the computer controls Player B. " : ""}${computerThinking ? "Computer is thinking." : "Player A connects left to right. Player B connects top to bottom."}`}
            title={computerThinking ? "Computer thinking" : `Player ${currentPlayer} to place`}
            winner={winner ? `Player ${winner}` : null}
          />
        </aside>
        <section className="board-panel">
          <div className="hex-board">
            {board.map((row, rowIndex) => (
              <div className="hex-row" key={rowIndex} style={{ marginLeft: rowIndex * 18 }}>
                {row.map((cell, colIndex) => (
                <button
                  aria-label={`Hex ${rowIndex + 1}, ${colIndex + 1}`}
                  className={`hex-cell owner-${cell ?? "empty"}`}
                  disabled={computerThinking || isComputerTurn}
                  key={`${rowIndex}:${colIndex}`}
                  onClick={() => play({ row: rowIndex, col: colIndex })}
                  type="button"
                >
                  {cell ?? ""}
                </button>
                ))}
              </div>
            ))}
          </div>
        </section>
        <RulesList
          intro="Hex is a connection race. The board fills with stones, and a connected path across your assigned edges wins immediately."
          sections={[
            {
              title: "Goal",
              items: [
                "Player A is red and must connect the left edge to the right edge.",
                "Player B is blue and must connect the top edge to the bottom edge.",
              ],
            },
            {
              title: "Turn",
              items: [
                "Player A places first.",
                "On your turn, click any empty hex to place one of your stones.",
                "Stones never move or get removed after placement.",
              ],
            },
            {
              title: "Win",
              items: [
                "A path connects through neighboring hexes of your own color.",
                "The first player with a complete path across their two edges wins.",
              ],
            },
            {
              title: "Solo mode",
              items: [
                "Choose Play vs Computer to play as Player A against a computer Player B.",
                "Computer moves use legal empty cells only and appear after a short thinking delay.",
              ],
            },
          ]}
        />
      </section>
    </AppletPageShell>
  );
}

export function DomineeringPage() {
  const size = 6;
  const [board, setBoard] = useState<(DomineeringPlayer | null)[][]>(() => makeMatrix(size, null));
  const [currentPlayer, setCurrentPlayer] = useState<DomineeringPlayer>("V");
  const [winner, setWinner] = useState<DomineeringPlayer | null>(null);
  const [gameMode, setGameMode] = useState<GameMode>("twoPlayer");
  const [difficulty, setDifficulty] = useState<OpponentDifficulty>("normal");
  const [computerThinking, setComputerThinking] = useState(false);
  const aiTurnRef = useRef(0);
  const isComputerTurn = gameMode === "computer" && currentPlayer === "H" && !winner;

  function play(point: Point) {
    if (winner || computerThinking || isComputerTurn) {
      return;
    }

    const result = applyDomineeringMove(board, currentPlayer, point);
    if (!result) {
      return;
    }

    setBoard(result.board);
    setWinner(result.winner);
    setCurrentPlayer(result.nextPlayer);
  }

  function reset() {
    aiTurnRef.current += 1;
    setBoard(makeMatrix(size, null));
    setCurrentPlayer("V");
    setWinner(null);
    setComputerThinking(false);
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

      setBoard((currentBoard) => {
        const move = selectDomineeringComputerMove({ board: currentBoard, player: "H", difficulty });
        if (!move) {
          setWinner("V");
          setComputerThinking(false);
          return currentBoard;
        }

        const result = applyDomineeringMove(currentBoard, "H", move);
        if (!result) {
          setComputerThinking(false);
          return currentBoard;
        }

        setWinner(result.winner);
        setCurrentPlayer(result.nextPlayer);
        setComputerThinking(false);
        return result.board;
      });
    }, computerThinkingDelayMs);

    return () => {
      window.clearTimeout(timer);
    };
  }, [difficulty, isComputerTurn]);

  return (
    <AppletPageShell title="Domineering" subtitle="Vertical dominoes versus horizontal dominoes on a shared board.">
      <section className="mini-game-layout">
        <aside className="side-panel">
          <ResetButton onClick={reset} />
          <SoloModeControls
            difficulty={difficulty}
            gameMode={gameMode}
            onDifficultyChange={setDifficulty}
            onModeChange={(mode) => {
              aiTurnRef.current += 1;
              setComputerThinking(false);
              setGameMode(mode);
            }}
          />
          <StatusCard
            message={`${gameMode === "computer" ? "Playing vs Computer. You control Vertical; the computer controls Horizontal. " : ""}${computerThinking ? "Computer is thinking." : "Click the top or left square for your domino. The next player loses if no placement remains."}`}
            title={computerThinking ? "Computer thinking" : `${currentPlayer === "V" ? "Vertical" : "Horizontal"} to place`}
            winner={winner ? (winner === "V" ? "Vertical" : "Horizontal") : null}
          />
        </aside>
        <section className="board-panel">
          <div className="square-board compact-board" style={{ gridTemplateColumns: `repeat(${size}, 1fr)` }}>
            {board.map((row, rowIndex) =>
              row.map((cell, colIndex) => (
                <button
                  aria-label={`Domineering square ${rowIndex + 1}, ${colIndex + 1}`}
                  className={`mini-cell owner-${cell ?? "empty"} ${canPlaceDomino(board, currentPlayer, { row: rowIndex, col: colIndex }) ? "legal-target" : ""}`}
                  disabled={computerThinking || isComputerTurn}
                  key={`${rowIndex}:${colIndex}`}
                  onClick={() => play({ row: rowIndex, col: colIndex })}
                  type="button"
                >
                  {cell ?? ""}
                </button>
              )),
            )}
          </div>
        </section>
        <RulesList
          intro="Domineering is a blocking game. Each player owns one domino direction, and the board gets tighter after every placement."
          sections={[
            {
              title: "Goal",
              items: [
                "Vertical wins by leaving Horizontal with no legal horizontal domino placement.",
                "Horizontal wins by leaving Vertical with no legal vertical domino placement.",
              ],
            },
            {
              title: "Turn",
              items: [
                "Vertical places a domino on two stacked empty squares.",
                "Horizontal places a domino on two side-by-side empty squares.",
                "Click the top square for a vertical domino or the left square for a horizontal domino.",
              ],
            },
            {
              title: "Limits",
              items: [
                "Dominoes cannot overlap existing dominoes or extend off the board.",
                "Highlighted squares show legal starting positions for the current player.",
              ],
            },
            {
              title: "Solo mode",
              items: [
                "Choose Play vs Computer to play Vertical against a computer Horizontal player.",
                "The computer waits briefly, then chooses a legal domino placement.",
              ],
            },
          ]}
        />
      </section>
    </AppletPageShell>
  );
}

export function KonanePage() {
  const size = 6;
  const [board, setBoard] = useState<KonanePiece[][]>(() => initialKonaneBoard());
  const [currentPlayer, setCurrentPlayer] = useState<"B" | "W">("B");
  const [selected, setSelected] = useState<Point | null>(null);
  const [winner, setWinner] = useState<"B" | "W" | null>(null);
  const [gameMode, setGameMode] = useState<GameMode>("twoPlayer");
  const [difficulty, setDifficulty] = useState<OpponentDifficulty>("normal");
  const [computerThinking, setComputerThinking] = useState(false);
  const aiTurnRef = useRef(0);
  const isComputerTurn = gameMode === "computer" && currentPlayer === "W" && !winner;

  function play(point: Point) {
    if (winner || computerThinking || isComputerTurn) {
      return;
    }

    if (selected) {
      const result = applyKonaneMove(board, currentPlayer, { from: selected, to: point });
      if (result) {
        setBoard(result.board);
        setSelected(null);
        setWinner(result.winner);
        setCurrentPlayer(result.nextPlayer);
        return;
      }
    }

    setSelected(board[point.row][point.col] === currentPlayer ? point : null);
  }

  function reset() {
    aiTurnRef.current += 1;
    setBoard(initialKonaneBoard());
    setCurrentPlayer("B");
    setSelected(null);
    setWinner(null);
    setComputerThinking(false);
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

      setBoard((currentBoard) => {
        const move = selectKonaneComputerMove({ board: currentBoard, player: "W", difficulty });
        if (!move) {
          setWinner("B");
          setComputerThinking(false);
          return currentBoard;
        }

        const result = applyKonaneMove(currentBoard, "W", move);
        if (!result) {
          setComputerThinking(false);
          return currentBoard;
        }

        setSelected(null);
        setWinner(result.winner);
        setCurrentPlayer(result.nextPlayer);
        setComputerThinking(false);
        return result.board;
      });
    }, computerThinkingDelayMs);

    return () => {
      window.clearTimeout(timer);
    };
  }, [difficulty, isComputerTurn]);

  const legalTargets = new Set(selected ? legalKonaneJumps(board, selected, currentPlayer).map(pointKey) : []);

  return (
    <AppletPageShell title="Konane" subtitle="Jump captures on a compact Hawaiian checkers board.">
      <section className="mini-game-layout">
        <aside className="side-panel">
          <ResetButton onClick={reset} />
          <SoloModeControls
            difficulty={difficulty}
            gameMode={gameMode}
            onDifficultyChange={setDifficulty}
            onModeChange={(mode) => {
              aiTurnRef.current += 1;
              setComputerThinking(false);
              setGameMode(mode);
            }}
          />
          <StatusCard
            message={`${gameMode === "computer" ? "Playing vs Computer. You control Black; the computer controls White. " : ""}${computerThinking ? "Computer is thinking." : "Select one of your pieces, then jump over an adjacent enemy into an empty square."}`}
            title={computerThinking ? "Computer thinking" : `${currentPlayer === "B" ? "Black" : "White"} to jump`}
            winner={winner ? (winner === "B" ? "Black" : "White") : null}
          />
        </aside>
        <section className="board-panel">
          <div className="square-board compact-board" style={{ gridTemplateColumns: `repeat(${size}, 1fr)` }}>
            {board.map((row, rowIndex) =>
              row.map((cell, colIndex) => {
                const key = `${rowIndex}:${colIndex}`;
                return (
                  <button
                    aria-label={`Konane square ${rowIndex + 1}, ${colIndex + 1}`}
                    className={`mini-cell konane ${cell ? `owner-${cell}` : "owner-empty"} ${selected && pointKey(selected) === key ? "selected" : ""} ${legalTargets.has(key) ? "legal-target" : ""}`}
                    disabled={computerThinking || isComputerTurn}
                    key={key}
                    onClick={() => play({ row: rowIndex, col: colIndex })}
                    type="button"
                  >
                    {cell ?? ""}
                  </button>
                );
              }),
            )}
          </div>
        </section>
        <RulesList
          intro="Konane is a jump-capture game. This compact prototype starts after the opening removals, with Black to move."
          sections={[
            {
              title: "Goal",
              items: [
                "Capture enemy pieces by jumping over them.",
                "Win by making sure the next player has no legal jump.",
              ],
            },
            {
              title: "Turn",
              items: [
                "Select one of your pieces.",
                "Jump orthogonally over one adjacent enemy piece into the empty square immediately beyond it.",
                "The jumped enemy piece is removed from the board.",
              ],
            },
            {
              title: "Prototype note",
              items: [
                "This version uses exactly one jump per turn.",
                "Highlighted squares show the legal landing squares for the selected piece.",
              ],
            },
            {
              title: "Solo mode",
              items: [
                "Choose Play vs Computer to play Black against a computer White player.",
                "The computer selects a legal capture after a short thinking delay.",
              ],
            },
          ]}
        />
      </section>
    </AppletPageShell>
  );
}

type MorrisPhase = "placing" | "moving" | "removing";
type MorrisState = {
  board: Record<string, CellOwner>;
  currentPlayer: PlayerMark;
  phase: MorrisPhase;
  placed: Record<PlayerMark, number>;
  selected: string | null;
  winner: PlayerMark | null;
  message: string;
};

const morrisPoints = [
  [0, 0], [0, 3], [0, 6], [1, 1], [1, 3], [1, 5], [2, 2], [2, 3],
  [2, 4], [3, 0], [3, 1], [3, 2], [3, 4], [3, 5], [3, 6], [4, 2],
  [4, 3], [4, 4], [5, 1], [5, 3], [5, 5], [6, 0], [6, 3], [6, 6],
].map(([row, col]) => `${row}:${col}`);

const morrisAdjacency: Record<string, string[]> = {
  "0:0": ["0:3", "3:0"], "0:3": ["0:0", "0:6", "1:3"], "0:6": ["0:3", "3:6"],
  "1:1": ["1:3", "3:1"], "1:3": ["0:3", "1:1", "1:5", "2:3"], "1:5": ["1:3", "3:5"],
  "2:2": ["2:3", "3:2"], "2:3": ["1:3", "2:2", "2:4"], "2:4": ["2:3", "3:4"],
  "3:0": ["0:0", "3:1", "6:0"], "3:1": ["1:1", "3:0", "3:2", "5:1"], "3:2": ["2:2", "3:1", "4:2"],
  "3:4": ["2:4", "3:5", "4:4"], "3:5": ["1:5", "3:4", "3:6", "5:5"], "3:6": ["0:6", "3:5", "6:6"],
  "4:2": ["3:2", "4:3"], "4:3": ["4:2", "4:4", "5:3"], "4:4": ["3:4", "4:3"],
  "5:1": ["3:1", "5:3"], "5:3": ["4:3", "5:1", "5:5", "6:3"], "5:5": ["3:5", "5:3"],
  "6:0": ["3:0", "6:3"], "6:3": ["5:3", "6:0", "6:6"], "6:6": ["3:6", "6:3"],
};

const morrisMills = [
  ["0:0", "0:3", "0:6"], ["1:1", "1:3", "1:5"], ["2:2", "2:3", "2:4"],
  ["3:0", "3:1", "3:2"], ["3:4", "3:5", "3:6"], ["4:2", "4:3", "4:4"],
  ["5:1", "5:3", "5:5"], ["6:0", "6:3", "6:6"], ["0:0", "3:0", "6:0"],
  ["1:1", "3:1", "5:1"], ["2:2", "3:2", "4:2"], ["0:3", "1:3", "2:3"],
  ["4:3", "5:3", "6:3"], ["2:4", "3:4", "4:4"], ["1:5", "3:5", "5:5"],
  ["0:6", "3:6", "6:6"],
];

function initialMorrisState(): MorrisState {
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

function formsMill(board: Record<string, CellOwner>, player: PlayerMark, key: string): boolean {
  return morrisMills.some((mill) => mill.includes(key) && mill.every((point) => board[point] === player));
}

function morrisPieceCount(board: Record<string, CellOwner>, player: PlayerMark): number {
  return Object.values(board).filter((cell) => cell === player).length;
}

function morrisPieces(board: Record<string, CellOwner>, player: PlayerMark): string[] {
  return morrisPoints.filter((key) => board[key] === player);
}

function morrisPieceIsInMill(board: Record<string, CellOwner>, player: PlayerMark, key: string): boolean {
  return morrisMills.some((mill) => mill.includes(key) && mill.every((point) => board[point] === player));
}

function canRemoveMorrisPiece(board: Record<string, CellOwner>, remover: PlayerMark, key: string): boolean {
  const opponent = otherPlayer(remover);

  if (board[key] !== opponent) {
    return false;
  }

  const opponentPieces = morrisPieces(board, opponent);
  const allOpponentPiecesAreInMills = opponentPieces.every((pieceKey) =>
    morrisPieceIsInMill(board, opponent, pieceKey),
  );

  return allOpponentPiecesAreInMills || !morrisPieceIsInMill(board, opponent, key);
}

function morrisLegalDestinations(board: Record<string, CellOwner>, from: string, player: PlayerMark): string[] {
  if (board[from] !== player) {
    return [];
  }

  const canFly = morrisPieceCount(board, player) === 3;

  if (canFly) {
    return morrisPoints.filter((key) => board[key] === null);
  }

  return morrisAdjacency[from].filter((key) => board[key] === null);
}

function morrisHasMove(board: Record<string, CellOwner>, player: PlayerMark): boolean {
  if (morrisPieceCount(board, player) < 3) {
    return false;
  }

  return morrisPieces(board, player).some(
    (key) => morrisLegalDestinations(board, key, player).length > 0,
  );
}

export function NineMensMorrisPage() {
  const [state, setState] = useState<MorrisState>(() => initialMorrisState());
  const morrisLegalTargets = new Set(
    state.phase === "moving" && state.selected
      ? morrisLegalDestinations(state.board, state.selected, state.currentPlayer)
      : state.phase === "removing"
        ? morrisPoints.filter((key) => canRemoveMorrisPiece(state.board, state.currentPlayer, key))
        : [],
  );

  function finishTurn(next: MorrisState, millKey: string | null): MorrisState {
    if (millKey && formsMill(next.board, next.currentPlayer, millKey)) {
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

  function clickPoint(key: string) {
    if (state.winner) {
      return;
    }

    if (state.phase === "removing") {
      if (!canRemoveMorrisPiece(state.board, state.currentPlayer, key)) {
        setState({
          ...state,
          message:
            "Remove an enemy piece outside a mill, unless every enemy piece is already in a mill.",
        });
        return;
      }

      const board = { ...state.board, [key]: null };
      const opponent = otherPlayer(state.currentPlayer);
      const movingPhase = state.placed.A >= 9 && state.placed.B >= 9;
      const winner = movingPhase && !morrisHasMove(board, opponent) ? state.currentPlayer : null;
      const nextPhase = movingPhase ? "moving" : "placing";
      setState({
        ...state,
        board,
        currentPlayer: winner ? state.currentPlayer : opponent,
        phase: winner ? "removing" : nextPhase,
        winner,
        selected: null,
        message: winner
          ? `Player ${state.currentPlayer} wins because Player ${opponent} cannot continue.`
          : `Player ${opponent} to ${nextPhase === "moving" ? "move" : "place"}.`,
      });
      return;
    }

    if (state.phase === "placing") {
      if (state.board[key] || state.placed[state.currentPlayer] >= 9) {
        return;
      }

      const board = { ...state.board, [key]: state.currentPlayer };
      setState(finishTurn({ ...state, board, placed: { ...state.placed, [state.currentPlayer]: state.placed[state.currentPlayer] + 1 } }, key));
      return;
    }

    if (state.selected) {
      const legalDestination = morrisLegalDestinations(
        state.board,
        state.selected,
        state.currentPlayer,
      ).includes(key);
      if (legalDestination) {
        const board = { ...state.board, [state.selected]: null, [key]: state.currentPlayer };
        setState(finishTurn({ ...state, board, selected: null }, key));
        return;
      }
    }

    setState({ ...state, selected: state.board[key] === state.currentPlayer ? key : null });
  }

  return (
    <AppletPageShell title="Nine Men's Morris" subtitle="Place, mill, remove, then slide pieces around the classic 24-point board.">
      <section className="mini-game-layout">
        <aside className="side-panel">
          <ResetButton onClick={() => setState(initialMorrisState())} />
          <StatusCard message={state.message} title={`Player ${state.currentPlayer}`} winner={state.winner ? `Player ${state.winner}` : null} />
        </aside>
        <section className="board-panel">
          <div className="morris-board">
            {morrisPoints.map((key) => {
              const point = parsePoint(key);
              return (
                <button
                  aria-label={`Morris point ${key}`}
                  className={`morris-point owner-${state.board[key] ?? "empty"} ${state.selected === key ? "selected" : ""} ${morrisLegalTargets.has(key) ? "legal-target" : ""}`}
                  key={key}
                  onClick={() => clickPoint(key)}
                  style={{ gridColumn: point.col + 1, gridRow: point.row + 1 }}
                  type="button"
                >
                  {state.board[key] ?? ""}
                </button>
              );
            })}
          </div>
        </section>
        <RulesList
          intro="Nine Men's Morris has two phases: first players place pieces, then they slide them along the board lines to make mills."
          sections={[
            {
              title: "Goal",
              items: [
                "Make rows of three pieces, called mills, to remove enemy pieces.",
                "After all pieces are placed, win by leaving the opponent with fewer than three pieces or no legal move.",
              ],
            },
            {
              title: "Placement phase",
              items: [
                "Player A places first, and players alternate placing one piece on an empty point.",
                "Each player places nine pieces total.",
                "Whenever your new piece completes a mill, remove one enemy piece before the next turn.",
              ],
            },
            {
              title: "Movement phase",
              items: [
                "Select one of your pieces, then move it to a highlighted adjacent empty point.",
                "If you have exactly three pieces, you may fly to any empty point.",
                "You cannot remove a piece from an enemy mill unless every enemy piece is in a mill.",
              ],
            },
          ]}
        />
      </section>
    </AppletPageShell>
  );
}

type AmazonCell = "." | "A" | "B" | "X";
type AmazonPhase = "select" | "move" | "shoot";

function initialAmazonsBoard(): AmazonCell[][] {
  const board = makeMatrix<AmazonCell>(6, ".");
  board[0][1] = "B";
  board[0][4] = "B";
  board[5][1] = "A";
  board[5][4] = "A";
  return board;
}

function rayTargets(board: AmazonCell[][], from: Point): Point[] {
  const targets: Point[] = [];
  const dirs = [-1, 0, 1].flatMap((row) => [-1, 0, 1].map((col) => ({ row, col }))).filter((d) => d.row !== 0 || d.col !== 0);
  dirs.forEach((dir) => {
    let next = { row: from.row + dir.row, col: from.col + dir.col };
    while (inBounds(next, board.length) && board[next.row][next.col] === ".") {
      targets.push(next);
      next = { row: next.row + dir.row, col: next.col + dir.col };
    }
  });
  return targets;
}

export function AmazonsMiniPage() {
  const [board, setBoard] = useState<AmazonCell[][]>(() => initialAmazonsBoard());
  const [currentPlayer, setCurrentPlayer] = useState<PlayerMark>("A");
  const [phase, setPhase] = useState<AmazonPhase>("select");
  const [selected, setSelected] = useState<Point | null>(null);
  const [winner, setWinner] = useState<PlayerMark | null>(null);

  const legalTargets = useMemo(() => {
    if (!selected || phase === "select") {
      return new Set<string>();
    }
    return new Set(rayTargets(board, selected).map(pointKey));
  }, [board, phase, selected]);

  function playerHasMove(nextBoard: AmazonCell[][], player: PlayerMark): boolean {
    return nextBoard.some((row, rowIndex) =>
      row.some((cell, colIndex) => cell === player && rayTargets(nextBoard, { row: rowIndex, col: colIndex }).length > 0),
    );
  }

  function clickCell(point: Point) {
    if (winner) {
      return;
    }

    if (phase === "select") {
      if (board[point.row][point.col] === currentPlayer) {
        setSelected(point);
        setPhase("move");
      }
      return;
    }

    if (phase === "move" && board[point.row][point.col] === currentPlayer) {
      setSelected(point);
      return;
    }

    if (phase === "move" && selected && legalTargets.has(pointKey(point))) {
      const nextBoard = board.map((row) => [...row]);
      nextBoard[selected.row][selected.col] = ".";
      nextBoard[point.row][point.col] = currentPlayer;
      setBoard(nextBoard);
      setSelected(point);
      setPhase("shoot");
      return;
    }

    if (phase === "shoot" && selected && legalTargets.has(pointKey(point))) {
      const nextBoard = board.map((row) => [...row]);
      nextBoard[point.row][point.col] = "X";
      const nextPlayer = otherPlayer(currentPlayer);
      setBoard(nextBoard);
      setSelected(null);
      setPhase("select");
      setWinner(playerHasMove(nextBoard, nextPlayer) ? null : currentPlayer);
      setCurrentPlayer(nextPlayer);
    }
  }

  function reset() {
    setBoard(initialAmazonsBoard());
    setCurrentPlayer("A");
    setPhase("select");
    setSelected(null);
    setWinner(null);
  }

  return (
    <AppletPageShell title="Amazons Mini" subtitle="Move like a queen, then fire an arrow to claim space.">
      <section className="mini-game-layout">
        <aside className="side-panel">
          <ResetButton onClick={reset} />
          <StatusCard
            message={phase === "select" ? "Select one of your amazons." : phase === "move" ? "Move to a highlighted square." : "Shoot an arrow to a highlighted square."}
            title={`Player ${currentPlayer}: ${phase}`}
            winner={winner ? `Player ${winner}` : null}
          />
        </aside>
        <section className="board-panel">
          <div className="square-board compact-board" style={{ gridTemplateColumns: "repeat(6, 1fr)" }}>
            {board.map((row, rowIndex) =>
              row.map((cell, colIndex) => {
                const key = `${rowIndex}:${colIndex}`;
                return (
                  <button
                    aria-label={`Amazons square ${rowIndex + 1}, ${colIndex + 1}`}
                    className={`mini-cell owner-${cell === "." ? "empty" : cell} ${selected && pointKey(selected) === key ? "selected" : ""} ${legalTargets.has(key) ? "legal-target" : ""}`}
                    key={key}
                    onClick={() => clickCell({ row: rowIndex, col: colIndex })}
                    type="button"
                  >
                    {cell === "." ? "" : cell}
                  </button>
                );
              }),
            )}
          </div>
        </section>
        <RulesList
          intro="Amazons Mini is an area-control duel. Every turn moves one amazon and then permanently blocks one square with an arrow."
          sections={[
            {
              title: "Goal",
              items: [
                "Trap the opponent so none of their amazons can move.",
                "The player who makes the last move wins.",
              ],
            },
            {
              title: "Turn",
              items: [
                "Select one of your amazons.",
                "Move it any distance in a clear straight or diagonal line, like a chess queen.",
                "Then shoot an arrow from the amazon's new square in another clear straight or diagonal line.",
              ],
            },
            {
              title: "Blocked squares",
              items: [
                "Arrow squares are marked X and can never be entered or crossed.",
                "You may select a different amazon before you commit to the move.",
              ],
            },
          ]}
        />
      </section>
    </AppletPageShell>
  );
}

type MiniKind = "K" | "G" | "S" | "B" | "R" | "P" | "+S" | "+B" | "+R" | "+P";
type MiniPiece = { owner: PlayerMark; kind: MiniKind };
type MiniBoard = (MiniPiece | null)[][];

const miniPieceNames: Record<MiniKind, string> = {
  K: "King",
  G: "Gold",
  S: "Silver",
  B: "Bishop",
  R: "Rook",
  P: "Pawn",
  "+S": "Promoted Silver",
  "+B": "Promoted Bishop",
  "+R": "Promoted Rook",
  "+P": "Promoted Pawn",
};

function initialMiniShogiBoard(): MiniBoard {
  const board = makeMatrix<MiniPiece | null>(5, null);
  board[0] = ["R", "B", "S", "G", "K"].map((kind) => ({ owner: "B", kind: kind as MiniKind }));
  board[1][4] = { owner: "B", kind: "P" };
  board[3][0] = { owner: "A", kind: "P" };
  board[4] = ["K", "G", "S", "B", "R"].map((kind) => ({ owner: "A", kind: kind as MiniKind }));
  return board;
}

function demoteMini(kind: MiniKind): MiniKind {
  return kind.startsWith("+") ? (kind.slice(1) as MiniKind) : kind;
}

function miniPromotionRow(player: PlayerMark): number {
  return player === "A" ? 0 : 4;
}

function miniCanPromote(piece: MiniPiece, to: Point): boolean {
  return (
    (piece.kind === "P" || piece.kind === "S" || piece.kind === "B" || piece.kind === "R") &&
    to.row === miniPromotionRow(piece.owner)
  );
}

function miniLegalDrops(board: MiniBoard, player: PlayerMark, kind: MiniKind): Point[] {
  const dropKind = demoteMini(kind);

  return board.flatMap((row, rowIndex) =>
    row.flatMap((cell, colIndex) => {
      if (cell || (dropKind === "P" && rowIndex === miniPromotionRow(player))) {
        return [];
      }

      return [{ row: rowIndex, col: colIndex }];
    }),
  );
}

function removeOneMiniHandPiece(hand: MiniKind[], kindToRemove: MiniKind): MiniKind[] {
  const index = hand.indexOf(kindToRemove);
  if (index === -1) {
    return hand;
  }

  return hand.filter((_, itemIndex) => itemIndex !== index);
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
  if (piece.kind === "G" || piece.kind === "+S" || piece.kind === "+P") {
    return gold;
  }
  if (piece.kind === "S") {
    return [{ row: forward, col: -1 }, { row: forward, col: 0 }, { row: forward, col: 1 }, { row: backward, col: -1 }, { row: backward, col: 1 }];
  }
  if (piece.kind === "P") {
    return [{ row: forward, col: 0 }];
  }
  if (piece.kind === "+B") {
    return [{ row: -1, col: 0 }, { row: 1, col: 0 }, { row: 0, col: -1 }, { row: 0, col: 1 }];
  }
  if (piece.kind === "+R") {
    return [{ row: -1, col: -1 }, { row: -1, col: 1 }, { row: 1, col: -1 }, { row: 1, col: 1 }];
  }
  return [];
}

function miniLegalMoves(board: MiniBoard, from: Point): Point[] {
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
      if (!occupant) {
        targets.push(next);
      } else {
        if (occupant.owner !== piece.owner) {
          targets.push(next);
        }
        break;
      }
      next = { row: next.row + dir.row, col: next.col + dir.col };
    }
  });
  miniDeltas(piece).forEach((delta) => {
    const next = { row: from.row + delta.row, col: from.col + delta.col };
    if (inBounds(next, 5) && board[next.row][next.col]?.owner !== piece.owner) {
      targets.push(next);
    }
  });
  return targets;
}

export function MiniShogiPage() {
  const [board, setBoard] = useState<MiniBoard>(() => initialMiniShogiBoard());
  const [currentPlayer, setCurrentPlayer] = useState<PlayerMark>("A");
  const [selected, setSelected] = useState<Point | null>(null);
  const [hands, setHands] = useState<Record<PlayerMark, MiniKind[]>>({ A: [], B: [] });
  const [dropKind, setDropKind] = useState<MiniKind | null>(null);
  const [winner, setWinner] = useState<PlayerMark | null>(null);
  const [message, setMessage] = useState(
    "Player A starts. Select one of your pieces to see legal moves.",
  );

  const legalTargets = new Set(
    selected
      ? miniLegalMoves(board, selected).map(pointKey)
      : dropKind
        ? miniLegalDrops(board, currentPlayer, dropKind).map(pointKey)
        : [],
  );

  function moveOrDrop(point: Point) {
    if (winner) {
      setMessage("The game is over. Reset the board to play again.");
      return;
    }
    if (dropKind && legalTargets.has(pointKey(point))) {
      const nextBoard = board.map((row) => [...row]);
      nextBoard[point.row][point.col] = { owner: currentPlayer, kind: dropKind };
      setHands({
        ...hands,
        [currentPlayer]: removeOneMiniHandPiece(hands[currentPlayer], dropKind),
      });
      setBoard(nextBoard);
      setDropKind(null);
      const nextPlayer = otherPlayer(currentPlayer);
      setCurrentPlayer(nextPlayer);
      setMessage(
        `Player ${currentPlayer} dropped ${miniPieceNames[dropKind]}. Player ${nextPlayer} to move.`,
      );
      return;
    }
    if (selected && legalTargets.has(pointKey(point))) {
      const nextBoard = board.map((row) => [...row]);
      const piece = nextBoard[selected.row][selected.col]!;
      const captured = nextBoard[point.row][point.col];
      const promote = miniCanPromote(piece, point);
      nextBoard[point.row][point.col] = promote ? { ...piece, kind: `+${piece.kind}` as MiniKind } : piece;
      nextBoard[selected.row][selected.col] = null;
      setBoard(nextBoard);
      setHands(captured && captured.kind !== "K" ? { ...hands, [currentPlayer]: [...hands[currentPlayer], demoteMini(captured.kind)] } : hands);
      setSelected(null);
      setDropKind(null);

      if (captured?.kind === "K") {
        setWinner(currentPlayer);
        setMessage(`Player ${currentPlayer} captured the King and wins.`);
        return;
      }

      const nextPlayer = otherPlayer(currentPlayer);
      setCurrentPlayer(nextPlayer);
      setMessage(
        [
          `Player ${currentPlayer} moved ${miniPieceNames[piece.kind]}.`,
          captured ? `Captured ${miniPieceNames[captured.kind]}.` : "",
          promote ? `Promoted to ${miniPieceNames[`+${piece.kind}` as MiniKind]}.` : "",
          `Player ${nextPlayer} to move.`,
        ]
          .filter(Boolean)
          .join(" "),
      );
      return;
    }
    const piece = board[point.row][point.col];
    setDropKind(null);
    setSelected(piece?.owner === currentPlayer ? point : null);
    setMessage(
      piece?.owner === currentPlayer
        ? `${miniPieceNames[piece.kind]} selected. Choose a highlighted square.`
        : `Select one of Player ${currentPlayer}'s pieces or a captured piece in hand.`,
    );
  }

  function reset() {
    setBoard(initialMiniShogiBoard());
    setCurrentPlayer("A");
    setSelected(null);
    setHands({ A: [], B: [] });
    setDropKind(null);
    setWinner(null);
    setMessage("New game started. Player A to move.");
  }

  return (
    <AppletPageShell title="Mini Shogi" subtitle="A small shogi-style board with captures, drops, and promotion.">
      <section className="mini-game-layout">
        <aside className="side-panel">
          <ResetButton onClick={reset} />
          <StatusCard message={message} title={`Player ${currentPlayer} to move`} winner={winner ? `Player ${winner}` : null} />
          <TutorialButton gameId="mini-shogi" steps={miniShogiTutorial} />
          <KeyboardHints hints={["Tab: focus square", "Enter/Space: select"]} />
          <div className="hand-pieces">
            {hands[currentPlayer].length === 0 ? <p className="empty-hand">No captured pieces</p> : hands[currentPlayer].map((kind, index) => (
              <button className={`hand-piece ${dropKind === kind ? "selected" : ""}`} key={`${kind}-${index}`} onClick={() => { setSelected(null); setDropKind(kind); setMessage(`${miniPieceNames[kind]} selected from hand. Drop it on a highlighted empty square.`); }} type="button">
                <span>{miniPieceNames[kind]}</span>
                <strong>drop</strong>
              </button>
            ))}
          </div>
        </aside>
        <section className="board-panel">
          <BoardCoordinates cols={["A", "B", "C", "D", "E"]} rows={["1", "2", "3", "4", "5"]}>
            <div className="square-board shogi-board" style={{ gridTemplateColumns: "repeat(5, 1fr)" }}>
              {board.map((row, rowIndex) =>
                row.map((cell, colIndex) => {
                  const key = `${rowIndex}:${colIndex}`;
                  return (
                    <button aria-label={cell ? `${miniPieceNames[cell.kind]} for Player ${cell.owner}` : `Mini Shogi square ${rowIndex + 1}, ${colIndex + 1}`} className={`mini-cell owner-${cell?.owner ?? "empty"} ${selected && pointKey(selected) === key ? "selected" : ""} ${legalTargets.has(key) ? "legal-target" : ""}`} key={key} onClick={() => moveOrDrop({ row: rowIndex, col: colIndex })} type="button">
                      {cell ? (
                        <span className={`shogi-token shogi-${cell.owner}`}>
                          <span>{cell.kind}</span>
                          <small>P{cell.owner}</small>
                        </span>
                      ) : ""}
                    </button>
                  );
                }),
              )}
            </div>
          </BoardCoordinates>
        </section>
        <RulesList
          intro="Mini Shogi is a compact capture-and-drop strategy game. This prototype uses King capture as the win condition."
          sections={[
            {
              title: "Goal",
              items: [
                "Capture the opposing King.",
                "Use captured pieces as reinforcements by dropping them back onto the board as your own.",
              ],
            },
            {
              title: "Turn",
              items: [
                "Select one of your board pieces, then choose a highlighted destination.",
                "Instead of moving, you may select a captured piece from your hand and drop it on a highlighted empty square.",
                "Captured non-King pieces go into the capturer's hand and lose promotion.",
              ],
            },
            {
              title: "Pieces",
              items: [
                "K moves one square in any direction.",
                "G moves one square forward, sideways, diagonally forward, or straight backward.",
                "S moves one square forward, diagonally forward, or diagonally backward.",
                "B slides diagonally, R slides orthogonally, and P moves one square forward.",
                "Pawn, Silver, Bishop, and Rook promote automatically on the far rank.",
                "Pawns cannot be dropped on the far rank because they would have no forward move.",
              ],
            },
          ]}
        />
      </section>
    </AppletPageShell>
  );
}

const chessFiles = ["a", "b", "c", "d", "e", "f", "g", "h"];
const chessPieceNames: Record<string, string> = {
  p: "Pawn",
  n: "Knight",
  b: "Bishop",
  r: "Rook",
  q: "Queen",
  k: "King",
};

const chessPieceGlyphs: Record<string, string> = {
  bk: "♚",
  bq: "♛",
  br: "♜",
  bb: "♝",
  bn: "♞",
  bp: "♟",
  wk: "♔",
  wq: "♕",
  wr: "♖",
  wb: "♗",
  wn: "♘",
  wp: "♙",
};

const chessTutorial: TutorialStep[] = [
  {
    title: "Pick your piece",
    text: "Select a piece for the side to move. Legal destinations glow immediately.",
    highlight: "Board squares",
  },
  {
    title: "Read the edges",
    text: "Files and ranks stay visible around the board, so moves can be discussed as e4, Nf3, and so on.",
    highlight: "Coordinates",
  },
  {
    title: "Keyboard and reset",
    text: "Tab through squares, press Enter or Space to activate, and use Reset for a fresh game.",
    highlight: "Keys",
  },
];

const miniShogiTutorial: TutorialStep[] = [
  {
    title: "Move or drop",
    text: "Select a player token or a captured hand piece. Highlighted squares show legal moves or drops.",
    highlight: "Tokens",
  },
  {
    title: "Capture the King",
    text: "Captured non-King pieces join your hand. Capturing the opposing King ends the game.",
    highlight: "Hand",
  },
  {
    title: "Use the board labels",
    text: "The A-E and 1-5 coordinates make the compact board easier to scan.",
    highlight: "Coordinates",
  },
];

export function ChessPage() {
  const [game, setGame] = useState(() => new Chess());
  const [selected, setSelected] = useState<ChessSquare | null>(null);
  const [message, setMessage] = useState("White to move.");

  const legalTargets = new Set(
    selected ? game.moves({ square: selected, verbose: true }).map((move) => move.to) : [],
  );
  const chessWinner = game.isCheckmate() ? (game.turn() === "w" ? "Black" : "White") : null;
  const chessTitle = chessWinner
    ? "Checkmate"
    : game.isDraw()
      ? "Draw"
      : game.turn() === "w"
        ? "White to move"
        : "Black to move";

  function reset() {
    setGame(new Chess());
    setSelected(null);
    setMessage("White to move.");
  }

  function clickSquare(square: ChessSquare) {
    if (game.isGameOver()) {
      setSelected(null);
      setMessage("The game is over. Reset the board to play again.");
      return;
    }

    const piece = game.get(square);
    if (selected && legalTargets.has(square)) {
      const nextGame = new Chess(game.fen());
      nextGame.move({ from: selected, to: square, promotion: "q" });
      setGame(nextGame);
      setSelected(null);
      setMessage(
        nextGame.isCheckmate()
          ? `${nextGame.turn() === "w" ? "Black" : "White"} wins by checkmate.`
          : nextGame.isDraw()
            ? "Game drawn."
            : `${nextGame.turn() === "w" ? "White" : "Black"} to move${nextGame.inCheck() ? " - check" : ""}.`,
      );
      return;
    }

    if (piece && piece.color === game.turn()) {
      setSelected(square);
      setMessage(`${piece.color === "w" ? "White" : "Black"} ${piece.type.toUpperCase()} selected.`);
    } else {
      setSelected(null);
    }
  }

  const rows = game.board();

  return (
    <AppletPageShell title="Chess" subtitle="Standard chess with legal moves enforced by chess.js.">
      <section className="mini-game-layout">
        <aside className="side-panel">
          <ResetButton onClick={reset} />
          <StatusCard message={message} title={chessTitle} winner={chessWinner} />
          <TutorialButton gameId="chess" steps={chessTutorial} />
          <KeyboardHints hints={["Tab: focus square", "Enter/Space: move", "Esc: close tutorial"]} />
        </aside>
        <section className="board-panel">
          <BoardCoordinates cols={chessFiles} rows={["8", "7", "6", "5", "4", "3", "2", "1"]}>
            <div className="square-board chess-board" style={{ gridTemplateColumns: "repeat(8, 1fr)" }}>
              {rows.map((row, rowIndex) =>
                row.map((piece, colIndex) => {
                  const square = `${chessFiles[colIndex]}${8 - rowIndex}` as ChessSquare;
                  return (
                    <button
                      aria-label={
                        piece
                          ? `${square}: ${piece.color === "w" ? "White" : "Black"} ${chessPieceNames[piece.type]}`
                          : `${square}: empty`
                      }
                      className={`mini-cell chess-cell ${(rowIndex + colIndex) % 2 === 0 ? "light" : "dark"} ${selected === square ? "selected" : ""} ${legalTargets.has(square) ? "legal-target" : ""}`}
                      key={square}
                      onClick={() => clickSquare(square)}
                      type="button"
                    >
                      {piece ? (
                        <span className={`chess-piece-token chess-${piece.color}`}>
                          {chessPieceGlyphs[`${piece.color}${piece.type}`]}
                        </span>
                      ) : ""}
                    </button>
                  );
                }),
              )}
            </div>
          </BoardCoordinates>
        </section>
        <RulesList
          intro="This applet plays standard chess with legal moves checked by chess.js. It is built for two people sharing the same screen."
          sections={[
            {
              title: "Goal",
              items: [
                "Checkmate the opposing King: put it in check with no legal escape.",
                "The applet also reports standard draw states, including stalemate.",
              ],
            },
            {
              title: "Turn",
              items: [
                "White moves first, then players alternate.",
                "Select one of your pieces, then choose a highlighted legal destination.",
                "You cannot make a move that leaves your own King in check.",
              ],
            },
            {
              title: "Prototype note",
              items: [
                "Pawn promotion automatically chooses a Queen.",
                "The board uses compact piece labels: WQ is White Queen, BK is Black King, and so on.",
              ],
            },
          ]}
        />
      </section>
    </AppletPageShell>
  );
}

export function SuperHexagonPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [running, setRunning] = useState(false);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(() => getHighScores("super-hexagon", 1)[0]?.score ?? 0);
  const [highScores, setHighScores] = useState<HighScoreEntry[]>(() => getHighScores("super-hexagon"));
  const [crash, setCrash] = useState<{ score: number; x: number; y: number } | null>(null);

  function drawCrashMarker(scoreValue: number, x: number, y: number) {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) {
      return;
    }

    ctx.save();
    ctx.fillStyle = "rgba(17, 19, 22, 0.34)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#ff5f57";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(x, y, 21, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "#ffefe0";
    ctx.font = "800 18px system-ui";
    ctx.textAlign = "center";
    ctx.fillText("Collision", canvas.width / 2, canvas.height / 2 + 88);
    ctx.fillText(`Final score ${scoreValue}`, canvas.width / 2, canvas.height / 2 + 114);
    ctx.restore();
  }

  function startRun() {
    setCrash(null);
    setScore(0);
    setRunning(true);
  }

  function resetRun() {
    setRunning(false);
    setCrash(null);
    setScore(0);
  }

  useEffect(() => {
    if (running) {
      return;
    }

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) {
      return;
    }

    if (crash) {
      drawCrashMarker(crash.score, crash.x, crash.y);
      return;
    }

    ctx.fillStyle = "#16171a";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#f0c66f";
    ctx.font = "700 28px system-ui";
    ctx.textAlign = "center";
    ctx.fillText("SUPER HEXAGON", canvas.width / 2, canvas.height / 2 - 16);
    ctx.fillStyle = "#d8d0c2";
    ctx.font = "500 16px system-ui";
    ctx.fillText(score > 0 ? `Final score ${score}. Space to replay.` : "Press Space, then use arrows or A/D", canvas.width / 2, canvas.height / 2 + 18);
  }, [best, crash, running, score]);

  useEffect(() => {
    function handleStartKey(event: KeyboardEvent) {
      if (event.key !== " ") {
        return;
      }

      event.preventDefault();
      if (running) {
        return;
      }
      startRun();
    }

    window.addEventListener("keydown", handleStartKey);
    return () => window.removeEventListener("keydown", handleStartKey);
  }, [running]);

  useEffect(() => {
    const keys = new Set<string>();
    const down = (event: KeyboardEvent) => keys.add(event.key);
    const up = (event: KeyboardEvent) => keys.delete(event.key);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);

    let animation = 0;
    let angle = 0;
    let last = performance.now();
    let spawn = 0;
    let elapsed = 0;
    let obstacles: SuperHexagonWall[] = [];

    function frame(now: number) {
      const canvas = canvasRef.current;
      if (!canvas || !running) {
        return;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        return;
      }
      const dt = Math.min(0.04, (now - last) / 1000);
      last = now;
      elapsed += dt;
      spawn -= dt;
      if (keys.has("ArrowLeft") || keys.has("a") || keys.has("A")) angle -= dt * 3.8;
      if (keys.has("ArrowRight") || keys.has("d") || keys.has("D")) angle += dt * 3.8;
      if (spawn <= 0) {
        obstacles.push({ radius: 260, gap: Math.floor(Math.random() * 6), rotation: Math.random() * Math.PI * 2 });
        spawn = Math.max(0.55, 1.25 - elapsed * 0.025);
      }
      obstacles = obstacles.map((wall) => ({ ...wall, radius: wall.radius - dt * (76 + elapsed * 3) })).filter((wall) => wall.radius > 24);

      const playerAngle = normalizeAngle(angle - Math.PI / 2);
      const hit = isSuperHexagonCollision({ playerAngle, walls: obstacles });
      if (hit) {
        const finalScore = Math.floor(elapsed * 10);
        const w = canvas.width;
        const h = canvas.height;
        const impact = {
          score: finalScore,
          x: w / 2 + Math.cos(playerAngle - Math.PI / 2) * 54,
          y: h / 2 + Math.sin(playerAngle - Math.PI / 2) * 54,
        };
        setBest((value) => Math.max(value, finalScore));
        setHighScores(recordHighScore({ gameId: "super-hexagon", score: finalScore, settings: "standard" }));
        setScore(finalScore);
        setCrash(impact);
        window.setTimeout(() => setCrash(null), 900);
        setRunning(false);
        return;
      }

      setScore(Math.floor(elapsed * 10));
      const w = canvas.width;
      const h = canvas.height;
      const cx = w / 2;
      const cy = h / 2;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "#16171a";
      ctx.fillRect(0, 0, w, h);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(elapsed * 0.7);
      for (let sector = 0; sector < 6; sector += 1) {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, 260, sector * Math.PI / 3, (sector + 1) * Math.PI / 3);
        ctx.closePath();
        ctx.fillStyle = sector % 2 === 0 ? "#3b2f39" : "#272c3f";
        ctx.fill();
      }
      obstacles.forEach((wall) => {
        for (let sector = 0; sector < 6; sector += 1) {
          if (sector === wall.gap) continue;
          ctx.beginPath();
          ctx.arc(0, 0, wall.radius, sector * Math.PI / 3 + wall.rotation, (sector + 1) * Math.PI / 3 + wall.rotation);
          ctx.lineWidth = 12;
          ctx.strokeStyle = "#f0c66f";
          ctx.stroke();
        }
      });
      ctx.rotate(angle);
      ctx.fillStyle = "#ffefe0";
      ctx.beginPath();
      ctx.moveTo(0, -54);
      ctx.lineTo(-8, -34);
      ctx.lineTo(8, -34);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      animation = requestAnimationFrame(frame);
    }

    if (running) {
      animation = requestAnimationFrame(frame);
    }

    return () => {
      cancelAnimationFrame(animation);
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [running]);

  return (
    <AppletPageShell title="Super Hexagon" subtitle="A one-player reflex game: rotate through the gaps and survive.">
      <section className="mini-game-layout">
        <aside className="side-panel">
          <button className="secondary-button primary-action wide" onClick={() => {
            if (running) {
              setRunning(false);
            } else {
              startRun();
            }
          }} type="button">
            {running ? <Pause size={17} aria-hidden="true" /> : <Play size={17} aria-hidden="true" />}
            {running ? "Pause" : "Start"}
          </button>
          <ResetButton onClick={resetRun} />
          <StatusCard message="Use Left/Right arrows or A/D. Space starts or replays after a crash." title={`Score ${score} / Best ${best}`} />
          <TutorialButton
            gameId="super-hexagon"
            steps={[
              { title: "Start the run", text: "Press Space or Start. The timer becomes your score.", highlight: "Start" },
              { title: "Rotate to gaps", text: "Use ArrowLeft/ArrowRight or A/D to line the triangle up with open wall gaps.", highlight: "Controls" },
              { title: "Inspect crashes", text: "On collision, the playfield freezes briefly and marks the contact point before replay.", highlight: "Collision marker" },
            ]}
          />
          <KeyboardHints hints={["Space: start/replay", "A/D or arrows: rotate", "Esc: close tutorial"]} />
          <HighScorePanel entries={highScores} gameId="super-hexagon" />
        </aside>
        <section className="board-panel super-panel">
          <canvas className="super-canvas" height={520} ref={canvasRef} width={520} />
        </section>
        <RulesList
          intro="Super Hexagon is a reflex challenge. Rotate the small triangle around the center and survive the incoming walls."
          sections={[
            {
              title: "Goal",
              items: [
                "Survive as long as possible.",
                "Your score rises over time, and the best score records your longest run this session.",
              ],
            },
            {
              title: "Controls",
              items: [
                "Press Start to begin a new run.",
                "Use ArrowLeft or A to rotate counterclockwise.",
                "Use ArrowRight or D to rotate clockwise.",
              ],
            },
            {
              title: "Walls",
              items: [
                "Each wall has one open gap.",
                "Line the triangle up with the visible gap before the wall reaches the center.",
                "Hitting a wall ends the run.",
              ],
            },
          ]}
        />
      </section>
    </AppletPageShell>
  );
}
