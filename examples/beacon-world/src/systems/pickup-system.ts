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
  originalPosition?: Vec3;
  respawnAfter?: number;
  consumed?: boolean;
  respawnIn?: number;
};

type RepairableComponent = {
  accepts: string;
  repaired?: boolean;
  repairedColor?: string;
  decayAfter?: number;
  decayIn?: number;
  originalMaterial?: string;
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
const CONSUMED_PARK_Y = -100;

export type PickupSystemOptions = {
  pickupRadius?: number;
  depositRadius?: number;
};

export function createPickupSystem(options: PickupSystemOptions = {}): System {
  const pickupRadius = options.pickupRadius ?? DEFAULT_PICKUP_RADIUS;
  const depositRadius = options.depositRadius ?? DEFAULT_DEPOSIT_RADIUS;

  return {
    name: "pickup",
    frameUpdate({ time, world }: SystemContext): void {
      tickPickupRespawns(world, time.dt);
      tickBeaconDecays(world, time.dt);

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
    const pickup = world.getComponent<PickupComponent>(pickupId, "Pickup");
    if (pickup === undefined || pickup.consumed === true) {
      continue;
    }
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
    const repairedRepair: RepairableComponent = { ...repair, repaired: true };
    if (renderer !== undefined) {
      if (renderer.material !== undefined) {
        repairedRepair.originalMaterial = renderer.material;
      }
      world.setComponent(beaconId, "MeshRenderer", {
        mesh: renderer.mesh,
        color: repair.repairedColor ?? DEFAULT_REPAIRED_COLOR
      });
    }
    if (repair.decayAfter !== undefined) {
      repairedRepair.decayIn = repair.decayAfter;
    }
    world.setComponent(beaconId, "Repairable", repairedRepair);

    despawnOrRemove(world, carriedId, pickup);
    world.setComponent(carrierId, "Carrier", {});
    return;
  }
}

function despawnOrRemove(world: World, pickupId: EntityId, pickup: PickupComponent): void {
  if (pickup.respawnAfter === undefined || pickup.originalPosition === undefined) {
    world.removeEntity(pickupId);
    return;
  }

  const parked: PickupComponent = {
    ...pickup,
    consumed: true,
    respawnIn: pickup.respawnAfter
  };
  world.setComponent(pickupId, "Pickup", parked);

  const transform = world.getComponent<TransformComponent>(pickupId, "Transform");
  const parkedPosition: [number, number, number] = [
    pickup.originalPosition[0] ?? 0,
    CONSUMED_PARK_Y,
    pickup.originalPosition[2] ?? 0
  ];
  if (transform === undefined) {
    world.setComponent(pickupId, "Transform", { position: parkedPosition });
  } else {
    world.setComponent(pickupId, "Transform", { ...transform, position: parkedPosition });
  }
}

function tickPickupRespawns(world: World, dt: number): void {
  if (dt <= 0) {
    return;
  }
  const pickups = world.query(["Pickup"]);
  for (const pickupId of pickups) {
    const pickup = world.getComponent<PickupComponent>(pickupId, "Pickup");
    if (pickup === undefined || pickup.consumed !== true) {
      continue;
    }
    const remaining = (pickup.respawnIn ?? 0) - dt;
    if (remaining > 0) {
      world.setComponent(pickupId, "Pickup", { ...pickup, respawnIn: remaining });
      continue;
    }

    const respawned: PickupComponent = { ...pickup };
    delete respawned.consumed;
    delete respawned.respawnIn;
    world.setComponent(pickupId, "Pickup", respawned);

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
    }
  }
}

function tickBeaconDecays(world: World, dt: number): void {
  if (dt <= 0) {
    return;
  }
  const beacons = world.query(["Repairable"]);
  for (const beaconId of beacons) {
    const repair = world.getComponent<RepairableComponent>(beaconId, "Repairable");
    if (repair === undefined || repair.repaired !== true || repair.decayIn === undefined) {
      continue;
    }
    const remaining = repair.decayIn - dt;
    if (remaining > 0) {
      world.setComponent(beaconId, "Repairable", { ...repair, decayIn: remaining });
      continue;
    }

    const renderer = world.getComponent<MeshRendererComponent>(beaconId, "MeshRenderer");
    if (renderer !== undefined) {
      const restored: MeshRendererComponent = { mesh: renderer.mesh };
      if (repair.originalMaterial !== undefined) {
        restored.material = repair.originalMaterial;
      } else if (renderer.color !== undefined) {
        restored.color = renderer.color;
      }
      world.setComponent(beaconId, "MeshRenderer", restored);
    }

    const decayed: RepairableComponent = { ...repair, repaired: false };
    delete decayed.decayIn;
    delete decayed.originalMaterial;
    world.setComponent(beaconId, "Repairable", decayed);
  }
}

function distanceXZ(a: Vec3, b: Vec3): number {
  const dx = (a[0] ?? 0) - (b[0] ?? 0);
  const dz = (a[2] ?? 0) - (b[2] ?? 0);
  return Math.hypot(dx, dz);
}
