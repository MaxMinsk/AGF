// S247 KABOOM-PUFF-HELPER. Shared spawn-a-spark-burst helper. Four
// systems (S243 bomb-place, S244 shield-save, S245 throw-land, S246
// pickup-lift) all spawn near-identical ParticleEmitter children to
// telegraph an event. Each open-coded the same 8-line pattern. This
// helper consolidates that code so the four call-sites turn into a
// one-liner and future puff cues stay consistent.
//
// Behaviour-preserving: tuning values stay per-event (callers supply
// `preset`, `lifetime`, `rate`, `maxParticles`). The helper only owns
// the entity creation + Transform/ParticleEmitter setComponent calls.

import type { ComponentName } from "../../../../engine/core/ecs/types";
import type { World } from "../../../../engine/core/ecs/world";

const TRANSFORM: ComponentName = "Transform";
const PARTICLE_EMITTER: ComponentName = "ParticleEmitter";

export type SpawnPuffOptions = {
  /** Entity id for the puff child. Caller picks a unique id; helper
   *  refuses to overwrite an existing entity (silent no-op). */
  id: string;
  /** World position [x, y, z]. */
  position: readonly [number, number, number];
  /** ParticleEmitter preset name. */
  preset: string;
  /** Emitter lifetime in seconds — self-cleans when elapsed reaches it. */
  lifetime: number;
  /** Particles emitted per second. */
  rate: number;
  /** Hard cap on simultaneous particles. */
  maxParticles: number;
};

/** Spawn a one-shot puff entity with a ParticleEmitter that self-cleans
 *  on elapsed-reaches-lifetime. Idempotent — a second call with the
 *  same id is a silent no-op so callers can use deterministic id
 *  composition without checking themselves. */
export function spawnPuff(world: World, opts: SpawnPuffOptions): void {
  if (world.hasEntity(opts.id)) return;
  world.addEntity(opts.id);
  world.setComponent(opts.id, TRANSFORM, {
    position: [opts.position[0], opts.position[1], opts.position[2]],
    rotation: [0, 0, 0],
    scale: [1, 1, 1]
  });
  world.setComponent(opts.id, PARTICLE_EMITTER, {
    preset: opts.preset,
    lifetime: opts.lifetime,
    elapsed: 0,
    rate: opts.rate,
    maxParticles: opts.maxParticles
  });
}
