import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright-core";

const distDir = join(process.cwd(), "dist");
const outputDir = join(process.cwd(), "qa", "app-screen-checks", "2026-06-01");
const chromeExecutable = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const basePath = "/sts-a10-agent/";
const port = 5176;
const baseUrl = `http://127.0.0.1:${port}${basePath}`;
const contentTypes = {
  ".css": "text/css",
  ".html": "text/html",
  ".js": "text/javascript",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

const pages = [
  ["hub", "Strategy Lab Arcade", "#/applets"],
  ["xo-game-lab", "XO Game Lab", "#/applets/xo-game-lab"],
  ["twelve-janggi", "Twelve Janggi", "#/applets/twelve-janggi"],
  ["nine-mens-morris", "Nine Men's Morris", "#/applets/nine-mens-morris"],
  ["mini-shogi", "Mini Shogi", "#/applets/mini-shogi"],
  ["amazons-mini", "Amazons Mini", "#/applets/amazons-mini"],
  ["hex", "Hex", "#/applets/hex"],
  ["domineering", "Domineering", "#/applets/domineering"],
  ["konane", "Konane", "#/applets/konane"],
  ["chess", "Chess", "#/applets/chess"],
  ["super-hexagon", "Super Hexagon", "#/applets/super-hexagon"],
  ["block-stack", "Block Stack", "#/applets/block-stack"],
  ["wing-dash", "Wing Dash", "#/applets/wing-dash"],
  ["neon-snake", "Neon Snake", "#/applets/neon-snake"],
  ["brick-breaker", "Brick Breaker", "#/applets/brick-breaker"],
  ["star-drift", "Star Drift", "#/applets/star-drift"],
  ["sector-invaders", "Sector Invaders", "#/applets/sector-invaders"],
  ["paddle-pop", "Paddle Pop", "#/applets/paddle-pop"],
  ["wall-pong", "Wall Pong", "#/applets/wall-pong"],
  ["lights-out", "Lights Out", "#/applets/lights-out"],
  ["sliding-tiles", "Sliding Tiles", "#/applets/sliding-tiles"],
  ["towers-of-hanoi", "Towers of Hanoi", "#/applets/towers-of-hanoi"],
  ["mastermind", "Mastermind", "#/applets/mastermind"],
  ["peg-solitaire", "Peg Solitaire", "#/applets/peg-solitaire"],
  ["sokoban-mini", "Sokoban Mini", "#/applets/sokoban-mini"],
];

function createStaticServer() {
  return createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);
    let pathname = url.pathname.startsWith(basePath)
      ? url.pathname.slice(basePath.length)
      : url.pathname.slice(1);

    if (!pathname || pathname.endsWith("/")) {
      pathname += "index.html";
    }

    const filePath = normalize(join(distDir, pathname));
    if (!filePath.startsWith(distDir)) {
      response.writeHead(403).end("Forbidden");
      return;
    }

    try {
      const data = await readFile(filePath);
      response.writeHead(200, {
        "content-type": contentTypes[extname(filePath)] ?? "application/octet-stream",
      });
      response.end(data);
    } catch {
      const data = await readFile(join(distDir, "index.html"));
      response.writeHead(200, { "content-type": "text/html" });
      response.end(data);
    }
  });
}

async function main() {
  if (!existsSync(join(distDir, "index.html"))) {
    throw new Error("dist/index.html is missing. Run npm run build before npm run qa:screenshots.");
  }

  if (!existsSync(chromeExecutable)) {
    throw new Error(`Google Chrome was not found at ${chromeExecutable}.`);
  }

  await mkdir(outputDir, { recursive: true });
  const server = createStaticServer();
  await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));

  const browser = await chromium.launch({ executablePath: chromeExecutable });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
  const failures = [];

  page.on("pageerror", (error) => failures.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") {
      failures.push(message.text());
    }
  });

  try {
    for (const [slug, title, hash] of pages) {
      await page.goto(`${baseUrl}${hash}`, { waitUntil: "networkidle" });

      const result = await page.evaluate((expectedTitle) => {
        const h1 = document.querySelector("h1")?.textContent?.trim() ?? "";
        const cards = document.querySelectorAll(".applet-card[href^='#/applets/']").length;
        const controls = document.querySelectorAll("button,input,a").length;
        const playArea = Boolean(document.querySelector(".board-panel,.janggi-board,.compact-board,canvas"));
        const styledElement = document.querySelector(".applet-card,.board-panel,.game-header");
        const cssLoaded = styledElement ? getComputedStyle(styledElement).borderRadius !== "0px" : false;

        return { cards, controls, cssLoaded, h1, playArea, ok: h1 === expectedTitle };
      }, title);

      const isHub = slug === "hub";
      if (!result.ok || !result.cssLoaded || (isHub ? result.cards < 24 : !result.playArea || result.controls < 2)) {
        failures.push(`${slug} did not render usable content: ${JSON.stringify(result)}`);
      }

      await page.screenshot({
        fullPage: true,
        path: join(outputDir, `${slug}.png`),
      });
    }
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }

  if (failures.length > 0) {
    throw new Error(`Screenshot QA failed:\n${failures.join("\n")}`);
  }

  console.log(`Saved ${pages.length} built-site screenshots to ${outputDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
