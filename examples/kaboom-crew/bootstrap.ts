import { createGridOccupancySystem } from "../../engine/core/systems/grid-occupancy-system";
import { createGridMovementSystem } from "../../engine/core/systems/grid-movement-system";
import type { ProjectBootstrap, ProjectBootstrapContext } from "../../engine/runtime/project-bootstrap";
import { createKaboomPlayerInputSystem } from "./src/systems/player-input-system";
import { createKaboomBombPlacementSystem } from "./src/systems/bomb-placement-system";
import { createKaboomBombFuseSystem } from "./src/systems/bomb-fuse-system";
import { createKaboomBlastPropagationSystem } from "./src/systems/blast-propagation-system";
import { createKaboomBlastTileLifetimeSystem } from "./src/systems/blast-tile-lifetime-system";

/**
 * S81 KABOOM-PROJECT-SCAFFOLD + S82 gameplay v0. Registers the grid
 * stack, the project-local player input system, and the bomb pipeline
 * (place → fuse → blast → damage → tile lifetime). Bot AI / pickups /
 * round resolution land in subsequent S82 stories.
 *
 * Registration order matters: occupancy rebuild → movement → input →
 * bomb placement → fuse → blast → tile lifetime. Each step reads what
 * the previous step wrote.
 */
export const kaboomCrewBootstrap: ProjectBootstrap = {
  registerSystems({ scheduler }: ProjectBootstrapContext): void {
    const occupancy = createGridOccupancySystem();
    scheduler.register(occupancy, { profiles: ["static"] });

    scheduler.register(createGridMovementSystem({ occupancy }), { profiles: ["static"] });
    scheduler.register(createKaboomPlayerInputSystem(), { profiles: ["static"] });

    // S82 bomb pipeline.
    scheduler.register(createKaboomBombPlacementSystem({ occupancy }), { profiles: ["static"] });
    scheduler.register(createKaboomBombFuseSystem(), { profiles: ["static"] });
    scheduler.register(createKaboomBlastPropagationSystem({ occupancy }), { profiles: ["static"] });
    scheduler.register(createKaboomBlastTileLifetimeSystem({ occupancy }), { profiles: ["static"] });
  }
};
