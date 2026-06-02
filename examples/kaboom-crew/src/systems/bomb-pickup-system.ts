// S144 KABOOM-THROW-GLOVE pickup half.
//
// Consumes PickupBombRequest transients written by player-input-system
// when T fires while standing on an own bomb. Validates the request
// (bomb still exists, owned by bomber, not already carried, not
// airborne) and on success:
//   - sets Bomb.carriedBy = bomberId so bomb-fuse-system skips the
//     fuse decrement for as long as the bomb is carried.
//   - stores the bomb id in BomberStats.carryingBombId so the input
//     system + HUD can branch on it.
//   - decrements BomberStats.activeBombs so the bomber can place a
//     new bomb while carrying the picked one (matches the GDP rule).
//   - removes the bomb's GridOccupant so the cell unblocks and other
//     bombers / blast tiles ignore the bomb's previous footprint.
// The request is removed at the end of the same fixedUpdate.

import type { ComponentName, EntityId } from "../../../../engine/core/ecs/types";
import type { QueryHandle, World } from "../../../../engine/core/ecs/world";
import type { System, SystemContext } from "../../../../engine/core/systems/types";

const PICKUP_BOMB_REQUEST: ComponentName = "PickupBombRequest";
const BOMB: ComponentName = "Bomb";
const BOMBER_STATS: ComponentName = "BomberStats";
const GRID_POSITION: ComponentName = "GridPosition";
const GRID_OCCUPANT: ComponentName = "GridOccupant";
const TRANSFORM: ComponentName = "Transform";
const PARTICLE_EMITTER: ComponentName = "ParticleEmitter";

/** S246 — incremental id for the bomb-pickup lift puff so back-to-back
 *  pickups on the same bomb don't collide. Module-scoped. */
let bombPickupPuffCounter = 0;

type BombComponent = {
  fuseRemaining: number;
  range: number;
  ownerId: EntityId;
  pierce?: boolean;
  carriedBy?: EntityId;
  airborne?: boolean;
};

type BomberStatsComponent = {
  maxBombs: number;
  range: number;
  activeBombs?: number;
  canThrow?: boolean;
  carryingBombId?: EntityId;
};

type GridPos = { gx: number; gz: number };

export function createKaboomBombPickupSystem(options: { name?: string } = {}): System {
  const name = options.name ?? "kaboom.bomb-pickup";
  let cachedWorld: World | undefined;
  let requests: QueryHandle | undefined;

  const fixedUpdate = (context: SystemContext): void => {
    const world = context.world;
    if (world !== cachedWorld) {
      requests = world.createQuery([PICKUP_BOMB_REQUEST]);
      cachedWorld = world;
    }
    const requestEntities = [...requests!.run()];
    for (const bomberId of requestEntities) {
      const req = world.getComponent<{ bombId?: EntityId }>(bomberId, PICKUP_BOMB_REQUEST);
      world.removeComponent(bomberId, PICKUP_BOMB_REQUEST);
      if (req === undefined || typeof req.bombId !== "string" || req.bombId.length === 0) continue;
      const bombId = req.bombId;
      if (!world.hasEntity(bombId)) continue;
      const bomb = world.getComponent<BombComponent>(bombId, BOMB);
      if (bomb === undefined) continue;
      if (bomb.ownerId !== bomberId) continue;
      if (typeof bomb.carriedBy === "string" && bomb.carriedBy.length > 0) continue;
      if (bomb.airborne === true) continue;
      const stats = world.getComponent<BomberStatsComponent>(bomberId, BOMBER_STATS);
      if (stats === undefined) continue;
      if (stats.canThrow !== true) continue;
      if (typeof stats.carryingBombId === "string" && stats.carryingBombId.length > 0) continue;
      // Bomber + bomb must share a cell at the moment of pickup. The
      // input system already checks the cell when it writes the
      // request, but a race (bomb-fuse fires + another system moves
      // the bomb between input frame and this fixedUpdate) could land
      // us here with a stale request. Double-check.
      const bomberPos = world.getComponent<GridPos>(bomberId, GRID_POSITION);
      const bombPos = world.getComponent<GridPos>(bombId, GRID_POSITION);
      if (bomberPos === undefined || bombPos === undefined) continue;
      if (bomberPos.gx !== bombPos.gx || bomberPos.gz !== bombPos.gz) continue;
      // All checks passed — mount the bomb on the bomber.
      world.setComponent(bombId, BOMB, { ...bomb, carriedBy: bomberId });
      world.setComponent(bomberId, BOMBER_STATS, {
        ...stats,
        carryingBombId: bombId,
        activeBombs: Math.max(0, (stats.activeBombs ?? 0) - 1)
      });
      // Drop the bomb's GridOccupant so the cell unblocks. The bomb
      // entity itself stays alive; throw-system restores GridOccupant
      // when the bomb lands.
      if (world.hasComponent(bombId, GRID_OCCUPANT)) {
        world.removeComponent(bombId, GRID_OCCUPANT);
      }
      // S246 KABOOM-BOMB-PICKUP-LIFT-PUFF. A tiny dust burst at the
      // pickup cell makes "you picked up the bomb" instantly readable.
      // Smallest of the puff family — this is a routine action, not a
      // survival or arc moment. 0.2 s lifetime, rate 25, max 6 particles.
      // Self-cleans via the engine ParticleEmitter primitive (M19).
      bombPickupPuffCounter += 1;
      const puffId = `${bombId}.pickup-lift.${bombPickupPuffCounter}`;
      if (!world.hasEntity(puffId)) {
        world.addEntity(puffId);
        world.setComponent(puffId, TRANSFORM, {
          position: [bomberPos.gx, 0.45, bomberPos.gz],
          rotation: [0, 0, 0],
          scale: [1, 1, 1]
        });
        world.setComponent(puffId, PARTICLE_EMITTER, {
          preset: "spark",
          lifetime: 0.2,
          elapsed: 0,
          rate: 25,
          maxParticles: 6
        });
      }
    }
  };

  return { name, fixedUpdate };
}
