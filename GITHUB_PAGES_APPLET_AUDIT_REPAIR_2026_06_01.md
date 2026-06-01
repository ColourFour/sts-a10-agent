# GitHub Pages Applet Audit and Repair - 2026-06-01

## What Was Broken

The immediate reason the live applet page did not change was repository mismatch.
The prior applet UI and QA work had been applied in:

```text
/Users/sbrooker/Documents/StS2-A10-Auto
```

The GitHub remote the user was committing and pushing from is:

```text
/Users/sbrooker/repos/sts2-a10-agent
git@github.com:ColourFour/sts-a10-agent.git
```

That is why Git reported "nothing to commit" and "Everything up-to-date": the applet changes were not in the checkout connected to the deployed repository.

During the repair, the applet changes were ported into the correct checkout and the Vite build was also hardened for GitHub Pages by changing production assets to relative paths.

## Repairs Made

- Ported the applet hub, applet page UI, puzzle applets, QA scripts, and reports into `/Users/sbrooker/repos/sts2-a10-agent`.
- Changed the tracked Vite config to `base: "./"` so built CSS and JavaScript assets are relative to `index.html`.
- Updated `tsconfig.node.json` so `tsc -b` typechecks `vite.config.ts` without recreating a root-level `vite.config.js` that can shadow the tracked config.
- Added `npm run check:static`.
- Added `scripts/check-static-build.mjs`, which verifies:
  - `dist/index.html` exists.
  - Built JS and CSS assets referenced by `dist/index.html` exist.
  - No built asset references are root-absolute.
  - The built JavaScript contains every known applet route.
  - The built CSS contains the key applet UI selectors.
- Updated the README GitHub Pages note to describe relative asset paths instead of a hard-coded repository path.

## Applets / Routes Audited

All applets reachable from the selector were audited:

- `/applets/xo-game-lab`
- `/applets/twelve-janggi`
- `/applets/nine-mens-morris`
- `/applets/mini-shogi`
- `/applets/amazons-mini`
- `/applets/hex`
- `/applets/domineering`
- `/applets/konane`
- `/applets/chess`
- `/applets/super-hexagon`
- `/applets/lights-out`
- `/applets/sliding-tiles`
- `/applets/towers-of-hanoi`
- `/applets/mastermind`
- `/applets/peg-solitaire`
- `/applets/sokoban-mini`

## GitHub Pages / Base Path Findings

The repaired `dist/index.html` now references assets with relative URLs:

```html
<script type="module" crossorigin src="./assets/index-...js"></script>
<link rel="stylesheet" crossorigin href="./assets/index-...css">
```

That works when the same `dist` output is served from the GitHub Pages project subpath. The built screenshot QA script serves the static output under:

- `http://127.0.0.1:5176/sts-a10-agent/`

The applet launcher, CSS, JavaScript, and all selector links loaded from that built output.

## Static Build Verification

Commands run:

```sh
npm ci
npm run typecheck --if-present
npm test --if-present
npm run build
npm run check:static
npm run preview --if-present
```

Results:

- `npm ci`: passed, 0 vulnerabilities.
- `npm run typecheck --if-present`: passed.
- `npm test --if-present`: passed, 4 files and 45 tests.
- `npm run build`: passed.
- Verified that `npm run typecheck` and `npm run build` do not recreate `vite.config.js`; only `vite.config.ts` remains in the root.
- `npm run check:static`: passed, 2 built assets and 16 applet routes verified.
- `npm run preview --if-present`: served the production build at `http://127.0.0.1:4173/`.

## Built Browser Checks

Production preview at `http://127.0.0.1:4173/`:

- Desktop `1280x900`: selector rendered 16 applet cards, CSS was loaded, no horizontal overflow, every applet route rendered its expected title, controls, and board/play area.
- Mobile `390x844`: selector rendered 16 applet cards, CSS was loaded, no horizontal overflow, every applet route rendered its expected title, controls, and board/play area.
- Final rebuilt preview check confirmed `dist/index.html` uses `./assets/...` for both CSS and JS.
- Browser console: no app errors recorded.

GitHub Pages subpath simulator:

- `/sts-a10-agent/`: loaded the built selector and every applet route from static `dist`.
- CSS loaded from relative built asset paths.
- JavaScript mounted from relative built asset paths.

## Interaction Checks

The existing interaction suite still runs against every applet:

- Selector route and all registry links.
- One completion path per applet.
- Reset/replay checks where applicable.
- Invalid or blocked action checks where applicable.

The built browser checks verify that the production bundle loads the visible controls and play areas from the static output. Full completion flows remain covered by `src/applets/appletInteraction.test.tsx`.

## Remaining Risks

- The browser click-through is local static simulation, not the remote GitHub Pages URL. The remote needs to be checked again after this correct checkout is pushed and Pages finishes deploying.
- The built browser checks verify route, CSS, JS, controls, and play-area presence for every applet; full end-to-end completion in a real browser is still handled by jsdom interaction tests rather than a Playwright browser suite.
- If GitHub Pages is configured to deploy from an older branch or source instead of this repository's Actions workflow, the live site still will not update until that Pages setting is corrected.

## Next Steps After Pushing

1. Push the repaired commit to the branch GitHub Pages deploys from.
2. Confirm the GitHub Pages deploy workflow runs successfully.
3. Open the live Pages URL with a hard refresh.
4. Confirm `View Source` or DevTools shows relative `./assets/...` URLs in `index.html`.
5. Click through the applet selector on the live URL and spot-check at least XO Game Lab, Twelve Janggi, Super Hexagon, Lights Out, and Sokoban Mini.
