import { chromium } from "@playwright/test";

const URL = "http://127.0.0.1:5173/?project=kaboom-crew&suddenDeath=off&botAccelerate=off&deathBomb=off&revenge=off&map=pit";

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
const page = await ctx.newPage();

const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

await page.goto(URL, { waitUntil: "load", timeout: 25000 });
await page.waitForFunction(() => window.__agf?.rendererReady, { timeout: 20000 });
await page.evaluate(() => window.__agf.rendererReady);
await page.keyboard.press("Space");
await page.waitForTimeout(500);

const start = await page.evaluate(() => {
  const gp = window.__agf.componentAt("player.1", "GridPosition")?.value;
  const stats = window.__agf.componentAt("player.1", "BomberStats")?.value;
  return { gp, bombPass: stats?.bombPass === true };
});
console.log("start:", JSON.stringify(start));

// Place bomb.
await page.evaluate(() => window.__agf.injectInput("player.1", "place-bomb"));
await page.waitForTimeout(150);

// Verify bomb on player cell.
const bombInfo = await page.evaluate(() => {
  const snap = window.__agf.snapshot();
  const b = snap.entities.find((e) => e.components.Bomb !== undefined);
  return b ? { id: b.id, gp: b.components.GridPosition, fuse: b.components.Bomb.fuseRemaining } : null;
});
console.log("bomb placed:", JSON.stringify(bombInfo));
if (!bombInfo) { console.log("FAIL: no bomb placed"); process.exit(1); }

// Extend bomb fuse to 60s so it can't detonate during the probe.
await page.evaluate((bombId) => {
  const cur = window.__agf.componentAt(bombId, "Bomb")?.value ?? {};
  window.__agf.setComponentAt(bombId, "Bomb", { ...cur, fuseRemaining: 60 });
}, bombInfo.id);

// Step off (try down then right).
await page.evaluate(() => window.__agf.injectInput("player.1", "move-down"));
await page.waitForTimeout(500);
let off = await page.evaluate(() => window.__agf.componentAt("player.1", "GridPosition")?.value);
console.log("after move-down:", JSON.stringify(off));
if (off.gx === start.gp.gx && off.gz === start.gp.gz) {
  await page.evaluate(() => window.__agf.injectInput("player.1", "move-right"));
  await page.waitForTimeout(500);
  off = await page.evaluate(() => window.__agf.componentAt("player.1", "GridPosition")?.value);
  console.log("after move-right (fallback):", JSON.stringify(off));
}
if (off.gx === start.gp.gx && off.gz === start.gp.gz) {
  console.log("FAIL: could not step off bomb cell"); process.exit(1);
}

// Re-extend fuse before the walk-back (it ticks).
await page.evaluate((bombId) => {
  const cur = window.__agf.componentAt(bombId, "Bomb")?.value ?? {};
  window.__agf.setComponentAt(bombId, "Bomb", { ...cur, fuseRemaining: 60 });
}, bombInfo.id);

// Try to walk BACK into the bomb cell. Hold the direction by injecting once.
const back = (off.gz > start.gp.gz) ? "move-up" : (off.gx > start.gp.gx) ? "move-left" : "move-up";
console.log("attempting walk-back via:", back);
await page.evaluate((a) => window.__agf.injectInput("player.1", a), back);
// Repeat keypress to make sure the queuedDirection sticks even if cleared.
for (let i = 0; i < 6; i++) {
  await page.evaluate((a) => window.__agf.injectInput("player.1", a), back);
  await page.waitForTimeout(80);
}

const after = await page.evaluate(() => {
  const gp = window.__agf.componentAt("player.1", "GridPosition")?.value;
  const mover = window.__agf.componentAt("player.1", "GridMover")?.value;
  return { gp, mover };
});
console.log("after walk-back attempt:", JSON.stringify(after));

const onBombCell = (after.gp.gx === start.gp.gx && after.gp.gz === start.gp.gz);
console.log(`player on bomb cell? ${onBombCell} — expected: FALSE (bomb-block must refuse)`);
console.log(onBombCell ? "BUG STILL PRESENT" : "WALK-BACK BLOCKED — FIX WORKS");

console.log("errors:", errors.slice(0,3));
await browser.close();
