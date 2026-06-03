import type { ReactNode } from "react";

type ThumbnailProps = {
  id: string;
};

type SvgProps = {
  children: ReactNode;
  className?: string;
};

function Svg({ children, className = "" }: SvgProps) {
  return (
    <svg
      aria-hidden="true"
      className={`thumbnail-svg ${className}`}
      focusable="false"
      role="img"
      viewBox="0 0 240 128"
    >
      <defs>
        <linearGradient id="thumb-neon" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#18f0ff" />
          <stop offset="0.52" stopColor="#ff4fd8" />
          <stop offset="1" stopColor="#ffe45e" />
        </linearGradient>
        <linearGradient id="thumb-wood" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#ffd28a" />
          <stop offset="1" stopColor="#9a5429" />
        </linearGradient>
      </defs>
      <rect width="240" height="128" rx="12" />
      {children}
    </svg>
  );
}

function BoardGrid({ size = 4 }: { size?: number }) {
  const cells = Array.from({ length: size * size }, (_, index) => {
    const row = Math.floor(index / size);
    const col = index % size;
    return (
      <rect
        className={(row + col) % 2 === 0 ? "tile-light" : "tile-dark"}
        height={82 / size}
        key={index}
        width={82 / size}
        x={79 + col * (82 / size)}
        y={23 + row * (82 / size)}
      />
    );
  });
  return <>{cells}</>;
}

function ArcadeStarDrift() {
  return (
    <Svg className="thumb-arcade">
      <circle className="star" cx="38" cy="28" r="2" />
      <circle className="star" cx="198" cy="22" r="2.5" />
      <circle className="star" cx="208" cy="100" r="1.8" />
      <path className="ship" d="M102 30 126 96 102 82 78 96Z" />
      <circle className="rock" cx="45" cy="82" r="18" />
      <circle className="rock" cx="190" cy="64" r="24" />
      <path className="shot" d="M128 57h45" />
    </Svg>
  );
}

function ArcadeSnake() {
  return (
    <Svg className="thumb-arcade">
      <path className="snake-path" d="M40 92h42V66h48V42h42" />
      <circle className="snake-head" cx="172" cy="42" r="14" />
      <circle className="food" cx="205" cy="88" r="8" />
    </Svg>
  );
}

function BlockStack() {
  return (
    <Svg className="thumb-arcade">
      <rect className="well" x="70" y="12" width="100" height="104" rx="6" />
      {[
        ["cyan", 82, 88], ["cyan", 104, 88], ["magenta", 126, 88], ["yellow", 148, 88],
        ["green", 82, 66], ["magenta", 104, 66], ["magenta", 126, 66], ["yellow", 148, 66],
        ["cyan", 104, 20], ["cyan", 126, 20], ["cyan", 126, 42], ["green", 148, 42],
      ].map(([color, x, y], index) => (
        <rect className={`block ${color}`} height="20" key={index} width="20" x={x} y={y} />
      ))}
    </Svg>
  );
}

function BrickBreaker() {
  return (
    <Svg className="thumb-arcade">
      {Array.from({ length: 18 }, (_, index) => (
        <rect
          className={`brick brick-${index % 3}`}
          height="12"
          key={index}
          rx="3"
          width="28"
          x={30 + (index % 6) * 31}
          y={18 + Math.floor(index / 6) * 16}
        />
      ))}
      <circle className="ball" cx="122" cy="82" r="8" />
      <rect className="paddle" x="86" y="104" width="68" height="10" rx="5" />
    </Svg>
  );
}

function WingDash() {
  return (
    <Svg className="thumb-arcade">
      <path className="gate" d="M170 4v42M170 82v42" />
      <path className="gate" d="M206 0v34M206 76v52" />
      <path className="bird" d="M52 70c28-34 54-30 78 0-28-8-50-4-78 0Z" />
      <circle className="food" cx="92" cy="60" r="7" />
    </Svg>
  );
}

function SuperHexagon() {
  return (
    <Svg className="thumb-arcade">
      <polygon className="hex-ring" points="120,17 160,40 160,86 120,109 80,86 80,40" />
      <polygon className="hex-core" points="120,45 136,54 136,74 120,83 104,74 104,54" />
      <path className="wall" d="M120 17 160 40" />
      <path className="wall wall-two" d="M80 86 120 109" />
      <circle className="player-dot" cx="120" cy="28" r="6" />
    </Svg>
  );
}

function ChessThumb() {
  return (
    <Svg className="thumb-board">
      <BoardGrid size={4} />
      <text className="piece-text dark-piece" x="99" y="53">♞</text>
      <text className="piece-text light-piece" x="126" y="80">♔</text>
      <text className="piece-text dark-piece" x="148" y="102">♜</text>
    </Svg>
  );
}

function ChessAnalysisThumb() {
  return (
    <Svg className="thumb-board">
      <BoardGrid size={4} />
      <path className="shot" d="M82 88c18-26 34-12 50-34 10-14 22-18 38-18" />
      <text className="piece-text dark-piece" x="94" y="55">♞</text>
      <text className="piece-text light-piece" x="142" y="95">♔</text>
      <circle className="lit-tile" cx="168" cy="36" r="8" />
      <circle className="lit-tile" cx="134" cy="58" r="6" />
    </Svg>
  );
}

function JanggiThumb() {
  return (
    <Svg className="thumb-board">
      <rect className="board-surface" x="63" y="12" width="114" height="104" rx="8" />
      <path className="board-line" d="M101 12v104M139 12v104M63 38h114M63 64h114M63 90h114" />
      <circle className="janggi-red" cx="101" cy="91" r="18" />
      <circle className="janggi-blue" cx="139" cy="37" r="18" />
      <text className="token-text" x="101" y="98">王</text>
      <text className="token-text" x="139" y="44">將</text>
    </Svg>
  );
}

function ShogiThumb() {
  return (
    <Svg className="thumb-board">
      <BoardGrid size={5} />
      <path className="shogi-piece red-piece" d="M90 92 101 58 122 58 133 92Z" />
      <path className="shogi-piece blue-piece" d="M151 36 140 70 119 70 108 36Z" />
      <text className="shogi-text" x="112" y="84">金</text>
      <text className="shogi-text" x="129" y="55">王</text>
    </Svg>
  );
}

function HexThumb() {
  return (
    <Svg className="thumb-board">
      {Array.from({ length: 20 }, (_, index) => {
        const row = Math.floor(index / 5);
        const col = index % 5;
        return (
          <polygon
            className={`mini-hex ${index % 7 === 0 ? "owner-red" : index % 5 === 0 ? "owner-blue" : ""}`}
            key={index}
            points={`${70 + col * 22 + row * 10},${24 + row * 20} ${82 + col * 22 + row * 10},${18 + row * 20} ${94 + col * 22 + row * 10},${24 + row * 20} ${94 + col * 22 + row * 10},${38 + row * 20} ${82 + col * 22 + row * 10},${44 + row * 20} ${70 + col * 22 + row * 10},${38 + row * 20}`}
          />
        );
      })}
      <path className="connection-red" d="M72 31c30 24 48 34 90 58" />
      <path className="connection-blue" d="M113 20c11 26 20 48 36 84" />
    </Svg>
  );
}

function DominoThumb() {
  return (
    <Svg className="thumb-board">
      <BoardGrid size={6} />
      <rect className="domino vertical" x="91" y="36" width="20" height="44" rx="5" />
      <rect className="domino horizontal" x="119" y="76" width="46" height="20" rx="5" />
      <rect className="domino vertical" x="146" y="26" width="20" height="44" rx="5" />
    </Svg>
  );
}

function KonaneThumb() {
  return (
    <Svg className="thumb-board">
      <BoardGrid size={6} />
      <circle className="stone dark-stone" cx="101" cy="47" r="10" />
      <circle className="stone light-stone" cx="121" cy="47" r="10" />
      <circle className="stone dark-stone" cx="141" cy="47" r="10" />
      <path className="jump-arrow" d="M101 47c12 25 26 25 40 0" />
    </Svg>
  );
}

function MorrisThumb() {
  return (
    <Svg className="thumb-board">
      <rect className="mill-line" x="56" y="16" width="128" height="96" rx="2" />
      <rect className="mill-line" x="82" y="36" width="76" height="56" rx="2" />
      <path className="mill-line" d="M120 16v20M120 92v20M56 64h26M158 64h26" />
      {[56, 120, 184, 82, 158].map((x, index) => (
        <circle className={index < 3 ? "stone red-stone" : "stone blue-stone"} cx={x} cy={index < 3 ? 16 : 64} key={index} r="8" />
      ))}
    </Svg>
  );
}

function PuzzleThumb({ kind }: { kind: "xo" | "hanoi" | "mastermind" | "peg" | "sokoban" | "lights" | "sliding" | "amazons" }) {
  if (kind === "hanoi") {
    return (
      <Svg className="thumb-puzzle">
        {[72, 120, 168].map((x) => <path className="peg-post" d={`M${x} 24v78`} key={x} />)}
        {[[50, 94, 44], [58, 80, 28], [66, 66, 12], [140, 94, 56]].map(([x, y, w], index) => (
          <rect className={`hanoi-disk-art disk-${index}`} height="12" key={index} rx="6" width={w} x={x} y={y} />
        ))}
      </Svg>
    );
  }
  if (kind === "mastermind") {
    return (
      <Svg className="thumb-puzzle">
        {[54, 82, 110, 138].map((x, index) => <circle className={`code-dot c${index}`} cx={x} cy="44" key={x} r="11" />)}
        {[54, 82, 110, 138].map((x, index) => <circle className={`code-dot c${index + 2}`} cx={x} cy="82" key={x} r="11" />)}
        <circle className="feedback-dot" cx="174" cy="40" r="5" />
        <circle className="feedback-dot empty" cx="190" cy="40" r="5" />
        <circle className="feedback-dot" cx="174" cy="56" r="5" />
      </Svg>
    );
  }
  if (kind === "sokoban") {
    return (
      <Svg className="thumb-puzzle">
        <BoardGrid size={5} />
        <rect className="crate" x="103" y="48" width="22" height="22" rx="4" />
        <rect className="goal" x="132" y="76" width="18" height="18" rx="4" />
        <circle className="player" cx="91" cy="83" r="12" />
      </Svg>
    );
  }
  if (kind === "lights") {
    return (
      <Svg className="thumb-puzzle">
        <BoardGrid size={5} />
        {[0, 2, 6, 12, 18, 20].map((index) => (
          <circle className="lit-tile" cx={87 + (index % 5) * 17} cy={31 + Math.floor(index / 5) * 17} key={index} r="7" />
        ))}
      </Svg>
    );
  }
  if (kind === "peg") {
    return (
      <Svg className="thumb-puzzle">
        {Array.from({ length: 21 }, (_, index) => (
          <circle className={index === 10 ? "peg-hole" : "peg-art"} cx={70 + (index % 7) * 17} cy={28 + Math.floor(index / 7) * 26} key={index} r="7" />
        ))}
        <path className="jump-arrow" d="M104 54h34" />
      </Svg>
    );
  }
  if (kind === "sliding") {
    return (
      <Svg className="thumb-puzzle">
        <BoardGrid size={4} />
        {Array.from({ length: 15 }, (_, index) => <text className="number-tile" key={index} x={89 + (index % 4) * 20} y={41 + Math.floor(index / 4) * 20}>{index + 1}</text>)}
      </Svg>
    );
  }
  if (kind === "amazons") {
    return (
      <Svg className="thumb-board">
        <BoardGrid size={6} />
        <text className="piece-text light-piece" x="99" y="56">♛</text>
        <text className="piece-text dark-piece" x="142" y="94">♛</text>
        <path className="shot" d="M103 54 145 88" />
      </Svg>
    );
  }
  return (
    <Svg className="thumb-puzzle">
      <BoardGrid size={3} />
      <text className="xo-letter x" x="98" y="54">X</text>
      <text className="xo-letter o" x="122" y="78">O</text>
      <text className="xo-letter x" x="145" y="101">X</text>
    </Svg>
  );
}

function SectorInvaders() {
  return (
    <Svg className="thumb-arcade">
      {Array.from({ length: 12 }, (_, index) => <path className="invader" d="M0 8h6v-6h12v6h6v14h-6v-6h-12v6h-6Z" key={index} transform={`translate(${44 + (index % 6) * 28} ${22 + Math.floor(index / 6) * 24})`} />)}
      <path className="cannon" d="M108 108h24l6 10H102Z" />
      <path className="shot" d="M120 100V70" />
    </Svg>
  );
}

function PaddleThumb({ pong = false }: { pong?: boolean }) {
  return (
    <Svg className="thumb-arcade">
      <rect className="paddle" x="34" y="48" width="12" height="48" rx="6" />
      {pong ? <rect className="wall" x="198" y="22" width="8" height="84" rx="4" /> : null}
      <circle className="ball" cx="128" cy="58" r="8" />
      <path className="shot" d="M52 72 128 58 198 92" />
      {!pong ? <circle className="food" cx="194" cy="92" r="12" /> : null}
    </Svg>
  );
}

const thumbnails: Record<string, ReactNode> = {
  "amazons-mini": <PuzzleThumb kind="amazons" />,
  "block-stack": <BlockStack />,
  "brick-breaker": <BrickBreaker />,
  chess: <ChessThumb />,
  "chess-com-analysis": <ChessAnalysisThumb />,
  domineering: <DominoThumb />,
  hex: <HexThumb />,
  konane: <KonaneThumb />,
  "lights-out": <PuzzleThumb kind="lights" />,
  mastermind: <PuzzleThumb kind="mastermind" />,
  "mini-shogi": <ShogiThumb />,
  "neon-snake": <ArcadeSnake />,
  "nine-mens-morris": <MorrisThumb />,
  "paddle-pop": <PaddleThumb />,
  "peg-solitaire": <PuzzleThumb kind="peg" />,
  "sector-invaders": <SectorInvaders />,
  "sliding-tiles": <PuzzleThumb kind="sliding" />,
  "sokoban-mini": <PuzzleThumb kind="sokoban" />,
  "star-drift": <ArcadeStarDrift />,
  "super-hexagon": <SuperHexagon />,
  "towers-of-hanoi": <PuzzleThumb kind="hanoi" />,
  "twelve-janggi": <JanggiThumb />,
  "wall-pong": <PaddleThumb pong />,
  "wing-dash": <WingDash />,
  "xo-game-lab": <PuzzleThumb kind="xo" />,
};

export function AppletThumbnail({ id }: ThumbnailProps) {
  return (
    <div className={`applet-thumbnail thumbnail-${id}`} aria-hidden="true">
      {thumbnails[id] ?? <PuzzleThumb kind="xo" />}
    </div>
  );
}
