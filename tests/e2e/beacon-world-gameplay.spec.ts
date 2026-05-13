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

  // Start the test from a clean state — repaired beacons / consumed pickups
  // from previous tests cannot bleed through.
  await page.evaluate(() => window.__agf!.resetRound());

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

  await page.waitForFunction(
    () => {
      const snapshot = window.__agf!.snapshot();
      const drone = snapshot.entities.find((entity) => entity.id === "player.drone");
      const carrier = drone?.components["Carrier"] as { carrying?: string } | undefined;
      return carrier?.carrying === "core.north";
    },
    undefined,
    { timeout: 5000 }
  );

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

  await page.waitForFunction(
    () => {
      const snapshot = window.__agf!.snapshot();
      const beacon = snapshot.entities.find((entity) => entity.id === "beacon.west");
      const repair = beacon?.components["Repairable"] as { repaired?: boolean } | undefined;
      return repair?.repaired === true;
    },
    undefined,
    { timeout: 5000 }
  );

  const afterDeposit = (await page.evaluate(() => window.__agf!.snapshot())) as Snapshot;

  const droneAfter = afterDeposit.entities.find((entity) => entity.id === "player.drone");
  expect((droneAfter!.components["Carrier"] as { carrying?: string }).carrying).toBeUndefined();

  // After Sprint 7, cores with a respawnAfter survive but get marked consumed
  // and parked underground until the respawn timer fires.
  const coreAfter = afterDeposit.entities.find((entity) => entity.id === "core.north");
  expect(coreAfter).toBeDefined();
  const corePickup = coreAfter!.components["Pickup"] as {
    consumed?: boolean;
    respawnIn?: number;
  };
  expect(corePickup.consumed).toBe(true);
  expect(typeof corePickup.respawnIn).toBe("number");

  const beacon = afterDeposit.entities.find((entity) => entity.id === "beacon.west");
  const beaconRepair = beacon!.components["Repairable"] as {
    repaired?: boolean;
    decayIn?: number;
    originalMaterial?: string;
  };
  expect(beaconRepair.repaired).toBe(true);
  expect(beaconRepair.originalMaterial).toBe("runtime/materials/beacon.material.json");
  const renderer = beacon!.components["MeshRenderer"] as { color?: string; material?: string };
  expect(renderer.material).toBe("runtime/materials/beacon-repaired.material.json");
  expect(renderer.color).toBeUndefined();

  await testInfo.attach("post-repair-snapshot", {
    body: JSON.stringify(afterDeposit, null, 2),
    contentType: "application/json"
  });
});
