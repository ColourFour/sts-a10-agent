export type AppletStatus = "Playable Prototype" | "Draft" | "Planned";

export type AppletRegistryEntry = {
  id: string;
  title: string;
  description: string;
  route: string;
  status: AppletStatus;
  tags: string[];
};

export const appletsRegistry: AppletRegistryEntry[] = [
  {
    id: "xo-game-lab",
    title: "XO Game Lab",
    description:
      "A strip-placement puzzle lab for testing symbol and color adjacency constraints.",
    route: "/applets/xo-game-lab",
    status: "Playable Prototype",
    tags: ["Puzzle", "Placement", "Rules engine"],
  },
  {
    id: "twelve-janggi",
    title: "Twelve Janggi",
    description:
      "A compact two-player strategy game with captures, drops, promotion, and two win conditions.",
    route: "/applets/twelve-janggi",
    status: "Playable Prototype",
    tags: ["Strategy", "Two-player", "Rules engine"],
  },
  {
    id: "nine-mens-morris",
    title: "Nine Men's Morris",
    description:
      "A classic mill-making game with placement, movement, captures, and flying.",
    route: "/applets/nine-mens-morris",
    status: "Playable Prototype",
    tags: ["Strategy", "Two-player", "Mills"],
  },
  {
    id: "mini-shogi",
    title: "Mini Shogi",
    description:
      "A compact shogi-style game with captures, drops, promotion, and kings.",
    route: "/applets/mini-shogi",
    status: "Playable Prototype",
    tags: ["Strategy", "Drops", "Two-player"],
  },
  {
    id: "amazons-mini",
    title: "Amazons Mini",
    description:
      "Move an amazon, shoot an arrow, and shrink your opponent's space.",
    route: "/applets/amazons-mini",
    status: "Playable Prototype",
    tags: ["Area control", "Two-player", "Grid"],
  },
  {
    id: "hex",
    title: "Hex",
    description:
      "Race to connect opposite sides on a compact hex board.",
    route: "/applets/hex",
    status: "Playable Prototype",
    tags: ["Connection", "Two-player", "Abstract"],
  },
  {
    id: "domineering",
    title: "Domineering",
    description:
      "Vertical dominoes versus horizontal dominoes in a tight placement duel.",
    route: "/applets/domineering",
    status: "Playable Prototype",
    tags: ["Placement", "Two-player", "Combinatorial"],
  },
  {
    id: "konane",
    title: "Konane",
    description:
      "A compact Hawaiian checkers-inspired jump-capture prototype.",
    route: "/applets/konane",
    status: "Playable Prototype",
    tags: ["Capture", "Two-player", "Puzzle"],
  },
  {
    id: "chess",
    title: "Chess",
    description:
      "Standard chess with legal moves enforced by chess.js.",
    route: "/applets/chess",
    status: "Playable Prototype",
    tags: ["Classic", "Two-player", "Rules library"],
  },
  {
    id: "super-hexagon",
    title: "Super Hexagon",
    description:
      "A single-player reflex applet where collapsing walls test your timing.",
    route: "/applets/super-hexagon",
    status: "Playable Prototype",
    tags: ["Arcade", "Single-player", "Canvas"],
  },
  {
    id: "lights-out",
    title: "Lights Out",
    description:
      "Flip cross-shaped neighborhoods until every light on the grid is off.",
    route: "/applets/lights-out",
    status: "Playable Prototype",
    tags: ["Puzzle", "Single-player", "Logic"],
  },
  {
    id: "sliding-tiles",
    title: "Sliding Tiles",
    description:
      "Reorder a scrambled 4 by 4 tile board by sliding tiles into the blank space.",
    route: "/applets/sliding-tiles",
    status: "Playable Prototype",
    tags: ["Puzzle", "Single-player", "Permutation"],
  },
  {
    id: "towers-of-hanoi",
    title: "Towers of Hanoi",
    description:
      "Move a full disk stack across three pegs without placing larger disks on smaller ones.",
    route: "/applets/towers-of-hanoi",
    status: "Playable Prototype",
    tags: ["Puzzle", "Single-player", "Planning"],
  },
  {
    id: "mastermind",
    title: "Mastermind",
    description:
      "Deduce a hidden color code from exact and color-only feedback.",
    route: "/applets/mastermind",
    status: "Playable Prototype",
    tags: ["Deduction", "Single-player", "Logic"],
  },
  {
    id: "peg-solitaire",
    title: "Peg Solitaire",
    description:
      "Jump pegs over one another and reduce the board to a single remaining peg.",
    route: "/applets/peg-solitaire",
    status: "Playable Prototype",
    tags: ["Puzzle", "Single-player", "Jumping"],
  },
  {
    id: "sokoban-mini",
    title: "Sokoban Mini",
    description:
      "Push crates onto goal squares without trapping them against walls.",
    route: "/applets/sokoban-mini",
    status: "Playable Prototype",
    tags: ["Spatial", "Single-player", "Problem solving"],
  },
];
