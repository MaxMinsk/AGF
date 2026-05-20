// S87 KABOOM-CAMERA-SHAKE.
//
// Tiny project-local system that perturbs the active camera's
// Transform.position whenever a BlastEvent transient is alive. Read
// blast range to scale shake intensity (range-4 detonation feels
// more than range-2). Shake decays exponentially toward zero and
// snaps back to the captured baseline once intensity falls below
// 0.001.
//
// The baseline position is captured the first frame the system sees
// the active camera; restored on every frame when intensity is
// zero. No new components, no schema changes.

import type { ComponentName, EntityId } from "../../../../engine/core/ecs/types";
import type { QueryHandle, World } from "../../../../engine/core/ecs/world";
import type { System, SystemContext } from "../../../../engine/core/systems/types";
import { easingCurves } from "../../../../engine/core/systems/tween-system";

const BLAST_EVENT: ComponentName = "BlastEvent";
const CAMERA: ComponentName = "Camera";
const TRANSFORM: ComponentName = "Transform";

type Vec3 = [number, number, number];

type TransformComponent = {
  position?: ReadonlyArray<number>;
  rotation?: ReadonlyArray<number>;
  scale?: ReadonlyArray<number>;
};

type CameraComponent = { active?: boolean };

type BlastEvent = { range?: number };

export type KaboomCameraShakeOptions = {
  name?: string;
  /** Per-range intensity bump applied when a BlastEvent is observed. Final intensity is clamped to maxIntensity. Default 0.06. */
  intensityPerRange?: number;
  /** Hard cap on shake intensity (world-units). Default 0.5. */
  maxIntensity?: number;
  /**
   * S095 KABOOM-CAMERA-EASING-ADOPT — total shake duration once
   * triggered. Replaces the old exponential `decayPerSecond` knob: the
   * envelope is now sampled as `peak * (1 - easeOutElastic(t/duration))`
   * so the shake stops with a small bouncy oscillation instead of
   * monotonic decay. Default 0.45 s.
   */
  durationSeconds?: number;
  /** Deterministic pseudo-random source for unit tests. Defaults to Math.random. */
  rng?: () => number;
};

export type CameraShakeApi = {
  /** Read current shake intensity — exposed for diagnostics + unit tests. */
  intensity(): number;
};

/**
 * S095 KABOOM-CAMERA-EASING-ADOPT — pure helper. Returns the active
 * intensity multiplier at `elapsed` seconds into a shake of total
 * `duration`, sampled from `easeOutElastic`. The envelope drops past
 * zero and rebounds (small bouncy stop) before settling at zero.
 * Exposed so tests can lock the curve.
 */
export function cameraShakeEnvelope(elapsed: number, duration: number): number {
  if (duration <= 0) return 0;
  if (elapsed <= 0) return 1;
  if (elapsed >= duration) return 0;
  const t = elapsed / duration;
  // easeOutElastic settles at 1 at t=1 with oscillation. We want the
  // opposite shape — start at 1, oscillate, end at 0 — so flip:
  return 1 - easingCurves.easeOutElastic(t);
}

export function createKaboomCameraShakeSystem(options: KaboomCameraShakeOptions = {}): System & CameraShakeApi {
  const name = options.name ?? "kaboom.camera-shake";
  const intensityPerRange = options.intensityPerRange ?? 0.06;
  const maxIntensity = options.maxIntensity ?? 0.5;
  const durationSeconds = options.durationSeconds ?? 0.45;
  const rng = options.rng ?? Math.random;

  let cachedWorld: World | undefined;
  let blastEvents: QueryHandle | undefined;
  let cameras: QueryHandle | undefined;
  let baseline: Vec3 | undefined;
  let baselineCameraId: EntityId | undefined;
  // S095 — track peak intensity at the moment of the most recent blast
  // event + how far we are into the duration window. The envelope is
  // sampled from `cameraShakeEnvelope(elapsed, duration)`.
  let peakIntensity = 0;
  let elapsed = 0;
  let currentIntensity = 0;

  const findActiveCamera = (world: World): EntityId | undefined => {
    for (const id of cameras!.run()) {
      const cam = world.getComponent<CameraComponent>(id, CAMERA);
      if (cam !== undefined && cam.active !== false) return id;
    }
    return undefined;
  };

  // S87 KABOOM-CAMERA-SHAKE — runs in fixedUpdate so it observes the
  // BlastEvent transient BEFORE blast-propagation-system consumes it
  // (the event only lives during the fixedUpdate phase). Same pattern
  // as audio-binding-system.
  const fixedUpdate = (context: SystemContext): void => {
    const world = context.world;
    if (world !== cachedWorld) {
      blastEvents = world.createQuery([BLAST_EVENT]);
      cameras = world.createQuery([CAMERA, TRANSFORM]);
      cachedWorld = world;
      baseline = undefined;
      baselineCameraId = undefined;
      peakIntensity = 0;
      elapsed = 0;
    }

    const cameraId = findActiveCamera(world);
    if (cameraId === undefined) return;
    const t = world.getComponent<TransformComponent>(cameraId, TRANSFORM);
    if (t === undefined || t.position === undefined) return;
    if (baseline === undefined || cameraId !== baselineCameraId) {
      baseline = [t.position[0] ?? 0, t.position[1] ?? 0, t.position[2] ?? 0];
      baselineCameraId = cameraId;
    }

    // Watch for BlastEvent transients — bump peak per detonation. A
    // new blast during a still-active shake resets the timeline so the
    // bounce stays in sync with the freshest event.
    for (const eventId of blastEvents!.run()) {
      const event = world.getComponent<BlastEvent>(eventId, BLAST_EVENT);
      const range = Math.max(1, event?.range ?? 2);
      peakIntensity = Math.min(maxIntensity, peakIntensity + intensityPerRange * range);
      elapsed = 0;
    }

    // S095 KABOOM-CAMERA-EASING-ADOPT — sample the envelope from
    // easeOutElastic so the shake stops with a tiny bouncy oscillation
    // rather than monotonic exponential fade.
    const dt = Math.max(0, context.time.fixedDt);
    elapsed = peakIntensity > 0 ? elapsed + dt : 0;
    currentIntensity = peakIntensity * cameraShakeEnvelope(elapsed, durationSeconds);
    if (peakIntensity > 0 && elapsed >= durationSeconds) {
      peakIntensity = 0;
      elapsed = 0;
    }
    if (currentIntensity < 0.001) {
      // Snap back to baseline.
      if (
        t.position[0] !== baseline[0] ||
        t.position[1] !== baseline[1] ||
        t.position[2] !== baseline[2]
      ) {
        world.setComponent(cameraId, TRANSFORM, { ...t, position: [baseline[0], baseline[1], baseline[2]] });
      }
      currentIntensity = 0;
      return;
    }
    const ox = (rng() * 2 - 1) * currentIntensity;
    const oy = (rng() * 2 - 1) * currentIntensity * 0.5;
    const oz = (rng() * 2 - 1) * currentIntensity;
    world.setComponent(cameraId, TRANSFORM, {
      ...t,
      position: [baseline[0] + ox, baseline[1] + oy, baseline[2] + oz]
    });
  };

  return {
    name,
    fixedUpdate,
    intensity(): number {
      return currentIntensity;
    }
  };
}
