// S165 KABOOM-MULTI-VARIANT-BLOCKS (GDP-2026-05-28-003) +
// S170 KABOOM-WANG-INTEGRATION (GDP-2026-05-28-004 Stage 3) —
// project-local scene-load pass that tags every hard / soft block
// entity with the engine's `WangTile` + `WangTileFamilyMember`
// components so the engine's `WangTileResolverSystem` can compute the
// per-cell bitmask + write `currentVariantIndex` onto the cell.
//
// S170 SUPERSEDES the S165 random-per-cell selection here — that path
// rewrote `MeshRenderer.mesh` to `procedural:kaboom-hard-block#<seed>`
// directly. The Wang pipeline replaces it with a two-step flow:
//
//   1) THIS system stamps WangTile + WangTileFamilyMember on every
//      hard / soft block entity. Idempotent + cheap; runs once per
//      entity (until the world swaps).
//   2) Engine's `WangTileResolverSystem` (registered in bootstrap)
//      walks dirty WangTile + WangTileFamilyMember entries each tick
//      and writes `currentVariantIndex` on each cell.
//   3) `createKaboomWangMeshSyncSystem` (below) reads dirty WangTile
//      entries, maps the bitmask via the family lookup table to one of
//      the 4 builder variants, and writes the per-variant mesh key
//      `procedural:kaboom-hard-block-N` onto MeshRenderer.mesh.
//
// On block destruction (entity.delete via blast-propagation): the
// engine resolver sees the WangTile + WangTileFamilyMember vanish from
// the dirty queue, re-resolves the 4 cardinal neighbours, the sync
// bridge below propagates the new variants. No project-side bookkeeping.

import type { ComponentName, EntityId } from "../../../../engine/core/ecs/types";
import type { QueryHandle, World } from "../../../../engine/core/ecs/world";
import type { System, SystemContext } from "../../../../engine/core/systems/types";
import {
  WANG_TILE,
  WANG_TILE_FAMILY_MEMBER,
  resolveAll as resolveAllWangTiles,
  type WangTileComponent,
  type WangTileFamilyMemberComponent
} from "../../../../engine/render/autotile";
import {
  HARD_BLOCK_WANG_FAMILY,
  SOFT_BLOCK_WANG_FAMILY
} from "../blocks/register-wang-families";
import {
  hardBlockBitmaskToVariant,
  softBlockBitmaskToVariant,
  type KaboomBlockVariantIndex
} from "../blocks/wang-family-lookup";
import {
  HARD_BLOCK_VARIANT_KEYS,
  SOFT_BLOCK_VARIANT_KEYS
} from "../register-block-builders";

const GRID_OCCUPANT: ComponentName = "GridOccupant";
const GRID_POSITION: ComponentName = "GridPosition";
const MESH_RENDERER: ComponentName = "MeshRenderer";

type GridOccupantComponent = { layer?: string };
type GridPositionComponent = { gx?: number; gz?: number };
type MeshRendererComponent = { mesh?: string; color?: string };

export type KaboomBlockVariantSystemOptions = {
  name?: string;
};

/**
 * S170 KABOOM-WANG-INTEGRATION — stamp WangTile + WangTileFamilyMember
 * on every hard / soft block entity once. The engine resolver +
 * `createKaboomWangMeshSyncSystem` take it from there.
 *
 * Per-entity idempotency: the system keeps an internal applied-set
 * keyed by entity id. Re-runs on world swap (round restart) re-stamp
 * the new entities.
 */
export function createKaboomBlockVariantSystem(
  options: KaboomBlockVariantSystemOptions = {}
): System {
  const name = options.name ?? "kaboom.block-variant";

  const applied = new Set<EntityId>();
  let cachedWorld: World | undefined;
  let cellQuery: QueryHandle | undefined;

  const fixedUpdate = (context: SystemContext): void => {
    const world = context.world;
    if (world !== cachedWorld) {
      cellQuery = world.createQuery([GRID_OCCUPANT, GRID_POSITION]);
      cachedWorld = world;
      applied.clear();
    }
    let stampedThisTick = 0;
    for (const id of cellQuery!.run()) {
      if (applied.has(id)) continue;
      const occ = world.getComponent<GridOccupantComponent>(id, GRID_OCCUPANT);
      const layer = occ?.layer;
      const familyName = layer === "wall"
        ? HARD_BLOCK_WANG_FAMILY
        : layer === "block"
          ? SOFT_BLOCK_WANG_FAMILY
          : undefined;
      if (familyName === undefined) continue;
      const pos = world.getComponent<GridPositionComponent>(id, GRID_POSITION);
      if (pos?.gx === undefined || pos.gz === undefined) continue;
      const wangTile: WangTileComponent = { familyName };
      const member: WangTileFamilyMemberComponent = { familyName };
      world.setComponent(id, WANG_TILE, wangTile);
      world.setComponent(id, WANG_TILE_FAMILY_MEMBER, member);
      applied.add(id);
      stampedThisTick += 1;
    }
    // S170 hotfix: call resolveAll synchronously right after stamping so
    // the engine resolver writes currentVariantIndex this same tick.
    // Live probe found that the standalone wang-tile-resolver-system
    // wasn't writing the field in time for the mesh-sync bridge to read.
    if (stampedThisTick > 0) resolveAllWangTiles(world);
    // Prune entries for entities that were destroyed (soft block blown
    // up by a blast). Keeps the set from leaking across rounds.
    for (const id of [...applied]) {
      if (!world.hasEntity(id)) applied.delete(id);
    }
  };

  return { name, fixedUpdate };
}

// ---------------------------------------------------------------------
// S170 KABOOM-WANG-INTEGRATION — kaboom-side mesh-sync bridge.
// ---------------------------------------------------------------------

export type KaboomWangMeshSyncSystemOptions = {
  name?: string;
};

/**
 * Watch every WangTile entity for a fresh `currentVariantIndex` value
 * (the engine resolver writes this each time the cell's bitmask flips)
 * and rewrite MeshRenderer.mesh to the matching per-variant procedural
 * key — `procedural:kaboom-hard-block-N` or `procedural:kaboom-soft-block-N`.
 *
 * The bridge stays project-local because:
 *   - the engine module deliberately doesn't manage mesh entities; it
 *     just writes the resolved index + key onto WangTile;
 *   - the `4 variants → 16 bitmasks` collapsing is a project-side
 *     visual decision (see ../blocks/wang-family-lookup.ts).
 *
 * Runs in fixedUpdate AFTER the engine resolver so the same-tick
 * resolution flows into a same-tick MeshRenderer rewrite.
 */
export function createKaboomWangMeshSyncSystem(
  options: KaboomWangMeshSyncSystemOptions = {}
): System {
  const name = options.name ?? "kaboom.wang-mesh-sync";

  // entity-id → last variant index written. Skip the setComponent
  // when nothing changed so the renderer adapter doesn't re-bind a
  // mesh handle that's already pointing at the right geometry.
  const lastVariantById = new Map<EntityId, KaboomBlockVariantIndex>();
  let cachedWorld: World | undefined;
  let wangQuery: QueryHandle | undefined;

  const fixedUpdate = (context: SystemContext): void => {
    const world = context.world;
    if (world !== cachedWorld) {
      wangQuery = world.createQuery([WANG_TILE]);
      cachedWorld = world;
      lastVariantById.clear();
    }
    for (const id of wangQuery!.run()) {
      const wang = world.getComponent<WangTileComponent>(id, WANG_TILE);
      if (wang === undefined) continue;
      const familyName = wang.familyName;
      if (familyName === undefined) continue;
      const bitmask = wang.currentVariantIndex;
      // The engine resolver leaves currentVariantIndex undefined until
      // the first tick that touches the cell. Skip the rewrite — the
      // resolver writes it next tick.
      if (bitmask === undefined) continue;

      const variantIndex = mapFamilyBitmask(familyName, bitmask);
      if (variantIndex === undefined) continue;
      const meshKey = meshKeyFor(familyName, variantIndex);
      if (meshKey === undefined) continue;

      const prev = lastVariantById.get(id);
      if (prev === variantIndex) continue;

      const mr = world.getComponent<MeshRendererComponent>(id, MESH_RENDERER);
      const next: MeshRendererComponent = { ...(mr ?? {}), mesh: meshKey };
      world.setComponent(id, MESH_RENDERER, next);
      lastVariantById.set(id, variantIndex);
    }
    // Prune destroyed entities — same pattern as the variant system.
    for (const id of [...lastVariantById.keys()]) {
      if (!world.hasEntity(id)) lastVariantById.delete(id);
    }
  };

  return { name, fixedUpdate };
}

function mapFamilyBitmask(
  familyName: string,
  bitmask: number
): KaboomBlockVariantIndex | undefined {
  if (familyName === HARD_BLOCK_WANG_FAMILY) return hardBlockBitmaskToVariant(bitmask);
  if (familyName === SOFT_BLOCK_WANG_FAMILY) return softBlockBitmaskToVariant(bitmask);
  return undefined;
}

function meshKeyFor(
  familyName: string,
  variantIndex: KaboomBlockVariantIndex
): string | undefined {
  if (familyName === HARD_BLOCK_WANG_FAMILY) {
    return `procedural:${HARD_BLOCK_VARIANT_KEYS[variantIndex]!}`;
  }
  if (familyName === SOFT_BLOCK_WANG_FAMILY) {
    return `procedural:${SOFT_BLOCK_VARIANT_KEYS[variantIndex]!}`;
  }
  return undefined;
}
