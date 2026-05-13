import type { System, SystemContext } from "../../../../engine/core/systems/types";
import type { QueryHandle, World } from "../../../../engine/core/ecs/world";
import { resetBeaconRound } from "../round-reset";

type RoundStateComponent = {
  phase: "active" | "complete";
  thresholdHealth: number;
  holdSeconds: number;
  holdProgress?: number;
  completedAt?: number;
  autoResetSeconds?: number;
};

const SIGNAL_ENTITY_ID = "world.signal";

/**
 * Project-local frame-phase system that watches the singleton
 * `world.signal.RoundState`. When the round is complete and at least
 * `autoResetSeconds` of elapsed time have passed since `completedAt`, the
 * system invokes `resetBeaconRound(world)`, which re-arms beacons, respawns
 * pickups and flips the phase back to active.
 *
 * If `autoResetSeconds` is undefined the system is a no-op — the round must
 * be reset manually via `KeyR` / `__agf.resetRound()`.
 */
export function createRoundAutoResetSystem(): System {
  let cachedWorld: World | undefined;
  let roundQuery: QueryHandle | undefined;
  return {
    name: "round-auto-reset",
    frameUpdate({ time, world }: SystemContext): void {
      if (world !== cachedWorld) {
        roundQuery = world.createQuery(["RoundState"]);
        cachedWorld = world;
      }
      for (const id of roundQuery!.run()) {
        if (id !== SIGNAL_ENTITY_ID) {
          continue;
        }
        const round = world.getComponent<RoundStateComponent>(id, "RoundState");
        if (round === undefined || round.phase !== "complete") {
          return;
        }
        const autoResetSeconds = round.autoResetSeconds;
        const completedAt = round.completedAt;
        if (autoResetSeconds === undefined || completedAt === undefined) {
          return;
        }
        if (time.elapsed - completedAt < autoResetSeconds) {
          return;
        }
        resetBeaconRound(world);
        return;
      }
    }
  };
}
