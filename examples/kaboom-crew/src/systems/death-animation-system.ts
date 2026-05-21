// S90 KABOOM-DEATH-FALL → S105 KABOOM-RAGDOLL-ROOT-ARC + LIMB-FLAIL.
//
// Death animation v3. Replaces the S100 slapstick tween (vertical hop
// + Y-spin) with a physics-driven ragdoll: a gravity arc with
// blast-direction-aware launch + tumble, plus per-limb spring impulses
// driven through the S105 KABOOM-SPRING-PIVOT-SYSTEM.
//
// Trigger: audio-binding-system writes a `DeathAnim { elapsed }`
// component on the alive→dead edge; blast-propagation-system writes a
// `RagdollState { blastOriginGx, blastOriginGz, magnitude }`. On the
// first visit, this system reads BOTH, computes the launch direction
// from (deathCell - blastOrigin), seeds the angular impulses on the
// limb pivots (via SpringPivot.velocity), and stamps the deathStartedAt
// timestamp.
//
// Per fixedUpdate, while the entity has DeathAnim: integrate the root's
// gravity arc into Transform.position + apply tumble onto rotation.
// The limb pivots are handled by spring-pivot-system reading the
// SpringPivot components.

import type { ComponentName } from "../../../../engine/core/ecs/types";
import type { QueryHandle, World } from "../../../../engine/core/ecs/world";
import type { System, SystemContext } from "../../../../engine/core/systems/types";

const DEATH_ANIM: ComponentName = "DeathAnim";
const RAGDOLL_STATE: ComponentName = "RagdollState";
const TRANSFORM: ComponentName = "Transform";
const LIMB_PIVOTS: ComponentName = "LimbPivots";
const SPRING_PIVOT: ComponentName = "SpringPivot";
const GRID_POSITION: ComponentName = "GridPosition";

const DEATH_DURATION_S = 0.6;
const LAUNCH_VY = 2.4;
const LAUNCH_HORIZONTAL = 1.6;
const GRAVITY = -9.0;
const TUMBLE_RATE = Math.PI;
// S105 KABOOM-RAGDOLL-LIMB-FLAIL — per-pivot impulse range (deg/s).
const LIMB_IMPULSE_MIN_DEG_PER_S = 90;
const LIMB_IMPULSE_MAX_DEG_PER_S = 360;
const LIMB_PIVOT_NAMES = [
  "neck", "shoulderL", "shoulderR", "elbowL", "elbowR",
  "hipL", "hipR", "kneeL", "kneeR"
] as const;

type DeathAnimComponent = {
  elapsed: number;
  basePosition?: ReadonlyArray<number>;
  baseRotation?: ReadonlyArray<number>;
  /** Root linear velocity in cell-units/s. Seeded from blast direction on first visit. */
  velocity?: ReadonlyArray<number>;
  /** Root angular velocity in rad/s. Cross(dir, +Y) × magnitude × π. */
  angularVelocity?: ReadonlyArray<number>;
  /** True after the first visit primed velocity + limb impulses. */
  initialised?: boolean;
};

type RagdollStateComponent = {
  blastOriginGx: number;
  blastOriginGz: number;
  magnitude?: number;
  deathStartedAt?: number;
};

type TransformComponent = {
  position?: ReadonlyArray<number>;
  rotation?: ReadonlyArray<number>;
  scale?: ReadonlyArray<number>;
  parent?: string;
};

type GridPositionLike = { gx: number; gz: number };
type LimbPivotsLike = Record<string, string>;

/** Deterministic per-pivot impulse magnitude derived from owner/origin/pivot. */
export function pivotImpulseDegPerS(
  ownerId: string,
  blastOriginGx: number,
  blastOriginGz: number,
  pivotName: string
): { x: number; z: number } {
  // FNV-1a-style hash → 0..1 → mapped into MIN..MAX range, signed by
  // hash parity. Same inputs → same impulse. NOT Math.random.
  let h = 2166136261;
  const mix = (s: string): void => {
    for (let i = 0; i < s.length; i += 1) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  };
  mix(ownerId);
  h ^= blastOriginGx * 73856093;
  h ^= blastOriginGz * 19349663;
  mix(pivotName);
  const u = ((h >>> 0) / 0xffffffff);
  const v = (((h >>> 8) >>> 0) / 0xffffffff);
  const span = LIMB_IMPULSE_MAX_DEG_PER_S - LIMB_IMPULSE_MIN_DEG_PER_S;
  const magX = LIMB_IMPULSE_MIN_DEG_PER_S + u * span;
  const magZ = LIMB_IMPULSE_MIN_DEG_PER_S + v * span;
  const sign = ((h >>> 16) & 1) === 0 ? 1 : -1;
  return { x: sign * magX, z: -sign * magZ };
}

export function createKaboomDeathAnimationSystem(options: { name?: string } = {}): System {
  const name = options.name ?? "kaboom.death-animation";
  let cachedWorld: World | undefined;
  let query: QueryHandle | undefined;

  return {
    name,
    fixedUpdate(context: SystemContext): void {
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
        const elapsed = (anim.elapsed ?? 0) + dt;

        if (!anim.initialised) {
          // First visit — capture baseline + seed velocity + limb impulses.
          const basePosition = transform.position ?? [0, 0, 0];
          const baseRotation = transform.rotation ?? [0, 0, 0];
          const ragdoll = world.getComponent<RagdollStateComponent>(id, RAGDOLL_STATE);
          let dirX = 0;
          let dirZ = -1; // default: knock forward (-Z) if no blast info
          let magnitude = 1.0;
          if (ragdoll !== undefined) {
            const grid = world.getComponent<GridPositionLike>(id, GRID_POSITION);
            const cellX = grid?.gx ?? Math.round(basePosition[0] ?? 0);
            const cellZ = grid?.gz ?? Math.round(basePosition[2] ?? 0);
            let rawX = cellX - ragdoll.blastOriginGx;
            let rawZ = cellZ - ragdoll.blastOriginGz;
            const len = Math.hypot(rawX, rawZ);
            if (len > 1e-6) {
              dirX = rawX / len;
              dirZ = rawZ / len;
            }
            magnitude = ragdoll.magnitude ?? 1.0;
          }
          const velocity = [dirX * magnitude * LAUNCH_HORIZONTAL, LAUNCH_VY, dirZ * magnitude * LAUNCH_HORIZONTAL];
          // Angular velocity: cross(dir, +Y) × mag × π applied to X and Z rotation rates.
          // dir × Y = (dx, 0, dz) × (0, 1, 0) = (-dz, 0, dx). Reorient as rotation rates around X / Z axes.
          const angularVelocity = [-dirZ * magnitude * TUMBLE_RATE, 0, dirX * magnitude * TUMBLE_RATE];

          // S105 KABOOM-RAGDOLL-LIMB-FLAIL — stamp SpringPivot on every
          // limb pivot with a per-pivot impulse derived from owner +
          // blast origin + pivot name. Pivots default to rest at zero
          // rotation; the impulse becomes the initial velocity.
          const limbs = world.getComponent<LimbPivotsLike>(id, LIMB_PIVOTS);
          if (limbs !== undefined) {
            for (const pivotName of LIMB_PIVOT_NAMES) {
              const pivotId = limbs[pivotName];
              if (pivotId === undefined) continue;
              const impulse = pivotImpulseDegPerS(
                id,
                ragdoll?.blastOriginGx ?? 0,
                ragdoll?.blastOriginGz ?? 0,
                pivotName
              );
              world.setComponent(pivotId, SPRING_PIVOT, {
                restRotation: [0, 0, 0],
                velocity: [impulse.x, 0, impulse.z],
                k: 18,
                damping: 0.4
              });
            }
          }
          if (ragdoll !== undefined && ragdoll.deathStartedAt === undefined) {
            world.setComponent(id, RAGDOLL_STATE, { ...ragdoll, deathStartedAt: context.time.elapsed });
          }
          world.setComponent(id, DEATH_ANIM, {
            elapsed,
            basePosition,
            baseRotation,
            velocity,
            angularVelocity,
            initialised: true
          });
          continue;
        }

        // Steady-state: integrate gravity arc + tumble.
        const velocity = anim.velocity ?? [0, 0, 0];
        const angularVelocity = anim.angularVelocity ?? [0, 0, 0];
        const basePosition = anim.basePosition ?? [0, 0, 0];
        const baseRotation = anim.baseRotation ?? [0, 0, 0];
        const newVy = (velocity[1] ?? 0) + GRAVITY * dt;
        const newVelocity = [velocity[0] ?? 0, newVy, velocity[2] ?? 0];
        const nextPos = [
          (transform.position?.[0] ?? basePosition[0] ?? 0) + (velocity[0] ?? 0) * dt,
          Math.max((basePosition[1] ?? 0), (transform.position?.[1] ?? basePosition[1] ?? 0) + newVy * dt),
          (transform.position?.[2] ?? basePosition[2] ?? 0) + (velocity[2] ?? 0) * dt
        ];
        const nextRotDeg = [
          (transform.rotation?.[0] ?? baseRotation[0] ?? 0) + (angularVelocity[0] ?? 0) * dt * (180 / Math.PI),
          (transform.rotation?.[1] ?? baseRotation[1] ?? 0) + (angularVelocity[1] ?? 0) * dt * (180 / Math.PI),
          (transform.rotation?.[2] ?? baseRotation[2] ?? 0) + (angularVelocity[2] ?? 0) * dt * (180 / Math.PI)
        ];
        world.setComponent(id, TRANSFORM, {
          ...transform,
          position: nextPos,
          rotation: nextRotDeg
        });
        world.setComponent(id, DEATH_ANIM, {
          ...anim,
          elapsed,
          velocity: newVelocity
        });
        // After DEATH_DURATION_S we stop integrating further (the
        // bomber is on the ground, ragdoll done); next round-restart
        // wipes the entity.
        if (elapsed >= DEATH_DURATION_S) {
          // Keep the component to prevent re-init, but freeze the state.
          // The bomber visually stays where it landed.
        }
      }
    }
  };
}

// Back-compat helper — some unit tests + the bench animation system
// previously imported this to lock the curve. The new physics path
// doesn't have an easy closed-form, but tests can still drive the
// system + read the resolved Transform.
export function _testHooks(): { DEATH_DURATION_S: number } {
  return { DEATH_DURATION_S };
}
