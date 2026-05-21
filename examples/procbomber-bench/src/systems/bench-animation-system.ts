// S101 + S102 PROCBOMBER-WALK-SWING-PIVOTS — bench animation system.
//
// Reads `BenchAnimationState { kind, elapsed }` on the bomber root and
// drives:
//   - idle-bob:   sin on the ROOT entity's Transform.position.y
//                 (whole bomber gently hops in place).
//   - walk-swing: sin on shoulder.l/r + hip.l/r Transform.rotation.x,
//                 in counter-phase so the left shoulder + right hip
//                 swing forward together (cross-body gait).
//   - limb-test:  drives each LimbPivots field by a fixed +0.3 rad in
//                 sequence, one pivot at a time (~1 s each), so a
//                 human can visually confirm every named pivot bends
//                 the expected way.
//
// The root's `LimbPivots` component carries entity ids for the nine
// pivots; the system looks them up by name instead of walking the
// Transform tree.

import type { World } from "../../../../engine/core/ecs/world";
import type { System, SystemContext } from "../../../../engine/core/systems/types";

import {
  LIMB_PIVOTS,
  LIMB_PIVOT_NAMES,
  type LimbPivotName,
  type LimbPivots
} from "../limb-pivots";

const BENCH_ANIMATION_STATE = "BenchAnimationState";
const TRANSFORM = "Transform";

export type BenchAnimationKind = "none" | "idle-bob" | "walk-swing" | "limb-test";

export type BenchAnimationStateComponent = {
  kind: BenchAnimationKind;
  elapsed?: number;
};

export type TransformLike = {
  position?: ReadonlyArray<number>;
  rotation?: ReadonlyArray<number>;
  scale?: ReadonlyArray<number>;
  parent?: string;
};

export const IDLE_BOB_FREQ_HZ = 1.6;
export const IDLE_BOB_AMPLITUDE = 0.05;
export const WALK_SWING_FREQ_HZ = 1.8;
export const WALK_SWING_AMPLITUDE_RAD = 0.5;
export const LIMB_TEST_DURATION_PER_PIVOT_S = 0.8;
export const LIMB_TEST_ROTATION_RAD = 0.3;

/** Pure helper — easy to unit-test without an ECS world. */
export function idleBobY(elapsed: number, basePoseY: number): number {
  return basePoseY + Math.sin(elapsed * IDLE_BOB_FREQ_HZ * Math.PI * 2) * IDLE_BOB_AMPLITUDE;
}

/**
 * Walk-swing counter-phase: returns the X-rotation in radians for a
 * given limb side. Left shoulder + right hip swing forward together;
 * right shoulder + left hip swing backward (cross-body gait).
 */
export function walkSwingRotation(
  elapsed: number,
  limb: "shoulderL" | "shoulderR" | "hipL" | "hipR"
): number {
  const phase = elapsed * WALK_SWING_FREQ_HZ * Math.PI * 2;
  // Cross-body: shoulderL + hipR share one phase; shoulderR + hipL the opposite.
  const sign = limb === "shoulderL" || limb === "hipR" ? 1 : -1;
  return sign * Math.sin(phase) * WALK_SWING_AMPLITUDE_RAD;
}

/**
 * limb-test rotation: cycles through the 9 pivot names, holding each
 * for LIMB_TEST_DURATION_PER_PIVOT_S seconds at LIMB_TEST_ROTATION_RAD,
 * then returning to 0. Returns the index + the per-pivot rotation map.
 */
export function limbTestActivePivot(elapsed: number): LimbPivotName {
  const cycle = LIMB_PIVOT_NAMES.length * LIMB_TEST_DURATION_PER_PIVOT_S;
  const t = ((elapsed % cycle) + cycle) % cycle;
  const idx = Math.min(LIMB_PIVOT_NAMES.length - 1, Math.floor(t / LIMB_TEST_DURATION_PER_PIVOT_S));
  return LIMB_PIVOT_NAMES[idx]!;
}

function setTransformPosition(world: World, entityId: string, x: number, y: number, z: number): void {
  const t = world.getComponent<TransformLike>(entityId, TRANSFORM);
  if (t === undefined) return;
  world.setComponent(entityId, TRANSFORM, { ...t, position: [x, y, z] });
}

/**
 * S103 PROCBOMBER-ROTATION-DEG-FIX: AGF scenes store Transform.rotation
 * in DEGREES — three-renderer.ts converts via MathUtils.degToRad before
 * handing the matrix to Three.js. Animation helpers return radians (the
 * natural output of Math.sin), so every WRITE into Transform.rotation
 * must convert through this helper. Without it, a 0.5-rad amplitude
 * reads as 0.5° on screen — barely visible.
 */
export function radToDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

function setTransformRotationXDeg(world: World, entityId: string, rotDeg: number): void {
  const t = world.getComponent<TransformLike>(entityId, TRANSFORM);
  if (t === undefined) return;
  const rot = t.rotation ?? [0, 0, 0];
  world.setComponent(entityId, TRANSFORM, {
    ...t,
    rotation: [rotDeg, rot[1] ?? 0, rot[2] ?? 0]
  });
}

function setTransformRotationXFromRad(world: World, entityId: string, rotRad: number): void {
  setTransformRotationXDeg(world, entityId, radToDeg(rotRad));
}

function setTransformRotationZero(world: World, entityId: string): void {
  const t = world.getComponent<TransformLike>(entityId, TRANSFORM);
  if (t === undefined) return;
  world.setComponent(entityId, TRANSFORM, { ...t, rotation: [0, 0, 0] });
}

export function createBenchAnimationSystem(): System {
  const basePoses = new Map<string, { x: number; y: number; z: number }>();
  let cachedWorld: World | undefined;
  let query: ReturnType<World["createQuery"]> | undefined;
  let prevPivotIdxByEntity = new Map<string, number>();

  return {
    name: "procbomber.bench-animation",
    fixedUpdate(context: SystemContext): void {
      const world = context.world;
      if (world !== cachedWorld) {
        query = world.createQuery([BENCH_ANIMATION_STATE, TRANSFORM]);
        cachedWorld = world;
        basePoses.clear();
        prevPivotIdxByEntity = new Map<string, number>();
      }
      const dt = context.time.fixedDt;
      for (const id of query!.run()) {
        const state = world.getComponent<BenchAnimationStateComponent>(id, BENCH_ANIMATION_STATE);
        const transform = world.getComponent<TransformLike>(id, TRANSFORM);
        if (state === undefined || transform === undefined) continue;

        let base = basePoses.get(id);
        if (base === undefined) {
          base = {
            x: transform.position?.[0] ?? 0,
            y: transform.position?.[1] ?? 0,
            z: transform.position?.[2] ?? 0
          };
          basePoses.set(id, base);
        }
        const nextElapsed = (state.elapsed ?? 0) + dt;
        const limbPivots = world.getComponent<LimbPivots>(id, LIMB_PIVOTS);

        switch (state.kind) {
          case "idle-bob": {
            setTransformPosition(world, id, base.x, idleBobY(nextElapsed, base.y), base.z);
            // Keep limb rotations at rest.
            if (limbPivots !== undefined) {
              for (const name of LIMB_PIVOT_NAMES) setTransformRotationZero(world, limbPivots[name]);
            }
            break;
          }
          case "walk-swing": {
            // Root sits at the base pose; limbs swing.
            setTransformPosition(world, id, base.x, base.y, base.z);
            if (limbPivots !== undefined) {
              setTransformRotationXFromRad(world, limbPivots.shoulderL, walkSwingRotation(nextElapsed, "shoulderL"));
              setTransformRotationXFromRad(world, limbPivots.shoulderR, walkSwingRotation(nextElapsed, "shoulderR"));
              setTransformRotationXFromRad(world, limbPivots.hipL, walkSwingRotation(nextElapsed, "hipL"));
              setTransformRotationXFromRad(world, limbPivots.hipR, walkSwingRotation(nextElapsed, "hipR"));
            }
            break;
          }
          case "limb-test": {
            setTransformPosition(world, id, base.x, base.y, base.z);
            if (limbPivots !== undefined) {
              const active = limbTestActivePivot(nextElapsed);
              for (const name of LIMB_PIVOT_NAMES) {
                const rot = name === active ? LIMB_TEST_ROTATION_RAD : 0;
                setTransformRotationXFromRad(world, limbPivots[name], rot);
              }
            }
            break;
          }
          case "none":
          default: {
            setTransformPosition(world, id, base.x, base.y, base.z);
            if (limbPivots !== undefined) {
              for (const name of LIMB_PIVOT_NAMES) setTransformRotationZero(world, limbPivots[name]);
            }
            break;
          }
        }

        world.setComponent(id, BENCH_ANIMATION_STATE, {
          ...state,
          elapsed: nextElapsed
        });
      }
    }
  };
}
