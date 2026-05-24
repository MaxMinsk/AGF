// S117 KABOOM-MP-SPRINT-B chunk 3 — connected-profile bomb relay.
//
// On the `connected` profile the server is authoritative on bomb
// spawning. This system intercepts the local player's PlaceBombRequest
// transients BEFORE bomb-placement-system processes them, dispatches a
// placeBombRequest frame over the wire, and removes the transient so
// the local placement does not spawn a duplicate bomb. The server
// snapshot will deliver the spawned Bomb entity to every client.
//
// Bots + remote players keep using the local placement path inside
// this client — bot-AI on connected stays local (per S109) and remote
// players' PlaceBombRequests never reach this client's world.

import type { ComponentName, EntityId } from "../../../../engine/core/ecs/types";
import type { QueryHandle, World } from "../../../../engine/core/ecs/world";
import type { System, SystemContext } from "../../../../engine/core/systems/types";
import type { WsNetworkAdapterHandle } from "../../../../engine/runtime/network/ws-network-adapter";

const PLACE_BOMB_REQUEST: ComponentName = "PlaceBombRequest";
const GRID_POSITION: ComponentName = "GridPosition";

type GridPos = { gx: number; gz: number };

export type PlaceBombNetworkRelayOptions = {
  /** Local player id — the entity id this client owns is `player.<localPlayerId>`. */
  localPlayerId: string;
  /** Late-bound network handle — undefined before the adapter is ready. */
  getNetwork: () => WsNetworkAdapterHandle | undefined;
  name?: string;
};

export function createKaboomPlaceBombNetworkRelaySystem(
  options: PlaceBombNetworkRelayOptions
): System {
  const name = options.name ?? "kaboom.place-bomb-network-relay";
  const localEntityId: EntityId = `player.${options.localPlayerId}`;
  let cachedWorld: World | undefined;
  let requests: QueryHandle | undefined;

  const frameUpdate = (context: SystemContext): void => {
    const world = context.world;
    if (world !== cachedWorld) {
      requests = world.createQuery([PLACE_BOMB_REQUEST, GRID_POSITION]);
      cachedWorld = world;
    }
    const network = options.getNetwork();
    for (const entityId of requests!.run()) {
      if (entityId !== localEntityId) continue;
      const pos = world.getComponent<GridPos>(entityId, GRID_POSITION);
      if (pos === undefined) {
        world.removeComponent(entityId, PLACE_BOMB_REQUEST);
        continue;
      }
      if (network !== undefined) {
        network.sendPlaceBomb(pos.gx, pos.gz);
      }
      // Always strip the request — even if the network handle isn't
      // ready yet — so the local placement system never spawns a
      // ghost duplicate after the server picks up the connection.
      world.removeComponent(entityId, PLACE_BOMB_REQUEST);
    }
  };

  return { name, frameUpdate };
}
