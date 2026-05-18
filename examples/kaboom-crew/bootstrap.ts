import type { ProjectBootstrap } from "../../engine/runtime/project-bootstrap";

/**
 * S81 KABOOM-PROJECT-SCAFFOLD. Kaboom Crew is the flagship MVP-0 sample
 * (codename "DynaBomber" in `notes/`). MVP 0 is an offline solo
 * vertical slice on the grid platform shipped in S081: ortho camera +
 * damped follow + 2D HUD + grid primitives + generator framework.
 *
 * Project-local bomb / blast / pickup / bot-AI systems land in S082 —
 * for now the bootstrap is the contract anchor.
 */
export const kaboomCrewBootstrap: ProjectBootstrap = {
  registerSystems(): void {
    // intentionally empty — game systems land in S082
  }
};
