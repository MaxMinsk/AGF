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
  DIRT_WANG_FAMILY,
  FLOOR_WANG_FAMILY,
  GRASS_WANG_FAMILY,
  HARD_BLOCK_WANG_FAMILY,
  PATH_WANG_FAMILY,
  SOFT_BLOCK_WANG_FAMILY,
  STONE_WANG_FAMILY
} from "../blocks/register-wang-families";
import {
  bitmaskToRotationYDeg,
  grassBitmaskToVariant,
  hardBlockBitmaskToVariant,
  softBlockBitmaskToVariant,
  type KaboomBlockVariantIndex
} from "../blocks/wang-family-lookup";
import { grassShapeForBitmask } from "../blocks/grass-variants";
import {
  GRASS_VARIANT_KEYS,
  HARD_BLOCK_VARIANT_KEYS,
  SOFT_BLOCK_VARIANT_KEYS
} from "../register-block-builders";

const GRID_OCCUPANT: ComponentName = "GridOccupant";
const GRID_POSITION: ComponentName = "GridPosition";
const MESH_RENDERER: ComponentName = "MeshRenderer";

/** GDP-2026-06-04-003/004 — V2 terrain families resolve to bitmask-specific
 *  meshes (already oriented per bitmask), so the mesh-sync bridge uses the
 *  engine resolver's `currentMeshKey` directly with ZERO rotation. The old
 *  4-role + Y-rotation path only applies to V1 hard/soft block families. */
const V2_TERRAIN_FAMILIES: ReadonlySet<string> = new Set([
  GRASS_WANG_FAMILY,
  PATH_WANG_FAMILY,
  STONE_WANG_FAMILY,
  DIRT_WANG_FAMILY,
  FLOOR_WANG_FAMILY
]);

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
    let stamped = 0;
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
      stamped += 1;
    }
    // S170 — call the engine resolver synchronously after stamping so
    // the cells we just tagged get currentVariantIndex written THIS
    // tick. Without this the engine resolver-system runs on a later
    // tick (or sometimes never under the tick-ordering rules) and
    // mesh-sync sees undefined currentVariantIndex for the lifetime
    // of the round.
    if (stamped > 0) resolveAllWangTiles(world);
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
  // S172 — cache the (variant, theme) tuple per cell so a theme change
  // through HMR or scene-restart actually re-writes the mesh ref.
  // S214 — cache rotationY too so a bitmask change that resolves to
  // the SAME variant but a DIFFERENT rotation still flips Transform.
  const lastByCell = new Map<EntityId, { variant: KaboomBlockVariantIndex; theme: string; rotationYDeg: number; meshKey?: string }>();
  let cachedWorld: World | undefined;
  let wangQuery: QueryHandle | undefined;

  const fixedUpdate = (context: SystemContext): void => {
    const world = context.world;
    if (world !== cachedWorld) {
      wangQuery = world.createQuery([WANG_TILE]);
      cachedWorld = world;
      lastByCell.clear();
    }
    // S172 — read the active arena theme from kaboom.game-state.
    const themeComponent = world.getComponent<{ themeKey?: string }>("kaboom.game-state", "ArenaTheme");
    const themeKey = themeComponent?.themeKey ?? "warehouse";

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

      // GDP-2026-06-04-003/004 — V2 terrain families: the engine resolver
      // wrote `currentMeshKey` (shape + sub-variant). Use it verbatim. Grass
      // uses 6 canonical shapes covering 16 bitmasks via per-cell Y rotation
      // (S214 factoring), so apply that rotation on the cell Transform.
      if (V2_TERRAIN_FAMILIES.has(familyName)) {
        const meshKey = wang.currentMeshKey;
        if (meshKey === undefined) continue;
        const rot = familyName === GRASS_WANG_FAMILY
          ? grassShapeForBitmask(bitmask).rotationYDeg
          : 0;
        const prevV2 = lastByCell.get(id);
        if (prevV2 !== undefined && prevV2.meshKey === meshKey && prevV2.rotationYDeg === rot) continue;
        const mrV2 = world.getComponent<MeshRendererComponent>(id, MESH_RENDERER);
        world.setComponent(id, MESH_RENDERER, { ...(mrV2 ?? {}), mesh: meshKey });
        if (prevV2 === undefined || prevV2.rotationYDeg !== rot) {
          const t = world.getComponent<{
            position?: ReadonlyArray<number>;
            scale?: ReadonlyArray<number>;
          }>(id, "Transform");
          if (t !== undefined) {
            const p = t.position ?? [0, 0, 0];
            const s = t.scale ?? [1, 1, 1];
            world.setComponent(id, "Transform", {
              position: [p[0] ?? 0, p[1] ?? 0, p[2] ?? 0],
              rotation: [0, rot, 0],
              scale: [s[0] ?? 1, s[1] ?? 1, s[2] ?? 1]
            });
          }
        }
        lastByCell.set(id, { variant: 0, theme: themeKey, rotationYDeg: rot, meshKey });
        continue;
      }

      const variantIndex = mapFamilyBitmask(familyName, bitmask);
      if (variantIndex === undefined) continue;
      const meshKey = meshKeyFor(familyName, variantIndex, themeKey);
      if (meshKey === undefined) continue;
      // S214 — per-bitmask Y rotation so adjacent edge / corner cells
      // visibly point in the right direction with the same canonical
      // mesh. 16 bitmasks × 4 builders → 16 distinct on-screen reads.
      const rotationYDeg = bitmaskToRotationYDeg(bitmask);

      const prev = lastByCell.get(id);
      if (
        prev !== undefined
        && prev.variant === variantIndex
        && prev.theme === themeKey
        && prev.rotationYDeg === rotationYDeg
      ) continue;

      const mr = world.getComponent<MeshRendererComponent>(id, MESH_RENDERER);
      const next: MeshRendererComponent = { ...(mr ?? {}), mesh: meshKey };
      world.setComponent(id, MESH_RENDERER, next);
      // Write Transform.rotation only when this cell's rotation
      // actually changed AND the rotation is non-zero, OR the
      // previous tick wrote a non-zero rotation we now need to
      // reset. Skipping the unchanged write keeps the per-tick churn
      // low for cells that resolve to the same bitmask repeatedly.
      if (prev === undefined || prev.rotationYDeg !== rotationYDeg) {
        const t = world.getComponent<{
          position?: ReadonlyArray<number>;
          rotation?: ReadonlyArray<number>;
          scale?: ReadonlyArray<number>;
        }>(id, "Transform");
        if (t !== undefined) {
          const pos = t.position ?? [0, 0, 0];
          const scl = t.scale ?? [1, 1, 1];
          world.setComponent(id, "Transform", {
            position: [pos[0] ?? 0, pos[1] ?? 0, pos[2] ?? 0],
            rotation: [0, rotationYDeg, 0],
            scale: [scl[0] ?? 1, scl[1] ?? 1, scl[2] ?? 1]
          });
        }
      }
      lastByCell.set(id, { variant: variantIndex, theme: themeKey, rotationYDeg });
    }
    // Prune destroyed entities — same pattern as the variant system.
    for (const id of [...lastByCell.keys()]) {
      if (!world.hasEntity(id)) lastByCell.delete(id);
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
  if (familyName === GRASS_WANG_FAMILY) return grassBitmaskToVariant(bitmask);
  return undefined;
}

function meshKeyFor(
  familyName: string,
  variantIndex: KaboomBlockVariantIndex,
  themeKey: string
): string | undefined {
  // S172 — encode the theme key in the procedural-mesh seed so the
  // renderer caches one BufferGeometry per (variant, theme) tuple.
  // The block-builder reads the seed back out and looks up the
  // matching hard/softBlockPalette from ARENA_THEMES.
  if (familyName === HARD_BLOCK_WANG_FAMILY) {
    return `procedural:${HARD_BLOCK_VARIANT_KEYS[variantIndex]!}#${themeKey}`;
  }
  if (familyName === SOFT_BLOCK_WANG_FAMILY) {
    return `procedural:${SOFT_BLOCK_VARIANT_KEYS[variantIndex]!}#${themeKey}`;
  }
  // S176 KABOOM-FLOOR-WANG-TILES MVP — grass family has no theme-aware
  // palette this sprint, so the seed component is omitted (the registry
  // caches one geometry per variant for the whole world).
  if (familyName === GRASS_WANG_FAMILY) {
    return `procedural:${GRASS_VARIANT_KEYS[variantIndex]!}`;
  }
  return undefined;
}
