// S163 KABOOM-CAMERA-FOLLOW (GDP-2026-05-28-008).
//
// Damped pursuit of the local player (entity id from options.targetId,
// default 'player.1'). Each frameUpdate the system:
//   1. Reads the target bomber's Transform.position.
//   2. Computes a desired camera position = target + cameraOffset.
//   3. Damps the camera's Transform.position toward the desired one
//      via a frame-rate-aware lerp.
//   4. Clamps the camera position laterally so the orthographic view
//      frustum stays within the arena's grid bounds — small arenas
//      end up effectively centred (current behaviour), large arenas
//      have the camera actually follow the bomber.
//   5. Optionally adjusts Camera.orthographicSize to the configured
//      target (default 6 = 12 cells vertical).
//
// Spectator / bot-vs-bot mode: when the target entity is missing,
// falls back to the arena centre + freezes the camera (mode='centre').
//
// URL flags handled by bootstrap and passed in via options:
//   ?camera=follow (default) / ?camera=centre / ?camera=spectate-X
//   ?viewSize=N (8..20)

import type { ComponentName, EntityId } from "../../../../engine/core/ecs/types";
import type { QueryHandle, World } from "../../../../engine/core/ecs/world";
import type { System, SystemContext } from "../../../../engine/core/systems/types";

const CAMERA: ComponentName = "Camera";
const TRANSFORM: ComponentName = "Transform";
const GRID: ComponentName = "Grid";

export type KaboomCameraMode = "follow" | "centre" | "spectate";

export type KaboomCameraFollowOptions = {
  name?: string;
  /** Camera entity id (default 'camera.main'). */
  cameraId?: EntityId;
  /** Target bomber entity id when mode='follow' (default 'player.1'). */
  targetId?: EntityId;
  /** Camera mode — follow / centre / spectate. */
  mode?: KaboomCameraMode;
  /** Target entity for spectate mode. */
  spectateTargetId?: EntityId;
  /** Half-height of the orthographic frustum in world units (default 6 = 12 cells vertical). */
  viewSize?: number;
  /** Damping in 0..1; 1 = snap, 0 = frozen. Default 0.18. */
  smoothing?: number;
  /** Camera offset from bomber (default [0, 10, 7], a ~55° downward angle). */
  cameraOffset?: ReadonlyArray<number>;
};

type TransformLike = {
  position?: ReadonlyArray<number>;
  rotation?: ReadonlyArray<number>;
  scale?: ReadonlyArray<number>;
  parent?: string;
};

type CameraLike = {
  kind?: "perspective" | "orthographic";
  active?: boolean;
  orthographicSize?: number;
  near?: number;
  far?: number;
  fov?: number;
};

type GridConfig = { sizeX?: number; sizeZ?: number; cellSize?: number; originX?: number; originZ?: number };

const DEFAULT_OFFSET: readonly [number, number, number] = [0, 10, 7];
const DEFAULT_VIEW_SIZE = 6;
// S163-d playtest tuning ('кинематографичнее, не четко следовать,
// чуть отставать, догонять'): soft damping that lags behind during
// motion and catches up smoothly. Coupled with look-ahead so the
// camera leans into the bomber's velocity instead of trailing.
const DEFAULT_SMOOTHING = 0.08;
const DEFAULT_LOOK_AHEAD_MS = 220;
// Camera pitch for the default offset — atan2(10, 7) = ~55° from vertical
// → we rotate -55° around X to look down at a ~55°-from-horizontal angle.
const DEFAULT_PITCH_DEG = -55;
// S163-d jitter fix: the bomber's grid-mover-interpolation can spike
// dt per vsync hiccup → causes visible camera 'snap'. Cap the
// effective dt fed into the damping formula so a one-frame stall
// doesn't translate to a huge alpha step.
const MAX_EFFECTIVE_DT = 1 / 30;

/**
 * Pure helper — clamp a desired camera centre so the orthographic
 * frustum at floor height stays inside the arena bounds. `viewWidth`
 * and `viewDepth` are the world-unit width/depth the camera shows
 * (orthographicSize derives them via aspect + view-size). Returns the
 * clamped (cameraX, cameraZ). When the frustum is wider than the
 * arena along an axis, the camera stays centred along that axis.
 *
 * S163-c playtest fix: original code clamped both axes when view <
 * arena, which kept the bomber off-centre at the arena edges and
 * read as 'camera doesn't reach the edge of the screen'. Add a small
 * `edgePadding` knob (default 0 = strict clamp, > 0 = allow camera to
 * push outside the arena by that many cells per side) so the bomber
 * can stay closer to screen-centre at the arena perimeter.
 */
export function clampCameraToArena(
  desiredX: number,
  desiredZ: number,
  viewWidth: number,
  viewDepth: number,
  arenaMinX: number,
  arenaMaxX: number,
  arenaMinZ: number,
  arenaMaxZ: number,
  edgePadding = 0
): { x: number; z: number } {
  const halfW = viewWidth / 2;
  const halfD = viewDepth / 2;
  const arenaW = arenaMaxX - arenaMinX;
  const arenaD = arenaMaxZ - arenaMinZ;
  const x = viewWidth >= arenaW + 2 * edgePadding
    ? (arenaMinX + arenaMaxX) / 2
    : Math.max(arenaMinX + halfW - edgePadding, Math.min(arenaMaxX - halfW + edgePadding, desiredX));
  const z = viewDepth >= arenaD + 2 * edgePadding
    ? (arenaMinZ + arenaMaxZ) / 2
    : Math.max(arenaMinZ + halfD - edgePadding, Math.min(arenaMaxZ - halfD + edgePadding, desiredZ));
  return { x, z };
}

export function createKaboomCameraFollowSystem(options: KaboomCameraFollowOptions = {}): System {
  const name = options.name ?? "kaboom.camera-follow";
  const cameraId = options.cameraId ?? "camera.main";
  const targetId = options.mode === "spectate"
    ? options.spectateTargetId ?? options.targetId ?? "player.1"
    : options.targetId ?? "player.1";
  const mode = options.mode ?? "follow";
  const viewSize = options.viewSize ?? DEFAULT_VIEW_SIZE;
  const smoothing = Math.max(0, Math.min(1, options.smoothing ?? DEFAULT_SMOOTHING));
  const cameraOffset = options.cameraOffset ?? DEFAULT_OFFSET;

  let cachedWorld: World | undefined;
  let cameras: QueryHandle | undefined;
  // S163-d look-ahead state: track previous target position to derive
  // per-frame velocity and project the camera centre forward by ~0.22s.
  let prevTargetX: number | undefined;
  let prevTargetZ: number | undefined;
  let velTargetX = 0;
  let velTargetZ = 0;
  const lookAheadMs = DEFAULT_LOOK_AHEAD_MS;

  const frameUpdate = (context: SystemContext): void => {
    const world = context.world;
    if (world !== cachedWorld) {
      cameras = world.createQuery([CAMERA, TRANSFORM]);
      cachedWorld = world;
    }
    if (!world.hasEntity(cameraId)) return;
    const cam = world.getComponent<CameraLike>(cameraId, CAMERA);
    const camTransform = world.getComponent<TransformLike>(cameraId, TRANSFORM);
    if (cam === undefined || camTransform === undefined) return;

    // Apply view-size + pitch (orthographicSize may have been authored
    // at a larger value to fit the whole arena; the follow system wants
    // a smaller, closer frame).
    if (cam.kind === "orthographic" && cam.orthographicSize !== viewSize) {
      world.setComponent(cameraId, CAMERA, { ...cam, orthographicSize: viewSize });
    }

    // Arena bounds from grid.config.
    const grid = world.getComponent<GridConfig>("grid.config", GRID);
    const sizeX = grid?.sizeX ?? 15;
    const sizeZ = grid?.sizeZ ?? 11;
    const cellSize = grid?.cellSize ?? 1;
    const originX = grid?.originX ?? 0;
    const originZ = grid?.originZ ?? 0;
    const arenaMinX = originX - cellSize / 2;
    const arenaMaxX = originX + (sizeX - 1) * cellSize + cellSize / 2;
    const arenaMinZ = originZ - cellSize / 2;
    const arenaMaxZ = originZ + (sizeZ - 1) * cellSize + cellSize / 2;
    const arenaCentreX = (arenaMinX + arenaMaxX) / 2;
    const arenaCentreZ = (arenaMinZ + arenaMaxZ) / 2;

    // Determine target centre by mode + estimate velocity for look-ahead.
    let targetCentreX = arenaCentreX;
    let targetCentreZ = arenaCentreZ;
    let hasLiveTarget = false;
    if (mode === "follow" || mode === "spectate") {
      const t = world.getComponent<TransformLike>(targetId, TRANSFORM);
      if (t?.position !== undefined) {
        targetCentreX = t.position[0] ?? arenaCentreX;
        targetCentreZ = t.position[2] ?? arenaCentreZ;
        hasLiveTarget = true;
      }
    }
    // S163-d cinematic look-ahead — bias the camera centre forward by
    // a fraction of the target's velocity. Smooths over jittery
    // per-frame deltas via simple EMA on the velocity estimate.
    const dtForVel = Math.max(0.001, Math.min(MAX_EFFECTIVE_DT, context.time.dt));
    if (hasLiveTarget && prevTargetX !== undefined && prevTargetZ !== undefined) {
      const instantVx = (targetCentreX - prevTargetX) / dtForVel;
      const instantVz = (targetCentreZ - prevTargetZ) / dtForVel;
      // EMA at ~0.20 so velocity estimate doesn't whip on a single
      // bomber-pose hiccup but tracks sustained motion within 5 frames.
      velTargetX = velTargetX * 0.8 + instantVx * 0.2;
      velTargetZ = velTargetZ * 0.8 + instantVz * 0.2;
    } else if (!hasLiveTarget) {
      velTargetX = 0;
      velTargetZ = 0;
    }
    prevTargetX = targetCentreX;
    prevTargetZ = targetCentreZ;
    const lookAheadSec = lookAheadMs / 1000;
    const aheadX = velTargetX * lookAheadSec;
    const aheadZ = velTargetZ * lookAheadSec;
    targetCentreX += aheadX;
    targetCentreZ += aheadZ;

    // Compute view width/depth from orthographicSize + aspect. The
    // engine adapter projects this with the canvas aspect ratio, but
    // we don't have aspect here — assume 16:9 widescreen. Underestimate
    // is safe for clamp (we clamp slightly inside arena bounds).
    const aspect = 16 / 9;
    const viewWidth = viewSize * 2 * aspect;
    const viewDepth = viewSize * 2;

    // S163-c playtest fix: clamp by default was too strict — the user
    // saw the bomber stuck near the side of the view at the arena
    // edges ('не доезжает до краёв экрана'). Pass a generous
    // edgePadding so the camera continues following the bomber even
    // when the bomber walks near or past the arena perimeter; black
    // out-of-arena background at the screen edge is acceptable.
    const clamped = clampCameraToArena(
      targetCentreX,
      targetCentreZ,
      viewWidth,
      viewDepth,
      arenaMinX,
      arenaMaxX,
      arenaMinZ,
      arenaMaxZ,
      Math.max(viewWidth, viewDepth)  // effectively disable the clamp
    );

    const desiredX = clamped.x + (cameraOffset[0] ?? 0);
    const desiredY = (cameraOffset[1] ?? 10);
    const desiredZ = clamped.z + (cameraOffset[2] ?? 0);

    // Frame-rate-aware exponential damp — clamped dt prevents a
    // single vsync hiccup from flinging the camera in one frame.
    const dt = Math.max(0, Math.min(MAX_EFFECTIVE_DT, context.time.dt));
    const alpha = smoothing >= 1 ? 1 : 1 - Math.pow(1 - smoothing, dt * 60);
    const prev = camTransform.position ?? [desiredX, desiredY, desiredZ];
    const px = (prev[0] ?? desiredX) + (desiredX - (prev[0] ?? desiredX)) * alpha;
    const py = (prev[1] ?? desiredY) + (desiredY - (prev[1] ?? desiredY)) * alpha;
    const pz = (prev[2] ?? desiredZ) + (desiredZ - (prev[2] ?? desiredZ)) * alpha;

    world.setComponent(cameraId, TRANSFORM, {
      ...camTransform,
      position: [px, py, pz],
      rotation: [DEFAULT_PITCH_DEG, 0, 0]
    });
  };

  return { name, frameUpdate };
}

export const __CAMERA_FOLLOW_CONSTANTS = {
  DEFAULT_OFFSET,
  DEFAULT_VIEW_SIZE,
  DEFAULT_SMOOTHING,
  DEFAULT_PITCH_DEG
};
