import { expect, test } from "@playwright/test";
import { waitForAgfReady } from "./_shared/agf";

test("?project=beacon-world loads the beacon-world project", async ({ page }) => {
  await page.goto("/?project=beacon-world");
  await waitForAgfReady(page);

  const projectName = await page.getByTestId("project-name").textContent();
  const projectId = await page.getByTestId("project-id").textContent();

  expect(projectName?.trim()).toBe("Beacon World");
  expect(projectId?.trim()).toBe("beacon-world");

  const snapshot = await page.evaluate(() => window.__agf!.snapshot());
  const entityIds = snapshot.entities.map((entity) => entity.id);

  expect(entityIds).toContain("player.drone");
  expect(entityIds).toContain("beacon.west");
  expect(entityIds).toContain("beacon.east");
});

test("default project is hello-3d when no ?project is provided", async ({ page }) => {
  await page.goto("/");
  await waitForAgfReady(page);

  const projectId = await page.getByTestId("project-id").textContent();
  expect(projectId?.trim()).toBe("hello-3d");

  const snapshot = await page.evaluate(() => window.__agf!.snapshot());
  const entityIds = snapshot.entities.map((entity) => entity.id);
  expect(entityIds).toContain("cube.hero");
});

test("KeyD moves the Beacon World drone along +X", async ({ page }) => {
  await page.goto("/?project=beacon-world");
  await waitForAgfReady(page);
  await page.locator("canvas").click();

  const initialSnapshot = await page.evaluate(() => window.__agf!.snapshot());
  const droneInitial = initialSnapshot.entities.find((entity) => entity.id === "player.drone");
  const initialX = (droneInitial!.components["Transform"] as { position: [number, number, number] }).position[0];

  // S46 — actively poll the snapshot for visible drone movement instead of
  // a fixed `waitForTimeout(500)`. The historical budget assumed local-macOS
  // frame pacing; on ubuntu-latest PlayerInputSystem can take 1–2s before
  // the drone has moved a measurable amount.
  await page.keyboard.down("KeyD");
  await page.waitForFunction(
    (baseline) => {
      const api = (window as unknown as {
        __agf?: {
          snapshot?: () => { entities: Array<{ id: string; components: Record<string, unknown> }> };
        };
      }).__agf;
      const snap = api?.snapshot?.();
      const drone = snap?.entities.find((entity) => entity.id === "player.drone");
      const x = (drone?.components["Transform"] as { position?: [number, number, number] } | undefined)
        ?.position?.[0];
      return typeof x === "number" && x > baseline + 0.5;
    },
    initialX,
    { timeout: 15_000 }
  );
  await page.keyboard.up("KeyD");

  const finalSnapshot = await page.evaluate(() => window.__agf!.snapshot());
  const droneFinal = finalSnapshot.entities.find((entity) => entity.id === "player.drone");
  const finalX = (droneFinal!.components["Transform"] as { position: [number, number, number] }).position[0];

  expect(finalX).toBeGreaterThan(initialX + 0.5);
});
