import { expect, test } from "@playwright/test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { waitForAgfReady } from "./_shared/agf";

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

// S46: the playtest JSON budgets (`wait: 0.15s`) are calibrated for local
// macOS frame pacing. On ubuntu-latest's SwiftShader software-WebGL the
// physics + pickup chain takes 1–3 s after a teleport before the predicate
// flips. So `expectComponent` and `expectEntityMissing` poll for up to
// EXPECT_TIMEOUT_MS instead of reading the snapshot once. The `wait` step
// stays as a hard minimum (some scenarios *want* a delay before checking).
const EXPECT_TIMEOUT_MS = 10_000;

for (const { filePath, scenario } of scenarios) {
  test(`playtest: ${scenario.project} / ${scenario.id} — ${scenario.name}`, async ({ page }) => {
    await page.goto(`/?project=${encodeURIComponent(scenario.project)}`);
    await waitForAgfReady(page);

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
          // Poll snapshot until the predicate holds OR the timeout fires.
          // On timeout, fall through to the one-shot expect path so we
          // get the rich `toMatchObject` diff instead of a generic
          // waitForFunction timeout message.
          try {
            await page.waitForFunction(
              ({ entityId, component, match }) => {
                const api = (window as unknown as {
                  __agf?: {
                    snapshot?: () => {
                      entities: Array<{ id: string; components: Record<string, unknown> }>;
                    };
                  };
                }).__agf;
                const snap = api?.snapshot?.();
                const entity = snap?.entities.find((current) => current.id === entityId);
                const componentValue = entity?.components[component] as
                  | Record<string, unknown>
                  | undefined;
                if (componentValue === undefined) return false;
                for (const [k, v] of Object.entries(match)) {
                  if (componentValue[k] !== v) return false;
                }
                return true;
              },
              { entityId: step.entityId, component: step.component, match: step.match },
              { timeout: EXPECT_TIMEOUT_MS }
            );
          } catch {
            // fall through to the one-shot expect — produces the rich diff.
          }
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
          try {
            await page.waitForFunction(
              (entityId) => {
                const api = (window as unknown as {
                  __agf?: { snapshot?: () => { entities: Array<{ id: string }> } };
                }).__agf;
                const snap = api?.snapshot?.();
                return snap !== undefined && !snap.entities.some((e) => e.id === entityId);
              },
              step.entityId,
              { timeout: EXPECT_TIMEOUT_MS }
            );
          } catch {
            // fall through to one-shot
          }
          const snapshot = (await page.evaluate(() => window.__agf!.snapshot())) as Snapshot;
          const entity = snapshot.entities.find((current) => current.id === step.entityId);
          expect(entity, `${label}: entity "${step.entityId}" should be absent`).toBeUndefined();
          break;
        }
      }
    }
  });
}
