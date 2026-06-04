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
const FLOOR_WANG_FAMILY_NAME = "kaboom-floor";
const WALL_SHADOW_WANG_FAMILY_NAME = "kaboom-wall-shadow";
const HARD_BLOCK_WANG_FAMILY_NAME = "kaboom-hard-block";

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
/** S294 — an occluder counts as TALL (eligible to cast the hidden-bomber
 *  silhouette) when the top of its mesh is at least this many cells above the
 *  floor. A lone 1-tall block (top ≈ 1) does NOT qualify; a 2-tall pillar or a
 *  block on a raised cell (top ≥ 2) does. Single tunable constant. */
export const TALL_OCCLUDER_THRESHOLD = 2.0;

/** S294 — true when a mesh whose top sits at world-Y `topY` is tall enough to
 *  hide a standing bomber from the angled camera (inclusive of the threshold). */
export function isTallOccluder(topY: number): boolean {
  return topY >= TALL_OCCLUDER_THRESHOLD;
}

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
      // S294 — a pillar's top Y ≈ h. Tag it as an outline-occluder surface
      // when it's TALL enough (≥ TALL_OCCLUDER_THRESHOLD) to genuinely hide a
      // standing bomber, so the x-ray silhouette only fires behind real cover.
      const pillarComponents: Record<string, unknown> = {
        Transform: {
          position: [gx, h / 2 - 0.025, gz],
          rotation: [0, 0, 0],
          scale: [0.96, h + 0.05, 0.96]
        },
        MeshRenderer: { mesh: "box", color: colorForHeight(h, resolvedTheme) }
      };
      if (isTallOccluder(h)) pillarComponents["OutlineOccluderSurface"] = {};
      commands.push({
        kind: "entity.create",
        entityId: pillarId,
        components: pillarComponents
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
    // S294 — a ~1-tall block lifted onto a raised cell has top Y ≈
    // liftHeight + 1; tag it as a tall occluder when that clears the
    // threshold so it casts the hidden-bomber silhouette.
    if (isTallOccluder(liftHeight + 1)) {
      commands.push({
        kind: "component.set",
        entityId: entity.id,
        component: "OutlineOccluderSurface",
        data: {}
      } as EngineCommand);
    }
  }

  // S293 — cliff faces on every exposed vertical edge between height-differing
  // cells (replaces the bare pillar-box sides with curved-outline terraces).
  commands.push(...emitCliffFaceCommands(scene, heightmap));

  return commands;
}

/**
 * S293 (GDP-2026-06-04-001) — emit cliff-face + corner-cap entities for every
 * exposed vertical edge in the heightmap. Cliffs are static per scene, so we
 * resolve the Wang left/right variant once here at scene-load (no runtime
 * resolver), mirroring how floor overlays + pillars are emitted.
 */
function emitCliffFaceCommands(
  scene: SceneInput,
  heightmap: ReadonlyArray<ReadonlyArray<number>>
): EngineCommand[] {
  const commands: EngineCommand[] = [];
  const terrainmap = scene.terrainmap;
  const h = (gx: number, gz: number): number => readHeightFromValues(heightmap, gx, gz);
  const biomeAt = (gx: number, gz: number): "cliff-grass" | "cliff-stone" => {
    const fam = terrainmap?.[gz]?.[gx];
    return fam === "grass" ? "cliff-grass" : "cliff-stone";
  };
  // direction → outward delta toward the LOWER cell + the Y rotation (deg).
  // The face mesh is built with its visible front toward LOCAL +Z; rotation
  // turns +Z to point at the lower cell: N(lower -Z)=180, E(+X)=90, S(+Z)=0,
  // W(-X)=270. `idx` seeds the sub-variant hash (rot alone is always even).
  const DIRS = [
    { key: "N", idx: 0, odx: 0, odz: -1, rot: 180, px: 0,    pz: -0.5 },
    { key: "E", idx: 1, odx: 1, odz: 0,  rot: 90,  px: 0.5,  pz: 0 },
    { key: "S", idx: 2, odx: 0, odz: 1,  rot: 0,   px: 0,    pz: 0.5 },
    { key: "W", idx: 3, odx: -1, odz: 0, rot: 270, px: -0.5, pz: 0 }
  ] as const;
  // Per-direction LEFT/RIGHT strip steps (outward-facing perspective, §A3).
  const STRIP: Record<string, { lx: number; lz: number; rx: number; rz: number }> = {
    N: { lx: -1, lz: 0, rx: 1, rz: 0 },
    E: { lx: 0, lz: -1, rx: 0, rz: 1 },
    S: { lx: 1, lz: 0, rx: -1, rz: 0 },
    W: { lx: 0, lz: 1, rx: 0, rz: -1 }
  };

  /** Does cell (gx,gz) expose a cliff face toward `dir` (taller than that neighbour)? */
  const faces = (gx: number, gz: number, d: typeof DIRS[number]): boolean =>
    h(gx, gz) > h(gx + d.odx, gz + d.odz);

  for (let gz = 0; gz < heightmap.length; gz += 1) {
    const row = heightmap[gz];
    if (row === undefined) continue;
    for (let gx = 0; gx < row.length; gx += 1) {
      const cellH = h(gx, gz);
      if (cellH <= 0) continue;
      const biome = biomeAt(gx, gz);
      for (const d of DIRS) {
        if (!faces(gx, gz, d)) continue;
        const delta = cellH - h(gx + d.odx, gz + d.odz);
        if (delta <= 0) continue;
        const midY = h(gx + d.odx, gz + d.odz) + delta / 2;
        const strip = STRIP[d.key]!;
        const leftPresent = faces(gx + strip.lx, gz + strip.lz, d);
        const rightPresent = faces(gx + strip.rx, gz + strip.rz, d);
        const variant = (leftPresent ? 0b01 : 0) | (rightPresent ? 0b10 : 0);
        const sub = ((gx * 31 + gz * 7 + d.idx) % 2 + 2) % 2;
        commands.push({
          kind: "entity.create",
          entityId: `cliff.${gx}.${gz}.${d.key}`,
          components: {
            Transform: {
              position: [gx + d.px, midY, gz + d.pz],
              rotation: [0, d.rot, 0],
              scale: [1, 1, 1]
            },
            MeshRenderer: { mesh: `procedural:kaboom-${biome}-${variant}-${sub}#${delta}`, color: "#ffffff" }
          }
        } as EngineCommand);
      }
      // Corner caps: where two perpendicular faces meet at a cell corner.
      const cornerPairs = [
        { a: DIRS[0], b: DIRS[1], cx: 0.5, cz: -0.5 },  // N+E → NE
        { a: DIRS[1], b: DIRS[2], cx: 0.5, cz: 0.5 },   // E+S → SE
        { a: DIRS[2], b: DIRS[3], cx: -0.5, cz: 0.5 },  // S+W → SW
        { a: DIRS[3], b: DIRS[0], cx: -0.5, cz: -0.5 }  // W+N → NW
      ];
      for (const cp of cornerPairs) {
        if (!faces(gx, gz, cp.a) || !faces(gx, gz, cp.b)) continue;
        const biome = biomeAt(gx, gz);
        const delta = cellH; // cap spans down to base; visual filler only
        commands.push({
          kind: "entity.create",
          entityId: `cliff.${gx}.${gz}.cap.${cp.cx > 0 ? "E" : "W"}${cp.cz > 0 ? "S" : "N"}`,
          components: {
            Transform: { position: [gx + cp.cx, cellH / 2, gz + cp.cz], rotation: [0, 0, 0], scale: [1, 1, 1] },
            MeshRenderer: { mesh: `procedural:kaboom-${biome}-corner#${delta}`, color: "#ffffff" }
          }
        } as EngineCommand);
      }
    }
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

  // S287 — collect hard-block cell positions from the scene so we can
  // compute wall-shadow bitmasks without the occupancy system.
  const hardBlockCells = collectHardBlockCells(scene);

  const commands: EngineCommand[] = [];
  for (let gz = 0; gz < terrainmap.length; gz += 1) {
    const row = terrainmap[gz];
    if (row === undefined) continue;
    for (let gx = 0; gx < row.length; gx += 1) {
      const family = row[gx];
      if (family === undefined) continue;
      if (family === DEFAULT_TERRAIN_FAMILY) continue;
      const wangFamilyName = wangFamilyFor(family as FloorTerrainFamily);
      if (wangFamilyName === undefined) continue;
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
          MeshRenderer: { mesh: "box", color: "#ffffff" },
          FloorTerrain: { family },
          WangTile: { familyName: wangFamilyName },
          WangTileFamilyMember: { familyName: wangFamilyName }
        }
      } as EngineCommand);

      // S287 — spawn a wall-shadow overlay entity when at least one
      // cardinal neighbor is a hard block (bitmask > 0).
      const shadowMask = computeShadowBitmask(gx, gz, hardBlockCells);
      if (shadowMask > 0) {
        commands.push({
          kind: "entity.create",
          entityId: `terrain-shadow.${gx}.${gz}`,
          components: {
            GridPosition: { gx, gz },
            Transform: {
              position: [gx, 0.03, gz],
              rotation: [0, 0, 0],
              scale: [1, 1, 1]
            },
            MeshRenderer: { mesh: "box", color: "#222222" },
            WangTile: { familyName: WALL_SHADOW_WANG_FAMILY_NAME },
            WangTileFamilyMember: { familyName: HARD_BLOCK_WANG_FAMILY_NAME }
          }
        } as EngineCommand);
      }
    }
  }
  return commands;
}

/** S287 — collect hard-block cell positions from the scene instances. */
function collectHardBlockCells(scene: SceneInput): Set<string> {
  const cells = new Set<string>();
  for (const inst of scene.instances ?? []) {
    if (inst.prefab !== "hard-block") continue;
    const overrides = (inst as { overrides?: Record<string, unknown> }).overrides ?? {};
    const pos = overrides["GridPosition"] as { gx?: number; gz?: number } | undefined;
    if (pos?.gx !== undefined && pos?.gz !== undefined) {
      cells.add(`${pos.gx},${pos.gz}`);
    }
  }
  return cells;
}

/** S287 — compute N/E/S/W hard-block adjacency bitmask for a cell. */
function computeShadowBitmask(gx: number, gz: number, hardCells: Set<string>): number {
  let mask = 0;
  if (hardCells.has(`${gx},${gz - 1}`)) mask |= 0b1000; // N
  if (hardCells.has(`${gx + 1},${gz}`)) mask |= 0b0100; // E
  if (hardCells.has(`${gx},${gz + 1}`)) mask |= 0b0010; // S
  if (hardCells.has(`${gx - 1},${gz}`)) mask |= 0b0001; // W
  return mask;
}

function wangFamilyFor(family: FloorTerrainFamily): string | undefined {
  if (family === "grass") return GRASS_WANG_FAMILY_NAME;
  if (family === "path") return PATH_WANG_FAMILY_NAME;
  if (family === "stone") return STONE_WANG_FAMILY_NAME;
  if (family === "dirt") return DIRT_WANG_FAMILY_NAME;
  // S286 — floor now has its own Wang overlay family.
  if (family === "floor") return FLOOR_WANG_FAMILY_NAME;
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
