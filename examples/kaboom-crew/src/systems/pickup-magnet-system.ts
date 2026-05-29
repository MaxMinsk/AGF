// S200 KABOOM-PICKUP-MAGNET. Pickups within MAGNET_RANGE cells of an
// alive bomber slide their visual Transform.position toward that
// bomber. The pickup's GridPosition stays put, so collection still
// happens cell-by-cell — only the cosmetic offset moves. Visually
// it reads as "this pickup is yours, come grab it" without changing
// the gameplay contract.
//
// Composes with the S191 pickup-hover-spin system: hover writes Y +
// rotation; magnet writes X + Z. They touch disjoint axes, so the
// order between them doesn't matter.

import type { ComponentName, EntityId } from "../../../../engine/core/ecs/types";
import type { QueryHandle, World } from "../../../../engine/core/ecs/world";
import type { System, SystemContext } from "../../../../engine/core/systems/types";

const TRANSFORM: ComponentName = "Transform";
const PICKUP: ComponentName = "Pickup";
const BOMBER_STATS: ComponentName = "BomberStats";
const GRID_POSITION: ComponentName = "GridPosition";

/** Cells. Past this distance the pickup ignores the bomber. */
const MAGNET_RANGE = 1.5;
/** Lerp rate per second. 6.0 → half-life ~115ms; tight + reads as a
 *  clear pull without snapping. */
const PULL_RATE = 6.0;
/** Lerp rate per second for the un-pull (no bomber in range). Slower
 *  so the pickup glides back rather than snapping. */
const RELEASE_RATE = 3.0;

type TransformLike = {
  position?: ReadonlyArray<number>;
  rotation?: ReadonlyArray<number>;
  scale?: ReadonlyArray<number>;
  parent?: string;
};

type BomberStatsComponent = { alive?: boolean };
type GridPos = { gx?: number; gz?: number };

export function createKaboomPickupMagnetSystem(): System {
  const name = "kaboom.pickup-magnet";
  // Authored X/Z per pickup — captured the first time we see it so
  // the pull always centres around the cell, not around wherever a
  // previous tick's pull left it.
  const authoredXZ = new Map<EntityId, { x: number; z: number }>();
  let cachedWorld: World | undefined;
  let pickups: QueryHandle | undefined;
  let bombers: QueryHandle | undefined;

  const fixedUpdate = (context: SystemContext): void => {
    const world = context.world;
    if (world !== cachedWorld) {
      pickups = world.createQuery([PICKUP, TRANSFORM, GRID_POSITION]);
      bombers = world.createQuery([BOMBER_STATS, TRANSFORM]);
      cachedWorld = world;
      authoredXZ.clear();
    }
    const dt = context.time.fixedDt;
    const bomberPositions = collectAliveBomberPositions(world, bombers!);
    for (const id of pickups!.run()) {
      const transform = world.getComponent<TransformLike>(id, TRANSFORM);
      if (transform === undefined || transform.position === undefined) continue;
      if (typeof transform.parent === "string" && transform.parent.length > 0) continue;
      const gp = world.getComponent<GridPos>(id, GRID_POSITION);
      if (gp?.gx === undefined || gp?.gz === undefined) continue;
      let base = authoredXZ.get(id);
      if (base === undefined) {
        base = { x: gp.gx, z: gp.gz };
        authoredXZ.set(id, base);
      }
      const [px, py, pz] = transform.position;
      const closer = nearestBomber(bomberPositions, gp.gx, gp.gz);
      let targetX = base.x;
      let targetZ = base.z;
      let lerpRate = RELEASE_RATE;
      if (closer !== undefined && closer.dist <= MAGNET_RANGE) {
        // Pull toward bomber — but don't overshoot through the bomber:
        // cap at 0.65 cells offset so the pickup hovers a step away.
        const dx = closer.x - base.x;
        const dz = closer.z - base.z;
        const offsetCap = 0.65;
        const len = Math.hypot(dx, dz);
        if (len > 0) {
          const k = Math.min(1, offsetCap / len);
          targetX = base.x + dx * k;
          targetZ = base.z + dz * k;
        }
        lerpRate = PULL_RATE;
      }
      const t = Math.min(1, lerpRate * dt);
      const nextX = (px ?? base.x) + (targetX - (px ?? base.x)) * t;
      const nextZ = (pz ?? base.z) + (targetZ - (pz ?? base.z)) * t;
      world.setComponent(id, TRANSFORM, {
        ...transform,
        position: [nextX, py ?? 0, nextZ] as [number, number, number]
      });
    }
    // GC entries for despawned pickups (collected or scene-reset).
    for (const id of [...authoredXZ.keys()]) {
      if (!world.hasEntity(id)) authoredXZ.delete(id);
    }
  };

  return { name, fixedUpdate };
}

function collectAliveBomberPositions(
  world: World,
  bombers: QueryHandle
): Array<{ x: number; z: number }> {
  const out: Array<{ x: number; z: number }> = [];
  for (const id of bombers.run()) {
    const stats = world.getComponent<BomberStatsComponent>(id, BOMBER_STATS);
    if (stats?.alive === false) continue;
    const t = world.getComponent<TransformLike>(id, TRANSFORM);
    if (t?.position === undefined) continue;
    out.push({ x: t.position[0] ?? 0, z: t.position[2] ?? 0 });
  }
  return out;
}

function nearestBomber(
  bombers: ReadonlyArray<{ x: number; z: number }>,
  baseX: number,
  baseZ: number
): { x: number; z: number; dist: number } | undefined {
  let best: { x: number; z: number; dist: number } | undefined;
  for (const b of bombers) {
    const d = Math.hypot(b.x - baseX, b.z - baseZ);
    if (best === undefined || d < best.dist) {
      best = { x: b.x, z: b.z, dist: d };
    }
  }
  return best;
}
