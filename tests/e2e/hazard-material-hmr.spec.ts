import { expect, test } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");
const materialsDir = resolve(repoRoot, "examples/beacon-world/assets/runtime/materials");

test.describe.configure({ mode: "serial" });

test("both hazard materials fire agf:asset-changed HMR events", async ({ page }) => {
  await page.goto("/?project=beacon-world");
  await page.waitForFunction(() => Boolean(window.__agf));

  for (const filename of ["hazard-warning.material.json", "hazard-amber.material.json"]) {
    const filePath = resolve(materialsDir, filename);
    const ref = `runtime/materials/${filename}`;
    const baseline = (await page.evaluate(() => window.__agf!.reloadEvents.length)) as number;

    const original = readFileSync(filePath);
    writeFileSync(filePath, original);

    await page.waitForFunction(
      ({ baseline: from, ref: expected }) => {
        const events = window.__agf?.reloadEvents ?? [];
        for (let index = from; index < events.length; index += 1) {
          if (events[index]?.ref === expected) {
            return true;
          }
        }
        return false;
      },
      { baseline, ref },
      { timeout: 10_000 }
    );

    const fired = (await page.evaluate(() => window.__agf!.reloadEvents.length)) as number;
    expect(fired).toBeGreaterThan(baseline);
  }
});
