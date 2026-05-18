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
  /** S81 KABOOM-DAMPED-FOLLOW: target-velocity extrapolation, in milliseconds. 0 disables. */
  lookAheadMs?: number;
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
  // S81 KABOOM-DAMPED-FOLLOW. Per-target velocity estimate (one slot per
  // FollowCamera entity, keyed by camera id so two cameras following the
  // same target keep independent histories). Updated every frame the
  // target has moved measurably; reset when the target swaps.
  const lastTargetPosition = new Map<EntityId, [number, number, number]>();
  const targetVelocity = new Map<EntityId, [number, number, number]>();
  const lastTargetId = new Map<EntityId, EntityId>();

  const frameUpdate = (context: SystemContext): void => {
    const world = context.world;
    if (world !== cachedWorld) {
      query = world.createQuery([FOLLOW_CAMERA, TRANSFORM]);
      cachedWorld = world;
      lastPosition.clear();
      lastTargetPosition.clear();
      targetVelocity.clear();
      lastTargetId.clear();
    }
    const dt = context.time.dt;
    for (const entityId of query!.run()) {
      const follow = world.getComponent<FollowCameraComponent>(entityId, FOLLOW_CAMERA);
      if (follow === undefined) continue;
      const targetPos = getWorldPosition(world, follow.target);
      if (targetPos === undefined) continue;
      const transform = world.getComponent<TransformComponent>(entityId, TRANSFORM);

      // Velocity estimate: simple per-frame difference. Reset history
      // when the target entity changes so a discontinuity doesn't
      // produce a one-frame velocity spike.
      const previousTargetId = lastTargetId.get(entityId);
      if (previousTargetId !== follow.target) {
        lastTargetPosition.delete(entityId);
        targetVelocity.delete(entityId);
        lastTargetId.set(entityId, follow.target);
      }
      const tx = targetPos[0] ?? 0;
      const ty = targetPos[1] ?? 0;
      const tz = targetPos[2] ?? 0;
      const prevTarget = lastTargetPosition.get(entityId);
      let vx = 0, vy = 0, vz = 0;
      if (prevTarget !== undefined && dt > 0) {
        vx = (tx - prevTarget[0]) / dt;
        vy = (ty - prevTarget[1]) / dt;
        vz = (tz - prevTarget[2]) / dt;
        targetVelocity.set(entityId, [vx, vy, vz]);
      } else if (prevTarget === undefined) {
        targetVelocity.set(entityId, [0, 0, 0]);
      } else {
        const v = targetVelocity.get(entityId);
        if (v !== undefined) { vx = v[0]; vy = v[1]; vz = v[2]; }
      }
      lastTargetPosition.set(entityId, [tx, ty, tz]);

      // S81 KABOOM-DAMPED-FOLLOW. lookAhead = velocity × seconds.
      // Applied to both the camera position goal AND the look-at point
      // so the camera leans into the motion direction without staring
      // off-axis. The S46 unit tests covered zero look-ahead; the new
      // test exercises non-zero look-ahead at constant velocity.
      const lookAheadSeconds = Math.max(0, follow.lookAheadMs ?? 0) / 1000;
      const aheadX = vx * lookAheadSeconds;
      const aheadY = vy * lookAheadSeconds;
      const aheadZ = vz * lookAheadSeconds;

      const desiredX = tx + (follow.offset[0] ?? 0) + aheadX;
      const desiredY = ty + (follow.offset[1] ?? 0) + aheadY;
      const desiredZ = tz + (follow.offset[2] ?? 0) + aheadZ;

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

      const lookAtX = tx + (follow.lookAtOffset?.[0] ?? 0) + aheadX;
      const lookAtY = ty + (follow.lookAtOffset?.[1] ?? 0) + aheadY;
      const lookAtZ = tz + (follow.lookAtOffset?.[2] ?? 0) + aheadZ;

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
