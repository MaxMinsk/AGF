// S160 KABOOM-SUDDEN-DEATH (GDP-2026-05-27-013).
//
// Forces stalemate resolution by closing red hard blocks inward from
// the arena perimeter once RoundState.elapsed crosses
// SuddenDeathConfig.triggerAtElapsedS (default 60 s). One ring per
// SuddenDeathConfig.ringIntervalS (default 2 s). Each block is a
// SuddenDeathBlock-tagged GridOccupant (layer=wall, blocksMovement +
// blocksBlast) — distinguishable from the arena's original hard
// blocks via the marker component for visual + kill-credit purposes.
//
// On spawn, the cell is cleared:
//   - BomberStats.alive flips to false (kill source = SuddenDeath).
//   - Bomb / Pickup entities at the cell are removed.
//
// Already-collapsed rings are permanent — the system never re-spawns
// or re-uses cells. The depth of the next ring is `ringsSpawned`
// counted from the outermost ring (0 = perimeter ring, but the
// perimeter is usually already arena wall — see SKIP_OCCUPIED_HARD).

import type { ComponentName, EntityId } from "../../../../engine/core/ecs/types";
import type { QueryHandle, World } from "../../../../engine/core/ecs/world";
import type { System, SystemContext } from "../../../../engine/core/systems/types";

const ROUND_STATE: ComponentName = "RoundState";
const SUDDEN_DEATH_CONFIG: ComponentName = "SuddenDeathConfig";
const SUDDEN_DEATH_STATE: ComponentName = "SuddenDeathState";
const SUDDEN_DEATH_BLOCK: ComponentName = "SuddenDeathBlock";
const GRID: ComponentName = "Grid";
const GRID_POSITION: ComponentName = "GridPosition";
const GRID_OCCUPANT: ComponentName = "GridOccupant";
const BOMBER_STATS: ComponentName = "BomberStats";
const BOMB: ComponentName = "Bomb";
const PICKUP: ComponentName = "Pickup";
const TRANSFORM: ComponentName = "Transform";
const MESH_RENDERER: ComponentName = "MeshRenderer";
const RIGID_BODY: ComponentName = "RigidBody3D";
const COLLIDER: ComponentName = "Collider3D";

const GAME_STATE_ID: EntityId = "kaboom.game-state";

const DEFAULTS = {
  enabled: true,
  triggerAtElapsedS: 60,
  ringIntervalS: 2,
  ringWidth: 1
};

const SUDDEN_DEATH_BLOCK_COLOR = "#ff4040";

type SuddenDeathConfig = {
  enabled?: boolean;
  triggerAtElapsedS?: number;
  ringIntervalS?: number;
  ringWidth?: number;
};

type SuddenDeathState = {
  activated?: boolean;
  activatedAt?: number;
  ringsSpawned?: number;
};

type GridConfig = { sizeX?: number; sizeZ?: number; originX?: number; originZ?: number };
type RoundStateLike = { phase?: string; elapsed?: number };
type GridPos = { gx: number; gz: number };
type OccupantLike = { layer?: string; blocksMovement?: boolean; blocksBlast?: boolean };
type BomberStatsLike = { alive?: boolean };

export type KaboomSuddenDeathSystemOptions = {
  name?: string;
  /** Override the entity id receiving the SuddenDeathConfig/State pair. Defaults to "kaboom.game-state". */
  configEntityId?: EntityId;
};

export function createKaboomSuddenDeathSystem(options: KaboomSuddenDeathSystemOptions = {}): System {
  const name = options.name ?? "kaboom.sudden-death";
  const configId = options.configEntityId ?? GAME_STATE_ID;
  let cachedWorld: World | undefined;
  let bombersQuery: QueryHandle | undefined;
  let bombsQuery: QueryHandle | undefined;
  let pickupsQuery: QueryHandle | undefined;
  let hardBlocksQuery: QueryHandle | undefined;

  const fixedUpdate = (context: SystemContext): void => {
    const world = context.world;
    if (world !== cachedWorld) {
      bombersQuery = world.createQuery([BOMBER_STATS, GRID_POSITION]);
      bombsQuery = world.createQuery([BOMB, GRID_POSITION]);
      pickupsQuery = world.createQuery([PICKUP, GRID_POSITION]);
      hardBlocksQuery = world.createQuery([GRID_OCCUPANT, GRID_POSITION]);
      cachedWorld = world;
    }
    const config = world.getComponent<SuddenDeathConfig>(configId, SUDDEN_DEATH_CONFIG);
    if (config === undefined) return;
    if (config.enabled === false) return;

    const round = world.getComponent<RoundStateLike>("kaboom.round-state", ROUND_STATE);
    if (round === undefined) return;
    if (round.phase !== "playing") return;
    const elapsed = round.elapsed ?? 0;
    const triggerAt = config.triggerAtElapsedS ?? DEFAULTS.triggerAtElapsedS;
    const ringIntervalS = Math.max(0.1, config.ringIntervalS ?? DEFAULTS.ringIntervalS);

    let state = world.getComponent<SuddenDeathState>(configId, SUDDEN_DEATH_STATE);
    if (state === undefined) {
      if (elapsed < triggerAt) return;
      // activatedAt anchored to triggerAt (not elapsed) so the ring
      // schedule is predictable even if activation fires after a lag
      // spike that skipped past several ringIntervals worth of time.
      state = { activated: true, activatedAt: triggerAt, ringsSpawned: 0 };
      world.setComponent(configId, SUDDEN_DEATH_STATE, state);
    } else if (state.activated !== true) {
      if (elapsed < triggerAt) return;
      state = { ...state, activated: true, activatedAt: triggerAt, ringsSpawned: state.ringsSpawned ?? 0 };
      world.setComponent(configId, SUDDEN_DEATH_STATE, state);
    }

    const elapsedSinceTrigger = elapsed - (state.activatedAt ?? elapsed);
    const targetRings = Math.floor(elapsedSinceTrigger / ringIntervalS) + 1;
    const ringsSpawned = state.ringsSpawned ?? 0;
    if (targetRings <= ringsSpawned) return;

    const grid = world.getComponent<GridConfig>("grid.config", GRID);
    if (grid === undefined) return;
    const sizeX = grid.sizeX ?? 15;
    const sizeZ = grid.sizeZ ?? 11;

    // Compute occupied-by-sudden-death-block set so we skip re-spawning.
    const occupied = new Set<string>();
    for (const id of hardBlocksQuery!.run()) {
      if (!world.hasComponent(id, SUDDEN_DEATH_BLOCK)) continue;
      const gp = world.getComponent<GridPos>(id, GRID_POSITION);
      if (gp !== undefined) occupied.add(`${gp.gx},${gp.gz}`);
    }

    for (let depth = ringsSpawned; depth < targetRings; depth += 1) {
      spawnRing(world, sizeX, sizeZ, depth, elapsed, occupied, {
        bombersQuery: bombersQuery!,
        bombsQuery: bombsQuery!,
        pickupsQuery: pickupsQuery!,
        hardBlocksQuery: hardBlocksQuery!
      });
    }

    world.setComponent(configId, SUDDEN_DEATH_STATE, {
      ...state,
      ringsSpawned: targetRings
    });
  };

  return { name, fixedUpdate };
}

type SpawnQueries = {
  bombersQuery: QueryHandle;
  bombsQuery: QueryHandle;
  pickupsQuery: QueryHandle;
  hardBlocksQuery: QueryHandle;
};

/**
 * Pure helper — list the cells in a single ring at `depth` from the
 * arena perimeter, for an `sizeX × sizeZ` grid. Depth 0 = the outermost
 * ring (the cells along x=0 / x=sizeX-1 / z=0 / z=sizeZ-1).
 */
export function ringCells(sizeX: number, sizeZ: number, depth: number): Array<{ gx: number; gz: number }> {
  const cells: Array<{ gx: number; gz: number }> = [];
  if (depth < 0) return cells;
  const minX = depth;
  const maxX = sizeX - 1 - depth;
  const minZ = depth;
  const maxZ = sizeZ - 1 - depth;
  if (minX > maxX || minZ > maxZ) return cells;
  if (minX === maxX && minZ === maxZ) {
    cells.push({ gx: minX, gz: minZ });
    return cells;
  }
  for (let gx = minX; gx <= maxX; gx += 1) {
    cells.push({ gx, gz: minZ });
    if (maxZ !== minZ) cells.push({ gx, gz: maxZ });
  }
  for (let gz = minZ + 1; gz <= maxZ - 1; gz += 1) {
    cells.push({ gx: minX, gz });
    if (maxX !== minX) cells.push({ gx: maxX, gz });
  }
  return cells;
}

function spawnRing(
  world: World,
  sizeX: number,
  sizeZ: number,
  depth: number,
  elapsed: number,
  alreadyOccupied: Set<string>,
  queries: SpawnQueries
): void {
  const cells = ringCells(sizeX, sizeZ, depth);
  for (const { gx, gz } of cells) {
    const key = `${gx},${gz}`;
    if (alreadyOccupied.has(key)) continue;
    // Skip if a non-sudden-death hard block already owns this cell.
    let occupiedByArenaWall = false;
    for (const id of queries.hardBlocksQuery.run()) {
      const gp = world.getComponent<GridPos>(id, GRID_POSITION);
      if (gp?.gx !== gx || gp?.gz !== gz) continue;
      const occ = world.getComponent<OccupantLike>(id, GRID_OCCUPANT);
      if (occ?.layer === "wall" && occ.blocksMovement === true) {
        occupiedByArenaWall = true;
        break;
      }
    }
    if (occupiedByArenaWall) {
      alreadyOccupied.add(key);
      continue;
    }

    // Kill any bomber on this cell first.
    for (const bid of queries.bombersQuery.run()) {
      const bp = world.getComponent<GridPos>(bid, GRID_POSITION);
      if (bp?.gx !== gx || bp?.gz !== gz) continue;
      const stats = world.getComponent<BomberStatsLike>(bid, BOMBER_STATS);
      if (stats?.alive === false) continue;
      world.setComponent(bid, BOMBER_STATS, { ...stats, alive: false });
    }
    // Remove bombs / pickups.
    const toDelete: EntityId[] = [];
    for (const bid of queries.bombsQuery.run()) {
      const bp = world.getComponent<GridPos>(bid, GRID_POSITION);
      if (bp?.gx === gx && bp?.gz === gz) toDelete.push(bid);
    }
    for (const pid of queries.pickupsQuery.run()) {
      const pp = world.getComponent<GridPos>(pid, GRID_POSITION);
      if (pp?.gx === gx && pp?.gz === gz) toDelete.push(pid);
    }
    for (const id of toDelete) world.removeEntity(id);

    // Spawn the wall block.
    const id = `kaboom.sudden-death.${depth}.${gx}.${gz}`;
    if (world.hasEntity(id)) continue;
    world.addEntity(id);
    world.setComponent(id, TRANSFORM, {
      position: [gx, 0.5, gz],
      rotation: [0, 0, 0],
      scale: [1, 1, 1]
    });
    world.setComponent(id, MESH_RENDERER, { mesh: "box", color: SUDDEN_DEATH_BLOCK_COLOR });
    world.setComponent(id, GRID_POSITION, { gx, gz });
    world.setComponent(id, GRID_OCCUPANT, { layer: "wall", blocksMovement: true, blocksBlast: true });
    world.setComponent(id, RIGID_BODY, { type: "fixed" });
    world.setComponent(id, COLLIDER, { kind: "box", size: [1, 1, 1] });
    world.setComponent(id, SUDDEN_DEATH_BLOCK, { spawnedAtElapsedS: elapsed, ringIndex: depth });
    alreadyOccupied.add(key);
  }
}

export const __SUDDEN_DEATH_CONSTANTS = {
  DEFAULTS,
  SUDDEN_DEATH_BLOCK_COLOR
};
