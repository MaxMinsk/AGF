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
const HIT_RECOIL_REQUEST: ComponentName = "HitRecoilRequest";

type BlastTile = { lifetimeRemaining: number; ownerId?: EntityId };
type GridPos = { gx: number; gz: number };

export function createKaboomBlastTileLifetimeSystem(options: { occupancy: GridOccupancyQuery; name?: string }): System {
  const name = options.name ?? "kaboom.blast-tile-lifetime";
  let cachedWorld: World | undefined;
  let tiles: QueryHandle | undefined;
  // S157 SHIELD-FIX — per-tile set of bombers already damaged by THIS
  // tile. Initialised on the FIRST tick the tile is seen with the
  // initial occupants (which blast-propagation-system already damaged
  // on the spawn step), so we don't double-fire. Subsequent ticks
  // damage NEW entrants only — a bomber who walks INTO an active tile
  // gets hit once; a bomber who was on it from the start is skipped
  // because blast-prop already handled them.
  //
  // Pre-fix, the system damaged occupants every tick (24× over a
  // 0.4s tile) — shield consumed once + the remaining 23 hits killed
  // anyway, so shield "не срабатывает" from the user's POV.
  const tileDamagedIds = new Map<EntityId, Set<EntityId>>();

  const fixedUpdate = (context: SystemContext): void => {
    const world = context.world;
    if (world !== cachedWorld) {
      tiles = world.createQuery([BLAST_TILE, GRID_POSITION]);
      cachedWorld = world;
      tileDamagedIds.clear();
    }
    const dt = Math.max(0, context.time.fixedDt);
    const snapshot = [...tiles!.run()];
    // Track live tile ids so we can GC the damaged-ids map after the
    // loop (tiles that expired this tick get their entry dropped).
    const liveTileIds = new Set<EntityId>(snapshot);
    for (const entityId of snapshot) {
      const tile = world.getComponent<BlastTile>(entityId, BLAST_TILE);
      const pos = world.getComponent<GridPos>(entityId, GRID_POSITION);
      if (tile === undefined || pos === undefined) continue;
      // Continuously damage bombers standing on the tile. A bomber that
      // walks INTO a tile mid-life dies; a bomber that stepped off
      // before the tile spawned is safe. Each (tile, bomber) pair
      // damages AT MOST ONCE per tile-life — so a shielded bomber
      // standing on the tile gets one damage attempt (shield consumed)
      // not 24 (the tile-life-in-ticks).
      let damaged = tileDamagedIds.get(entityId);
      if (damaged === undefined) {
        // S157 SHIELD-FIX — first tick after the spawn: initialise the
        // set with the current occupants. blast-propagation-system's
        // damageBombersAt already handled them on the spawn step;
        // re-damaging here would double-fire (shield → consume + then
        // kill in the same fixedUpdate).
        damaged = new Set<EntityId>(options.occupancy.occupants(pos.gx, pos.gz));
        damaged.delete(entityId); // own id never enters
        tileDamagedIds.set(entityId, damaged);
      } else {
        for (const id of options.occupancy.occupants(pos.gx, pos.gz)) {
          if (id === entityId) continue;
          if (damaged.has(id)) continue;
          damaged.add(id);
          const stats = world.getComponent<{ alive?: boolean; maxBombs: number; range: number; activeBombs?: number; shield?: boolean }>(id, BOMBER_STATS);
          if (stats === undefined || stats.alive === false) continue;
          if (stats.shield === true) {
            // Consume the shield + stamp a HitRecoilRequest so audio +
            // torso recoil fire just like damageBombersAt does.
            world.setComponent(id, BOMBER_STATS, { ...stats, shield: false });
            world.setComponent(id, HIT_RECOIL_REQUEST, {
              blastOriginGx: pos.gx,
              blastOriginGz: pos.gz
            });
            continue;
          }
          world.setComponent(id, BOMBER_STATS, { ...stats, alive: false });
        }
      }
      const next = tile.lifetimeRemaining - dt;
      if (next <= 0) {
        world.removeEntity(entityId);
        tileDamagedIds.delete(entityId);
      } else {
        world.setComponent(entityId, BLAST_TILE, { ...tile, lifetimeRemaining: next });
      }
    }
    // GC tiles that were removed externally (e.g. round restart wipes
    // BlastTile entities). Drop their damaged-ids entries.
    for (const id of tileDamagedIds.keys()) {
      if (!liveTileIds.has(id)) tileDamagedIds.delete(id);
    }
  };

  return { name, fixedUpdate };
}
