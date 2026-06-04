import { chromium } from "@playwright/test";

const URL = process.env.URL ?? "http://127.0.0.1:5173/?project=kaboom-crew&suddenDeath=off";

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

await page.keyboard.press("Space");
await page.waitForTimeout(800);

const setup = await page.evaluate(() => {
  const snap = window.__agf.snapshot();
  const bombers = snap.entities
    .filter((e) => e.components.BomberStats !== undefined)
    .map((e) => ({ id: e.id, alive: e.components.BomberStats.alive, hasBot: e.components.BotBrain !== undefined, hasPlayer: e.components.PlayerControlled !== undefined }));
  return { bombers, count: bombers.length };
});
console.log("SETUP:", JSON.stringify(setup, null, 2));

// Kill all players (PlayerControlled) so HUMANS_DEAD triggers.
const playerIds = setup.bombers.filter((b) => b.hasPlayer).map((b) => b.id);
for (const id of playerIds) {
  await page.evaluate((id) => {
    const cur = window.__agf.componentAt(id, "BomberStats")?.value ?? {};
    window.__agf.setComponentAt(id, "BomberStats", { ...cur, alive: false });
  }, id);
}

const startBombsByBot = {};
for (const b of setup.bombers.filter((x) => x.hasBot)) startBombsByBot[b.id] = 0;

// Watch for 8 seconds, count Bomb entities spawned by bots.
const start = Date.now();
let observed = 0;
let snapAt0 = 0;
let snapAt8 = 0;
while (Date.now() - start < 8000) {
  const s = await page.evaluate(() => {
    const snap = window.__agf.snapshot();
    return snap.entities.filter((e) => e.components.Bomb !== undefined).length;
  });
  if (snapAt0 === 0) snapAt0 = s;
  snapAt8 = s;
  observed = Math.max(observed, s);
  await page.waitForTimeout(500);
}

const finalState = await page.evaluate(() => {
  const snap = window.__agf.snapshot();
  const aliveBombers = snap.entities.filter((e) => e.components.BomberStats?.alive !== false && e.components.BomberStats !== undefined);
  return {
    aliveBombers: aliveBombers.map((e) => e.id),
    blastTiles: snap.entities.filter((e) => e.components.BlastTile !== undefined).length,
    bombs: snap.entities.filter((e) => e.components.Bomb !== undefined).length
  };
});

console.log("OBSERVED bombs max:", observed, "first:", snapAt0, "after 8s:", snapAt8);
console.log("FINAL:", JSON.stringify(finalState, null, 2));
console.log("errors:", errors.slice(0, 5));
await browser.close();
