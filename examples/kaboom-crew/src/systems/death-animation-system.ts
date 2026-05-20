// S90 KABOOM-DEATH-FALL.
//
// Tweens a dying bomber's Transform.rotation toward a tipped-over
// pose (90° on X). audio-binding-system writes a `DeathAnim`
// component the moment BomberStats.alive flips from true to false;
// this system advances the elapsed counter each fixed step + lerps
// rotation toward the target. Caps at the target so the bomber
// stays tipped until the next restart wipes it.

import type { ComponentName, EntityId } from "../../../../engine/core/ecs/types";
import type { QueryHandle, World } from "../../../../engine/core/ecs/world";
import type { System, SystemContext } from "../../../../engine/core/systems/types";

const DEATH_ANIM: ComponentName = "DeathAnim";
const TRANSFORM: ComponentName = "Transform";

const FALL_DURATION_S = 0.4;
const TARGET_PITCH_RAD = Math.PI / 2; // 90° tip on +X

type DeathAnimComponent = { elapsed: number; baseRotation?: ReadonlyArray<number> };
type TransformComponent = {
  position?: ReadonlyArray<number>;
  rotation?: ReadonlyArray<number>;
  scale?: ReadonlyArray<number>;
};

/**
 * Pure helper — exposed so the unit test can lock the curve without
 * spinning the system. Returns the rotation X (radians) at the given
 * elapsed seconds, clamped between the start angle and the target.
 */
export function deathFallPitch(elapsedSeconds: number, baseX: number): number {
  if (elapsedSeconds <= 0) return baseX;
  if (elapsedSeconds >= FALL_DURATION_S) return TARGET_PITCH_RAD;
  // Ease-out quadratic so the topple lands softly.
  const t = elapsedSeconds / FALL_DURATION_S;
  const eased = 1 - (1 - t) * (1 - t);
  return baseX + (TARGET_PITCH_RAD - baseX) * eased;
}

export function createKaboomDeathAnimationSystem(options: { name?: string } = {}): System {
  const name = options.name ?? "kaboom.death-animation";
  let cachedWorld: World | undefined;
  let query: QueryHandle | undefined;

  const fixedUpdate = (context: SystemContext): void => {
    const world = context.world;
    if (world !== cachedWorld) {
      query = world.createQuery([DEATH_ANIM, TRANSFORM]);
      cachedWorld = world;
    }
    const dt = Math.max(0, context.time.fixedDt);
    for (const id of query!.run()) {
      const anim = world.getComponent<DeathAnimComponent>(id, DEATH_ANIM);
      if (anim === undefined) continue;
      const transform = world.getComponent<TransformComponent>(id, TRANSFORM);
      if (transform === undefined) continue;
      // Capture the baseline rotation the first time we see the entity.
      const baseRotation = anim.baseRotation ?? (transform.rotation ?? [0, 0, 0]);
      const elapsed = anim.elapsed + dt;
      const pitch = deathFallPitch(elapsed, baseRotation[0] ?? 0);
      const rotation = [pitch, baseRotation[1] ?? 0, baseRotation[2] ?? 0] as ReadonlyArray<number>;
      world.setComponent(id, TRANSFORM, { ...transform, rotation });
      const nextAnim: DeathAnimComponent = anim.baseRotation === undefined
        ? { elapsed, baseRotation }
        : { elapsed, baseRotation: anim.baseRotation };
      world.setComponent(id, DEATH_ANIM, nextAnim);
    }
  };

  return { name, fixedUpdate };
}

export function _testHooks(): { FALL_DURATION_S: number; TARGET_PITCH_RAD: number } {
  return { FALL_DURATION_S, TARGET_PITCH_RAD };
}
