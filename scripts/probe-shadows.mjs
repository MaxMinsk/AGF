import { chromium } from "@playwright/test";

const URL = process.env.URL ?? "http://127.0.0.1:5180/?project=kaboom-crew";
const OUT = process.env.OUT ?? "/tmp/probe-shadows.png";

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
const page = await ctx.newPage();

const errors = [];
const warns = [];
page.on("console", (m) => {
  const t = m.type();
  if (t === "error") errors.push(m.text());
  if (t === "warning") warns.push(m.text());
});
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

await page.goto(URL, { waitUntil: "load", timeout: 25000 });
await page.waitForFunction(() => window.__agf?.rendererReady, { timeout: 20000 });
await page.evaluate(() => window.__agf.rendererReady);
await page.waitForTimeout(3500);
await page.screenshot({ path: OUT });

console.log("ERRORS:", errors.length);
for (const e of errors) console.log("  ", e);
console.log("SCREENSHOT:", OUT);
await browser.close();
