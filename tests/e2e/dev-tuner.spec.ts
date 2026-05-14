// M23-tuner end-to-end: an agent adds a tuner, the floating panel appears,
// drags write the World, removal cleans up.

import { expect, test } from "@playwright/test";

test("__agf.dev.tuner.add → panel, drag, remove", async ({ page }) => {
  await page.goto("/?project=beacon-world");
  await page.waitForFunction(
    () => Boolean((window as unknown as { __agf?: { dev?: { tuner?: unknown } } }).__agf?.dev?.tuner),
    { timeout: 8_000 }
  );

  // Add two sliders bound to the sun's shadow bias + normalBias.
  await page.evaluate(() => {
    const t = (window as unknown as {
      __agf: {
        dev: {
          tuner: {
            add: (spec: unknown) => void;
            list: () => ReadonlyArray<{ name: string; value: number }>;
          };
        };
      };
    }).__agf.dev.tuner;
    t.add({
      name: "sun-bias",
      target: { entityId: "light.sun", component: "Light", path: "shadow.bias" },
      min: -0.02,
      max: 0,
      step: 0.0005
    });
    t.add({
      name: "sun-normal",
      target: { entityId: "light.sun", component: "Light", path: "shadow.normalBias" },
      min: 0,
      max: 0.5,
      step: 0.01
    });
  });

  // Panel + two rows exist.
  await expect(page.locator("[data-testid='engine-dev-tuner']")).toBeVisible();
  await expect(page.locator("[data-tuner='sun-bias']")).toBeVisible();
  await expect(page.locator("[data-tuner='sun-normal']")).toBeVisible();

  // Drive the bias slider to -0.01 and assert the World now sees it.
  const bias = page.locator("[data-tuner='sun-bias'] input[type='range']");
  await bias.evaluate((el) => {
    const input = el as HTMLInputElement;
    input.value = "-0.01";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const liveBias = await page.evaluate(() => {
    const snap = (window as unknown as {
      __agf: {
        snapshot: (o: { includeRenderInternals?: boolean }) => {
          entities: Array<{ id: string; components: Record<string, unknown> }>;
        };
      };
    }).__agf.snapshot({ includeRenderInternals: true });
    const sun = snap.entities.find((e) => e.id === "light.sun");
    const light = sun?.components["Light"] as { shadow?: { bias?: number } } | undefined;
    return light?.shadow?.bias;
  });
  expect(liveBias).toBeCloseTo(-0.01, 5);

  // List reports the live tuners.
  const list = await page.evaluate(() => {
    const t = (window as unknown as {
      __agf: { dev: { tuner: { list: () => ReadonlyArray<{ name: string; value: number }> } } };
    }).__agf.dev.tuner;
    return t.list();
  });
  expect(list.map((t) => t.name).sort()).toEqual(["sun-bias", "sun-normal"]);

  // Remove just one — the row goes, the other stays.
  await page.evaluate(() => {
    (window as unknown as {
      __agf: { dev: { tuner: { remove: (name: string) => void } } };
    }).__agf.dev.tuner.remove("sun-bias");
  });
  await expect(page.locator("[data-tuner='sun-bias']")).toHaveCount(0);
  await expect(page.locator("[data-tuner='sun-normal']")).toBeVisible();

  // removeAll wipes the panel.
  await page.evaluate(() => {
    (window as unknown as {
      __agf: { dev: { tuner: { removeAll: () => void } } };
    }).__agf.dev.tuner.removeAll();
  });
  await expect(page.locator("[data-testid='engine-dev-tuner']")).toHaveCount(0);

  // Renderer-internal panel should never leak into the default snapshot.
  const sawInternal = await page.evaluate(() => {
    const snap = (window as unknown as {
      __agf: {
        snapshot: () => { entities: Array<{ id: string; components: Record<string, unknown> }> };
      };
    }).__agf.snapshot();
    return snap.entities.some((e) => e.id.startsWith("dev-tuner"));
  });
  expect(sawInternal).toBe(false);
});
