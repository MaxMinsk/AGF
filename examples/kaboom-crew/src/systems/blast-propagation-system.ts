// S82 KABOOM-BOMB-FUSE-BLAST (propagation half) + KABOOM-DAMAGE-AND-DEATH.
//
// Consumes `BlastEvent` transients, walks the four cardinals from the
// origin cell up to `range` cells, and for each visited cell:
//   - spawns a short-lived `BlastTile` entity (visual + damage source)
//   - destroys any soft-block GridOccupant
//   - flips `BomberStats.alive=false` on any bomber present
//   - chains: if a Bomb sits on the cell, set its fuseRemaining=0 so
//     BombFuseSystem detonates it next step (or this step if it runs
//     after us — order is enforced by scheduler registration)
// Cardinals stop at the first cell that blocks blast (hard wall).
//
// BlastTile lifetime is handled by `kaboomBlastTileLifetimeSystem`
// (separate file) so each concern stays small. Total visual fade is
// ~0.4 s; that's also the damage window.

import type { ComponentName, EntityId } from "../../../../engine/core/ecs/types";
import type { QueryHandle, World } from "../../../../engine/core/ecs/world";
import type { System, SystemContext } from "../../../../engine/core/systems/types";
import type { GridOccupancyQuery } from "../../../../engine/core/systems/grid-occupancy-system";

const BLAST_EVENT: ComponentName = "BlastEvent";
const BOMB: ComponentName = "Bomb";
const BLAST_TILE: ComponentName = "BlastTile";
const TRANSFORM: ComponentName = "Transform";
const MESH_RENDERER: ComponentName = "MeshRenderer";
const GRID_POSITION: ComponentName = "GridPosition";
const GRID_OCCUPANT: ComponentName = "GridOccupant";
const BOMBER_STATS: ComponentName = "BomberStats";

type BlastEvent = { originGx: number; originGz: number; range: number; ownerId: EntityId };
type BombComponent = { fuseRemaining: number; range: number; ownerId: EntityId };
type GridPos = { gx: number; gz: number };
type Occupant = { layer?: string; blocksMovement?: boolean; blocksBlast?: boolean };

const DIRECTIONS: ReadonlyArray<{ dx: number; dz: number }> = [
  { dx: 1, dz: 0 },
  { dx: -1, dz: 0 },
  { dx: 0, dz: 1 },
  { dx: 0, dz: -1 }
];

const BLAST_TILE_LIFETIME = 0.4;

export type BlastPropagationSystemOptions = {
  occupancy: GridOccupancyQuery;
  name?: string;
  nextTileId?: (gx: number, gz: number) => EntityId;
};

export function createKaboomBlastPropagationSystem(options: BlastPropagationSystemOptions): System {
  const name = options.name ?? "kaboom.blast-propagation";
  let counter = 0;
  const nextTileId = options.nextTileId ?? ((gx: number, gz: number): EntityId => `blast-tile.${++counter}.${gx}.${gz}`);

  let cachedWorld: World | undefined;
  let events: QueryHandle | undefined;

  const fixedUpdate = (context: SystemContext): void => {
    const world = context.world;
    if (world !== cachedWorld) {
      events = world.createQuery([BLAST_EVENT]);
      cachedWorld = world;
    }
    // Snapshot the list — we'll add + remove entities below.
    const eventEntities = [...events!.run()];
    for (const eventId of eventEntities) {
      const event = world.getComponent<BlastEvent>(eventId, BLAST_EVENT);
      if (event === undefined) continue;

      // Origin cell always gets a tile + damage.
      spawnBlastTile(world, event.originGx, event.originGz, event.ownerId, nextTileId);
      damageBombersAt(world, options.occupancy, event.originGx, event.originGz);
      chainBombsAt(world, options.occupancy, event.originGx, event.originGz);
      // Soft blocks at origin (rare, but a bomb could land beside a wall
      // and immediately blow it up via chain) are destroyed too.
      destroySoftBlocksAt(world, options.occupancy, event.originGx, event.originGz);

      for (const direction of DIRECTIONS) {
        for (let step = 1; step <= event.range; step += 1) {
          const gx = event.originGx + direction.dx * step;
          const gz = event.originGz + direction.dz * step;
          if (cellBlocksBlast(world, options.occupancy, gx, gz)) {
            // Still destroy the wall? Hard walls absorb the blast and
            // survive — Bomberman tradition. Soft blocks block blast
            // only after they take the hit, so handle them as a "stop
            // after destroy" pass below.
            const softHere = softBlockIdsAt(world, options.occupancy, gx, gz);
            if (softHere.length > 0) {
              // Soft block: spawn tile here, destroy the block, stop.
              spawnBlastTile(world, gx, gz, event.ownerId, nextTileId);
              for (const id of softHere) world.removeEntity(id);
            }
            break;
          }
          spawnBlastTile(world, gx, gz, event.ownerId, nextTileId);
          damageBombersAt(world, options.occupancy, gx, gz);
          chainBombsAt(world, options.occupancy, gx, gz);
        }
      }
      // Event consumed.
      world.removeEntity(eventId);
    }
  };

  return { name, fixedUpdate };
}

function spawnBlastTile(
  world: World,
  gx: number,
  gz: number,
  ownerId: EntityId,
  nextId: (gx: number, gz: number) => EntityId
): void {
  const id = nextId(gx, gz);
  if (world.hasEntity(id)) return;
  world.addEntity(id);
  world.setComponent(id, TRANSFORM, {
    position: [gx, 0.1, gz],
    rotation: [0, 0, 0],
    scale: [0.9, 0.05, 0.9]
  });
  world.setComponent(id, MESH_RENDERER, { mesh: "box", color: "#ff9c42" });
  world.setComponent(id, GRID_POSITION, { gx, gz });
  world.setComponent(id, GRID_OCCUPANT, { layer: "blast", blocksMovement: false, blocksBlast: false });
  world.setComponent(id, BLAST_TILE, { lifetimeRemaining: BLAST_TILE_LIFETIME, ownerId });
}

function softBlockIdsAt(world: World, occupancy: GridOccupancyQuery, gx: number, gz: number): EntityId[] {
  const ids: EntityId[] = [];
  for (const id of occupancy.occupants(gx, gz)) {
    const occ = world.getComponent<Occupant>(id, GRID_OCCUPANT);
    if (occ === undefined) continue;
    // soft-block layer convention: blocksMovement=true, blocksBlast=false.
    if (occ.layer === "block" && occ.blocksMovement === true && occ.blocksBlast !== true) {
      ids.push(id);
    }
  }
  return ids;
}

function cellBlocksBlast(world: World, occupancy: GridOccupancyQuery, gx: number, gz: number): boolean {
  // Hard wall: blocksBlast=true at the cell stops the blast outright.
  if (occupancy.blocked(gx, gz, "blast")) return true;
  // Soft block: stops the blast AFTER absorbing it. Returning true and
  // letting the caller handle "destroy + stop" in one pass.
  return softBlockIdsAt(world, occupancy, gx, gz).length > 0;
}

function destroySoftBlocksAt(world: World, occupancy: GridOccupancyQuery, gx: number, gz: number): void {
  for (const id of softBlockIdsAt(world, occupancy, gx, gz)) world.removeEntity(id);
}

function damageBombersAt(world: World, occupancy: GridOccupancyQuery, gx: number, gz: number): void {
  for (const id of occupancy.occupants(gx, gz)) {
    const stats = world.getComponent<{ alive?: boolean; maxBombs: number; range: number; activeBombs?: number }>(id, BOMBER_STATS);
    if (stats === undefined || stats.alive === false) continue;
    world.setComponent(id, BOMBER_STATS, { ...stats, alive: false });
  }
}

function chainBombsAt(world: World, occupancy: GridOccupancyQuery, gx: number, gz: number): void {
  for (const id of occupancy.occupants(gx, gz, "bomb")) {
    const bomb = world.getComponent<BombComponent>(id, BOMB);
    if (bomb === undefined || bomb.fuseRemaining <= 0) continue;
    world.setComponent(id, BOMB, { ...bomb, fuseRemaining: 0 });
  }
}
