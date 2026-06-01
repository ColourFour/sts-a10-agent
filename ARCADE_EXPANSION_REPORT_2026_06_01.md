# Arcade Expansion Report - 2026-06-01

## New games added

- Block Stack: falling block row-clear score attack.
- Wing Dash: tap-to-fly gate timing run.
- Neon Snake: growing trail collection game.
- Brick Breaker: paddle-and-ball brick clearing game.
- Star Drift: Asteroids-style thrust, wrap, and shooting run.
- Sector Invaders: Space Invaders-style lower-line defense shooter.
- Paddle Pop: paddle catch-and-rebound target breaker.
- Wall Pong: single-player Pong wall rally.

## Routes added

- `#/applets/block-stack`
- `#/applets/wing-dash`
- `#/applets/neon-snake`
- `#/applets/brick-breaker`
- `#/applets/star-drift`
- `#/applets/sector-invaders`
- `#/applets/paddle-pop`
- `#/applets/wall-pong`

## Hub changes made

- Added applet registry entries and hub cards for eight new arcade games total.
- Moved the arcade cabinet section ahead of strategy and puzzle sections.
- Expanded the arcade section to include Super Hexagon plus the new games.
- Updated featured cards to highlight the newest arcade games.
- Added keyboard/reflex/score-attack tags and short arcade descriptions.

## Shared helpers/components created

- Added `src/applets/arcade-games/ArcadeGamePages.tsx`.
- Added a small local arcade shell, canvas frame, status HUD, touch control pad, keyboard input hook, and high-score hook inside that module.
- Reused existing tutorial, keyboard hint, and local high-score components from the previous UX foundation pass.

## Keyboard controls

- Block Stack: Space starts/replays, A/D or Left/Right moves, W/Up rotates, S/Down soft drops.
- Wing Dash: Space, W, or Up starts/flaps.
- Neon Snake: Space starts/pauses/replays, arrows or WASD turn.
- Brick Breaker: Space starts/replays, A/D or Left/Right moves the paddle.
- Star Drift: Space starts/fires, A/D or Left/Right rotates, W/Up thrusts.
- Sector Invaders: Space starts/fires, A/D or Left/Right moves.
- Paddle Pop: Space starts/replays, A/D or Left/Right moves the paddle.
- Wall Pong: Space starts/replays, W/S or Up/Down moves the paddle.

## Tutorial coverage

- Every new game has a three-step tutorial using the existing tutorial overlay.
- Tutorials explain start, controls, scoring objective, and failure condition.
- Tutorials are dismissible, replayable, and locally marked as seen.

## Scoring and local high scores

- All eight new games have live scoring.
- All eight new games record local-only high scores through `src/applets/gameScoring.ts`.
- Scores are clearly shown through the existing local best/high-score panel.
- No global leaderboard, backend, Supabase, Firebase, auth, or serverless dependency was added.

## Built-site QA performed

- Ran `npm ci`.
- Ran `npm run typecheck --if-present`.
- Ran `npm test --if-present`.
- Ran `npm run build`.
- Ran `npm run check:static --if-present`; static route validation now covers 24 applet routes.
- Ran `npm run qa:screenshots --if-present`; 25 screenshots were saved.
- Ran `npm run test:e2e --if-present`; no e2e script is currently defined.
- Served the built app with Vite preview and used browser automation to open the hub and the new game routes.
- Confirmed the hub links/cards for the new arcade games render.
- Confirmed Space start and keyboard input for the new games.
- Observed game-over/local-score paths for Wing Dash, Neon Snake, and Brick Breaker.
- Confirmed Block Stack starts, accepts keyboard movement/rotation/drop input, and can reset/replay.
- Confirmed Star Drift and Sector Invaders load, start with Space, accept keyboard controls, and display scoring HUDs.
- Observed game-over/local-score paths for Paddle Pop and Wall Pong.
- Checked for browser error overlays on the hub.

## Known issues

- Block Stack game-over takes longer to force manually because it requires filling the well; the code path is implemented when a new piece collides at spawn.
- Star Drift and Sector Invaders game-over paths can take longer to force manually during smoke checks; both record scores on their collision/overrun end states.
- Block Stack has soft drop but no hard-drop scoring yet.
- Arcade games use canvas primitives rather than finished art assets.
- Touch controls are practical fallback buttons, not full gesture controls.
- Tutorial highlights are still textual/presentational, not anchored spotlights.

## Recommended next arcade games

- Avoider / falling blocks survival game.
- Missile Command-style defense game.
- Lunar lander-style precision landing game.
- Rhythm timing lane.

## Future leaderboard notes

- Keep local highscores as the default GitHub Pages-compatible mode.
- Before any global leaderboard, add score normalization per game and difficulty.
- Global/shared scores require a real backend and anti-spam policy; do not imply cross-device rankings until that is wired.
