import { expect, test } from "@playwright/test";

test("?project=beacon-world loads the beacon-world project", async ({ page }) => {
  await page.goto("/?project=beacon-world");

  await page.waitForFunction(() => Boolean(window.__agf));

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

  await page.waitForFunction(() => Boolean(window.__agf));

  const projectId = await page.getByTestId("project-id").textContent();
  expect(projectId?.trim()).toBe("hello-3d");

  const snapshot = await page.evaluate(() => window.__agf!.snapshot());
  const entityIds = snapshot.entities.map((entity) => entity.id);
  expect(entityIds).toContain("cube.hero");
});

test("KeyD moves the Beacon World drone along +X", async ({ page }) => {
  await page.goto("/?project=beacon-world");
  await page.waitForFunction(() => Boolean(window.__agf));
  await page.locator("canvas").click();

  const initialSnapshot = await page.evaluate(() => window.__agf!.snapshot());
  const droneInitial = initialSnapshot.entities.find((entity) => entity.id === "player.drone");
  const initialX = (droneInitial!.components["Transform"] as { position: [number, number, number] }).position[0];

  await page.keyboard.down("KeyD");
  await page.waitForTimeout(500);
  await page.keyboard.up("KeyD");
  await page.waitForTimeout(100);

  const finalSnapshot = await page.evaluate(() => window.__agf!.snapshot());
  const droneFinal = finalSnapshot.entities.find((entity) => entity.id === "player.drone");
  const finalX = (droneFinal!.components["Transform"] as { position: [number, number, number] }).position[0];

  expect(finalX).toBeGreaterThan(initialX + 0.5);
});
