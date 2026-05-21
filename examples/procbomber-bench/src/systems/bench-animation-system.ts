// S101 PROCBOMBER-BENCH-ANIM-DROPDOWN — stub animation system.
//
// Reads `BenchAnimationState { kind, elapsed }` and writes
// `Transform.position` to produce a visible idle-bob (sin on Y) or
// walk-swing (sin on X — whole-body sway since the bomber is one merged
// geometry without limb anchors yet). The real S102 pack of six ECS
// animation systems will run on per-limb transforms once
// PROCBOMBER-MESH-V0 splits the head/torso/limbs into separate
// entities-or-attributes.

import type { World } from "../../../../engine/core/ecs/world";
import type { System, SystemContext } from "../../../../engine/core/systems/types";

const BENCH_ANIMATION_STATE = "BenchAnimationState";
const TRANSFORM = "Transform";

export type BenchAnimationKind = "none" | "idle-bob" | "walk-swing";

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
export const WALK_SWING_FREQ_HZ = 4.0;
export const WALK_SWING_AMPLITUDE_X = 0.06;

/** Pure helper — easy to unit-test without an ECS world. */
export function idleBobY(elapsed: number, basePoseY: number): number {
  return basePoseY + Math.sin(elapsed * IDLE_BOB_FREQ_HZ * Math.PI * 2) * IDLE_BOB_AMPLITUDE;
}

/** Pure helper — easy to unit-test without an ECS world. */
export function walkSwingX(elapsed: number, basePoseX: number): number {
  return basePoseX + Math.sin(elapsed * WALK_SWING_FREQ_HZ * Math.PI * 2) * WALK_SWING_AMPLITUDE_X;
}

export function createBenchAnimationSystem(): System {
  const basePoses = new Map<string, { x: number; y: number; z: number }>();
  let cachedWorld: World | undefined;
  let query: ReturnType<World["createQuery"]> | undefined;

  return {
    name: "procbomber.bench-animation",
    fixedUpdate(context: SystemContext): void {
      const world = context.world;
      if (world !== cachedWorld) {
        query = world.createQuery([BENCH_ANIMATION_STATE, TRANSFORM]);
        cachedWorld = world;
        basePoses.clear();
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
        let nx = base.x;
        let ny = base.y;
        const nz = base.z;
        switch (state.kind) {
          case "idle-bob":
            ny = idleBobY(nextElapsed, base.y);
            break;
          case "walk-swing":
            nx = walkSwingX(nextElapsed, base.x);
            break;
          case "none":
          default:
            // Snap back to base — keeps the bomber centered when the
            // user flips the dropdown back to (none).
            break;
        }

        const nextTransform: TransformLike = {
          ...transform,
          position: [nx, ny, nz]
        };
        world.setComponent(id, TRANSFORM, nextTransform);
        world.setComponent(id, BENCH_ANIMATION_STATE, {
          ...state,
          elapsed: nextElapsed
        });
      }
    }
  };
}
