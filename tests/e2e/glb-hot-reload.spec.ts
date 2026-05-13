import { expect, test } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");
const droneGlbPath = resolve(repoRoot, "examples/beacon-world/assets/runtime/models/drone.glb");

test("editing drone.glb fires the asset HMR path", async ({ page }) => {
  await page.goto("/?project=beacon-world");
  await page.waitForFunction(() => Boolean(window.__agf));

  const expectedRef = "runtime/models/drone.glb";
  const initialReloadCount = (await page.evaluate(() => window.__agf!.reloadCount)) as number;

  const original = readFileSync(droneGlbPath);
  writeFileSync(droneGlbPath, original);

  await page.waitForFunction(
    ({ baseline, ref }) => {
      const agf = window.__agf;
      return (agf?.reloadCount ?? 0) > baseline && agf?.lastReloadedAsset === ref;
    },
    { baseline: initialReloadCount, ref: expectedRef },
    { timeout: 10_000 }
  );

  const count = (await page.evaluate(() => window.__agf!.reloadCount)) as number;
  expect(count).toBeGreaterThan(initialReloadCount);
});
