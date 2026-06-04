import { chromium } from "@playwright/test";

const URL = process.env.URL ?? "http://127.0.0.1:5173/?project=kaboom-crew&suddenDeath=off";
const OUT = process.env.OUT ?? "/tmp/probe-loot-drop.png";

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

const inspect = await page.evaluate(() => {
  const snap = window.__agf.snapshot();
  const bombers = snap.entities
    .filter((e) => e.components.BomberStats !== undefined)
    .map((e) => ({
      id: e.id,
      stats: e.components.BomberStats,
      gp: e.components.GridPosition,
      hasTransform: e.components.Transform !== undefined
    }));
  return { bombers, totalEntities: snap.entities.length };
});

console.log("INSPECT:", JSON.stringify(inspect, null, 2));

const targetId = inspect.bombers[0]?.id;
if (!targetId) {
  console.log("no bomber");
  await browser.close();
  process.exit(1);
}

// Boost via setComponentAt; verify it landed.
await page.evaluate((id) => {
  const cur = window.__agf.componentAt(id, "BomberStats")?.value ?? {};
  window.__agf.setComponentAt(id, "BomberStats", {
    ...cur,
    maxBombs: 5,
    range: 3,
    speed: 3,
    canKick: true,
    shield: true,
    pierce: true,
    canThrow: true,
    bombPass: true
  });
}, targetId);

await page.waitForTimeout(500);

const verify = await page.evaluate((id) => {
  return window.__agf.componentAt(id, "BomberStats");
}, targetId);
console.log("AFTER BOOST:", JSON.stringify(verify, null, 2));

// Kill.
await page.evaluate((id) => {
  const cur = window.__agf.componentAt(id, "BomberStats")?.value ?? {};
  window.__agf.setComponentAt(id, "BomberStats", { ...cur, alive: false });
}, targetId);

await page.waitForTimeout(1200);

const result = await page.evaluate(() => {
  const snap = window.__agf.snapshot();
  const drops = snap.entities.filter((e) => e.id.includes(".drop."));
  const pickups = snap.entities.filter((e) => e.components.Pickup !== undefined);
  return {
    dropCount: drops.length,
    pickupCount: pickups.length,
    samplePickups: pickups.slice(0, 5).map((p) => ({ id: p.id, kind: p.components.Pickup?.kind, gp: p.components.GridPosition }))
  };
});

console.log("RESULT:", JSON.stringify(result, null, 2));
await page.screenshot({ path: OUT });
console.log("errors:", errors.slice(0, 5));
await browser.close();
