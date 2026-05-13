import type { System, SystemContext } from "../../../../engine/core/systems/types";
import type { QueryHandle, World } from "../../../../engine/core/ecs/world";

type RoundStateComponent = {
  phase: "active" | "complete";
  thresholdHealth: number;
  holdSeconds: number;
  holdProgress?: number;
  completedAt?: number;
};

type WorldSignalComponent = { health?: number };

const SIGNAL_ENTITY_ID = "world.signal";

/**
 * Watches the singleton `RoundState` and `WorldSignal` components on the
 * `world.signal` entity. While `WorldSignal.health` stays `>= thresholdHealth`,
 * `holdProgress` accumulates. Once it reaches `holdSeconds`, the phase flips
 * to `"complete"` and `completedAt` is set. Phase never flips back.
 */
export function createRoundSystem(): System {
  let cachedWorld: World | undefined;
  let signalQuery: QueryHandle | undefined;
  return {
    name: "round",
    frameUpdate({ time, world }: SystemContext): void {
      if (world !== cachedWorld) {
        signalQuery = world.createQuery(["RoundState", "WorldSignal"]);
        cachedWorld = world;
      }
      const ids = signalQuery!.run();
      if (ids.length === 0) {
        return;
      }
      for (const id of ids) {
        if (id !== SIGNAL_ENTITY_ID) {
          continue;
        }
        const round = world.getComponent<RoundStateComponent>(id, "RoundState");
        const signal = world.getComponent<WorldSignalComponent>(id, "WorldSignal");
        if (round === undefined || signal === undefined) {
          continue;
        }
        if (round.phase === "complete") {
          continue;
        }
        const health = signal.health ?? 0;
        const dt = Math.max(time.dt, 0);
        let next: RoundStateComponent = { ...round };
        if (health >= round.thresholdHealth) {
          const progress = (round.holdProgress ?? 0) + dt;
          if (progress >= round.holdSeconds) {
            next = {
              ...next,
              holdProgress: round.holdSeconds,
              phase: "complete",
              completedAt: time.elapsed
            };
          } else {
            next = { ...next, holdProgress: progress };
          }
        } else if ((round.holdProgress ?? 0) > 0) {
          next = { ...next, holdProgress: 0 };
        } else {
          continue;
        }
        world.setComponent(id, "RoundState", next);
      }
    }
  };
}
