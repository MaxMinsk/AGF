import { chromium } from "@playwright/test";

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
const page = await ctx.newPage();
const errs = [];
page.on("pageerror", (e) => errs.push(e.message));

await page.goto("http://127.0.0.1:5173/?project=kaboom-crew&suddenDeath=off&botAccelerate=off&deathBomb=off&revenge=off", { waitUntil: "load", timeout: 25000 });
await page.waitForFunction(() => window.__agf?.rendererReady, { timeout: 20000 });
await page.evaluate(() => window.__agf.rendererReady);
await page.keyboard.press("Space");
await page.waitForTimeout(500);

await page.evaluate(() => {
  window.__agf.setComponentAt("bot.1", "BotBluffState", { kind: "fake-flee", phase: "approaching", elapsed: 1.6, startedRound: 1 });
});
await page.waitForTimeout(300);

const bluff = await page.evaluate(() => {
  const s = window.__agf.snapshot();
  return s.entities.find((e) => e.id === "bot.1")?.components.BotBluffState;
});
console.log("bot.1 BotBluffState:", JSON.stringify(bluff));

const statsLine = await page.evaluate(() => {
  const divs = Array.from(document.body.querySelectorAll("div"));
  for (const el of divs) {
    if (el.children.length !== 0) continue;
    const t = el.textContent || "";
    if (t.includes("bot.1") && t.includes("bombs")) return t.trim();
  }
  return null;
});
console.log("HUD bot.1 stats line:", statsLine);

// Now test the decoy + feint kinds by mounting them on bot.2 / bot.3.
await page.evaluate(() => {
  window.__agf.setComponentAt("bot.2", "BotBluffState", { kind: "decoy-bomb", phase: "retreating", elapsed: 0.3, startedRound: 1 });
  window.__agf.setComponentAt("bot.3", "BotBluffState", { kind: "feign-corner", phase: "feigning", elapsed: 0.5, startedRound: 1 });
});
await page.waitForTimeout(300);

const allBotLines = await page.evaluate(() => {
  const divs = Array.from(document.body.querySelectorAll("div"));
  const out = [];
  for (const el of divs) {
    if (el.children.length !== 0) continue;
    const t = el.textContent || "";
    if (/^bot\.\d/.test(t.trim())) out.push(t.trim());
  }
  return out;
});
console.log("All bot HUD lines:");
for (const line of allBotLines) console.log("  " + line);

console.log("errors:", errs.slice(0, 3));
await browser.close();
