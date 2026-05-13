import { expect, test } from "@playwright/test";

type Snapshot = {
  entities: Array<{ id: string; components: Record<string, unknown> }>;
};

test("scoreboard row paints `data-pulse` when its player's repair count ticks", async ({ page }) => {
  await page.goto("/?project=beacon-world");
  await page.waitForFunction(() => Boolean(window.__agf));

  // Reset to a clean baseline so the test is order-independent.
  await page.evaluate(() => window.__agf!.resetRound());

  // Seed Presence on the local drone + a primed RoundState so the next repair
  // routes through the score-increment path.
  await page.evaluate(() => {
    window.__agf!.applyCommands([
      {
        kind: "component.set",
        entityId: "player.drone",
        component: "Presence",
        data: { playerId: "alpha" }
      },
      {
        kind: "component.set",
        entityId: "world.signal",
        component: "RoundState",
        data: {
          phase: "active",
          thresholdHealth: 0.85,
          holdSeconds: 3,
          holdProgress: 0,
          autoResetSeconds: 5,
          scores: {}
        }
      }
    ]);
  });

  // Teleport drone to a core, wait for pickup.
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
      const snap = window.__agf!.snapshot() as Snapshot;
      const drone = snap.entities.find((entity) => entity.id === "player.drone");
      const carrier = drone?.components["Carrier"] as { carrying?: string } | undefined;
      return carrier?.carrying === "core.north";
    },
    undefined,
    { timeout: 5000 }
  );

  // Teleport to beacon, wait for repair.
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
      const snap = window.__agf!.snapshot() as Snapshot;
      const beacon = snap.entities.find((entity) => entity.id === "beacon.west");
      const repair = beacon?.components["Repairable"] as { repaired?: boolean } | undefined;
      return repair?.repaired === true;
    },
    undefined,
    { timeout: 5000 }
  );

  // The HUD refreshes every 100ms; wait for the alpha row to appear with the pulse mark.
  await page.waitForFunction(
    () => {
      const row = document.querySelector('[data-testid="hud-score-alpha"]');
      return row !== null && row.getAttribute("data-pulse") === "true";
    },
    undefined,
    { timeout: 5000 }
  );

  const text = await page.getByTestId("hud-score-alpha").textContent();
  expect(text).toContain("alpha");
  expect(text).toContain("1");
});
