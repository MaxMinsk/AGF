// S139 — small idempotent-upsert helpers for the kaboom-crew bootstrap.
//
// The HMR replay path re-runs attachUi against a live world that
// already contains the singletons created on the prior attach. The
// previous code emitted `entity.create` commands unconditionally,
// which throws on duplicate ids. These helpers split the command
// stream:
//   - new entity → emit entity.create with all components.
//   - existing entity → emit one component.set per component.
//
// Result: attachUi can be called any number of times against the same
// runtime without losing the singleton's surviving runtime state but
// also without throwing on the second pass.

import type { EngineCommand } from "../../../engine/core/commands/types";
import type { SceneInput } from "../../../engine/core/ecs/types";
import type { World } from "../../../engine/core/ecs/world";
import { readHeightFromValues } from "../../../engine/grid/height-query";

/**
 * Build an idempotent set of commands that creates the entity if it
 * doesn't already exist, or updates each component in place if it
 * does. Pure — takes only the world, entityId, and components map.
 */
export function upsertEntityCommands(
  world: World,
  entityId: string,
  components: Record<string, unknown>
): EngineCommand[] {
  if (!world.hasEntity(entityId)) {
    return [
      {
        kind: "entity.create",
        entityId,
        components
      } as EngineCommand
    ];
  }
  const out: EngineCommand[] = [];
  for (const [component, data] of Object.entries(components)) {
    out.push({
      kind: "component.set",
      entityId,
      component,
      data
    } as EngineCommand);
  }
  return out;
}

/**
 * S173 GDP-2026-05-28-010 — apply a scene's optional `heightmap`
 * top-level field as runtime commands:
 *
 *   1. write the Heightmap component on the grid-config entity (the
 *      first entity with a Grid component — typically `grid.config`),
 *      so engine/grid/height-query can read it;
 *   2. lift the authored Transform.y of any expanded entity whose
 *      cell sits above height 0 — so bombers / blocks / pickups
 *      authored at Y ~ 0.4..0.5 visually sit on top of their cell.
 *
 * The function is a pure command builder — it does not consult the
 * runtime world. Callers (bootstrap initial + restart paths) chain the
 * returned commands after `scene.load` so the heightmap lands on the
 * grid entity in the same applyCommands batch.
 *
 * Returns an empty array when the scene has no heightmap so flat
 * arenas pay zero overhead.
 */
export function applyHeightmapCommands(scene: SceneInput): EngineCommand[] {
  const heightmap = scene.heightmap;
  if (heightmap === undefined || heightmap.length === 0) return [];

  // Locate the grid-config entity — first entity with a Grid component.
  // Kaboom Crew scenes use id "grid.config" but the lookup is generic.
  let gridEntityId: string | undefined;
  for (const entity of scene.entities) {
    if ("Grid" in entity.components) {
      gridEntityId = entity.id;
      break;
    }
  }
  if (gridEntityId === undefined) return [];

  const commands: EngineCommand[] = [
    {
      kind: "component.set",
      entityId: gridEntityId,
      component: "Heightmap",
      data: { values: heightmap as unknown as number[][] }
    }
  ];

  // Lift Transform.y for every expanded entity whose GridPosition sits
  // on a non-zero cell. We use the entity's authored GridPosition rather
  // than worldToGrid(Transform.position) because scenes that ship a
  // heightmap reliably author both. Soft- / hard-block prefabs author
  // Transform.position[1] at 0.45 / 0.5 — lifting just the root keeps
  // child meshes correct (children parent to root via Transform.parent).
  for (const entity of scene.entities) {
    const components = entity.components as Record<string, unknown>;
    const gridPos = components["GridPosition"] as { gx?: number; gz?: number } | undefined;
    if (gridPos === undefined || typeof gridPos.gx !== "number" || typeof gridPos.gz !== "number") continue;
    const cellHeight = readHeightFromValues(heightmap, gridPos.gx, gridPos.gz);
    if (cellHeight === 0) continue;
    const transform = components["Transform"] as
      | { position?: ReadonlyArray<number>; rotation?: ReadonlyArray<number>; scale?: ReadonlyArray<number>; parent?: string }
      | undefined;
    if (transform === undefined || transform.position === undefined) continue;
    const [tx, ty, tz] = transform.position;
    // Child entities parented to another root inherit Y from the
    // parent; lifting them would double-lift. Skip any entity with a
    // Transform.parent — the parent gets lifted instead.
    if (typeof transform.parent === "string" && transform.parent.length > 0) continue;
    commands.push({
      kind: "component.set",
      entityId: entity.id,
      component: "Transform",
      data: { ...transform, position: [tx, (ty ?? 0) + cellHeight, tz] }
    });
  }

  return commands;
}
