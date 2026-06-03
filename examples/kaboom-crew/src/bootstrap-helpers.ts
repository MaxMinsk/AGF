// S139 — small idempotent-upsert helpers for the kaboom-crew bootstrap.
// S176 — extended with applyTerrainmapCommands for grass floor-overlay
// per-cell entity spawn at scene-load (GDP-2026-05-28-012).
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
import {
  ARENA_THEMES,
  type ArenaThemeKey,
  isArenaThemeKey
} from "./themes/theme-table";

/** S176 + S271 + S272 — terrain family identifier (must match scene-extensions.schema.json). */
export type FloorTerrainFamily = "floor" | "grass" | "path" | "stone" | "dirt";

/** S176 — the family name treated as the no-overlay default. Cells of
 *  this family get no per-cell entity (the scene's stretched-box floor
 *  renders them). */
export const DEFAULT_TERRAIN_FAMILY: FloorTerrainFamily = "floor";

/** Wang family name strings — mirror the registrations in
 *  `./blocks/register-wang-families.ts` but live here too to keep the
 *  helper free of cyclic imports. */
const GRASS_WANG_FAMILY_NAME = "kaboom-grass";
const PATH_WANG_FAMILY_NAME = "kaboom-path";
const STONE_WANG_FAMILY_NAME = "kaboom-stone";
const DIRT_WANG_FAMILY_NAME = "kaboom-dirt";

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
export function applyHeightmapCommands(scene: SceneInput, themeKey?: ArenaThemeKey | string): EngineCommand[] {
  const resolvedTheme: ArenaThemeKey = isArenaThemeKey(themeKey) ? themeKey : "warehouse";
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

  // S177 KABOOM-HEIGHTMAP-VISUALS + S179 — spawn a per-cell pillar box
  // for every heightmap cell with height > 0. Without this, raised
  // cells are invisible (gameplay rules still work — bombers can't
  // step delta>1 — but the user can't see WHERE the steps are).
  // Color brightens with height so the user reads a gradient (H=1 →
  // lighter, H=2+ → lightest).
  for (let gz = 0; gz < heightmap.length; gz += 1) {
    const row = heightmap[gz];
    if (row === undefined) continue;
    for (let gx = 0; gx < row.length; gx += 1) {
      const h = row[gx] ?? 0;
      if (h <= 0) continue;
      const pillarId = `heightmap.pillar.${gx}.${gz}`;
      commands.push({
        kind: "entity.create",
        entityId: pillarId,
        components: {
          Transform: {
            position: [gx, h / 2 - 0.025, gz],
            rotation: [0, 0, 0],
            scale: [0.96, h + 0.05, 0.96]
          },
          MeshRenderer: { mesh: "box", color: colorForHeight(h, resolvedTheme) }
        }
      } as EngineCommand);
    }
  }

  // Lift Transform.y for every expanded entity whose GridPosition sits
  // on a non-zero cell. We use the entity's authored GridPosition rather
  // than worldToGrid(Transform.position) because scenes that ship a
  // heightmap reliably author both. Soft- / hard-block prefabs author
  // Transform.position[1] at 0.45 / 0.5 — lifting just the root keeps
  // child meshes correct (children parent to root via Transform.parent).
  //
  // S179 — heightmap-only lift. Ramps are gone; the heightmap encodes
  // stepped terrain directly. Every entity authored on a cell with
  // height > 0 gets lifted by that height.
  for (const entity of scene.entities) {
    const components = entity.components as Record<string, unknown>;
    const gridPos = components["GridPosition"] as { gx?: number; gz?: number } | undefined;
    if (gridPos === undefined || typeof gridPos.gx !== "number" || typeof gridPos.gz !== "number") continue;
    const liftHeight = readHeightFromValues(heightmap, gridPos.gx, gridPos.gz);
    if (liftHeight === 0) continue;
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
      data: { ...transform, position: [tx, (ty ?? 0) + liftHeight, tz] }
    });
  }

  return commands;
}

/**
 * S176 KABOOM-FLOOR-WANG-TILES MVP (GDP-2026-05-28-012) — read the
 * scene's optional top-level `terrainmap?: string[][]` field and emit
 * `entity.create` commands for per-cell floor-overlay entities at
 * cells whose family is NOT the default ('floor').
 *
 * Outer index is gz, inner is gx. Cells with the default family value
 * (`DEFAULT_TERRAIN_FAMILY` === 'floor') get NO entity — the scene's
 * single stretched-box floor backdrop renders them.
 *
 * For each non-default cell the helper emits an entity carrying:
 *   - GridPosition { gx, gz }
 *   - GridOccupant { layer: 'floor-overlay', blocksMovement: false, blocksBlast: false } — non-blocking
 *   - Transform { position: [gx, 0.02, gz], rotation, scale } — flush above the backdrop
 *   - MeshRenderer { mesh: 'box', color: '#ffffff' } — placeholder; the block-variant-system
 *     stamps WangTile + WangTileFamilyMember, the engine resolver writes a variant index,
 *     and the kaboom-side mesh-sync bridge rewrites this mesh ref to
 *     `procedural:kaboom-grass-{0..3}` once the bitmask resolves
 *   - FloorTerrain { family }
 *   - WangTile + WangTileFamilyMember { familyName: 'kaboom-grass' } — pre-stamped here
 *     so the resolver picks the cells up on its very first sweep
 *
 * Heightmap lift applies via the existing `applyHeightmapCommands`
 * pipeline (called separately). Terrain overlay cells on raised
 * heightmap cells get lifted automatically because they carry
 * GridPosition + Transform.
 *
 * Returns an empty array when the scene has no `terrainmap` so flat
 * arenas pay zero overhead. v1 only knows about the 'grass' family;
 * unknown family strings are skipped with no diagnostic (the caller's
 * schema validation is the source of truth).
 */
export function applyTerrainmapCommands(scene: SceneInput): EngineCommand[] {
  const terrainmap = scene.terrainmap;
  if (terrainmap === undefined || terrainmap.length === 0) return [];

  const commands: EngineCommand[] = [];
  for (let gz = 0; gz < terrainmap.length; gz += 1) {
    const row = terrainmap[gz];
    if (row === undefined) continue;
    for (let gx = 0; gx < row.length; gx += 1) {
      const family = row[gx];
      if (family === undefined) continue;
      if (family === DEFAULT_TERRAIN_FAMILY) continue;
      const wangFamilyName = wangFamilyFor(family as FloorTerrainFamily);
      if (wangFamilyName === undefined) continue; // unknown family — skip silently.
      const entityId = `terrain.${gx}.${gz}`;
      commands.push({
        kind: "entity.create",
        entityId,
        components: {
          GridPosition: { gx, gz },
          GridOccupant: {
            layer: "floor-overlay",
            blocksMovement: false,
            blocksBlast: false
          },
          Transform: {
            position: [gx, 0.02, gz],
            rotation: [0, 0, 0],
            scale: [1, 1, 1]
          },
          MeshRenderer: {
            // Placeholder — kaboom mesh-sync rewrites this once the
            // Wang resolver writes `currentVariantIndex`. Using the
            // 'box' built-in keeps the renderer happy in the gap.
            mesh: "box",
            color: "#ffffff"
          },
          FloorTerrain: { family },
          WangTile: { familyName: wangFamilyName },
          WangTileFamilyMember: { familyName: wangFamilyName }
        }
      } as EngineCommand);
    }
  }
  return commands;
}

function wangFamilyFor(family: FloorTerrainFamily): string | undefined {
  if (family === "grass") return GRASS_WANG_FAMILY_NAME;
  if (family === "path") return PATH_WANG_FAMILY_NAME;
  if (family === "stone") return STONE_WANG_FAMILY_NAME;
  if (family === "dirt") return DIRT_WANG_FAMILY_NAME;
  // 'floor' has no overlay entity; anything else is unknown.
  return undefined;
}

/** S177 + S188 — gradient for heightmap pillar colour. H=0 → arena's
 *  floor primary; higher steps lerp toward the active theme's hard-
 *  block primary so pillars read as raised pieces of the same arena
 *  material instead of a generic slate gradient. Clamp at H=4. */
function colorForHeight(height: number, themeKey: ArenaThemeKey): string {
  const theme = ARENA_THEMES[themeKey];
  const lowHex = theme.floorPrimaryHex;
  const highHex = theme.hardBlockPalette.primary;
  const clamped = Math.max(0, Math.min(4, height));
  const t = clamped / 4;
  const low = parseHexRgb(lowHex);
  const high = parseHexRgb(highHex);
  const lerp = (a: number, b: number): number => Math.round(a + (b - a) * t);
  const r = lerp(low.r, high.r);
  const g = lerp(low.g, high.g);
  const b = lerp(low.b, high.b);
  return "#" + r.toString(16).padStart(2, "0") + g.toString(16).padStart(2, "0") + b.toString(16).padStart(2, "0");
}

function parseHexRgb(hex: string): { r: number; g: number; b: number } {
  const trimmed = hex.startsWith("#") ? hex.slice(1) : hex;
  return {
    r: Number.parseInt(trimmed.slice(0, 2), 16),
    g: Number.parseInt(trimmed.slice(2, 4), 16),
    b: Number.parseInt(trimmed.slice(4, 6), 16)
  };
}
