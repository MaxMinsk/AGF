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

export type AudioEventKind = "bomb-place" | "blast" | "pickup" | "death";
export type AudioEventListener = (kind: AudioEventKind, context?: { entityId?: EntityId }) => void;

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
    }

    // Bomb births → bomb-place.
    const currentBombIds = new Set<EntityId>(bombs!.run());
    for (const id of currentBombIds) {
      if (!prevBombIds.has(id)) onEvent("bomb-place", { entityId: id });
    }
    prevBombIds = currentBombIds;

    // Pickup deaths → pickup.
    const currentPickupIds = new Set<EntityId>(pickups!.run());
    for (const id of prevPickupIds) {
      if (!currentPickupIds.has(id)) onEvent("pickup", { entityId: id });
    }
    prevPickupIds = currentPickupIds;

    // BomberStats.alive true → false → death.
    const currentAlive = new Map<EntityId, boolean>();
    for (const id of bombers!.run()) {
      const stats = world.getComponent<{ alive?: boolean }>(id, BOMBER_STATS);
      currentAlive.set(id, stats?.alive !== false);
    }
    for (const [id, wasAlive] of prevAlive) {
      const nowAlive = currentAlive.get(id) ?? false;
      if (wasAlive && !nowAlive) {
        onEvent("death", { entityId: id });
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
    const anyBlast = blastEvents!.run().length > 0;
    if (anyBlast) onEvent("blast");
  };

  return { name, fixedUpdate };
}
