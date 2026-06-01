# Applet Art Direction Pass 2026-06-01

## Summary

This pass updates the rendered applet UI, not just documentation. The hub now uses a reusable `AppletThumbnail` system with per-game SVG art, the shared palette is brighter and more arcade-forward, and several board games now use more recognizable board and piece treatments.

## Hub Thumbnail System

Added `src/applets/AppletThumbnail.tsx` and wired it into `src/applets/AppletHub.tsx`.

Asset strategy: inline React SVG plus CSS styling. No generated bitmap assets or external copyrighted game art were used.

Per-game thumbnail list:

- Star Drift: ship, shots, rocks, stars.
- Sector Invaders: invader formation and cannon.
- Paddle Pop: paddle, ball path, target.
- Wall Pong: paddle, wall, ball path.
- Super Hexagon: concentric hex geometry, walls, player dot.
- Block Stack: falling tetromino-style blocks.
- Wing Dash: flyer and vertical gates.
- Neon Snake: glowing trail and pellet.
- Brick Breaker: bricks, ball, paddle.
- Twelve Janggi: wood board and 王/將 tokens.
- Nine Men's Morris: mill board and stones.
- Mini Shogi: shogi board and wedge tokens.
- Amazons Mini: queens, board, arrow shot.
- Hex: connected hex cells and target-side paths.
- Domineering: vertical and horizontal domino placements.
- Konane: black/light stones with jump arc.
- Chess: board and recognizable chess glyphs.
- XO Game Lab: X/O symbol placement.
- Lights Out: glowing tile grid.
- Sliding Tiles: numbered tile board.
- Towers of Hanoi: rods and colored disks.
- Mastermind: colored code pegs and feedback pegs.
- Peg Solitaire: pegs, empty hole, jump arrow.
- Sokoban Mini: player, crate, goal.

## Board-Game Visual Changes

- Chess keeps coordinates and uses large Unicode chess pieces on a warmer polished board.
- Twelve Janggi tokens now use traditional labels: King 王, General 將, Minister 相, Man 卒, Feudal Lord 侯. English names remain in ARIA labels, instructions, and status text.
- Mini Shogi now uses shogi-like wedge tokens with Japanese piece glyphs: 王, 金, 銀, 角, 飛, 歩, plus promoted forms 全, 馬, 龍, と. English names remain in rules/status copy.
- Nine Men's Morris has stronger mill lines and stone-like discs.
- Hex has brighter connected cells and stronger red/blue target-side presentation.
- Domineering and Konane benefit from shared stronger board/cell styling; Konane pieces now read as dark/light stones.

## Arcade Visual Changes

- Shared arcade canvas background now uses a deep navy/purple neon grid with cyan and magenta diagonal energy lines.
- Star Drift rocks now render as filled glowing asteroids, and the ship is a high-contrast cyan craft with a visible thrust flame during acceleration.
- Arcade overlays were brightened with neon scanline styling.
- Hub arcade thumbnails show actual play objects instead of generic card grids.

## Color Palette Changes

The shared palette moved away from muted brown/gray dominance toward:

- Arcade: deep navy, cyan, magenta, electric yellow.
- Board games: warmer wood, ivory, lacquer red, saturated blue.
- Puzzles: jewel-tone tiles and brighter pegs/disks.

Normal text, button contrast, and focus outlines remain readable in the checked screenshots.

## Screenshots Captured

Saved built-site screenshots under:

`qa/app-screen-checks/2026-06-01-art-pass/`

Required highlights:

- `hub.png`
- `star-drift.png`
- `star-drift-gameplay.png`
- `twelve-janggi.png`
- `chess.png`
- `mini-shogi.png`

The directory also contains one screenshot per applet route.

## Remaining Weak Visuals

- Some secondary arcade canvas games still rely on simple geometric drawing rather than more authored sprite silhouettes.
- Amazons Mini, Domineering, and several puzzle boards could use game-specific board surfaces beyond the shared square-board treatment.
- Tutorial overlays can appear during automated route screenshots if local storage is fresh; gameplay visuals are still visible in the captured Star Drift gameplay screenshot.

## Recommended Next Art Pass

- Add game-specific CSS classes for every puzzle board, especially Sliding Tiles, Sokoban Mini, and Peg Solitaire.
- Add small animated idle states for arcade thumbnails while respecting reduced-motion settings.
- Improve hand/captured-piece displays for drop games so side panels feel as themed as the boards.
- Add screenshot assertions for thumbnail count and for specific glyph presence on Twelve Janggi and Mini Shogi.

## Validation

Commands run from repo root:

- `npm ci`
- `npm run typecheck --if-present`
- `npm test --if-present`
- `npm run build`
- `npm run check:static --if-present`
- `npm run qa:screenshots --if-present`

Built preview was started for manual QA, but the in-app Browser rejected the local preview URL due to its URL policy. Visual review was completed from the built-site screenshots produced by the QA script.
