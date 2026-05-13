import type { System, SystemContext } from "../../../../engine/core/systems/types";
import type { QueryHandle, World } from "../../../../engine/core/ecs/world";
import { DRONE_MATERIAL_PALETTE, pickDroneMaterialFor } from "../drone-palette";

type PresenceComponent = { playerId: string };
type NetworkedComponent = { authority?: "server" | "client" };
type MeshRendererComponent = { mesh: string; material?: string; color?: string };
type TransformComponent = {
  position?: ReadonlyArray<number>;
  rotation?: ReadonlyArray<number>;
  scale?: ReadonlyArray<number>;
};

const REMOTE_SCALE: [number, number, number] = [0.7, 0.7, 0.7];

export type RemotePresenceDecoratorOptions = {
  /**
   * Local player's id. Entities whose Presence.playerId matches this are
   * skipped — their visual is the local `player.drone` (driven by the
   * network-drone-sync mirror).
   */
  localPlayerId: string;
  /** Mesh ref for remote players. */
  mesh: string;
  /**
   * Fallback material when no palette entry resolves. Kept for parity with the
   * local drone's material so a missing palette does not break rendering.
   */
  material: string;
  /**
   * Material refs to cycle through, indexed by a stable hash of the remote
   * player's id. Defaults to the four-colour palette under
   * `runtime/materials/drone-*.material.json`.
   */
  materialPalette?: ReadonlyArray<string>;
};

/**
 * Frame-phase system that attaches a `MeshRenderer` and a default
 * `Transform.scale` to every server-authority Presence entity that is NOT the
 * local player. This is what lets two browser tabs see each other when the
 * `"connected"` profile is active.
 *
 * The component is only written when it is missing, so re-runs are idempotent
 * and the renderer's GLB caches don't get invalidated on every frame.
 */
export function createRemotePresenceDecoratorSystem(
  options: RemotePresenceDecoratorOptions
): System {
  const palette = options.materialPalette ?? DRONE_MATERIAL_PALETTE;
  let cachedWorld: World | undefined;
  let networkedQuery: QueryHandle | undefined;
  return {
    name: "remote-presence-decorator",
    frameUpdate({ world }: SystemContext): void {
      if (world !== cachedWorld) {
        networkedQuery = world.createQuery(["Presence", "Networked"]);
        cachedWorld = world;
      }
      for (const id of networkedQuery!.run()) {
        const networked = world.getComponent<NetworkedComponent>(id, "Networked");
        if (networked?.authority !== "server") {
          continue;
        }
        const presence = world.getComponent<PresenceComponent>(id, "Presence");
        if (presence === undefined || presence.playerId === options.localPlayerId) {
          continue;
        }

        const renderer = world.getComponent<MeshRendererComponent>(id, "MeshRenderer");
        if (renderer === undefined) {
          const paletteMaterial = pickDroneMaterialFor(presence.playerId, palette) ?? options.material;
          world.setComponent(id, "MeshRenderer", {
            mesh: options.mesh,
            material: paletteMaterial
          });
        }

        const transform = world.getComponent<TransformComponent>(id, "Transform") ?? {};
        if (transform.scale === undefined) {
          world.setComponent(id, "Transform", {
            ...transform,
            scale: [REMOTE_SCALE[0], REMOTE_SCALE[1], REMOTE_SCALE[2]]
          });
        }
      }
    }
  };
}
