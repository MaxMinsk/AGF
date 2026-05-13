import type { ProjectBootstrap } from "../../engine/runtime/project-bootstrap";

/**
 * Hello-3D is the minimal renderer fixture — it has no project-specific
 * systems, UI, or restart action. Implementing the bootstrap interface here
 * is mostly a contract anchor.
 */
export const hello3DBootstrap: ProjectBootstrap = {
  registerSystems(): void {
    // intentionally empty
  }
};
