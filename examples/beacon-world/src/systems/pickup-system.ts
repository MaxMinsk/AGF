import type { EntityId } from "../../../../engine/core/ecs/types";
import type { QueryHandle, World } from "../../../../engine/core/ecs/world";
import type { System, SystemContext } from "../../../../engine/core/systems/types";

type PickupQueries = {
  carriers: QueryHandle;
  carryingPickups: QueryHandle;
  repairablesWithTransform: QueryHandle;
  pickupsAll: QueryHandle;
  repairablesAll: QueryHandle;
};

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
  repairedMaterial?: string;
  decayAfter?: number;
  decayIn?: number;
  originalMaterial?: string;
  originalColor?: string;
  lastRepairedBy?: string;
};

type PresenceComponent = { playerId: string };

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
  let cachedWorld: World | undefined;
  let queries: PickupQueries | undefined;

  return {
    name: "pickup",
    frameUpdate({ time, world }: SystemContext): void {
      if (world !== cachedWorld) {
        queries = {
          carriers: world.createQuery(["Carrier", "Transform"]),
          carryingPickups: world.createQuery(["Pickup", "Transform"]),
          repairablesWithTransform: world.createQuery(["Repairable", "Transform"]),
          pickupsAll: world.createQuery(["Pickup"]),
          repairablesAll: world.createQuery(["Repairable"])
        };
        cachedWorld = world;
      }
      const q = queries!;
      tickPickupRespawns(world, time.dt, q);
      tickBeaconDecays(world, time.dt, q);

      const carriers = q.carriers.run();
      for (const carrierId of carriers) {
        const carrier = world.getComponent<CarrierComponent>(carrierId, "Carrier");
        const transform = world.getComponent<TransformComponent>(carrierId, "Transform");
        if (carrier === undefined || transform === undefined) {
          continue;
        }
        const position = transform.position ?? [0, 0, 0];

        if (carrier.carrying === undefined) {
          tryPickup(world, carrierId, position, pickupRadius, q);
        } else {
          handleCarry(world, carrierId, carrier.carrying, position, depositRadius, q);
        }
      }
    }
  };
}

function tryPickup(
  world: World,
  carrierId: EntityId,
  position: Vec3,
  radius: number,
  q: PickupQueries
): void {
  const pickups = q.carryingPickups.run();
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
  depositRadius: number,
  q: PickupQueries
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

  const repairables = q.repairablesWithTransform.run();
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
      if (renderer.color !== undefined) {
        repairedRepair.originalColor = renderer.color;
      }
      const repaired: MeshRendererComponent = { mesh: renderer.mesh };
      if (repair.repairedMaterial !== undefined) {
        repaired.material = repair.repairedMaterial;
      } else {
        repaired.color = repair.repairedColor ?? DEFAULT_REPAIRED_COLOR;
      }
      world.setComponent(beaconId, "MeshRenderer", repaired);
    }
    if (repair.decayAfter !== undefined) {
      repairedRepair.decayIn = repair.decayAfter;
    }
    const carrierPresence = world.getComponent<PresenceComponent>(carrierId, "Presence");
    if (carrierPresence?.playerId !== undefined) {
      repairedRepair.lastRepairedBy = carrierPresence.playerId;
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

function tickPickupRespawns(world: World, dt: number, q: PickupQueries): void {
  if (dt <= 0) {
    return;
  }
  const pickups = q.pickupsAll.run();
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

function tickBeaconDecays(world: World, dt: number, q: PickupQueries): void {
  if (dt <= 0) {
    return;
  }
  const beacons = q.repairablesAll.run();
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
      } else if (repair.originalColor !== undefined) {
        restored.color = repair.originalColor;
      } else if (renderer.color !== undefined) {
        restored.color = renderer.color;
      }
      world.setComponent(beaconId, "MeshRenderer", restored);
    }

    const decayed: RepairableComponent = { ...repair, repaired: false };
    delete decayed.decayIn;
    delete decayed.originalMaterial;
    delete decayed.originalColor;
    delete decayed.lastRepairedBy;
    world.setComponent(beaconId, "Repairable", decayed);
  }
}

function distanceXZ(a: Vec3, b: Vec3): number {
  const dx = (a[0] ?? 0) - (b[0] ?? 0);
  const dz = (a[2] ?? 0) - (b[2] ?? 0);
  return Math.hypot(dx, dz);
}
