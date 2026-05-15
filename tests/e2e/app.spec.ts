import { expect, test } from "@playwright/test";
import { waitForAgfReady } from "./_shared/agf";

test("renders a Three.js canvas + renderer reports draw calls", async ({ page }, testInfo) => {
  await page.goto("/");

  const canvas = page.getByTestId("engine-canvas");
  await expect(canvas).toBeVisible();

  // S46 — swap the historical 256×256 `getImageData` pixel-sample check
  // for an `__agf.rendererInfo().drawCalls > 0` assertion. The pixel-sample
  // check produced an all-black image on Ubuntu CI runners because
  // Chromium falls back to SwiftShader software-WebGL which sometimes
  // ships a uniformly-cleared frame, and the test had no way to tell that
  // apart from a real "nothing rendered" failure.
  //
  // `drawCalls > 0` is the right invariant: the renderer ran ≥1 draw call
  // for the active scene. We still attach a screenshot for visual sanity.
  await waitForAgfReady(page);

  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          const api = (window as unknown as {
            __agf?: { rendererInfo?: () => { drawCalls: number; meshes: number } };
          }).__agf;
          return api?.rendererInfo?.() ?? null;
        }),
      { timeout: 15_000 }
    )
    .toEqual(expect.objectContaining({ drawCalls: expect.any(Number), meshes: expect.any(Number) }));

  const info = await page.evaluate(() => {
    const api = (window as unknown as {
      __agf?: { rendererInfo?: () => { drawCalls: number; meshes: number } };
    }).__agf;
    return api?.rendererInfo?.();
  });
  expect(info?.drawCalls ?? 0).toBeGreaterThan(0);
  expect(info?.meshes ?? 0).toBeGreaterThan(0);

  const screenshotPath = testInfo.outputPath("hello-3d-canvas.png");
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await testInfo.attach("hello-3d-canvas", {
    path: screenshotPath,
    contentType: "image/png"
  });
});
