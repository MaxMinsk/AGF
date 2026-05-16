// S59 WATER-bench. Minimal showcase for the planar `Reflector` helper:
// a 30×30 mirror on Y=0 plus three floating primitives above. The scene
// JSON declares everything — no procedural entity spawn — so this
// bootstrap is just the contract anchor.

import type { ProjectBootstrap } from "../../engine/runtime/project-bootstrap";

export const waterBenchBootstrap: ProjectBootstrap = {
  registerSystems(): void {
    // intentionally empty
  }
};
