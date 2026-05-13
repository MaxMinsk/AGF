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

export type NetworkDroneSyncOptions = {
  /** Player id whose server-owned entity should drive the local drone. */
  playerId: string;
};

/**
 * Frame-phase system used by the `"connected"` Beacon profile. Finds the
 * server-owned `player.<playerId>` entity and mirrors its `Transform.position`
 * onto the local `player.drone`. Local rotation / scale on the drone are
 * preserved. Pickup / Hazard / Health systems keep operating on the local
 * drone unchanged, so the server is authoritative for position while the
 * client owns the rest of the gameplay surface.
 */
export function createNetworkDroneSyncSystem(options: NetworkDroneSyncOptions): System {
  const expectedId = `player.${options.playerId}`;
  let cachedWorld: World | undefined;
  let networkedQuery: QueryHandle | undefined;
  return {
    name: "network-drone-sync",
    frameUpdate({ world }: SystemContext): void {
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
        const [px, py, pz] = serverTransform.position;
        world.setComponent(LOCAL_DRONE_ID, "Transform", {
          ...localTransform,
          position: [px ?? 0, py ?? 0, pz ?? 0]
        });
        return;
      }
    }
  };
}
