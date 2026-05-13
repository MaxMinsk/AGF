import { expect, test } from "@playwright/test";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");
const materialsDir = resolve(repoRoot, "examples/beacon-world/assets/runtime/materials");

test.describe.configure({ mode: "serial" });

test("every material under examples/beacon-world fires the agf:asset-changed HMR path", async ({ page }) => {
  await page.goto("/?project=beacon-world");
  await page.waitForFunction(() => Boolean(window.__agf));

  const materials = readdirSync(materialsDir).filter((name) => name.endsWith(".material.json"));
  expect(materials.length).toBeGreaterThan(0);

  for (const filename of materials) {
    const filePath = resolve(materialsDir, filename);
    const expectedRef = `runtime/materials/${filename}`;
    const baseline = (await page.evaluate(() => window.__agf!.reloadEvents.length)) as number;

    const original = readFileSync(filePath);
    writeFileSync(filePath, original);

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
      { baseline, ref: expectedRef },
      { timeout: 10_000 }
    );
  }
});
