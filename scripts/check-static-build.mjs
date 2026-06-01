import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const distDir = join(process.cwd(), "dist");
const indexPath = join(distDir, "index.html");
const expectedRoutes = [
  "/applets/xo-game-lab",
  "/applets/twelve-janggi",
  "/applets/nine-mens-morris",
  "/applets/mini-shogi",
  "/applets/amazons-mini",
  "/applets/hex",
  "/applets/domineering",
  "/applets/konane",
  "/applets/chess",
  "/applets/super-hexagon",
  "/applets/block-stack",
  "/applets/wing-dash",
  "/applets/neon-snake",
  "/applets/brick-breaker",
  "/applets/star-drift",
  "/applets/sector-invaders",
  "/applets/paddle-pop",
  "/applets/wall-pong",
  "/applets/lights-out",
  "/applets/sliding-tiles",
  "/applets/towers-of-hanoi",
  "/applets/mastermind",
  "/applets/peg-solitaire",
  "/applets/sokoban-mini",
];

function fail(message) {
  console.error(`Static build check failed: ${message}`);
  process.exit(1);
}

if (!existsSync(indexPath)) {
  fail("dist/index.html does not exist. Run npm run build first.");
}

const indexHtml = readFileSync(indexPath, "utf8");
const assetRefs = [...indexHtml.matchAll(/(?:src|href)="([^"]+)"/g)].map((match) => match[1]);

if (assetRefs.length === 0) {
  fail("dist/index.html does not reference any built assets.");
}

for (const ref of assetRefs) {
  if (ref.startsWith("/")) {
    fail(`asset reference ${ref} is root-absolute and will break on GitHub Pages project paths.`);
  }

  if (/^https?:\/\//.test(ref)) {
    continue;
  }

  const cleanRef = ref.replace(/^\.\//, "").split(/[?#]/)[0];
  const assetPath = join(distDir, cleanRef);
  if (!existsSync(assetPath)) {
    fail(`referenced asset ${ref} does not exist at ${assetPath}.`);
  }
}

const jsRefs = assetRefs.filter((ref) => ref.endsWith(".js"));
if (jsRefs.length === 0) {
  fail("dist/index.html does not reference a JavaScript bundle.");
}

const cssRefs = assetRefs.filter((ref) => ref.endsWith(".css"));
if (cssRefs.length === 0) {
  fail("dist/index.html does not reference a CSS bundle.");
}

const bundleText = jsRefs
  .map((ref) => readFileSync(join(distDir, ref.replace(/^\.\//, "").split(/[?#]/)[0]), "utf8"))
  .join("\n");

for (const route of expectedRoutes) {
  if (!bundleText.includes(route)) {
    fail(`built JavaScript bundle does not contain applet route ${route}.`);
  }
}

const cssText = cssRefs
  .map((ref) => readFileSync(join(distDir, ref.replace(/^\.\//, "").split(/[?#]/)[0]), "utf8"))
  .join("\n");

for (const selector of [".hub-shell", ".applet-card", ".game-shell", ".board-panel"]) {
  if (!cssText.includes(selector)) {
    fail(`built CSS bundle does not contain expected selector ${selector}.`);
  }
}

console.log(`Static build check passed: ${assetRefs.length} assets, ${expectedRoutes.length} applet routes, relative asset paths.`);
