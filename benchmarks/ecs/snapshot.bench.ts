// ECS-B1 pilot bench: `snapshotWorld` cost across entity counts.
//
// Snapshot is one of the hottest agent-facing read paths — every
// `window.__agf.snapshot()`, every `engine inspect`, every Playwright probe.
// If it isn't fast at 10k entities, the multi-page bridge and SSE event
// stream degrade together.

import { createSuite, type SuiteResult } from "./runner";
import { snapshotWorld } from "../../engine/runtime/inspect";
import type { TimeContext } from "../../engine/core/loop/types";
import { ENTITY_SIZES, makeWorld } from "./scene-fixtures";

const TIME: Readonly<TimeContext> = Object.freeze({
  elapsed: 0,
  dt: 1 / 60,
  fixedDt: 1 / 60,
  frameCount: 0,
  fixedStepCount: 0
});

export async function runSnapshotBench(): Promise<SuiteResult> {
  const suite = createSuite("ecs-snapshot");
  for (const size of ENTITY_SIZES) {
    suite.bench(`snapshotWorld @ ${size.toLocaleString("en-US")} entities`, () => {
      const world = makeWorld({ entities: size });
      return () => {
        snapshotWorld(world, TIME);
      };
    });
  }
  return suite.run();
}
