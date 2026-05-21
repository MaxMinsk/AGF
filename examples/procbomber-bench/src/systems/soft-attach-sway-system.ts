// S106 KABOOM-ACCESSORY-SOFT-ATTACH-SWAY — drives spring-pivot velocity
// for SoftAttached entities based on parent motion.
//
// For each entity with `SoftAttached` + `Transform` + `SpringPivot`:
//   1. Look up the parent's world transform (via the entity's
//      Transform.parent + LocalToWorld component from the resolver).
//   2. Compare against the cached previous world transform.
//   3. Convert linear velocity (parent moved on X/Z) into an angular
//      nudge on the entity's SpringPivot.velocity.X / Z.
//   4. Spring-pivot-system (registered after this) decays the velocity
//      back to rest. Net effect: caps wobble on walk, fins flex on
//      direction change.
//
// Lightweight: only the parent's position is tracked per-entity (no
// rotation delta). Linear → angular conversion factor is empirical.

import type { World } from "../../../../engine/core/ecs/world";
import type { System, SystemContext } from "../../../../engine/core/systems/types";

const SOFT_ATTACHED = "SoftAttached";
const SPRING_PIVOT = "SpringPivot";
const TRANSFORM = "Transform";
const LOCAL_TO_WORLD = "LocalToWorld";

export const SOFT_ATTACH_LINEAR_TO_ANGULAR_DEG_PER_S = 600;

type TransformLike = { parent?: string };
type LocalToWorldLike = {
  position?: ReadonlyArray<number>;
};
type SpringPivotLike = {
  velocity?: ReadonlyArray<number>;
  [k: string]: unknown;
};

/** Pure helper: linear parent displacement (cells / s) → angular nudge (deg / s). */
export function linearDisplacementToAngularNudgeDegPerS(
  dx: number,
  dz: number,
  dt: number
): { x: number; z: number } {
  if (dt <= 0) return { x: 0, z: 0 };
  // Positive parent X velocity tilts the accessory around -Z (lean back).
  // Positive parent Z velocity tilts the accessory around +X (lean back along Z).
  const factor = SOFT_ATTACH_LINEAR_TO_ANGULAR_DEG_PER_S;
  return {
    x: (dz / dt) * factor,
    z: -(dx / dt) * factor
  };
}

export function createSoftAttachSwaySystem(options: { name?: string } = {}): System {
  const name = options.name ?? "procbomber.soft-attach-sway";
  const prevParentPos = new Map<string, [number, number, number]>();
  let cachedWorld: World | undefined;
  let query: ReturnType<World["createQuery"]> | undefined;

  return {
    name,
    fixedUpdate(context: SystemContext): void {
      const world = context.world;
      if (world !== cachedWorld) {
        query = world.createQuery([SOFT_ATTACHED, TRANSFORM, SPRING_PIVOT]);
        cachedWorld = world;
        prevParentPos.clear();
      }
      const dt = Math.max(0, context.time.fixedDt);
      if (dt <= 0) return;
      for (const id of query!.run()) {
        const transform = world.getComponent<TransformLike>(id, TRANSFORM);
        if (transform?.parent === undefined) continue;
        const parentLtw = world.getComponent<LocalToWorldLike>(transform.parent, LOCAL_TO_WORLD);
        const parentPos = parentLtw?.position;
        if (parentPos === undefined) continue;
        const prev = prevParentPos.get(transform.parent);
        const currPos: [number, number, number] = [
          parentPos[0] ?? 0,
          parentPos[1] ?? 0,
          parentPos[2] ?? 0
        ];
        if (prev !== undefined) {
          const dx = currPos[0] - prev[0];
          const dz = currPos[2] - prev[2];
          // Only nudge when there's appreciable motion — avoids
          // numerical drift on stationary bombers.
          if (Math.abs(dx) > 1e-5 || Math.abs(dz) > 1e-5) {
            const nudge = linearDisplacementToAngularNudgeDegPerS(dx, dz, dt);
            const spring = world.getComponent<SpringPivotLike>(id, SPRING_PIVOT);
            if (spring !== undefined) {
              const velocity = spring.velocity ?? [0, 0, 0];
              world.setComponent(id, SPRING_PIVOT, {
                ...spring,
                velocity: [
                  (velocity[0] ?? 0) + nudge.x,
                  velocity[1] ?? 0,
                  (velocity[2] ?? 0) + nudge.z
                ]
              });
            }
          }
        }
        prevParentPos.set(transform.parent, currPos);
      }
    }
  };
}
