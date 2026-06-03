// S277 — manual live probe for the WebGPU outline-occluder silhouette.
// Boots kaboom-crew, presses Space to start, takes a screenshot with the
// feature ON and another with `?occluderOutline=on` URL flag.

import { chromium } from "@playwright/test";

const URL_ON  = "http://127.0.0.1:5173/?project=kaboom-crew&map=cross&follow=off&occluderOutline=on";
const URL_OFF = "http://127.0.0.1:5173/?project=kaboom-crew&map=cross&follow=off";

async function capture(url, outPath, label) {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const errors = [];
  const warnings = [];
  page.on("console", (m) => {
    const t = m.type();
    if (t === "error") errors.push(m.text());
    else if (t === "warning" || t === "warn") warnings.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(`PAGEERROR: ${e.message}`));
  console.log(`\n=== ${label} ===\n${url}`);
  await page.goto(url, { waitUntil: "load", timeout: 25000 });
  await page.waitForFunction(() => Boolean(globalThis.__agf?.rendererReady), { timeout: 20000 });
  await page.waitForTimeout(500);
  // Title-screen swallows input until Space. Try keyboard directly first.
  await page.keyboard.press("Space").catch(() => {});
  await page.waitForTimeout(200);
  // Also force-clear via the HUD-bypass path used by other probes:
  // synthesize a Space keydown directly on the canvas.
  await page.evaluate(() => {
    const ev1 = new KeyboardEvent("keydown", { code: "Space", key: " ", bubbles: true });
    const ev2 = new KeyboardEvent("keyup",   { code: "Space", key: " ", bubbles: true });
    window.dispatchEvent(ev1);
    window.dispatchEvent(ev2);
  });
  await page.waitForTimeout(1500);

  const info = await page.evaluate(() => globalThis.__agf.rendererInfo());
  console.log("rendererInfo:", JSON.stringify({
    renderer: info.renderer, drawCalls: info.drawCalls, triangles: info.triangles, meshes: info.meshes, gpuMs: info.gpuMs
  }));

  // Place player.1 next to a wall, spawn a hard test wall in front.
  await page.evaluate(() => {
    const agf = globalThis.__agf;
    agf.applyCommands([
      { kind: "component.set", entityId: "player.1", component: "GridPosition", data: { gx: 4, gz: 4 } },
      { kind: "component.set", entityId: "player.1", component: "Transform", data: { position: [4, 0.4, 4], rotation: [0, 0, 0], scale: [1, 1, 1] } },
      // Big chunky wall between camera (top-down-ish) and bomber.
      { kind: "entity.create", entityId: "probe.wall" },
      { kind: "component.set", entityId: "probe.wall", component: "Transform", data: { position: [4, 0.8, 3.0], rotation: [0, 0, 0], scale: [1.4, 1.6, 0.5] } },
      { kind: "component.set", entityId: "probe.wall", component: "MeshRenderer", data: { mesh: "box", color: "#2a2a2a" } }
    ]);
  });
  await page.waitForTimeout(1200);
  const fpsInfo = await page.evaluate(() => globalThis.__agf.rendererInfo());
  console.log("post-load fpsInfo:", JSON.stringify({ drawCalls: fpsInfo.drawCalls, triangles: fpsInfo.triangles, gpuMs: fpsInfo.gpuMs }));

  // Count outline entities in world.
  const counts = await page.evaluate(() => {
    const snap = globalThis.__agf.snapshot?.();
    if (!snap) return null;
    let outlineEntities = 0;
    let bomberRoots = 0;
    for (const ent of snap.entities ?? []) {
      const c = ent.components ?? {};
      if (c.OutlineOccluder !== undefined) outlineEntities += 1;
      if (c.LimbPivots !== undefined) bomberRoots += 1;
    }
    return { outlineEntities, bomberRoots, total: (snap.entities ?? []).length };
  });
  console.log("counts:", JSON.stringify(counts));

  await page.screenshot({ path: outPath, fullPage: false });
  console.log(`saved → ${outPath}`);
  if (errors.length > 0) console.log(`ERRORS (${errors.length}):`, errors.slice(0, 8).join("\n  "));
  if (warnings.length > 0) console.log(`WARNINGS (${warnings.length}, first 4):`, warnings.slice(0, 4).join("\n  "));
  await browser.close();
}

await capture(URL_ON,  "/tmp/outline-on.png",  "ON  (occluderOutline=on)");
await capture(URL_OFF, "/tmp/outline-off.png", "OFF (no flag)");
console.log("\ndone — open /tmp/outline-on.png and /tmp/outline-off.png");
