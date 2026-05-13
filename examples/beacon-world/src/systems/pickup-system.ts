import type { EntityId } from "../../../../engine/core/ecs/types";
import type { World } from "../../../../engine/core/ecs/world";
import type { System, SystemContext } from "../../../../engine/core/systems/types";

type Vec3 = ReadonlyArray<number>;

type TransformComponent = {
  position?: Vec3;
  rotation?: Vec3;
  scale?: Vec3;
};

type CarrierComponent = {
  carrying?: EntityId;
};

type PickupComponent = {
  kind: string;
};

type RepairableComponent = {
  accepts: string;
  repaired?: boolean;
  repairedColor?: string;
};

type MeshRendererComponent = {
  mesh: string;
  material?: string;
  color?: string;
};

const DEFAULT_PICKUP_RADIUS = 1.2;
const DEFAULT_DEPOSIT_RADIUS = 1.6;
const CARRY_HEIGHT_OFFSET = 0.6;
const DEFAULT_REPAIRED_COLOR = "#4af0a8";

export type PickupSystemOptions = {
  pickupRadius?: number;
  depositRadius?: number;
};

export function createPickupSystem(options: PickupSystemOptions = {}): System {
  const pickupRadius = options.pickupRadius ?? DEFAULT_PICKUP_RADIUS;
  const depositRadius = options.depositRadius ?? DEFAULT_DEPOSIT_RADIUS;

  return {
    name: "pickup",
    frameUpdate({ world }: SystemContext): void {
      const carriers = world.query(["Carrier", "Transform"]);
      for (const carrierId of carriers) {
        const carrier = world.getComponent<CarrierComponent>(carrierId, "Carrier");
        const transform = world.getComponent<TransformComponent>(carrierId, "Transform");
        if (carrier === undefined || transform === undefined) {
          continue;
        }
        const position = transform.position ?? [0, 0, 0];

        if (carrier.carrying === undefined) {
          tryPickup(world, carrierId, position, pickupRadius);
        } else {
          handleCarry(world, carrierId, carrier.carrying, position, depositRadius);
        }
      }
    }
  };
}

function tryPickup(world: World, carrierId: EntityId, position: Vec3, radius: number): void {
  const pickups = world.query(["Pickup", "Transform"]);
  let closestId: EntityId | undefined;
  let closestDist = Infinity;
  for (const pickupId of pickups) {
    const pickupTransform = world.getComponent<TransformComponent>(pickupId, "Transform");
    if (pickupTransform === undefined) {
      continue;
    }
    const dist = distanceXZ(position, pickupTransform.position ?? [0, 0, 0]);
    if (dist < radius && dist < closestDist) {
      closestId = pickupId;
      closestDist = dist;
    }
  }
  if (closestId !== undefined) {
    world.setComponent(carrierId, "Carrier", { carrying: closestId });
  }
}

function handleCarry(
  world: World,
  carrierId: EntityId,
  carriedId: EntityId,
  carrierPosition: Vec3,
  depositRadius: number
): void {
  if (!world.hasEntity(carriedId)) {
    world.setComponent(carrierId, "Carrier", {});
    return;
  }

  const pickup = world.getComponent<PickupComponent>(carriedId, "Pickup");
  if (pickup === undefined) {
    world.setComponent(carrierId, "Carrier", {});
    return;
  }

  const carriedTransform = world.getComponent<TransformComponent>(carriedId, "Transform");
  if (carriedTransform !== undefined) {
    world.setComponent(carriedId, "Transform", {
      ...carriedTransform,
      position: [
        carrierPosition[0] ?? 0,
        (carrierPosition[1] ?? 0) + CARRY_HEIGHT_OFFSET,
        carrierPosition[2] ?? 0
      ]
    });
  }

  const repairables = world.query(["Repairable", "Transform"]);
  for (const beaconId of repairables) {
    const repair = world.getComponent<RepairableComponent>(beaconId, "Repairable");
    if (repair === undefined || repair.repaired === true) {
      continue;
    }
    if (repair.accepts !== pickup.kind) {
      continue;
    }
    const beaconTransform = world.getComponent<TransformComponent>(beaconId, "Transform");
    if (beaconTransform === undefined) {
      continue;
    }
    if (distanceXZ(carrierPosition, beaconTransform.position ?? [0, 0, 0]) >= depositRadius) {
      continue;
    }

    const renderer = world.getComponent<MeshRendererComponent>(beaconId, "MeshRenderer");
    if (renderer !== undefined) {
      world.setComponent(beaconId, "MeshRenderer", {
        mesh: renderer.mesh,
        color: repair.repairedColor ?? DEFAULT_REPAIRED_COLOR
      });
    }
    world.setComponent(beaconId, "Repairable", { ...repair, repaired: true });
    world.removeEntity(carriedId);
    world.setComponent(carrierId, "Carrier", {});
    return;
  }
}

function distanceXZ(a: Vec3, b: Vec3): number {
  const dx = (a[0] ?? 0) - (b[0] ?? 0);
  const dz = (a[2] ?? 0) - (b[2] ?? 0);
  return Math.hypot(dx, dz);
}
