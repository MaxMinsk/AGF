import { expect, test } from "@playwright/test";

type Snapshot = {
  entities: Array<{
    id: string;
    components: Record<string, unknown>;
  }>;
};

test("drone picks up an energy core and repairs a beacon", async ({ page }, testInfo) => {
  await page.goto("/?project=beacon-world");
  await page.waitForFunction(() => Boolean(window.__agf));

  // Teleport the drone next to core.north so the pickup radius triggers.
  await page.evaluate(() => {
    window.__agf!.applyCommands([
      {
        kind: "component.set",
        entityId: "player.drone",
        component: "Transform",
        data: { position: [-1.5, 0.4, -2.5], rotation: [0, 0, 0], scale: [0.7, 0.7, 0.7] }
      }
    ]);
  });
  await page.waitForTimeout(150);

  const afterPickup = (await page.evaluate(() => window.__agf!.snapshot())) as Snapshot;
  const drone = afterPickup.entities.find((entity) => entity.id === "player.drone");
  expect((drone!.components["Carrier"] as { carrying?: string }).carrying).toBe("core.north");

  // Teleport next to beacon.west.
  await page.evaluate(() => {
    window.__agf!.applyCommands([
      {
        kind: "component.set",
        entityId: "player.drone",
        component: "Transform",
        data: { position: [-3.5, 0.4, 0], rotation: [0, 0, 0], scale: [0.7, 0.7, 0.7] }
      }
    ]);
  });
  await page.waitForTimeout(150);

  const afterDeposit = (await page.evaluate(() => window.__agf!.snapshot())) as Snapshot;

  const droneAfter = afterDeposit.entities.find((entity) => entity.id === "player.drone");
  expect((droneAfter!.components["Carrier"] as { carrying?: string }).carrying).toBeUndefined();

  expect(afterDeposit.entities.find((entity) => entity.id === "core.north")).toBeUndefined();

  const beacon = afterDeposit.entities.find((entity) => entity.id === "beacon.west");
  expect((beacon!.components["Repairable"] as { repaired?: boolean }).repaired).toBe(true);
  const renderer = beacon!.components["MeshRenderer"] as { color?: string; material?: string };
  expect(renderer.color).toBe("#4af0a8");
  expect(renderer.material).toBeUndefined();

  await testInfo.attach("post-repair-snapshot", {
    body: JSON.stringify(afterDeposit, null, 2),
    contentType: "application/json"
  });
});
