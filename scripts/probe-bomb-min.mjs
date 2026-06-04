import { chromium } from "@playwright/test";

const URL = "http://127.0.0.1:5173/?project=kaboom-crew&suddenDeath=off&botAccelerate=off&deathBomb=off&revenge=off";

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
const page = await ctx.newPage();

const errors = [];
page.on("console", (m) => {
  if (m.type() === "error" || m.type() === "warning") errors.push(`[${m.type()}] ${m.text()}`);
});
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

await page.goto(URL, { waitUntil: "load", timeout: 25000 });
await page.waitForFunction(() => window.__agf?.rendererReady, { timeout: 20000 });
await page.evaluate(() => window.__agf.rendererReady);
await page.keyboard.press("Space");
await page.waitForTimeout(800);

// Kill bots immediately so they can't place bombs.
await page.evaluate(() => {
  const snap = window.__agf.snapshot();
  for (const e of snap.entities) {
    if (!e.id.startsWith("bot.")) continue;
    if (!e.components.BomberStats) continue;
    const cur = window.__agf.componentAt(e.id, "BomberStats")?.value ?? {};
    window.__agf.setComponentAt(e.id, "BomberStats", { ...cur, alive: false });
  }
});
await page.waitForTimeout(100);

console.log("=== T+0 — pre-place");
await dumpBombs("pre");

// Place
await page.evaluate(() => window.__agf.injectInput("player.1", "place-bomb"));
await page.waitForTimeout(120);
console.log("=== T+120 — post-place");
await dumpBombs("post-place");

// Extend fuse
const bombs = await page.evaluate(() => {
  const snap = window.__agf.snapshot();
  return snap.entities.filter((e) => e.components.Bomb !== undefined).map((e) => e.id);
});
if (bombs[0]) {
  await page.evaluate((id) => {
    const cur = window.__agf.componentAt(id, "Bomb")?.value ?? {};
    window.__agf.setComponentAt(id, "Bomb", { ...cur, fuseRemaining: 60 });
  }, bombs[0]);
}
await page.waitForTimeout(50);
console.log("=== T+170 — post-fuse-extend");
await dumpBombs("post-extend");

// Watch for 1.5s at 100ms intervals, see when bomb disappears
for (let i = 0; i < 15; i++) {
  await page.waitForTimeout(100);
  const sm = await dumpBombs(`+${(i+1)*100}ms`);
  if (sm.length === 0) {
    console.log("BOMB GONE at +", (i+1)*100, "ms");
    break;
  }
}

console.log("errors:", errors.slice(0, 8));
await browser.close();

async function dumpBombs(label) {
  const bombs = await page.evaluate(() => {
    const snap = window.__agf.snapshot();
    return snap.entities
      .filter((e) => e.id.startsWith("bomb.") || e.components.Bomb !== undefined)
      .map((e) => ({ id: e.id, fuse: e.components.Bomb?.fuseRemaining, gp: e.components.GridPosition }));
  });
  console.log(label + ":", JSON.stringify(bombs));
  return bombs;
}
