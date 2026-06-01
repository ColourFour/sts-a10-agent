# Single-Player Opponents Pass 1 Report - 2026-06-01

## Summary

This pass adds real Play vs Computer modes for four board games:

- XO Game Lab
- Hex
- Domineering
- Konane

Each supported game now offers Two Player and Play vs Computer mode controls before or during play. In solo mode the human controls the first side and the computer controls the second side. Computer turns show a visible thinking state, human interaction is disabled while the computer is moving, and reset cancels pending computer turns.

## Shared AI Architecture

Added `src/applets/boardGameOpponents.ts` as the reusable opponent layer.

It contains:

- Shared mode and difficulty types.
- Shared point, board, matrix, cloning, and random-move helpers.
- Pure legal-move helpers for Hex, Domineering, and Konane.
- Pure apply-move helpers for Hex, Domineering, and Konane.
- Computer move selectors for XO, Hex, Domineering, and Konane.
- A shared `computerThinkingDelayMs` used by the UI.

The AI selectors are pure and do not mutate input state. Random selection is isolated behind helper functions so tests can inject deterministic random behavior.

## Games Added

### XO Game Lab

Human side: X.

Computer side: O.

Difficulty:

- Easy: random legal move.
- Normal: scores legal moves by immediate wins, reducing opponent mobility, and mild positional preference.

Behavior:

- The AI uses the existing XO legal move generator and `applyMove`.
- The computer only moves when O is to move in Play vs Computer mode.
- Reset and strip-length changes cancel pending computer moves.

### Hex

Human side: Player A, left-to-right.

Computer side: Player B, top-to-bottom.

Difficulty:

- Easy: random empty cell.
- Normal: prefers center influence, own adjacency, blocking opponent adjacency, and path-direction progress.

Behavior:

- The AI selects only empty cells.
- Win detection is shared with the pure Hex helper.
- Reset cancels pending computer moves.

### Domineering

Human side: Vertical.

Computer side: Horizontal.

Difficulty:

- Easy: random legal placement.
- Normal: prefers placements that preserve own mobility and reduce opponent mobility.

Behavior:

- The AI places only legal horizontal dominoes.
- Game-over detection checks whether the next player has any legal placement.
- Reset cancels pending computer moves.

### Konane

Human side: Black.

Computer side: White.

Difficulty:

- Easy: random legal jump.
- Normal: prefers captures that preserve future mobility, limit opponent mobility, and land near the center.

Behavior:

- The AI selects only legal single-jump captures.
- Game-over detection checks whether the next player has a legal jump.
- Reset cancels pending computer moves.

## Deferred Games

Nine Men's Morris was deferred from AI support in this pass. The current page has placement, movement, mill, and removal phases in one component, and the AI would need reliable phase-aware action modeling before it is worth exposing as a user-facing solo mode.

Chess was deferred. The project already uses `chess.js`, but this pass focused on adding a reusable opponent layer and completing simpler board games first without risking the chess UI.

Twelve Janggi and Mini Shogi were deferred. They are good candidates for a later legal-move random opponent pass, but were outside the quality target after completing four simpler games.

## Tests Added

Added `src/applets/boardGameOpponents.test.ts`.

Coverage includes:

- XO AI returns only legal moves.
- XO AI returns null when no legal move exists.
- Hex AI returns only legal moves and does not mutate input.
- Hex AI returns null on full boards.
- Domineering AI returns only legal placements and does not mutate input.
- Domineering AI returns null when no placement exists.
- Konane AI returns only legal jumps and does not mutate input.
- Konane AI returns null when no jump exists.

Updated `src/applets/appletInteraction.test.tsx` with a Play vs Computer smoke test for XO:

- Selects Play vs Computer.
- Makes a human move.
- Confirms the computer thinking state.
- Confirms the computer responds.
- Resets during a pending computer turn.
- Confirms no stale computer move applies after reset.

## Built-Site QA

Manual QA was performed against the production preview built from `dist`.

Checked:

- XO Game Lab: selected Play vs Computer, made a human move, confirmed computer response, reset, confirmed no stale move.
- Hex: selected Play vs Computer, made a human move, confirmed one legal computer stone, reset, confirmed empty board.
- Domineering: selected Play vs Computer, made a vertical placement, confirmed one horizontal computer domino, reset, confirmed empty board.
- Konane: selected Play vs Computer, made a black capture, confirmed white computer capture and return to Black, reset, confirmed clean state.

## Validation Run

Commands run from repo root:

- `npm ci`
- `npm run typecheck --if-present`
- `npm test`
- `npm run build`
- `npm run check:static --if-present`
- `npm run qa:screenshots --if-present`
- `npm run test:e2e --if-present`

There is no `test:e2e` script in `package.json`, so `npm run test:e2e --if-present` exited without running an e2e suite.

## Known Weaknesses

- The AI is intentionally shallow and not strong.
- Hard difficulty was not added because the implemented games do not yet have safe shallow minimax that is worth exposing.
- Normal heuristics are mobility and position based, not strategic engines.
- Konane currently models one jump per turn, matching the existing prototype rules.
- Nine Men's Morris needs a cleaner phase/action engine before AI should be exposed.

## Recommended Next AI Pass

- Extract Nine Men's Morris into a pure phase-aware engine, then add a legal AI for placement, movement, and removal.
- Add Chess Easy and Normal using `chess.js` legal moves, material scoring, captures, and checks.
- Add Twelve Janggi and Mini Shogi random legal-move opponents if their legal move APIs remain stable.
- Add reusable React opponent-turn hook to reduce duplicated timer/cancellation code across game pages.
- Add browser-level smoke coverage for Hex, Domineering, and Konane solo mode in addition to XO.
