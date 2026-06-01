/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";
import { appletsRegistry } from "./appletsRegistry";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const routeTitles = new Map(
  appletsRegistry.map((applet) => [applet.route, applet.title]),
);

type TestUser = ReturnType<typeof userEvent.setup>;

function renderRoute(route: string) {
  window.location.hash = route;
  return render(<App />);
}

function getButtons(selector: string): HTMLButtonElement[] {
  return Array.from(document.querySelectorAll<HTMLButtonElement>(selector));
}

function getButton(selector: string, index: number): HTMLButtonElement {
  const button = getButtons(selector)[index];
  expect(button, `${selector} index ${index}`).toBeTruthy();
  return button;
}

async function clickBoardIndex(user: TestUser, selector: string, index: number) {
  await user.click(getButton(selector, index));
}

async function clickPeg(user: TestUser, pegIndex: number) {
  await user.click(screen.getByRole("button", { name: `Hanoi peg ${pegIndex + 1}` }));
}

async function clickHanoiMove(user: TestUser, from: number, to: number) {
  await clickPeg(user, from);
  await clickPeg(user, to);
}

async function clickMorrisPoint(user: TestUser, point: string) {
  await user.click(screen.getByRole("button", { name: `Morris point ${point}` }));
}

async function clickJanggiCell(user: TestUser, name: string | RegExp) {
  await user.click(screen.getByRole("gridcell", { name }));
}

function hasText(text: string): boolean {
  return document.body.textContent?.includes(text) ?? false;
}

function installCanvasMock() {
  const context = {
    arc: vi.fn(),
    beginPath: vi.fn(),
    clearRect: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    fillRect: vi.fn(),
    fillText: vi.fn(),
    lineTo: vi.fn(),
    moveTo: vi.fn(),
    restore: vi.fn(),
    rotate: vi.fn(),
    save: vi.fn(),
    stroke: vi.fn(),
    translate: vi.fn(),
  };

  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    context as unknown as CanvasRenderingContext2D,
  );
}

beforeEach(() => {
  installCanvasMock();
  window.location.hash = "";
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("applet selector and routes", () => {
  it("exposes every registry applet as a selector link and opens each hash route", async () => {
    renderRoute("/applets");

    appletsRegistry.forEach((applet) => {
      const link = document.querySelector<HTMLAnchorElement>(
        `a[href="#${applet.route}"]`,
      );
      expect(link, `${applet.title} selector link`).toBeTruthy();
      expect(link?.textContent).toContain(applet.title);
    });

    for (const applet of appletsRegistry) {
      cleanup();
      renderRoute(applet.route);
      expect(
        await screen.findByRole("heading", { name: applet.title, level: 1 }),
      ).toBeTruthy();
      expect(screen.getByRole("link", { name: /Back to Applets/i })).toBeTruthy();
    }
  });
});

describe("applet completion flows", () => {
  it("completes XO Game Lab, handles a blocked move, resets, and replays", async () => {
    const user = userEvent.setup();
    renderRoute("/applets/xo-game-lab");

    const stripInput = screen.getByLabelText(/Strip lengths/i);
    fireEvent.change(stripInput, { target: { value: "2" } });
    fireEvent.blur(stripInput);

    await user.click(screen.getByRole("button", { name: /Blank square 1 on strip 1/i }));
    await user.click(screen.getByRole("button", { name: /Blank square 2 on strip 1/i }));
    expect(hasText("Move blocked")).toBe(true);

    await user.click(screen.getByRole("button", { name: "Blue" }));
    await user.click(screen.getByRole("button", { name: /Blank square 2 on strip 1/i }));
    expect(await screen.findByRole("heading", { name: "O wins" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /Reset/i }));
    expect(screen.getByRole("heading", { name: "X to move" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /Blank square 1 on strip 1/i }));
    expect(screen.getByRole("heading", { name: "O to move" })).toBeTruthy();
  });

  it("completes Twelve Janggi by capturing the King, rejects an off-turn piece, resets, and replays", async () => {
    const user = userEvent.setup();
    renderRoute("/applets/twelve-janggi");

    await clickJanggiCell(user, "King for Player B");
    expect(hasText("It is Player A's turn.")).toBe(true);

    await clickJanggiCell(user, "Man for Player A");
    await clickJanggiCell(user, "Man for Player B");
    await clickJanggiCell(user, "General for Player B");
    await clickJanggiCell(user, /Empty square row 2, column 3/i);
    await clickJanggiCell(user, "Man for Player A");
    await clickJanggiCell(user, "King for Player B");
    expect(await screen.findByRole("heading", { name: "Player A wins" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /Reset/i }));
    expect(screen.getByRole("heading", { name: "Player A to move" })).toBeTruthy();
    await clickJanggiCell(user, "Man for Player A");
    expect(hasText("Choose a highlighted square")).toBe(true);
  });

  it("completes Nine Men's Morris with a no-move win, rejects an occupied point, resets, and replays", async () => {
    const user = userEvent.setup();
    renderRoute("/applets/nine-mens-morris");

    const aPlacements = [
      "2:2",
      "2:4",
      "3:2",
      "3:4",
      "4:3",
      "5:1",
      "5:3",
      "6:0",
      "6:6",
    ];
    const bPlacements = [
      "2:3",
      "3:0",
      "3:1",
      "3:5",
      "3:6",
      "4:2",
      "4:4",
      "5:5",
      "6:3",
    ];

    await clickMorrisPoint(user, aPlacements[0]);
    await clickMorrisPoint(user, aPlacements[0]);
    expect(screen.getByRole("heading", { name: "Player B" })).toBeTruthy();
    await clickMorrisPoint(user, bPlacements[0]);

    for (let index = 1; index < aPlacements.length; index += 1) {
      await clickMorrisPoint(user, aPlacements[index]);
      await clickMorrisPoint(user, bPlacements[index]);
    }

    expect(await screen.findByRole("heading", { name: "Player B wins" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /Reset/i }));
    expect(screen.getByRole("heading", { name: "Player A" })).toBeTruthy();
    await clickMorrisPoint(user, "2:2");
    expect(screen.getByRole("heading", { name: "Player B" })).toBeTruthy();
  });

  it("completes Mini Shogi by capturing the King, rejects an off-turn piece, resets, and replays", async () => {
    const user = userEvent.setup();
    renderRoute("/applets/mini-shogi");

    await clickBoardIndex(user, ".shogi-board .mini-cell", 4);
    expect(hasText("Select one of Player A's pieces")).toBe(true);

    await clickBoardIndex(user, ".shogi-board .mini-cell", 24);
    await clickBoardIndex(user, ".shogi-board .mini-cell", 9);
    await clickBoardIndex(user, ".shogi-board .mini-cell", 0);
    await clickBoardIndex(user, ".shogi-board .mini-cell", 5);
    await clickBoardIndex(user, ".shogi-board .mini-cell", 9);
    await clickBoardIndex(user, ".shogi-board .mini-cell", 4);
    expect(await screen.findByRole("heading", { name: "Player A wins" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /Reset/i }));
    expect(screen.getByRole("heading", { name: "Player A to move" })).toBeTruthy();
    await clickBoardIndex(user, ".shogi-board .mini-cell", 24);
    expect(hasText("Choose a highlighted square")).toBe(true);
  });

  it("completes Amazons Mini with legal move and arrow turns, ignores an empty initial click, resets, and replays", async () => {
    const user = userEvent.setup();
    renderRoute("/applets/amazons-mini");

    await clickBoardIndex(user, ".compact-board .mini-cell", 14);
    expect(screen.getByRole("heading", { name: "Player A: select" })).toBeTruthy();

    for (let turn = 0; turn < 80 && !hasText("wins"); turn += 1) {
      const owner = hasText("Player A:") ? "A" : "B";
      const pieces = getButtons(`.compact-board .mini-cell.owner-${owner}`);
      let moved = false;

      for (const piece of pieces) {
        await user.click(piece);
        const moveTarget = document.querySelector<HTMLButtonElement>(
          ".compact-board .mini-cell.legal-target",
        );
        if (!moveTarget) {
          continue;
        }
        await user.click(moveTarget);
        const arrowTarget = document.querySelector<HTMLButtonElement>(
          ".compact-board .mini-cell.legal-target",
        );
        expect(arrowTarget).toBeTruthy();
        await user.click(arrowTarget!);
        moved = true;
        break;
      }

      expect(moved).toBe(true);
    }

    expect(hasText("wins")).toBe(true);
    await user.click(screen.getByRole("button", { name: /Reset/i }));
    expect(screen.getByRole("heading", { name: "Player A: select" })).toBeTruthy();
    await clickBoardIndex(user, ".compact-board .mini-cell", 31);
    expect(hasText("Move to a highlighted square")).toBe(true);
  });

  it("completes Hex with a left-to-right path, ignores an occupied replay, resets, and replays", async () => {
    const user = userEvent.setup();
    renderRoute("/applets/hex");

    const moves = [
      "Hex 4, 1",
      "Hex 1, 1",
      "Hex 4, 2",
      "Hex 1, 2",
      "Hex 4, 3",
      "Hex 1, 3",
      "Hex 4, 4",
      "Hex 1, 4",
      "Hex 4, 5",
      "Hex 1, 5",
      "Hex 4, 6",
      "Hex 1, 6",
      "Hex 4, 7",
    ];

    await user.click(screen.getByRole("button", { name: moves[0] }));
    await user.click(screen.getByRole("button", { name: moves[0] }));
    expect(screen.getByRole("heading", { name: "Player B to place" })).toBeTruthy();
    for (const move of moves.slice(1)) {
      await user.click(screen.getByRole("button", { name: move }));
    }
    expect(await screen.findByRole("heading", { name: "Player A wins" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /Reset/i }));
    expect(screen.getByRole("heading", { name: "Player A to place" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Hex 4, 1" }));
    expect(screen.getByRole("heading", { name: "Player B to place" })).toBeTruthy();
  });

  it("completes Domineering through legal placements, rejects an illegal start square, resets, and replays", async () => {
    const user = userEvent.setup();
    renderRoute("/applets/domineering");

    await clickBoardIndex(user, ".compact-board .mini-cell", 30);
    expect(screen.getByRole("heading", { name: "Vertical to place" })).toBeTruthy();

    for (let turn = 0; turn < 40 && !hasText("wins"); turn += 1) {
      const target = document.querySelector<HTMLButtonElement>(
        ".compact-board .mini-cell.legal-target",
      );
      expect(target).toBeTruthy();
      await user.click(target!);
    }

    expect(hasText("wins")).toBe(true);
    await user.click(screen.getByRole("button", { name: /Reset/i }));
    expect(screen.getByRole("heading", { name: "Vertical to place" })).toBeTruthy();
    await user.click(document.querySelector<HTMLButtonElement>(".compact-board .mini-cell.legal-target")!);
    expect(screen.getByRole("heading", { name: "Horizontal to place" })).toBeTruthy();
  });

  it("completes Konane through legal jumps, ignores an empty opening click, resets, and replays", async () => {
    const user = userEvent.setup();
    renderRoute("/applets/konane");

    await clickBoardIndex(user, ".konane", 14);
    expect(screen.getByRole("heading", { name: "Black to jump" })).toBeTruthy();

    for (let turn = 0; turn < 40 && !hasText("wins"); turn += 1) {
      const owner = hasText("Black to jump") ? "B" : "W";
      const pieces = getButtons(`.konane.owner-${owner}`);
      let moved = false;

      for (const piece of pieces) {
        await user.click(piece);
        const target = document.querySelector<HTMLButtonElement>(".konane.legal-target");
        if (!target) {
          continue;
        }
        await user.click(target);
        moved = true;
        break;
      }

      expect(moved).toBe(true);
    }

    expect(hasText("wins")).toBe(true);
    await user.click(screen.getByRole("button", { name: /Reset/i }));
    expect(screen.getByRole("heading", { name: "Black to jump" })).toBeTruthy();
    await clickBoardIndex(user, ".konane", 2);
    expect(document.querySelector(".konane.legal-target")).toBeTruthy();
  });

  it("completes Chess by Fool's Mate, rejects an off-turn piece, resets, and replays", async () => {
    const user = userEvent.setup();
    renderRoute("/applets/chess");

    await user.click(screen.getByRole("button", { name: /e7: Black Pawn/i }));
    expect(screen.getByRole("heading", { name: "White to move" })).toBeTruthy();

    for (const square of [
      "f2: White Pawn",
      "f3: empty",
      "e7: Black Pawn",
      "e5: empty",
      "g2: White Pawn",
      "g4: empty",
      "d8: Black Queen",
      "h4: empty",
    ]) {
      await user.click(screen.getByRole("button", { name: square }));
    }

    expect(await screen.findByRole("heading", { name: "Black wins" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /Reset/i }));
    expect(screen.getByRole("heading", { name: "White to move" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /e2: White Pawn/i }));
    expect(hasText("White P selected")).toBe(true);
  });

  it("completes a Super Hexagon run by collision, starts, resets, and can start again", async () => {
    const user = userEvent.setup();
    let rafCallback: FrameRequestCallback | null = null;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      rafCallback = callback;
      return 1;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
    vi.spyOn(Math, "random").mockReturnValue(0.5);

    renderRoute("/applets/super-hexagon");
    await user.click(screen.getByRole("button", { name: /Start/i }));
    expect(screen.getByRole("button", { name: /Pause/i })).toBeTruthy();

    const startTime = performance.now();
    for (let time = 100; time <= 12000 && screen.queryByRole("button", { name: /Pause/i }); time += 100) {
      await act(async () => {
        rafCallback?.(startTime + time);
      });
    }

    expect(screen.getByRole("button", { name: /Start/i })).toBeTruthy();
    expect(hasText("Score 0 / Best 0")).toBe(false);
    await user.click(screen.getByRole("button", { name: /Reset/i }));
    expect(hasText("Score 0 / Best")).toBe(true);
    await user.click(screen.getByRole("button", { name: /Start/i }));
    expect(screen.getByRole("button", { name: /Pause/i })).toBeTruthy();
  });

  it("completes Lights Out, ignores post-solve clicks, resets, and replays", async () => {
    const user = userEvent.setup();
    renderRoute("/applets/lights-out");

    for (const index of [4, 5, 7, 8, 11, 13, 20, 21, 22]) {
      await clickBoardIndex(user, ".lights-cell", index);
    }
    expect(await screen.findByRole("heading", { name: "Solved in 9 moves" })).toBeTruthy();

    await clickBoardIndex(user, ".lights-cell", 0);
    expect(screen.getByRole("heading", { name: "Solved in 9 moves" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /Reset/i }));
    expect(screen.getByRole("heading", { name: "0 moves" })).toBeTruthy();
    await clickBoardIndex(user, ".lights-cell", 0);
    expect(screen.getByRole("heading", { name: "1 moves" })).toBeTruthy();
  });

  it("completes Sliding Tiles, rejects the blank tile, resets, and replays", async () => {
    const user = userEvent.setup();
    renderRoute("/applets/sliding-tiles");

    await user.click(screen.getByRole("button", { name: /Empty sliding tile space/i }));
    expect(screen.getByRole("heading", { name: "0 moves" })).toBeTruthy();

    for (const tile of [10, 11, 7, 6, 8, 2, 3, 10, 11, 7, 10, 8, 6, 10, 7, 11, 8, 7, 11, 12]) {
      await user.click(screen.getByRole("button", { name: `Tile ${tile}` }));
    }

    expect(await screen.findByRole("heading", { name: "Solved in 20 moves" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /Reset/i }));
    expect(screen.getByRole("heading", { name: "0 moves" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Tile 10" }));
    expect(screen.getByRole("heading", { name: "1 moves" })).toBeTruthy();
  });

  it("completes Towers of Hanoi, rejects a larger-on-smaller move, resets, and replays", async () => {
    const user = userEvent.setup();
    renderRoute("/applets/towers-of-hanoi");

    await clickHanoiMove(user, 0, 1);
    await clickHanoiMove(user, 0, 1);
    expect(hasText("A larger disk cannot be placed on a smaller disk.")).toBe(true);
    await user.click(screen.getByRole("button", { name: /Reset/i }));

    for (const [from, to] of [
      [0, 1],
      [0, 2],
      [1, 2],
      [0, 1],
      [2, 0],
      [2, 1],
      [0, 1],
      [0, 2],
      [1, 2],
      [1, 0],
      [2, 0],
      [1, 2],
      [0, 1],
      [0, 2],
      [1, 2],
    ]) {
      await clickHanoiMove(user, from, to);
    }

    expect(await screen.findByRole("heading", { name: "Solved in 15 moves" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /Reset/i }));
    expect(screen.getByRole("heading", { name: "0 moves" })).toBeTruthy();
    await clickHanoiMove(user, 0, 1);
    expect(screen.getByRole("heading", { name: "1 moves" })).toBeTruthy();
  });

  it("completes Mastermind, blocks incomplete submission, resets, and replays", async () => {
    const user = userEvent.setup();
    renderRoute("/applets/mastermind");

    expect(screen.getByRole<HTMLButtonElement>("button", { name: /Submit Guess/i }).disabled).toBe(true);
    await user.click(screen.getByRole("button", { name: "Set slot 1 to Red" }));
    expect(screen.getByRole<HTMLButtonElement>("button", { name: /Submit Guess/i }).disabled).toBe(true);

    for (const [color, slot] of [
      ["Green", 1],
      ["Purple", 2],
      ["Orange", 3],
      ["Blue", 4],
    ] as const) {
      await user.click(screen.getByRole("button", { name: `Choose ${color}` }));
      await user.click(screen.getByRole("button", { name: `Set slot ${slot} to ${color}` }));
    }
    await user.click(screen.getByRole("button", { name: /Submit Guess/i }));
    expect(await screen.findByRole("heading", { name: "1 guesses" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /Reset/i }));
    expect(screen.getByRole("heading", { name: "8 guesses left" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Choose Red" }));
    await user.click(screen.getByRole("button", { name: "Set slot 1 to Red" }));
    expect(hasText("8 guesses left")).toBe(true);
  });

  it("completes Peg Solitaire, ignores invalid spaces, resets, and replays", async () => {
    const user = userEvent.setup();
    renderRoute("/applets/peg-solitaire");

    await clickBoardIndex(user, ".peg-cell", 0);
    expect(screen.getByRole("heading", { name: "32 pegs - 0 moves" })).toBeTruthy();

    for (const [[fromRow, fromCol], [toRow, toCol]] of [
      [[1, 3], [3, 3]],
      [[2, 1], [2, 3]],
      [[0, 2], [2, 2]],
      [[3, 3], [1, 3]],
      [[3, 1], [3, 3]],
      [[0, 3], [2, 3]],
      [[5, 2], [3, 2]],
      [[3, 3], [3, 1]],
      [[3, 0], [3, 2]],
      [[4, 0], [4, 2]],
      [[2, 3], [2, 1]],
      [[2, 5], [2, 3]],
      [[0, 4], [2, 4]],
      [[2, 0], [2, 2]],
      [[2, 3], [2, 5]],
      [[2, 6], [2, 4]],
      [[3, 4], [1, 4]],
      [[3, 6], [3, 4]],
      [[4, 4], [2, 4]],
      [[1, 4], [3, 4]],
      [[4, 6], [4, 4]],
      [[4, 3], [4, 5]],
      [[6, 4], [4, 4]],
      [[3, 4], [5, 4]],
      [[6, 2], [6, 4]],
      [[6, 4], [4, 4]],
      [[4, 5], [4, 3]],
      [[4, 3], [4, 1]],
      [[2, 2], [4, 2]],
      [[4, 1], [4, 3]],
      [[5, 3], [3, 3]],
    ] as const) {
      await clickBoardIndex(user, ".peg-cell", fromRow * 7 + fromCol);
      await clickBoardIndex(user, ".peg-cell", toRow * 7 + toCol);
    }

    expect(await screen.findByRole("heading", { name: "1 pegs - 31 moves" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /Reset/i }));
    expect(screen.getByRole("heading", { name: "32 pegs - 0 moves" })).toBeTruthy();
    await clickBoardIndex(user, ".peg-cell", 10);
    expect(document.querySelector(".peg-cell.legal-target")).toBeTruthy();
  });

  it("completes Sokoban Mini, rejects blocked movement, resets, and replays", async () => {
    const user = userEvent.setup();
    renderRoute("/applets/sokoban-mini");

    await user.click(screen.getByRole("button", { name: "Move down" }));
    expect(screen.getByRole("heading", { name: "1 moves" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Move down" }));
    expect(screen.getByRole("heading", { name: "1 moves" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /Reset/i }));
    expect(screen.getByRole("heading", { name: "0 moves" })).toBeTruthy();

    for (const label of [
      "Move left",
      "Move up",
      "Move right",
      "Move right",
      "Move left",
      "Move left",
      "Move left",
      "Move up",
      "Move right",
      "Move right",
    ]) {
      await user.click(screen.getByRole("button", { name: label }));
    }

    expect(await screen.findByRole("heading", { name: "Solved in 10 moves" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /Reset/i }));
    expect(screen.getByRole("heading", { name: "0 moves" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Move left" }));
    expect(screen.getByRole("heading", { name: "1 moves" })).toBeTruthy();
  });
});
