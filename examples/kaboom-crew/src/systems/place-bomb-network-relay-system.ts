// S117 KABOOM-MP-SPRINT-B chunk 3 — connected-profile bomb relay.
//
// On the `connected` profile the server is authoritative on bomb
// spawning. This system intercepts the local human player's
// PlaceBombRequest BEFORE bomb-placement-system processes it,
// dispatches a placeBombRequest frame over the wire, and removes the
// transient so the local placement does not spawn a duplicate bomb.
// The server snapshot will deliver the spawned Bomb entity to every
// client.
//
// We target entities carrying PlayerControlled (the locally-driven
// human bomber) — Kaboom Crew always spawns it as `player.1` regardless
// of the connection-level playerId, so checking against the local id
// would miss every press. Bots + remote players never carry
// PlayerControlled, so the relay leaves their transients alone and
// the local bomb-placement-system handles them.

import type { ComponentName } from "../../../../engine/core/ecs/types";
import type { QueryHandle, World } from "../../../../engine/core/ecs/world";
import type { System, SystemContext } from "../../../../engine/core/systems/types";
import type { WsNetworkAdapterHandle } from "../../../../engine/runtime/network/ws-network-adapter";

const PLACE_BOMB_REQUEST: ComponentName = "PlaceBombRequest";
const GRID_POSITION: ComponentName = "GridPosition";
const PLAYER_CONTROLLED: ComponentName = "PlayerControlled";

type GridPos = { gx: number; gz: number };

export type PlaceBombNetworkRelayOptions = {
  /** Late-bound network handle — undefined before the adapter is ready. */
  getNetwork: () => WsNetworkAdapterHandle | undefined;
  name?: string;
};

export function createKaboomPlaceBombNetworkRelaySystem(
  options: PlaceBombNetworkRelayOptions
): System {
  const name = options.name ?? "kaboom.place-bomb-network-relay";
  let cachedWorld: World | undefined;
  let requests: QueryHandle | undefined;

  const frameUpdate = (context: SystemContext): void => {
    const world = context.world;
    if (world !== cachedWorld) {
      requests = world.createQuery([PLACE_BOMB_REQUEST, PLAYER_CONTROLLED, GRID_POSITION]);
      cachedWorld = world;
    }
    const network = options.getNetwork();
    for (const entityId of requests!.run()) {
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
