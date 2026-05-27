// S165 KABOOM-MULTI-VARIANT-BLOCKS (GDP-2026-05-28-003) — project-local
// scene-load pass that rewrites the MeshRenderer.mesh ref of every
// hard / soft block to point at the procedural-multi-variant builders
// (registered via register-block-builders.ts). Tags each touched
// entity with an internal "applied" marker so subsequent ticks skip
// it; queries cells with GridOccupant.layer in { "wall", "block" } and
// reads GridPosition for the (gx, gz) seed input.
//
// Why a system instead of a scene-rewrite hook:
//   - Scene JSON is shared between prefabs + instances; rewriting at
//     prefab-expand time would lock the variant choice into the
//     command log (network-replay sensitive) instead of leaving it as
//     a renderer-only concern.
//   - Round restart re-spawns the same entity ids — the system simply
//     re-runs and re-applies the variant assignment.
//   - The system stays trivial (no transient events, no allocations
//     per frame once everything is tagged) so the per-tick cost on
//     the static profile is a few hundred entity-id lookups.

import type { ComponentName, EntityId } from "../../../../engine/core/ecs/types";
import type { QueryHandle, World } from "../../../../engine/core/ecs/world";
import type { System, SystemContext } from "../../../../engine/core/systems/types";
import { encodeBlockSeed } from "../blocks/per-cell-variant-selector";
import {
  HARD_BLOCK_MESH_KEY,
  SOFT_BLOCK_MESH_KEY
} from "../register-block-builders";

const GRID_OCCUPANT: ComponentName = "GridOccupant";
const GRID_POSITION: ComponentName = "GridPosition";
const MESH_RENDERER: ComponentName = "MeshRenderer";

type GridOccupantComponent = { layer?: string };
type GridPositionComponent = { gx?: number; gz?: number };
type MeshRendererComponent = { mesh?: string; color?: string };

export type KaboomBlockVariantSystemOptions = {
  name?: string;
  /** Scene-seed feeding selectVariantIndex. Default `"kaboom-crew"`. */
  sceneSeed?: string;
};

export function createKaboomBlockVariantSystem(
  options: KaboomBlockVariantSystemOptions = {}
): System {
  const name = options.name ?? "kaboom.block-variant";
  const sceneSeed = options.sceneSeed ?? "kaboom-crew";

  // Per-world memo — id -> applied seed. We re-run when the scene id
  // changes (round restart drops the world reference) OR when an
  // entity's GridPosition changes (the block was moved, unlikely in
  // Kaboom but cheap to support).
  const applied = new Map<EntityId, string>();
  let cachedWorld: World | undefined;
  let cellQuery: QueryHandle | undefined;

  const fixedUpdate = (context: SystemContext): void => {
    const world = context.world;
    if (world !== cachedWorld) {
      cellQuery = world.createQuery([GRID_OCCUPANT, GRID_POSITION, MESH_RENDERER]);
      cachedWorld = world;
      applied.clear();
    }
    for (const id of cellQuery!.run()) {
      const occ = world.getComponent<GridOccupantComponent>(id, GRID_OCCUPANT);
      const layer = occ?.layer;
      const meshKey = layer === "wall"
        ? HARD_BLOCK_MESH_KEY
        : layer === "block"
          ? SOFT_BLOCK_MESH_KEY
          : undefined;
      if (meshKey === undefined) continue;
      const pos = world.getComponent<GridPositionComponent>(id, GRID_POSITION);
      const gx = pos?.gx;
      const gz = pos?.gz;
      if (gx === undefined || gz === undefined) continue;
      const seed = encodeBlockSeed(gx, gz, sceneSeed);
      const expected = `procedural:${meshKey}#${seed}`;
      const prev = applied.get(id);
      if (prev === expected) continue;
      const mr = world.getComponent<MeshRendererComponent>(id, MESH_RENDERER) ?? {};
      if (mr.mesh === expected) {
        applied.set(id, expected);
        continue;
      }
      // Preserve the prefab's `color` so per-vertex tints layer on top
      // of the base material (the renderer multiplies vertex colour ×
      // material.color when vertexColors=true).
      const next: MeshRendererComponent = { ...mr, mesh: expected };
      world.setComponent(id, MESH_RENDERER, next);
      applied.set(id, expected);
    }
    // Prune entities that have been destroyed (blast-cleared soft
    // blocks) so the map doesn't leak across rounds.
    for (const id of [...applied.keys()]) {
      if (!world.hasEntity(id)) applied.delete(id);
    }
  };

  return { name, fixedUpdate };
}
