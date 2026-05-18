// S82 KABOOM-BOMB-FUSE-BLAST. Companion to BlastPropagationSystem —
// ticks BlastTile.lifetimeRemaining down each fixedUpdate and deletes
// the tile entity at zero. Also damages bombers that step onto an
// active blast tile (re-checked every step so a bomber that walks
// into a still-flashing tile dies). The tile is a visual + damage
// source unified into one component.

import type { ComponentName, EntityId } from "../../../../engine/core/ecs/types";
import type { QueryHandle, World } from "../../../../engine/core/ecs/world";
import type { System, SystemContext } from "../../../../engine/core/systems/types";
import type { GridOccupancyQuery } from "../../../../engine/core/systems/grid-occupancy-system";

const BLAST_TILE: ComponentName = "BlastTile";
const GRID_POSITION: ComponentName = "GridPosition";
const BOMBER_STATS: ComponentName = "BomberStats";

type BlastTile = { lifetimeRemaining: number; ownerId?: EntityId };
type GridPos = { gx: number; gz: number };

export function createKaboomBlastTileLifetimeSystem(options: { occupancy: GridOccupancyQuery; name?: string }): System {
  const name = options.name ?? "kaboom.blast-tile-lifetime";
  let cachedWorld: World | undefined;
  let tiles: QueryHandle | undefined;

  const fixedUpdate = (context: SystemContext): void => {
    const world = context.world;
    if (world !== cachedWorld) {
      tiles = world.createQuery([BLAST_TILE, GRID_POSITION]);
      cachedWorld = world;
    }
    const dt = Math.max(0, context.time.fixedDt);
    const snapshot = [...tiles!.run()];
    for (const entityId of snapshot) {
      const tile = world.getComponent<BlastTile>(entityId, BLAST_TILE);
      const pos = world.getComponent<GridPos>(entityId, GRID_POSITION);
      if (tile === undefined || pos === undefined) continue;
      // Continuously damage bombers standing on the tile. A bomber that
      // walks INTO a tile mid-life dies; a bomber that stepped off
      // before the tile spawned is safe.
      for (const id of options.occupancy.occupants(pos.gx, pos.gz)) {
        if (id === entityId) continue;
        const stats = world.getComponent<{ alive?: boolean; maxBombs: number; range: number; activeBombs?: number }>(id, BOMBER_STATS);
        if (stats === undefined || stats.alive === false) continue;
        world.setComponent(id, BOMBER_STATS, { ...stats, alive: false });
      }
      const next = tile.lifetimeRemaining - dt;
      if (next <= 0) {
        world.removeEntity(entityId);
      } else {
        world.setComponent(entityId, BLAST_TILE, { ...tile, lifetimeRemaining: next });
      }
    }
  };

  return { name, fixedUpdate };
}
