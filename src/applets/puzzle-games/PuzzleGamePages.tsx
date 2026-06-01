import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  RotateCcw,
  Undo2,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";

type Point = { row: number; col: number };
type Direction = "up" | "down" | "left" | "right";

function themeClass(title: string): string {
  return `theme-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
}

const directionDeltas: Record<Direction, Point> = {
  up: { row: -1, col: 0 },
  down: { row: 1, col: 0 },
  left: { row: 0, col: -1 },
  right: { row: 0, col: 1 },
};

function pointKey(point: Point): string {
  return `${point.row}:${point.col}`;
}

function inBounds(point: Point, rows: number, cols = rows): boolean {
  return point.row >= 0 && point.row < rows && point.col >= 0 && point.col < cols;
}

function cloneMatrix<T>(matrix: T[][]): T[][] {
  return matrix.map((row) => [...row]);
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

function PuzzleStatusCard({
  label = "Status",
  title,
  message,
}: {
  label?: string;
  title: string;
  message: string;
}) {
  return (
    <section className="turn-card">
      <p className="eyebrow">{label}</p>
      <h2>{title}</h2>
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

const lightsOutStart = [
  [true, false, true, false, true],
  [true, true, false, true, false],
  [false, true, true, false, true],
  [true, false, true, true, false],
  [false, true, false, true, false],
];

function makeLightsOutStart(): boolean[][] {
  return cloneMatrix(lightsOutStart);
}

function isLightsOutSolved(board: boolean[][]): boolean {
  return board.every((row) => row.every((cell) => !cell));
}

export function LightsOutPage() {
  const [board, setBoard] = useState<boolean[][]>(() => makeLightsOutStart());
  const [moves, setMoves] = useState(0);
  const solved = isLightsOutSolved(board);

  function toggle(point: Point) {
    if (solved) {
      return;
    }

    const nextBoard = cloneMatrix(board);
    [
      point,
      { row: point.row - 1, col: point.col },
      { row: point.row + 1, col: point.col },
      { row: point.row, col: point.col - 1 },
      { row: point.row, col: point.col + 1 },
    ].forEach((next) => {
      if (inBounds(next, 5)) {
        nextBoard[next.row][next.col] = !nextBoard[next.row][next.col];
      }
    });
    setBoard(nextBoard);
    setMoves((value) => value + 1);
  }

  function reset() {
    setBoard(makeLightsOutStart());
    setMoves(0);
  }

  return (
    <AppletPageShell title="Lights Out" subtitle="Turn off every light by toggling cross-shaped neighborhoods.">
      <section className="mini-game-layout">
        <aside className="side-panel">
          <ResetButton onClick={reset} />
          <PuzzleStatusCard
            label={solved ? "Solved" : "Puzzle"}
            message="Clicking a light flips that light plus its orthogonal neighbors."
            title={solved ? `Solved in ${moves} moves` : `${moves} moves`}
          />
        </aside>
        <section className="board-panel">
          <div className="square-board compact-board" style={{ gridTemplateColumns: "repeat(5, 1fr)" }}>
            {board.map((row, rowIndex) =>
              row.map((lightOn, colIndex) => (
                <button
                  aria-label={`Light ${rowIndex + 1}, ${colIndex + 1} is ${lightOn ? "on" : "off"}`}
                  className={`mini-cell lights-cell ${lightOn ? "light-on" : "light-off"}`}
                  key={`${rowIndex}:${colIndex}`}
                  onClick={() => toggle({ row: rowIndex, col: colIndex })}
                  type="button"
                >
                  {lightOn ? "ON" : ""}
                </button>
              )),
            )}
          </div>
        </section>
        <RulesList
          intro="Lights Out is a state-changing puzzle. Each move affects five cells at most, so solving it means planning how toggles overlap."
          sections={[
            {
              title: "Goal",
              items: ["Switch every light off.", "The puzzle is solved when the grid is completely dark."],
            },
            {
              title: "Turn",
              items: [
                "Click any cell.",
                "That cell and its up, down, left, and right neighbors flip between on and off.",
              ],
            },
            {
              title: "Tip",
              items: [
                "Work row by row: once a row is fixed, use the row beneath it to control the next changes.",
              ],
            },
          ]}
        />
      </section>
    </AppletPageShell>
  );
}

type SlidingTile = number | null;

const slidingTilesStart: SlidingTile[] = [
  1, 8, 2, 4,
  5, 6, 3, null,
  9, 7, 11, 10,
  13, 14, 15, 12,
];

function isSlidingSolved(board: SlidingTile[]): boolean {
  return board.every((tile, index) => (index === 15 ? tile === null : tile === index + 1));
}

function slidingPoint(index: number): Point {
  return { row: Math.floor(index / 4), col: index % 4 };
}

function canSlide(board: SlidingTile[], index: number): boolean {
  const blankIndex = board.indexOf(null);
  const point = slidingPoint(index);
  const blank = slidingPoint(blankIndex);
  return Math.abs(point.row - blank.row) + Math.abs(point.col - blank.col) === 1;
}

export function SlidingTilesPage() {
  const [board, setBoard] = useState<SlidingTile[]>(() => [...slidingTilesStart]);
  const [moves, setMoves] = useState(0);
  const solved = isSlidingSolved(board);

  function slide(index: number) {
    if (solved || board[index] === null || !canSlide(board, index)) {
      return;
    }

    const blankIndex = board.indexOf(null);
    const nextBoard = [...board];
    nextBoard[blankIndex] = nextBoard[index];
    nextBoard[index] = null;
    setBoard(nextBoard);
    setMoves((value) => value + 1);
  }

  function reset() {
    setBoard([...slidingTilesStart]);
    setMoves(0);
  }

  return (
    <AppletPageShell title="Sliding Tiles" subtitle="Rebuild the ordered 4 by 4 tile grid by sliding into the empty space.">
      <section className="mini-game-layout">
        <aside className="side-panel">
          <ResetButton onClick={reset} />
          <PuzzleStatusCard
            label={solved ? "Solved" : "Puzzle"}
            message="Click a tile next to the blank space to slide it into that space."
            title={solved ? `Solved in ${moves} moves` : `${moves} moves`}
          />
        </aside>
        <section className="board-panel">
          <div className="square-board compact-board" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
            {board.map((tile, index) => (
              <button
                aria-label={tile === null ? "Empty sliding tile space" : `Tile ${tile}`}
                className={`mini-cell sliding-cell ${tile === null ? "owner-empty" : ""} ${tile !== null && canSlide(board, index) ? "legal-target" : ""}`}
                disabled={tile === null}
                key={tile ?? "blank"}
                onClick={() => slide(index)}
                type="button"
              >
                {tile}
              </button>
            ))}
          </div>
        </section>
        <RulesList
          intro="Sliding Tiles is a permutation puzzle. Only tiles next to the blank can move, so every action changes the future route."
          sections={[
            {
              title: "Goal",
              items: ["Arrange the tiles from 1 to 15, reading left to right and top to bottom.", "The blank space belongs in the bottom-right corner."],
            },
            {
              title: "Turn",
              items: ["Click any highlighted tile adjacent to the empty space.", "That tile slides into the empty space."],
            },
            {
              title: "Tip",
              items: ["Solve the top rows first, then preserve them while cycling the lower tiles."],
            },
          ]}
        />
      </section>
    </AppletPageShell>
  );
}

const hanoiDiskCount = 4;

function initialHanoiPegs(): number[][] {
  return [[4, 3, 2, 1], [], []];
}

export function TowersOfHanoiPage() {
  const [pegs, setPegs] = useState<number[][]>(() => initialHanoiPegs());
  const [selectedPeg, setSelectedPeg] = useState<number | null>(null);
  const [moves, setMoves] = useState(0);
  const [message, setMessage] = useState("Move the full stack to the right peg.");
  const solved = pegs[2].length === hanoiDiskCount;

  function clickPeg(index: number) {
    if (solved) {
      return;
    }

    if (selectedPeg === null) {
      if (pegs[index].length > 0) {
        setSelectedPeg(index);
        setMessage(`Peg ${index + 1} selected.`);
      }
      return;
    }

    if (selectedPeg === index) {
      setSelectedPeg(null);
      setMessage("Selection cleared.");
      return;
    }

    const sourceTop = pegs[selectedPeg].at(-1);
    const targetTop = pegs[index].at(-1);

    if (sourceTop === undefined || (targetTop !== undefined && sourceTop > targetTop)) {
      setSelectedPeg(pegs[index].length > 0 ? index : null);
      setMessage("A larger disk cannot be placed on a smaller disk.");
      return;
    }

    const nextPegs = pegs.map((peg) => [...peg]);
    nextPegs[selectedPeg].pop();
    nextPegs[index].push(sourceTop);
    setPegs(nextPegs);
    setSelectedPeg(null);
    setMoves((value) => value + 1);
    setMessage(`Moved disk ${sourceTop} to peg ${index + 1}.`);
  }

  function reset() {
    setPegs(initialHanoiPegs());
    setSelectedPeg(null);
    setMoves(0);
    setMessage("Move the full stack to the right peg.");
  }

  return (
    <AppletPageShell title="Towers of Hanoi" subtitle="Move the disk tower one legal disk at a time.">
      <section className="mini-game-layout">
        <aside className="side-panel">
          <ResetButton onClick={reset} />
          <PuzzleStatusCard
            label={solved ? "Solved" : "Puzzle"}
            message={message}
            title={solved ? `Solved in ${moves} moves` : `${moves} moves`}
          />
        </aside>
        <section className="board-panel">
          <div className="hanoi-board">
            {pegs.map((peg, pegIndex) => (
              <button
                aria-label={`Hanoi peg ${pegIndex + 1}`}
                className={`hanoi-peg ${selectedPeg === pegIndex ? "selected" : ""}`}
                key={pegIndex}
                onClick={() => clickPeg(pegIndex)}
                type="button"
              >
                <span className="hanoi-post" aria-hidden="true" />
                <span className="hanoi-stack">
                  {peg.map((disk) => (
                    <span
                      className={`hanoi-disk disk-${disk}`}
                      key={disk}
                      style={{ width: `${30 + disk * 15}%` }}
                    >
                      {disk}
                    </span>
                  ))}
                </span>
              </button>
            ))}
          </div>
        </section>
        <RulesList
          intro="Towers of Hanoi asks you to preserve strict size order while transferring a whole stack."
          sections={[
            {
              title: "Goal",
              items: ["Move all four disks from the left peg to the right peg.", "Keep the disks stacked smallest on top."],
            },
            {
              title: "Turn",
              items: ["Click a peg to pick up its top disk.", "Click another peg to place that disk there."],
            },
            {
              title: "Limits",
              items: ["Only the top disk on a peg can move.", "A larger disk can never be placed on top of a smaller disk."],
            },
          ]}
        />
      </section>
    </AppletPageShell>
  );
}

type CodeColor = "red" | "blue" | "green" | "yellow" | "purple" | "orange";
type MastermindGuess = {
  code: CodeColor[];
  exact: number;
  present: number;
};

const mastermindColors: CodeColor[] = ["red", "blue", "green", "yellow", "purple", "orange"];
const mastermindSecret: CodeColor[] = ["green", "purple", "orange", "blue"];
const mastermindLimit = 8;
const mastermindLabels: Record<CodeColor, string> = {
  red: "Red",
  blue: "Blue",
  green: "Green",
  yellow: "Yellow",
  purple: "Purple",
  orange: "Orange",
};

function scoreMastermindGuess(guess: CodeColor[], secret: CodeColor[]): { exact: number; present: number } {
  let exact = 0;
  const remainingGuess: CodeColor[] = [];
  const remainingSecret: CodeColor[] = [];

  guess.forEach((color, index) => {
    if (color === secret[index]) {
      exact += 1;
    } else {
      remainingGuess.push(color);
      remainingSecret.push(secret[index]);
    }
  });

  const present = remainingGuess.reduce((total, color) => {
    const index = remainingSecret.indexOf(color);
    if (index === -1) {
      return total;
    }
    remainingSecret.splice(index, 1);
    return total + 1;
  }, 0);

  return { exact, present };
}

export function MastermindPage() {
  const [guesses, setGuesses] = useState<MastermindGuess[]>([]);
  const [currentGuess, setCurrentGuess] = useState<(CodeColor | null)[]>([null, null, null, null]);
  const [activeColor, setActiveColor] = useState<CodeColor>("red");
  const [message, setMessage] = useState("Build a four-color guess, then submit it.");
  const solved = guesses.some((guess) => guess.exact === mastermindSecret.length);
  const outOfTurns = guesses.length >= mastermindLimit && !solved;
  const currentComplete = currentGuess.every((color) => color !== null);

  function placeColor(index: number) {
    if (solved || outOfTurns) {
      return;
    }
    setCurrentGuess((guess) => guess.map((color, colorIndex) => (colorIndex === index ? activeColor : color)));
  }

  function submitGuess() {
    if (solved || outOfTurns) {
      return;
    }
    if (!currentComplete) {
      setMessage("Fill all four slots before submitting.");
      return;
    }

    const code = currentGuess as CodeColor[];
    const score = scoreMastermindGuess(code, mastermindSecret);
    setGuesses((value) => [...value, { code, ...score }]);
    setCurrentGuess([null, null, null, null]);
    setMessage(
      score.exact === mastermindSecret.length
        ? "Solved. The code is revealed below."
        : `${score.exact} exact and ${score.present} color-only matches.`,
    );
  }

  function reset() {
    setGuesses([]);
    setCurrentGuess([null, null, null, null]);
    setActiveColor("red");
    setMessage("Build a four-color guess, then submit it.");
  }

  const remaining = Math.max(0, mastermindLimit - guesses.length);

  return (
    <AppletPageShell title="Mastermind" subtitle="Deduce a hidden four-color code from exact and color-only feedback.">
      <section className="mini-game-layout">
        <aside className="side-panel">
          <ResetButton onClick={reset} />
          <PuzzleStatusCard
            label={solved ? "Solved" : outOfTurns ? "Finished" : "Puzzle"}
            message={message}
            title={solved ? `${guesses.length} guesses` : `${remaining} guesses left`}
          />
          <button
            className="secondary-button primary-action wide"
            disabled={!currentComplete || solved || outOfTurns}
            onClick={submitGuess}
            type="button"
          >
            Submit Guess
          </button>
        </aside>
        <section className="board-panel">
          <div className="mastermind-board">
            <div className="mastermind-palette" aria-label="Mastermind colors">
              {mastermindColors.map((color) => (
                <button
                  aria-label={`Choose ${mastermindLabels[color]}`}
                  className={`color-dot color-${color} ${activeColor === color ? "selected" : ""}`}
                  key={color}
                  onClick={() => setActiveColor(color)}
                  type="button"
                />
              ))}
            </div>
            <div className="mastermind-current" aria-label="Current guess">
              {currentGuess.map((color, index) => (
                <button
                  aria-label={`Set slot ${index + 1} to ${mastermindLabels[activeColor]}`}
                  className={`mastermind-slot ${color ? `color-${color}` : ""}`}
                  key={index}
                  onClick={() => placeColor(index)}
                  type="button"
                >
                  {color ? mastermindLabels[color][0] : ""}
                </button>
              ))}
            </div>
            <div className="mastermind-history" aria-label="Guess history">
              {guesses.map((guess, guessIndex) => (
                <div className="mastermind-row" key={guessIndex}>
                  <span className="mastermind-attempt">{guessIndex + 1}</span>
                  <span className="mastermind-code">
                    {guess.code.map((color, colorIndex) => (
                      <span
                        aria-label={mastermindLabels[color]}
                        className={`color-dot small color-${color}`}
                        key={`${color}-${colorIndex}`}
                      />
                    ))}
                  </span>
                  <strong>{guess.exact} exact</strong>
                  <span>{guess.present} color</span>
                </div>
              ))}
            </div>
            {(solved || outOfTurns) && (
              <div className="mastermind-row answer-row">
                <span className="mastermind-attempt">Code</span>
                <span className="mastermind-code">
                  {mastermindSecret.map((color, index) => (
                    <span className={`color-dot small color-${color}`} key={`${color}-${index}`} />
                  ))}
                </span>
              </div>
            )}
          </div>
        </section>
        <RulesList
          intro="Mastermind is a deduction puzzle. Use feedback from each guess to narrow the hidden code."
          sections={[
            {
              title: "Goal",
              items: ["Find the hidden four-color code within eight guesses.", "Colors may repeat in guesses, and feedback accounts for duplicates."],
            },
            {
              title: "Turn",
              items: ["Pick a color from the palette.", "Click each current-guess slot to fill it.", "Submit when all four slots are filled."],
            },
            {
              title: "Feedback",
              items: ["Exact means right color in the right slot.", "Color means right color in the wrong slot."],
            },
          ]}
        />
      </section>
    </AppletPageShell>
  );
}

type PegCell = "invalid" | "peg" | "empty";

const pegSolitairePattern = [
  "  ###  ",
  "  ###  ",
  "#######",
  "###.###",
  "#######",
  "  ###  ",
  "  ###  ",
];

function initialPegSolitaireBoard(): PegCell[][] {
  return pegSolitairePattern.map((row) =>
    [...row].map((cell) => (cell === " " ? "invalid" : cell === "." ? "empty" : "peg")),
  );
}

function pegLegalTargets(board: PegCell[][], from: Point): Point[] {
  if (board[from.row][from.col] !== "peg") {
    return [];
  }

  return Object.values(directionDeltas)
    .map((delta) => ({
      jumped: { row: from.row + delta.row, col: from.col + delta.col },
      target: { row: from.row + delta.row * 2, col: from.col + delta.col * 2 },
    }))
    .filter(
      ({ jumped, target }) =>
        inBounds(target, 7) &&
        board[jumped.row][jumped.col] === "peg" &&
        board[target.row][target.col] === "empty",
    )
    .map(({ target }) => target);
}

function pegCount(board: PegCell[][]): number {
  return board.flat().filter((cell) => cell === "peg").length;
}

function pegHasMove(board: PegCell[][]): boolean {
  return board.some((row, rowIndex) =>
    row.some((cell, colIndex) => cell === "peg" && pegLegalTargets(board, { row: rowIndex, col: colIndex }).length > 0),
  );
}

export function PegSolitairePage() {
  const [board, setBoard] = useState<PegCell[][]>(() => initialPegSolitaireBoard());
  const [selected, setSelected] = useState<Point | null>(null);
  const [moves, setMoves] = useState(0);
  const remainingPegs = pegCount(board);
  const solved = remainingPegs === 1;
  const stuck = !solved && !pegHasMove(board);
  const legalTargets = new Set(selected ? pegLegalTargets(board, selected).map(pointKey) : []);

  function clickCell(point: Point) {
    const cell = board[point.row][point.col];
    if (cell === "invalid" || solved || stuck) {
      return;
    }

    const key = pointKey(point);
    if (selected && legalTargets.has(key)) {
      const nextBoard = cloneMatrix(board);
      const jumped = { row: (selected.row + point.row) / 2, col: (selected.col + point.col) / 2 };
      nextBoard[selected.row][selected.col] = "empty";
      nextBoard[jumped.row][jumped.col] = "empty";
      nextBoard[point.row][point.col] = "peg";
      setBoard(nextBoard);
      setSelected(null);
      setMoves((value) => value + 1);
      return;
    }

    setSelected(cell === "peg" ? point : null);
  }

  function reset() {
    setBoard(initialPegSolitaireBoard());
    setSelected(null);
    setMoves(0);
  }

  return (
    <AppletPageShell title="Peg Solitaire" subtitle="Jump pegs over each other until only one peg remains.">
      <section className="mini-game-layout">
        <aside className="side-panel">
          <ResetButton onClick={reset} />
          <PuzzleStatusCard
            label={solved ? "Solved" : stuck ? "Stuck" : "Puzzle"}
            message="Select a peg, then choose a highlighted landing hole two spaces away."
            title={`${remainingPegs} pegs - ${moves} moves`}
          />
        </aside>
        <section className="board-panel">
          <div className="square-board compact-board peg-board" style={{ gridTemplateColumns: "repeat(7, 1fr)" }}>
            {board.map((row, rowIndex) =>
              row.map((cell, colIndex) => {
                const key = `${rowIndex}:${colIndex}`;
                return (
                  <button
                    aria-label={cell === "invalid" ? "Invalid space" : `${cell} at ${rowIndex + 1}, ${colIndex + 1}`}
                    className={`mini-cell peg-cell ${cell} ${selected && pointKey(selected) === key ? "selected" : ""} ${legalTargets.has(key) ? "legal-target" : ""}`}
                    disabled={cell === "invalid"}
                    key={key}
                    onClick={() => clickCell({ row: rowIndex, col: colIndex })}
                    type="button"
                  >
                    {cell === "peg" ? <span className="peg-token" aria-hidden="true" /> : ""}
                  </button>
                );
              }),
            )}
          </div>
        </section>
        <RulesList
          intro="Peg Solitaire is a single-player capture puzzle. Every jump removes exactly one peg."
          sections={[
            {
              title: "Goal",
              items: ["Leave exactly one peg on the board.", "The strongest finish lands that final peg near the center."],
            },
            {
              title: "Turn",
              items: ["Select a peg.", "Jump orthogonally over an adjacent peg into an empty hole two spaces away.", "The jumped peg is removed."],
            },
            {
              title: "Limits",
              items: ["Jumps cannot move diagonally.", "If no jumps remain before one peg is left, the position is stuck."],
            },
          ]}
        />
      </section>
    </AppletPageShell>
  );
}

type SokobanState = {
  player: Point;
  crates: Set<string>;
  moves: number;
};

const sokobanLevel = [
  "#######",
  "#.....#",
  "#.B.G.#",
  "#..B.G#",
  "#..P..#",
  "#.....#",
  "#######",
];

const sokobanWalls = new Set<string>();
const sokobanGoals = new Set<string>();
let sokobanInitialPlayer: Point = { row: 0, col: 0 };
const sokobanInitialCrates = new Set<string>();

sokobanLevel.forEach((row, rowIndex) => {
  [...row].forEach((cell, colIndex) => {
    const point = { row: rowIndex, col: colIndex };
    if (cell === "#") {
      sokobanWalls.add(pointKey(point));
    }
    if (cell === "G") {
      sokobanGoals.add(pointKey(point));
    }
    if (cell === "B") {
      sokobanInitialCrates.add(pointKey(point));
    }
    if (cell === "P") {
      sokobanInitialPlayer = point;
    }
  });
});

function initialSokobanState(): SokobanState {
  return {
    player: { ...sokobanInitialPlayer },
    crates: new Set(sokobanInitialCrates),
    moves: 0,
  };
}

function sokobanSolved(crates: Set<string>): boolean {
  return [...crates].every((crate) => sokobanGoals.has(crate));
}

export function SokobanMiniPage() {
  const [state, setState] = useState<SokobanState>(() => initialSokobanState());
  const solved = useMemo(() => sokobanSolved(state.crates), [state.crates]);

  function move(direction: Direction) {
    if (solved) {
      return;
    }

    const delta = directionDeltas[direction];
    const nextPlayer = { row: state.player.row + delta.row, col: state.player.col + delta.col };
    const nextPlayerKey = pointKey(nextPlayer);

    if (!inBounds(nextPlayer, sokobanLevel.length, sokobanLevel[0].length) || sokobanWalls.has(nextPlayerKey)) {
      return;
    }

    const nextCrates = new Set(state.crates);
    if (nextCrates.has(nextPlayerKey)) {
      const nextCrate = { row: nextPlayer.row + delta.row, col: nextPlayer.col + delta.col };
      const nextCrateKey = pointKey(nextCrate);
      if (
        !inBounds(nextCrate, sokobanLevel.length, sokobanLevel[0].length) ||
        sokobanWalls.has(nextCrateKey) ||
        nextCrates.has(nextCrateKey)
      ) {
        return;
      }
      nextCrates.delete(nextPlayerKey);
      nextCrates.add(nextCrateKey);
    }

    setState({
      player: nextPlayer,
      crates: nextCrates,
      moves: state.moves + 1,
    });
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "ArrowUp") {
        event.preventDefault();
        move("up");
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        move("down");
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        move("left");
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        move("right");
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [state, solved]);

  function reset() {
    setState(initialSokobanState());
  }

  const directionButtons = [
    { direction: "up" as Direction, label: "Move up", icon: <ArrowUp size={18} aria-hidden="true" /> },
    { direction: "left" as Direction, label: "Move left", icon: <ArrowLeft size={18} aria-hidden="true" /> },
    { direction: "right" as Direction, label: "Move right", icon: <ArrowRight size={18} aria-hidden="true" /> },
    { direction: "down" as Direction, label: "Move down", icon: <ArrowDown size={18} aria-hidden="true" /> },
  ];

  return (
    <AppletPageShell title="Sokoban Mini" subtitle="Push crates onto storage goals without trapping them.">
      <section className="mini-game-layout">
        <aside className="side-panel">
          <ResetButton onClick={reset} />
          <PuzzleStatusCard
            label={solved ? "Solved" : "Puzzle"}
            message="Use the arrow buttons or keyboard arrows. Crates can only be pushed, never pulled."
            title={solved ? `Solved in ${state.moves} moves` : `${state.moves} moves`}
          />
          <div className="direction-pad" aria-label="Sokoban controls">
            <span />
            <button aria-label="Move up" onClick={() => move("up")} type="button">
              <ArrowUp size={18} aria-hidden="true" />
            </button>
            <span />
            {directionButtons.slice(1, 3).map((button) => (
              <button
                aria-label={button.label}
                key={button.direction}
                onClick={() => move(button.direction)}
                type="button"
              >
                {button.icon}
              </button>
            ))}
            <span />
            <button aria-label="Move down" onClick={() => move("down")} type="button">
              <ArrowDown size={18} aria-hidden="true" />
            </button>
            <span />
          </div>
        </aside>
        <section className="board-panel">
          <div className="square-board compact-board sokoban-board" style={{ gridTemplateColumns: "repeat(7, 1fr)" }}>
            {sokobanLevel.map((row, rowIndex) =>
              [...row].map((_, colIndex) => {
                const point = { row: rowIndex, col: colIndex };
                const key = pointKey(point);
                const isPlayer = pointKey(state.player) === key;
                const hasCrate = state.crates.has(key);
                const isGoal = sokobanGoals.has(key);
                const isWall = sokobanWalls.has(key);
                return (
                  <span
                    aria-label={`${isWall ? "Wall" : hasCrate ? "Crate" : isPlayer ? "Player" : isGoal ? "Goal" : "Floor"} at ${rowIndex + 1}, ${colIndex + 1}`}
                    className={`mini-cell sokoban-cell ${isWall ? "wall" : ""} ${isGoal ? "goal" : ""} ${hasCrate ? "crate" : ""} ${isPlayer ? "player" : ""}`}
                    key={key}
                    role="img"
                  >
                    {isWall ? "" : isPlayer ? "P" : hasCrate ? "B" : isGoal ? "G" : ""}
                  </span>
                );
              }),
            )}
          </div>
        </section>
        <RulesList
          intro="Sokoban is a spatial planning puzzle. A crate pushed into the wrong corner may block the solution."
          sections={[
            {
              title: "Goal",
              items: ["Push every crate onto a goal square.", "The puzzle is solved when all crates are on goals at the same time."],
            },
            {
              title: "Turn",
              items: ["Move the player one square orthogonally.", "If a crate is in the way and the square beyond it is open, the crate is pushed."],
            },
            {
              title: "Limits",
              items: ["Walls block movement.", "Crates cannot be pulled, pushed through walls, or pushed through other crates."],
            },
          ]}
        />
      </section>
    </AppletPageShell>
  );
}
