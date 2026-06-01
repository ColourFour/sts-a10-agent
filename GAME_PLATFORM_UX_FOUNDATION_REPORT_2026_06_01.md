# Game Platform UX Foundation Report - 2026-06-01

## Shared systems added

- Added `src/applets/GameUi.tsx` for tutorial overlays, keyboard hint panels, high-score display panels, and coordinate board wrappers.
- Added `src/applets/gameScoring.ts` for localStorage-backed score entries with game id, score, date, and optional settings.
- Added shared CSS for tutorial dialogs, keyboard hints, local score panels, coordinate rails, score callouts, and more arcade-like hub treatments.

## Games updated

- Super Hexagon: Space start/replay, local high score, tutorial, keyboard hints, crash marker, and delayed final-state display.
- Chess: coordinate rails, chess symbols, tutorial, and keyboard hint panel.
- Mini Shogi: coordinate rails, tutorial, keyboard hint panel, and more token-like pieces.
- Twelve Janggi: tutorial, keyboard hint panel, coordinate rails, and more connected board styling.
- Lights Out: tutorial, keyboard hints, local high score.
- Sliding Tiles, Towers of Hanoi, Mastermind, Peg Solitaire, and Sokoban Mini: local high-score panels.
- Sokoban Mini: WASD support in addition to arrow keys.
- Hub: stronger featured/section presentation and local best score callouts when scores exist.

## Keyboard controls added

- Super Hexagon: Space starts/replays; ArrowLeft/ArrowRight and A/D rotate.
- Sokoban Mini: Arrow keys and WASD move.
- Board and puzzle buttons remain keyboard focusable through native button behavior; visible hints now document Tab plus Enter/Space activation.
- Tutorial overlays close with Escape.

## Tutorial system status

- Reusable tutorial overlay supports per-game steps with title, short text, optional highlight label, dismissal, replay, and local seen-state.
- Applied to Super Hexagon, Twelve Janggi, Mini Shogi, Chess, and Lights Out.
- Current highlights are presentational labels, not target-anchored spotlights yet.

## Local high-score system status

- Local high scores store in `localStorage` under `sts2.localHighScores.v1`.
- Entries include `gameId`, `score`, ISO `date`, and optional `settings`.
- Implemented for Super Hexagon, Lights Out, Sliding Tiles, Towers of Hanoi, Mastermind, Peg Solitaire, and Sokoban Mini.
- No global leaderboard is shown or implied.
- No Supabase environment variables or config were found in the repo.

## Super Hexagon end-state fix details

- Collision now records the final score, stores a local high score, freezes the run, and marks the collision/contact point on the canvas.
- After a brief inspection moment, the idle canvas shows the final score and replay hint.
- Reset clears the run state cleanly.
- Existing isolated collision tests still pass.

## Board visual upgrades made

- Shared coordinate wrapper supports edge labels for square and compact boards.
- Chess uses a-h and 8-1 labels with proper chess glyphs.
- Mini Shogi uses A-E and 1-5 labels plus shaped tokens.
- Twelve Janggi uses A-C and 1-4 labels plus connected board lines.
- Square-grid boards now use connected surfaces instead of separated rounded tiles.

## What still looks weak

- Tutorial highlights are not yet physically anchored to board cells or controls.
- Mini Shogi and Twelve Janggi piece art is still a styled text-token pass, not final illustrated art.
- Score normalization is simple and local; puzzle scores need per-mode tuning before any global leaderboard.
- Board keyboard navigation is mostly native Tab order rather than arrow-key grid navigation.

## What should be done next

- Add target-aware tutorial spotlight positioning.
- Add arrow-key board navigation for Chess, Mini Shogi, Twelve Janggi, and square puzzle boards.
- Introduce score normalization metadata and difficulty settings before backend leaderboards.
- Wire Supabase only after project config and env vars exist.
- Continue the board-piece art pass with reusable token components and SVG assets.

## Validation

- `npm ci` passed with 0 vulnerabilities.
- `npm run typecheck --if-present` passed.
- `npm test --if-present` passed: 45 tests.
- `npm run build` passed.
- `npm run check:static --if-present` passed.
- `npm run qa:screenshots --if-present` passed and saved 17 screenshots to `qa/app-screen-checks/2026-06-01`.
- Browser smoke test passed for hub, Super Hexagon Space start/collision/local score, Chess coordinates, Mini Shogi coordinates, Lights Out tutorial/high-score UI, and hub local best callout.
