import type { EntityId } from "../../../../engine/core/ecs/types";
import type { World } from "../../../../engine/core/ecs/world";
import type { System, SystemContext } from "../../../../engine/core/systems/types";

type Vec3 = ReadonlyArray<number>;

type TransformComponent = {
  position?: Vec3;
  rotation?: Vec3;
  scale?: Vec3;
};

type HazardComponent = {
  minRadius: number;
  maxRadius: number;
  period: number;
};

type CarrierComponent = {
  carrying?: EntityId;
};

type PickupComponent = {
  kind: string;
  originalPosition?: Vec3;
  respawnAfter?: number;
  consumed?: boolean;
  respawnIn?: number;
};

const CONSUMED_PARK_Y = -100;

/**
 * Hazard pulses its danger radius between minRadius and maxRadius across the
 * declared period. Any Carrier whose Transform is inside the current radius on
 * the XZ plane loses its carried pickup — the pickup is parked underground and
 * scheduled for respawn (the same flow pickup-system uses on deposit).
 */
export function createHazardSystem(): System {
  return {
    name: "hazard",
    frameUpdate({ time, world }: SystemContext): void {
      const hazards = world.query(["Hazard", "Transform"]);
      if (hazards.length === 0) {
        return;
      }
      const carriers = world.query(["Carrier", "Transform"]);

      for (const hazardId of hazards) {
        const hazard = world.getComponent<HazardComponent>(hazardId, "Hazard");
        const hazardTransform = world.getComponent<TransformComponent>(hazardId, "Transform");
        if (hazard === undefined || hazardTransform === undefined) {
          continue;
        }

        const radius = pulseRadius(time.elapsed, hazard);
        world.setComponent(hazardId, "Transform", {
          ...hazardTransform,
          scale: [radius, radius, radius]
        });

        const hazardPos = hazardTransform.position ?? [0, 0, 0];
        for (const carrierId of carriers) {
          const carrier = world.getComponent<CarrierComponent>(carrierId, "Carrier");
          if (carrier === undefined || carrier.carrying === undefined) {
            continue;
          }
          const carrierTransform = world.getComponent<TransformComponent>(carrierId, "Transform");
          if (carrierTransform === undefined) {
            continue;
          }
          if (distanceXZ(carrierTransform.position ?? [0, 0, 0], hazardPos) >= radius) {
            continue;
          }
          dropCarried(world, carrierId, carrier.carrying);
        }
      }
    }
  };
}

function pulseRadius(elapsed: number, hazard: HazardComponent): number {
  const phase = ((elapsed % hazard.period) / hazard.period) * 2 * Math.PI;
  const norm = 0.5 + 0.5 * Math.sin(phase);
  return hazard.minRadius + (hazard.maxRadius - hazard.minRadius) * norm;
}

function dropCarried(world: World, carrierId: EntityId, carriedId: EntityId): void {
  if (!world.hasEntity(carriedId)) {
    world.setComponent(carrierId, "Carrier", {});
    return;
  }
  const pickup = world.getComponent<PickupComponent>(carriedId, "Pickup");
  if (pickup === undefined) {
    world.setComponent(carrierId, "Carrier", {});
    return;
  }

  if (pickup.respawnAfter !== undefined && pickup.originalPosition !== undefined) {
    world.setComponent(carriedId, "Pickup", {
      ...pickup,
      consumed: true,
      respawnIn: pickup.respawnAfter
    });
    const transform = world.getComponent<TransformComponent>(carriedId, "Transform");
    const parkedPosition: [number, number, number] = [
      pickup.originalPosition[0] ?? 0,
      CONSUMED_PARK_Y,
      pickup.originalPosition[2] ?? 0
    ];
    if (transform === undefined) {
      world.setComponent(carriedId, "Transform", { position: parkedPosition });
    } else {
      world.setComponent(carriedId, "Transform", { ...transform, position: parkedPosition });
    }
  } else {
    world.removeEntity(carriedId);
  }

  world.setComponent(carrierId, "Carrier", {});
}

function distanceXZ(a: Vec3, b: Vec3): number {
  const dx = (a[0] ?? 0) - (b[0] ?? 0);
  const dz = (a[2] ?? 0) - (b[2] ?? 0);
  return Math.hypot(dx, dz);
}
