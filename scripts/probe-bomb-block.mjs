import { chromium } from "@playwright/test";

const URL = process.env.URL ?? "http://127.0.0.1:5173/?project=kaboom-crew&suddenDeath=off&botAccelerate=off&deathBomb=off&revenge=off";

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
const page = await ctx.newPage();

const errors = [];
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

await page.goto(URL, { waitUntil: "load", timeout: 25000 });
await page.waitForFunction(() => window.__agf?.rendererReady, { timeout: 20000 });
await page.evaluate(() => window.__agf.rendererReady);
await page.keyboard.press("Space"); // skip title screen
await page.waitForTimeout(800);

// Kill all bots so they don't interfere.
const killBots = await page.evaluate(() => {
  const snap = window.__agf.snapshot();
  const killed = [];
  for (const e of snap.entities) {
    if (!e.id.startsWith("bot.")) continue;
    if (!e.components.BomberStats) continue;
    const cur = window.__agf.componentAt(e.id, "BomberStats")?.value ?? {};
    window.__agf.setComponentAt(e.id, "BomberStats", { ...cur, alive: false });
    killed.push(e.id);
  }
  return killed;
});
console.log("Bots killed:", killBots);
await page.waitForTimeout(500);

// Read player start cell.
const before = await page.evaluate(() => {
  const gp = window.__agf.componentAt("player.1", "GridPosition")?.value;
  const stats = window.__agf.componentAt("player.1", "BomberStats")?.value;
  return { gp, bombPass: stats?.bombPass === true, canKick: stats?.canKick === true };
});
console.log("Player state:", JSON.stringify(before));

// Place a bomb. Inject input.
await page.evaluate(() => window.__agf.injectInput("player.1", "place-bomb"));
await page.waitForTimeout(200);

const afterPlace = await page.evaluate(() => {
  const snap = window.__agf.snapshot();
  const bombs = snap.entities.filter((e) => e.components.Bomb !== undefined);
  return bombs.map((e) => ({ id: e.id, gp: e.components.GridPosition, owner: e.components.Bomb?.ownerId }));
});
console.log("Bombs after place:", JSON.stringify(afterPlace));

// Lengthen the bomb's fuse so it doesn't detonate during the probe.
if (afterPlace[0]) {
  await page.evaluate((id) => {
    const cur = window.__agf.componentAt(id, "Bomb")?.value ?? {};
    window.__agf.setComponentAt(id, "Bomb", { ...cur, fuseRemaining: 30 });
  }, afterPlace[0].id);
  const verify = await page.evaluate((id) => window.__agf.componentAt(id, "Bomb"), afterPlace[0].id);
  console.log("Bomb after fuse extend:", JSON.stringify(verify));
}

async function bombSnapshot() {
  return await page.evaluate(() => {
    const snap = window.__agf.snapshot();
    const all = snap.entities.filter((e) => e.id.startsWith("bomb.") || e.id.startsWith("death-bomb.") || e.id.startsWith("revenge-bomb."));
    return all.map((e) => ({
      id: e.id,
      hasBomb: e.components.Bomb !== undefined,
      gp: e.components.GridPosition,
      occ: e.components.GridOccupant,
      airborne: e.components.Bomb?.airborne,
      fuse: e.components.Bomb?.fuseRemaining,
      carriedBy: e.components.Bomb?.carriedBy
    }));
  });
}

async function blastSnap() {
  return await page.evaluate(() => {
    const snap = window.__agf.snapshot();
    return snap.entities
      .filter((e) => e.components.BlastTile !== undefined || e.components.BlastEvent !== undefined)
      .map((e) => ({ id: e.id, gp: e.components.GridPosition, type: e.components.BlastTile ? "tile" : "event" }));
  });
}

// Now step the player one cell east (off the bomb), then try to walk back west into the bomb.
async function injectMove(action) {
  // Inject once; grid-movement starts the lerp + completes the cell
  // step over ~0.25 s at speed 4. Wait 400 ms to keep total probe
  // time under the 2.5 s bomb fuse.
  await page.evaluate((a) => window.__agf.injectInput("player.1", a), action);
  await page.waitForTimeout(400);
}

console.log("Initial:", before.gp);
console.log("Bombs pre-step:", JSON.stringify(await bombSnapshot()));

// Try move-down (south); corner cells often have walls in the
// odd/even lattice. We just need ONE successful step off the bomb.
await injectMove("move-down");
let now = await page.evaluate(() => window.__agf.componentAt("player.1", "GridPosition")?.value);
console.log("After move-down (step off bomb):", JSON.stringify(now));
console.log("Bombs:", JSON.stringify(await bombSnapshot()));
if (now.gx === before.gp.gx && now.gz === before.gp.gz) {
  // try right
  await injectMove("move-right");
  now = await page.evaluate(() => window.__agf.componentAt("player.1", "GridPosition")?.value);
  console.log("Fallback move-right:", JSON.stringify(now));
  console.log("Bombs:", JSON.stringify(await bombSnapshot()));
  console.log("Blasts:", JSON.stringify(await blastSnap()));
}

// Now try to step BACK toward the bomb cell at (1,1).
const back = (now.gz > before.gp.gz) ? "move-up" : (now.gx > before.gp.gx) ? "move-left" : "stop";
console.log("Bombs pre-back:", JSON.stringify(await bombSnapshot()));
await injectMove(back);
now = await page.evaluate(() => window.__agf.componentAt("player.1", "GridPosition")?.value);
console.log(`After ${back} (toward bomb):`, JSON.stringify(now));
console.log("Bombs post-back:", JSON.stringify(await bombSnapshot()));

// Check whether the player landed on the bomb cell.
const bombCell = afterPlace[0]?.gp;
const onBomb = bombCell && now.gx === bombCell.gx && now.gz === bombCell.gz;
console.log("Player ON bomb cell after step-back?", onBomb, "(expected: false — bomb-block should refuse without bombPass)");

// Diagnostic: also check what the bomb-kick-system might be doing.
const finalState = await page.evaluate(() => {
  const snap = window.__agf.snapshot();
  const bombs = snap.entities.filter((e) => e.components.Bomb !== undefined);
  const player = window.__agf.componentAt("player.1", "GridPosition")?.value;
  const mover = window.__agf.componentAt("player.1", "GridMover")?.value;
  return { player, mover, bombs: bombs.map((b) => ({ id: b.id, gp: b.components.GridPosition })) };
});
console.log("Final state:", JSON.stringify(finalState));

console.log("errors:", errors.slice(0, 5));
await browser.close();
