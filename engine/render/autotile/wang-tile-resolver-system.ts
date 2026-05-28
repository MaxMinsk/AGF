// S169 ENGINE-WANG-AUTOTILE (GDP-2026-05-28-002) — resolver system.
//
// Walks every entity carrying a `WangTile` component, computes the
// neighbour bitmask from cardinal cells (north/east/south/west),
// indexes into the registered `WangTileFamily.variants[]` and writes
// the picked variant back onto the WangTile component
// (`currentVariantIndex` + `currentMeshKey`). The project consumer
// then reads those fields and handles mesh spawn/dispose itself —
// engine v1 does NOT manage child mesh entities (deliberately scoped
// down to keep the engine module reusable; mesh wiring is a
// project-specific concern that depends on the project's renderer
// adapter + Transform.parent contract).
//
// Cell coordinates come from `GridPosition { gx, gz }` (the standard
// engine grid-component pair). Family membership is read via either
// the generic `WangTileFamilyMember` tag (default predicate) or a
// project-supplied custom predicate passed via options.
//
// Lifecycle:
//   1. First fixedUpdate on a fresh world: full `resolveAll(world)`.
//   2. Subsequent fixedUpdates: consume the WangTile +
//      WangTileFamilyMember dirty queues from `world.consumeDirty`; for
//      each touched cell re-resolve itself + its 4 cardinal neighbours.
//      (A neighbour add/remove flips the centre cell's bitmask too.)
//
// The system writes WangTile but does NOT spawn/dispose mesh entities.
// `currentMeshEntityId` is reserved on the schema for future use but
// stays untouched in v1.

import type { ComponentName, EntityId } from "../../core/ecs/types";
import type { QueryHandle, World } from "../../core/ecs/world";
import type { System, SystemContext } from "../../core/systems/types";
import { computeWangBitmask, resolveVariantIndex, type SameFamilyPredicate } from "./bitmask";
import { getWangTileFamily, type WangTileFamily } from "./family-registry";

export const WANG_TILE: ComponentName = "WangTile";
export const WANG_TILE_FAMILY_MEMBER: ComponentName = "WangTileFamilyMember";
const GRID_POSITION: ComponentName = "GridPosition";

type WangTileComponent = {
  familyName: string;
  currentVariantIndex?: number;
  currentMeshKey?: string;
  currentMeshEntityId?: string;
};

type WangTileFamilyMemberComponent = {
  familyName: string;
};

type GridPositionComponent = {
  gx: number;
  gz: number;
};

export type WangTileResolverSystemOptions = {
  /** System name. Defaults to `engine.wang-tile-resolver`. */
  name?: string;
  /**
   * Optional custom predicate factory. When supplied, the resolver
   * calls it once per world swap to build the per-tick same-family
   * predicate (so the factory can construct a fast lookup table — see
   * `examples/<project>/src/systems/...` for how a project might bind
   * its own block-type components). When omitted, the default
   * predicate reads the generic `WangTileFamilyMember` component.
   */
  sameFamilyPredicateFactory?: (world: World) => SameFamilyPredicateFactory;
};

/**
 * Returned by the optional `sameFamilyPredicateFactory`. The factory
 * is invoked once per world swap; the returned object is invoked once
 * per resolver pass with the family name, returning the actual
 * `SameFamilyPredicate` used for the four neighbour probes.
 */
export type SameFamilyPredicateFactory = {
  predicateFor(familyName: string): SameFamilyPredicate;
};

/**
 * Walk every WangTile entity in the world, compute its bitmask, write
 * `currentVariantIndex` + `currentMeshKey`. Exported standalone for
 * tests + for project bootstrap code that wants to force a full
 * re-resolve outside the scheduler loop (e.g. after a scene-script
 * mutation that bulk-toggles many cells).
 */
export function resolveAll(
  world: World,
  predicateFactory?: SameFamilyPredicateFactory
): void {
  const factory = predicateFactory ?? buildDefaultFactory(world);
  const wangCells = world.query([WANG_TILE, GRID_POSITION]);
  for (const id of wangCells) {
    resolveOne(world, id, factory);
  }
}

function resolveOne(
  world: World,
  entityId: EntityId,
  factory: SameFamilyPredicateFactory
): void {
  const wang = world.getComponent<WangTileComponent>(entityId, WANG_TILE);
  if (wang === undefined) return;
  const pos = world.getComponent<GridPositionComponent>(entityId, GRID_POSITION);
  if (pos === undefined) return;
  const family = getWangTileFamily(wang.familyName);
  if (family === undefined) return; // unknown family — leave the cell unresolved.
  const predicate = factory.predicateFor(wang.familyName);
  const mask = computeWangBitmask(pos.gx, pos.gz, predicate);
  const { variant, index } = resolveVariantIndex(mask, family);
  const next: WangTileComponent = {
    ...wang,
    currentVariantIndex: index,
    currentMeshKey: variant.meshKey
  };
  world.setComponent(entityId, WANG_TILE, next);
}

/**
 * Default predicate factory: reads `WangTileFamilyMember` at each
 * neighbour cell. Builds a `(gx,gz)` → familyName index once per pass
 * so the four probes are O(1).
 */
function buildDefaultFactory(world: World): SameFamilyPredicateFactory {
  const memberByCell = new Map<string, string>();
  const ids = world.query([WANG_TILE_FAMILY_MEMBER, GRID_POSITION]);
  for (const id of ids) {
    const member = world.getComponent<WangTileFamilyMemberComponent>(
      id,
      WANG_TILE_FAMILY_MEMBER
    );
    const pos = world.getComponent<GridPositionComponent>(id, GRID_POSITION);
    if (member === undefined || pos === undefined) continue;
    memberByCell.set(`${pos.gx},${pos.gz}`, member.familyName);
  }
  return {
    predicateFor(familyName: string): SameFamilyPredicate {
      return (gx: number, gz: number): boolean =>
        memberByCell.get(`${gx},${gz}`) === familyName;
    }
  };
}

/**
 * Build the resolver System. The system caches a `(gx,gz)` → entity-id
 * index across ticks so per-event re-resolves of the 4 cardinal
 * neighbours are O(1) lookups, not full scans.
 *
 * Returned System:
 *   - first fixedUpdate after a world swap → full `resolveAll`;
 *   - subsequent fixedUpdates → consume WangTile + WangTileFamilyMember
 *     dirty queues; re-resolve each touched cell + its 4 neighbours.
 */
export function createWangTileResolverSystem(
  options: WangTileResolverSystemOptions = {}
): System {
  const name = options.name ?? "engine.wang-tile-resolver";
  const externalFactory = options.sameFamilyPredicateFactory;
  let cachedWorld: World | undefined;
  let wangQuery: QueryHandle | undefined;
  let memberQuery: QueryHandle | undefined;
  // (gx,gz) → entity-id for fast neighbour lookup. Rebuilt on world swap
  // + maintained incrementally as cells are re-resolved.
  const wangCellIndex: Map<string, EntityId> = new Map();

  const buildFactory = (world: World): SameFamilyPredicateFactory => {
    if (externalFactory !== undefined) return externalFactory(world);
    return buildDefaultFactoryFromQuery(world, memberQuery!);
  };

  const fixedUpdate = (context: SystemContext): void => {
    const world = context.world;
    if (world !== cachedWorld) {
      wangQuery = world.createQuery([WANG_TILE, GRID_POSITION]);
      memberQuery = world.createQuery([WANG_TILE_FAMILY_MEMBER, GRID_POSITION]);
      cachedWorld = world;
      // Drain pre-existing dirty entries (they're the seeding state, not changes).
      world.consumeDirty(WANG_TILE);
      world.consumeDirty(WANG_TILE_FAMILY_MEMBER);
      rebuildCellIndex(world, wangQuery, wangCellIndex);
      const factory = buildFactory(world);
      resolveAllWithQuery(world, wangQuery, factory);
      // Drain the dirty marks our own writes just deposited so the
      // next tick doesn't loop re-resolving every cell.
      world.consumeDirty(WANG_TILE);
      world.consumeDirty(WANG_TILE_FAMILY_MEMBER);
      return;
    }
    const dirtyWang = world.consumeDirty(WANG_TILE);
    const dirtyMember = world.consumeDirty(WANG_TILE_FAMILY_MEMBER);
    if (dirtyWang.size === 0 && dirtyMember.size === 0) return;

    // Refresh the cell-index for any WangTile dirty entries (they may
    // have been newly added or removed since last tick).
    refreshCellIndexFor(world, dirtyWang, wangCellIndex);

    const factory = buildFactory(world);

    // Compute the set of cells to re-resolve: every dirty WangTile
    // plus, for each dirty WangTile / WangTileFamilyMember cell, its 4
    // cardinal neighbours (their bitmasks may have flipped).
    const cellsToResolve = new Set<EntityId>();
    for (const id of dirtyWang) {
      if (world.hasComponent(id, WANG_TILE)) cellsToResolve.add(id);
      addNeighboursFromEntity(world, id, wangCellIndex, cellsToResolve);
    }
    for (const id of dirtyMember) {
      // A family-member tag flip doesn't always live on a WangTile cell,
      // but its position still affects neighbouring WangTile cells.
      if (world.hasComponent(id, WANG_TILE)) cellsToResolve.add(id);
      addNeighboursFromEntity(world, id, wangCellIndex, cellsToResolve);
    }

    for (const id of cellsToResolve) {
      resolveOne(world, id, factory);
    }

    // resolveOne re-marks the WangTile dirty via setComponent — drain
    // again so we don't loop forever next tick.
    world.consumeDirty(WANG_TILE);
  };

  return { name, fixedUpdate };
}

function resolveAllWithQuery(
  world: World,
  query: QueryHandle,
  factory: SameFamilyPredicateFactory
): void {
  for (const id of query.run()) {
    resolveOne(world, id, factory);
  }
}

function buildDefaultFactoryFromQuery(
  world: World,
  memberQuery: QueryHandle
): SameFamilyPredicateFactory {
  const memberByCell = new Map<string, string>();
  for (const id of memberQuery.run()) {
    const member = world.getComponent<WangTileFamilyMemberComponent>(
      id,
      WANG_TILE_FAMILY_MEMBER
    );
    const pos = world.getComponent<GridPositionComponent>(id, GRID_POSITION);
    if (member === undefined || pos === undefined) continue;
    memberByCell.set(`${pos.gx},${pos.gz}`, member.familyName);
  }
  return {
    predicateFor(familyName: string): SameFamilyPredicate {
      return (gx: number, gz: number): boolean =>
        memberByCell.get(`${gx},${gz}`) === familyName;
    }
  };
}

function rebuildCellIndex(
  world: World,
  query: QueryHandle,
  index: Map<string, EntityId>
): void {
  index.clear();
  for (const id of query.run()) {
    const pos = world.getComponent<GridPositionComponent>(id, GRID_POSITION);
    if (pos === undefined) continue;
    index.set(`${pos.gx},${pos.gz}`, id);
  }
}

function refreshCellIndexFor(
  world: World,
  ids: Iterable<EntityId>,
  index: Map<string, EntityId>
): void {
  // For each touched id, if it still has WangTile + GridPosition, ensure
  // the index points at it; otherwise prune any stale entry that points
  // at it.
  for (const id of ids) {
    const pos = world.getComponent<GridPositionComponent>(id, GRID_POSITION);
    const hasWang = world.hasComponent(id, WANG_TILE);
    if (hasWang && pos !== undefined) {
      index.set(`${pos.gx},${pos.gz}`, id);
    } else {
      // Removed entry — strip every cell that still points at it.
      for (const [key, mappedId] of index) {
        if (mappedId === id) index.delete(key);
      }
    }
  }
}

function addNeighboursFromEntity(
  world: World,
  id: EntityId,
  index: Map<string, EntityId>,
  out: Set<EntityId>
): void {
  const pos = world.getComponent<GridPositionComponent>(id, GRID_POSITION);
  if (pos === undefined) return;
  const probe = (gx: number, gz: number): void => {
    const neighbour = index.get(`${gx},${gz}`);
    if (neighbour !== undefined) out.add(neighbour);
  };
  probe(pos.gx, pos.gz - 1); // N
  probe(pos.gx + 1, pos.gz); // E
  probe(pos.gx, pos.gz + 1); // S
  probe(pos.gx - 1, pos.gz); // W
}

/** Re-exported here so consumers can import the WangTile component shape. */
export type { WangTileComponent, WangTileFamilyMemberComponent };

/** Re-exported for completeness — the family type lives in `family-registry.ts`. */
export type { WangTileFamily };
