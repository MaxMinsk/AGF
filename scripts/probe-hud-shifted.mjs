import { chromium } from "@playwright/test";

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
const page = await ctx.newPage();

await page.goto("http://127.0.0.1:5173/?project=kaboom-crew&suddenDeath=off&botAccelerate=off&deathBomb=off&revenge=off", { waitUntil: "load", timeout: 25000 });
await page.waitForFunction(() => window.__agf?.rendererReady, { timeout: 20000 });
await page.evaluate(() => window.__agf.rendererReady);
await page.keyboard.press("Space");
await page.waitForTimeout(500);

// Stamp a tally that puts bots ahead 2-0 so hunter (bot.1) is reckless, coward (bot.2) is brave, miner (bot.3) is calm.
await page.evaluate(() => {
  const r = window.__agf.componentAt("kaboom.round-state", "RoundState")?.value ?? {};
  window.__agf.setComponentAt("kaboom.round-state", "RoundState", { ...r, tally: { player: 0, bot: 2, draws: 0 }, phase: "playing" });
});
await page.waitForTimeout(300);

const lines = await page.evaluate(() => {
  const divs = Array.from(document.body.querySelectorAll("div"));
  const out = [];
  for (const el of divs) {
    if (el.children.length !== 0) continue;
    const t = el.textContent || "";
    if (/^bot\.\d/.test(t.trim())) out.push(t.trim());
  }
  return out;
});
console.log("Bots-ahead 2-0:");
for (const line of lines) console.log("  " + line);

// Flip to bots-trailing 0-2
await page.evaluate(() => {
  const r = window.__agf.componentAt("kaboom.round-state", "RoundState")?.value ?? {};
  window.__agf.setComponentAt("kaboom.round-state", "RoundState", { ...r, tally: { player: 2, bot: 0, draws: 0 }, phase: "playing" });
});
await page.waitForTimeout(300);

const lines2 = await page.evaluate(() => {
  const divs = Array.from(document.body.querySelectorAll("div"));
  const out = [];
  for (const el of divs) {
    if (el.children.length !== 0) continue;
    const t = el.textContent || "";
    if (/^bot\.\d/.test(t.trim())) out.push(t.trim());
  }
  return out;
});
console.log("Bots-behind 0-2:");
for (const line of lines2) console.log("  " + line);

await browser.close();
