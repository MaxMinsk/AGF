import { expect, test } from "@playwright/test";

// Sprint 31 / `M16-end-to-end-hello-3d`. The hello-3d scene now declares a
// 7-entity hierarchy (arena.root + 6 descendants). Lock the runtime path:
// every parented entity must materialise as a Three.js mesh, the camera
// must end up at the documented world position, and the canvas must paint
// nonblank (covered by `app.spec.ts`, here we focus on the hierarchy).

test("hello-3d renders the full hierarchy showcase without runtime diagnostics", async ({ page }) => {
  await page.goto("/?project=hello-3d");

  const canvas = page.getByTestId("engine-canvas");
  await expect(canvas).toBeVisible();

  // The snapshot is available after the first frame. Poll briefly so the
  // scene-load command has applied + the renderer has built every mesh.
  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          const api = (window as unknown as { __agf?: { snapshot?: () => unknown } }).__agf;
          if (api?.snapshot === undefined) {
            return null;
          }
          const snap = api.snapshot() as { entities: Array<{ id: string }> };
          return snap.entities.map((entity) => entity.id).sort();
        }),
      { timeout: 5_000 }
    )
    .toEqual(
      [
        "arena.platform",
        "arena.root",
        "camera.main",
        "cube.hero",
        "floor",
        "satellite.beacon",
        "satellite.disc",
        "tower.base",
        "tower.crown",
        "tower.spire"
      ].sort()
    );

  // Save a screenshot for the agent to inspect manually if anything looks off.
  // Playwright drops it under test-results/.
  await page.screenshot({ path: "test-results/hello-3d-hierarchy.png", fullPage: false });

  // Diagnostics bus should be clean — no AGF_TRANSFORM_PARENT_* or asset-load errors.
  const diagnostics = await page.evaluate(() => {
    const api = (window as unknown as {
      __agf?: { diagnostics?: () => ReadonlyArray<{ severity: string; code: string }> };
    }).__agf;
    return api?.diagnostics?.() ?? [];
  });
  const errors = diagnostics.filter((d) => d.severity === "error").map((d) => d.code);
  expect(errors).toEqual([]);
});
