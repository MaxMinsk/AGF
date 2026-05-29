// S198 KABOOM-DASH-SPEED-BURST (refactor of S159 arc-and-teleport).
//
// User feedback 2026-05-29: 'dash как-то дёргано работает... может
// попробовать его делать не перемещением а резким увеличением
// скорости?'.
//
// Old model (S159): consume DashRequest → snap GridPosition to a
// target cell 2 cells away over a 200ms arc, pass through bombers /
// bombs / soft blocks. Felt teleport-y; the arc Y bobbed in a way
// the user found jerky.
//
// New model: consume DashRequest → flip BomberStats.dashing=true,
// stash GridMover.speed, multiply speed by DASH_SPEED_MULTIPLIER for
// DASH_DURATION_MS. After the window: restore speed, clear dashing.
// Cooldown unchanged. Motion comes from the normal grid-movement-
// system at the boosted speed — walls, bombs, soft blocks all
// still block (no more pass-through).
//
// Direction: comes from the held movement key via GridMover.queued
// Direction (the S197 input flip wrote DashRequest using the held
// direction). The DashRequest's dx/dz is recorded so dash-system
// can validate "dashing in the held direction" but the actual
// motion is driven by GridMover, not by direct Transform writes.

import type { ComponentName } from "../../../../engine/core/ecs/types";
import type { QueryHandle, World } from "../../../../engine/core/ecs/world";
import type { System, SystemContext } from "../../../../engine/core/systems/types";

const DASH_REQUEST: ComponentName = "DashRequest";
const BOMBER_STATS: ComponentName = "BomberStats";
const GRID_MOVER: ComponentName = "GridMover";

/** Duration of the speed-burst window. Long enough to clear ~2 cells
 *  at boosted speed, short enough to feel snappy. */
const DASH_DURATION_MS = 240;
/** Cooldown after a dash STARTS — unchanged from S159 so muscle memory
 *  carries over. */
const DASH_COOLDOWN_MS = 3000;
/** Multiplier on top of the bomber's baseline GridMover.speed. */
const DASH_SPEED_MULTIPLIER = 3.0;

type DashRequest = { dx: number; dz: number };

type DashStats = {
  alive?: boolean;
  speed?: number;
  dashCooldownRemainingMs?: number;
  dashing?: boolean;
  dashElapsedMs?: number;
  /** S198 — baseline GridMover.speed captured at dash start. Restored
   *  when the burst window expires. */
  dashBaseSpeed?: number;
};

type GridMoverComponent = {
  speed: number;
  queuedDirection?: { dx: number; dz: number };
  currentLerp?: number;
  targetGx?: number;
  targetGz?: number;
};

export type KaboomDashSystemOptions = {
  name?: string;
};

export function createKaboomDashSystem(options: KaboomDashSystemOptions = {}): System {
  const name = options.name ?? "kaboom.dash";
  let cachedWorld: World | undefined;
  let pending: QueryHandle | undefined;
  let activeBombers: QueryHandle | undefined;

  const fixedUpdate = (context: SystemContext): void => {
    const world = context.world;
    if (world !== cachedWorld) {
      pending = world.createQuery([BOMBER_STATS, DASH_REQUEST]);
      activeBombers = world.createQuery([BOMBER_STATS, GRID_MOVER]);
      cachedWorld = world;
    }
    const dt = Math.max(0, context.time.fixedDt);
    const dtMs = dt * 1000;

    // 1. Consume new DashRequest transients.
    for (const id of [...pending!.run()]) {
      const req = world.getComponent<DashRequest>(id, DASH_REQUEST);
      world.removeComponent(id, DASH_REQUEST);
      if (req === undefined) continue;
      const stats = world.getComponent<DashStats>(id, BOMBER_STATS);
      if (stats === undefined || stats.alive === false) continue;
      if (stats.dashing === true) continue;
      if ((stats.dashCooldownRemainingMs ?? 0) > 0) continue;
      const dx = Math.sign(req.dx) | 0;
      const dz = Math.sign(req.dz) | 0;
      if ((dx === 0 && dz === 0) || (dx !== 0 && dz !== 0)) continue;
      const mover = world.getComponent<GridMoverComponent>(id, GRID_MOVER);
      if (mover === undefined) continue;
      const baseSpeed = mover.speed;
      world.setComponent(id, BOMBER_STATS, {
        ...stats,
        dashing: true,
        dashElapsedMs: 0,
        dashCooldownRemainingMs: DASH_COOLDOWN_MS,
        dashBaseSpeed: baseSpeed
      });
      world.setComponent(id, GRID_MOVER, {
        ...mover,
        speed: baseSpeed * DASH_SPEED_MULTIPLIER,
        queuedDirection: { dx, dz }
      });
    }

    // 2. Tick active dashes + cooldowns.
    for (const id of activeBombers!.run()) {
      const stats = world.getComponent<DashStats>(id, BOMBER_STATS);
      if (stats === undefined) continue;
      let mutated: DashStats | undefined;
      if (stats.dashing === true) {
        const elapsed = (stats.dashElapsedMs ?? 0) + dtMs;
        if (elapsed >= DASH_DURATION_MS) {
          const mover = world.getComponent<GridMoverComponent>(id, GRID_MOVER);
          if (mover !== undefined && stats.dashBaseSpeed !== undefined) {
            world.setComponent(id, GRID_MOVER, { ...mover, speed: stats.dashBaseSpeed });
          }
          mutated = { ...stats, dashing: false, dashElapsedMs: 0 };
          // Drop the stash so the next dash captures a fresh baseline.
          delete (mutated as { dashBaseSpeed?: number }).dashBaseSpeed;
        } else {
          mutated = { ...stats, dashElapsedMs: elapsed };
        }
      } else if ((stats.dashCooldownRemainingMs ?? 0) > 0) {
        const next = Math.max(0, (stats.dashCooldownRemainingMs ?? 0) - dtMs);
        mutated = { ...stats, dashCooldownRemainingMs: next };
      }
      if (mutated !== undefined) world.setComponent(id, BOMBER_STATS, mutated);
    }
  };

  return { name, fixedUpdate };
}

export const __DASH_CONSTANTS = {
  DASH_DURATION_MS,
  DASH_COOLDOWN_MS,
  DASH_SPEED_MULTIPLIER
};
