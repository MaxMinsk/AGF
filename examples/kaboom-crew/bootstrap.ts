import { createGridOccupancySystem } from "../../engine/core/systems/grid-occupancy-system";
import { createGridMovementSystem } from "../../engine/core/systems/grid-movement-system";
import type {
  ProjectBootstrap,
  ProjectBootstrapContext,
  ProjectUiContext,
  ProjectUiHandle
} from "../../engine/runtime/project-bootstrap";
import type { RuntimeHandle } from "../../engine/runtime/start";
import startSceneJson from "./scenes/start.scene.json";
import { createKaboomPlayerInputSystem } from "./src/systems/player-input-system";
import { createKaboomBombPlacementSystem } from "./src/systems/bomb-placement-system";
import { createKaboomBombFuseSystem } from "./src/systems/bomb-fuse-system";
import { createKaboomBlastPropagationSystem } from "./src/systems/blast-propagation-system";
import { createKaboomBlastTileLifetimeSystem } from "./src/systems/blast-tile-lifetime-system";
import { createKaboomRoundResolveSystem } from "./src/systems/round-resolve-system";
import { createKaboomBotAISystem } from "./src/systems/bot-ai-system";

/**
 * S81 KABOOM-PROJECT-SCAFFOLD + S82 gameplay v0.
 *
 * Registers the grid stack, the project-local player input, the bomb
 * pipeline (place → fuse → blast → damage → tile lifetime), and the
 * round-resolve / restart system.
 *
 * KABOOM-RESTART: `resetRound(runtime)` is the canonical entry point —
 * the input layer writes `RoundRestartRequest` transients when the
 * player hits R, RoundResolveSystem ignores them while the round is
 * still in progress + invokes the on-restart callback when the round
 * has ended. The callback applies a `scene.load` command against the
 * static start scene, which rebuilds the world deterministically.
 */
function restartScene(runtime: RuntimeHandle): number {
  runtime.applyCommands([{ kind: "scene.load", scene: startSceneJson as never }]);
  return 1;
}

export const kaboomCrewBootstrap: ProjectBootstrap = {
  registerSystems({ scheduler }: ProjectBootstrapContext): void {
    const occupancy = createGridOccupancySystem();
    scheduler.register(occupancy, { profiles: ["static"] });

    scheduler.register(createGridMovementSystem({ occupancy }), { profiles: ["static"] });
    scheduler.register(createKaboomPlayerInputSystem(), { profiles: ["static"] });

    // Bomb pipeline.
    scheduler.register(createKaboomBombPlacementSystem({ occupancy }), { profiles: ["static"] });
    scheduler.register(createKaboomBombFuseSystem(), { profiles: ["static"] });
    scheduler.register(createKaboomBlastPropagationSystem({ occupancy }), { profiles: ["static"] });
    scheduler.register(createKaboomBlastTileLifetimeSystem({ occupancy }), { profiles: ["static"] });

    // Bot AI runs in fixedUpdate so per-frame variance doesn't change
    // decisions; seeded RNG keeps replay recordings reproducible.
    scheduler.register(createKaboomBotAISystem({ occupancy, seed: 1337 }), { profiles: ["static"] });

    // Round resolve is constructed without an onRestart callback at
    // registerSystems time (runtime isn't available yet). attachUi
    // wires the restart path via bootstrap.resetRound — runtime calls
    // that for KeyR via the host AppHandle.
    scheduler.register(createKaboomRoundResolveSystem({ playerId: "player.1" }), { profiles: ["static"] });
  },

  attachUi({ runtime }: ProjectUiContext): ProjectUiHandle {
    const handleKey = (event: KeyboardEvent): void => {
      if (event.code !== "KeyR") return;
      restartScene(runtime);
    };
    window.addEventListener("keydown", handleKey);
    return {
      dispose(): void {
        window.removeEventListener("keydown", handleKey);
      }
    };
  },

  resetRound(runtime: RuntimeHandle): number {
    return restartScene(runtime);
  }
};
