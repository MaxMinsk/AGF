// S109 KABOOM-HIT-RECOIL.
//
// Plays the survive-a-hit pose: when blast-propagation-system absorbs a
// blast with the bomber's shield, it stamps `HitRecoilRequest` on the
// bomber root. This system consumes the request and drives a quick
// two-phase tween on the bomber's TORSO entity (id = `${rootId}.torso`)
// Transform.rotation.X:
//
//   Phase 1 (recoil away, 0.10 s): 0  → -RECOIL_DEG (or +RECOIL_DEG,
//     signed so the torso pitches AWAY from the blast origin).
//   Phase 2 (return, 0.18 s): peak → 0.
//
// The system targets the TORSO, never the ROOT. The ragdoll
// (death-trigger-system → engine ragdoll module) targets the ROOT.
// They never fight because they touch different entities — and
// they're mutually exclusive triggers anyway: hit-recoil fires when
// alive STAYS true; ragdoll fires when alive flips false.

import type { ComponentName, EntityId } from "../../../../engine/core/ecs/types";
import type { QueryHandle, World } from "../../../../engine/core/ecs/world";
import type { System, SystemContext } from "../../../../engine/core/systems/types";
import { spawnPuff } from "./spawn-puff";

const HIT_RECOIL_REQUEST: ComponentName = "HitRecoilRequest";
const HIT_RECOIL_ACTIVE: ComponentName = "HitRecoilActive";
const TRANSFORM: ComponentName = "Transform";
const GRID_POSITION: ComponentName = "GridPosition";

/** S244 — incremental id for the shield-save spark puff so back-to-back
 *  saves on the same bomber (rare but possible) don't collide on entity
 *  ids. Module-scoped, deterministic per-process. */
let shieldPuffCounter = 0;

export const RECOIL_PEAK_DEG = 8;
export const RECOIL_OUT_S = 0.10;
export const RECOIL_RETURN_S = 0.18;
export const RECOIL_TOTAL_S = RECOIL_OUT_S + RECOIL_RETURN_S;

type HitRecoilRequest = { blastOriginGx: number; blastOriginGz: number };
type HitRecoilActive = {
  /** Seconds elapsed since the recoil began. */
  elapsed: number;
  /** Sign + magnitude (degrees) the torso pitches to at its peak. */
  peakDeg: number;
  /** Torso entity id we're driving. Cached so each fixedUpdate stays cheap. */
  torsoId: EntityId;
};

type TransformLike = {
  position?: ReadonlyArray<number>;
  rotation?: ReadonlyArray<number>;
  scale?: ReadonlyArray<number>;
  parent?: string;
};

type GridPositionLike = { gx: number; gz: number };

/**
 * Pure helper — returns the X-rotation (degrees) for a recoil that
 * started `t = 0` and has been running for `elapsed` seconds.
 *
 * Outbound leg (0 → RECOIL_OUT_S): linear ramp 0 → peakDeg.
 * Inbound leg (RECOIL_OUT_S → RECOIL_TOTAL_S): linear ramp peakDeg → 0.
 * Past the total duration: returns 0 + caller is expected to clean up.
 */
export function hitRecoilRotationDeg(elapsed: number, peakDeg: number): number {
  if (elapsed <= 0) return 0;
  if (elapsed < RECOIL_OUT_S) {
    return peakDeg * (elapsed / RECOIL_OUT_S);
  }
  if (elapsed < RECOIL_TOTAL_S) {
    const tIn = (elapsed - RECOIL_OUT_S) / RECOIL_RETURN_S;
    return peakDeg * (1 - tIn);
  }
  return 0;
}

/**
 * Pure helper — peak rotation sign + magnitude given the bomber's
 * grid cell and the blast origin. The torso pitches AWAY from the
 * blast in the dominant axis: blast to the south → torso pitches
 * north-ward (positive X). When blast is exactly co-located with the
 * bomber, return +RECOIL_PEAK_DEG (forward pitch) as a deterministic
 * fallback.
 */
export function recoilPeakDeg(
  bomberGx: number,
  bomberGz: number,
  blastGx: number,
  blastGz: number
): number {
  const dz = bomberGz - blastGz;
  // Z is the dominant axis for an X-rotation recoil (rotation around X
  // pitches the body forward/back, which reads as 'pushed in Z').
  // When dz > 0 (bomber north of blast), pitch BACK (+RECOIL_PEAK_DEG).
  // When dz < 0 (bomber south of blast), pitch FORWARD (-RECOIL_PEAK_DEG).
  // Direct hit (dz == 0): fall back to +RECOIL_PEAK_DEG.
  if (dz >= 0) return RECOIL_PEAK_DEG;
  return -RECOIL_PEAK_DEG;
}

export function createKaboomHitRecoilSystem(options: { name?: string } = {}): System {
  const name = options.name ?? "kaboom.hit-recoil";
  let cachedWorld: World | undefined;
  let requestQuery: QueryHandle | undefined;
  let activeQuery: QueryHandle | undefined;

  return {
    name,
    fixedUpdate(context: SystemContext): void {
      const world = context.world;
      if (world !== cachedWorld) {
        requestQuery = world.createQuery([HIT_RECOIL_REQUEST]);
        activeQuery = world.createQuery([HIT_RECOIL_ACTIVE]);
        cachedWorld = world;
      }
      const dt = Math.max(0, context.time.fixedDt);

      // 1. Consume any new HitRecoilRequest transients → spin up
      //    HitRecoilActive on the same entity (request and active are
      //    BOTH attached to the bomber root, not the torso, so the
      //    cleanup query stays single-entity-per-bomber).
      const requestIds = [...requestQuery!.run()];
      for (const id of requestIds) {
        const req = world.getComponent<HitRecoilRequest>(id, HIT_RECOIL_REQUEST);
        world.removeComponent(id, HIT_RECOIL_REQUEST);
        if (req === undefined) continue;
        const pos = world.getComponent<GridPositionLike>(id, GRID_POSITION);
        const gx = pos?.gx ?? 0;
        const gz = pos?.gz ?? 0;
        const peakDeg = recoilPeakDeg(gx, gz, req.blastOriginGx, req.blastOriginGz);
        const torsoId = `${id}.torso`;
        if (!world.hasEntity(torsoId)) continue;
        world.setComponent(id, HIT_RECOIL_ACTIVE, {
          elapsed: 0,
          peakDeg,
          torsoId
        } satisfies HitRecoilActive);

        // S244 KABOOM-SHIELD-SAVE-PUFF (S247 — via shared `spawnPuff`).
        // Brighter than S243 bomb-place because this is a survival
        // moment, not a routine action.
        shieldPuffCounter += 1;
        spawnPuff(world, {
          id: `${id}.shield-save.${shieldPuffCounter}`,
          position: [gx, 0.9, gz],
          preset: "spark",
          lifetime: 0.4,
          rate: 50,
          maxParticles: 16
        });
      }

      // 2. Tick every active recoil. When elapsed exceeds the total
      //    duration, snap torso rotation.X back to 0 and remove the
      //    component so the torso is free for the next recoil.
      const activeIds = [...activeQuery!.run()];
      for (const id of activeIds) {
        const active = world.getComponent<HitRecoilActive>(id, HIT_RECOIL_ACTIVE);
        if (active === undefined) continue;
        const nextElapsed = active.elapsed + dt;
        const torso = world.getComponent<TransformLike>(active.torsoId, TRANSFORM);
        if (torso !== undefined) {
          const rotation = torso.rotation ?? [0, 0, 0];
          const rotX = hitRecoilRotationDeg(nextElapsed, active.peakDeg);
          world.setComponent(active.torsoId, TRANSFORM, {
            ...torso,
            rotation: [rotX, rotation[1] ?? 0, rotation[2] ?? 0]
          });
        }
        if (nextElapsed >= RECOIL_TOTAL_S) {
          world.removeComponent(id, HIT_RECOIL_ACTIVE);
        } else {
          world.setComponent(id, HIT_RECOIL_ACTIVE, { ...active, elapsed: nextElapsed });
        }
      }
    }
  };
}
