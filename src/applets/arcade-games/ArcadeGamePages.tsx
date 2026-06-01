import { Pause, Play, RotateCcw, Undo2 } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { HighScorePanel, KeyboardHints, TutorialButton, type TutorialStep } from "../GameUi";
import { getHighScores, recordHighScore, type HighScoreEntry } from "../gameScoring";

type GamePhase = "ready" | "running" | "paused" | "game-over";
type ArcadeControl = "left" | "right" | "up" | "down" | "action";
type ArcadeKeyState = Record<ArcadeControl, boolean>;
type ArcadeButton = { control: ArcadeControl; label: string };

const emptyKeys: ArcadeKeyState = {
  action: false,
  down: false,
  left: false,
  right: false,
  up: false,
};

function themeClass(title: string): string {
  return `theme-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
}

function ArcadePageShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <main className={`shell game-shell arcade-game-shell ${themeClass(title)}`}>
      <nav className="page-nav" aria-label="Applet navigation">
        <a className="back-link" href="#/applets">
          <Undo2 size={17} aria-hidden="true" />
          Back to Applets
        </a>
      </nav>
      <section className="game-header">
        <div>
          <p className="eyebrow">Arcade cabinet</p>
          <h1>{title}</h1>
          <p className="page-subtitle">{subtitle}</p>
        </div>
      </section>
      {children}
    </main>
  );
}

function ArcadeStatus({
  best,
  message,
  phase,
  score,
}: {
  best: number;
  message: string;
  phase: GamePhase;
  score: number;
}) {
  const label = phase === "game-over" ? "Game over" : phase === "running" ? "Live" : phase === "paused" ? "Paused" : "Ready";
  return (
    <section className="turn-card">
      <p className="eyebrow">{label}</p>
      <h2>Score {score} / Best {best}</h2>
      <p className="helper-text">{message}</p>
    </section>
  );
}

function ArcadeCanvas({
  canvasRef,
  phase,
  title,
}: {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  phase: GamePhase;
  title: string;
}) {
  return (
    <div className="arcade-canvas-frame">
      <canvas className="arcade-canvas" height={520} ref={canvasRef} width={520} />
      {phase !== "running" ? (
        <div className="arcade-overlay" aria-hidden="true">
          <strong>{phase === "game-over" ? "Game Over" : phase === "paused" ? "Paused" : title}</strong>
          <span>{phase === "paused" ? "Space resumes" : "Space starts"}</span>
        </div>
      ) : null}
    </div>
  );
}

function ControlPad({
  buttons,
  onPress,
}: {
  buttons: ArcadeButton[];
  onPress: (control: ArcadeControl) => void;
}) {
  return (
    <div className="arcade-touch-controls" aria-label="Touch controls">
      {buttons.map((button) => (
        <button key={button.control} onClick={() => onPress(button.control)} type="button">
          {button.label}
        </button>
      ))}
    </div>
  );
}

function useArcadeKeys(onSpace: () => void) {
  const keysRef = useRef<ArcadeKeyState>({ ...emptyKeys });

  useEffect(() => {
    function setKey(event: KeyboardEvent, pressed: boolean) {
      const key = event.key.toLowerCase();
      const next = keysRef.current;
      if (event.key === "ArrowLeft" || key === "a") {
        event.preventDefault();
        next.left = pressed;
      }
      if (event.key === "ArrowRight" || key === "d") {
        event.preventDefault();
        next.right = pressed;
      }
      if (event.key === "ArrowUp" || key === "w") {
        event.preventDefault();
        next.up = pressed;
      }
      if (event.key === "ArrowDown" || key === "s") {
        event.preventDefault();
        next.down = pressed;
      }
      if (event.key === " ") {
        event.preventDefault();
        next.action = pressed;
        if (pressed) {
          onSpace();
        }
      }
    }

    const down = (event: KeyboardEvent) => setKey(event, true);
    const up = (event: KeyboardEvent) => setKey(event, false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [onSpace]);

  return keysRef;
}

function drawCabinet(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#07111d");
  gradient.addColorStop(0.52, "#101028");
  gradient.addColorStop(1, "#220f2a");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "rgba(24,240,255,0.16)";
  ctx.lineWidth = 2;
  for (let x = 0; x < width; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 0; y < height; y += 40) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
  ctx.strokeStyle = "rgba(255,79,216,0.12)";
  for (let x = -height; x < width; x += 56) {
    ctx.beginPath();
    ctx.moveTo(x, height);
    ctx.lineTo(x + height, 0);
    ctx.stroke();
  }
}

function useRecordedBest(gameId: string) {
  const [highScores, setHighScores] = useState<HighScoreEntry[]>(() => getHighScores(gameId));
  const best = highScores[0]?.score ?? 0;

  function record(score: number, settings = "standard") {
    setHighScores(recordHighScore({ gameId, score, settings }));
  }

  return { best, highScores, record };
}

type SnakePoint = { x: number; y: number };
const snakeTutorial: TutorialStep[] = [
  { title: "Start moving", text: "Press Space to begin. The snake keeps moving until the run ends.", highlight: "Space" },
  { title: "Eat sparks", text: "Steer into gold sparks to grow and gain points.", highlight: "Food" },
  { title: "Avoid collisions", text: "Hitting a wall or your own trail ends the run.", highlight: "Walls" },
];

export function NeonSnakePage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const snakeRef = useRef<SnakePoint[]>([]);
  const dirRef = useRef<SnakePoint>({ x: 1, y: 0 });
  const nextDirRef = useRef<SnakePoint>({ x: 1, y: 0 });
  const foodRef = useRef<SnakePoint>({ x: 14, y: 10 });
  const scoreRef = useRef(0);
  const tickRef = useRef(0);
  const phaseRef = useRef<GamePhase>("ready");
  const [phase, setPhase] = useState<GamePhase>("ready");
  const [score, setScore] = useState(0);
  const { best, highScores, record } = useRecordedBest("neon-snake");

  function resetGame(start = false) {
    snakeRef.current = [{ x: 8, y: 10 }, { x: 7, y: 10 }, { x: 6, y: 10 }];
    dirRef.current = { x: 1, y: 0 };
    nextDirRef.current = { x: 1, y: 0 };
    foodRef.current = { x: 14, y: 10 };
    scoreRef.current = 0;
    setScore(0);
    const next = start ? "running" : "ready";
    phaseRef.current = next;
    setPhase(next);
  }

  function finish() {
    phaseRef.current = "game-over";
    setPhase("game-over");
    record(scoreRef.current);
  }

  const keysRef = useArcadeKeys(() => {
    if (phaseRef.current === "running") {
      phaseRef.current = "paused";
      setPhase("paused");
      return;
    }
    if (phaseRef.current === "paused") {
      phaseRef.current = "running";
      setPhase("running");
      return;
    }
    resetGame(true);
  });

  function press(control: ArcadeControl) {
    if (control === "left" && dirRef.current.x !== 1) nextDirRef.current = { x: -1, y: 0 };
    if (control === "right" && dirRef.current.x !== -1) nextDirRef.current = { x: 1, y: 0 };
    if (control === "up" && dirRef.current.y !== 1) nextDirRef.current = { x: 0, y: -1 };
    if (control === "down" && dirRef.current.y !== -1) nextDirRef.current = { x: 0, y: 1 };
  }

  useEffect(() => {
    resetGame(false);
  }, []);

  useEffect(() => {
    let animation = 0;
    let last = performance.now();
    const grid = 20;
    const cell = 24;
    const offset = 20;

    function placeFood() {
      for (let attempt = 0; attempt < 80; attempt += 1) {
        const food = { x: Math.floor(Math.random() * grid), y: Math.floor(Math.random() * grid) };
        if (!snakeRef.current.some((point) => point.x === food.x && point.y === food.y)) {
          foodRef.current = food;
          return;
        }
      }
    }

    function frame(now: number) {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) {
        return;
      }

      const dt = (now - last) / 1000;
      last = now;
      if (phaseRef.current === "running") {
        if (keysRef.current.left) press("left");
        if (keysRef.current.right) press("right");
        if (keysRef.current.up) press("up");
        if (keysRef.current.down) press("down");
        tickRef.current += dt;
        const speed = Math.max(0.07, 0.14 - scoreRef.current * 0.0015);
        if (tickRef.current >= speed) {
          tickRef.current = 0;
          dirRef.current = nextDirRef.current;
          const [head] = snakeRef.current;
          const next = { x: head.x + dirRef.current.x, y: head.y + dirRef.current.y };
          const hit = next.x < 0 || next.x >= grid || next.y < 0 || next.y >= grid || snakeRef.current.some((point) => point.x === next.x && point.y === next.y);
          if (hit) {
            finish();
          } else {
            snakeRef.current = [next, ...snakeRef.current];
            if (next.x === foodRef.current.x && next.y === foodRef.current.y) {
              scoreRef.current += 10;
              setScore(scoreRef.current);
              placeFood();
            } else {
              snakeRef.current.pop();
            }
          }
        }
      }

      drawCabinet(ctx, canvas.width, canvas.height);
      ctx.fillStyle = "rgba(20, 32, 42, 0.9)";
      ctx.fillRect(offset, offset, grid * cell, grid * cell);
      ctx.fillStyle = "#f0c66f";
      ctx.beginPath();
      ctx.arc(offset + foodRef.current.x * cell + cell / 2, offset + foodRef.current.y * cell + cell / 2, 8, 0, Math.PI * 2);
      ctx.fill();
      snakeRef.current.forEach((point, index) => {
        ctx.fillStyle = index === 0 ? "#fff7e8" : "#4f8ed8";
        ctx.fillRect(offset + point.x * cell + 3, offset + point.y * cell + 3, cell - 6, cell - 6);
      });
      animation = requestAnimationFrame(frame);
    }

    animation = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(animation);
  }, [keysRef]);

  return (
    <ArcadePageShell title="Neon Snake" subtitle="Steer a growing light trail through sparks without hitting walls or yourself.">
      <section className="mini-game-layout">
        <aside className="side-panel">
          <button
            className="secondary-button primary-action wide"
            onClick={() => {
              if (phase === "running") {
                phaseRef.current = "paused";
                setPhase("paused");
              } else if (phase === "paused") {
                phaseRef.current = "running";
                setPhase("running");
              } else {
                resetGame(true);
              }
            }}
            type="button"
          >
            {phase === "running" ? <Pause size={17} aria-hidden="true" /> : <Play size={17} aria-hidden="true" />}
            {phase === "running" ? "Pause" : phase === "paused" ? "Resume" : "Start"}
          </button>
          <button className="secondary-button wide" onClick={() => resetGame(false)} type="button"><RotateCcw size={17} aria-hidden="true" />Reset</button>
          <ArcadeStatus best={best} message="Eat sparks for 10 points. Walls and your own trail end the run." phase={phase} score={score} />
          <TutorialButton gameId="neon-snake" steps={snakeTutorial} />
          <KeyboardHints hints={["Space: start/pause/replay", "Arrows/WASD: turn"]} />
          <HighScorePanel entries={highScores} gameId="neon-snake" />
          <ControlPad buttons={[{ control: "up", label: "Up" }, { control: "left", label: "Left" }, { control: "right", label: "Right" }, { control: "down", label: "Down" }]} onPress={press} />
        </aside>
        <section className="board-panel arcade-panel"><ArcadeCanvas canvasRef={canvasRef} phase={phase} title="Neon Snake" /></section>
        <aside className="rules-panel"><p className="eyebrow">How to play</p><h2>Score attack</h2><p className="instructions-intro">Keep the snake alive while collecting sparks. Each spark grows the trail and raises the speed.</p></aside>
      </section>
    </ArcadePageShell>
  );
}

const wingTutorial: TutorialStep[] = [
  { title: "Tap to lift", text: "Press Space, W, or ArrowUp to flap upward.", highlight: "Flap" },
  { title: "Thread gates", text: "Pass through each opening to score.", highlight: "Gate" },
  { title: "Stay airborne", text: "Touching a gate, floor, or ceiling ends the run.", highlight: "Bounds" },
];

export function WingDashPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const phaseRef = useRef<GamePhase>("ready");
  const birdRef = useRef({ y: 250, vy: 0 });
  const gatesRef = useRef([{ x: 560, gapY: 245, counted: false }]);
  const scoreRef = useRef(0);
  const [phase, setPhase] = useState<GamePhase>("ready");
  const [score, setScore] = useState(0);
  const { best, highScores, record } = useRecordedBest("wing-dash");

  function start() {
    phaseRef.current = "running";
    setPhase("running");
    birdRef.current = { y: 250, vy: -4.8 };
    gatesRef.current = [{ x: 560, gapY: 245, counted: false }];
    scoreRef.current = 0;
    setScore(0);
  }

  function flap() {
    if (phaseRef.current !== "running") {
      start();
      return;
    }
    birdRef.current.vy = -6.7;
  }

  function finish() {
    phaseRef.current = "game-over";
    setPhase("game-over");
    record(scoreRef.current);
  }

  const keysRef = useArcadeKeys(flap);

  useEffect(() => {
    let animation = 0;
    let last = performance.now();
    function frame(now: number) {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;
      const dt = Math.min(0.04, (now - last) / 1000);
      last = now;
      if (phaseRef.current === "running") {
        if (keysRef.current.up) flap();
        birdRef.current.vy += 18 * dt;
        birdRef.current.y += birdRef.current.vy * 60 * dt;
        gatesRef.current = gatesRef.current.map((gate) => ({ ...gate, x: gate.x - (155 + scoreRef.current * 4) * dt })).filter((gate) => gate.x > -70);
        const lastGate = gatesRef.current.at(-1);
        if (!lastGate || lastGate.x < 310) {
          gatesRef.current.push({ x: 560, gapY: 110 + Math.random() * 280, counted: false });
        }
        gatesRef.current.forEach((gate) => {
          if (!gate.counted && gate.x < 78) {
            gate.counted = true;
            scoreRef.current += 1;
            setScore(scoreRef.current);
          }
        });
        const birdY = birdRef.current.y;
        const crashGate = gatesRef.current.some((gate) => gate.x < 102 && gate.x + 56 > 56 && (birdY < gate.gapY - 72 || birdY > gate.gapY + 72));
        if (birdY < 14 || birdY > 506 || crashGate) finish();
      }
      drawCabinet(ctx, canvas.width, canvas.height);
      ctx.fillStyle = "#14202a";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      gatesRef.current.forEach((gate) => {
        ctx.fillStyle = "#f0c66f";
        ctx.fillRect(gate.x, 0, 54, gate.gapY - 72);
        ctx.fillRect(gate.x, gate.gapY + 72, 54, canvas.height - gate.gapY);
      });
      ctx.fillStyle = "#ffefe0";
      ctx.beginPath();
      ctx.arc(78, birdRef.current.y, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#4f8ed8";
      ctx.fillRect(65, birdRef.current.y - 4, 24, 8);
      animation = requestAnimationFrame(frame);
    }
    animation = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(animation);
  }, [keysRef]);

  return (
    <ArcadePageShell title="Wing Dash" subtitle="Tap through neon gates and keep a tiny flyer airborne.">
      <section className="mini-game-layout">
        <aside className="side-panel">
          <button className="secondary-button primary-action wide" onClick={flap} type="button"><Play size={17} aria-hidden="true" />Start / Flap</button>
          <button className="secondary-button wide" onClick={start} type="button"><RotateCcw size={17} aria-hidden="true" />Reset</button>
          <ArcadeStatus best={best} message="One point for each gate passed. Any collision ends the run." phase={phase} score={score} />
          <TutorialButton gameId="wing-dash" steps={wingTutorial} />
          <KeyboardHints hints={["Space/W/Up: flap/start", "Reset: replay"]} />
          <HighScorePanel entries={highScores} gameId="wing-dash" />
          <ControlPad buttons={[{ control: "action", label: "Flap" }]} onPress={flap} />
        </aside>
        <section className="board-panel arcade-panel"><ArcadeCanvas canvasRef={canvasRef} phase={phase} title="Wing Dash" /></section>
        <aside className="rules-panel"><p className="eyebrow">How to play</p><h2>Timing run</h2><p className="instructions-intro">Tap to rise, release to fall, and aim for the center of each gate.</p></aside>
      </section>
    </ArcadePageShell>
  );
}

const brickTutorial: TutorialStep[] = [
  { title: "Launch the ball", text: "Press Space to start. Keep the ball above your paddle.", highlight: "Space" },
  { title: "Break bricks", text: "Move left and right to aim rebounds into the brick wall.", highlight: "Bricks" },
  { title: "Clear or miss", text: "Clearing every brick wins. Missing the ball ends the run.", highlight: "Paddle" },
];

export function BrickBreakerPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const phaseRef = useRef<GamePhase>("ready");
  const paddleRef = useRef(220);
  const ballRef = useRef({ x: 260, y: 390, vx: 190, vy: -230 });
  const bricksRef = useRef<boolean[]>([]);
  const scoreRef = useRef(0);
  const [phase, setPhase] = useState<GamePhase>("ready");
  const [score, setScore] = useState(0);
  const { best, highScores, record } = useRecordedBest("brick-breaker");

  function makeBricks() {
    bricksRef.current = Array.from({ length: 40 }, () => true);
  }

  function start() {
    makeBricks();
    phaseRef.current = "running";
    setPhase("running");
    paddleRef.current = 220;
    ballRef.current = { x: 260, y: 390, vx: 190, vy: -230 };
    scoreRef.current = 0;
    setScore(0);
  }

  function finish() {
    phaseRef.current = "game-over";
    setPhase("game-over");
    record(scoreRef.current);
  }

  const keysRef = useArcadeKeys(() => {
    if (phaseRef.current !== "running") start();
  });

  function nudge(control: ArcadeControl) {
    if (control === "left") paddleRef.current = Math.max(0, paddleRef.current - 32);
    if (control === "right") paddleRef.current = Math.min(420, paddleRef.current + 32);
  }

  useEffect(() => {
    makeBricks();
    let animation = 0;
    let last = performance.now();
    function frame(now: number) {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;
      const dt = Math.min(0.03, (now - last) / 1000);
      last = now;
      if (phaseRef.current === "running") {
        if (keysRef.current.left) paddleRef.current = Math.max(0, paddleRef.current - 360 * dt);
        if (keysRef.current.right) paddleRef.current = Math.min(420, paddleRef.current + 360 * dt);
        const ball = ballRef.current;
        ball.x += ball.vx * dt;
        ball.y += ball.vy * dt;
        if (ball.x < 12 || ball.x > 508) ball.vx *= -1;
        if (ball.y < 12) ball.vy *= -1;
        if (ball.y > 458 && ball.y < 482 && ball.x > paddleRef.current && ball.x < paddleRef.current + 100 && ball.vy > 0) {
          ball.vy *= -1;
          ball.vx += (ball.x - (paddleRef.current + 50)) * 4;
        }
        bricksRef.current.forEach((alive, index) => {
          if (!alive) return;
          const col = index % 8;
          const row = Math.floor(index / 8);
          const x = 34 + col * 57;
          const y = 50 + row * 28;
          if (ball.x > x && ball.x < x + 48 && ball.y > y && ball.y < y + 20) {
            bricksRef.current[index] = false;
            ball.vy *= -1;
            scoreRef.current += 25;
            setScore(scoreRef.current);
          }
        });
        if (bricksRef.current.every((brick) => !brick)) {
          scoreRef.current += 250;
          setScore(scoreRef.current);
          finish();
        }
        if (ball.y > 540) finish();
      }
      drawCabinet(ctx, canvas.width, canvas.height);
      bricksRef.current.forEach((alive, index) => {
        if (!alive) return;
        const col = index % 8;
        const row = Math.floor(index / 8);
        ctx.fillStyle = row % 2 === 0 ? "#f0c66f" : "#4f8ed8";
        ctx.fillRect(34 + col * 57, 50 + row * 28, 48, 20);
      });
      ctx.fillStyle = "#ffefe0";
      ctx.fillRect(paddleRef.current, 468, 100, 12);
      ctx.beginPath();
      ctx.arc(ballRef.current.x, ballRef.current.y, 10, 0, Math.PI * 2);
      ctx.fill();
      animation = requestAnimationFrame(frame);
    }
    animation = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(animation);
  }, [keysRef]);

  return (
    <ArcadePageShell title="Brick Breaker" subtitle="Bounce a neon ball through brick rows before it slips past the paddle.">
      <section className="mini-game-layout">
        <aside className="side-panel">
          <button className="secondary-button primary-action wide" onClick={start} type="button"><Play size={17} aria-hidden="true" />Start</button>
          <button className="secondary-button wide" onClick={start} type="button"><RotateCcw size={17} aria-hidden="true" />Reset</button>
          <ArcadeStatus best={best} message="Bricks are 25 points. Clear the wall for a bonus." phase={phase} score={score} />
          <TutorialButton gameId="brick-breaker" steps={brickTutorial} />
          <KeyboardHints hints={["Space: start/replay", "A/D or arrows: move paddle"]} />
          <HighScorePanel entries={highScores} gameId="brick-breaker" />
          <ControlPad buttons={[{ control: "left", label: "Left" }, { control: "right", label: "Right" }]} onPress={nudge} />
        </aside>
        <section className="board-panel arcade-panel"><ArcadeCanvas canvasRef={canvasRef} phase={phase} title="Brick Breaker" /></section>
        <aside className="rules-panel"><p className="eyebrow">How to play</p><h2>Clear the wall</h2><p className="instructions-intro">Move the paddle to keep the ball in play and carve through every brick row.</p></aside>
      </section>
    </ArcadePageShell>
  );
}

type BlockCell = string | null;
type FallingPiece = { matrix: number[][]; x: number; y: number; color: string };
const pieceShapes = [
  { color: "#f0c66f", matrix: [[1, 1, 1, 1]] },
  { color: "#4f8ed8", matrix: [[1, 1], [1, 1]] },
  { color: "#d65449", matrix: [[0, 1, 0], [1, 1, 1]] },
  { color: "#2f7d51", matrix: [[1, 1, 0], [0, 1, 1]] },
  { color: "#7356ad", matrix: [[0, 1, 1], [1, 1, 0]] },
];

const blockTutorial: TutorialStep[] = [
  { title: "Drop blocks", text: "Press Space to start. Pieces fall into a 10 by 20 well.", highlight: "Well" },
  { title: "Move and rotate", text: "Use arrows or WASD to position pieces. Up/W rotates.", highlight: "Controls" },
  { title: "Clear rows", text: "Complete full rows to score. Stacking beyond the top ends the run.", highlight: "Rows" },
];

function makePiece(): FallingPiece {
  const shape = pieceShapes[Math.floor(Math.random() * pieceShapes.length)];
  return { color: shape.color, matrix: shape.matrix.map((row) => [...row]), x: 3, y: 0 };
}

function rotateMatrix(matrix: number[][]): number[][] {
  return matrix[0].map((_, col) => matrix.map((row) => row[col]).reverse());
}

export function BlockStackPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const phaseRef = useRef<GamePhase>("ready");
  const gridRef = useRef<BlockCell[][]>([]);
  const pieceRef = useRef<FallingPiece>(makePiece());
  const dropRef = useRef(0);
  const scoreRef = useRef(0);
  const rotateReadyRef = useRef(true);
  const [phase, setPhase] = useState<GamePhase>("ready");
  const [score, setScore] = useState(0);
  const { best, highScores, record } = useRecordedBest("block-stack");

  function emptyGrid() {
    gridRef.current = Array.from({ length: 20 }, () => Array.from({ length: 10 }, () => null));
  }

  function collides(piece: FallingPiece, dx = 0, dy = 0, matrix = piece.matrix) {
    return matrix.some((row, rowIndex) =>
      row.some((cell, colIndex) => {
        if (!cell) return false;
        const x = piece.x + colIndex + dx;
        const y = piece.y + rowIndex + dy;
        return x < 0 || x >= 10 || y >= 20 || (y >= 0 && gridRef.current[y][x]);
      }),
    );
  }

  function spawn() {
    pieceRef.current = makePiece();
    if (collides(pieceRef.current)) {
      phaseRef.current = "game-over";
      setPhase("game-over");
      record(scoreRef.current);
    }
  }

  function lockPiece() {
    const piece = pieceRef.current;
    piece.matrix.forEach((row, rowIndex) => {
      row.forEach((cell, colIndex) => {
        if (cell) {
          const y = piece.y + rowIndex;
          const x = piece.x + colIndex;
          if (y >= 0 && y < 20 && x >= 0 && x < 10) gridRef.current[y][x] = piece.color;
        }
      });
    });
    const kept = gridRef.current.filter((row) => row.some((cell) => !cell));
    const cleared = 20 - kept.length;
    if (cleared > 0) {
      scoreRef.current += cleared * cleared * 100;
      setScore(scoreRef.current);
    }
    gridRef.current = [...Array.from({ length: cleared }, () => Array.from({ length: 10 }, () => null)), ...kept];
    spawn();
  }

  function start() {
    emptyGrid();
    pieceRef.current = makePiece();
    scoreRef.current = 0;
    setScore(0);
    phaseRef.current = "running";
    setPhase("running");
  }

  function move(control: ArcadeControl) {
    const piece = pieceRef.current;
    if (control === "left" && !collides(piece, -1, 0)) piece.x -= 1;
    if (control === "right" && !collides(piece, 1, 0)) piece.x += 1;
    if (control === "down") {
      if (!collides(piece, 0, 1)) piece.y += 1;
      else lockPiece();
    }
    if (control === "up") {
      const rotated = rotateMatrix(piece.matrix);
      if (!collides(piece, 0, 0, rotated)) piece.matrix = rotated;
    }
  }

  const keysRef = useArcadeKeys(() => {
    if (phaseRef.current !== "running") start();
  });

  useEffect(() => {
    emptyGrid();
    let animation = 0;
    let last = performance.now();
    function frame(now: number) {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;
      const dt = Math.min(0.04, (now - last) / 1000);
      last = now;
      if (phaseRef.current === "running") {
        if (keysRef.current.left) move("left");
        if (keysRef.current.right) move("right");
        if (keysRef.current.down) move("down");
        if (keysRef.current.up && rotateReadyRef.current) {
          move("up");
          rotateReadyRef.current = false;
        }
        if (!keysRef.current.up) rotateReadyRef.current = true;
        dropRef.current += dt;
        if (dropRef.current > Math.max(0.18, 0.7 - scoreRef.current * 0.0006)) {
          dropRef.current = 0;
          move("down");
        }
      }
      drawCabinet(ctx, canvas.width, canvas.height);
      const cell = 23;
      const ox = 145;
      const oy = 28;
      ctx.fillStyle = "#111820";
      ctx.fillRect(ox, oy, 10 * cell, 20 * cell);
      gridRef.current.forEach((row, rowIndex) => row.forEach((cellColor, colIndex) => {
        if (!cellColor) return;
        ctx.fillStyle = cellColor;
        ctx.fillRect(ox + colIndex * cell + 1, oy + rowIndex * cell + 1, cell - 2, cell - 2);
      }));
      const piece = pieceRef.current;
      piece.matrix.forEach((row, rowIndex) => row.forEach((cellValue, colIndex) => {
        if (!cellValue) return;
        ctx.fillStyle = piece.color;
        ctx.fillRect(ox + (piece.x + colIndex) * cell + 1, oy + (piece.y + rowIndex) * cell + 1, cell - 2, cell - 2);
      }));
      ctx.strokeStyle = "rgba(255,247,232,0.28)";
      ctx.strokeRect(ox, oy, 10 * cell, 20 * cell);
      animation = requestAnimationFrame(frame);
    }
    animation = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(animation);
  }, [keysRef]);

  return (
    <ArcadePageShell title="Block Stack" subtitle="Rotate falling blocks, clear full rows, and keep the stack below the top.">
      <section className="mini-game-layout">
        <aside className="side-panel">
          <button className="secondary-button primary-action wide" onClick={start} type="button"><Play size={17} aria-hidden="true" />Start</button>
          <button className="secondary-button wide" onClick={start} type="button"><RotateCcw size={17} aria-hidden="true" />Reset</button>
          <ArcadeStatus best={best} message="Clear full rows. Multiple rows at once score more." phase={phase} score={score} />
          <TutorialButton gameId="block-stack" steps={blockTutorial} />
          <KeyboardHints hints={["Space: start/replay", "A/D or arrows: move", "W/Up: rotate", "S/Down: soft drop"]} />
          <HighScorePanel entries={highScores} gameId="block-stack" />
          <ControlPad buttons={[{ control: "up", label: "Rotate" }, { control: "left", label: "Left" }, { control: "right", label: "Right" }, { control: "down", label: "Drop" }]} onPress={move} />
        </aside>
        <section className="board-panel arcade-panel"><ArcadeCanvas canvasRef={canvasRef} phase={phase} title="Block Stack" /></section>
        <aside className="rules-panel"><p className="eyebrow">How to play</p><h2>Build clean rows</h2><p className="instructions-intro">Move and rotate each falling piece. Completed rows vanish and award points.</p></aside>
      </section>
    </ArcadePageShell>
  );
}

type DriftRock = { r: number; vx: number; vy: number; x: number; y: number };
type DriftShot = { life: number; vx: number; vy: number; x: number; y: number };

const starDriftTutorial: TutorialStep[] = [
  { title: "Fly the ship", text: "Press Space to launch. Rotate with left/right and thrust with up.", highlight: "Ship" },
  { title: "Clear rocks", text: "Press Space while flying to fire. Breaking rocks earns points.", highlight: "Shots" },
  { title: "Stay intact", text: "A rock hitting your ship ends the run. Survive as the field gets denser.", highlight: "Rocks" },
];

export function StarDriftPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const phaseRef = useRef<GamePhase>("ready");
  const shipRef = useRef({ angle: -Math.PI / 2, vx: 0, vy: 0, x: 260, y: 260 });
  const rocksRef = useRef<DriftRock[]>([]);
  const shotsRef = useRef<DriftShot[]>([]);
  const cooldownRef = useRef(0);
  const spawnRef = useRef(0);
  const scoreRef = useRef(0);
  const [phase, setPhase] = useState<GamePhase>("ready");
  const [score, setScore] = useState(0);
  const { best, highScores, record } = useRecordedBest("star-drift");

  function spawnRock() {
    const edge = Math.floor(Math.random() * 4);
    const rock = {
      r: 16 + Math.random() * 18,
      vx: -55 + Math.random() * 110,
      vy: -55 + Math.random() * 110,
      x: edge === 0 ? -24 : edge === 1 ? 544 : Math.random() * 520,
      y: edge === 2 ? -24 : edge === 3 ? 544 : Math.random() * 520,
    };
    const dx = 260 - rock.x;
    const dy = 260 - rock.y;
    const len = Math.max(1, Math.hypot(dx, dy));
    rock.vx += (dx / len) * 45;
    rock.vy += (dy / len) * 45;
    rocksRef.current.push(rock);
  }

  function start() {
    phaseRef.current = "running";
    setPhase("running");
    shipRef.current = { angle: -Math.PI / 2, vx: 0, vy: 0, x: 260, y: 260 };
    rocksRef.current = [];
    shotsRef.current = [];
    scoreRef.current = 0;
    setScore(0);
    for (let index = 0; index < 4; index += 1) spawnRock();
  }

  function shoot() {
    const ship = shipRef.current;
    shotsRef.current.push({
      life: 0.9,
      vx: Math.cos(ship.angle) * 360 + ship.vx,
      vy: Math.sin(ship.angle) * 360 + ship.vy,
      x: ship.x + Math.cos(ship.angle) * 18,
      y: ship.y + Math.sin(ship.angle) * 18,
    });
  }

  function finish() {
    phaseRef.current = "game-over";
    setPhase("game-over");
    record(scoreRef.current);
  }

  const keysRef = useArcadeKeys(() => {
    if (phaseRef.current !== "running") {
      start();
      return;
    }
    if (cooldownRef.current <= 0) {
      shoot();
      cooldownRef.current = 0.22;
    }
  });

  useEffect(() => {
    let animation = 0;
    let last = performance.now();
    function wrap(value: number) {
      if (value < -20) return 540;
      if (value > 540) return -20;
      return value;
    }
    function frame(now: number) {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;
      const dt = Math.min(0.035, (now - last) / 1000);
      last = now;
      if (phaseRef.current === "running") {
        const ship = shipRef.current;
        if (keysRef.current.left) ship.angle -= dt * 4.2;
        if (keysRef.current.right) ship.angle += dt * 4.2;
        if (keysRef.current.up) {
          ship.vx += Math.cos(ship.angle) * 190 * dt;
          ship.vy += Math.sin(ship.angle) * 190 * dt;
        }
        ship.vx *= 0.992;
        ship.vy *= 0.992;
        ship.x = wrap(ship.x + ship.vx * dt);
        ship.y = wrap(ship.y + ship.vy * dt);
        cooldownRef.current -= dt;
        spawnRef.current -= dt;
        if (spawnRef.current <= 0) {
          spawnRock();
          spawnRef.current = Math.max(0.7, 1.7 - scoreRef.current * 0.006);
        }
        rocksRef.current = rocksRef.current.map((rock) => ({ ...rock, x: wrap(rock.x + rock.vx * dt), y: wrap(rock.y + rock.vy * dt) }));
        shotsRef.current = shotsRef.current
          .map((shot) => ({ ...shot, life: shot.life - dt, x: wrap(shot.x + shot.vx * dt), y: wrap(shot.y + shot.vy * dt) }))
          .filter((shot) => shot.life > 0);
        const hitRock = rocksRef.current.find((rock) => Math.hypot(rock.x - ship.x, rock.y - ship.y) < rock.r + 12);
        if (hitRock) finish();
        rocksRef.current = rocksRef.current.filter((rock) => {
          const hit = shotsRef.current.some((shot) => Math.hypot(shot.x - rock.x, shot.y - rock.y) < rock.r);
          if (hit) {
            scoreRef.current += Math.max(10, Math.round(40 - rock.r));
            setScore(scoreRef.current);
          }
          return !hit;
        });
      }
      drawCabinet(ctx, canvas.width, canvas.height);
      rocksRef.current.forEach((rock) => {
        const rockGradient = ctx.createRadialGradient(rock.x - rock.r * 0.35, rock.y - rock.r * 0.35, 2, rock.x, rock.y, rock.r);
        rockGradient.addColorStop(0, "#ffe45e");
        rockGradient.addColorStop(0.58, "#ff8a3d");
        rockGradient.addColorStop(1, "#5d2a20");
        ctx.beginPath();
        ctx.arc(rock.x, rock.y, rock.r, 0, Math.PI * 2);
        ctx.fillStyle = rockGradient;
        ctx.fill();
        ctx.strokeStyle = "#ffe45e";
        ctx.lineWidth = 3;
        ctx.stroke();
      });
      ctx.fillStyle = "#ffefe0";
      shotsRef.current.forEach((shot) => {
        ctx.beginPath();
        ctx.arc(shot.x, shot.y, 3, 0, Math.PI * 2);
        ctx.fill();
      });
      const ship = shipRef.current;
      ctx.save();
      ctx.translate(ship.x, ship.y);
      ctx.rotate(ship.angle + Math.PI / 2);
      ctx.beginPath();
      ctx.moveTo(0, -18);
      ctx.lineTo(-12, 14);
      ctx.lineTo(12, 14);
      ctx.closePath();
      ctx.fillStyle = "#18f0ff";
      ctx.fill();
      ctx.strokeStyle = "#fff7e8";
      ctx.lineWidth = 2;
      ctx.stroke();
      if (keysRef.current.up && phaseRef.current === "running") {
        ctx.beginPath();
        ctx.moveTo(-7, 15);
        ctx.lineTo(0, 31);
        ctx.lineTo(7, 15);
        ctx.fillStyle = "#ff4fd8";
        ctx.fill();
      }
      ctx.restore();
      animation = requestAnimationFrame(frame);
    }
    animation = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(animation);
  }, [keysRef]);

  return (
    <ArcadePageShell title="Star Drift" subtitle="Thrust through a drifting rock field and shoot your way to a longer run.">
      <section className="mini-game-layout">
        <aside className="side-panel">
          <button className="secondary-button primary-action wide" onClick={start} type="button"><Play size={17} aria-hidden="true" />Start</button>
          <button className="secondary-button wide" onClick={start} type="button"><RotateCcw size={17} aria-hidden="true" />Reset</button>
          <ArcadeStatus best={best} message="Shoot rocks for points. Contact with a rock ends the run." phase={phase} score={score} />
          <TutorialButton gameId="star-drift" steps={starDriftTutorial} />
          <KeyboardHints hints={["Space: start/fire", "A/D or Left/Right: rotate", "W/Up: thrust"]} />
          <HighScorePanel entries={highScores} gameId="star-drift" />
          <ControlPad buttons={[{ control: "left", label: "Turn L" }, { control: "up", label: "Thrust" }, { control: "right", label: "Turn R" }, { control: "action", label: "Fire" }]} onPress={(control) => {
            if (control === "left") shipRef.current.angle -= 0.35;
            if (control === "right") shipRef.current.angle += 0.35;
            if (control === "up") {
              shipRef.current.vx += Math.cos(shipRef.current.angle) * 22;
              shipRef.current.vy += Math.sin(shipRef.current.angle) * 22;
            }
            if (control === "action") shoot();
          }} />
        </aside>
        <section className="board-panel arcade-panel"><ArcadeCanvas canvasRef={canvasRef} phase={phase} title="Star Drift" /></section>
        <aside className="rules-panel"><p className="eyebrow">How to play</p><h2>Drift and fire</h2><p className="instructions-intro">Rotate, thrust, and fire through incoming rocks. Screen edges wrap around.</p></aside>
      </section>
    </ArcadePageShell>
  );
}

type Invader = { alive: boolean; x: number; y: number };
type Laser = { vy: number; x: number; y: number };
const invaderTutorial: TutorialStep[] = [
  { title: "Defend the line", text: "Move your cannon with A/D or arrows and press Space to fire.", highlight: "Cannon" },
  { title: "Clear the grid", text: "Each invader is worth points. The formation speeds up as it thins.", highlight: "Invaders" },
  { title: "Do not get overrun", text: "If an invader reaches the lower warning line, the run ends.", highlight: "Warning line" },
];

export function SectorInvadersPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const phaseRef = useRef<GamePhase>("ready");
  const playerRef = useRef(250);
  const invadersRef = useRef<Invader[]>([]);
  const lasersRef = useRef<Laser[]>([]);
  const dirRef = useRef(1);
  const cooldownRef = useRef(0);
  const scoreRef = useRef(0);
  const [phase, setPhase] = useState<GamePhase>("ready");
  const [score, setScore] = useState(0);
  const { best, highScores, record } = useRecordedBest("sector-invaders");

  function makeInvaders() {
    invadersRef.current = Array.from({ length: 30 }, (_, index) => ({
      alive: true,
      x: 70 + (index % 10) * 38,
      y: 56 + Math.floor(index / 10) * 34,
    }));
  }

  function start() {
    phaseRef.current = "running";
    setPhase("running");
    playerRef.current = 250;
    lasersRef.current = [];
    dirRef.current = 1;
    scoreRef.current = 0;
    setScore(0);
    makeInvaders();
  }

  function fire() {
    if (cooldownRef.current <= 0) {
      lasersRef.current.push({ vy: -390, x: playerRef.current + 15, y: 446 });
      cooldownRef.current = 0.24;
    }
  }

  function finish() {
    phaseRef.current = "game-over";
    setPhase("game-over");
    record(scoreRef.current);
  }

  const keysRef = useArcadeKeys(() => {
    if (phaseRef.current !== "running") start();
    else fire();
  });

  useEffect(() => {
    makeInvaders();
    let animation = 0;
    let last = performance.now();
    function frame(now: number) {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;
      const dt = Math.min(0.035, (now - last) / 1000);
      last = now;
      if (phaseRef.current === "running") {
        if (keysRef.current.left) playerRef.current = Math.max(16, playerRef.current - 330 * dt);
        if (keysRef.current.right) playerRef.current = Math.min(474, playerRef.current + 330 * dt);
        cooldownRef.current -= dt;
        const alive = invadersRef.current.filter((invader) => invader.alive);
        const speed = 28 + (30 - alive.length) * 3;
        const hitEdge = alive.some((invader) => invader.x < 26 || invader.x > 472);
        if (hitEdge) {
          dirRef.current *= -1;
          invadersRef.current = invadersRef.current.map((invader) => ({ ...invader, y: invader.y + 18 }));
        }
        invadersRef.current = invadersRef.current.map((invader) => ({ ...invader, x: invader.x + dirRef.current * speed * dt }));
        lasersRef.current = lasersRef.current.map((laser) => ({ ...laser, y: laser.y + laser.vy * dt })).filter((laser) => laser.y > -20);
        invadersRef.current.forEach((invader) => {
          if (!invader.alive) return;
          const laser = lasersRef.current.find((shot) => Math.abs(shot.x - invader.x) < 17 && Math.abs(shot.y - invader.y) < 15);
          if (laser) {
            invader.alive = false;
            laser.y = -50;
            scoreRef.current += 15;
            setScore(scoreRef.current);
          }
        });
        if (invadersRef.current.every((invader) => !invader.alive)) {
          scoreRef.current += 250;
          setScore(scoreRef.current);
          makeInvaders();
        }
        if (invadersRef.current.some((invader) => invader.alive && invader.y > 410)) finish();
      }
      drawCabinet(ctx, canvas.width, canvas.height);
      ctx.strokeStyle = "rgba(214,84,73,0.65)";
      ctx.beginPath();
      ctx.moveTo(0, 430);
      ctx.lineTo(520, 430);
      ctx.stroke();
      invadersRef.current.forEach((invader) => {
        if (!invader.alive) return;
        ctx.fillStyle = "#f0c66f";
        ctx.fillRect(invader.x - 13, invader.y - 10, 26, 20);
        ctx.fillStyle = "#101318";
        ctx.fillRect(invader.x - 5, invader.y - 2, 10, 5);
      });
      ctx.fillStyle = "#4f8ed8";
      ctx.fillRect(playerRef.current, 452, 30, 18);
      ctx.fillRect(playerRef.current + 10, 440, 10, 14);
      ctx.fillStyle = "#ffefe0";
      lasersRef.current.forEach((laser) => ctx.fillRect(laser.x - 2, laser.y - 10, 4, 14));
      animation = requestAnimationFrame(frame);
    }
    animation = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(animation);
  }, [keysRef]);

  return (
    <ArcadePageShell title="Sector Invaders" subtitle="Hold the lower line against descending invader rows.">
      <section className="mini-game-layout">
        <aside className="side-panel">
          <button className="secondary-button primary-action wide" onClick={start} type="button"><Play size={17} aria-hidden="true" />Start</button>
          <button className="secondary-button wide" onClick={start} type="button"><RotateCcw size={17} aria-hidden="true" />Reset</button>
          <ArcadeStatus best={best} message="Shoot invaders for 15 points. A cleared wave adds a bonus." phase={phase} score={score} />
          <TutorialButton gameId="sector-invaders" steps={invaderTutorial} />
          <KeyboardHints hints={["Space: start/fire", "A/D or Left/Right: move"]} />
          <HighScorePanel entries={highScores} gameId="sector-invaders" />
          <ControlPad buttons={[{ control: "left", label: "Left" }, { control: "action", label: "Fire" }, { control: "right", label: "Right" }]} onPress={(control) => {
            if (control === "left") playerRef.current = Math.max(16, playerRef.current - 34);
            if (control === "right") playerRef.current = Math.min(474, playerRef.current + 34);
            if (control === "action") fire();
          }} />
        </aside>
        <section className="board-panel arcade-panel"><ArcadeCanvas canvasRef={canvasRef} phase={phase} title="Sector Invaders" /></section>
        <aside className="rules-panel"><p className="eyebrow">How to play</p><h2>Clear waves</h2><p className="instructions-intro">Move under the formation, fire upward, and prevent the row from crossing the warning line.</p></aside>
      </section>
    </ArcadePageShell>
  );
}

const paddlePopTutorial: TutorialStep[] = [
  { title: "Catch and rebound", text: "Press Space to launch. Move the paddle to keep the ball bouncing upward.", highlight: "Paddle" },
  { title: "Pop targets", text: "Hit floating targets for points. A clean board restores the target field.", highlight: "Targets" },
  { title: "Do not miss", text: "If the ball drops past your paddle, the run ends.", highlight: "Bottom edge" },
];

export function PaddlePopPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const phaseRef = useRef<GamePhase>("ready");
  const paddleRef = useRef(215);
  const ballRef = useRef({ vx: 180, vy: -260, x: 260, y: 420 });
  const targetsRef = useRef<boolean[]>([]);
  const scoreRef = useRef(0);
  const [phase, setPhase] = useState<GamePhase>("ready");
  const [score, setScore] = useState(0);
  const { best, highScores, record } = useRecordedBest("paddle-pop");

  function makeTargets() {
    targetsRef.current = Array.from({ length: 24 }, () => true);
  }

  function start() {
    phaseRef.current = "running";
    setPhase("running");
    paddleRef.current = 215;
    ballRef.current = { vx: 175, vy: -260, x: 260, y: 420 };
    scoreRef.current = 0;
    setScore(0);
    makeTargets();
  }

  function finish() {
    phaseRef.current = "game-over";
    setPhase("game-over");
    record(scoreRef.current);
  }

  const keysRef = useArcadeKeys(() => {
    if (phaseRef.current !== "running") start();
  });

  useEffect(() => {
    makeTargets();
    let animation = 0;
    let last = performance.now();
    function frame(now: number) {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;
      const dt = Math.min(0.03, (now - last) / 1000);
      last = now;
      if (phaseRef.current === "running") {
        if (keysRef.current.left) paddleRef.current = Math.max(12, paddleRef.current - 380 * dt);
        if (keysRef.current.right) paddleRef.current = Math.min(408, paddleRef.current + 380 * dt);
        const ball = ballRef.current;
        ball.x += ball.vx * dt;
        ball.y += ball.vy * dt;
        if (ball.x < 12 || ball.x > 508) ball.vx *= -1;
        if (ball.y < 12) ball.vy *= -1;
        if (ball.y > 438 && ball.y < 465 && ball.x > paddleRef.current && ball.x < paddleRef.current + 100 && ball.vy > 0) {
          ball.vy = -Math.abs(ball.vy) - 4;
          ball.vx += (ball.x - (paddleRef.current + 50)) * 3.5;
        }
        targetsRef.current.forEach((alive, index) => {
          if (!alive) return;
          const col = index % 8;
          const row = Math.floor(index / 8);
          const x = 46 + col * 54;
          const y = 70 + row * 42;
          if (Math.hypot(ball.x - x, ball.y - y) < 21) {
            targetsRef.current[index] = false;
            ball.vy *= -1;
            scoreRef.current += 20;
            setScore(scoreRef.current);
          }
        });
        if (targetsRef.current.every((target) => !target)) {
          scoreRef.current += 200;
          setScore(scoreRef.current);
          makeTargets();
          ball.vy *= 1.05;
        }
        if (ball.y > 535) finish();
      }
      drawCabinet(ctx, canvas.width, canvas.height);
      targetsRef.current.forEach((alive, index) => {
        if (!alive) return;
        const col = index % 8;
        const row = Math.floor(index / 8);
        ctx.fillStyle = row % 2 === 0 ? "#f0c66f" : "#d65449";
        ctx.beginPath();
        ctx.arc(46 + col * 54, 70 + row * 42, 14, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.fillStyle = "#4f8ed8";
      ctx.fillRect(paddleRef.current, 452, 100, 14);
      ctx.fillStyle = "#ffefe0";
      ctx.beginPath();
      ctx.arc(ballRef.current.x, ballRef.current.y, 10, 0, Math.PI * 2);
      ctx.fill();
      animation = requestAnimationFrame(frame);
    }
    animation = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(animation);
  }, [keysRef]);

  return (
    <ArcadePageShell title="Paddle Pop" subtitle="Catch the rebound and pop every floating target above the paddle.">
      <section className="mini-game-layout">
        <aside className="side-panel">
          <button className="secondary-button primary-action wide" onClick={start} type="button"><Play size={17} aria-hidden="true" />Start</button>
          <button className="secondary-button wide" onClick={start} type="button"><RotateCcw size={17} aria-hidden="true" />Reset</button>
          <ArcadeStatus best={best} message="Targets are 20 points. Missing the ball ends the run." phase={phase} score={score} />
          <TutorialButton gameId="paddle-pop" steps={paddlePopTutorial} />
          <KeyboardHints hints={["Space: start/replay", "A/D or Left/Right: move paddle"]} />
          <HighScorePanel entries={highScores} gameId="paddle-pop" />
          <ControlPad buttons={[{ control: "left", label: "Left" }, { control: "right", label: "Right" }]} onPress={(control) => {
            if (control === "left") paddleRef.current = Math.max(12, paddleRef.current - 36);
            if (control === "right") paddleRef.current = Math.min(408, paddleRef.current + 36);
          }} />
        </aside>
        <section className="board-panel arcade-panel"><ArcadeCanvas canvasRef={canvasRef} phase={phase} title="Paddle Pop" /></section>
        <aside className="rules-panel"><p className="eyebrow">How to play</p><h2>Keep it alive</h2><p className="instructions-intro">Slide under the ball, angle rebounds with the paddle, and clear the target field.</p></aside>
      </section>
    </ArcadePageShell>
  );
}

const wallPongTutorial: TutorialStep[] = [
  { title: "Return the volley", text: "Press Space to serve. Move the paddle up and down to return the ball.", highlight: "Paddle" },
  { title: "Score rallies", text: "Every successful return scores. Longer rallies speed up.", highlight: "Rally" },
  { title: "Guard your side", text: "If the ball gets behind your paddle, the run ends.", highlight: "Left wall" },
];

export function WallPongPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const phaseRef = useRef<GamePhase>("ready");
  const paddleRef = useRef(210);
  const ballRef = useRef({ vx: 230, vy: 150, x: 92, y: 260 });
  const scoreRef = useRef(0);
  const [phase, setPhase] = useState<GamePhase>("ready");
  const [score, setScore] = useState(0);
  const { best, highScores, record } = useRecordedBest("wall-pong");

  function start() {
    phaseRef.current = "running";
    setPhase("running");
    paddleRef.current = 210;
    ballRef.current = { vx: 230, vy: 150, x: 92, y: 260 };
    scoreRef.current = 0;
    setScore(0);
  }

  function finish() {
    phaseRef.current = "game-over";
    setPhase("game-over");
    record(scoreRef.current);
  }

  const keysRef = useArcadeKeys(() => {
    if (phaseRef.current !== "running") start();
  });

  useEffect(() => {
    let animation = 0;
    let last = performance.now();
    function frame(now: number) {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;
      const dt = Math.min(0.03, (now - last) / 1000);
      last = now;
      if (phaseRef.current === "running") {
        if (keysRef.current.up) paddleRef.current = Math.max(20, paddleRef.current - 360 * dt);
        if (keysRef.current.down) paddleRef.current = Math.min(400, paddleRef.current + 360 * dt);
        const ball = ballRef.current;
        ball.x += ball.vx * dt;
        ball.y += ball.vy * dt;
        if (ball.y < 12 || ball.y > 508) ball.vy *= -1;
        if (ball.x > 504) ball.vx = -Math.abs(ball.vx) * 1.02;
        if (ball.x < 42 && ball.x > 25 && ball.y > paddleRef.current && ball.y < paddleRef.current + 100 && ball.vx < 0) {
          ball.vx = Math.abs(ball.vx) + 12;
          ball.vy += (ball.y - (paddleRef.current + 50)) * 2.8;
          scoreRef.current += 1;
          setScore(scoreRef.current);
        }
        if (ball.x < -20) finish();
      }
      drawCabinet(ctx, canvas.width, canvas.height);
      ctx.fillStyle = "rgba(240,198,111,0.18)";
      ctx.fillRect(498, 0, 8, 520);
      ctx.fillStyle = "#4f8ed8";
      ctx.fillRect(28, paddleRef.current, 14, 100);
      ctx.fillStyle = "#ffefe0";
      ctx.beginPath();
      ctx.arc(ballRef.current.x, ballRef.current.y, 10, 0, Math.PI * 2);
      ctx.fill();
      animation = requestAnimationFrame(frame);
    }
    animation = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(animation);
  }, [keysRef]);

  return (
    <ArcadePageShell title="Wall Pong" subtitle="Play a solo rally against the far wall and chase a longer return streak.">
      <section className="mini-game-layout">
        <aside className="side-panel">
          <button className="secondary-button primary-action wide" onClick={start} type="button"><Play size={17} aria-hidden="true" />Start</button>
          <button className="secondary-button wide" onClick={start} type="button"><RotateCcw size={17} aria-hidden="true" />Reset</button>
          <ArcadeStatus best={best} message="Each paddle return scores one point. Miss once and the rally ends." phase={phase} score={score} />
          <TutorialButton gameId="wall-pong" steps={wallPongTutorial} />
          <KeyboardHints hints={["Space: start/replay", "W/S or Up/Down: move paddle"]} />
          <HighScorePanel entries={highScores} gameId="wall-pong" />
          <ControlPad buttons={[{ control: "up", label: "Up" }, { control: "down", label: "Down" }]} onPress={(control) => {
            if (control === "up") paddleRef.current = Math.max(20, paddleRef.current - 36);
            if (control === "down") paddleRef.current = Math.min(400, paddleRef.current + 36);
          }} />
        </aside>
        <section className="board-panel arcade-panel"><ArcadeCanvas canvasRef={canvasRef} phase={phase} title="Wall Pong" /></section>
        <aside className="rules-panel"><p className="eyebrow">How to play</p><h2>Return streak</h2><p className="instructions-intro">Track the ball after it bounces from the far wall and keep the rally alive.</p></aside>
      </section>
    </ArcadePageShell>
  );
}
