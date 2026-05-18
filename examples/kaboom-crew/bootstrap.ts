import { createGridOccupancySystem } from "../../engine/core/systems/grid-occupancy-system";
import { createGridMovementSystem } from "../../engine/core/systems/grid-movement-system";
import type { ProjectBootstrap, ProjectBootstrapContext } from "../../engine/runtime/project-bootstrap";
import { createKaboomPlayerInputSystem } from "./src/systems/player-input-system";

/**
 * S81 KABOOM-PROJECT-SCAFFOLD + S82 KABOOM-PLAYER-INPUT.
 *
 * Kaboom Crew bootstrap. Registers the grid stack (occupancy + movement)
 * + the project-local player input system. Bot AI / bombs / pickups /
 * win-loss land in subsequent S82 stories.
 *
 * Profiles: gameplay-only (no networking yet) → `static`.
 */
export const kaboomCrewBootstrap: ProjectBootstrap = {
  registerSystems({ scheduler }: ProjectBootstrapContext): void {
    const occupancy = createGridOccupancySystem();
    scheduler.register(occupancy, { profiles: ["static"] });

    // GridMovementSystem reads the occupancy index — register the
    // occupancy handle BEFORE the mover so the same-frame data flow is
    // {occupancy.rebuild} → {mover.advance}.
    scheduler.register(createGridMovementSystem({ occupancy }), { profiles: ["static"] });

    scheduler.register(createKaboomPlayerInputSystem(), { profiles: ["static"] });
  }
};
