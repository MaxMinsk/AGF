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
    .map((e) => ({ id: e.id, alive: e.components.BomberStats.alive }));
  return { bombers };
});
console.log("SETUP:", JSON.stringify(setup, null, 2));

// Kill the player so it goes into revenge mode.
const playerId = "player.1";
await page.evaluate((id) => {
  const cur = window.__agf.componentAt(id, "BomberStats")?.value ?? {};
  window.__agf.setComponentAt(id, "BomberStats", { ...cur, alive: false });
}, playerId);
await page.waitForTimeout(500);

const rsAfterDeath = await page.evaluate((id) => window.__agf.componentAt(id, "RevengeState"), playerId);
console.log("RevengeState after death:", JSON.stringify(rsAfterDeath, null, 2));

// Find an alive bot's cell to target.
const target = await page.evaluate(() => {
  const snap = window.__agf.snapshot();
  const tgt = snap.entities.find((e) => e.components.BomberStats?.alive !== false && e.components.BotBrain !== undefined);
  return tgt?.components.GridPosition;
});
console.log("Target cell:", target);

// Fire a revenge request at the target.
await page.evaluate((args) => {
  window.__agf.setComponentAt(args.id, "RevengeBombRequest", { targetGx: args.gx, targetGz: args.gz });
}, { id: playerId, gx: target.gx, gz: target.gz });
await page.waitForTimeout(500);

const after = await page.evaluate(() => {
  const snap = window.__agf.snapshot();
  const revengeBombs = snap.entities.filter((e) => e.id.startsWith("revenge-bomb."));
  return {
    revengeBombsCount: revengeBombs.length,
    bombs: revengeBombs.map((e) => ({ id: e.id, owner: e.components.Bomb?.ownerId, gp: e.components.GridPosition })),
    revengeState: window.__agf.componentAt("player.1", "RevengeState")
  };
});
console.log("AFTER request:", JSON.stringify(after, null, 2));

// Wait for fuse + blast.
await page.waitForTimeout(3500);

const final = await page.evaluate(() => {
  const snap = window.__agf.snapshot();
  return {
    aliveBombers: snap.entities.filter((e) => e.components.BomberStats?.alive !== false && e.components.BomberStats !== undefined).map((e) => e.id),
    blastTilesNow: snap.entities.filter((e) => e.components.BlastTile !== undefined).length,
    revengeBombsRemainingInWorld: snap.entities.filter((e) => e.id.startsWith("revenge-bomb.")).length
  };
});
console.log("FINAL:", JSON.stringify(final, null, 2));
console.log("errors:", errors.slice(0, 5));
await browser.close();
