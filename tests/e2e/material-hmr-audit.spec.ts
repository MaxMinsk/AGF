import { expect, test } from "@playwright/test";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");
const materialsDir = resolve(repoRoot, "examples/beacon-world/assets/runtime/materials");

test("every material under examples/beacon-world fires the agf:asset-changed HMR path", async ({ page }) => {
  await page.goto("/?project=beacon-world");
  await page.waitForFunction(() => Boolean(window.__agf));

  const materials = readdirSync(materialsDir).filter((name) => name.endsWith(".material.json"));
  expect(materials.length).toBeGreaterThan(0);

  for (const filename of materials) {
    const filePath = resolve(materialsDir, filename);
    const expectedRef = `runtime/materials/${filename}`;
    const before = (await page.evaluate(() => window.__agf!.reloadCount)) as number;

    const original = readFileSync(filePath);
    writeFileSync(filePath, original);

    await page.waitForFunction(
      ({ baseline, ref }) => {
        const agf = window.__agf;
        return (agf?.reloadCount ?? 0) > baseline && agf?.lastReloadedAsset === ref;
      },
      { baseline: before, ref: expectedRef },
      { timeout: 10_000 }
    );

    const after = (await page.evaluate(() => ({
      ref: window.__agf!.lastReloadedAsset,
      count: window.__agf!.reloadCount
    }))) as { ref: string | undefined; count: number };

    expect(after.ref).toBe(expectedRef);
    expect(after.count).toBeGreaterThan(before);
  }
});
