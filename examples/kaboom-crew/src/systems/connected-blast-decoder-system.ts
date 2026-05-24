// S118 KABOOM-MP-SPRINT-B chunk 2 — client-side decoder for inbound
// server events when running on the `connected` profile.
//
// Two responsibilities for S118:
//   1. blockDestroyed → remove the local soft.* entity whose
//      GridPosition matches (gx, gz). Soft blocks are CLIENT-only
//      entities (spawned from the scene JSON), so the snapshot diff
//      doesn't know to delete them — this decoder closes the loop.
//   2. bomberDied → leave it for the snapshot-driven BomberStats.alive
//      flip to drive the local death-animation-system in a later
//      sprint. For S118 we log the event but don't decode the ragdoll
//      since the visual ragdoll lives in the local death pipeline that
//      reads DeathAnim transients (S120 will move that to server).
//
// blastEvent visuals (the cells from S118.3) are also out of scope
// for this minimum decoder; the soft-block deletion is what S118's
// acceptance test actually verifies. A later story can spawn
// BlastTile entities from the inbox so the visual flash + audio fire.

import type { ComponentName, EntityId } from "../../../../engine/core/ecs/types";
import type { QueryHandle, World } from "../../../../engine/core/ecs/world";
import type { System, SystemContext } from "../../../../engine/core/systems/types";
import type { WsNetworkAdapterHandle } from "../../../../engine/runtime/network/ws-network-adapter";

const GRID_POSITION: ComponentName = "GridPosition";
const GRID_OCCUPANT: ComponentName = "GridOccupant";

type GridPos = { gx: number; gz: number };
type Occupant = { layer?: string };

export type ConnectedBlastDecoderOptions = {
  /** Late-bound network handle — undefined before the adapter is ready. */
  getNetwork: () => WsNetworkAdapterHandle | undefined;
  name?: string;
};

export function createKaboomConnectedBlastDecoderSystem(
  options: ConnectedBlastDecoderOptions
): System {
  const name = options.name ?? "kaboom.connected-blast-decoder";
  let cachedWorld: World | undefined;
  let blocksQuery: QueryHandle | undefined;

  const frameUpdate = (context: SystemContext): void => {
    const world = context.world;
    if (world !== cachedWorld) {
      blocksQuery = world.createQuery([GRID_POSITION, GRID_OCCUPANT]);
      cachedWorld = world;
    }
    const network = options.getNetwork();
    if (network === undefined) return;

    const blockEvents = network.drainBlockDestroyed();
    if (blockEvents.length === 0) {
      network.drainBomberDied(); // discard; not consumed today
      network.drainBlastEvents(); // discard; not consumed today
      return;
    }
    // Build a lookup keyed by cell so multi-block detonations are O(N+K).
    const targets = new Set<string>();
    for (const ev of blockEvents) targets.add(`${ev.gx},${ev.gz}`);
    const toDelete: EntityId[] = [];
    for (const entityId of blocksQuery!.run()) {
      const gp = world.getComponent<GridPos>(entityId, GRID_POSITION);
      const occ = world.getComponent<Occupant>(entityId, GRID_OCCUPANT);
      if (gp === undefined || occ?.layer !== "block") continue;
      if (!targets.has(`${gp.gx},${gp.gz}`)) continue;
      toDelete.push(entityId);
    }
    for (const id of toDelete) world.removeEntity(id);
    // Drain the other queues so they don't grow unbounded — S119+ will
    // hook real decoders here.
    network.drainBomberDied();
    network.drainBlastEvents();
  };

  return { name, frameUpdate };
}
