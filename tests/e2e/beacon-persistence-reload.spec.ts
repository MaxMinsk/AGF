import { expect, test } from "@playwright/test";

// M4-reload-e2e: locks the Sprint 30 persistence vertical. Beacon's
// `project.json#persistence.components = ["Repairable", "WorldSignal",
// "Scoreboard"]` means save() captures only those component values; load()
// re-applies them to entities that still exist in the scene.
//
// Steps:
//   1. Navigate to Beacon (static profile — local IndexedDB-backed store).
//   2. Mutate beacon.west's Repairable.repaired to true via applyCommands.
//   3. Call window.__agf.save() to persist.
//   4. Reload the page (same browser context → IndexedDB survives).
//   5. After bootstrap, call window.__agf.load(); assert the repair came back.

test("Beacon repair state survives a page reload via IndexedDB persistence", async ({ page }) => {
  await page.goto("/?project=beacon-world");
  await page.waitForFunction(
    () => Boolean((window as unknown as { __agf?: { snapshot?: () => unknown } }).__agf?.snapshot),
    { timeout: 5_000 }
  );

  // Sanity: scene defaults to unrepaired.
  const initial = await page.evaluate(() => {
    const snap = (window as unknown as { __agf: { snapshot: () => { entities: Array<{ id: string; components: Record<string, unknown> }> } } })
      .__agf.snapshot();
    const beacon = snap.entities.find((e) => e.id === "beacon.west");
    return beacon?.components["Repairable"] as { repaired?: boolean } | undefined;
  });
  expect(initial?.repaired).not.toBe(true);

  // Drive a repair through the official command channel — same path the
  // PickupSystem would use mid-game.
  await page.evaluate(() => {
    const api = (window as unknown as {
      __agf: { applyCommands: (commands: ReadonlyArray<unknown>) => void };
    }).__agf;
    api.applyCommands([
      {
        kind: "component.set",
        entityId: "beacon.west",
        component: "Repairable",
        data: {
          accepts: "core",
          repaired: true,
          repairedColor: "#4af0a8",
          repairedMaterial: "runtime/materials/beacon-repaired.material.json",
          lastRepairedBy: "alpha"
        }
      }
    ]);
  });

  // Persist + clear the IndexedDB scoped to this project. Save resolves with
  // the blob; load on a fresh page sees it via the same project/profile/slot.
  const saved = await page.evaluate(async () => {
    const api = (window as unknown as {
      __agf: { save: () => Promise<{ entities: Array<{ id: string; components: Record<string, unknown> }> }> };
    }).__agf;
    return await api.save();
  });
  const westEntry = saved.entities.find((e) => e.id === "beacon.west");
  expect((westEntry?.components["Repairable"] as { repaired?: boolean } | undefined)?.repaired).toBe(true);

  // Reload. IndexedDB stays — same origin, same browser context.
  await page.reload();
  await page.waitForFunction(
    () => Boolean((window as unknown as { __agf?: { snapshot?: () => unknown } }).__agf?.snapshot),
    { timeout: 5_000 }
  );

  // After reload the scene is fresh again (Repairable.repaired === false).
  const afterReloadInitial = await page.evaluate(() => {
    const snap = (window as unknown as { __agf: { snapshot: () => { entities: Array<{ id: string; components: Record<string, unknown> }> } } })
      .__agf.snapshot();
    const beacon = snap.entities.find((e) => e.id === "beacon.west");
    return (beacon?.components["Repairable"] as { repaired?: boolean } | undefined)?.repaired;
  });
  expect(afterReloadInitial).not.toBe(true);

  // Call load(); assert restoredEntities + the live snapshot reflects the save.
  const loadResult = await page.evaluate(async () => {
    const api = (window as unknown as {
      __agf: {
        load: () => Promise<{ blob: unknown; restoredEntities: string[] }>;
        snapshot: () => { entities: Array<{ id: string; components: Record<string, unknown> }> };
      };
    }).__agf;
    const result = await api.load();
    const snap = api.snapshot();
    const beacon = snap.entities.find((e) => e.id === "beacon.west");
    return {
      restoredEntities: result.restoredEntities,
      repaired: (beacon?.components["Repairable"] as { repaired?: boolean } | undefined)?.repaired,
      lastRepairedBy: (beacon?.components["Repairable"] as { lastRepairedBy?: string } | undefined)
        ?.lastRepairedBy
    };
  });

  expect(loadResult.restoredEntities).toContain("beacon.west");
  expect(loadResult.repaired).toBe(true);
  expect(loadResult.lastRepairedBy).toBe("alpha");

  // Clean up the IndexedDB so subsequent test runs start fresh.
  await page.evaluate(async () => {
    const api = (window as unknown as { __agf: { clearSave: () => Promise<void> } }).__agf;
    await api.clearSave();
  });
});
