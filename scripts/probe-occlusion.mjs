import { chromium } from "@playwright/test";
const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext({ viewport: { width: 1024, height: 768 } })).newPage();
page.on("console", (m) => { if (m.type() === "error") console.log("E:", m.text()); });
await page.goto("http://127.0.0.1:5173/?project=kaboom-crew&map=heightmap-demo", { waitUntil: "load", timeout: 25000 });
await page.waitForFunction(() => window.__agf?.rendererReady, { timeout: 15000 });
await page.evaluate(() => window.__agf.rendererReady);
await page.waitForTimeout(1500);
// Click canvas to give focus, press Space to start game
await page.locator("canvas").first().click();
await page.waitForTimeout(300);
await page.keyboard.press("Space");
await page.waitForTimeout(1000);
// Teleport player.1 to (6, 0.4, 5) — right next to/behind the H=3 column at (6,5)
await page.evaluate(() => {
  window.__agf.applyCommands([
    { kind: "component.set", entityId: "player.1", component: "GridPosition", data: { gx: 6, gz: 5 } },
    { kind: "component.set", entityId: "player.1", component: "Transform", data: { position: [6, 0.4, 5], rotation: [0, 0, 0], scale: [1, 1, 1] } }
  ]);
});
await page.waitForTimeout(800);
await page.screenshot({ path: "/tmp/probe-occlusion.png" });
console.log("done");
await browser.close();
