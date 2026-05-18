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

  const frameUpdate = (context: SystemContext): void => {
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
      if (wasAlive && !nowAlive) onEvent("death", { entityId: id });
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

  return { name, frameUpdate };
}
