// S197 KABOOM-DASH-TRAIL. Co-spawns a fading particle emitter at the
// dashing bomber's current Transform position every TRAIL_INTERVAL_S
// while BomberStats.dashing is true. Trails read as a "comet tail"
// along the dash arc, telegraphing the dash distance + direction long
// enough for opponents to react.
//
// Pure presentation; no gameplay state touched.

import type { ComponentName, EntityId } from "../../../../engine/core/ecs/types";
import type { QueryHandle, World } from "../../../../engine/core/ecs/world";
import type { System, SystemContext } from "../../../../engine/core/systems/types";

const BOMBER_STATS: ComponentName = "BomberStats";
const TRANSFORM: ComponentName = "Transform";
const PARTICLE_EMITTER: ComponentName = "ParticleEmitter";

/** Seconds between trail puffs while the bomber is dashing.
 *  Dash takes 200ms, so 35ms gives ~5–6 puffs along the arc. */
const TRAIL_INTERVAL_S = 0.035;
/** Lifetime of each emitter. Short — we want a quick trail, not lingering smoke. */
const PUFF_LIFETIME_S = 0.22;

type BomberStatsComponent = { dashing?: boolean };
type TransformComponent = { position?: ReadonlyArray<number> };

let puffCounter = 0;

export function createKaboomDashTrailSystem(): System {
  const name = "kaboom.dash-trail";
  let cachedWorld: World | undefined;
  let bombers: QueryHandle | undefined;
  // Per-bomber accumulator — fires a puff every time the accumulator
  // crosses TRAIL_INTERVAL_S, regardless of fixedDt jitter.
  const accumulator = new Map<EntityId, number>();

  const fixedUpdate = (context: SystemContext): void => {
    const world = context.world;
    if (world !== cachedWorld) {
      bombers = world.createQuery([BOMBER_STATS, TRANSFORM]);
      cachedWorld = world;
      accumulator.clear();
    }
    const dt = context.time.fixedDt;
    for (const id of bombers!.run()) {
      const stats = world.getComponent<BomberStatsComponent>(id, BOMBER_STATS);
      if (stats?.dashing !== true) {
        accumulator.delete(id);
        continue;
      }
      const transform = world.getComponent<TransformComponent>(id, TRANSFORM);
      if (transform?.position === undefined) continue;
      const acc = (accumulator.get(id) ?? 0) + dt;
      if (acc < TRAIL_INTERVAL_S) {
        accumulator.set(id, acc);
        continue;
      }
      accumulator.set(id, 0);
      spawnTrailPuff(world, transform.position);
    }
    // GC entries for despawned bombers.
    for (const id of [...accumulator.keys()]) {
      if (!world.hasEntity(id)) accumulator.delete(id);
    }
  };

  return { name, fixedUpdate };
}

function spawnTrailPuff(world: World, position: ReadonlyArray<number>): void {
  puffCounter += 1;
  const emitterId = `kaboom.dash-trail.${puffCounter}`;
  world.addEntity(emitterId);
  world.setComponent(emitterId, TRANSFORM, {
    position: [position[0] ?? 0, position[1] ?? 0.4, position[2] ?? 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1]
  });
  world.setComponent(emitterId, PARTICLE_EMITTER, {
    preset: "glow",
    lifetime: PUFF_LIFETIME_S,
    elapsed: 0,
    rate: 24,
    maxParticles: 6
  });
}
