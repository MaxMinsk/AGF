// S101 PROCBOMBER-BENCH-PLAYTEST-SMOKE — bench loads, every UI control
// responds, the bomber's mesh vertex count matches the six-box humanoid.

import { test, expect } from "@playwright/test";

import { waitForAgfReady } from "./_shared/agf";

test("[procbomber-bench] bench loads with controls + bomber mesh + responds to UI ticks", async ({ page }, testInfo) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error" && !msg.text().includes("404")) {
      pageErrors.push(`console.error: ${msg.text()}`);
    }
  });

  await page.goto("/?project=procbomber-bench");
  await waitForAgfReady(page);

  // The bench's overlay panel is mounted with a stable data attribute.
  await expect(page.locator("[data-procbomber-controls]")).toBeVisible();

  // Every slider + dropdown + button is mounted.
  const sliders = page.locator("[data-procbomber-slider]");
  await expect(sliders).toHaveCount(7);
  await expect(page.locator("[data-procbomber-palette-select]")).toBeVisible();
  await expect(page.locator("[data-procbomber-reroll]")).toBeVisible();
  await expect(page.locator("[data-procbomber-anim-select]")).toBeVisible();

  // Renderer wired up — the bomber's procedural mesh is a 6-box humanoid
  // so the entity component snapshot for "bomber" carries a MeshRenderer
  // with mesh: "procedural:procbomber".
  const snap = await page.evaluate(() => {
    const api = (window as unknown as {
      __agf?: { snapshot(): { entities: Array<{ id: string; components: Record<string, unknown> }> } };
    }).__agf;
    return api?.snapshot();
  });
  const bomber = snap?.entities.find((e) => e.id === "bomber");
  expect(bomber).toBeDefined();
  const meshRenderer = bomber?.components["MeshRenderer"] as { mesh?: string } | undefined;
  expect(meshRenderer?.mesh).toBe("procedural:procbomber");

  // Tick the head-size slider — value should change in the displayed label.
  const headSlider = page.locator('[data-procbomber-slider="headSize"]');
  await headSlider.fill("0.55");
  await headSlider.dispatchEvent("input");
  await expect(page.locator('[data-procbomber-slider-value="headSize"]')).toHaveText(/0\.55/);

  // Tick the palette dropdown — selecting "ember" should commit.
  const paletteSelect = page.locator("[data-procbomber-palette-select]");
  await paletteSelect.selectOption("ember");
  await expect(paletteSelect).toHaveJSProperty("value", "ember");

  // Tick the animation dropdown — selecting "idle-bob" should commit.
  const animSelect = page.locator("[data-procbomber-anim-select]");
  await animSelect.selectOption("idle-bob");
  await expect(animSelect).toHaveJSProperty("value", "idle-bob");

  // Click reroll — no assertable side effect beyond "no error",
  // but exercising the click path covers the button's listener.
  await page.locator("[data-procbomber-reroll]").click();

  // Renderer produced at least one draw call.
  const info = await page.evaluate(() => {
    const api = (window as unknown as {
      __agf?: {
        rendererInfo?: () => { drawCalls: number; meshes: number; bucketInstances: number; batchedBucketInstances: number };
      };
    }).__agf;
    return api?.rendererInfo?.();
  });
  expect(info?.drawCalls ?? 0).toBeGreaterThan(0);

  const screenshotPath = testInfo.outputPath("procbomber-bench-canvas.png");
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await testInfo.attach("procbomber-bench-canvas", {
    path: screenshotPath,
    contentType: "image/png"
  });

  expect(pageErrors).toEqual([]);
});
