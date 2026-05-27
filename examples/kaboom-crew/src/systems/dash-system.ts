// S159 KABOOM-DASH (GDP-2026-05-27-014).
//
// Consumes DashRequest transients. Validates dash readiness (alive,
// cooldown ≤ 0, not currently dashing, target path clear of hard
// walls), initiates the dash by stamping BomberStats.dashing=true +
// start/target cells + a 3s cooldown, then interpolates the bomber's
// Transform.position along an arc over 200ms. At land, snaps
// GridPosition to the target cell + clears dash state.
//
// Pass-through during the arc: bombers, bombs, soft blocks in the
// path are NOT damaged + NOT blocking. Hard blocks REFUSE the dash
// at validate time (no cooldown burned). Pickups are collected on
// the landing cell only (intermediate cells skipped).
//
// Logical direction stays instant via GridMover.queuedDirection; only
// the visual Transform.position interpolates. The bomber's logical
// GridPosition snaps to the target cell on land (NOT during the arc)
// so other systems treat the dash as a single discrete movement.

import type { ComponentName, EntityId } from "../../../../engine/core/ecs/types";
import type { QueryHandle, World } from "../../../../engine/core/ecs/world";
import type { System, SystemContext } from "../../../../engine/core/systems/types";

const DASH_REQUEST: ComponentName = "DashRequest";
const BOMBER_STATS: ComponentName = "BomberStats";
const TRANSFORM: ComponentName = "Transform";
const GRID_POSITION: ComponentName = "GridPosition";
const GRID: ComponentName = "Grid";

const DASH_DURATION_MS = 200;
const DASH_COOLDOWN_MS = 3000;
const DASH_RANGE_CELLS = 2;
const DASH_ARC_PEAK_Y = 0.5;

type DashRequest = { dx: number; dz: number };
type GridPos = { gx: number; gz: number };
type GridConfig = { sizeX?: number; sizeZ?: number };
type TransformLike = {
  position?: ReadonlyArray<number>;
  rotation?: ReadonlyArray<number>;
  scale?: ReadonlyArray<number>;
  parent?: string;
};

type DashStats = {
  alive?: boolean;
  dashCooldownRemainingMs?: number;
  dashing?: boolean;
  dashStartGx?: number;
  dashStartGz?: number;
  dashTargetGx?: number;
  dashTargetGz?: number;
  dashElapsedMs?: number;
};

/**
 * Pure helper — given start + target cells and elapsed-since-start
 * ms, returns the world (x, y, z) along a parabolic arc. Y peaks at
 * DASH_ARC_PEAK_Y at the midpoint, returns to baseY at land.
 */
export function dashArcPosition(
  startGx: number,
  startGz: number,
  targetGx: number,
  targetGz: number,
  elapsedMs: number,
  baseY: number
): [number, number, number] {
  const clamped = Math.max(0, Math.min(DASH_DURATION_MS, elapsedMs));
  const t = clamped / DASH_DURATION_MS;
  const x = startGx + (targetGx - startGx) * t;
  const z = startGz + (targetGz - startGz) * t;
  // Parabolic arc: y(t) = baseY + 4 * peak * t * (1 - t); peaks at t=0.5.
  const y = baseY + 4 * DASH_ARC_PEAK_Y * t * (1 - t);
  return [x, y, z];
}

/**
 * Pure helper — compute the landing cell for a dash starting at
 * (startGx, startGz) with direction (dx, dz). Walks up to
 * DASH_RANGE_CELLS in the direction, stops 1 cell before any hard
 * block found via the `cellAt` predicate. Returns undefined when
 * the first step hits a hard block or out-of-bounds.
 *
 * `cellAt(gx, gz)` returns "hard-wall" for hard blocks, "out-of-bounds"
 * for off-map, anything else for empty/passable.
 */
export function resolveDashTarget(
  startGx: number,
  startGz: number,
  dx: number,
  dz: number,
  cellAt: (gx: number, gz: number) => string,
  range: number = DASH_RANGE_CELLS
): { gx: number; gz: number } | undefined {
  let last: { gx: number; gz: number } | undefined;
  for (let step = 1; step <= range; step += 1) {
    const gx = startGx + dx * step;
    const gz = startGz + dz * step;
    const cell = cellAt(gx, gz);
    if (cell === "hard-wall" || cell === "out-of-bounds") {
      return last; // undefined if first step is blocked
    }
    last = { gx, gz };
  }
  return last;
}

export type KaboomDashSystemOptions = {
  name?: string;
  /** Optional predicate for cell-passability. Defaults to grid-bounds + a stub that treats hard-block layer entities as walls. */
  cellAt?: (world: World, gx: number, gz: number) => string;
};

export function createKaboomDashSystem(options: KaboomDashSystemOptions = {}): System {
  const name = options.name ?? "kaboom.dash";
  let cachedWorld: World | undefined;
  let bombers: QueryHandle | undefined;
  let activeDashes: QueryHandle | undefined;

  const cellAt = options.cellAt ?? defaultCellAt;

  const fixedUpdate = (context: SystemContext): void => {
    const world = context.world;
    if (world !== cachedWorld) {
      bombers = world.createQuery([BOMBER_STATS, GRID_POSITION, TRANSFORM, DASH_REQUEST]);
      activeDashes = world.createQuery([BOMBER_STATS, TRANSFORM]);
      cachedWorld = world;
    }
    const dt = Math.max(0, context.time.fixedDt);
    const dtMs = dt * 1000;

    // 1. Consume any new DashRequest transients.
    const requestIds = [...bombers!.run()];
    for (const id of requestIds) {
      const req = world.getComponent<DashRequest>(id, DASH_REQUEST);
      world.removeComponent(id, DASH_REQUEST);
      if (req === undefined) continue;
      const stats = world.getComponent<DashStats>(id, BOMBER_STATS);
      if (stats === undefined || stats.alive === false) continue;
      if (stats.dashing === true) continue;
      if ((stats.dashCooldownRemainingMs ?? 0) > 0) continue;
      // Cardinal-only.
      const dx = Math.sign(req.dx) | 0;
      const dz = Math.sign(req.dz) | 0;
      if ((dx === 0 && dz === 0) || (dx !== 0 && dz !== 0)) continue;
      const pos = world.getComponent<GridPos>(id, GRID_POSITION);
      if (pos === undefined) continue;
      const target = resolveDashTarget(pos.gx, pos.gz, dx, dz, (gx, gz) => cellAt(world, gx, gz));
      if (target === undefined) continue; // first step blocked — no cooldown burn
      world.setComponent(id, BOMBER_STATS, {
        ...stats,
        dashing: true,
        dashStartGx: pos.gx,
        dashStartGz: pos.gz,
        dashTargetGx: target.gx,
        dashTargetGz: target.gz,
        dashElapsedMs: 0,
        dashCooldownRemainingMs: DASH_COOLDOWN_MS
      });
    }

    // 2. Tick every bomber: cooldown decrement + active-dash arc.
    for (const id of activeDashes!.run()) {
      const stats = world.getComponent<DashStats>(id, BOMBER_STATS);
      if (stats === undefined || stats.alive === false) continue;
      let mutated: DashStats | undefined;
      if ((stats.dashCooldownRemainingMs ?? 0) > 0 && stats.dashing !== true) {
        const next = Math.max(0, (stats.dashCooldownRemainingMs ?? 0) - dtMs);
        mutated = { ...stats, dashCooldownRemainingMs: next };
      }
      if (stats.dashing === true) {
        const elapsed = (stats.dashElapsedMs ?? 0) + dtMs;
        const transform = world.getComponent<TransformLike>(id, TRANSFORM);
        const baseY = transform?.position?.[1] !== undefined && (stats.dashElapsedMs ?? 0) === 0
          ? transform.position[1]!
          : 0.4;
        if (elapsed >= DASH_DURATION_MS) {
          // Landing — snap to target cell + clear dash state. Cooldown
          // continues to decrement next ticks.
          const targetGx = stats.dashTargetGx ?? stats.dashStartGx ?? 0;
          const targetGz = stats.dashTargetGz ?? stats.dashStartGz ?? 0;
          world.setComponent(id, GRID_POSITION, { gx: targetGx, gz: targetGz });
          if (transform !== undefined) {
            world.setComponent(id, TRANSFORM, {
              ...transform,
              position: [targetGx, baseY, targetGz]
            });
          }
          mutated = {
            ...stats,
            dashing: false,
            dashElapsedMs: 0
            // start/target cells stay for one tick so consumers can
            // observe the just-landed state if they want; the next
            // dash will overwrite them.
          };
        } else {
          // Mid-arc — interpolate Transform.position. GridPosition
          // stays at the start cell so other systems treat the bomber
          // as still occupying the source until landing.
          const startGx = stats.dashStartGx ?? 0;
          const startGz = stats.dashStartGz ?? 0;
          const targetGx = stats.dashTargetGx ?? startGx;
          const targetGz = stats.dashTargetGz ?? startGz;
          const [x, y, z] = dashArcPosition(startGx, startGz, targetGx, targetGz, elapsed, baseY);
          if (transform !== undefined) {
            world.setComponent(id, TRANSFORM, {
              ...transform,
              position: [x, y, z]
            });
          }
          mutated = { ...stats, dashElapsedMs: elapsed };
        }
      }
      if (mutated !== undefined) world.setComponent(id, BOMBER_STATS, mutated);
    }
  };

  return { name, fixedUpdate };
}

/**
 * Default cellAt — uses Grid bounds for out-of-bounds and treats
 * GridOccupant.layer === "block" entities as hard-walls. Soft blocks
 * use the same layer but the dash rule treats both as walls only when
 * blocksMovement is true (matches the kaboom-crew prefab contract:
 * hard-block has blocksMovement=true + blocksBlast=true; soft-block
 * has blocksMovement=true + blocksBlast=false). The system filters by
 * blocksBlast=true (hard-block only) so dash passes through soft.
 */
function defaultCellAt(world: World, gx: number, gz: number): string {
  const grid = world.getComponent<GridConfig>("grid.config", GRID);
  if (grid !== undefined) {
    const sizeX = grid.sizeX ?? 15;
    const sizeZ = grid.sizeZ ?? 11;
    if (gx < 0 || gz < 0 || gx >= sizeX || gz >= sizeZ) return "out-of-bounds";
  }
  // Scan for a hard-block entity at this cell.
  for (const id of world.entityIds()) {
    const gp = world.getComponent<GridPos>(id, GRID_POSITION);
    if (gp?.gx !== gx || gp?.gz !== gz) continue;
    const occ = world.getComponent<{ layer?: string; blocksMovement?: boolean; blocksBlast?: boolean }>(id, "GridOccupant");
    if (occ?.layer === "block" && occ.blocksBlast === true) return "hard-wall";
  }
  return "empty";
}

export const __DASH_CONSTANTS = {
  DASH_DURATION_MS,
  DASH_COOLDOWN_MS,
  DASH_RANGE_CELLS
};
