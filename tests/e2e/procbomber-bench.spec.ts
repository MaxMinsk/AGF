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
  // S103: 17 sliders = 9 size (head/torsoH/torsoW/upperArm/forearm/
  // armWidth/upperLeg/lowerLeg/legWidth) + 2 posture (fwdTilt + armRest)
  // + 2 spread (shoulder + hip) + 4 mounts (shoulder Y/Z + hip Y/Z).
  // Plus 3 shape dropdowns + palette + reroll + anim dropdown.
  const sliders = page.locator("[data-procbomber-slider]");
  await expect(sliders).toHaveCount(17);
  await expect(page.locator("[data-procbomber-shape-select]")).toHaveCount(3);
  await expect(page.locator("[data-procbomber-palette-select]")).toBeVisible();
  await expect(page.locator("[data-procbomber-reroll]")).toBeVisible();
  await expect(page.locator("[data-procbomber-anim-select]")).toBeVisible();

  // S102 PROCBOMBER-MESH-TREE-V0: bomber root has no MeshRenderer
  // anymore — its 19-entity tree (1 root + 9 pivots + 10 mesh parts)
  // is spawned at attachUi. Verify the tree exists by checking the
  // root's LimbPivots component + at least one part-mesh entity.
  const snap = await page.evaluate(() => {
    const api = (window as unknown as {
      __agf?: { snapshot(): { entities: Array<{ id: string; components: Record<string, unknown> }> } };
    }).__agf;
    return api?.snapshot();
  });
  const bomber = snap?.entities.find((e) => e.id === "bomber");
  expect(bomber).toBeDefined();
  const limbPivots = bomber?.components["LimbPivots"] as
    | { neck?: string; shoulderL?: string; shoulderR?: string; hipL?: string; hipR?: string }
    | undefined;
  expect(limbPivots?.neck).toBe("bomber.neck");
  expect(limbPivots?.shoulderL).toBe("bomber.shoulderL");
  expect(limbPivots?.hipR).toBe("bomber.hipR");
  const torsoEntity = snap?.entities.find((e) => e.id === "bomber.torso");
  expect(torsoEntity).toBeDefined();
  expect((torsoEntity?.components["MeshRenderer"] as { mesh?: string } | undefined)?.mesh)
    .toBe("procedural:procbomber-torso");

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

  // S102 PROCBOMBER-VERTEX-COLORS-FIX: after a control tick the bench's
  // rebuild loop should have flipped vertex colours on the bomber's
  // material. Sample the canvas centre — vertex-coloured palette means
  // a non-greyscale pixel should appear somewhere in the central
  // region. (The bomber occupies the middle of the view.)
  await page.waitForTimeout(250);
  const hasColouredPixel = await page.evaluate(() => {
    const canvas = document.querySelector("canvas") as HTMLCanvasElement | null;
    if (canvas === null) return false;
    const w = canvas.width;
    const h = canvas.height;
    const tmp = document.createElement("canvas");
    tmp.width = w;
    tmp.height = h;
    const ctx = tmp.getContext("2d");
    if (ctx === null) return false;
    ctx.drawImage(canvas, 0, 0);
    const data = ctx.getImageData(Math.floor(w / 3), Math.floor(h / 3), Math.floor(w / 3), Math.floor(h / 3)).data;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i]!;
      const g = data[i + 1]!;
      const b = data[i + 2]!;
      // A non-greyscale pixel: one channel differs from another by ≥ 16.
      if (Math.abs(r - g) >= 16 || Math.abs(g - b) >= 16 || Math.abs(r - b) >= 16) return true;
    }
    return false;
  });
  expect(hasColouredPixel).toBe(true);

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
