// S81 KABOOM-GRID-OCCUPANCY. Sparse cell → entity index over every
// entity that carries both `GridPosition` and `GridOccupant`. Project
// gameplay code (bomb placement, blast propagation, AI danger maps)
// queries this index instead of running its own world.query each
// frame; the system is the *only* reader of GridPosition/GridOccupant
// that pays the structural-iteration cost.
//
// Implementation: rebuild from scratch every frameUpdate. The expected
// entity count is in the hundreds (Kaboom Crew arena = 15 × 11 = 165
// cells + maybe 200 active entities); a full pass is cheaper than the
// bookkeeping required by an incremental diff. The parity test below
// will keep us honest if a future optimisation lands.

import type { ComponentName, EntityId } from "../ecs/types";
import type { QueryHandle, World } from "../ecs/world";
import { cellKey } from "../grid";
import type { System, SystemContext } from "./types";

export const GRID_POSITION: ComponentName = "GridPosition";
export const GRID_OCCUPANT: ComponentName = "GridOccupant";

type GridPositionComponent = { gx: number; gz: number };
type GridOccupantComponent = {
  layer?: string;
  blocksMovement?: boolean;
  blocksBlast?: boolean;
};

export type GridOccupancyQuery = {
  /** Entities at the given cell. Optional `layer` filters by GridOccupant.layer. */
  occupants(gx: number, gz: number, layer?: string): ReadonlyArray<EntityId>;
  /** True when any occupant at the cell blocks movement (default predicate). */
  blocked(gx: number, gz: number, predicate?: "movement" | "blast"): boolean;
  /** All cells that currently have ≥1 occupant. Order is unspecified. */
  occupiedCells(): ReadonlyArray<{ gx: number; gz: number; count: number }>;
};

export type GridOccupancySystemHandle = System & GridOccupancyQuery;

type Entry = {
  entityId: EntityId;
  gx: number;
  gz: number;
  layer: string;
  blocksMovement: boolean;
  blocksBlast: boolean;
};

const DEFAULT_LAYER = "default";

/**
 * Build a `frameUpdate` system that maintains the cell index. The
 * returned handle is also the query surface — runtime code can hold a
 * reference and call `.occupants` / `.blocked` from any other system.
 */
export function createGridOccupancySystem(
  options: { name?: string } = {}
): GridOccupancySystemHandle {
  const name = options.name ?? "core.grid-occupancy";
  let cachedWorld: World | undefined;
  let query: QueryHandle | undefined;
  let index = new Map<string, Entry[]>();

  function rebuild(world: World): void {
    if (world !== cachedWorld) {
      query = world.createQuery([GRID_POSITION, GRID_OCCUPANT]);
      cachedWorld = world;
    }
    const next = new Map<string, Entry[]>();
    for (const entityId of query!.run()) {
      const pos = world.getComponent<GridPositionComponent>(entityId, GRID_POSITION);
      const occ = world.getComponent<GridOccupantComponent>(entityId, GRID_OCCUPANT);
      if (pos === undefined || occ === undefined) continue;
      const entry: Entry = {
        entityId,
        gx: pos.gx,
        gz: pos.gz,
        layer: occ.layer ?? DEFAULT_LAYER,
        blocksMovement: occ.blocksMovement === true,
        blocksBlast: occ.blocksBlast === true
      };
      const key = cellKey(pos.gx, pos.gz);
      const bucket = next.get(key);
      if (bucket === undefined) next.set(key, [entry]);
      else bucket.push(entry);
    }
    index = next;
  }

  const frameUpdate = (context: SystemContext): void => {
    rebuild(context.world);
  };

  /** Exposed for tests: forces a rebuild against the supplied world. */
  function rebuildFor(world: World): void {
    rebuild(world);
  }

  return {
    name,
    frameUpdate,
    occupants(gx: number, gz: number, layer?: string): ReadonlyArray<EntityId> {
      const bucket = index.get(cellKey(gx, gz));
      if (bucket === undefined) return [];
      if (layer === undefined) return bucket.map((e) => e.entityId);
      const out: EntityId[] = [];
      for (const e of bucket) if (e.layer === layer) out.push(e.entityId);
      return out;
    },
    blocked(gx: number, gz: number, predicate: "movement" | "blast" = "movement"): boolean {
      const bucket = index.get(cellKey(gx, gz));
      if (bucket === undefined) return false;
      for (const e of bucket) {
        if (predicate === "movement" && e.blocksMovement) return true;
        if (predicate === "blast" && e.blocksBlast) return true;
      }
      return false;
    },
    occupiedCells(): ReadonlyArray<{ gx: number; gz: number; count: number }> {
      const out: Array<{ gx: number; gz: number; count: number }> = [];
      for (const [key, bucket] of index.entries()) {
        const idx = key.indexOf("|");
        out.push({ gx: Number(key.slice(0, idx)), gz: Number(key.slice(idx + 1)), count: bucket.length });
      }
      return out;
    },
  } as GridOccupancySystemHandle;
  // `rebuildFor` reserved for future targeted-rebuild callers (e.g. an
  // input system that just placed a bomb wants to see the index update
  // before its own frame ends). Tests use the public `frameUpdate`.
  void rebuildFor;
}
