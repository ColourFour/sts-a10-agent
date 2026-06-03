# Chess Coaching Roadmap — 2026-06-03

## 1. Executive Verdict

The current Chess.com coach applet is on the right path. It already has the hard foundation for a useful chess-improvement tool: public Chess.com game loading, time-control filtering, daily rating summaries, selected-day Stockfish review, player-level modes, critical move cards, homework puzzles, and a weekly report surface.

The biggest product gap is not missing engine analysis. The biggest gap is that engine output is not yet converted into a reliable coaching loop: diagnose a player's recurring weakness, explain it in human terms, train it through spaced homework, and show whether the weakness is improving over weeks. Today the app identifies large evaluation swings, but it does not persist puzzle attempts, classify tactical motifs deeply, replay full game context, or produce a durable review queue.

The next implementation pass should make the existing coach flow reliable and clear, then improve explanations and training persistence before adding deeper engine tooling.

## 2. Current Applet State

Source note: this section is based on local review of `src/applets/classic-games/chess-analysis/ChessComAnalysisPanel.tsx`, `chessComApi.ts`, `chessGameNormalization.ts`, `chessDailySummary.ts`, `chessSelectedDayAnalysis.ts`, `chessStockfishEngine.ts`, `chessWeeklyReport.ts`, `chessPgnPositionExtraction.ts`, and `chessReportTypes.ts`.

- Data fetching: the app fetches recent Chess.com archive URLs and games from the public API, defaults to 3 recent monthly archives, supports 1/2/3 month fetches, stores the last username in `localStorage`, caches archive lists and archive game responses, and keeps static GitHub Pages compatibility by doing all work in the browser. Chess.com documents public monthly game archive access through its PubAPI archive endpoint pattern, which matches the local implementation's archive-first model ([Chess.com PubAPI docs](https://www.chess.com/news/view/published-data-api)).
- Rating summaries: the app normalizes rated bullet, blitz, and rapid games, filters by selected time class, groups games by local end date, calculates first/final known rating, net change, W-L-D counts, daily cards, and a daily net movement graph.
- Engine analysis: selected-date analysis extracts only the tracked player's moves from PGN, then evaluates each candidate position before and after the played move with browser Stockfish. Defaults are depth 10, 400ms per position, up to 3 games, up to 18 player moves. Settings are clamped to depth 1-18, 100-3000ms, 1-8 games, and 1-60 player moves.
- Review modes: the app has Beginner, Intermediate, and Advanced modes. Beginner hides engine details unless explicitly enabled. Intermediate exposes settings in a drawer. Advanced opens an expert engine drawer and allows top-3 move analysis from the playable board.
- Mistakes/Critical Moves: the app classifies moves by centipawn loss and mate swings into labels such as Inaccuracy, Mistake, Major evaluation loss, Blunder, Missed winning advantage, and Missed mate or mating defense. It ranks critical moves by centipawn loss and keeps the top 5.
- Homework: homework puzzles are generated from the ranked critical moves. Each puzzle includes FEN, best move, played move, side to move, explanation, local hint/reveal controls, and local solved/skipped/retry state inside the current React component session. Attempt state is not persisted.
- Weekly Report: the weekly report aggregates fetched rating data, cached selected-day engine reports, analysis coverage, biggest critical moves, basic theme counts, homework candidates, and Markdown export. It can analyze one missing day at a time and has recent logic clarifying saved-run lookup by username, date, game scope, and settings.
- Known constraints: analysis is limited by browser Worker/WASM behavior, local compute, shallow depth, per-position move-time limits, localStorage quota, Chess.com API availability/CORS behavior, PGN parse failures, and cache-key sensitivity to analysis settings. The app can overstate precision if it presents shallow browser Stockfish labels as final truth.

## 3. Coaching Principles From Research

- Reviewing your own games: strong improvement workflows consistently treat the player's own games as the best diagnostic source. Chess.com Game Review centers around classifying move quality, finding key moments, showing better moves, and explaining mistakes in a coach-like way ([Chess.com Game Review support](https://support.chess.com/article/653-computer-analysis-how-do-i-get-my-games-analyzed)). Lichess supports analysis boards, study chapters, comments, variations, and engine-backed review, showing that serious review needs position context and replay, not only a list of bad moves ([Lichess analysis board](https://lichess.org/analysis), [Lichess Study](https://lichess.org/study)).
- Tactics training: beginner and intermediate players improve fastest when blunders and tactical misses are turned into repeatable pattern practice. Chess.com beginner study material emphasizes tactics, checkmates, and basic calculation before heavy opening theory ([Chess.com beginner tactics study plan](https://www.chess.com/article/view/study-plan-for-beginners-tactics2)). Lichess puzzle themes expose tactical labels such as fork, pin, skewers, mate, discovered attack, defensive move, and endgame themes, which is the right kind of vocabulary for this app's next motif layer ([Lichess puzzle themes](https://lichess.org/training/themes)).
- Pattern recognition: tactical motifs and recurring error themes matter because players need to recognize families of positions, not memorize isolated engine moves. Puzzle systems and study tools group exercises by motif because that lets players build transferable recognition ([Lichess puzzle themes](https://lichess.org/training/themes)).
- Opening study: opening work should be performance-driven, not encyclopedic. For this app, opening study should initially mean "which openings lead to repeated early mistakes or bad results" rather than a full repertoire builder. Lichess Opening Explorer is a useful reference for opening-result and move-frequency workflows ([Lichess Opening Explorer](https://lichess.org/analysis)).
- Endgame study: endgame work should surface practical flags such as winning material but failing to convert, queen/rook endings, basic king-and-pawn decisions, and drawn positions thrown away. Beginner study plans usually include basic mates and elementary endings after tactical foundations, while advanced players need more precise conversion analysis ([Chess.com study plan directory](https://www.chess.com/article/view/study-plan-directory)).
- Slow games vs fast games: fast games are useful for volume and pattern exposure, but improvement needs at least some slow games so the player can practice calculation and then review decisions. For this app, bullet should be summarized cautiously and should not drive the same coaching claims as rapid games. The app should nudge lower-rated users toward rapid review and treat bullet as tilt/session signal more than deep instruction.
- Spaced repetition: Chessable's MoveTrainer is a chess-specific example of repeated recall and review scheduling for moves ([Chessable profile/source note](https://www.chess.com/member/chessable)). General learning research supports spacing effects across verbal learning tasks and shows that retrieval practice improves long-term retention compared with rereading ([Cepeda et al., 2006](https://pubmed.ncbi.nlm.nih.gov/16719566/), [Roediger and Karpicke, 2006](https://doi.org/10.1111/j.1467-9280.2006.01693.x)). The app should therefore store puzzle attempts and schedule retries.
- Rating-appropriate coaching: a 700-rated player needs a narrow, forgiving UI that says "you hung material here" and "solve this one tactic"; a 1500-rated player can use motif trends and opening/endgame flags; a 2000-rated player can use PVs, MultiPV comparisons, and confidence labels. Deliberate-practice research in chess suggests that structured, effortful study activity is a meaningful contributor to expertise, but it must be targeted and feedback-rich, not passive review ([Charness et al., 2005](https://cir.nii.ac.jp/crid/1361137043712776320)).
- Human explanation vs engine output: engines provide tactical truth at a position, but they do not automatically provide useful instruction. Stockfish UCI output can provide centipawn or mate scores, best moves, and MultiPV lines, but those need conversion into coach language and uncertainty labels before being shown to non-expert users ([Stockfish UCI options](https://official-stockfish.github.io/docs/stockfish-wiki/UCI-&-Commands.html)). The app should distinguish "Stockfish preferred this" from "you lost because of this human reason."

## 4. Rating-Level Needs

### Beginner, roughly 600-900

Beginners need a narrow review path: one day, one biggest mistake, one practice position, and one weekly habit. They are usually overwhelmed by centipawn precision, engine settings, raw FEN, PV lines, MultiPV output, and too many candidate moves. They need concrete explanations: hanging material, missed checkmate, missed capture, unsafe king, undefended piece, failed recapture, or moving the same piece too often.

The app should show beginner users:

- Rating movement in simple terms.
- The biggest 1-3 mistakes, not every inaccuracy.
- A board with played move and better move highlights.
- Plain-language explanations with no raw engine details by default.
- One immediate homework puzzle and a short retry schedule.
- Rapid/blitz guidance; bullet should be framed as pattern/tilt data, not the main improvement source.

The app should hide beginner users:

- Depth, move time, max moves, FEN, raw UCI, centipawn thresholds, and PV lines unless "Show engine details" is enabled.
- Fine-grained distinction between small inaccuracies and shallow-depth engine preferences.
- Weekly reports that list many missing cache states before explaining what to do next.

### Intermediate, roughly 1200-1600

Intermediate players need pattern diagnosis. They can use centipawn loss, game phase, tactical motif labels, opening family performance, and week-over-week repetition. They still need coach language because "Stockfish preferred Nxd5" is not enough.

The app should show intermediate users:

- Critical move cards with played move vs best move, simple eval swing, and motif labels.
- A review queue across analyzed days.
- Tactical themes by count and severity.
- Opening performance by ECO/name once PGN headers or opening inference are available.
- Endgame and conversion flags.
- Spaced homework with solved/failed/skipped history.
- Weekly report with a training plan and "review these 5 positions again."

### Advanced, roughly 1800-2200

Advanced users need more precision, more board control, and more honesty about engine depth. They care about PVs, candidate move comparison, mate scores, move-order details, engine confidence, and whether a label is based on shallow search. They also need enough depth to avoid misleading tactical labels in complex positions.

The app should show advanced users:

- MultiPV lines with SAN conversion and evals from the side-to-move/player perspective.
- A full move replay board with before/after, PGN navigation, arrows/highlights, and copy/export.
- Engine settings, cache metadata, source, and approximate-confidence labels.
- Deeper analysis options, ideally async/batched or imported server analysis when browser depth is insufficient.
- Opening, middlegame, and endgame segmentation.
- Advanced weekly report export that can be shared with a coach.

## 5. Product Gaps

### UI/UX gaps

- The first post-load screen does not yet feel like a crisp "do this next" coach flow for every level.
- Navigation splits Rating, Analysis, Critical Moves, Homework, and Weekly Report, but users can lose the relationship between the steps.
- Weekly saved-run/cache matching is technically clearer now, but still cognitively heavy.
- The board supports clickable moves, but there is no full PGN replay timeline, move list, or variation navigation.
- The app lacks arrows/highlights beyond square coloring.
- Mobile density and board/action layout need targeted QA after the coaching flow changes.

### Chess coaching gaps

- Explanations are mostly heuristic wrappers around centipawn loss and material delta.
- Tactical motifs are too broad: "missed best move" and "major eval loss" do not teach pattern recognition.
- No game-phase tags: opening, middlegame, endgame.
- No conversion analysis: winning to equal, equal to losing, endgame throws, failing to convert material.
- No rating-aware curriculum beyond hiding/showing engine details.
- No distinction between "review this slowly" and "ignore this shallow inaccuracy."

### Engine/analysis gaps

- Browser Stockfish depth/time defaults are shallow and must be labeled approximate.
- Critical moves are ranked by raw centipawn loss, which can overweight already-lost positions and mate-score artifacts.
- Mate scores are converted to a large centipawn value for ranking, which is practical but can distort priority.
- Analysis only checks before and after the player's move; it does not inspect the opponent's previous move as a possible missed tactic context.
- Top-move analysis exists only inside focused boards and is not persisted into critical move records.
- No confidence scoring based on depth reached, PV stability, MultiPV gap, or repeated search.

### Puzzle/homework gaps

- Solved/skipped/retry state is local component state only and disappears when changing puzzle/session.
- No failed-attempt capture because the board is not checking the user's attempted solution against the best move.
- No spaced repetition queue, due dates, streaks, or retry intervals.
- Puzzle hints are generic and sometimes reveal UCI/SAN comparison rather than a tactical idea.
- Puzzle identity is not explicitly versioned by FEN + best move + source game + analysis settings.

### Weekly-report gaps

- The weekly report summarizes rating and cached analysis, but it does not yet produce a durable training plan with due homework.
- Theme counts are based only on the top critical moves, not all analyzed critical moves.
- No week-over-week trend for recurring motifs, solved homework, or analysis coverage.
- Markdown export is useful but not yet coach/share oriented.

### Data/storage gaps

- `localStorage` is used for API caches, analysis reports, statuses, username, and likely future state, but it will become fragile as analyzed games and puzzle attempts grow.
- No central schema/version migration layer.
- No IndexedDB-backed analysis store.
- No pruning/retention controls.
- No import/export of local coaching history.

## 6. Roadmap Overview

- Phase 1: make the current coach flow reliable and clear. Tighten the post-load path, cache/status language, mode behavior, and empty states without changing core analysis.
- Phase 2: improve mistake explanations and theme labels. Add motif/game-phase/conversion labels and better human explanations while keeping shallow-engine caveats.
- Phase 3: improve homework and spaced repetition. Persist attempts, validate solution moves, schedule retries, and build a review queue.
- Phase 4: improve weekly reports and progress tracking. Turn the weekly report into an actionable training plan with trends, coverage, and homework outcomes.
- Phase 5: advanced analysis board and deeper engine tools. Add full move replay, arrows/highlights, MultiPV persistence, confidence labels, and deeper analysis options.
- Phase 6: polish, onboarding, and export/share features. Improve onboarding, mobile layout, report export, coach sharing, and local data management.

## 7. Detailed Implementation Plan

### Phase 1: make the current coach flow reliable and clear

- Goal: make the existing applet's current review path obvious and trustworthy.
- User value: after loading games, a user knows exactly whether to review a day, open mistakes, solve homework, or complete weekly coverage.
- Specific tasks:
  - Add a level-aware "next step" panel after games load.
  - Make selected time control, selected date, game scope, and saved-run settings visible in one concise status row.
  - Standardize empty states for no games, no saved analysis, single-game analysis not counted weekly, and settings mismatch.
  - Keep beginner mode on a 3-step flow: rating movement, biggest mistake, one practice position.
  - Add tests around saved-run lookup copy/state where feasible.
- Files likely to change:
  - `src/applets/classic-games/chess-analysis/ChessComAnalysisPanel.tsx`
  - `src/applets/classic-games/chess-analysis/chessWeeklyReport.ts`
  - `src/applets/classic-games/chess-analysis/chessAnalysis.test.ts`
  - `src/styles.css`
- Acceptance criteria:
  - After loading games, each player level has a clear primary action.
  - Weekly coverage explains missing days without implying data loss.
  - Beginner mode does not show raw engine settings unless explicitly enabled.
  - `npm run build`, `npm run check:static`, and `npm test` pass.
- Risk level: low.
- Dependencies: none beyond existing app code.
- What not to do yet: do not introduce IndexedDB, new engine logic, or a full design overhaul.

### Phase 2: improve mistake explanations and theme labels

- Goal: convert broad engine labels into coachable chess reasons.
- User value: users learn why a move was bad, not just that it lost centipawns.
- Specific tasks:
  - Add motif classifiers for obvious captures, checks, mate threats, hanging material, forks/pins/skewers where detectable from legal moves and board state.
  - Add game-phase tags from move number/material state.
  - Add conversion labels: winning advantage lost, equal position thrown, losing position made worse, missed mate, missed defensive resource.
  - Include "confidence: approximate" labels when shallow search or small MultiPV gaps make the claim fragile.
  - Add tests for label classification using fixed FENs.
- Files likely to change:
  - `chessSelectedDayAnalysis.ts`
  - `chessReportTypes.ts`
  - `ChessComAnalysisPanel.tsx`
  - `chessAnalysis.test.ts`
- Acceptance criteria:
  - Critical move cards include one primary coach reason and optional secondary motif.
  - Beginner cards use plain language.
  - Advanced cards can still view centipawn/PV details.
  - Mate-score and already-lost-position cases are not ranked or explained misleadingly.
- Risk level: medium.
- Dependencies: Phase 1 clarity; stable test FEN fixtures.
- What not to do yet: do not claim tactical motifs that cannot be detected reliably; label uncertain cases as generic.

### Phase 3: improve homework and spaced repetition

- Goal: make homework durable and train recurring errors over time.
- User value: a player can come back tomorrow and review the positions they missed today.
- Specific tasks:
  - Add persisted homework attempts keyed by puzzle id.
  - Validate the first move attempted on the board against the best move.
  - Store solved/skipped/failed/retry states, hint use, reveal use, timestamps, and attempt count.
  - Add simple spaced schedule: failed/revealed due soon, solved without hint due later, skipped due soon.
  - Add a review queue view that pulls due puzzles across analyzed days.
- Files likely to change:
  - `chessReportTypes.ts`
  - new `chessHomeworkStorage.ts`
  - `ChessComAnalysisPanel.tsx`
  - `chessAnalysis.test.ts`
  - `src/styles.css`
- Acceptance criteria:
  - Solved/skipped/retry state survives reload.
  - A wrong attempted move is recorded without destroying the puzzle.
  - Due puzzles can be reviewed across dates.
  - Storage schema has a version field.
- Risk level: medium.
- Dependencies: stable puzzle id format and storage design.
- What not to do yet: do not build a full spaced-repetition algorithm beyond a simple transparent schedule.

### Phase 4: improve weekly reports and progress tracking

- Goal: make the weekly report a training plan, not only a summary.
- User value: users see what changed this week and what to train next.
- Specific tasks:
  - Include analyzed-game coverage, recurring motif trend, homework due/solved/failed counts, and top training target.
  - Count motifs from all analyzed critical moves, not only the displayed top 5.
  - Add "analyze next most useful day" priority based on rating loss, rapid/blitz value, and missing coverage.
  - Export a cleaner Markdown report with source-game links and due homework.
  - Snapshot weekly reports locally so users can compare weeks even if settings change.
- Files likely to change:
  - `chessWeeklyReport.ts`
  - `chessReportTypes.ts`
  - `ChessComAnalysisPanel.tsx`
  - new `chessWeeklySnapshots.ts`
  - `chessAnalysis.test.ts`
- Acceptance criteria:
  - Weekly report has one clear training recommendation.
  - Weekly report distinguishes fetched data, analyzed data, and homework data.
  - Exported Markdown is useful to send to a coach.
  - Snapshot schema is versioned.
- Risk level: medium.
- Dependencies: Phase 3 homework persistence.
- What not to do yet: do not add remote sync or accounts.

### Phase 5: advanced analysis board and deeper engine tools

- Goal: support serious review without compromising beginner clarity.
- User value: advanced users can inspect why a move is best and compare candidate lines.
- Specific tasks:
  - Add full PGN move replay with before/after positions and move list.
  - Add arrows/highlights for played move, best move, threats, and selected PV line.
  - Persist top 3 moves/PVs for critical positions when advanced analysis is run.
  - Add confidence metadata: depth, time, PV count, eval gap, mate-score handling.
  - Add "deep review" mode with higher depth/time caps and clear browser-performance warnings.
  - Consider importing external PGN/analysis later if static-browser limits become a blocker.
- Files likely to change:
  - `ChessComAnalysisPanel.tsx`
  - `chessStockfishEngine.ts`
  - `chessSelectedDayAnalysis.ts`
  - `chessPgnPositionExtraction.ts`
  - `chessReportTypes.ts`
  - `src/styles.css`
- Acceptance criteria:
  - Advanced users can replay a whole source game around a critical moment.
  - PV lines are shown in SAN and can be copied.
  - Approximate labels appear when analysis is shallow.
  - Beginner mode remains uncluttered.
- Risk level: high.
- Dependencies: Phase 2 labels and confidence model.
- What not to do yet: do not build a server engine unless browser limits are proven unacceptable for target users.

### Phase 6: polish, onboarding, and export/share features

- Goal: make the app feel like a focused chess coach instead of an analysis prototype.
- User value: users can start quickly, understand limits, and share progress.
- Specific tasks:
  - Add concise onboarding for username, time control, level, and first review.
  - Improve mobile layout for board plus action controls.
  - Add local data management: storage usage, clear old cache, export/import coaching history.
  - Improve report export with Markdown and PGN/FEN bundles.
  - Add shareable static-safe report text without requiring server state.
- Files likely to change:
  - `ChessComAnalysisPanel.tsx`
  - `src/styles.css`
  - storage helper modules from prior phases
  - tests for data export/import
- Acceptance criteria:
  - New users can complete first review without reading implementation details.
  - Mobile boards and buttons do not overflow.
  - Users can export their local coaching history.
  - Static build remains compatible.
- Risk level: medium.
- Dependencies: Phase 3/4 storage schemas.
- What not to do yet: do not add authentication, cloud sync, or paid-coach marketplace features.

## 8. Suggested Coaching Features

| Rank | Feature | Beginner value | Intermediate value | Advanced value | Implementation difficulty | Risk of misleading the user |
|---:|---|---|---|---|---|---|
| 1 | Plain-language mistake explanation | Very high | Very high | Medium | Medium | Medium if heuristics overclaim |
| 2 | Move replay | High | Very high | Very high | Medium | Low |
| 3 | Arrows/highlights | High | High | High | Medium | Low |
| 4 | Tactical motif tags | High | Very high | High | Medium | High if labels are guessed |
| 5 | Spaced repetition homework | Very high | Very high | Medium | Medium | Low |
| 6 | Solved/failed puzzle history | High | Very high | Medium | Medium | Low |
| 7 | Review queue | High | Very high | High | Medium | Low |
| 8 | Weekly training plan | High | High | Medium | Medium | Medium if based on sparse analysis |
| 9 | SAN/PV comparison | Low | Medium | Very high | Medium | Medium at shallow depth |
| 10 | Endgame flags | Medium | High | High | Medium | Medium |
| 11 | Conversion failures | Medium | Very high | Very high | Medium | Medium |
| 12 | Opening performance | Low | High | High | Medium | Medium if sample size is small |
| 13 | Tilt/session detection | Medium | High | Medium | Medium | Medium if framed too strongly |
| 14 | Report export | Medium | High | High | Low | Low |

Feature notes:

- Plain-language mistake explanation should start with conservative categories: hung material, missed capture, missed mate, missed defense, gave up winning advantage, and large unexplained engine swing.
- Tactical motif tags should be introduced as "likely motif" until detection is robust.
- Move replay and arrows/highlights are high leverage because they improve every rating level without demanding deeper engine search.
- Opening performance should wait until sample-size warnings and opening identification are in place.
- Tilt/session detection should use soft language such as "session risk" based on losing streaks, high volume, and time-control mix, not psychological diagnosis.

## 9. Data Model Recommendations

Use explicit versioned records. Keep API response caches separate from coaching state.

- Analyzed games:
  - `id`: normalized game URL hash.
  - `username`, `timeClass`, `endDate`, `endTimestamp`, `playerColor`, `opponent`, `ratings`, `result`.
  - `pgn`, optional parsed move list, source archive URL.
  - `analysisVersion`, `createdAt`, `updatedAt`.
- Analyzed days:
  - `id`: username + date + timeClass + game scope + settings hash.
  - `username`, `date`, `timeClass`, `gameUrls`, `settings`, `status`, `completedAt`.
  - `analyzedMoveCount`, `criticalMoveCount`, `incomplete`, `skippedGames`.
- Critical moves:
  - `id`: day analysis id + game URL hash + move number + played UCI + FEN hash.
  - `fenBefore`, `fenAfter`, `playedMoveSan`, `playedMoveUci`, `bestMoveUci`, `bestMoveSan`.
  - `evalBefore`, `evalAfter`, `centipawnLoss`, `mateSwing`, `phase`, `motifs`, `coachReason`, `confidence`.
  - `sourceSettings`, `sourceEngine`, `sourceGameUrl`.
- Homework attempts:
  - `puzzleId`, `userMoveUci`, `result`, `attemptedAt`, `usedHintCount`, `revealed`, `elapsedMs`.
  - Keep an array or append-only history for attempts.
- Solved/skipped/retry states:
  - `puzzleId`, `state`, `lastAttemptAt`, `nextDueAt`, `attemptCount`, `successCount`, `failureCount`, `lastResult`.
  - Store `scheduleVersion` so retry logic can change later.
- Weekly report snapshots:
  - `id`: username + weekKey + timeClass + snapshot timestamp.
  - `dateRange`, `settingsHash`, `ratingSummary`, `analysisCoverage`, `themeCounts`, `homeworkSummary`, `recommendation`, `markdown`.
- Settings/versioning:
  - `schemaVersion`, `analysisDefaultsVersion`, `engineVersion`, `uiMode`, `lastUsername`, `lastTimeClass`, `lastPlayerLevel`.
  - Migration helpers should upgrade or ignore old records safely.

Storage warning:

- `localStorage` is usually limited to roughly 5-10MB per origin and stores strings synchronously. That is acceptable for username, small status records, and a few cached reports, but it is risky for many PGNs, FENs, PV lines, snapshots, and attempt histories.
- Move to IndexedDB when storing parsed games, many analyzed days, persistent homework history, weekly snapshots, or imported/exported analysis bundles.
- Keep `localStorage` as a small settings/status layer and use IndexedDB for growing chess data.

## 10. Engine Analysis Recommendations

Browser Stockfish can:

- Evaluate FEN positions locally without a server.
- Return best move, centipawn or mate score, raw info lines, and MultiPV lines.
- Support static hosting because the Worker/WASM asset is vendored under `public/vendor/stockfish`.
- Give useful tactical hints when depth/time are enough and positions are not too complex.

Browser Stockfish cannot reliably:

- Provide master-level certainty at depth 10 and 400ms.
- Explain human chess concepts by itself.
- Guarantee stable rankings for quiet positional moves.
- Analyze many games deeply without long waits, battery/CPU cost, and browser Worker risk.
- Make bullet-game conclusions as educationally meaningful as rapid-game conclusions.

Recommended default settings by review mode:

- Beginner: depth 8-10, 300-500ms, max 2-3 games, max 12-18 player moves. Show only major swings and mate/winning-advantage losses. Hide raw evals by default.
- Intermediate: depth 10-12, 400-800ms, max 3-5 games, max 18-30 player moves. Show centipawn bands, motifs, game phase, and settings drawer.
- Advanced: depth 12-16 default, 800-1500ms, max 3-6 games, max 30-60 player moves. Allow top-3 lines and deep single-position review. Keep current cap of depth 18/3000ms unless performance testing supports more.

When to show engine confidence:

- Show "approximate" whenever depth is under 12, move time is under 800ms, PV gap is small, or the move is a quiet positional preference.
- Show "high confidence" only for forced mate, large material wins, obvious legal-tactic wins, or large stable eval gaps.
- For beginner mode, phrase confidence as "clear mistake" vs "review suggestion" rather than numeric certainty.

When to label results approximate:

- Always label browser Stockfish analysis as approximate in settings/help text.
- Label individual positions approximate when centipawn loss is under 150, when the best move is a quiet non-capture/non-check, or when the position has mate-score volatility.
- Avoid calling small engine preferences "mistakes" for beginners.

How to avoid overclaiming:

- Use "Stockfish preferred" for engine facts.
- Use "likely reason" for heuristic motif labels.
- Use "review priority" instead of "the reason you lost" unless the game result and position context support it.
- Suppress low-confidence inaccuracies from beginner homework.

How to handle mate scores:

- Keep mate scores as their own type in UI and ranking metadata.
- Do not flatten mate to 100000 cp for user-facing display.
- Rank missed mates high, but distinguish "missed mate for player" from "missed mating defense."
- Prefer mate distance and side-to-move wording over cp-style loss.

How to rank critical moves fairly:

- Combine severity, practical swing, phase, confidence, and trainability.
- Downweight moves from already-lost positions unless they missed a drawing or defensive resource.
- Upweight clear tactical motifs and conversion failures.
- Avoid ranking only by raw centipawn loss.
- For weekly reports, rank by recurring pattern plus severity, not only the single biggest swing.

## 11. UI/UX Recommendations

- Navigation: keep the five tabs, but add a persistent "Coach path" status row: Load games -> Review day -> Mistakes -> Homework -> Weekly plan. Highlight the next incomplete step.
- First screen after loading games: show selected time control, most recent active day, rating movement, and one primary button: "Review this day." Add secondary buttons for Rating Trend and Weekly Report.
- Beginner mode: use the labels Coach Review, Rating, Mistakes, Practice, Weekly Plan. Show one primary explanation, one board, one puzzle, and one next action. Hide FEN/PV/depth/centipawn unless engine details are enabled.
- Intermediate mode: show motif labels, eval bands, settings drawer, review queue, and weekly trend. Keep copy concise and action-oriented.
- Advanced mode: show engine drawer open, depth/time/cache source, MultiPV, copy FEN/PGN, and full replay. Do not force advanced details into beginner/intermediate surfaces.
- Analysis page: make game scope and saved-run matching clearer. If a user analyzes a single game, show a clear message that weekly coverage uses selected-day analysis.
- Mistakes page: show before/after toggle, played move, best move, reason, motif, source game link, and "add to review queue" once queue exists.
- Homework page: make the board validate the user's first move. Replace purely manual "Mark solved" with attempted/solved/revealed states, while keeping manual controls for accessibility.
- Weekly report: lead with one training recommendation, then rating movement, coverage, recurring motif, due homework, and export. Move technical saved-run settings lower for beginner/intermediate.
- Board size and styling: keep board large enough for touch targets, maintain coordinate labels, and use arrows/highlights for moves. Make board and explanation sit side-by-side on desktop and stack cleanly on mobile.
- Mobile layout: keep primary action buttons visible below the board, avoid dense grids, collapse weekly coverage details, and prevent engine setting inputs from dominating the first viewport.

## 12. Next 5 Build Prompts

### Task 1: Clarify the coach flow and post-load next action

- Scope: add a level-aware next-step panel and clearer selected date/time-control/run status without changing analysis logic.
- Expected files: `ChessComAnalysisPanel.tsx`, `src/styles.css`, `chessAnalysis.test.ts` if state helpers are extracted.
- Acceptance criteria: after loading games, each level gets one primary action; no saved-analysis empty state implies data loss; beginner mode hides engine details by default.
- Validation commands: `git diff --check`; `npm run build`; `npm run check:static`; `npm test`.

### Task 2: Add conservative coach reason and motif metadata

- Scope: enrich critical moves with safe motif/game-phase/reason labels for obvious cases.
- Expected files: `chessSelectedDayAnalysis.ts`, `chessReportTypes.ts`, `ChessComAnalysisPanel.tsx`, `chessAnalysis.test.ts`.
- Acceptance criteria: critical cards show a coach reason; uncertain cases are labeled generic/approximate; tests cover missed mate, hanging material, missed win, and low-confidence inaccuracy.
- Validation commands: `git diff --check`; `npm run build`; `npm run check:static`; `npm test`.

### Task 3: Persist homework attempts and retry states

- Scope: create persistent homework state keyed by puzzle id and record solved/skipped/revealed/failed attempts.
- Expected files: new `chessHomeworkStorage.ts`, `chessReportTypes.ts`, `ChessComAnalysisPanel.tsx`, `chessAnalysis.test.ts`.
- Acceptance criteria: puzzle state survives reload; wrong first moves are recorded; retry/due state is visible; schema has a version.
- Validation commands: `git diff --check`; `npm run build`; `npm run check:static`; `npm test`.

### Task 4: Build the review queue

- Scope: collect due homework and unresolved critical moves across analyzed days into one queue.
- Expected files: `chessHomeworkStorage.ts`, `chessWeeklyReport.ts`, `ChessComAnalysisPanel.tsx`, `src/styles.css`, tests.
- Acceptance criteria: queue shows due puzzles from multiple days; solved items drop out until next due date; weekly report links to the queue.
- Validation commands: `git diff --check`; `npm run build`; `npm run check:static`; `npm test`.

### Task 5: Upgrade weekly report into a training plan

- Scope: add recurring motif trends, homework outcomes, coverage priority, and cleaner Markdown export.
- Expected files: `chessWeeklyReport.ts`, `chessReportTypes.ts`, `ChessComAnalysisPanel.tsx`, tests.
- Acceptance criteria: weekly report starts with one recommendation; export includes rating, coverage, motifs, due homework, and source links; no report overclaims when coverage is sparse.
- Validation commands: `git diff --check`; `npm run build`; `npm run check:static`; `npm test`.

## 13. Final Recommendation

Build Phase 1 next: make the current coach flow reliable and unmistakable. Then build Phase 2 and Phase 3 together as the real chess-improvement leap: plain-language mistake reasons, motif labels, and persistent spaced homework.

Defer deep engine work, opening dashboards, advanced exports, and IndexedDB until the app proves the basic loop: load games, review one day, understand one mistake, solve one related puzzle, and see the pattern again next week.

Hide or soften shallow-engine inaccuracies for beginners. Delete no current major feature yet, but demote raw engine settings, FEN, and cache mechanics from beginner/intermediate first views.

What would make this app genuinely useful for chess improvement is a tight feedback loop: identify recurring mistakes from the player's own games, explain them in human chess language, turn them into scheduled puzzles, and show week-over-week progress without pretending browser Stockfish depth 10 is a complete coach.
