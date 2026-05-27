// S105 KABOOM-SPRING-PIVOT-SYSTEM — generic spring-damped angular
// pivot driver.
//
// Reads a `SpringPivot { restRotation, velocity, k, damping }` component
// + Transform; each fixedUpdate integrates Hooke-spring restoring force
// toward rest minus damping × velocity, writes the new rotation back
// to Transform. Per-axis independent.
//
// Foundation for:
//   - accessory soft-attached sway (S105 KABOOM-ACCESSORY-LAYER)
//   - ragdoll death limb flail (S105 KABOOM-RAGDOLL-LIMB-FLAIL)
//   - any future secondary motion
//
// All angles stored in DEGREES to match the AGF Transform convention
// (three-renderer converts deg→rad before handing to Three.js).

import type { World } from "../../../../engine/core/ecs/world";
import type { System, SystemContext } from "../../../../engine/core/systems/types";

export const SPRING_PIVOT = "SpringPivot";
const TRANSFORM = "Transform";

// S157 FIX-ACCESSORY-OSCILLATION (playtest 2026-05-27): accessories
// were "вертятся как будто подвержены физике" during bomber movement.
// Pre-fix damping=0.4 was massively underdamped against the soft-
// attach nudge magnitude (factor=600) — every direction change
// imparted ~600 deg/s of angular velocity and the accessory kept
// oscillating for seconds. New constants: stiffer spring (30 vs 18)
// + much more damping (6 vs 0.4, ratio 0.55 of critical for k=30).
// Plus the nudge factor drops to 150 in soft-attach-sway-system.
export const DEFAULT_SPRING_K = 30;
export const DEFAULT_SPRING_DAMPING = 6;

export type SpringPivotComponent = {
  /** Target rotation (deg) the pivot is springing back toward. */
  restRotation?: ReadonlyArray<number>;
  /** Current angular velocity per axis (deg/s). Updated by the system each tick. */
  velocity?: ReadonlyArray<number>;
  /** Spring stiffness. Higher = snappier oscillation. */
  k?: number;
  /** Velocity damping coefficient. Higher = faster energy loss. */
  damping?: number;
};

type TransformLike = {
  position?: ReadonlyArray<number>;
  rotation?: ReadonlyArray<number>;
  scale?: ReadonlyArray<number>;
  parent?: string;
};

/** Pure step: returns next {rotation, velocity} given current state + dt. */
export function stepSpring(
  current: ReadonlyArray<number>,
  rest: ReadonlyArray<number>,
  velocity: ReadonlyArray<number>,
  k: number,
  damping: number,
  dt: number
): { rotation: number[]; velocity: number[] } {
  const next = { rotation: [0, 0, 0], velocity: [0, 0, 0] };
  for (let i = 0; i < 3; i += 1) {
    const c = current[i] ?? 0;
    const r = rest[i] ?? 0;
    const v = velocity[i] ?? 0;
    const accel = -k * (c - r) - damping * v;
    const newV = v + accel * dt;
    const newC = c + newV * dt;
    next.rotation[i] = newC;
    next.velocity[i] = newV;
  }
  return next;
}

export function createSpringPivotSystem(options: { name?: string } = {}): System {
  const name = options.name ?? "procbomber.spring-pivot";
  let cachedWorld: World | undefined;
  let query: ReturnType<World["createQuery"]> | undefined;

  return {
    name,
    fixedUpdate(context: SystemContext): void {
      const world = context.world;
      if (world !== cachedWorld) {
        query = world.createQuery([SPRING_PIVOT, TRANSFORM]);
        cachedWorld = world;
      }
      const dt = Math.max(0, context.time.fixedDt);
      if (dt === 0) return;
      for (const id of query!.run()) {
        const spring = world.getComponent<SpringPivotComponent>(id, SPRING_PIVOT);
        const transform = world.getComponent<TransformLike>(id, TRANSFORM);
        if (spring === undefined || transform === undefined) continue;
        const rest = spring.restRotation ?? [0, 0, 0];
        const velocity = spring.velocity ?? [0, 0, 0];
        const current = transform.rotation ?? [0, 0, 0];
        const k = spring.k ?? DEFAULT_SPRING_K;
        const damping = spring.damping ?? DEFAULT_SPRING_DAMPING;
        const next = stepSpring(current, rest, velocity, k, damping, dt);
        world.setComponent(id, TRANSFORM, { ...transform, rotation: next.rotation });
        world.setComponent(id, SPRING_PIVOT, { ...spring, velocity: next.velocity });
      }
    }
  };
}
