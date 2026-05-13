import { expect, test } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");
const droneGlbPath = resolve(repoRoot, "examples/beacon-world/assets/runtime/models/drone.glb");

test.describe.configure({ mode: "serial" });

test("editing drone.glb fires the asset HMR path", async ({ page }) => {
  await page.goto("/?project=beacon-world");
  await page.waitForFunction(() => Boolean(window.__agf));

  const expectedRef = "runtime/models/drone.glb";
  const initialEventCount = (await page.evaluate(() => window.__agf!.reloadEvents.length)) as number;

  const original = readFileSync(droneGlbPath);
  writeFileSync(droneGlbPath, original);

  await page.waitForFunction(
    ({ baseline, ref }) => {
      const events = window.__agf?.reloadEvents ?? [];
      for (let index = baseline; index < events.length; index += 1) {
        if (events[index]?.ref === ref) {
          return true;
        }
      }
      return false;
    },
    { baseline: initialEventCount, ref: expectedRef },
    { timeout: 10_000 }
  );

  const after = (await page.evaluate(() => ({
    count: window.__agf!.reloadCount,
    events: window.__agf!.reloadEvents.length
  }))) as { count: number; events: number };
  expect(after.events).toBeGreaterThan(initialEventCount);
  expect(after.count).toBeGreaterThan(0);
});
