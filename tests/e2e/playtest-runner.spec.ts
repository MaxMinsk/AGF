import { expect, test } from "@playwright/test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type WaitStep = { kind: "wait"; seconds: number };
type ApplyCommandsStep = { kind: "applyCommands"; commands: unknown[] };
type ExpectComponentStep = {
  kind: "expectComponent";
  entityId: string;
  component: string;
  match: Record<string, unknown>;
};
type ExpectEntityMissingStep = { kind: "expectEntityMissing"; entityId: string };

type Step = WaitStep | ApplyCommandsStep | ExpectComponentStep | ExpectEntityMissingStep;

type Scenario = {
  id: string;
  name: string;
  project: string;
  description?: string;
  steps: Step[];
};

type SnapshotEntity = {
  id: string;
  components: Record<string, unknown>;
};

type Snapshot = {
  entities: SnapshotEntity[];
};

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");
const examplesDir = resolve(repoRoot, "examples");

function discoverScenarios(): Array<{ filePath: string; scenario: Scenario }> {
  const results: Array<{ filePath: string; scenario: Scenario }> = [];
  if (!existsSync(examplesDir)) {
    return results;
  }
  for (const projectDirName of readdirSync(examplesDir)) {
    const playtestsDir = resolve(examplesDir, projectDirName, "playtests");
    if (!existsSync(playtestsDir)) {
      continue;
    }
    for (const fileName of readdirSync(playtestsDir)) {
      if (!fileName.endsWith(".playtest.json")) {
        continue;
      }
      const filePath = resolve(playtestsDir, fileName);
      const raw = readFileSync(filePath, "utf8");
      const scenario = JSON.parse(raw) as Scenario;
      results.push({ filePath, scenario });
    }
  }
  return results;
}

const scenarios = discoverScenarios();

for (const { filePath, scenario } of scenarios) {
  test(`playtest: ${scenario.project} / ${scenario.id} — ${scenario.name}`, async ({ page }) => {
    await page.goto(`/?project=${encodeURIComponent(scenario.project)}`);
    await page.waitForFunction(() => Boolean(window.__agf));

    for (let stepIndex = 0; stepIndex < scenario.steps.length; stepIndex += 1) {
      const step = scenario.steps[stepIndex];
      if (step === undefined) {
        continue;
      }
      const label = `${filePath}#steps[${stepIndex}] (${step.kind})`;

      switch (step.kind) {
        case "wait": {
          await page.waitForTimeout(Math.max(0, step.seconds * 1000));
          break;
        }
        case "applyCommands": {
          const commands = step.commands;
          await page.evaluate((payload) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            window.__agf!.applyCommands(payload as any);
          }, commands);
          break;
        }
        case "expectComponent": {
          const snapshot = (await page.evaluate(() => window.__agf!.snapshot())) as Snapshot;
          const entity = snapshot.entities.find((current) => current.id === step.entityId);
          expect(entity, `${label}: entity "${step.entityId}" should exist`).toBeDefined();
          const componentValue = entity!.components[step.component] as Record<string, unknown> | undefined;
          expect(
            componentValue,
            `${label}: entity "${step.entityId}" should have component "${step.component}"`
          ).toBeDefined();
          expect(
            componentValue,
            `${label}: ${step.entityId}.${step.component} should match ${JSON.stringify(step.match)}`
          ).toMatchObject(step.match);
          break;
        }
        case "expectEntityMissing": {
          const snapshot = (await page.evaluate(() => window.__agf!.snapshot())) as Snapshot;
          const entity = snapshot.entities.find((current) => current.id === step.entityId);
          expect(entity, `${label}: entity "${step.entityId}" should be absent`).toBeUndefined();
          break;
        }
      }
    }
  });
}
