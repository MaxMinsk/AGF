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
