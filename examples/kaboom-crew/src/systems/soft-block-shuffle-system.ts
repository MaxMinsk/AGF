// S261 KABOOM-RANDOM-LAYOUT (GDP-2026-06-02-006).
//
// At the start of every round, re-distribute the arena's soft blocks
// to a fresh seeded layout. Soft blocks stay at the same COUNT as the
// scene authored (so density characteristics survive); only their
// positions reroll. The hard-block skeleton + spawn corners stay
// fixed, which preserves the arena's silhouette.
//
// Opt-in via `?randomLayout=on` at bootstrap (off by default — the
// authored layouts in scenes/*.scene.json are the canonical starting
// point and many users will prefer the curated experience).
//
// Cell selection rules:
//   1) In-bounds within the Grid.
//   2) Cell does NOT carry a non-soft GridOccupant (skip hard walls).
//   3) Cell isn't within `spawnExclusionRadius` cells of any bomber's
//      authored spawn cell (read on round-start, before the bombers
//      move). Default exclusion = 2 cells so each bomber has its
//      starting L-shaped escape route.
//   4) Cell isn't the bomber's spawn cell itself.
//
// Deterministic per (roundNumber, scene seed) — replays land on the
// same layout when the URL seed matches.

import type { ComponentName, EntityId } from "../../../../engine/core/ecs/types";
import type { System, SystemContext } from "../../../../engine/core/systems/types";
import type { World } from "../../../../engine/core/ecs/world";
import { createSeededRng } from "../../../../engine/core/util/seeded-rng";
import type { GridConfig } from "../../../../engine/core/grid";
import { isInBounds } from "../../../../engine/core/grid";

const GRID: ComponentName = "Grid";
const GRID_POSITION: ComponentName = "GridPosition";
const TRANSFORM: ComponentName = "Transform";
const GRID_OCCUPANT: ComponentName = "GridOccupant";
const ROUND_STATE: ComponentName = "RoundState";
const BOMBER_STATS: ComponentName = "BomberStats";

const ROUND_STATE_ID = "kaboom.round-state";

const DEFAULT_EXCLUSION_RADIUS = 2;

export type SoftBlockShuffleOptions = {
  /** Master toggle. When false the system is a no-op. */
  enabled: boolean;
  /** Mixed into the per-round RNG seed for layout determinism. */
  sceneSeed?: number;
  /** Spawn-area protection. Default 2 cells. */
  spawnExclusionRadius?: number;
  /** Name override for the scheduler. */
  name?: string;
};

type GridPos = { gx?: number; gz?: number };

/** Pure helper — pick N cells from the passable pool deterministically.
 *  Exported so unit tests can drive it without spinning the system. */
export function pickShuffledSoftBlockCells(
  passable: ReadonlyArray<{ gx: number; gz: number }>,
  count: number,
  seed: number
): Array<{ gx: number; gz: number }> {
  if (passable.length === 0 || count <= 0) return [];
  const pool = passable.map((p) => ({ gx: p.gx, gz: p.gz }));
  const rng = createSeededRng(seed);
  // Fisher–Yates shuffle, capped at the first `count` elements.
  const limit = Math.min(count, pool.length);
  for (let i = pool.length - 1; i > pool.length - 1 - limit && i > 0; i -= 1) {
    const j = Math.floor(rng.next() * (i + 1));
    const a = pool[i]!;
    const b = pool[j]!;
    pool[i] = b;
    pool[j] = a;
  }
  return pool.slice(pool.length - limit).map((p) => ({ gx: p.gx, gz: p.gz }));
}

/** Pure helper — collect cells that aren't hard walls and aren't
 *  within `radius` of any bomber's spawn cell. Used by both the
 *  shuffle system and its unit tests. */
export function collectPassableCells(
  grid: GridConfig,
  hardCells: ReadonlySet<string>,
  spawnCells: ReadonlyArray<{ gx: number; gz: number }>,
  radius: number
): Array<{ gx: number; gz: number }> {
  const out: Array<{ gx: number; gz: number }> = [];
  for (let gz = 0; gz < grid.sizeZ; gz += 1) {
    for (let gx = 0; gx < grid.sizeX; gx += 1) {
      if (!isInBounds(grid, gx, gz)) continue;
      if (hardCells.has(`${gx},${gz}`)) continue;
      // Chebyshev distance: gives bombers a clean L-shaped exit
      // corner. Manhattan would also work but only excludes the
      // 4 cardinals, leaving (1,1) etc as a soft-block slot that
      // could trap the bomber against a corner.
      let nearSpawn = false;
      for (const sp of spawnCells) {
        if (Math.max(Math.abs(sp.gx - gx), Math.abs(sp.gz - gz)) <= radius) {
          nearSpawn = true;
          break;
        }
      }
      if (nearSpawn) continue;
      out.push({ gx, gz });
    }
  }
  return out;
}

export function createKaboomSoftBlockShuffleSystem(options: SoftBlockShuffleOptions): System {
  const name = options.name ?? "kaboom.soft-block-shuffle";
  const enabled = options.enabled;
  const sceneSeed = options.sceneSeed ?? 0;
  const exclusionRadius = options.spawnExclusionRadius ?? DEFAULT_EXCLUSION_RADIUS;

  // (world, lastShuffledRound) cache. The world ref-equality reset
  // mirrors every other kaboom system: when scene.load swaps the world,
  // the cache clears so the first new round triggers a shuffle again.
  let cachedWorld: World | undefined;
  let lastShuffledRound: number | undefined;

  const fixedUpdate = (context: SystemContext): void => {
    if (!enabled) return;
    const world = context.world;
    if (world !== cachedWorld) {
      cachedWorld = world;
      lastShuffledRound = undefined;
    }
    if (!world.hasEntity(ROUND_STATE_ID)) return;
    const round = world.getComponent<{ roundNumber?: number; phase?: string }>(ROUND_STATE_ID, ROUND_STATE);
    if (round?.phase !== "playing") return;
    const roundNumber = round.roundNumber ?? 1;
    if (lastShuffledRound === roundNumber) return;
    lastShuffledRound = roundNumber;
    shuffleSoftBlocks(world, roundNumber, sceneSeed, exclusionRadius);
  };

  return { name, fixedUpdate };
}

function shuffleSoftBlocks(
  world: World,
  roundNumber: number,
  sceneSeed: number,
  exclusionRadius: number
): void {
  // 1. Locate Grid singleton.
  let grid: GridConfig | undefined;
  for (const id of world.entityIds()) {
    if (world.hasComponent(id, GRID)) {
      grid = world.getComponent<GridConfig>(id, GRID);
      break;
    }
  }
  if (grid === undefined) return;

  // 2. Snapshot existing soft blocks (id-prefix scan; mirrors scene
  //    authoring `soft-block.N`).
  const softBlocks: EntityId[] = [];
  const hardCells = new Set<string>();
  for (const id of world.entityIds()) {
    if (id.startsWith("soft-block.")) {
      softBlocks.push(id);
      continue;
    }
    if (!world.hasComponent(id, GRID_OCCUPANT)) continue;
    const occ = world.getComponent<{ blocksMovement?: boolean; blocksBlast?: boolean }>(id, GRID_OCCUPANT);
    // Hard walls (blocks both layers). Soft blocks have blocksBlast=false.
    if (occ?.blocksMovement === true && occ?.blocksBlast === true) {
      const gp = world.getComponent<GridPos>(id, GRID_POSITION);
      if (gp?.gx !== undefined && gp.gz !== undefined) hardCells.add(`${gp.gx},${gp.gz}`);
    }
  }
  if (softBlocks.length === 0) return;

  // 3. Collect bomber spawn cells (their current positions on
  //    round-start = authored spawn corners).
  const spawnCells: Array<{ gx: number; gz: number }> = [];
  for (const id of world.entityIds()) {
    if (!world.hasComponent(id, BOMBER_STATS)) continue;
    const stats = world.getComponent<{ alive?: boolean }>(id, BOMBER_STATS);
    if (stats?.alive === false) continue; // already-dead bombers don't reserve a corner
    const gp = world.getComponent<GridPos>(id, GRID_POSITION);
    if (gp?.gx === undefined || gp.gz === undefined) continue;
    spawnCells.push({ gx: gp.gx, gz: gp.gz });
  }

  // 4. Build the candidate pool + pick N cells.
  const passable = collectPassableCells(grid, hardCells, spawnCells, exclusionRadius);
  const seed = roundNumber * 1000003 + sceneSeed * 1009 + 0xCAFE;
  const picked = pickShuffledSoftBlockCells(passable, softBlocks.length, seed);
  if (picked.length === 0) return;

  // 5. Reposition each soft block to a picked cell. Stamps the new
  //    GridPosition + Transform.position so the GridOccupancy index
  //    refreshes next tick and the Wang resolver re-stamps the
  //    variant in the following frame.
  for (let i = 0; i < softBlocks.length; i += 1) {
    const id = softBlocks[i]!;
    const target = picked[i];
    if (target === undefined) {
      // Shouldn't fire on healthy arenas; passable.length usually >> softBlocks.length.
      // Defensive: remove the leftover so the count drops gracefully.
      world.removeEntity(id);
      continue;
    }
    world.setComponent(id, GRID_POSITION, { gx: target.gx, gz: target.gz });
    const transform = world.getComponent<{ position?: ReadonlyArray<number>; rotation?: ReadonlyArray<number>; scale?: ReadonlyArray<number> }>(id, TRANSFORM);
    const yOld = transform?.position?.[1] ?? 0.5;
    world.setComponent(id, TRANSFORM, {
      ...(transform ?? {}),
      position: [target.gx, yOld, target.gz]
    });
  }
}
