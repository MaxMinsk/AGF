// S108 KABOOM-BOMBER-FACE-MOVEMENT + S157 KABOOM-SMOOTH-ROTATION.
//
// Per-bomber yaw driver. Reads GridMover state each fixedUpdate;
// when the bomber is moving, eases Transform.rotation.Y on the root
// so the body faces the motion direction.
//
// Priority (highest first) for the TARGET yaw:
//   1. Mid-lerp + targetGx/Gz defined → face (targetGx - gx, targetGz - gz).
//   2. queuedDirection non-zero → face that.
//   3. Otherwise → keep last yaw.
//
// S157 KABOOM-SMOOTH-ROTATION (GDP-2026-05-27-015) — instead of
// snapping the root rotation to the target yaw, the system stores a
// per-bomber `currentYaw` and angular-lerps toward `targetYaw` over
// ~120 ms. Logical direction (gameplay) stays instant via GridMover;
// only the visual rotation interpolates. Shortest-path math handles
// wrap-around (e.g. 175° → -175° goes +10°, not -350°).
//
// Dead bombers (alive=false) are skipped so the ragdoll arc owns the
// rotation. yaw formula: atan2(dx, -dz). Three.js default forward is
// -Z, so a direction of (-Z) maps to yaw 0°; +X maps to +90°.

import type { World } from "../../../../engine/core/ecs/world";
import type { System, SystemContext } from "../../../../engine/core/systems/types";

const GRID_MOVER = "GridMover";
const GRID_POSITION = "GridPosition";
const TRANSFORM = "Transform";
const BOMBER_STATS = "BomberStats";
const PLAYER_CONTROLLED = "PlayerControlled";
const BOT_BRAIN = "BotBrain";

type GridMoverLike = {
  queuedDirection?: { dx: number; dz: number };
  currentLerp?: number;
  targetGx?: number;
  targetGz?: number;
};
type GridPositionLike = { gx: number; gz: number };
type TransformLike = {
  position?: ReadonlyArray<number>;
  rotation?: ReadonlyArray<number>;
  scale?: ReadonlyArray<number>;
  parent?: string;
};
type BomberStatsLike = { alive?: boolean };

/** Pure helper — direction → yaw in degrees. */
export function directionToYawDeg(dx: number, dz: number): number {
  if (Math.abs(dx) < 1e-6 && Math.abs(dz) < 1e-6) return 0;
  return Math.atan2(dx, -dz) * (180 / Math.PI);
}

// S157 — angular lerp duration. 120 ms felt right per the GDP playtest
// brief; lower = snappier, higher = slower.
export const SMOOTH_ROTATION_DURATION_MS = 120;

/**
 * Pure helper — return the shortest-path angular delta from `current`
 * to `target` (both degrees). Result is in (-180, +180]. Walking east
 * (0°) then west (180°) is an edge case — by convention the GDP picks
 * +180 (clockwise) for replay-safety.
 */
export function shortestAngularDeltaDeg(current: number, target: number): number {
  let delta = target - current;
  while (delta > 180) delta -= 360;
  while (delta <= -180) delta += 360;
  // Edge case: exactly ±180 → pick +180 deterministically (GDP §3).
  if (Math.abs(delta + 180) < 1e-9) delta = 180;
  return delta;
}

/**
 * Pure helper — step the visual yaw toward the target with elapsed-
 * time-based lerp. `startDeg` is the yaw at the moment the target
 * was set; `elapsedSec` is how long since then. Returns the
 * interpolated value (snapped to target when elapsed ≥ duration).
 *
 * Why elapsed-based: a naive (current → target) lerp with a per-tick
 * fraction creates Zeno-paradox decay (each tick covers a fraction
 * of the *remaining* delta, never quite converging). Tracking start
 * + elapsed gives linear convergence over exactly `durationMs`.
 */
export function stepYawLerp(
  startDeg: number,
  targetDeg: number,
  elapsedSec: number,
  durationMs: number
): number {
  const elapsedMs = Math.max(0, elapsedSec) * 1000;
  if (elapsedMs >= durationMs) return targetDeg;
  if (elapsedMs <= 0) return startDeg;
  const delta = shortestAngularDeltaDeg(startDeg, targetDeg);
  if (Math.abs(delta) < 1e-6) return targetDeg;
  return startDeg + delta * (elapsedMs / durationMs);
}

export function createKaboomBomberFaceMovementSystem(options: { name?: string } = {}): System {
  const name = options.name ?? "kaboom.bomber-face-movement";
  let cachedWorld: World | undefined;
  let playerQuery: ReturnType<World["createQuery"]> | undefined;
  let botQuery: ReturnType<World["createQuery"]> | undefined;
  // S157 — per-bomber facing state. Elapsed-time-based lerp converges
  // in exactly durationMs regardless of dt. When targetYaw changes,
  // startYaw resets to currentYaw + elapsed resets to 0.
  type FacingState = {
    currentYaw: number;
    targetYaw: number;
    startYaw: number;
    elapsedSec: number;
  };
  const facingByEntity = new Map<string, FacingState>();

  return {
    name,
    fixedUpdate(context: SystemContext): void {
      const world = context.world;
      if (world !== cachedWorld) {
        playerQuery = world.createQuery([PLAYER_CONTROLLED, GRID_MOVER, TRANSFORM]);
        botQuery = world.createQuery([BOT_BRAIN, GRID_MOVER, TRANSFORM]);
        cachedWorld = world;
        facingByEntity.clear();
      }
      const dt = Math.max(0, context.time.fixedDt);
      const apply = (entityId: string): void => {
        const stats = world.getComponent<BomberStatsLike>(entityId, BOMBER_STATS);
        if (stats?.alive === false) {
          facingByEntity.delete(entityId);
          return;
        }
        const mover = world.getComponent<GridMoverLike>(entityId, GRID_MOVER);
        const transform = world.getComponent<TransformLike>(entityId, TRANSFORM);
        if (mover === undefined || transform === undefined) return;
        let dx = 0;
        let dz = 0;
        // Mid-lerp wins — use the active step's target.
        if ((mover.currentLerp ?? 0) > 0 && mover.targetGx !== undefined && mover.targetGz !== undefined) {
          const pos = world.getComponent<GridPositionLike>(entityId, GRID_POSITION);
          if (pos !== undefined) {
            dx = mover.targetGx - pos.gx;
            dz = mover.targetGz - pos.gz;
          }
        }
        if (dx === 0 && dz === 0) {
          const queued = mover.queuedDirection;
          if (queued !== undefined) {
            dx = queued.dx;
            dz = queued.dz;
          }
        }
        const rotation = transform.rotation ?? [0, 0, 0];
        const transformYaw = rotation[1] ?? 0;
        // Lazy-init the facing state from the current Transform.y.
        let state = facingByEntity.get(entityId);
        if (state === undefined) {
          state = {
            currentYaw: transformYaw,
            targetYaw: transformYaw,
            startYaw: transformYaw,
            elapsedSec: SMOOTH_ROTATION_DURATION_MS / 1000 // already at target
          };
          facingByEntity.set(entityId, state);
        }
        // Determine the new target yaw. When stationary + no queued
        // direction, keep the previous target (bomber preserves its
        // facing per the S108 contract).
        let newTarget = state.targetYaw;
        if (!(dx === 0 && dz === 0)) newTarget = directionToYawDeg(dx, dz);
        // If target changed, reset the lerp start.
        if (Math.abs(shortestAngularDeltaDeg(state.targetYaw, newTarget)) > 1e-6) {
          state.startYaw = state.currentYaw;
          state.targetYaw = newTarget;
          state.elapsedSec = 0;
        }
        state.elapsedSec += dt;
        const nextYaw = stepYawLerp(state.startYaw, state.targetYaw, state.elapsedSec, SMOOTH_ROTATION_DURATION_MS);
        if (Math.abs(nextYaw - state.currentYaw) < 1e-4 && Math.abs(transformYaw - state.currentYaw) < 0.5) return;
        state.currentYaw = nextYaw;
        world.setComponent(entityId, TRANSFORM, {
          ...transform,
          rotation: [rotation[0] ?? 0, state.currentYaw, rotation[2] ?? 0]
        });
      };
      for (const id of playerQuery!.run()) apply(id);
      for (const id of botQuery!.run()) apply(id);
    }
  };
}
