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

export type UnackedIntentForReplay = {
  sequence: number;
  direction: readonly [number, number];
  sentAtSeconds: number;
};

export type NetworkDroneSyncOptions = {
  /** Player id whose server-owned entity should drive the local drone. */
  playerId: string;
  /**
   * If the local drone has drifted more than this many world units away from
   * the predicted position (XZ plane), snap to the prediction. Used to
   * recover from teleports and respawns. Defaults to 1.5.
   */
  snapThresholdUnits?: number;
  /**
   * Exponential lerp rate (per second) used when the drift is below
   * `snapThresholdUnits`. Higher = more aggressive correction. Defaults to 12,
   * which converges roughly halfway every ~60 ms.
   */
  reconcileRate?: number;
  /**
   * Returns the number of `intent.move` messages the client has sent that the
   * server has not yet acknowledged. While this is > 0, the reconciliation
   * stays in lerp-only mode and never snaps, so the local prediction is not
   * yanked back by a stale snapshot. Optional — without it the system falls
   * back to plain threshold + lerp.
   */
  getUnackedInputCount?: () => number;
  /**
   * Returns the list of un-acked `intent.move` records (sorted by sequence),
   * each with the wall-clock time it was sent. When provided alongside
   * `nowSeconds` and `playerSpeed`, the system runs rollback-replay: the
   * server's authoritative position is advanced by each un-acked intent over
   * its actual duration, then the local drone is reconciled toward that
   * predicted position. Without this hook the system falls back to plain
   * server-position reconciliation.
   */
  getUnackedIntents?: () => ReadonlyArray<UnackedIntentForReplay>;
  /** Monotonic clock used as the upper bound for the latest replay segment. */
  nowSeconds?: () => number;
  /** Movement speed used during replay. Must match the server's player speed. */
  playerSpeed?: number;
};

/**
 * Frame-phase system used by the `"connected"` Beacon profile. Reconciles the
 * local `player.drone` with the server-owned `player.<playerId>`:
 *
 *  * `PlayerInputSystem` predicts movement locally so the drone feels instant
 *    on input;
 *  * when `getUnackedIntents` + `nowSeconds` + `playerSpeed` are provided,
 *    each un-acked intent is replayed over its real duration on top of the
 *    authoritative server position — the reconciliation target then matches
 *    where prediction would put the drone given the server's truth;
 *  * when drift to the target is below `snapThresholdUnits`, the local drone
 *    smoothly lerps at `reconcileRate` per second; above the threshold (and
 *    only when no inputs are un-acked) it snaps, so big corrections do not
 *    leave the player phasing through walls or cores.
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

        const sx0 = serverTransform.position[0] ?? 0;
        const sy = serverTransform.position[1] ?? 0;
        const sz0 = serverTransform.position[2] ?? 0;

        const target = replayUnackedIntents(sx0, sz0, options);
        const tx = target[0];
        const tz = target[1];

        const lx = localTransform.position?.[0] ?? 0;
        const ly = localTransform.position?.[1] ?? 0;
        const lz = localTransform.position?.[2] ?? 0;

        const driftXZ = Math.hypot(tx - lx, tz - lz);

        const unacked = options.getUnackedInputCount?.() ?? 0;
        let nx: number;
        let ny: number;
        let nz: number;
        if (driftXZ >= snapThreshold && unacked === 0) {
          nx = tx;
          ny = sy;
          nz = tz;
        } else {
          const dt = Math.max(time.dt, 0);
          const blend = 1 - Math.exp(-reconcileRate * dt);
          nx = lx + (tx - lx) * blend;
          ny = ly + (sy - ly) * blend;
          nz = lz + (tz - lz) * blend;
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

function replayUnackedIntents(
  sx: number,
  sz: number,
  options: NetworkDroneSyncOptions
): [number, number] {
  const getIntents = options.getUnackedIntents;
  const nowSeconds = options.nowSeconds;
  const speed = options.playerSpeed;
  if (getIntents === undefined || nowSeconds === undefined || speed === undefined || speed <= 0) {
    return [sx, sz];
  }
  const intents = getIntents();
  if (intents.length === 0) {
    return [sx, sz];
  }
  const now = nowSeconds();
  let x = sx;
  let z = sz;
  for (let i = 0; i < intents.length; i += 1) {
    const intent = intents[i]!;
    const next = intents[i + 1];
    const end = next !== undefined ? next.sentAtSeconds : now;
    const dt = Math.max(0, end - intent.sentAtSeconds);
    if (dt === 0) {
      continue;
    }
    x += intent.direction[0] * speed * dt;
    z += intent.direction[1] * speed * dt;
  }
  return [x, z];
}
