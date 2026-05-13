import type { System, SystemContext } from "../../../../engine/core/systems/types";
import type { World } from "../../../../engine/core/ecs/world";

type RepairableComponent = { accepts: string; repaired?: boolean };
type WorldSignalComponent = { health?: number; target?: number; tau?: number };

const DEFAULT_TAU = 2;
const SIGNAL_ENTITY_ID = "world.signal";

/**
 * Frame-phase system that maintains a smoothed world-signal value on the
 * `world.signal` singleton entity. The value is derived from the
 * repaired-beacon ratio every frame; agents read it through the standard
 * snapshot path.
 */
export function createWorldSignalSystem(): System {
  return {
    name: "world-signal",
    frameUpdate({ time, world }: SystemContext): void {
      if (!world.hasEntity(SIGNAL_ENTITY_ID)) {
        return;
      }
      const signal =
        world.getComponent<WorldSignalComponent>(SIGNAL_ENTITY_ID, "WorldSignal") ?? {};

      const target = currentRepairedRatio(world);
      const tau = signal.tau ?? DEFAULT_TAU;
      const previous = signal.health ?? 0;
      const dt = Math.max(time.dt, 0);
      const blend = 1 - Math.exp(-tau * dt);
      const next = previous + (target - previous) * blend;

      world.setComponent(SIGNAL_ENTITY_ID, "WorldSignal", {
        ...signal,
        health: clamp01(next),
        target: clamp01(target),
        tau
      });
    }
  };
}

function currentRepairedRatio(world: World): number {
  const beacons = world.query(["Repairable"]);
  if (beacons.length === 0) {
    return 0;
  }
  let repaired = 0;
  for (const id of beacons) {
    const repair = world.getComponent<RepairableComponent>(id, "Repairable");
    if (repair?.repaired === true) {
      repaired += 1;
    }
  }
  return repaired / beacons.length;
}

function clamp01(value: number): number {
  if (value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  return value;
}
