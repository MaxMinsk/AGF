// S118 KABOOM-MP-SPRINT-B chunk 2 — server-side map loader.
//
// Reads examples/kaboom-crew/scenes/start.scene.json from disk and
// builds a sparse 2D grid of obstacle cells: 'hard-wall' from
// hard-block instances, 'soft-block' from soft-block instances.
// Empty cells are absent from the map (cellAt returns 'empty').
//
// Soft-blocks are mutable: destroySoftBlock(gx, gz) removes the cell
// so cellAt() returns 'empty' afterward. Hard-walls are immutable
// for the lifetime of the server's world.
//
// Why fs.readFileSync instead of an ESM JSON import: the server is a
// Node process under tsx; JSON imports work but they require either
// `with { type: "json" }` (Node 22+) or a vite plugin (which the
// server doesn't run). readFileSync sidesteps the toolchain question.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type CellType = "empty" | "hard-wall" | "soft-block";

export type GridSize = {
  sizeX: number;
  sizeZ: number;
};

type SceneInstance = {
  prefab?: string;
  overrides?: {
    GridPosition?: { gx?: number; gz?: number };
  };
};

type SceneEntity = {
  id?: string;
  components?: {
    Grid?: { sizeX?: number; sizeZ?: number };
  };
};

type Scene = {
  entities?: SceneEntity[];
  instances?: SceneInstance[];
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DEFAULT_SCENE_PATH = resolve(
  __dirname,
  "../../../kaboom-crew/scenes/start.scene.json"
);

const DEFAULT_GRID: GridSize = { sizeX: 15, sizeZ: 11 };

export type LoadedMap = {
  gridSize(): GridSize;
  cellAt(gx: number, gz: number): CellType;
  /** Returns true when the cell was a soft-block and is now empty. */
  destroySoftBlock(gx: number, gz: number): boolean;
  /** Snapshot of all currently-occupied cells. Useful for tests + debugging. */
  cells(): ReadonlyMap<string, "hard-wall" | "soft-block">;
};

/**
 * Build a LoadedMap from a parsed scene. Exported separately so unit
 * tests can hand-roll synthetic scenes without touching the filesystem.
 */
export function loadMapFromScene(scene: Scene): LoadedMap {
  const gridEntity = scene.entities?.find((e) => e.id === "grid.config");
  const grid = gridEntity?.components?.Grid;
  const sizeX = grid?.sizeX ?? DEFAULT_GRID.sizeX;
  const sizeZ = grid?.sizeZ ?? DEFAULT_GRID.sizeZ;

  const cells = new Map<string, "hard-wall" | "soft-block">();
  for (const inst of scene.instances ?? []) {
    const prefab = inst.prefab;
    if (prefab !== "hard-block" && prefab !== "soft-block") continue;
    const gp = inst.overrides?.GridPosition;
    if (gp?.gx === undefined || gp?.gz === undefined) continue;
    cells.set(cellKey(gp.gx, gp.gz), prefab === "hard-block" ? "hard-wall" : "soft-block");
  }

  return {
    gridSize(): GridSize {
      return { sizeX, sizeZ };
    },
    cellAt(gx, gz): CellType {
      // Out-of-bounds reads as hard-wall — blast propagation stops at
      // the arena edge without needing a separate border check.
      if (gx < 0 || gz < 0 || gx >= sizeX || gz >= sizeZ) return "hard-wall";
      return cells.get(cellKey(gx, gz)) ?? "empty";
    },
    destroySoftBlock(gx, gz): boolean {
      const k = cellKey(gx, gz);
      if (cells.get(k) !== "soft-block") return false;
      cells.delete(k);
      return true;
    },
    cells(): ReadonlyMap<string, "hard-wall" | "soft-block"> {
      return cells;
    }
  };
}

/**
 * Load the default Kaboom Crew start scene from disk. Reads the same
 * JSON the browser client imports, so the map stays in sync without
 * a duplicate copy.
 */
export function loadDefaultMap(scenePath: string = DEFAULT_SCENE_PATH): LoadedMap {
  const raw = readFileSync(scenePath, "utf8");
  const scene = JSON.parse(raw) as Scene;
  return loadMapFromScene(scene);
}

function cellKey(gx: number, gz: number): string {
  return `${gx},${gz}`;
}

/**
 * S118 KABOOM-MP-SPRINT-B chunk 2 — pure blast-cell walker.
 *
 * Walks the four cardinal directions from (originGx, originGz) up to
 * `range` cells. For each step:
 *   - 'hard-wall'  → stop (do NOT include the wall cell).
 *   - 'soft-block' → include the cell, then stop.
 *   - 'empty'      → include + continue.
 *
 * The origin cell is always included. Returns the cells in a stable
 * order: origin first, then +X, -X, +Z, -Z (each direction in
 * increasing distance). Pure — no side effects on the map.
 */
export function computeBlastCells(
  map: LoadedMap,
  originGx: number,
  originGz: number,
  range: number
): Array<{ gx: number; gz: number }> {
  const out: Array<{ gx: number; gz: number }> = [{ gx: originGx, gz: originGz }];
  const directions: Array<readonly [number, number]> = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1]
  ];
  for (const [dx, dz] of directions) {
    for (let step = 1; step <= range; step += 1) {
      const gx = originGx + dx * step;
      const gz = originGz + dz * step;
      const cell = map.cellAt(gx, gz);
      if (cell === "hard-wall") break;
      out.push({ gx, gz });
      if (cell === "soft-block") break;
    }
  }
  return out;
}
