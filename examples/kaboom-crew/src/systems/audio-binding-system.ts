// S84 KABOOM-AUDIO-WIRE.
//
// Watches the world for the four user-facing Kaboom Crew events and
// drives `runtime.audio.play(...)` for each:
//
//   bomb-place — new Bomb entity appears (BombPlacementSystem just
//                spawned it)
//   blast      — a BlastEvent transient is alive this frame (one play
//                regardless of how many cells the blast covers)
//   pickup     — a Pickup entity disappeared (PickupCollectSystem
//                consumed it)
//   death      — BomberStats.alive flipped from true to false on any
//                bomber entity
//
// Diff-based detection keeps the system stateless inside the world —
// we keep a small `prev` snapshot inside the closure and compare each
// frame. No new components; nothing in the ECS schema changes.
//
// The audio callback is injected (`onEvent`) so tests + an in-page
// probe (`window.__agf.kaboom.audioLog`) can verify the call sequence
// without depending on HTMLAudioElement state.

import type { ComponentName, EntityId } from "../../../../engine/core/ecs/types";
import type { QueryHandle, World } from "../../../../engine/core/ecs/world";
import type { System, SystemContext } from "../../../../engine/core/systems/types";

const BOMB: ComponentName = "Bomb";
const BLAST_EVENT: ComponentName = "BlastEvent";
const PICKUP: ComponentName = "Pickup";
const BOMBER_STATS: ComponentName = "BomberStats";
const GRID_POSITION: ComponentName = "GridPosition";
const TRANSFORM: ComponentName = "Transform";
const PARTICLE_EMITTER: ComponentName = "ParticleEmitter";

export type AudioEventKind =
  | "bomb-place"
  | "blast"
  | "pickup"
  | "death"
  | "shield-pop"
  | "match-won"
  | "match-lost"
  | "match-draw"
  | "footstep"
  // S109 KABOOM-PROCEDURAL-VOCAL-SYNTH — per-bomber voice slots.
  // entityId in the event context is the bomber id; the audio bus
  // derives the voice colour from voiceParamsFromSeed(entityId).
  | "voice-place-bomb"
  | "voice-hit"
  | "voice-pickup"
  | "voice-death"
  | "voice-victory";
/**
 * S91 KABOOM-AUDIO-POSITIONAL-ADOPT. `position` is the world-space
 * source of the SFX, [gx, 0, gz] in our grid space. Bomber-driven
 * events fill it from the entity's GridPosition; UI chimes leave
 * it undefined so audio-fx routes them straight to destination.
 */
export type AudioEventListener = (
  kind: AudioEventKind,
  context?: { entityId?: EntityId; position?: readonly [number, number, number] }
) => void;

export type KaboomAudioBindingOptions = {
  name?: string;
  /** Required — called once per detected event. */
  onEvent: AudioEventListener;
};

export function createKaboomAudioBindingSystem(options: KaboomAudioBindingOptions): System {
  const name = options.name ?? "kaboom.audio-binding";
  const onEvent = options.onEvent;

  let cachedWorld: World | undefined;
  let bombs: QueryHandle | undefined;
  let blastEvents: QueryHandle | undefined;
  let pickups: QueryHandle | undefined;
  let bombers: QueryHandle | undefined;

  let prevBombIds = new Set<EntityId>();
  let prevPickupIds = new Set<EntityId>();
  let prevAlive = new Map<EntityId, boolean>();
  // S109 KABOOM-SHIELD-POWER-UP — observe BomberStats.shield true → false
  // edges. The transition fires `shield-pop` exactly once per bomber per
  // edge; the consuming bus mixes it under the (optional) `death` event
  // when both fire on the same step.
  let prevShield = new Map<EntityId, boolean>();
  // S109 KABOOM-PROCEDURAL-VOCAL-SYNTH — sum of pickup-affected stats
  // per bomber. Goes up on the frame pickup-collect-system applies a
  // bonus; we fire voice-pickup on that edge.
  let prevStatsTotal = new Map<EntityId, number>();
  // S90 KABOOM-FOOTSTEP-TICK. Last observed GridPosition cell per
  // bomber. A cell change between ticks fires one 'footstep' event.
  // Map key = entity id; value = packed `gx,gz` string.
  let prevBomberCell = new Map<EntityId, string>();
  // S88 KABOOM-WIN-CHIME. Track previous matchPhase so we fire a
  // 'match-{won|lost|draw}' event exactly once per matchPhase
  // transition out of 'in-progress'. Defaults to 'in-progress' so
  // the very first frame after a world swap doesn't spuriously fire.
  let prevMatchPhase: string = "in-progress";

  // S85 KABOOM-AUDIO-PROCEDURAL-SFX fix — runs in fixedUpdate because
  // BlastEvent transients are emitted AND consumed inside the
  // fixedUpdate phase (bomb-fuse emits it, blast-propagation deletes
  // it). A frameUpdate observer never saw them. With this system
  // registered BEFORE blast-propagation in the bootstrap, we observe
  // the live transient and emit "blast" exactly once.
  const fixedUpdate = (context: SystemContext): void => {
    const world = context.world;
    if (world !== cachedWorld) {
      bombs = world.createQuery([BOMB]);
      blastEvents = world.createQuery([BLAST_EVENT]);
      pickups = world.createQuery([PICKUP]);
      bombers = world.createQuery([BOMBER_STATS]);
      cachedWorld = world;
      // World swap (scene.load) — drop history so we don't fire a wave
      // of "removed" events on every entity from the previous round.
      prevBombIds = new Set();
      prevPickupIds = new Set();
      prevAlive = new Map();
      prevShield = new Map();
      prevStatsTotal = new Map();
      prevBomberCell = new Map();
      prevMatchPhase = "in-progress";
    }

    // S91 KABOOM-AUDIO-POSITIONAL-ADOPT. Resolve [gx, 0, gz] from
    // GridPosition for any entity that still exists. Returns undefined
    // when the entity is already gone (e.g. pickup just removed) — the
    // public play() then routes through destination instead of a panner.
    function cellPos(id: EntityId): readonly [number, number, number] | undefined {
      const gp = world.getComponent<{ gx?: number; gz?: number }>(id, GRID_POSITION);
      if (gp === undefined || gp.gx === undefined || gp.gz === undefined) return undefined;
      return [gp.gx, 0, gp.gz] as const;
    }

    // Bomb births → bomb-place + voice-place-bomb (per-bomber voice).
    const currentBombIds = new Set<EntityId>(bombs!.run());
    for (const id of currentBombIds) {
      if (!prevBombIds.has(id)) {
        const pos = cellPos(id);
        onEvent("bomb-place", { entityId: id, ...(pos !== undefined ? { position: pos } : {}) });
        // S109 KABOOM-PROCEDURAL-VOCAL-SYNTH — the bomb carries its
        // owner. Fire a per-bomber voice event so the SOUND is tagged
        // with the placer's voice colour.
        const bomb = world.getComponent<{ ownerId?: string }>(id, BOMB);
        if (bomb?.ownerId !== undefined) {
          onEvent("voice-place-bomb", { entityId: bomb.ownerId, ...(pos !== undefined ? { position: pos } : {}) });
        }
      }
    }
    prevBombIds = currentBombIds;

    // Pickup deaths → pickup. The Pickup entity is gone by the time we
    // detect the disappearance, so position is undefined — the click
    // plays at destination (non-positional). Acceptable tradeoff.
    const currentPickupIds = new Set<EntityId>(pickups!.run());
    for (const id of prevPickupIds) {
      if (!currentPickupIds.has(id)) onEvent("pickup", { entityId: id });
    }
    prevPickupIds = currentPickupIds;

    // BomberStats.alive true → false → death.
    // BomberStats.shield true → false → shield-pop (S109).
    // S109 KABOOM-PROCEDURAL-VOCAL-SYNTH — also track a single
    // "pickup-affected stats total" per bomber. When the total goes
    // UP, a pickup was just collected → fire voice-pickup. The
    // pickup-collect-system is the only writer that increases any of
    // these fields, so this is a reliable trigger that doesn't need a
    // new transient component or a hook into collect-system itself.
    const currentAlive = new Map<EntityId, boolean>();
    const currentShield = new Map<EntityId, boolean>();
    const currentStatsTotal = new Map<EntityId, number>();
    for (const id of bombers!.run()) {
      const stats = world.getComponent<{
        alive?: boolean;
        shield?: boolean;
        maxBombs?: number;
        range?: number;
        canKick?: boolean;
        remoteDetonateCharges?: number;
        speed?: number;
      }>(id, BOMBER_STATS);
      currentAlive.set(id, stats?.alive !== false);
      currentShield.set(id, stats?.shield === true);
      const total =
        (stats?.maxBombs ?? 0) +
        (stats?.range ?? 0) +
        (stats?.canKick === true ? 1 : 0) +
        (stats?.remoteDetonateCharges ?? 0) +
        (stats?.shield === true ? 1 : 0) +
        (stats?.speed ?? 0);
      currentStatsTotal.set(id, total);
    }
    for (const [id, prevTotal] of prevStatsTotal) {
      const nowTotal = currentStatsTotal.get(id);
      if (nowTotal !== undefined && nowTotal > prevTotal) {
        // Stats only go UP on pickup collection (S82 PickupCollectSystem).
        // S109 — fire the per-bomber voice. Position from grid pos.
        const pos = cellPos(id);
        onEvent("voice-pickup", { entityId: id, ...(pos !== undefined ? { position: pos } : {}) });
      }
    }
    prevStatsTotal = currentStatsTotal;
    for (const [id, wasShield] of prevShield) {
      const nowShield = currentShield.get(id) ?? false;
      if (wasShield && !nowShield) {
        // Shield was just consumed (either by a blast hit OR by the
        // bomber dying — in the death case the death event also fires
        // below, so a shielded death emits both 'shield-pop' and
        // 'death'. The audio bus is free to mix them).
        const popPos = cellPos(id);
        onEvent("shield-pop", { entityId: id, ...(popPos !== undefined ? { position: popPos } : {}) });
        // S109 KABOOM-PROCEDURAL-VOCAL-SYNTH — survival voice. Only
        // fires when the bomber is STILL alive after the shield ate
        // the hit (the death branch below covers the dead case).
        const nowAlive = currentAlive.get(id) ?? false;
        if (nowAlive) {
          onEvent("voice-hit", { entityId: id, ...(popPos !== undefined ? { position: popPos } : {}) });
        }
      }
    }
    prevShield = currentShield;
    for (const [id, wasAlive] of prevAlive) {
      const nowAlive = currentAlive.get(id) ?? false;
      if (wasAlive && !nowAlive) {
        const deathPos = cellPos(id);
        onEvent("death", { entityId: id, ...(deathPos !== undefined ? { position: deathPos } : {}) });
        // S109 KABOOM-PROCEDURAL-VOCAL-SYNTH — per-bomber death voice
        // on the same edge as the generic "death" event.
        onEvent("voice-death", { entityId: id, ...(deathPos !== undefined ? { position: deathPos } : {}) });
        // S132 — the death visual is now owned by the engine ragdoll
        // module, triggered by createKaboomDeathTriggerSystem on the
        // same alive→false edge. This system keeps the audio + voice
        // + particle puff + GridMover stop; the DeathAnim write that
        // used to gate the S105 spring path is gone.
        const mover = world.getComponent<{ queuedDirection?: { dx: number; dz: number } }>(id, "GridMover");
        if (mover !== undefined && (mover.queuedDirection?.dx !== 0 || mover.queuedDirection?.dz !== 0)) {
          world.setComponent(id, "GridMover", { ...mover, queuedDirection: { dx: 0, dz: 0 } });
        }
        // S86 KABOOM-DEATH-PARTICLES. Spawn a short-lived 'glow' puff
        // at the dead bomber's cell. The M19 ParticleEmitterSystem
        // cleans the entity up when lifetime elapses.
        const pos = world.getComponent<{ gx?: number; gz?: number }>(id, GRID_POSITION);
        if (pos !== undefined) {
          const puffId = `${id}.death-puff`;
          if (!world.hasEntity(puffId)) {
            world.addEntity(puffId);
            world.setComponent(puffId, TRANSFORM, {
              position: [pos.gx ?? 0, 0.5, pos.gz ?? 0],
              rotation: [0, 0, 0],
              scale: [1, 1, 1]
            });
            world.setComponent(puffId, PARTICLE_EMITTER, {
              preset: "glow",
              lifetime: 0.5,
              elapsed: 0,
              rate: 30,
              maxParticles: 10
            });
          }
        }
      }
    }
    prevAlive = currentAlive;

    // BlastEvent transients in flight this frame → blast (once).
    // The propagation system consumes the event in the same frame, but
    // the read order between the two systems determines whether we see
    // it before it's gone. We run BEFORE BlastPropagationSystem in the
    // bootstrap registration order, so seeing the transient is the
    // happy path; if it's already been consumed, we'd still see the
    // BlastTile fan-out, which the dedicated death/pickup paths skip.
    // S91 KABOOM-AUDIO-POSITIONAL-ADOPT. Multiple bombs can detonate
    // on the same step; we play one 'blast' event but tag it with the
    // first observed BlastEvent origin so the panner has a position.
    let blastPos: readonly [number, number, number] | undefined;
    for (const eventId of blastEvents!.run()) {
      const event = world.getComponent<{ originGx?: number; originGz?: number }>(eventId, BLAST_EVENT);
      if (event === undefined || event.originGx === undefined || event.originGz === undefined) continue;
      blastPos = [event.originGx, 0, event.originGz] as const;
      break;
    }
    const anyBlast = blastEvents!.run().length > 0;
    if (anyBlast) onEvent("blast", blastPos !== undefined ? { position: blastPos } : undefined);

    // S90 KABOOM-FOOTSTEP-TICK. Walk every bomber's GridPosition;
    // a cell change since last tick fires one 'footstep' event per
    // bomber. Dead bombers (alive===false) don't tick — keeps the
    // corpse silent during the death animation. Map values are
    // refreshed each tick so a fresh world (cleared at the top)
    // starts from a clean slate.
    const currentCells = new Map<EntityId, string>();
    for (const id of bombers!.run()) {
      const stats = world.getComponent<{ alive?: boolean }>(id, BOMBER_STATS);
      if (stats !== undefined && stats.alive === false) continue;
      const gp = world.getComponent<{ gx?: number; gz?: number }>(id, GRID_POSITION);
      if (gp?.gx === undefined || gp?.gz === undefined) continue;
      const key = `${gp.gx},${gp.gz}`;
      currentCells.set(id, key);
      const prev = prevBomberCell.get(id);
      if (prev !== undefined && prev !== key) {
        onEvent("footstep", { entityId: id, position: [gp.gx, 0, gp.gz] as const });
      }
    }
    prevBomberCell = currentCells;

    // S88 KABOOM-WIN-CHIME. Detect a matchPhase transition out of
    // 'in-progress' on the kaboom.round-state singleton and fire the
    // matching chord exactly once.
    // S89 KABOOM-MATCH-WIN-PARTICLES — additionally spawns a 'pulse'
    // ParticleEmitter at the winner's cell (both bombers on draw).
    const round = world.getComponent<{ matchPhase?: string; winnerId?: string }>("kaboom.round-state", "RoundState");
    const currentMatchPhase = round?.matchPhase ?? "in-progress";
    if (prevMatchPhase === "in-progress" && currentMatchPhase !== "in-progress") {
      if (currentMatchPhase === "won") onEvent("match-won");
      else if (currentMatchPhase === "lost") onEvent("match-lost");
      else if (currentMatchPhase === "draw") onEvent("match-draw");
      // S109 KABOOM-PROCEDURAL-VOCAL-SYNTH — voice-victory fires for
      // the winning bomber on match-won / match-lost (the winnerId is
      // populated by RoundResolveSystem either way — "lost" means a
      // bot won the match). Draws do not fire a voice (no winner).
      if ((currentMatchPhase === "won" || currentMatchPhase === "lost") && round?.winnerId !== undefined) {
        const winnerPos = cellPos(round.winnerId);
        onEvent("voice-victory", {
          entityId: round.winnerId,
          ...(winnerPos !== undefined ? { position: winnerPos } : {})
        });
      }
      spawnMatchEndCelebration(world, currentMatchPhase, round?.winnerId);
    }
    prevMatchPhase = currentMatchPhase;
  };

  // S89 KABOOM-MATCH-WIN-PARTICLES. Adds one tiny 'pulse' emitter at
  // the winner's cell on won/lost (winnerId is set by
  // RoundResolveSystem) — or one at each living bomber on draw. The
  // engine ParticleEmitterSystem cleans up when lifetime elapses.
  function spawnMatchEndCelebration(world: World, phase: string, winnerId: EntityId | undefined): void {
    const burst = (bomberId: EntityId, idTag: string): void => {
      const pos = world.getComponent<{ gx?: number; gz?: number }>(bomberId, GRID_POSITION);
      if (pos === undefined) return;
      const puffId = `${bomberId}.match-burst-${idTag}`;
      if (world.hasEntity(puffId)) return;
      world.addEntity(puffId);
      world.setComponent(puffId, TRANSFORM, {
        position: [pos.gx ?? 0, 0.8, pos.gz ?? 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1]
      });
      world.setComponent(puffId, PARTICLE_EMITTER, {
        preset: "pulse",
        lifetime: 1.0,
        elapsed: 0,
        rate: 80,
        maxParticles: 40
      });
    };
    if (phase === "won" || phase === "lost") {
      if (winnerId !== undefined) burst(winnerId, phase);
      return;
    }
    if (phase === "draw") {
      if (bombers !== undefined) {
        for (const id of bombers.run()) burst(id, "draw");
      }
    }
  }

  return { name, fixedUpdate };
}
