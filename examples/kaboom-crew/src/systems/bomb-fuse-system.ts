// S82 KABOOM-BOMB-FUSE-BLAST (fuse half).
//
// fixedUpdate ticks each `Bomb.fuseRemaining` down by fixedDt; at zero
// the bomb emits a `BlastEvent` transient component on a freshly-spawned
// event entity + deletes the bomb. BlastPropagationSystem consumes the
// event the same step.
//
// Chain reactions: another system (BlastPropagationSystem) sets a
// bomb's `fuseRemaining` to 0 when the bomb shares a cell with a
// blast tile — this system handles the actual detonation logic
// identically whether the fuse hit zero by timer or by chain.

import type { ComponentName, EntityId } from "../../../../engine/core/ecs/types";
import type { QueryHandle, World } from "../../../../engine/core/ecs/world";
import type { System, SystemContext } from "../../../../engine/core/systems/types";

const BOMB: ComponentName = "Bomb";
const BLAST_EVENT: ComponentName = "BlastEvent";
const GRID_POSITION: ComponentName = "GridPosition";
const BOMBER_STATS: ComponentName = "BomberStats";

type BombComponent = { fuseRemaining: number; range: number; ownerId: EntityId };
type GridPosition = { gx: number; gz: number };

export function createKaboomBombFuseSystem(options: { name?: string; nextEventId?: () => EntityId } = {}): System {
  const name = options.name ?? "kaboom.bomb-fuse";
  let counter = 0;
  const nextEventId = options.nextEventId ?? ((): EntityId => `blast-event.${++counter}`);

  let cachedWorld: World | undefined;
  let bombs: QueryHandle | undefined;

  const fixedUpdate = (context: SystemContext): void => {
    const world = context.world;
    if (world !== cachedWorld) {
      bombs = world.createQuery([BOMB, GRID_POSITION]);
      cachedWorld = world;
    }
    const dt = Math.max(0, context.time.fixedDt);
    // Materialise the entity list — we'll mutate the world below and
    // don't want the live query iterator to throw on snapshot drift.
    const candidates = [...bombs!.run()];
    for (const entityId of candidates) {
      const bomb = world.getComponent<BombComponent>(entityId, BOMB);
      const pos = world.getComponent<GridPosition>(entityId, GRID_POSITION);
      if (bomb === undefined || pos === undefined) continue;
      const next = bomb.fuseRemaining - dt;
      if (next > 0) {
        world.setComponent(entityId, BOMB, { ...bomb, fuseRemaining: next });
        continue;
      }
      // Detonate. Spawn a transient BlastEvent entity then delete the
      // bomb. BlastPropagationSystem consumes the event the same step.
      const eventId = nextEventId();
      if (!world.hasEntity(eventId)) {
        world.addEntity(eventId);
        world.setComponent(eventId, BLAST_EVENT, {
          originGx: pos.gx,
          originGz: pos.gz,
          range: bomb.range,
          ownerId: bomb.ownerId
        });
      }
      // Decrement the owner's activeBombs counter so they can place more.
      const ownerStats = world.getComponent<{ activeBombs?: number; maxBombs: number; range: number }>(bomb.ownerId, BOMBER_STATS);
      if (ownerStats !== undefined && (ownerStats.activeBombs ?? 0) > 0) {
        world.setComponent(bomb.ownerId, BOMBER_STATS, {
          ...ownerStats,
          activeBombs: (ownerStats.activeBombs ?? 0) - 1
        });
      }
      world.removeEntity(entityId);
    }
  };

  return { name, fixedUpdate };
}
