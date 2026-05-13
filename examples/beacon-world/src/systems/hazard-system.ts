import type { EntityId } from "../../../../engine/core/ecs/types";
import type { QueryHandle, World } from "../../../../engine/core/ecs/world";
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
  damage?: number;
  invulnerabilitySeconds?: number;
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

type HealthComponent = {
  current: number;
  max: number;
};

type InvulnerableComponent = {
  until: number;
};

type RespawnableComponent = {
  position: Vec3;
};

const CONSUMED_PARK_Y = -100;
const DEFAULT_DAMAGE = 1;
const DEFAULT_INVULNERABILITY_SECONDS = 1;

/**
 * Hazards pulse a danger radius and damage any Carrier inside it. The Carrier
 * also drops whatever it is currently carrying. After a hit the Carrier gets a
 * short invulnerability window so a single approach doesn't cascade into
 * multiple hits.
 *
 * When `Health.current` reaches zero, the entity is respawned at its
 * `Respawnable.position` and `Health.current` is restored to `max`.
 */
export type HazardEvent = {
  kind: "damage";
  entityId: EntityId;
  remainingHealth: number;
  damage: number;
};

export type HazardSystemOptions = {
  onEvent?: (event: HazardEvent) => void;
};

export function createHazardSystem(options: HazardSystemOptions = {}): System {
  const onEvent = options.onEvent;
  let cachedWorld: World | undefined;
  let hazardQuery: QueryHandle | undefined;
  let candidateQuery: QueryHandle | undefined;
  return {
    name: "hazard",
    frameUpdate({ time, world }: SystemContext): void {
      if (world !== cachedWorld) {
        hazardQuery = world.createQuery(["Hazard", "Transform"]);
        candidateQuery = world.createQuery(["Transform"]);
        cachedWorld = world;
      }
      const hazards = hazardQuery!.run();
      if (hazards.length === 0) {
        return;
      }
      const candidates = candidateQuery!.run();

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

        for (const entityId of candidates) {
          if (entityId === hazardId) {
            continue;
          }
          const entityTransform = world.getComponent<TransformComponent>(entityId, "Transform");
          if (entityTransform === undefined) {
            continue;
          }
          if (distanceXZ(entityTransform.position ?? [0, 0, 0], hazardPos) >= radius) {
            continue;
          }

          const invulnerable = world.getComponent<InvulnerableComponent>(entityId, "Invulnerable");
          if (invulnerable !== undefined && invulnerable.until > time.elapsed) {
            continue;
          }

          handleHit(world, entityId, hazard, time.elapsed, onEvent);
        }
      }
    }
  };
}

function handleHit(
  world: World,
  entityId: EntityId,
  hazard: HazardComponent,
  elapsed: number,
  onEvent: ((event: HazardEvent) => void) | undefined
): void {
  const damage = hazard.damage ?? DEFAULT_DAMAGE;
  const invulnerabilitySeconds = hazard.invulnerabilitySeconds ?? DEFAULT_INVULNERABILITY_SECONDS;

  const health = world.getComponent<HealthComponent>(entityId, "Health");
  let nextHealth = health;
  if (health !== undefined) {
    const nextCurrent = Math.max(0, health.current - damage);
    nextHealth = { ...health, current: nextCurrent };
    world.setComponent(entityId, "Health", nextHealth);
    if (onEvent !== undefined) {
      onEvent({ kind: "damage", entityId, remainingHealth: nextCurrent, damage });
    }
  }

  dropCarried(world, entityId);

  if (nextHealth !== undefined && nextHealth.current === 0) {
    respawnEntity(world, entityId, nextHealth);
  }

  world.setComponent(entityId, "Invulnerable", { until: elapsed + invulnerabilitySeconds });
}

function dropCarried(world: World, carrierId: EntityId): void {
  const carrier = world.getComponent<CarrierComponent>(carrierId, "Carrier");
  if (carrier === undefined || carrier.carrying === undefined) {
    return;
  }
  const carriedId = carrier.carrying;
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

function respawnEntity(world: World, entityId: EntityId, health: HealthComponent): void {
  world.setComponent(entityId, "Health", { current: health.max, max: health.max });
  const respawnable = world.getComponent<RespawnableComponent>(entityId, "Respawnable");
  if (respawnable === undefined) {
    return;
  }
  const transform = world.getComponent<TransformComponent>(entityId, "Transform");
  if (transform === undefined) {
    world.setComponent(entityId, "Transform", { position: [...respawnable.position] });
  } else {
    world.setComponent(entityId, "Transform", {
      ...transform,
      position: [
        respawnable.position[0] ?? 0,
        respawnable.position[1] ?? 0,
        respawnable.position[2] ?? 0
      ]
    });
  }
}

function pulseRadius(elapsed: number, hazard: HazardComponent): number {
  const phase = ((elapsed % hazard.period) / hazard.period) * 2 * Math.PI;
  const norm = 0.5 + 0.5 * Math.sin(phase);
  return hazard.minRadius + (hazard.maxRadius - hazard.minRadius) * norm;
}

function distanceXZ(a: Vec3, b: Vec3): number {
  const dx = (a[0] ?? 0) - (b[0] ?? 0);
  const dz = (a[2] ?? 0) - (b[2] ?? 0);
  return Math.hypot(dx, dz);
}
