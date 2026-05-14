// examples/batch-bench/ — perf-only project. No gameplay; the scene
// boots a camera + ambient + sun + ground, then the bootstrap seeds a
// default grid of batchable boxes so the project shows something out
// of the box. The agent (or dev-bridge) can re-seed via
// `__agf.applyCommands` to test other shapes / counts and reads
// `__agf.rendererInfo()` to track draw calls / bucket sizes / frame
// timings.
//
// Default seed size is overridable via the `?seed=N` URL parameter
// (clamped 1..4096). `?seed=0` skips seeding for empty-baseline runs.

import type {
  ProjectBootstrap,
  ProjectUiContext,
  ProjectUiHandle
} from "../../engine/runtime/project-bootstrap";
import type { EngineCommand } from "../../engine/core/commands/types";

const DEFAULT_SEED_COUNT = 400;
const COLUMNS = 20;
const SPACING = 0.9;
const PALETTE: ReadonlyArray<string> = ["#9ad3ff", "#ffd29a", "#9affc7", "#d9a8ff"];

function resolveSeedCount(): number {
  if (typeof window === "undefined") {
    return DEFAULT_SEED_COUNT;
  }
  const raw = new URLSearchParams(window.location.search).get("seed");
  if (raw === null) {
    return DEFAULT_SEED_COUNT;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return DEFAULT_SEED_COUNT;
  }
  return Math.min(parsed, 4096);
}

function buildSeedCommands(count: number): EngineCommand[] {
  const commands: EngineCommand[] = [];
  const rows = Math.ceil(count / COLUMNS);
  const xOffset = ((COLUMNS - 1) * SPACING) / 2;
  const zOffset = ((rows - 1) * SPACING) / 2;
  for (let i = 0; i < count; i++) {
    const id = `bench.${i}`;
    const col = i % COLUMNS;
    const row = Math.floor(i / COLUMNS);
    commands.push({ kind: "entity.create", entityId: id });
    commands.push({
      kind: "component.set",
      entityId: id,
      component: "Transform",
      data: {
        position: [col * SPACING - xOffset, 0.4, row * SPACING - zOffset]
      }
    });
    commands.push({
      kind: "component.set",
      entityId: id,
      component: "MeshRenderer",
      data: { mesh: "box", color: PALETTE[i % PALETTE.length] }
    });
    commands.push({
      kind: "component.set",
      entityId: id,
      component: "Batchable",
      data: { group: "bench" }
    });
  }
  return commands;
}

export const batchBenchBootstrap: ProjectBootstrap = {
  registerSystems(): void {
    // No project-specific systems. The renderer pipeline (transform
    // resolve / camera sync / mesh lifecycle / material binding /
    // batching / mesh transform sync / light lifecycle) is registered
    // automatically by `startRuntime`.
  },
  attachUi({ runtime }: ProjectUiContext): ProjectUiHandle {
    const count = resolveSeedCount();
    if (count > 0) {
      runtime.applyCommands(buildSeedCommands(count));
    }
    return {
      dispose(): void {
        // Seeded entities live in the world; world teardown reclaims them.
      }
    };
  }
};
