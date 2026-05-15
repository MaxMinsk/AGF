import type { EntityId } from "../../../../engine/core/ecs/types";
import type { QueryHandle, World } from "../../../../engine/core/ecs/world";
import type { System, SystemContext } from "../../../../engine/core/systems/types";
import { pickDroneMaterialFor } from "../drone-palette";

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
  originalColor?: string;
  originalMaterial?: string;
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

// Used as the fallback when OverlappingTriggers3D is missing on the
// carrier (e.g. physics disabled). When sensor data IS available the
// system trusts the physics adapter's overlap set — the radii here
// match the sensor collider authoring in scenes/start.scene.json so
// behavior stays identical with or without physics.
const DEFAULT_PICKUP_RADIUS = 1.2;
const DEFAULT_DEPOSIT_RADIUS = 1.6;
const OVERLAPPING_TRIGGERS_3D = "OverlappingTriggers3D";

type OverlappingTriggers3DComponent = { entities: ReadonlyArray<EntityId> };
const CARRY_HEIGHT_OFFSET = 0.6;
const DEFAULT_REPAIRED_COLOR = "#4af0a8";
const CONSUMED_PARK_Y = -100;

export type PickupEvent =
  | { kind: "pickup"; carrierId: EntityId; pickupId: EntityId; playerId?: string }
  | { kind: "deposit"; carrierId: EntityId; beaconId: EntityId; playerId?: string };

export type PickupSystemOptions = {
  pickupRadius?: number;
  depositRadius?: number;
  /**
   * Fires once per pickup / deposit transition. Beacon World wires audio
   * cues through this; tests can also subscribe to assert the loop ran.
   */
  onEvent?: (event: PickupEvent) => void;
};

export function createPickupSystem(options: PickupSystemOptions = {}): System {
  const pickupRadius = options.pickupRadius ?? DEFAULT_PICKUP_RADIUS;
  const depositRadius = options.depositRadius ?? DEFAULT_DEPOSIT_RADIUS;
  const onEvent = options.onEvent;
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
          tryPickup(world, carrierId, position, pickupRadius, q, onEvent);
        } else {
          handleCarry(world, carrierId, carrier.carrying, position, depositRadius, q, onEvent);
        }
      }
    }
  };
}

type PickupEventHandler = (event: PickupEvent) => void;

function tryPickup(
  world: World,
  carrierId: EntityId,
  position: Vec3,
  radius: number,
  q: PickupQueries,
  onEvent: PickupEventHandler | undefined
): void {
  // beacon-physics-sensor-wiring: when the carrier has a sensor-driven
  // overlap set, trust it as the source of truth. Falls back to XZ
  // proximity when OverlappingTriggers3D is absent (physics disabled).
  const overlaps = world.getComponent<OverlappingTriggers3DComponent>(
    carrierId,
    OVERLAPPING_TRIGGERS_3D
  );
  const candidates: ReadonlyArray<EntityId> =
    overlaps?.entities ?? q.carryingPickups.run();
  let closestId: EntityId | undefined;
  let closestDist = Infinity;
  for (const pickupId of candidates) {
    const pickup = world.getComponent<PickupComponent>(pickupId, "Pickup");
    if (pickup === undefined || pickup.consumed === true) {
      continue;
    }
    const pickupTransform = world.getComponent<TransformComponent>(pickupId, "Transform");
    if (pickupTransform === undefined) {
      continue;
    }
    const dist = distanceXZ(position, pickupTransform.position ?? [0, 0, 0]);
    // Sensor mode trusts the overlap; proximity mode applies the radius.
    const inRange = overlaps !== undefined || dist < radius;
    if (inRange && dist < closestDist) {
      closestId = pickupId;
      closestDist = dist;
    }
  }
  if (closestId !== undefined) {
    world.setComponent(carrierId, "Carrier", { carrying: closestId });
    applyCarryTint(world, carrierId, closestId);
    // S47 game-feel: spark burst on the core at the moment of pickup.
    // Auto-removed after lifetime — no need to clean up.
    world.setComponent(closestId, "ParticleEmitter", {
      preset: "spark",
      lifetime: 0.35,
      rate: 70,
      maxParticles: 40,
      offset: [0, 0.2, 0]
    });
    if (onEvent !== undefined) {
      const presence = world.getComponent<PresenceComponent>(carrierId, "Presence");
      const event: PickupEvent = { kind: "pickup", carrierId, pickupId: closestId };
      if (presence?.playerId !== undefined) {
        event.playerId = presence.playerId;
      }
      onEvent(event);
    }
  }
}

function applyCarryTint(world: World, carrierId: EntityId, pickupId: EntityId): void {
  const presence = world.getComponent<PresenceComponent>(carrierId, "Presence");
  const ownerId = presence?.playerId;
  if (ownerId === undefined) {
    return;
  }
  const palette = pickDroneMaterialFor(ownerId);
  if (palette === undefined) {
    return;
  }
  const pickup = world.getComponent<PickupComponent>(pickupId, "Pickup");
  const renderer = world.getComponent<MeshRendererComponent>(pickupId, "MeshRenderer");
  if (pickup === undefined || renderer === undefined) {
    return;
  }
  if (pickup.originalColor !== undefined || pickup.originalMaterial !== undefined) {
    // Already tinted — keep the original stash so the eventual restore picks
    // up the visual the core had before the FIRST carrier touched it.
    world.setComponent(pickupId, "MeshRenderer", { mesh: renderer.mesh, material: palette });
    return;
  }
  const stash: PickupComponent = { ...pickup };
  if (renderer.color !== undefined) {
    stash.originalColor = renderer.color;
  }
  if (renderer.material !== undefined) {
    stash.originalMaterial = renderer.material;
  }
  world.setComponent(pickupId, "Pickup", stash);
  world.setComponent(pickupId, "MeshRenderer", { mesh: renderer.mesh, material: palette });
}

function clearCarryTint(world: World, pickupId: EntityId): void {
  const pickup = world.getComponent<PickupComponent>(pickupId, "Pickup");
  const renderer = world.getComponent<MeshRendererComponent>(pickupId, "MeshRenderer");
  if (pickup === undefined || renderer === undefined) {
    return;
  }
  if (pickup.originalColor === undefined && pickup.originalMaterial === undefined) {
    return;
  }
  const restored: MeshRendererComponent = { mesh: renderer.mesh };
  if (pickup.originalMaterial !== undefined) {
    restored.material = pickup.originalMaterial;
  } else if (pickup.originalColor !== undefined) {
    restored.color = pickup.originalColor;
  }
  const cleared: PickupComponent = { ...pickup };
  delete cleared.originalColor;
  delete cleared.originalMaterial;
  world.setComponent(pickupId, "Pickup", cleared);
  world.setComponent(pickupId, "MeshRenderer", restored);
}

function handleCarry(
  world: World,
  carrierId: EntityId,
  carriedId: EntityId,
  carrierPosition: Vec3,
  depositRadius: number,
  q: PickupQueries,
  onEvent: PickupEventHandler | undefined
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

  // Sensor-wiring: filter to repairables the carrier is currently
  // overlapping (per OverlappingTriggers3D). Fallback to a full scan +
  // radius check when no sensor data is available.
  const overlaps = world.getComponent<OverlappingTriggers3DComponent>(
    carrierId,
    OVERLAPPING_TRIGGERS_3D
  );
  const repairableCandidates: ReadonlyArray<EntityId> =
    overlaps?.entities ?? q.repairablesWithTransform.run();
  for (const beaconId of repairableCandidates) {
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
    // Apply the proximity cutoff only in fallback mode — sensor overlap
    // already means we're inside the deposit radius.
    if (
      overlaps === undefined &&
      distanceXZ(carrierPosition, beaconTransform.position ?? [0, 0, 0]) >= depositRadius
    ) {
      continue;
    }

    const carrierPresence = world.getComponent<PresenceComponent>(carrierId, "Presence");
    const ownerPlayerId = carrierPresence?.playerId;

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
      const paletteMaterial =
        ownerPlayerId !== undefined ? pickBeaconRepairedMaterial(ownerPlayerId) : undefined;
      if (paletteMaterial !== undefined) {
        repaired.material = paletteMaterial;
      } else if (repair.repairedMaterial !== undefined) {
        repaired.material = repair.repairedMaterial;
      } else {
        repaired.color = repair.repairedColor ?? DEFAULT_REPAIRED_COLOR;
      }
      world.setComponent(beaconId, "MeshRenderer", repaired);
    }
    if (repair.decayAfter !== undefined) {
      repairedRepair.decayIn = repair.decayAfter;
    }
    if (ownerPlayerId !== undefined) {
      repairedRepair.lastRepairedBy = ownerPlayerId;
    }
    world.setComponent(beaconId, "Repairable", repairedRepair);

    // S47 game-feel: scale-bounce + spark burst on repair.
    // Tween is replay-deterministic (lives on fixedUpdate). The
    // ParticleEmitter is visual-only — its `lifetime` auto-removes the
    // component once the burst is done so it doesn't accumulate.
    const baseScale = beaconTransform.scale ?? [1, 1, 1];
    const bounceScale: [number, number, number] = [
      (baseScale[0] ?? 1) * 1.18,
      (baseScale[1] ?? 1) * 1.18,
      (baseScale[2] ?? 1) * 1.18
    ];
    const baseScaleTriple: [number, number, number] = [
      baseScale[0] ?? 1,
      baseScale[1] ?? 1,
      baseScale[2] ?? 1
    ];
    world.setComponent(beaconId, "Tweens", [
      {
        component: "Transform",
        property: "scale",
        from: baseScaleTriple,
        to: bounceScale,
        duration: 0.36,
        ease: "pulse"
      }
    ]);
    world.setComponent(beaconId, "ParticleEmitter", {
      preset: "spark",
      lifetime: 0.5,
      rate: 80,
      maxParticles: 48,
      // Beacon extends from y ≈ -0.25 to y ≈ 2.25 (Transform.position.y 1.0
      // + scale.y 2.5 → unit-tall beacon.glb). Emit just above the tip so
      // sparks fountain UP rather than disappearing inside the mesh.
      offset: [0, 1.4, 0]
    });

    if (ownerPlayerId !== undefined) {
      incrementScoreFor(world, ownerPlayerId);
    }

    clearCarryTint(world, carriedId);
    const cleanedPickup =
      world.getComponent<PickupComponent>(carriedId, "Pickup") ?? pickup;
    despawnOrRemove(world, carriedId, cleanedPickup);
    world.setComponent(carrierId, "Carrier", {});
    if (onEvent !== undefined) {
      const event: PickupEvent = { kind: "deposit", carrierId, beaconId };
      if (ownerPlayerId !== undefined) {
        event.playerId = ownerPlayerId;
      }
      onEvent(event);
    }
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
    // Restore carry-tint visuals if the despawn path skipped them (e.g. hazard
    // drop). idempotent: no-op when no stash is present.
    if (respawned.originalColor !== undefined || respawned.originalMaterial !== undefined) {
      const renderer = world.getComponent<MeshRendererComponent>(pickupId, "MeshRenderer");
      if (renderer !== undefined) {
        const restored: MeshRendererComponent = { mesh: renderer.mesh };
        if (respawned.originalMaterial !== undefined) {
          restored.material = respawned.originalMaterial;
        } else if (respawned.originalColor !== undefined) {
          restored.color = respawned.originalColor;
        }
        world.setComponent(pickupId, "MeshRenderer", restored);
      }
      delete respawned.originalColor;
      delete respawned.originalMaterial;
    }
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

type RoundStateForScoring = {
  scores?: Record<string, number>;
  [key: string]: unknown;
};

const WORLD_SIGNAL_ENTITY_ID = "world.signal";

function incrementScoreFor(world: World, playerId: string): void {
  if (!world.hasEntity(WORLD_SIGNAL_ENTITY_ID)) {
    return;
  }
  const round = world.getComponent<RoundStateForScoring>(WORLD_SIGNAL_ENTITY_ID, "RoundState");
  if (round === undefined) {
    return;
  }
  const nextScores: Record<string, number> = { ...(round.scores ?? {}) };
  nextScores[playerId] = (nextScores[playerId] ?? 0) + 1;
  world.setComponent(WORLD_SIGNAL_ENTITY_ID, "RoundState", {
    ...round,
    scores: nextScores
  });
}

const BEACON_REPAIRED_PALETTE: ReadonlyArray<string> = [
  "runtime/materials/beacon-repaired-orange.material.json",
  "runtime/materials/beacon-repaired-cyan.material.json",
  "runtime/materials/beacon-repaired-violet.material.json",
  "runtime/materials/beacon-repaired-amber.material.json"
];

function pickBeaconRepairedMaterial(playerId: string): string | undefined {
  if (playerId.length === 0) {
    return undefined;
  }
  let hash = 0;
  for (let i = 0; i < playerId.length; i += 1) {
    hash = (hash * 31 + playerId.charCodeAt(i)) >>> 0;
  }
  return BEACON_REPAIRED_PALETTE[hash % BEACON_REPAIRED_PALETTE.length];
}

function distanceXZ(a: Vec3, b: Vec3): number {
  const dx = (a[0] ?? 0) - (b[0] ?? 0);
  const dz = (a[2] ?? 0) - (b[2] ?? 0);
  return Math.hypot(dx, dz);
}
