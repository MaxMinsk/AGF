// S195 KABOOM-CAMERA-CONTROL. Single-owner of camera.main
// `Transform.position`. Combines two responsibilities that lived in
// separate systems before:
//
//   1. Damped FOLLOW toward player.1's world position (the new bit).
//   2. SHAKE offset on BlastEvent (the existing S87/S95 behaviour,
//      ported in-place with the same easeOutElastic envelope).
//
// Why combined: keeping camera position writes inside ONE system,
// ONE tick phase (fixedUpdate), and ONE setComponent call per tick
// is what kept this story away from the S163 doubling artifact —
// previously a damped follow + shake fought for Transform.position
// across frameUpdate/fixedUpdate boundaries and the renderer caught
// the position in two different states inside the same draw.
//
// URL flags (read at registerSystems time and threaded into the
// system options):
//   ?follow=off   → follow disabled, shake still active
//   ?follow=snap  → no damping; camera snaps to player each tick
//
// Engine `camera-sync-system` runs in frameUpdate AFTER the fixed
// tick, so it sees a stable position. Don't add any frameUpdate
// write paths here — that's the rule that broke S163.

import type { ComponentName, EntityId } from "../../../../engine/core/ecs/types";
import type { QueryHandle, World } from "../../../../engine/core/ecs/world";
import type { System, SystemContext } from "../../../../engine/core/systems/types";
import { easingCurves } from "../../../../engine/core/systems/tween-system";

const CAMERA: ComponentName = "Camera";
const TRANSFORM: ComponentName = "Transform";
const BLAST_EVENT: ComponentName = "BlastEvent";

const CAMERA_ENTITY_ID = "camera.main";
const PLAYER_ENTITY_ID = "player.1";

/** S87/S95 shake constants kept identical so the feel doesn't change. */
const SHAKE_INTENSITY_PER_RANGE = 0.06;
const SHAKE_MAX_INTENSITY = 0.5;
const SHAKE_DURATION_S = 0.45;

/** Follow constants (chosen by user 2026-05-29: "по плану"). */
const FOLLOW_RATE_PER_S = 1.5;
const MAX_FOLLOW_OFFSET = 3;

type Vec3 = [number, number, number];

type TransformComponent = {
  position?: ReadonlyArray<number>;
  rotation?: ReadonlyArray<number>;
  scale?: ReadonlyArray<number>;
};

type CameraComponent = { active?: boolean };

type BlastEvent = { range?: number };

export type FollowMode = "damped" | "off" | "snap";

export type KaboomCameraControlOptions = {
  name?: string;
  followMode?: FollowMode;
  /** Deterministic RNG for unit tests. Defaults to Math.random. */
  rng?: () => number;
  /** Optional override for the per-second follow lerp rate. */
  followRatePerSecond?: number;
};

export type CameraControlApi = {
  /** Current shake intensity — exposed for diagnostics + unit tests. */
  shakeIntensity(): number;
  /** Current follow offset in cells — exposed for unit tests. */
  followOffset(): Vec3;
};

/** Returns the [0..1] envelope multiplier of the shake amplitude at
 *  `elapsed` seconds into a shake of total `duration`. Identical curve
 *  to the S95 version so live feel doesn't change. */
export function cameraShakeEnvelope(elapsed: number, duration: number): number {
  if (duration <= 0) return 0;
  if (elapsed <= 0) return 1;
  if (elapsed >= duration) return 0;
  const t = elapsed / duration;
  return 1 - easingCurves.easeOutElastic(t);
}

export function createKaboomCameraControlSystem(
  options: KaboomCameraControlOptions = {}
): System & CameraControlApi {
  const name = options.name ?? "kaboom.camera-control";
  const followMode: FollowMode = options.followMode ?? "damped";
  const rng = options.rng ?? Math.random;
  const followRate = options.followRatePerSecond ?? FOLLOW_RATE_PER_S;

  let cachedWorld: World | undefined;
  let blastQuery: QueryHandle | undefined;
  let cameraQuery: QueryHandle | undefined;
  let authored: Vec3 | undefined;
  let authoredCameraId: EntityId | undefined;
  let currentFollow: Vec3 = [0, 0, 0];
  let peakShake = 0;
  let shakeElapsed = 0;
  let currentShake = 0;

  const findActiveCamera = (world: World): EntityId | undefined => {
    for (const id of cameraQuery!.run()) {
      if (id !== CAMERA_ENTITY_ID) continue; // single-source-of-truth
      const cam = world.getComponent<CameraComponent>(id, CAMERA);
      if (cam !== undefined && cam.active !== false) return id;
    }
    return undefined;
  };

  const fixedUpdate = (context: SystemContext): void => {
    const world = context.world;
    if (world !== cachedWorld) {
      blastQuery = world.createQuery([BLAST_EVENT]);
      cameraQuery = world.createQuery([CAMERA, TRANSFORM]);
      cachedWorld = world;
      authored = undefined;
      authoredCameraId = undefined;
      currentFollow = [0, 0, 0];
      peakShake = 0;
      shakeElapsed = 0;
      currentShake = 0;
    }

    const cameraId = findActiveCamera(world);
    if (cameraId === undefined) return;
    const t = world.getComponent<TransformComponent>(cameraId, TRANSFORM);
    if (t === undefined || t.position === undefined) return;

    if (authored === undefined || cameraId !== authoredCameraId) {
      // Capture the AUTHORED pose — the scene JSON position is the
      // baseline that follow + shake modulate around. We back-compute
      // by subtracting the current follow + shake offset, but on the
      // very first frame both are zero so the current Transform IS
      // the authored value.
      authored = [t.position[0] ?? 0, t.position[1] ?? 0, t.position[2] ?? 0];
      authoredCameraId = cameraId;
      currentFollow = [0, 0, 0];
      peakShake = 0;
      shakeElapsed = 0;
      currentShake = 0;
    }

    // --- Shake update (same logic as S95) ---
    for (const eventId of blastQuery!.run()) {
      const event = world.getComponent<BlastEvent>(eventId, BLAST_EVENT);
      const range = Math.max(1, event?.range ?? 2);
      peakShake = Math.min(SHAKE_MAX_INTENSITY, peakShake + SHAKE_INTENSITY_PER_RANGE * range);
      shakeElapsed = 0;
    }
    const dt = Math.max(0, context.time.fixedDt);
    shakeElapsed = peakShake > 0 ? shakeElapsed + dt : 0;
    currentShake = peakShake * cameraShakeEnvelope(shakeElapsed, SHAKE_DURATION_S);
    if (peakShake > 0 && shakeElapsed >= SHAKE_DURATION_S) {
      peakShake = 0;
      shakeElapsed = 0;
    }

    // --- Follow update ---
    let targetFollow: Vec3 = [0, 0, 0];
    if (followMode !== "off" && world.hasEntity(PLAYER_ENTITY_ID)) {
      const player = world.getComponent<TransformComponent>(PLAYER_ENTITY_ID, TRANSFORM);
      if (player?.position !== undefined) {
        // Offset relative to authored anchor. Y stays untouched —
        // camera height is locked.
        const dx = (player.position[0] ?? 0) - authored[0];
        const dz = (player.position[2] ?? 0) - authored[2];
        targetFollow = [
          clamp(dx, -MAX_FOLLOW_OFFSET, MAX_FOLLOW_OFFSET),
          0,
          clamp(dz, -MAX_FOLLOW_OFFSET, MAX_FOLLOW_OFFSET)
        ];
      }
    }
    if (followMode === "snap") {
      currentFollow = targetFollow;
    } else {
      const lerp = Math.min(1, followRate * dt);
      currentFollow = [
        currentFollow[0] + (targetFollow[0] - currentFollow[0]) * lerp,
        0,
        currentFollow[2] + (targetFollow[2] - currentFollow[2]) * lerp
      ];
    }

    // --- Compose final position (single write) ---
    const sx = (rng() * 2 - 1) * currentShake;
    const sy = (rng() * 2 - 1) * currentShake * 0.5;
    const sz = (rng() * 2 - 1) * currentShake * 1.0;
    const finalPos: Vec3 = [
      authored[0] + currentFollow[0] + sx,
      authored[1] + sy,
      authored[2] + currentFollow[2] + sz
    ];
    world.setComponent(cameraId, TRANSFORM, { ...t, position: finalPos });
  };

  return {
    name,
    fixedUpdate,
    shakeIntensity(): number {
      return currentShake;
    },
    followOffset(): Vec3 {
      return [currentFollow[0], currentFollow[1], currentFollow[2]];
    }
  };
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
