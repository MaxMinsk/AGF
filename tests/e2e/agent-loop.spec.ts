import { expect, test } from "@playwright/test";

type Vec3 = [number, number, number];

type Snapshot = {
  entityCount: number;
  entities: Array<{
    id: string;
    components: Record<string, unknown>;
  }>;
  time: { elapsed: number; frameCount: number; fixedStepCount: number };
};

test("robot observes SpinSystem and stops it via applyCommands", async ({ page }, testInfo) => {
  await page.goto("/");

  await page.waitForFunction(() => Boolean(window.__agf));

  const first = (await page.evaluate(() => window.__agf!.snapshot())) as Snapshot;
  expect(first.entityCount).toBeGreaterThan(0);
  const cubeFirst = first.entities.find((entity) => entity.id === "cube.hero");
  expect(cubeFirst).toBeDefined();
  const rotationFirst = (cubeFirst!.components["Transform"] as { rotation: Vec3 }).rotation[1];

  await page.waitForTimeout(500);

  const second = (await page.evaluate(() => window.__agf!.snapshot())) as Snapshot;
  const cubeSecond = second.entities.find((entity) => entity.id === "cube.hero");
  const rotationSecond = (cubeSecond!.components["Transform"] as { rotation: Vec3 }).rotation[1];

  expect(rotationSecond).toBeGreaterThan(rotationFirst);
  expect(second.time.fixedStepCount).toBeGreaterThan(first.time.fixedStepCount);

  await page.evaluate(() => {
    window.__agf!.applyCommands([
      {
        kind: "component.set",
        entityId: "cube.hero",
        component: "Spin",
        data: { axis: "y", speed: 0 }
      }
    ]);
  });

  await page.waitForTimeout(150);
  const beforePause = (await page.evaluate(() => window.__agf!.snapshot())) as Snapshot;
  const cubeBefore = beforePause.entities.find((entity) => entity.id === "cube.hero");
  const rotationBefore = (cubeBefore!.components["Transform"] as { rotation: Vec3 }).rotation[1];

  await page.waitForTimeout(300);
  const afterPause = (await page.evaluate(() => window.__agf!.snapshot())) as Snapshot;
  const cubeAfter = afterPause.entities.find((entity) => entity.id === "cube.hero");
  const rotationAfter = (cubeAfter!.components["Transform"] as { rotation: Vec3 }).rotation[1];

  expect(rotationAfter).toBeCloseTo(rotationBefore, 3);

  await testInfo.attach("final-snapshot", {
    body: JSON.stringify(afterPause, null, 2),
    contentType: "application/json"
  });
});
