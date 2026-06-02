// S226 KABOOM-DEATH-BOMB-DROP (GDP-2026-06-02-001). When a bomber
// dies, automatically spawn ONE bomb on a cardinal cell adjacent to
// the death cell. The bomb is owned by the dead bomber (kill credit
// posthumously), fuses + blasts normally. Simpler replacement for
// the click-to-throw revenge-cart (S211 / S219) — same 1v1
// engagement gap closed without input / UI / protocol cost.
//
// Trigger: BomberStats.alive true → false edge (same pattern as the
// S132 ragdoll trigger + S208 loot drop).
//
// Cell pick:
//   1. Build candidate set = the 4 cardinals of the death cell.
//   2. Drop any cell that's out of grid bounds, hard-blocked, soft-
//      blocked, or already holding a bomb.
//   3. Pick one via seeded RNG keyed on
//      (bomberId, sceneSeed, roundNumber).
//   4. Fallback 1: if 0 candidates left, try the death cell itself
//      — only if it doesn't already hold a bomb.
//   5. Fallback 2: silent skip. Surrounded by hard blocks + live
//      bombs already, the death bomb can't squeeze in.

import type { ComponentName, EntityId } from "../../../../engine/core/ecs/types";
import type { QueryHandle, World } from "../../../../engine/core/ecs/world";
import type { System, SystemContext } from "../../../../engine/core/systems/types";
import type { GridOccupancyQuery } from "../../../../engine/core/systems/grid-occupancy-system";
import { createSeededRng } from "../../../../engine/core/util/seeded-rng";
import { getCellHeight } from "../../../../engine/grid/height-query";

import { BOMB_FINAL_SCALE } from "./bomb-placement-system";

const BOMBER_STATS: ComponentName = "BomberStats";
const GRID_POSITION: ComponentName = "GridPosition";
const BOMB: ComponentName = "Bomb";
const TRANSFORM: ComponentName = "Transform";
const MESH_RENDERER: ComponentName = "MeshRenderer";
const GRID_OCCUPANT: ComponentName = "GridOccupant";
const TWEENS: ComponentName = "Tweens";
const RIGID_BODY_3D: ComponentName = "RigidBody3D";
const COLLIDER_3D: ComponentName = "Collider3D";
const ROUND_STATE: ComponentName = "RoundState";

const ROUND_STATE_ID = "kaboom.round-state";

/** Bomb spawn-pop tween duration (matches bomb-placement S095). */
const SPAWN_POP_DURATION_S = 0.2;
/** Project seed salted into the per-death RNG so the cell pick is
 *  deterministic across runs of the same seed. */
export const DEATH_BOMB_SEED_DEFAULT = 0xd1ea701;
/** Default blast range of the death-drop bomb. Intentionally the
 *  baseline (2) rather than the dead bomber's actual range — keeps
 *  the mechanic predictable + uniform across all deaths. */
export const DEATH_BOMB_RANGE_DEFAULT = 2;
/** Default fuse — same as a normal player-placed bomb. */
export const DEATH_BOMB_FUSE_S_DEFAULT = 2.5;
/** Slight tint so survivors can read 'death bomb' at a glance —
 *  warmer red than the bomber-coloured #1a1a1a baseline. */
const DEATH_BOMB_HEX = "#3a1010";

const DIRECTIONS: ReadonlyArray<{ dx: number; dz: number }> = [
  { dx: 1, dz: 0 },
  { dx: -1, dz: 0 },
  { dx: 0, dz: 1 },
  { dx: 0, dz: -1 }
];

type BomberStatsRead = { alive?: boolean };
type GridPos = { gx: number; gz: number };
type RoundStateRead = { roundNumber?: number };

export type KaboomDeathBombDropOptions = {
  name?: string;
  occupancy: GridOccupancyQuery;
  /** `?deathBomb=off` disables the mechanic entirely. */
  disabled?: boolean;
  /** `?deathBombRange=N` — range of the spawned bomb (1..4). */
  range?: number;
  /** Seeded RNG salt. Combined with bomberId + roundNumber. */
  seed?: number;
  /** Optional id factory — tests use a deterministic counter. */
  nextBombId?: (ownerId: EntityId) => EntityId;
};

/** Deterministic seed for a given (bomberId, roundNumber, seed). */
function deathSeed(bomberId: EntityId, roundNumber: number, projectSeed: number): number {
  let h = projectSeed | 0;
  for (let i = 0; i < bomberId.length; i += 1) {
    h = Math.imul(h ^ bomberId.charCodeAt(i), 0x01000193);
  }
  h = Math.imul(h ^ roundNumber, 0x01000193);
  return (h | 1) >>> 0;
}

/** Pure helper — given the candidate-set predicate and an RNG, pick
 *  the destination cell for the death bomb. Returns undefined when
 *  no valid placement is possible (silent-skip per the GDP).
 *  Exported for unit tests. */
export function pickDeathBombCell(
  deathPos: { gx: number; gz: number },
  isAvailable: (cell: { gx: number; gz: number }) => boolean,
  rng: { next: () => number }
): { gx: number; gz: number } | undefined {
  const candidates: Array<{ gx: number; gz: number }> = [];
  for (const dir of DIRECTIONS) {
    const cell = { gx: deathPos.gx + dir.dx, gz: deathPos.gz + dir.dz };
    if (isAvailable(cell)) candidates.push(cell);
  }
  if (candidates.length > 0) {
    const idx = Math.floor(rng.next() * candidates.length);
    return candidates[Math.min(idx, candidates.length - 1)];
  }
  // Fallback to death cell if it's still placeable (no live bomb).
  if (isAvailable(deathPos)) return deathPos;
  return undefined;
}

export function createKaboomDeathBombDropSystem(
  options: KaboomDeathBombDropOptions
): System {
  const name = options.name ?? "kaboom.death-bomb-drop";
  const disabled = options.disabled === true;
  const range = Math.max(1, Math.min(4, Math.floor(options.range ?? DEATH_BOMB_RANGE_DEFAULT)));
  const projectSeed = options.seed ?? DEATH_BOMB_SEED_DEFAULT;
  let counter = 0;
  const nextBombId =
    options.nextBombId ??
    ((ownerId: EntityId): EntityId => {
      counter += 1;
      return `death-bomb.${ownerId}.${counter}`;
    });

  const prevAlive = new Map<EntityId, boolean>();
  let cachedWorld: World | undefined;
  let bombers: QueryHandle | undefined;

  const fixedUpdate = (context: SystemContext): void => {
    const world = context.world;
    if (world !== cachedWorld) {
      bombers = world.createQuery([BOMBER_STATS]);
      cachedWorld = world;
      prevAlive.clear();
    }
    if (disabled) return;

    // Detect alive true → false transitions.
    const current = new Map<EntityId, boolean>();
    for (const id of bombers!.run()) {
      const stats = world.getComponent<BomberStatsRead>(id, BOMBER_STATS);
      current.set(id, stats?.alive !== false);
    }
    for (const [id, nowAlive] of current) {
      const wasAlive = prevAlive.get(id) ?? true;
      if (wasAlive && !nowAlive) handleDeath(world, id);
    }
    for (const id of prevAlive.keys()) {
      if (!current.has(id)) prevAlive.delete(id);
    }
    for (const [id, alive] of current) prevAlive.set(id, alive);
  };

  function handleDeath(world: World, bomberId: EntityId): void {
    const pos = world.getComponent<GridPos>(bomberId, GRID_POSITION);
    if (pos === undefined) return;
    const roundNumber = world.hasEntity(ROUND_STATE_ID)
      ? world.getComponent<RoundStateRead>(ROUND_STATE_ID, ROUND_STATE)?.roundNumber ?? 1
      : 1;
    const rng = createSeededRng(deathSeed(bomberId, roundNumber, projectSeed));
    const isAvailable = (cell: { gx: number; gz: number }): boolean => {
      if (options.occupancy.blocked(cell.gx, cell.gz, "movement")) return false;
      // Any "bomb"-layer occupant blocks death-bomb placement.
      const occupants = options.occupancy.occupants(cell.gx, cell.gz, "bomb");
      if (occupants.length > 0) return false;
      return true;
    };
    const target = pickDeathBombCell(pos, isAvailable, rng);
    if (target === undefined) return;
    spawnDeathBomb(world, bomberId, target, range, nextBombId);
  }

  return { name, fixedUpdate };
}

function spawnDeathBomb(
  world: World,
  ownerId: EntityId,
  cell: { gx: number; gz: number },
  range: number,
  nextId: (ownerId: EntityId) => EntityId
): void {
  const bombId = nextId(ownerId);
  if (world.hasEntity(bombId)) return;
  const cellHeight = getCellHeight(world, cell.gx, cell.gz);
  world.addEntity(bombId);
  world.setComponent(bombId, TRANSFORM, {
    position: [cell.gx, 0.35 + cellHeight, cell.gz],
    rotation: [0, 0, 0],
    scale: [0, 0, 0]
  });
  world.setComponent(bombId, TWEENS, [
    {
      component: TRANSFORM,
      property: "scale",
      from: [0, 0, 0],
      to: BOMB_FINAL_SCALE,
      duration: SPAWN_POP_DURATION_S,
      ease: "easeOutBack"
    }
  ]);
  world.setComponent(bombId, MESH_RENDERER, { mesh: "sphere", color: DEATH_BOMB_HEX });
  world.setComponent(bombId, GRID_POSITION, { gx: cell.gx, gz: cell.gz });
  world.setComponent(bombId, GRID_OCCUPANT, { layer: "bomb", blocksMovement: false, blocksBlast: false });
  world.setComponent(bombId, RIGID_BODY_3D, { type: "fixed" });
  world.setComponent(bombId, COLLIDER_3D, { kind: "sphere", radius: 0.175 });
  world.setComponent(bombId, BOMB, {
    fuseRemaining: DEATH_BOMB_FUSE_S_DEFAULT,
    range,
    ownerId
  });
}
