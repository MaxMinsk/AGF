// S118 KABOOM-MP-SPRINT-B chunk 2 — client-side decoder for inbound
// server events when running on the `connected` profile.
//
// Responsibilities:
//   1. blockDestroyed → remove the local soft.* entity whose
//      GridPosition matches (gx, gz). Soft blocks are CLIENT-only
//      entities (spawned from the scene JSON), so the snapshot diff
//      doesn't know to delete them — this decoder closes the loop.
//   2. S119 roundResolved → write phase/tally/winnerId to the local
//      kaboom.round-state entity so the HUD scoreboard updates from
//      the authoritative server source.
//   3. bomberDied + blastEvent + pickupCollected are drained so the
//      ws-adapter inboxes don't grow unbounded; they'll grow real
//      consumers in later sprints (ragdoll/audio decoders).

import type { ComponentName, EntityId } from "../../../../engine/core/ecs/types";
import type { QueryHandle, World } from "../../../../engine/core/ecs/world";
import type { System, SystemContext } from "../../../../engine/core/systems/types";
import type { WsNetworkAdapterHandle } from "../../../../engine/runtime/network/ws-network-adapter";

const GRID_POSITION: ComponentName = "GridPosition";
const GRID_OCCUPANT: ComponentName = "GridOccupant";
const ROUND_STATE: ComponentName = "RoundState";
const ROUND_STATE_ENTITY: EntityId = "kaboom.round-state";

type GridPos = { gx: number; gz: number };
type Occupant = { layer?: string };
type LocalRoundState = {
  phase?: string;
  tally?: { player: number; bot: number; draws: number };
  roundNumber?: number;
  winnerId?: string;
};

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

    // S119 — apply server roundResolved into local kaboom.round-state.
    const roundEvents = network.drainRoundResolved();
    for (const ev of roundEvents) {
      const current = world.getComponent<LocalRoundState>(ROUND_STATE_ENTITY, ROUND_STATE);
      world.setComponent(ROUND_STATE_ENTITY, ROUND_STATE, {
        ...(current ?? {}),
        phase: ev.phase,
        tally: { ...ev.tally },
        ...(ev.winnerId !== undefined ? { winnerId: ev.winnerId } : {})
      });
    }

    // S118 — apply server blockDestroyed to delete local soft.* entities.
    const blockEvents = network.drainBlockDestroyed();
    if (blockEvents.length > 0) {
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
    }

    // Drain the remaining queues so they don't grow unbounded —
    // later sprints add real decoders (ragdoll, audio sting, …).
    network.drainBomberDied();
    network.drainBlastEvents();
    network.drainPickupCollected();
  };

  return { name, frameUpdate };
}
