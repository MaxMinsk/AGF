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
import { easingCurves } from "../../../../engine/core/systems/tween-system";

const DEATH_ANIM: ComponentName = "DeathAnim";
const TRANSFORM: ComponentName = "Transform";

const FALL_DURATION_S = 0.4;
const TARGET_PITCH_RAD = Math.PI / 2; // 90° tip on +X
// S100 KABOOM-SLAPSTICK-DEATH — extra arc + spin on top of the
// existing pitch tween. LAUNCH_HEIGHT is in world units (cells);
// SPIN_REVOLUTIONS is the full Y rotation count across the duration.
const LAUNCH_HEIGHT = 1.5;
const SPIN_REVOLUTIONS = 1;

type DeathAnimComponent = {
  elapsed: number;
  baseRotation?: ReadonlyArray<number>;
  basePosition?: ReadonlyArray<number>;
};
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
  // S095 KABOOM-CAMERA-EASING-ADOPT — easeOutBack gives a small
  // overshoot before settling: the bomber tips past 90° and rocks
  // back, more theatrical than the previous monotonic ease-out-quad.
  const t = elapsedSeconds / FALL_DURATION_S;
  const eased = easingCurves.easeOutBack(t);
  return baseX + (TARGET_PITCH_RAD - baseX) * eased;
}

/**
 * S100 KABOOM-SLAPSTICK-DEATH — vertical hop on top of the pitch
 * tween. Returns the world-Y delta above `baseY` at `elapsed`. Curve:
 * 4 * h * t * (1 - t) — parabolic arc, peak `h` at t=0.5, zero at
 * t∈{0, 1}. Out-of-bounds elapsed returns 0 (bomber sitting at base).
 */
export function deathLaunchHeight(elapsedSeconds: number): number {
  if (elapsedSeconds <= 0) return 0;
  if (elapsedSeconds >= FALL_DURATION_S) return 0;
  const t = elapsedSeconds / FALL_DURATION_S;
  return 4 * LAUNCH_HEIGHT * t * (1 - t);
}

/**
 * S100 KABOOM-SLAPSTICK-DEATH — Y-axis spin on top of the pitch
 * tween. Returns yaw in radians at `elapsed`. Linear across the
 * duration to keep angular velocity constant; ends on an exact
 * multiple of 2π so the bomber lands facing the same direction
 * (visual no-op when SPIN_REVOLUTIONS is an integer).
 */
export function deathSpinYaw(elapsedSeconds: number, baseY: number): number {
  if (elapsedSeconds <= 0) return baseY;
  if (elapsedSeconds >= FALL_DURATION_S) return baseY + SPIN_REVOLUTIONS * Math.PI * 2;
  const t = elapsedSeconds / FALL_DURATION_S;
  return baseY + t * SPIN_REVOLUTIONS * Math.PI * 2;
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
      // Capture the baseline rotation + position the first time we
      // see the entity (S100 SLAPSTICK adds the position cache so the
      // bomber returns to its death cell after the launch arc).
      const baseRotation = anim.baseRotation ?? (transform.rotation ?? [0, 0, 0]);
      const basePosition = anim.basePosition ?? (transform.position ?? [0, 0, 0]);
      const elapsed = anim.elapsed + dt;
      const pitch = deathFallPitch(elapsed, baseRotation[0] ?? 0);
      const yaw = deathSpinYaw(elapsed, baseRotation[1] ?? 0);
      const hopY = deathLaunchHeight(elapsed);
      const rotation = [pitch, yaw, baseRotation[2] ?? 0] as ReadonlyArray<number>;
      const position = [
        basePosition[0] ?? 0,
        (basePosition[1] ?? 0) + hopY,
        basePosition[2] ?? 0
      ] as ReadonlyArray<number>;
      world.setComponent(id, TRANSFORM, { ...transform, rotation, position });
      const nextAnim: DeathAnimComponent = {
        elapsed,
        baseRotation: anim.baseRotation ?? baseRotation,
        basePosition: anim.basePosition ?? basePosition
      };
      world.setComponent(id, DEATH_ANIM, nextAnim);
    }
  };

  return { name, fixedUpdate };
}

export function _testHooks(): { FALL_DURATION_S: number; TARGET_PITCH_RAD: number } {
  return { FALL_DURATION_S, TARGET_PITCH_RAD };
}
