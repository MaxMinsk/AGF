// M21-cam-follow: anchor the camera to a target entity's position.
//
// Each frame FollowCameraSystem reads the target entity's resolved
// world position (prefers `LocalToWorld`, falls back to `Transform`),
// places the camera at `target + offset`, and orients it toward
// `target + lookAtOffset` via a Three-style Euler look-at.
//
// `smoothing` (default 1 = snap) blends the previous camera position
// toward the new target position each frame using a frame-rate-aware
// lerp: `actual = prev + (next - prev) * (1 - (1 - smoothing) ^ dt*60)`.
// 0 = never move, 1 = snap, 0.5 ≈ ~halve the gap per frame at 60 Hz.

import type { ComponentName, EntityId } from "../../core/ecs/types";
import type { QueryHandle, World } from "../../core/ecs/world";
import type { System, SystemContext } from "../../core/systems/types";

export const FOLLOW_CAMERA: ComponentName = "FollowCamera";
export const TRANSFORM: ComponentName = "Transform";
export const LOCAL_TO_WORLD: ComponentName = "LocalToWorld";

type Vec3 = ReadonlyArray<number>;

type FollowCameraComponent = {
  target: EntityId;
  offset: Vec3;
  lookAtOffset?: Vec3;
  smoothing?: number;
};

type TransformComponent = {
  position?: Vec3;
  rotation?: Vec3;
  scale?: Vec3;
};

type LocalToWorldComponent = { position: Vec3 };

const RAD2DEG = 180 / Math.PI;

function getWorldPosition(world: World, entityId: EntityId): Vec3 | undefined {
  const ltw = world.getComponent<LocalToWorldComponent>(entityId, LOCAL_TO_WORLD);
  if (ltw !== undefined) return ltw.position;
  const transform = world.getComponent<TransformComponent>(entityId, TRANSFORM);
  return transform?.position;
}

export function createFollowCameraSystem(options: { name?: string } = {}): System {
  const name = options.name ?? "render.follow-camera";
  let cachedWorld: World | undefined;
  let query: QueryHandle | undefined;
  // Cached previous camera position per entity so smoothing has a
  // continuous reference frame even when the scene swaps a target.
  const lastPosition = new Map<EntityId, [number, number, number]>();

  const frameUpdate = (context: SystemContext): void => {
    const world = context.world;
    if (world !== cachedWorld) {
      query = world.createQuery([FOLLOW_CAMERA, TRANSFORM]);
      cachedWorld = world;
      lastPosition.clear();
    }
    const dt = context.time.dt;
    for (const entityId of query!.run()) {
      const follow = world.getComponent<FollowCameraComponent>(entityId, FOLLOW_CAMERA);
      if (follow === undefined) continue;
      const targetPos = getWorldPosition(world, follow.target);
      if (targetPos === undefined) continue;
      const transform = world.getComponent<TransformComponent>(entityId, TRANSFORM);

      const desiredX = (targetPos[0] ?? 0) + (follow.offset[0] ?? 0);
      const desiredY = (targetPos[1] ?? 0) + (follow.offset[1] ?? 0);
      const desiredZ = (targetPos[2] ?? 0) + (follow.offset[2] ?? 0);

      // Frame-rate-aware lerp factor — smoothing = 1 ⇒ snap (alpha=1);
      // smoothing = 0 ⇒ alpha=0; smoothing in between rebases per 60 Hz frame.
      const smoothing = follow.smoothing ?? 1;
      const alpha = smoothing >= 1
        ? 1
        : smoothing <= 0
          ? 0
          : 1 - Math.pow(1 - smoothing, Math.max(0, dt) * 60);

      // Smoothing seed = system's last cached position, falling back to
      // the camera's pre-frame Transform.position. Falling back to
      // `desiredX` (the goal) would make `alpha < 1` invisibly snap to
      // the target on frame 1.
      const cached = lastPosition.get(entityId);
      const currentPos = transform?.position;
      const prevX = cached?.[0] ?? currentPos?.[0] ?? 0;
      const prevY = cached?.[1] ?? currentPos?.[1] ?? 0;
      const prevZ = cached?.[2] ?? currentPos?.[2] ?? 0;
      const px = prevX + (desiredX - prevX) * alpha;
      const py = prevY + (desiredY - prevY) * alpha;
      const pz = prevZ + (desiredZ - prevZ) * alpha;
      lastPosition.set(entityId, [px, py, pz]);

      const lookAtX = (targetPos[0] ?? 0) + (follow.lookAtOffset?.[0] ?? 0);
      const lookAtY = (targetPos[1] ?? 0) + (follow.lookAtOffset?.[1] ?? 0);
      const lookAtZ = (targetPos[2] ?? 0) + (follow.lookAtOffset?.[2] ?? 0);

      // Compute Euler look-at — Three's `Camera` looks down -Z at zero
      // rotation. To re-orient toward a world-space direction `d`:
      //   yaw   = atan2(-dx, -dz)  // -dx because positive yaw rotates +X→+Z
      //                            // -dz because we measure from local -Z
      //   pitch = atan2(dy, |dxz|) // dy negative → camera nods down (negative pitch)
      const dx = lookAtX - px;
      const dy = lookAtY - py;
      const dz = lookAtZ - pz;
      const planar = Math.hypot(dx, dz);
      const yaw = Math.atan2(-dx, -dz) * RAD2DEG;
      const pitch = Math.atan2(dy, planar) * RAD2DEG;

      world.setComponent(entityId, TRANSFORM, {
        ...transform,
        position: [px, py, pz],
        rotation: [pitch, yaw, 0]
      });
    }
  };

  return { name, frameUpdate };
}
