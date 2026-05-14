// examples/batch-bench/ — perf-only project. No gameplay; the scene
// boots a camera + ambient + sun + ground, then the agent (or the
// dev-bridge) seeds N batchable entities via `__agf.applyCommands` and
// reads `__agf.rendererInfo()` to track draw calls / bucket sizes /
// frame timings.
//
// The bootstrap is intentionally minimal — no project-specific systems.

import type { ProjectBootstrap } from "../../engine/runtime/project-bootstrap";

export const batchBenchBootstrap: ProjectBootstrap = {
  registerSystems(): void {
    // No project-specific systems. The renderer pipeline (transform
    // resolve / camera sync / mesh lifecycle / material binding /
    // batching / mesh transform sync / light lifecycle) is registered
    // automatically by `startRuntime`.
  }
};
