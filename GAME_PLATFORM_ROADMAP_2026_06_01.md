# Game Platform Roadmap - 2026-06-01

## 1. Global leaderboard backend

- Add a real backend before showing global/shared rankings.
- Recommended path: Supabase tables for `profiles`, `score_entries`, and optional `game_settings`.
- Store game id, normalized score, raw result details, settings, user id, and created timestamp.
- Add row-level security so users can write their own scores and read public leaderboard rows.
- No Supabase URL/key/config is currently present in this repo, so this pass stays local-only.

## 2. Arcade expansion

- Add fast single-player games after the shared shell, keyboard, tutorial, and scoring systems settle.
- Candidate order: Snake, Breakout, Tetris, Flappy Bird, then an Asteroids-style mini-game.
- Reuse the local score module and Space-to-start convention from Super Hexagon.

## 3. AI opponents for board games

- Start with low-cost move evaluators for Chess, Mini Shogi, Twelve Janggi, and Hex.
- Keep AI optional and clearly labeled by difficulty.
- Prefer proven engines or bounded search helpers where available instead of rewriting every rules engine.

## 4. Full board-piece art pass

- Replace temporary text/SVG hybrid tokens with cohesive piece art.
- Keep accessibility labels and high-contrast player identity.
- Prioritize Chess, Twelve Janggi, Mini Shogi, Nine Men's Morris, and Hex.

## 5. Full tutorial pass for every applet

- Expand the reusable tutorial steps to every game.
- Add target-aware highlights where the board layout can expose stable selectors.
- Keep each tutorial short: three to five steps per game.

## 6. Achievements and badges

- Add local achievements first, using localStorage.
- Candidate badges: first win, perfect Lights Out, minimum Hanoi, Super Hexagon survival thresholds, puzzle streaks.
- Design the storage model so it can later sync to a backend account.

## 7. Difficulty modes and score normalization

- Add explicit difficulty/settings metadata to score entries.
- Normalize scores per game and mode so leaderboard comparisons are meaningful.
- Record both raw result details and normalized score for transparency.
