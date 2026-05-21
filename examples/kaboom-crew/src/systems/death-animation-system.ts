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
import type { GridOccupancyQuery } from "../../../../engine/core/systems/grid-occupancy-system";

const DEATH_ANIM: ComponentName = "DeathAnim";
const RAGDOLL_STATE: ComponentName = "RagdollState";
const TRANSFORM: ComponentName = "Transform";
const LIMB_PIVOTS: ComponentName = "LimbPivots";
const SPRING_PIVOT: ComponentName = "SpringPivot";
const GRID_POSITION: ComponentName = "GridPosition";

const DEATH_DURATION_S = 0.6;
// S108 v3 — halved per user playtest. vy=2.0 + horizontal=2.5 gives
// ~1.1 cells of knockback travel over a 0.44s arc. Tumble rate stays
// at PI/2 so spin reads naturally over the shorter airtime.
const LAUNCH_VY = 2.0;
const LAUNCH_HORIZONTAL = 2.5;
const GRAVITY = -9.0;
const TUMBLE_RATE = Math.PI / 2;
// S108 — 1-second smooth ramp of limb-spring damping after landing.
const LIMB_SETTLE_DURATION_S = 1.0;
const LIMB_SETTLE_START_DAMPING = 0.4;
const LIMB_SETTLE_END_DAMPING = 18.0;
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
  /** S108 — context.time.elapsed when the bomber landed. Drives the 1s damping ramp on the limb springs. */
  landedAt?: number;
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
function clampDeg(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

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

export type KaboomDeathAnimationSystemOptions = {
  name?: string;
  /**
   * S108 KABOOM-RAGDOLL-WALL-COLLISION. Optional occupancy query;
   * when supplied, the ragdoll arc samples the destination cell each
   * frame and zeroes the X / Z velocity axis when a hard-block sits
   * there — so the bomber doesn't visually clip through walls.
   * Without it, no collision checks happen (legacy behaviour).
   */
  occupancy?: GridOccupancyQuery;
};

export function createKaboomDeathAnimationSystem(options: KaboomDeathAnimationSystemOptions = {}): System {
  const name = options.name ?? "kaboom.death-animation";
  const occupancy = options.occupancy;
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
            // S108 v2 — use Transform.position (world coords) rather
            // than GridPosition (cell coords). Mid-lerp bombers still
            // have their OLD GridPosition until lerp completes; if the
            // OLD cell equals the bomb cell, diff=0 → wrong direction.
            // Transform.position is interpolated by GridMovementSystem
            // so it reflects the bomber's TRUE current location.
            const worldX = basePosition[0] ?? 0;
            const worldZ = basePosition[2] ?? 0;
            const rawX = worldX - ragdoll.blastOriginGx;
            const rawZ = worldZ - ragdoll.blastOriginGz;
            const len = Math.hypot(rawX, rawZ);
            if (len > 1e-6) {
              dirX = rawX / len;
              dirZ = rawZ / len;
            } else {
              // True direct hit (bomber AT bomb cell exactly). Knock
              // them BACKWARD from their facing direction so the
              // launch still has a visible effect.
              const yawDeg = baseRotation[1] ?? 0;
              const yawRad = (yawDeg * Math.PI) / 180;
              const forwardX = Math.sin(yawRad);
              const forwardZ = -Math.cos(yawRad);
              dirX = -forwardX;
              dirZ = -forwardZ;
            }
            magnitude = ragdoll.magnitude ?? 1.0;
          }
          // S108 — add the bomber's existing motion velocity to the
          // launch impulse. If they were running AWAY from the bomb,
          // that velocity reinforces the knockback; if they were running
          // TOWARD the bomb, the blast partially cancels their momentum
          // (still pushes them away, but less). cellSize=1 → grid speed
          // = world speed in cells/sec.
          const mover = world.getComponent<{ speed?: number; queuedDirection?: { dx: number; dz: number }; currentLerp?: number }>(id, "GridMover");
          let existingVx = 0;
          let existingVz = 0;
          if (mover !== undefined && (mover.currentLerp ?? 0) > 0) {
            const speed = mover.speed ?? 0;
            existingVx = (mover.queuedDirection?.dx ?? 0) * speed;
            existingVz = (mover.queuedDirection?.dz ?? 0) * speed;
          }
          const velocity = [
            dirX * magnitude * LAUNCH_HORIZONTAL + existingVx,
            LAUNCH_VY,
            dirZ * magnitude * LAUNCH_HORIZONTAL + existingVz
          ];
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
          // S108 — opt the bomber out of GridMovementSystem's position
          // writes so the ragdoll arc isn't fought by grid-snap.
          world.setComponent(id, "MotionOverride", {});
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
        const baseY = basePosition[1] ?? 0;
        const currentY = transform.position?.[1] ?? baseY;
        const newVy = (velocity[1] ?? 0) + GRAVITY * dt;
        const rawNextY = currentY + newVy * dt;
        // S108 KABOOM-RAGDOLL-WALL-COLLISION. Sample destination cell
        // per axis; zero the velocity component when a hard-block sits
        // there so the bomber stops along that axis but keeps falling.
        let vx = velocity[0] ?? 0;
        let vz = velocity[2] ?? 0;
        if (occupancy !== undefined) {
          const currentX = transform.position?.[0] ?? basePosition[0] ?? 0;
          const currentZ = transform.position?.[2] ?? basePosition[2] ?? 0;
          const nextX = currentX + vx * dt;
          const nextZ = currentZ + vz * dt;
          // cellSize=1, originX/Z=0 → world coord rounds to cell index.
          const nextCellGx = Math.round(nextX);
          const nextCellGz = Math.round(currentZ);
          const nextCellGzAlt = Math.round(nextZ);
          if (Math.abs(vx) > 1e-4 && occupancy.blocked(nextCellGx, Math.round(currentZ), "blast")) {
            vx = 0;
          }
          if (Math.abs(vz) > 1e-4 && occupancy.blocked(Math.round(currentX), nextCellGzAlt, "blast")) {
            vz = 0;
          }
          void nextCellGz; // marker for sanity — separate axis lookup
        }
        // S108 KABOOM-RAGDOLL-GROUND-CLAMP. Detect "landed": root has
        // reached baseY AND is still falling (vy <= 0). When landed,
        // freeze linear AND angular velocity + clamp tumble rotations
        // to ±90° so the body lies on its back/front/side instead of
        // continuing to spin through the floor.
        const landed = rawNextY <= baseY && newVy <= 0;
        const nextPos = [
          (transform.position?.[0] ?? basePosition[0] ?? 0) + vx * dt,
          landed ? baseY : rawNextY,
          (transform.position?.[2] ?? basePosition[2] ?? 0) + vz * dt
        ];
        const newVelocity = landed
          ? [0, 0, 0]
          : [vx, newVy, vz];
        const rotIntegrate = (axis: number): number => {
          const current = transform.rotation?.[axis] ?? baseRotation[axis] ?? 0;
          if (landed) return clampDeg(current, -90, 90);
          const next = current + (angularVelocity[axis] ?? 0) * dt * (180 / Math.PI);
          return next;
        };
        const nextRotDeg = [rotIntegrate(0), rotIntegrate(1), rotIntegrate(2)];
        world.setComponent(id, TRANSFORM, {
          ...transform,
          position: nextPos,
          rotation: nextRotDeg
        });
        const nextAngularVelocity = landed ? [0, 0, 0] : angularVelocity;
        // S108 — 1-second gradual ramp of limb-spring damping after
        // landing. On the first landed frame, lock each limb's rest
        // rotation to its CURRENT pose so the spring decays in place
        // (not back to T-pose). Each subsequent frame, lerp damping
        // from 0.4 (lively flail) up to 18 (over-damped) over 1 s.
        // After the ramp completes, damping stays at 18 — limbs hold
        // their final pose without further wobble.
        const nextLandedAt = anim.landedAt ?? (landed ? context.time.elapsed : undefined);
        const justLanded = landed && anim.landedAt === undefined;
        if (justLanded) {
          const limbs = world.getComponent<LimbPivotsLike>(id, LIMB_PIVOTS);
          if (limbs !== undefined) {
            for (const pivotName of LIMB_PIVOT_NAMES) {
              const pivotId = limbs[pivotName];
              if (pivotId === undefined) continue;
              const spring = world.getComponent<{ velocity?: ReadonlyArray<number>; restRotation?: ReadonlyArray<number> }>(pivotId, SPRING_PIVOT);
              if (spring === undefined) continue;
              const transformNow = world.getComponent<{ rotation?: ReadonlyArray<number> }>(pivotId, TRANSFORM);
              const restNow = transformNow?.rotation ?? spring.restRotation ?? [0, 0, 0];
              world.setComponent(pivotId, SPRING_PIVOT, {
                ...spring,
                restRotation: [restNow[0] ?? 0, restNow[1] ?? 0, restNow[2] ?? 0],
                k: 18,
                damping: LIMB_SETTLE_START_DAMPING
              });
            }
          }
        } else if (landed && nextLandedAt !== undefined) {
          const sinceLanded = context.time.elapsed - nextLandedAt;
          if (sinceLanded < LIMB_SETTLE_DURATION_S) {
            const t = sinceLanded / LIMB_SETTLE_DURATION_S;
            const damping = LIMB_SETTLE_START_DAMPING + (LIMB_SETTLE_END_DAMPING - LIMB_SETTLE_START_DAMPING) * t;
            const limbs = world.getComponent<LimbPivotsLike>(id, LIMB_PIVOTS);
            if (limbs !== undefined) {
              for (const pivotName of LIMB_PIVOT_NAMES) {
                const pivotId = limbs[pivotName];
                if (pivotId === undefined) continue;
                const spring = world.getComponent<{ velocity?: ReadonlyArray<number>; restRotation?: ReadonlyArray<number>; k?: number; damping?: number }>(pivotId, SPRING_PIVOT);
                if (spring === undefined) continue;
                world.setComponent(pivotId, SPRING_PIVOT, { ...spring, damping });
              }
            }
          }
        }
        world.setComponent(id, DEATH_ANIM, {
          ...anim,
          elapsed,
          velocity: newVelocity,
          angularVelocity: nextAngularVelocity,
          ...(landed && nextLandedAt !== undefined ? { landedAt: nextLandedAt } : {})
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
