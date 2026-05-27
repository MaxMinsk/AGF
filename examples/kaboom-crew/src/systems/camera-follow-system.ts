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
const DEFAULT_SMOOTHING = 0.18;
// Camera pitch for the default offset — atan2(10, 7) = ~55° from vertical
// → we rotate -55° around X to look down at a ~55°-from-horizontal angle.
const DEFAULT_PITCH_DEG = -55;

/**
 * Pure helper — clamp a desired camera centre so the orthographic
 * frustum at floor height stays inside the arena bounds. `viewWidth`
 * and `viewDepth` are the world-unit width/depth the camera shows
 * (orthographicSize derives them via aspect + view-size). Returns the
 * clamped (cameraX, cameraZ). Returns the original centre when the
 * frustum is wider than the arena (just keep camera at arena centre).
 */
export function clampCameraToArena(
  desiredX: number,
  desiredZ: number,
  viewWidth: number,
  viewDepth: number,
  arenaMinX: number,
  arenaMaxX: number,
  arenaMinZ: number,
  arenaMaxZ: number
): { x: number; z: number } {
  const halfW = viewWidth / 2;
  const halfD = viewDepth / 2;
  const arenaW = arenaMaxX - arenaMinX;
  const arenaD = arenaMaxZ - arenaMinZ;
  // If the view is wider than the arena, just centre on the arena.
  const x = viewWidth >= arenaW
    ? (arenaMinX + arenaMaxX) / 2
    : Math.max(arenaMinX + halfW, Math.min(arenaMaxX - halfW, desiredX));
  const z = viewDepth >= arenaD
    ? (arenaMinZ + arenaMaxZ) / 2
    : Math.max(arenaMinZ + halfD, Math.min(arenaMaxZ - halfD, desiredZ));
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

    // Determine target centre by mode.
    let targetCentreX = arenaCentreX;
    let targetCentreZ = arenaCentreZ;
    if (mode === "follow" || mode === "spectate") {
      const t = world.getComponent<TransformLike>(targetId, TRANSFORM);
      if (t?.position !== undefined) {
        targetCentreX = t.position[0] ?? arenaCentreX;
        targetCentreZ = t.position[2] ?? arenaCentreZ;
      }
    }

    // Compute view width/depth from orthographicSize + aspect. The
    // engine adapter projects this with the canvas aspect ratio, but
    // we don't have aspect here — assume 16:9 widescreen. Underestimate
    // is safe for clamp (we clamp slightly inside arena bounds).
    const aspect = 16 / 9;
    const viewWidth = viewSize * 2 * aspect;
    const viewDepth = viewSize * 2;

    // Clamp the BOMBER-AT-FOOTING desired centre to arena bounds, then
    // add the camera offset to derive the actual camera position.
    const clamped = clampCameraToArena(
      targetCentreX,
      targetCentreZ,
      viewWidth,
      viewDepth,
      arenaMinX,
      arenaMaxX,
      arenaMinZ,
      arenaMaxZ
    );

    const desiredX = clamped.x + (cameraOffset[0] ?? 0);
    const desiredY = (cameraOffset[1] ?? 10);
    const desiredZ = clamped.z + (cameraOffset[2] ?? 0);

    // Frame-rate-aware exponential damp.
    const dt = Math.max(0, context.time.dt);
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
