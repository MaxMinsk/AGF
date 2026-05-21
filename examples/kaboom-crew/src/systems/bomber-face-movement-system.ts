// S108 KABOOM-BOMBER-FACE-MOVEMENT.
//
// Per-bomber yaw driver. Reads GridMover state each fixedUpdate; when
// the bomber is moving, sets Transform.rotation.Y on the root so the
// body faces the motion direction.
//
// Priority (highest first):
//   1. Mid-lerp + targetGx/Gz defined → face (targetGx - gx, targetGz - gz).
//   2. queuedDirection non-zero → face that.
//   3. Otherwise → keep last yaw.
//
// Dead bombers (alive=false) are skipped so the ragdoll arc owns the
// rotation. yaw formula: atan2(dx, -dz). Three.js default forward is
// -Z, so a direction of (-Z) maps to yaw 0°; +X maps to +90°.

import type { World } from "../../../../engine/core/ecs/world";
import type { System, SystemContext } from "../../../../engine/core/systems/types";

const GRID_MOVER = "GridMover";
const GRID_POSITION = "GridPosition";
const TRANSFORM = "Transform";
const BOMBER_STATS = "BomberStats";
const PLAYER_CONTROLLED = "PlayerControlled";
const BOT_BRAIN = "BotBrain";

type GridMoverLike = {
  queuedDirection?: { dx: number; dz: number };
  currentLerp?: number;
  targetGx?: number;
  targetGz?: number;
};
type GridPositionLike = { gx: number; gz: number };
type TransformLike = {
  position?: ReadonlyArray<number>;
  rotation?: ReadonlyArray<number>;
  scale?: ReadonlyArray<number>;
  parent?: string;
};
type BomberStatsLike = { alive?: boolean };

/** Pure helper — direction → yaw in degrees. */
export function directionToYawDeg(dx: number, dz: number): number {
  if (Math.abs(dx) < 1e-6 && Math.abs(dz) < 1e-6) return 0;
  return Math.atan2(dx, -dz) * (180 / Math.PI);
}

export function createKaboomBomberFaceMovementSystem(options: { name?: string } = {}): System {
  const name = options.name ?? "kaboom.bomber-face-movement";
  let cachedWorld: World | undefined;
  let playerQuery: ReturnType<World["createQuery"]> | undefined;
  let botQuery: ReturnType<World["createQuery"]> | undefined;

  return {
    name,
    fixedUpdate(context: SystemContext): void {
      const world = context.world;
      if (world !== cachedWorld) {
        playerQuery = world.createQuery([PLAYER_CONTROLLED, GRID_MOVER, TRANSFORM]);
        botQuery = world.createQuery([BOT_BRAIN, GRID_MOVER, TRANSFORM]);
        cachedWorld = world;
      }
      const apply = (entityId: string): void => {
        const stats = world.getComponent<BomberStatsLike>(entityId, BOMBER_STATS);
        if (stats?.alive === false) return;
        const mover = world.getComponent<GridMoverLike>(entityId, GRID_MOVER);
        const transform = world.getComponent<TransformLike>(entityId, TRANSFORM);
        if (mover === undefined || transform === undefined) return;
        let dx = 0;
        let dz = 0;
        // Mid-lerp wins — use the active step's target.
        if ((mover.currentLerp ?? 0) > 0 && mover.targetGx !== undefined && mover.targetGz !== undefined) {
          const pos = world.getComponent<GridPositionLike>(entityId, GRID_POSITION);
          if (pos !== undefined) {
            dx = mover.targetGx - pos.gx;
            dz = mover.targetGz - pos.gz;
          }
        }
        if (dx === 0 && dz === 0) {
          const queued = mover.queuedDirection;
          if (queued !== undefined) {
            dx = queued.dx;
            dz = queued.dz;
          }
        }
        if (dx === 0 && dz === 0) return; // not moving + no queued — preserve yaw
        const yawDeg = directionToYawDeg(dx, dz);
        const rotation = transform.rotation ?? [0, 0, 0];
        const currentYaw = rotation[1] ?? 0;
        if (Math.abs(currentYaw - yawDeg) < 0.5) return; // no-op when already facing
        world.setComponent(entityId, TRANSFORM, {
          ...transform,
          rotation: [rotation[0] ?? 0, yawDeg, rotation[2] ?? 0]
        });
      };
      for (const id of playerQuery!.run()) apply(id);
      for (const id of botQuery!.run()) apply(id);
    }
  };
}
