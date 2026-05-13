import type { System, SystemContext } from "../../../../engine/core/systems/types";
import type { QueryHandle, World } from "../../../../engine/core/ecs/world";

type Vec3 = ReadonlyArray<number>;

type TransformComponent = {
  position?: Vec3;
  rotation?: Vec3;
  scale?: Vec3;
};

type PresenceComponent = { playerId: string };
type NetworkedComponent = { authority?: "server" | "client" };

const LOCAL_DRONE_ID = "player.drone";

const DEFAULT_SNAP_THRESHOLD = 1.5;
const DEFAULT_RECONCILE_RATE = 12;

export type NetworkDroneSyncOptions = {
  /** Player id whose server-owned entity should drive the local drone. */
  playerId: string;
  /**
   * If the local drone has drifted more than this many world units away from
   * the server position (XZ plane), snap to the server. Used to recover from
   * teleports and respawns. Defaults to 1.5.
   */
  snapThresholdUnits?: number;
  /**
   * Exponential lerp rate (per second) used when the drift is below
   * `snapThresholdUnits`. Higher = more aggressive correction. Defaults to 12,
   * which converges roughly halfway every ~60 ms.
   */
  reconcileRate?: number;
};

/**
 * Frame-phase system used by the `"connected"` Beacon profile. Reconciles the
 * local `player.drone` with the server-owned `player.<playerId>`:
 *
 *  * the PlayerInputSystem also predicts movement locally, so the drone feels
 *    instant on input;
 *  * when the server snapshot disagrees with the prediction by less than
 *    `snapThresholdUnits`, this system smoothly lerps the local drone toward
 *    the server position at `reconcileRate` per second;
 *  * when the drift is larger (server-side teleport, respawn, dropped frames),
 *    it snaps the drone to the server position immediately so the player does
 *    not phase through walls / cores on big corrections.
 *
 * Local rotation and scale are preserved.
 */
export function createNetworkDroneSyncSystem(options: NetworkDroneSyncOptions): System {
  const expectedId = `player.${options.playerId}`;
  const snapThreshold = options.snapThresholdUnits ?? DEFAULT_SNAP_THRESHOLD;
  const reconcileRate = options.reconcileRate ?? DEFAULT_RECONCILE_RATE;
  let cachedWorld: World | undefined;
  let networkedQuery: QueryHandle | undefined;
  return {
    name: "network-drone-sync",
    frameUpdate({ time, world }: SystemContext): void {
      if (world !== cachedWorld) {
        networkedQuery = world.createQuery(["Presence", "Networked", "Transform"]);
        cachedWorld = world;
      }
      if (!world.hasEntity(LOCAL_DRONE_ID)) {
        return;
      }
      for (const candidateId of networkedQuery!.run()) {
        if (candidateId !== expectedId) {
          continue;
        }
        const networked = world.getComponent<NetworkedComponent>(candidateId, "Networked");
        if (networked?.authority !== "server") {
          continue;
        }
        const presence = world.getComponent<PresenceComponent>(candidateId, "Presence");
        if (presence?.playerId !== options.playerId) {
          continue;
        }
        const serverTransform = world.getComponent<TransformComponent>(candidateId, "Transform");
        if (serverTransform === undefined || serverTransform.position === undefined) {
          continue;
        }
        const localTransform = world.getComponent<TransformComponent>(LOCAL_DRONE_ID, "Transform");
        if (localTransform === undefined) {
          continue;
        }

        const sx = serverTransform.position[0] ?? 0;
        const sy = serverTransform.position[1] ?? 0;
        const sz = serverTransform.position[2] ?? 0;
        const lx = localTransform.position?.[0] ?? 0;
        const ly = localTransform.position?.[1] ?? 0;
        const lz = localTransform.position?.[2] ?? 0;

        const driftXZ = Math.hypot(sx - lx, sz - lz);

        let nx: number;
        let ny: number;
        let nz: number;
        if (driftXZ >= snapThreshold) {
          nx = sx;
          ny = sy;
          nz = sz;
        } else {
          const dt = Math.max(time.dt, 0);
          const blend = 1 - Math.exp(-reconcileRate * dt);
          nx = lx + (sx - lx) * blend;
          ny = ly + (sy - ly) * blend;
          nz = lz + (sz - lz) * blend;
        }

        world.setComponent(LOCAL_DRONE_ID, "Transform", {
          ...localTransform,
          position: [nx, ny, nz]
        });
        return;
      }
    }
  };
}
