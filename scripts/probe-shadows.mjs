import { chromium } from "@playwright/test";

const URL = process.env.URL ?? "http://localhost:5180/?project=kaboom-crew&map=heightmap-demo";
const OUT = process.env.OUT ?? "/tmp/probe-shadows.png";

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
const page = await ctx.newPage();

const errors = [];
const warns = [];
page.on("console", (m) => {
  const t = m.type();
  const text = m.text();
  if (t === "error") errors.push(text);
  if (t === "warning") warns.push(text);
});
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

await page.goto(URL, { waitUntil: "load", timeout: 15000 });
await page.waitForSelector("canvas", { timeout: 8000 });
await page.waitForTimeout(800);
await page.keyboard.press("Space");
await page.waitForTimeout(1500);
await page.screenshot({ path: OUT, fullPage: false });

console.log("ERRORS:", errors.length);
for (const e of errors) console.log("  ", e);
console.log("WARNS:", warns.length);
for (const w of warns.slice(0, 6)) console.log("  ", w);
console.log("SCREENSHOT:", OUT);
await browser.close();
