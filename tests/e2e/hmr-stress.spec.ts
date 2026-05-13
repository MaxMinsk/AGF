import { expect, test } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");
const materialPath = resolve(
  repoRoot,
  "examples/beacon-world/assets/runtime/materials/drone.material.json"
);

test.describe.configure({ mode: "serial" });

test("touching one material 30 times keeps renderer info bounded", async ({ page }) => {
  await page.goto("/?project=beacon-world");
  await page.waitForFunction(() => Boolean(window.__agf));

  // Wait for the first frame so renderer.info has stable values.
  await page.waitForFunction(() => (window.__agf?.rendererInfo().meshes ?? 0) > 0, undefined, {
    timeout: 5000
  });
  const baseline = (await page.evaluate(() => window.__agf!.rendererInfo())) as {
    geometries: number;
    textures: number;
    programs: number;
    meshes: number;
  };

  const cycles = 30;
  const original = readFileSync(materialPath);

  for (let i = 0; i < cycles; i += 1) {
    const baselineEvents = (await page.evaluate(
      () => window.__agf!.reloadEvents.length
    )) as number;

    writeFileSync(materialPath, original);

    await page.waitForFunction(
      ({ baseline: from, ref }) => {
        const events = window.__agf?.reloadEvents ?? [];
        for (let index = from; index < events.length; index += 1) {
          if (events[index]?.ref === ref) {
            return true;
          }
        }
        return false;
      },
      { baseline: baselineEvents, ref: "runtime/materials/drone.material.json" },
      { timeout: 10_000 }
    );
  }

  // Give the renderer a couple of frames to settle after the last reload.
  await page.waitForTimeout(200);

  const final = (await page.evaluate(() => window.__agf!.rendererInfo())) as {
    geometries: number;
    textures: number;
    programs: number;
    meshes: number;
  };

  // Mesh count is exact — should not have grown.
  expect(final.meshes).toBe(baseline.meshes);
  // Geometry / texture / program counts can wiggle by 1–2 because Three's
  // GC runs lazily; assert "bounded by a small ratio" rather than equality.
  expect(final.geometries).toBeLessThanOrEqual(baseline.geometries + 4);
  expect(final.textures).toBeLessThanOrEqual(baseline.textures + 4);
  expect(final.programs).toBeLessThanOrEqual(baseline.programs + 4);
});
