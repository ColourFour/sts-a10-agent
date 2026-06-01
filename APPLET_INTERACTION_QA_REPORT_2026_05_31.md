# Applet Interaction QA Report - 2026-05-31

## Summary

Every applet reachable from the applet selector was interaction-tested with a deterministic completion path. The new `test:interaction` suite opens the selector, verifies every registry link, opens every applet route, performs valid actions, checks at least one invalid or blocked action where applicable, reaches a completion or game-over state, resets, and verifies replay can begin.

One applet needed a functional fix: Lights Out had an unsolvable initial board. The final cell in the seed was corrected so the visible puzzle can be solved by the documented 9-move path.

No applets remain in Failing or Prototype status after this pass.

## QA Matrix

| Applet name | Route | Status | Completion path tested | Reset/replay tested | Mobile checked | Issues found | Fixes made | Remaining risks |
|---|---|---:|---|---:|---:|---|---|---|
| XO Game Lab | `/applets/xo-game-lab` | Pass | Set strip length to 2, place Red on square 1, attempt blocked adjacent Red on square 2, switch to Blue, place square 2, confirm `O wins`. | Yes | Yes | None in app logic. | Added automated completion and blocked-move coverage. | Mobile completion is covered by component-level interaction, while browser mobile check verifies route/control rendering. |
| Twelve Janggi | `/applets/twelve-janggi` | Pass | Attempt off-turn B King selection, move A Man to capture B Man, move B General, move A Man to capture B King, confirm Player A win. | Yes | Yes | Test initially queried Janggi cells as buttons, but the UI correctly exposes them as `gridcell`. | Added gridcell-aware automated test path. | Full rules depth is still covered by the existing engine tests plus this one completion path, not exhaustive move enumeration. |
| Nine Men's Morris | `/applets/nine-mens-morris` | Pass | Place a deterministic no-mill board for both players, including an occupied-point retry, finish placement with Player B blocking all Player A movement, confirm Player B win. | Yes | Yes | None in app logic. | Added automated placement, invalid occupied-click, no-move win, reset, and replay coverage. | One deterministic completion path only; capture-heavy mill sequences are not exhaustively replayed here. |
| Mini Shogi | `/applets/mini-shogi` | Pass | Attempt off-turn B King selection, move A rook to capture pawn, move B rook, move A rook to capture B King, confirm Player A win. | Yes | Yes | None in app logic. | Added automated capture-win, invalid turn, reset, and replay coverage. | Drops and promotion are not exhaustively covered by this completion path. |
| Amazons Mini | `/applets/amazons-mini` | Pass | Attempt empty initial selection, then loop through legal amazon moves and arrow shots until one player has no legal move and a winner is shown. | Yes | Yes | None in app logic. | Added automated legal-move/arrow loop, invalid empty-click, reset, and replay coverage. | Algorithmic path proves completion, but does not assert a specific named winner. |
| Hex | `/applets/hex` | Pass | Fill Player A row 4 left to right while Player B fills row 1, retry an occupied hex, confirm Player A left-right connection win. | Yes | Yes | None in app logic. | Added automated connection win, occupied-cell handling, reset, and replay coverage. | Only one connection path is covered. |
| Domineering | `/applets/domineering` | Pass | Attempt illegal non-target square, then repeatedly place the first legal domino target until a player has no placement and a winner is shown. | Yes | Yes | None in app logic. | Added automated legal placement loop, illegal-click check, reset, and replay coverage. | Algorithmic path proves end state, not optimal play. |
| Konane | `/applets/konane` | Pass | Attempt empty opening click, then repeatedly select a current-player piece with a legal jump and jump until a winner is shown. | Yes | Yes | None in app logic. | Added automated jump-completion, invalid opening click, reset, and replay coverage. | Algorithmic path proves end state, not all jump branches. |
| Chess | `/applets/chess` | Pass | Attempt off-turn Black pawn, then play Fool's Mate: f2-f3, e7-e5, g2-g4, d8-h4, confirm Black wins. | Yes | Yes | None in app logic. | Added automated checkmate, invalid turn, reset, and replay coverage. | Chess move legality remains delegated to `chess.js`; this suite covers one full checkmate path. |
| Super Hexagon | `/applets/super-hexagon` | Pass | Mock canvas and deterministic animation, start run, step frames until collision ends run, confirm Start returns with nonzero score, reset, start again. | Yes | Yes | Initial test used timestamps before `performance.now`, producing negative scores in the harness only. | Adjusted test timestamps to use the app's performance time base. | Canvas pixels are mocked in jsdom; browser route/control rendering is checked, but visual collision rendering is not pixel-compared. |
| Lights Out | `/applets/lights-out` | Fixed | Click cells 4, 5, 7, 8, 11, 13, 20, 21, 22, confirm solved in 9 moves, confirm post-solve click does not change state. | Yes | Yes | Initial board was unsolvable because the final cell was on. | Corrected the final starting cell to off and added deterministic solve coverage. | The report proves the shipped seed is solvable; it does not provide a general solver UI. |
| Sliding Tiles | `/applets/sliding-tiles` | Pass | Attempt disabled blank tile, then slide tiles 10, 11, 7, 6, 8, 2, 3, 10, 11, 7, 10, 8, 6, 10, 7, 11, 8, 7, 11, 12, confirm solved in 20 moves. | Yes | Yes | None in app logic. | Added automated tile path, disabled blank check, reset, and replay coverage. | One known solution path is covered; arbitrary scrambles are not generated. |
| Towers of Hanoi | `/applets/towers-of-hanoi` | Pass | Attempt larger-on-smaller move, reset, then execute the 15-move 4-disk solution to move all disks to peg 3. | Yes | Yes | None in app logic. | Added automated invalid move, optimal completion, reset, and replay coverage. | None beyond ordinary single-path coverage. |
| Mastermind | `/applets/mastermind` | Pass | Confirm incomplete Submit Guess is disabled, fill Green, Purple, Orange, Blue, submit, confirm solved in 1 guess. | Yes | Yes | No app bug; the incomplete-submit state is represented by a disabled primary action rather than a message. | Added automated disabled-state, solve, reset, and replay coverage. | Only the winning guess path is completed; failure after eight guesses is not covered here. |
| Peg Solitaire | `/applets/peg-solitaire` | Pass | Attempt invalid space, execute a 31-jump solution that leaves 1 peg, confirm `1 pegs - 31 moves`. | Yes | Yes | None in app logic. | Added automated invalid-space, full solution, reset, and replay coverage. | One known full solution path is covered. |
| Sokoban Mini | `/applets/sokoban-mini` | Pass | Move down once, attempt blocked down move, reset, then solve with Left, Up, Right, Right, Left, Left, Left, Up, Right, Right, confirm solved in 10 moves. | Yes | Yes | Initial invalid-move assumption was wrong in the test draft; first down move is legal. | Added correct blocked-move check after one legal step plus deterministic solve coverage. | One puzzle seed and solution are covered. |

## Automated Tests Added

- Added `src/applets/appletInteraction.test.tsx`.
- Added `npm run test:interaction`.
- Added jsdom Testing Library coverage through `@testing-library/react`, `@testing-library/user-event`, and `jsdom`.
- The suite has 17 tests:
  - 1 selector and route inventory test.
  - 16 applet-specific interaction and completion tests.
- Deterministic mocks are used for canvas, `requestAnimationFrame`, and `Math.random` where needed.

## Manual / Browser Checks Performed

- Served the production build with `npm run preview --if-present`.
- Opened the built site at `http://127.0.0.1:4173/sts-a10-agent/`, preserving the GitHub Pages base path.
- Desktop route sweep at `1280x900`:
  - Selector rendered.
  - All 16 selector links were present.
  - All 16 applet hash routes rendered the expected `h1`, visible controls, and a play area.
  - No horizontal overflow detected.
  - No console errors recorded.
- Mobile route sweep at `390x844`:
  - Selector rendered.
  - All 16 applet hash routes rendered the expected `h1`, visible controls, and a play area.
  - No horizontal overflow detected.
  - No console errors recorded.
- Selector click sweep:
  - Clicked every applet card link from the selector in the production preview.
  - Each click opened the expected applet title.
  - No console errors recorded.

## Applets Still Failing

None.

## Validation Commands

All commands were run from the repo root:

```sh
npm ci
npm run typecheck --if-present
npm test --if-present
npm run build
npm run test:interaction
npm run preview --if-present
```

Results:

- `npm ci`: passed, 0 vulnerabilities.
- `npm run typecheck --if-present`: passed.
- `npm test --if-present`: passed, 4 test files and 45 tests.
- `npm run build`: passed.
- `npm run test:interaction`: passed, 17 interaction tests.
- `npm run preview --if-present`: served production build for browser QA.

## Recommended Next Fixes

- Convert the browser route and selector click sweep into a committed browser E2E test if CI time allows.
- Add a real canvas visual assertion for Super Hexagon if the project later adopts Playwright browser tests.
- Add additional Mastermind coverage for the eight-guess loss path.
- Add extra strategy-game paths that exercise drops, promotions, mills, and captures beyond the shortest completion scripts.
