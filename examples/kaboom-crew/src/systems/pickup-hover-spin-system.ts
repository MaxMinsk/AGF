// S191 KABOOM-PICKUP-HOVER-SPIN. Pickup items hover (sin-wave Y bob)
// and slowly rotate around Y so they read as "interactive collectible"
// at a glance instead of looking like a static block. Pure presentation
// — no gameplay state touched.
//
// Plays nice with S178/S179 height-lift: the bob writes
// `Transform.position.y = authoredBase + heightLift.offsetY + bob`,
// so pickups on raised cells still bob from the cell-top, not the
// floor.

import type { ComponentName, EntityId } from "../../../../engine/core/ecs/types";
import type { QueryHandle, World } from "../../../../engine/core/ecs/world";
import type { System, SystemContext } from "../../../../engine/core/systems/types";

const TRANSFORM: ComponentName = "Transform";
const PICKUP: ComponentName = "Pickup";

/** Vertical amplitude in cells. ~0.06 reads as a clear hover without
 *  drawing the eye away from the gameplay action. */
const BOB_AMPLITUDE = 0.06;
/** Angular frequency of the sin wave in radians per second. */
const BOB_FREQ = 2.4;
/** Y rotation rate in degrees per second. */
const SPIN_DEG_PER_S = 45;

type TransformLike = {
  position?: ReadonlyArray<number>;
  rotation?: ReadonlyArray<number>;
  scale?: ReadonlyArray<number>;
  parent?: string;
};

type HeightLift = { offsetY?: number };

export function createKaboomPickupHoverSpinSystem(): System {
  const name = "kaboom.pickup-hover-spin";
  // Authored Y per pickup — captured the first time we see the entity
  // (post-lift, so subtracting `heightLift.offsetY` gives the original
  // authoring Y). Stored separately from any phase so the bob and spin
  // both reference the same baseline.
  const baseY = new Map<EntityId, number>();
  /** Per-entity time offset so identical-cohort pickups don't all bob in
   *  lockstep. Hash the entity id for a stable phase. */
  const phase = new Map<EntityId, number>();
  let cachedWorld: World | undefined;
  let pickups: QueryHandle | undefined;
  let elapsed = 0;

  const fixedUpdate = (context: SystemContext): void => {
    const world = context.world;
    if (world !== cachedWorld) {
      pickups = world.createQuery([PICKUP, TRANSFORM]);
      cachedWorld = world;
      baseY.clear();
      phase.clear();
      elapsed = 0;
    }
    elapsed += context.time.fixedDt;
    for (const id of pickups!.run()) {
      const transform = world.getComponent<TransformLike>(id, TRANSFORM);
      if (transform === undefined || transform.position === undefined) continue;
      if (typeof transform.parent === "string" && transform.parent.length > 0) continue;
      const lift = world.getComponent<HeightLift>(id, "HeightLift")?.offsetY ?? 0;
      let base = baseY.get(id);
      if (base === undefined) {
        base = (transform.position[1] ?? 0) - lift;
        baseY.set(id, base);
        phase.set(id, hashPhase(id));
      }
      const p = phase.get(id) ?? 0;
      const bob = Math.sin(elapsed * BOB_FREQ + p) * BOB_AMPLITUDE;
      const y = base + lift + bob;
      const [x, , z] = transform.position;
      const rot = transform.rotation ?? [0, 0, 0];
      const rotY = (elapsed * SPIN_DEG_PER_S + p * 30) % 360;
      world.setComponent(id, TRANSFORM, {
        ...transform,
        position: [x, y, z] as [number, number, number],
        rotation: [rot[0] ?? 0, rotY, rot[2] ?? 0] as [number, number, number]
      });
    }
    // GC entries for despawned pickups.
    for (const id of [...baseY.keys()]) {
      if (!world.hasEntity(id)) {
        baseY.delete(id);
        phase.delete(id);
      }
    }
  };

  return { name, fixedUpdate };
}

/** Cheap deterministic per-entity phase in [0, 2π). String hash then
 *  scaled. Just enough variation so a cluster of pickups doesn't all
 *  rise + fall in unison. */
function hashPhase(entityId: EntityId): number {
  let h = 0;
  for (let i = 0; i < entityId.length; i += 1) {
    h = (h * 31 + entityId.charCodeAt(i)) | 0;
  }
  return ((h >>> 0) % 1000) / 1000 * Math.PI * 2;
}
