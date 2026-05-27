// S163 KABOOM-CAMERA-FOLLOW (GDP-2026-05-28-008).
//
// S163-g revert: every iteration of damped follow (smoothing 0.18 +
// look-ahead, smoothing 0.08 + look-ahead, snap, deadzone) produced
// visible doubling/jitter in playtest ('колбасит', 'двоится'). Best
// guess: the engine's render pipeline (transform-resolve →
// camera-sync) plus my per-frame Transform write triggers a
// one-frame oscillation that reads as a ghost image.
//
// Until we can debug the engine-side pipeline interaction safely,
// this system is a NO-OP for follow + only adjusts the camera's
// orthographicSize to deliver the 'closer framing' half of GDP-008.
// The camera stays at its authored scene position. Bombers near the
// arena edges read smaller; that's fine until the follow path is
// fixed.
//
// clampCameraToArena pure helper is still exported (covered by unit
// tests) — useful for the future re-enable.

import type { ComponentName, EntityId } from "../../../../engine/core/ecs/types";
import type { World } from "../../../../engine/core/ecs/world";
import type { System, SystemContext } from "../../../../engine/core/systems/types";

const CAMERA: ComponentName = "Camera";
const TRANSFORM: ComponentName = "Transform";

export type KaboomCameraMode = "follow" | "centre" | "spectate";

export type KaboomCameraFollowOptions = {
  name?: string;
  cameraId?: EntityId;
  targetId?: EntityId;
  mode?: KaboomCameraMode;
  spectateTargetId?: EntityId;
  /** Half-height of the orthographic frustum in world units (default 6). */
  viewSize?: number;
  smoothing?: number;
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

const DEFAULT_OFFSET: readonly [number, number, number] = [0, 10, 7];
const DEFAULT_VIEW_SIZE = 6;
const DEFAULT_SMOOTHING = 0.18;
const DEFAULT_PITCH_DEG = -55;

/**
 * Pure helper — clamp a desired camera centre so the orthographic
 * frustum at floor height stays inside the arena bounds.
 *
 * Preserved across the S163-g revert because the helper is well-tested
 * (covered by unit tests) and the future re-enable of follow will use
 * the same math.
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
  const viewSize = options.viewSize ?? DEFAULT_VIEW_SIZE;
  // Other options retained for forward compatibility with the future
  // follow-enabled version; not consumed by the current no-op path.
  void options.targetId;
  void options.spectateTargetId;
  void options.mode;
  void options.smoothing;
  void options.cameraOffset;

  let cachedWorld: World | undefined;

  const frameUpdate = (context: SystemContext): void => {
    const world = context.world;
    if (world !== cachedWorld) cachedWorld = world;
    if (!world.hasEntity(cameraId)) return;
    const cam = world.getComponent<CameraLike>(cameraId, CAMERA);
    if (cam === undefined) return;
    // Only knob: tighten the orthographic frustum for closer framing.
    if (cam.kind === "orthographic" && cam.orthographicSize !== viewSize) {
      world.setComponent(cameraId, CAMERA, { ...cam, orthographicSize: viewSize });
    }
  };

  return { name, frameUpdate };
}

export const __CAMERA_FOLLOW_CONSTANTS = {
  DEFAULT_OFFSET,
  DEFAULT_VIEW_SIZE,
  DEFAULT_SMOOTHING,
  DEFAULT_PITCH_DEG
};
