// S82 KABOOM-PICKUPS-AND-STATS (collect half).
//
// Each fixedUpdate, for every Pickup entity, check the occupancy index
// for a bomber on the same cell. If one is found, apply the stat
// effect and delete the pickup.
//
// Effects:
//   - bomb-up   → BomberStats.maxBombs += 1
//   - fire-up   → BomberStats.range += 1
//   - speed-up  → GridMover.speed += SPEED_STEP (additive cells/sec)
//
// Stat caps stop infinite stacking from a soft-block-heavy arena. The
// bomb-up + fire-up caps are conservative defaults; tweak via options.

import type { ComponentName } from "../../../../engine/core/ecs/types";
import type { QueryHandle, World } from "../../../../engine/core/ecs/world";
import type { System, SystemContext } from "../../../../engine/core/systems/types";
import type { GridOccupancyQuery } from "../../../../engine/core/systems/grid-occupancy-system";

const PICKUP: ComponentName = "Pickup";
const GRID_POSITION: ComponentName = "GridPosition";
const BOMBER_STATS: ComponentName = "BomberStats";
const GRID_MOVER: ComponentName = "GridMover";
const TRANSFORM: ComponentName = "Transform";
const PARTICLE_EMITTER: ComponentName = "ParticleEmitter";

// S096 KABOOM-PICKUP-COLLECT-PARTICLE — a one-shot 'spark' burst at the
// pickup's cell at the moment of collection. Lives on a fresh fx entity
// (the pickup itself is removed wholesale on collect) and the engine
// ParticleEmitter system auto-removes it when lifetime elapses.
const COLLECT_FX_LIFETIME_S = 0.35;
const COLLECT_FX_RATE = 80;
const COLLECT_FX_MAX_PARTICLES = 30;

type Pickup = { kind: "bomb-up" | "fire-up" | "speed-up" | "kick" };
type GridPos = { gx: number; gz: number };
type BomberStats = {
  maxBombs: number;
  range: number;
  speed?: number;
  activeBombs?: number;
  alive?: boolean;
  canKick?: boolean;
};
type GridMoverComponent = {
  speed: number;
  queuedDirection?: { dx: number; dz: number };
  currentLerp?: number;
  targetGx?: number;
  targetGz?: number;
};

export type PickupCollectSystemOptions = {
  occupancy: GridOccupancyQuery;
  name?: string;
  /** Cap on BomberStats.maxBombs. Default 8. */
  maxBombsCap?: number;
  /** Cap on BomberStats.range. Default 8. */
  maxRangeCap?: number;
  /** Cap on GridMover.speed. Default 12 (cells/sec). */
  maxSpeedCap?: number;
  /** Speed-up additive increment (cells/sec). Default 1. */
  speedStep?: number;
};

const SPEED_STEP_DEFAULT = 1;

export function createKaboomPickupCollectSystem(options: PickupCollectSystemOptions): System {
  const name = options.name ?? "kaboom.pickup-collect";
  const occupancy = options.occupancy;
  const maxBombsCap = options.maxBombsCap ?? 8;
  const maxRangeCap = options.maxRangeCap ?? 8;
  const maxSpeedCap = options.maxSpeedCap ?? 12;
  const speedStep = options.speedStep ?? SPEED_STEP_DEFAULT;

  let cachedWorld: World | undefined;
  let pickups: QueryHandle | undefined;

  const fixedUpdate = (context: SystemContext): void => {
    const world = context.world;
    if (world !== cachedWorld) {
      pickups = world.createQuery([PICKUP, GRID_POSITION]);
      cachedWorld = world;
    }
    // Snapshot the pickup ids — we'll delete inside the loop.
    const pickupIds = [...pickups!.run()];
    for (const pickupId of pickupIds) {
      const pickup = world.getComponent<Pickup>(pickupId, PICKUP);
      const pos = world.getComponent<GridPos>(pickupId, GRID_POSITION);
      if (pickup === undefined || pos === undefined) continue;
      const taken = tryApplyPickup(world, occupancy, pos.gx, pos.gz, pickup.kind, {
        maxBombsCap,
        maxRangeCap,
        maxSpeedCap,
        speedStep
      });
      if (taken) {
        // S096 KABOOM-PICKUP-COLLECT-PARTICLE — spawn a one-shot 'spark'
        // burst at the pickup's cell BEFORE removing the entity.
        const fxId = `${pickupId}.collect-fx`;
        if (!world.hasEntity(fxId)) {
          world.addEntity(fxId);
          world.setComponent(fxId, TRANSFORM, {
            position: [pos.gx, 0.4, pos.gz],
            rotation: [0, 0, 0],
            scale: [1, 1, 1]
          });
          world.setComponent(fxId, PARTICLE_EMITTER, {
            preset: "spark",
            lifetime: COLLECT_FX_LIFETIME_S,
            elapsed: 0,
            rate: COLLECT_FX_RATE,
            maxParticles: COLLECT_FX_MAX_PARTICLES
          });
        }
        world.removeEntity(pickupId);
      }
    }
  };

  return { name, fixedUpdate };
}

function tryApplyPickup(
  world: World,
  occupancy: GridOccupancyQuery,
  gx: number,
  gz: number,
  kind: Pickup["kind"],
  caps: { maxBombsCap: number; maxRangeCap: number; maxSpeedCap: number; speedStep: number }
): boolean {
  for (const id of occupancy.occupants(gx, gz)) {
    const stats = world.getComponent<BomberStats>(id, BOMBER_STATS);
    if (stats === undefined) continue;
    if (stats.alive === false) continue;
    if (kind === "bomb-up") {
      world.setComponent(id, BOMBER_STATS, { ...stats, maxBombs: Math.min(stats.maxBombs + 1, caps.maxBombsCap) });
    } else if (kind === "fire-up") {
      world.setComponent(id, BOMBER_STATS, { ...stats, range: Math.min(stats.range + 1, caps.maxRangeCap) });
    } else if (kind === "kick") {
      // S100 KABOOM-KICK-POWER-UP — enable kick mechanic on this bomber.
      // Idempotent: collecting a second kick has no effect.
      world.setComponent(id, BOMBER_STATS, { ...stats, canKick: true });
    } else {
      // speed-up bumps GridMover.speed AND mirrors into BomberStats.speed
      // so the HUD has a single read-from. GridMovementSystem reads from
      // GridMover.speed directly; BomberStats.speed is HUD-only.
      const mover = world.getComponent<GridMoverComponent>(id, GRID_MOVER);
      if (mover !== undefined) {
        const next = Math.min(mover.speed + caps.speedStep, caps.maxSpeedCap);
        world.setComponent(id, GRID_MOVER, { ...mover, speed: next });
        world.setComponent(id, BOMBER_STATS, { ...stats, speed: next });
      }
    }
    return true;
  }
  return false;
}
