import type { World } from "../../../engine/core/ecs/world";

type Vec3 = ReadonlyArray<number>;

type RepairableComponent = {
  accepts: string;
  repaired?: boolean;
  repairedMaterial?: string;
  decayAfter?: number;
  decayIn?: number;
  originalMaterial?: string;
  originalColor?: string;
};

type MeshRendererComponent = {
  mesh: string;
  material?: string;
  color?: string;
};

type PickupComponent = {
  kind: string;
  originalPosition?: Vec3;
  respawnAfter?: number;
  consumed?: boolean;
  respawnIn?: number;
};

type TransformComponent = {
  position?: Vec3;
  rotation?: Vec3;
  scale?: Vec3;
};

type RoundStateComponent = {
  phase: "active" | "complete";
  thresholdHealth: number;
  holdSeconds: number;
  holdProgress?: number;
  completedAt?: number;
  autoResetSeconds?: number;
};

const ROUND_ENTITY_ID = "world.signal";

/**
 * Project-local helper that resets the Beacon World round to a fresh state.
 * Re-arms all `Repairable` beacons (restoring the original material/colour),
 * respawns every consumed `Pickup` at its `originalPosition`, and flips
 * `RoundState` back to `"active"` with `holdProgress = 0`. Returns the number
 * of mutations applied (useful for tests / log lines).
 */
export function resetBeaconRound(world: World): number {
  let mutations = 0;

  for (const beaconId of world.query(["Repairable"])) {
    const repair = world.getComponent<RepairableComponent>(beaconId, "Repairable");
    if (repair === undefined) {
      continue;
    }

    if (repair.repaired === true) {
      const renderer = world.getComponent<MeshRendererComponent>(beaconId, "MeshRenderer");
      if (renderer !== undefined) {
        const restored: MeshRendererComponent = { mesh: renderer.mesh };
        if (repair.originalMaterial !== undefined) {
          restored.material = repair.originalMaterial;
        } else if (repair.originalColor !== undefined) {
          restored.color = repair.originalColor;
        } else if (renderer.color !== undefined) {
          restored.color = renderer.color;
        }
        world.setComponent(beaconId, "MeshRenderer", restored);
        mutations += 1;
      }
      const reset: RepairableComponent = { ...repair, repaired: false };
      delete reset.decayIn;
      delete reset.originalMaterial;
      delete reset.originalColor;
      world.setComponent(beaconId, "Repairable", reset);
      mutations += 1;
    }
  }

  for (const pickupId of world.query(["Pickup"])) {
    const pickup = world.getComponent<PickupComponent>(pickupId, "Pickup");
    if (pickup === undefined) {
      continue;
    }
    if (pickup.consumed !== true) {
      continue;
    }
    const reset: PickupComponent = { kind: pickup.kind };
    if (pickup.originalPosition !== undefined) {
      reset.originalPosition = pickup.originalPosition;
    }
    if (pickup.respawnAfter !== undefined) {
      reset.respawnAfter = pickup.respawnAfter;
    }
    world.setComponent(pickupId, "Pickup", reset);
    mutations += 1;

    if (pickup.originalPosition !== undefined) {
      const transform = world.getComponent<TransformComponent>(pickupId, "Transform") ?? {};
      world.setComponent(pickupId, "Transform", {
        ...transform,
        position: [
          pickup.originalPosition[0] ?? 0,
          pickup.originalPosition[1] ?? 0,
          pickup.originalPosition[2] ?? 0
        ]
      });
      mutations += 1;
    }
  }

  if (world.hasEntity(ROUND_ENTITY_ID)) {
    const round = world.getComponent<RoundStateComponent>(ROUND_ENTITY_ID, "RoundState");
    if (round !== undefined) {
      const next: RoundStateComponent = {
        phase: "active",
        thresholdHealth: round.thresholdHealth,
        holdSeconds: round.holdSeconds,
        holdProgress: 0
      };
      if (round.autoResetSeconds !== undefined) {
        next.autoResetSeconds = round.autoResetSeconds;
      }
      world.setComponent(ROUND_ENTITY_ID, "RoundState", next);
      mutations += 1;
    }
  }

  return mutations;
}
