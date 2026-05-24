// S118+ KABOOM-MP-SPRINT-B — client-side decoder for inbound server
// events when running on the `connected` profile.
//
// Responsibilities:
//   1. blockDestroyed → remove the local soft.* entity whose
//      GridPosition matches (gx, gz). Soft blocks are CLIENT-only
//      entities (spawned from the scene JSON), so the snapshot diff
//      doesn't know to delete them — this decoder closes the loop.
//   2. S119 roundResolved → write phase/tally/winnerId to the local
//      kaboom.round-state entity so the HUD scoreboard updates from
//      the authoritative server source.
//   3. S121 blastEvent → spawn local BlastTile entities at each cell
//      (visual fire + spark emitter) AND write a transient BlastEvent
//      component on a fresh event entity so audio-binding-system +
//      camera-shake-system fire their existing SFX/shake paths.
//   4. bomberDied + pickupCollected are drained but otherwise pass
//      through — the snapshot diff drives the existing alive→dead
//      ragdoll trigger + pickup-removed audio.

import type { ComponentName, EntityId } from "../../../../engine/core/ecs/types";
import type { QueryHandle, World } from "../../../../engine/core/ecs/world";
import type { System, SystemContext } from "../../../../engine/core/systems/types";
import type { WsNetworkAdapterHandle } from "../../../../engine/runtime/network/ws-network-adapter";

const GRID_POSITION: ComponentName = "GridPosition";
const GRID_OCCUPANT: ComponentName = "GridOccupant";
const ROUND_STATE: ComponentName = "RoundState";
const ROUND_STATE_ENTITY: EntityId = "kaboom.round-state";
// S122 — server-namespaced id the server ships RoundState under. We
// mirror it into the local kaboom.round-state so the HUD reads from
// one source, and clients joining mid-session catch up to the live
// tally instead of starting at {0,0,0}.
const MP_ROUND_STATE_ENTITY: EntityId = "mp.round-state";
// S125 — server-namespaced MatchState id. Mirrors into the local
// kaboom.game-state singleton's MatchState component so the HUD's
// existing match-resolved banner fires on connected too.
const MP_MATCH_STATE_ENTITY: EntityId = "mp.match-state";
const MATCH_STATE: ComponentName = "MatchState";
const GAME_STATE_ENTITY: EntityId = "kaboom.game-state";
const TRANSFORM: ComponentName = "Transform";
const MESH_RENDERER: ComponentName = "MeshRenderer";
const BLAST_TILE: ComponentName = "BlastTile";
const BLAST_EVENT: ComponentName = "BlastEvent";
const PARTICLE_EMITTER: ComponentName = "ParticleEmitter";

/** Matches static blast-propagation-system spawn shape. */
const BLAST_TILE_LIFETIME_S = 0.35;
const BLAST_FX_RATE = 30;
const BLAST_FX_MAX_PARTICLES = 12;

type GridPos = { gx: number; gz: number };
type Occupant = { layer?: string };
type LocalRoundState = {
  phase?: string;
  tally?: { player: number; bot: number; draws: number };
  roundNumber?: number;
  winnerId?: string;
};

/** S125 — local MatchState shape (matches the static-profile schema). */
type LocalMatchState = {
  phase?: string;
  target?: number;
  matchNumber?: number;
  lastMatchWinner?: string;
  resolvedAt?: number;
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
  // S121 — monotonic counter so each cell × event gets a fresh
  // entity id even when multiple bombs land in the same tick.
  let blastTileCounter = 0;
  let blastEventCounter = 0;
  // S121 — transient BlastEvent entities live for exactly one tick.
  // We delete them at the TOP of the next frameUpdate.
  const pendingEventCleanup: EntityId[] = [];

  const frameUpdate = (context: SystemContext): void => {
    const world = context.world;
    if (world !== cachedWorld) {
      blocksQuery = world.createQuery([GRID_POSITION, GRID_OCCUPANT]);
      cachedWorld = world;
    }
    // S121 — purge last frame's transient BlastEvent entities so the
    // audio + camera-shake systems observe each one exactly once.
    for (const id of pendingEventCleanup) {
      if (world.hasEntity(id)) world.removeEntity(id);
    }
    pendingEventCleanup.length = 0;
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

    // S122 KABOOM-MP-MID-JOIN-CATCHUP — every frame, mirror the
    // server's mp.round-state snapshot into the local kaboom.round-state
    // singleton so newly-joined clients catch up to the live tally
    // instead of waiting for the next roundResolved event. We don't
    // touch fields the LOCAL HUD owns (timeLimit, matchPhase, etc.) —
    // only the server-authoritative phase/tally/roundNumber/winnerId.
    const mpRound = world.getComponent<LocalRoundState>(MP_ROUND_STATE_ENTITY, ROUND_STATE);
    if (mpRound !== undefined && world.hasEntity(ROUND_STATE_ENTITY)) {
      const local = world.getComponent<LocalRoundState>(ROUND_STATE_ENTITY, ROUND_STATE);
      const merged: LocalRoundState = { ...(local ?? {}) };
      if (mpRound.phase !== undefined) merged.phase = mpRound.phase;
      if (mpRound.tally !== undefined) merged.tally = { ...mpRound.tally };
      if (mpRound.roundNumber !== undefined) merged.roundNumber = mpRound.roundNumber;
      if (mpRound.winnerId !== undefined) merged.winnerId = mpRound.winnerId;
      world.setComponent(ROUND_STATE_ENTITY, ROUND_STATE, merged);
    }

    // S125 KABOOM-MP-MATCH-STATE — mirror server-authoritative MatchState
    // into the local kaboom.game-state singleton. Preserves the local-
    // owned GamePaused field (title-screen / pause overlay).
    const mpMatch = world.getComponent<LocalMatchState>(MP_MATCH_STATE_ENTITY, MATCH_STATE);
    if (mpMatch !== undefined && world.hasEntity(GAME_STATE_ENTITY)) {
      const local = world.getComponent<LocalMatchState>(GAME_STATE_ENTITY, MATCH_STATE);
      const merged: LocalMatchState = { ...(local ?? {}) };
      if (mpMatch.phase !== undefined) merged.phase = mpMatch.phase;
      if (mpMatch.target !== undefined) merged.target = mpMatch.target;
      if (mpMatch.matchNumber !== undefined) merged.matchNumber = mpMatch.matchNumber;
      if (mpMatch.lastMatchWinner !== undefined) merged.lastMatchWinner = mpMatch.lastMatchWinner;
      world.setComponent(GAME_STATE_ENTITY, MATCH_STATE, merged);
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

    // S121 — drain inbound blastEvents and spawn local BlastTile
    // entities + a transient BlastEvent component per event. This is
    // what re-creates the visual flash + audio sting + camera shake
    // on the connected profile (the static-only pipeline that used
    // to do this off a local BlastEvent transient was dropped in
    // S117 + S120).
    const blastEvents = network.drainBlastEvents();
    for (const ev of blastEvents) {
      // 1. Transient BlastEvent entity — audio-binding-system +
      //    camera-shake-system query for [BlastEvent].
      blastEventCounter += 1;
      const eventEntity: EntityId = `connected-blast-event.${blastEventCounter}`;
      world.addEntity(eventEntity);
      world.setComponent(eventEntity, BLAST_EVENT, {
        originGx: ev.originGx,
        originGz: ev.originGz,
        range: ev.range,
        ownerId: ev.ownerId
      });
      // The transient lives one tick. blast-tile-lifetime-system + the
      // existing static cleanup don't touch it — purge inline next
      // frame by tracking; simplest: schedule a removal via Transform
      // expiry. We use a co-spawned ParticleEmitter as the lifetime
      // tracker, but the cleanest path is to delete the entity at the
      // top of the NEXT frameUpdate.
      pendingEventCleanup.push(eventEntity);

      // 2. BlastTile entities for the visual flash + spark emitter.
      //    Matches static blast-propagation-system spawn shape.
      for (const cell of ev.cells) {
        blastTileCounter += 1;
        const tileId: EntityId = `connected-blast-tile.${blastTileCounter}.${cell.gx}.${cell.gz}`;
        if (world.hasEntity(tileId)) continue;
        world.addEntity(tileId);
        world.setComponent(tileId, TRANSFORM, {
          position: [cell.gx, 0.1, cell.gz],
          rotation: [0, 0, 0],
          scale: [0.9, 0.05, 0.9]
        });
        world.setComponent(tileId, MESH_RENDERER, { mesh: "box", color: "#ff9c42" });
        world.setComponent(tileId, GRID_POSITION, { gx: cell.gx, gz: cell.gz });
        world.setComponent(tileId, GRID_OCCUPANT, { layer: "blast", blocksMovement: false, blocksBlast: false });
        world.setComponent(tileId, BLAST_TILE, {
          lifetimeRemaining: BLAST_TILE_LIFETIME_S,
          ownerId: ev.ownerId
        });
        // Co-spawned spark emitter.
        const emitterId: EntityId = `${tileId}.spark`;
        if (!world.hasEntity(emitterId)) {
          world.addEntity(emitterId);
          world.setComponent(emitterId, TRANSFORM, {
            position: [cell.gx, 0.4, cell.gz],
            rotation: [0, 0, 0],
            scale: [1, 1, 1]
          });
          world.setComponent(emitterId, PARTICLE_EMITTER, {
            preset: "spark",
            lifetime: 0.4,
            elapsed: 0,
            rate: BLAST_FX_RATE,
            maxParticles: BLAST_FX_MAX_PARTICLES
          });
        }
      }
    }

    // Drain the remaining queues so they don't grow unbounded —
    // later sprints add real decoders (ragdoll, audio sting, …).
    network.drainBomberDied();
    network.drainPickupCollected();
  };

  return { name, frameUpdate };
}
