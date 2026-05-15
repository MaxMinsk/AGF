import { expect, test } from "@playwright/test";
import { waitForAgfReady } from "./_shared/agf";

// Sprint 31 / `M16-end-to-end-hello-3d`. The hello-3d scene now declares a
// 7-entity hierarchy (arena.root + 6 descendants). Lock the runtime path:
// every parented entity must materialise as a Three.js mesh, the camera
// must end up at the documented world position, and the canvas must paint
// nonblank (covered by `app.spec.ts`, here we focus on the hierarchy).

test("hello-3d renders the full hierarchy showcase without runtime diagnostics", async ({ page }) => {
  await page.goto("/?project=hello-3d");

  const canvas = page.getByTestId("engine-canvas");
  await expect(canvas).toBeVisible();

  // S46 OSS-e2e-helpers — gate on rendererReady + first scene-load
  // + first frame tick. Replaces the historical inline `{ timeout: 5_000 }`
  // that was too tight for ubuntu-latest cold-boot.
  await waitForAgfReady(page);

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
      { timeout: 15_000 }
    )
    .toEqual(
      [
        "arena.platform",
        "arena.root",
        "camera.main",
        "cube.hero",
        "floor",
        "light.ambient",
        "light.sun",
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

test("Spin on parented entities propagates through the hierarchy (dynamic demo)", async ({ page }) => {
  await page.goto("/?project=hello-3d");
  await expect(page.getByTestId("engine-canvas")).toBeVisible();
  await waitForAgfReady(page);

  const readRotations = async (): Promise<Record<string, [number, number, number]>> =>
    page.evaluate(() => {
      const api = (window as unknown as {
        __agf?: { snapshot?: () => { entities: Array<{ id: string; components: Record<string, unknown> }> } };
      }).__agf;
      const snap = api?.snapshot?.();
      if (snap === undefined) return {};
      const out: Record<string, [number, number, number]> = {};
      for (const entity of snap.entities) {
        const transform = entity.components["Transform"] as { rotation?: ReadonlyArray<number> } | undefined;
        const r = transform?.rotation;
        if (Array.isArray(r) && r.length === 3) {
          out[entity.id] = [Number(r[0]), Number(r[1]), Number(r[2])];
        }
      }
      return out;
    });

  await page.waitForTimeout(150);
  const t0 = await readRotations();
  await page.waitForTimeout(800);
  const t1 = await readRotations();

  // arena.root carries Spin { axis: y, speed: 15 } → local rotation Y advances.
  expect((t1["arena.root"]?.[1] ?? 0) - (t0["arena.root"]?.[1] ?? 0)).toBeGreaterThan(5);
  // tower.crown carries Spin { axis: y, speed: 60 } → faster.
  expect((t1["tower.crown"]?.[1] ?? 0) - (t0["tower.crown"]?.[1] ?? 0)).toBeGreaterThan(20);
  // satellite.disc carries Spin { axis: y, speed: 120 } → fastest.
  expect((t1["satellite.disc"]?.[1] ?? 0) - (t0["satellite.disc"]?.[1] ?? 0)).toBeGreaterThan(40);

  // Entities WITHOUT Spin keep their local rotation unchanged. Their world
  // transform still moves through the renderer because a parent spins.
  expect(t1["tower.spire"]).toEqual([0, 0, 0]);
  expect(t1["arena.platform"]).toEqual([0, 0, 0]);

  // Visual screenshot at a non-zero time.
  await page.screenshot({ path: "test-results/hello-3d-hierarchy-spinning.png", fullPage: false });
});
