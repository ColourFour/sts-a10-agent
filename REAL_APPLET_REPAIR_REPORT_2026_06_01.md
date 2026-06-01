# Real Applet Repair Report - 2026-06-01

## What Was Still Broken

The previous work improved source files and added interaction tests, but it was applied in `/Users/sbrooker/Documents/StS2-A10-Auto` instead of the checkout connected to `git@github.com:ColourFour/sts-a10-agent.git`. The correct repository, `/Users/sbrooker/repos/sts2-a10-agent`, therefore had no applet UI changes to commit or deploy.

The repair also hardens the GitHub Pages build by using relative production asset paths through `base: "./"`, so CSS and JavaScript load from the project subpath instead of relying on root-absolute asset URLs.

The UI also still read too much like a generic card index. The hub opened, but it did not have enough arcade identity, featured treatment, or sectioning. Individual game pages were readable but visually repetitive. Super Hexagon collision was embedded in component state and only tested indirectly.

## Why The Previous Verification Was Insufficient

Opening routes and passing a build does not prove that the built static site is visually correct or playable on GitHub Pages. The missing checks were:

- Built `dist/index.html` asset path inspection.
- Built-site screenshots.
- GitHub Pages-style subpath verification.
- Repeatable screenshot capture.
- Focused collision math tests for Super Hexagon.
- Confirmation that the modified files are in the checkout connected to the deployment remote.

## Screenshots Captured

Built-site screenshots were captured with `npm run qa:screenshots` and saved in:

```text
qa/app-screen-checks/2026-06-01/
```

Files:

- `hub.png`
- `xo-game-lab.png`
- `twelve-janggi.png`
- `nine-mens-morris.png`
- `mini-shogi.png`
- `amazons-mini.png`
- `hex.png`
- `domineering.png`
- `konane.png`
- `chess.png`
- `super-hexagon.png`
- `lights-out.png`
- `sliding-tiles.png`
- `towers-of-hanoi.png`
- `mastermind.png`
- `peg-solitaire.png`
- `sokoban-mini.png`

## Hub UI Changes

- Renamed the launcher hero to `Strategy Lab Arcade`.
- Added a stronger arcade-style hero panel with a play sign, board preview, badges, and darker visual hierarchy.
- Added featured cabinets for Twelve Janggi, Super Hexagon, and Lights Out.
- Grouped the catalog into Strategy tables, Puzzle benches, and Arcade cabinet sections.
- Reduced the dominance of repeated `Playable Prototype` labels by using category/featured labels on cards.
- Enlarged applet visual previews and made cards feel more like clickable game cabinets.
- Kept the mobile layout deliberate with single-column featured cards and non-overflowing applet sections.

## Per-Applet UI Changes

- Added per-game theme classes to applet shells.
- Added stronger themed headers with accent treatments and visual backplates.
- Strengthened board, rules, and status panels with game-specific accent colors.
- Improved visual contrast and click affordance on the hub and game pages.
- Kept reset/replay controls visible in the side/status panels.
- Preserved existing game rules and focused the pass on visible UI, static loading, and Super Hexagon collision behavior.

## Super Hexagon Collision Root Cause

The collision logic was embedded inside the React effect and tested only through one indirect applet interaction flow. It used a single sector check against the player's center angle and did not account for the visible width of the player triangle. That meant edge cases around wall gaps and angle wraparound could disagree with what the player visibly saw.

## Super Hexagon Collision Fix

- Extracted collision math into `src/applets/classic-games/superHexagonMath.ts`.
- Added explicit radial overlap checks for the wall stroke against the player radius band.
- Added angular gap checks that sample the left edge, center, and right edge of the player triangle.
- Preserved shared canvas rotation behavior while making collision logic deterministic and testable.
- Added `src/applets/classic-games/superHexagonMath.test.ts` with tests for:
  - No collision while fully inside a gap.
  - Collision when overlapping a wall segment at player radius.
  - Angle wraparound near `0` / `2π`.
  - Empty wall state after reset.
  - Radial overlap gating.

## Interaction QA Matrix

| Applet | Route | Screenshot path | Interaction path tested | Completion/reset tested | Status | Remaining issue |
|---|---|---|---|---|---:|---|
| Hub | `#/applets` | `qa/app-screen-checks/2026-06-01/hub.png` | Built screenshot script loaded launcher, verified 16+ cards and CSS. Browser subpath sweep clicked every card in prior audit. | N/A | Pass | Remote Pages still needs post-push confirmation. |
| XO Game Lab | `#/applets/xo-game-lab` | `qa/app-screen-checks/2026-06-01/xo-game-lab.png` | Automated interaction sets strip length, plays a valid move, tries a blocked same-color adjacency, switches color, reaches `O wins`. | Yes | Pass | None known. |
| Twelve Janggi | `#/applets/twelve-janggi` | `qa/app-screen-checks/2026-06-01/twelve-janggi.png` | Automated interaction rejects off-turn selection, captures B Man, moves B General, captures B King. | Yes | Pass | Deeper drop/promotion branches are not exhaustively covered by this pass. |
| Nine Men's Morris | `#/applets/nine-mens-morris` | `qa/app-screen-checks/2026-06-01/nine-mens-morris.png` | Automated placement path includes occupied-point retry and ends with a no-move win. | Yes | Pass | Capture-heavy mill paths remain future coverage. |
| Mini Shogi | `#/applets/mini-shogi` | `qa/app-screen-checks/2026-06-01/mini-shogi.png` | Automated interaction rejects off-turn selection and captures the opposing King. | Yes | Pass | Drops/promotion not exhaustively covered. |
| Amazons Mini | `#/applets/amazons-mini` | `qa/app-screen-checks/2026-06-01/amazons-mini.png` | Automated loop selects legal amazons, moves, shoots arrows, and reaches a winner. | Yes | Pass | Winner is algorithmic rather than a fixed named player. |
| Hex | `#/applets/hex` | `qa/app-screen-checks/2026-06-01/hex.png` | Automated path places an A left-right connection while testing an occupied-cell retry. | Yes | Pass | One connection line covered. |
| Domineering | `#/applets/domineering` | `qa/app-screen-checks/2026-06-01/domineering.png` | Automated path tries an illegal square, then places legal dominoes until a winner appears. | Yes | Pass | Optimal-play branches not covered. |
| Konane | `#/applets/konane` | `qa/app-screen-checks/2026-06-01/konane.png` | Automated path tries an empty opening click, then jumps until a winner appears. | Yes | Pass | Not all jump branches covered. |
| Chess | `#/applets/chess` | `qa/app-screen-checks/2026-06-01/chess.png` | Automated path rejects off-turn Black pawn and plays Fool's Mate to Black win. | Yes | Pass | Full chess coverage remains delegated to `chess.js`. |
| Super Hexagon | `#/applets/super-hexagon` | `qa/app-screen-checks/2026-06-01/super-hexagon.png` | Automated interaction starts run, deterministic frames trigger collision, reset clears score/running state, replay starts. Unit tests cover collision math. | Yes | Fixed | Browser canvas pixel comparison is still not automated. |
| Lights Out | `#/applets/lights-out` | `qa/app-screen-checks/2026-06-01/lights-out.png` | Automated solve clicks the 9-cell solution and confirms post-solve clicks do not mutate state. | Yes | Pass | None known. |
| Sliding Tiles | `#/applets/sliding-tiles` | `qa/app-screen-checks/2026-06-01/sliding-tiles.png` | Automated path rejects blank tile and completes a 20-move solution. | Yes | Pass | One seed/solution path covered. |
| Towers of Hanoi | `#/applets/towers-of-hanoi` | `qa/app-screen-checks/2026-06-01/towers-of-hanoi.png` | Automated path rejects larger-on-smaller, then completes the 15-move solution. | Yes | Pass | None known. |
| Mastermind | `#/applets/mastermind` | `qa/app-screen-checks/2026-06-01/mastermind.png` | Automated path confirms incomplete submit is disabled, fills the secret code, and solves in one guess. | Yes | Pass | Loss path after eight guesses not covered. |
| Peg Solitaire | `#/applets/peg-solitaire` | `qa/app-screen-checks/2026-06-01/peg-solitaire.png` | Automated path rejects invalid space and completes a 31-jump one-peg solution. | Yes | Pass | One known solution path covered. |
| Sokoban Mini | `#/applets/sokoban-mini` | `qa/app-screen-checks/2026-06-01/sokoban-mini.png` | Automated path makes one legal move, tests a blocked move, resets, then solves in 10 moves. | Yes | Pass | One puzzle seed covered. |

## Built-Site Verification Details

- `dist/index.html` now references CSS and JavaScript via `./assets/...`.
- `npm run check:static` verifies relative asset paths, existing assets, bundled applet routes, and expected CSS selectors.
- `npm run qa:screenshots` serves the built `dist` output under `/sts-a10-agent/` and captures every required screenshot from that built site.
- The GitHub Pages subpath simulator verifies that the same built output loads from `/sts-a10-agent/`.

## Remaining Risks

- The screenshot script uses local Google Chrome via `playwright-core`; another machine needs Chrome at `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` or the script should be adjusted for that browser path.
- The remote GitHub Pages URL still needs a post-push check after the deploy workflow publishes this corrected repository.
- Super Hexagon has deterministic collision unit coverage, but no automated pixel-level canvas collision visualization test.
- Several strategy games are covered by one meaningful completion path, not exhaustive game-tree coverage.
