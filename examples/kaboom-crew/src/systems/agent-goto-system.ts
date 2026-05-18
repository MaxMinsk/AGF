// S82 KABOOM-AGENT-CONTROLS + KABOOM-AGENT-PATHFIND.
//
// Drives any entity with `AgentGoto` toward the target cell by writing
// `GridMover.queuedDirection` each frame. When occupancy + Grid are
// wired, a per-frame BFS over the grid finds the shortest path around
// obstacles (hard walls, soft blocks, bombs) and queues the next step.
// When occupancy is missing (e.g. minimal unit tests) the system falls
// back to a straight-line policy that picks the cardinal reducing |dx|
// first and relies on GridMovementSystem's lane-assist.
//
// Termination contract (consumed by `runtime.kaboom.gotoCell`):
//   - "arrived"     — entity reached the target cell exactly.
//   - "unreachable" — the target cell itself is blocked at request time
//                     (hard wall / soft block / out-of-bounds) OR no
//                     BFS path exists from the current cell.
//   - "stuck"       — entity hasn't reduced Manhattan distance to the
//                     target for `stuckGraceFrames` consecutive frames.
//                     With BFS this should be rare — kept as a safety
//                     net against pathological occupancy changes.
// The system writes `AgentGotoResult` (transient) before removing
// `AgentGoto` so external poller code can read the outcome.

import type { ComponentName, EntityId } from "../../../../engine/core/ecs/types";
import type { QueryHandle, World } from "../../../../engine/core/ecs/world";
import type { System, SystemContext } from "../../../../engine/core/systems/types";
import type { GridOccupancyQuery } from "../../../../engine/core/systems/grid-occupancy-system";
import { isInBounds, type GridConfig } from "../../../../engine/core/grid";

const AGENT_GOTO: ComponentName = "AgentGoto";
const AGENT_GOTO_RESULT: ComponentName = "AgentGotoResult";
const GRID_MOVER: ComponentName = "GridMover";
const GRID_POSITION: ComponentName = "GridPosition";
// Engine convention: `GridConfig` (type) is stored under the `Grid`
// component name — matches grid-movement-system.ts.
const GRID: ComponentName = "Grid";

type AgentGoto = { targetGx: number; targetGz: number };
type GridPos = { gx: number; gz: number };
type GridMoverComponent = {
  speed: number;
  queuedDirection?: { dx: number; dz: number };
  currentLerp?: number;
  targetGx?: number;
  targetGz?: number;
};

export type AgentGotoOutcome = "arrived" | "unreachable" | "stuck";
export type AgentGotoResultComponent = {
  outcome: AgentGotoOutcome;
  targetGx: number;
  targetGz: number;
  finalGx: number;
  finalGz: number;
};

export type KaboomAgentGotoOptions = {
  name?: string;
  /** Optional occupancy query — unlocks BFS pathfinding + early-out when the target is blocked. */
  occupancy?: GridOccupancyQuery;
  /** Consecutive frames without distance progress that count as stuck. Default 60 (~1 s @ 60 Hz). */
  stuckGraceFrames?: number;
};

type Tracker = {
  lastBest: number;
  noProgressFrames: number;
};

const DIRECTIONS: ReadonlyArray<{ dx: number; dz: number }> = [
  { dx: 1, dz: 0 },
  { dx: -1, dz: 0 },
  { dx: 0, dz: 1 },
  { dx: 0, dz: -1 }
];

function manhattan(ax: number, az: number, bx: number, bz: number): number {
  return Math.abs(ax - bx) + Math.abs(az - bz);
}

function writeResult(
  world: World,
  entityId: EntityId,
  outcome: AgentGotoOutcome,
  pos: GridPos,
  goal: AgentGoto
): void {
  const result: AgentGotoResultComponent = {
    outcome,
    targetGx: goal.targetGx,
    targetGz: goal.targetGz,
    finalGx: pos.gx,
    finalGz: pos.gz
  };
  world.setComponent(entityId, AGENT_GOTO_RESULT, result);
  world.removeComponent(entityId, AGENT_GOTO);
}

/**
 * BFS from `(startGx, startGz)` to `(targetGx, targetGz)`. Returns the
 * first cardinal step on the shortest path, or `undefined` when no
 * path exists. `isBlocked(gx, gz)` is consulted for every neighbour;
 * the start cell is always considered open even when occupancy thinks
 * it isn't (the entity is standing there, after all).
 */
export function bfsFirstStep(
  startGx: number,
  startGz: number,
  targetGx: number,
  targetGz: number,
  grid: { sizeX: number; sizeZ: number },
  isBlocked: (gx: number, gz: number) => boolean
): { dx: number; dz: number } | undefined {
  if (startGx === targetGx && startGz === targetGz) return { dx: 0, dz: 0 };
  // Visited map stores the FIRST direction chosen out of the start
  // cell — reconstructing the full path isn't needed because we only
  // queue the next step. Map<key, dir>.
  const key = (gx: number, gz: number): number => gx * grid.sizeZ + gz;
  const visited = new Map<number, { dx: number; dz: number }>();
  visited.set(key(startGx, startGz), { dx: 0, dz: 0 });

  // Hand-rolled ring buffer over an array — Array.shift is O(n).
  const queue: number[] = [key(startGx, startGz)];
  let head = 0;
  while (head < queue.length) {
    const cellKey = queue[head++]!;
    const gx = Math.floor(cellKey / grid.sizeZ);
    const gz = cellKey - gx * grid.sizeZ;
    for (const d of DIRECTIONS) {
      const nx = gx + d.dx;
      const nz = gz + d.dz;
      if (nx < 0 || nz < 0 || nx >= grid.sizeX || nz >= grid.sizeZ) continue;
      const nk = key(nx, nz);
      if (visited.has(nk)) continue;
      // Target itself: don't consult isBlocked (we already verified it
      // up-stream; allowing entry here lets BFS find paths that end on
      // a 'soft' target that the caller insists on).
      if (!(nx === targetGx && nz === targetGz) && isBlocked(nx, nz)) continue;
      // First step from start = direction we just took.
      const firstDir = (gx === startGx && gz === startGz)
        ? { dx: d.dx, dz: d.dz }
        : visited.get(cellKey)!;
      visited.set(nk, firstDir);
      if (nx === targetGx && nz === targetGz) return firstDir;
      queue.push(nk);
    }
  }
  return undefined;
}

export function createKaboomAgentGotoSystem(options: KaboomAgentGotoOptions = {}): System {
  const name = options.name ?? "kaboom.agent-goto";
  const occupancy = options.occupancy;
  const stuckGraceFrames = options.stuckGraceFrames ?? 60;

  let cachedWorld: World | undefined;
  let query: QueryHandle | undefined;
  let gridQuery: QueryHandle | undefined;
  const trackers = new Map<EntityId, Tracker>();

  function readGridConfig(world: World): GridConfig | undefined {
    if (gridQuery === undefined) return undefined;
    for (const id of gridQuery.run()) {
      const cfg = world.getComponent<GridConfig>(id, GRID);
      if (cfg !== undefined) return cfg;
    }
    return undefined;
  }

  const frameUpdate = (context: SystemContext): void => {
    const world = context.world;
    if (world !== cachedWorld) {
      query = world.createQuery([AGENT_GOTO, GRID_MOVER, GRID_POSITION]);
      gridQuery = world.createQuery([GRID]);
      cachedWorld = world;
      trackers.clear();
    }
    const grid = readGridConfig(world);
    const seen = new Set<EntityId>();
    for (const entityId of query!.run()) {
      const goal = world.getComponent<AgentGoto>(entityId, AGENT_GOTO);
      const pos = world.getComponent<GridPos>(entityId, GRID_POSITION);
      const mover = world.getComponent<GridMoverComponent>(entityId, GRID_MOVER);
      if (goal === undefined || pos === undefined || mover === undefined) continue;
      seen.add(entityId);

      // Case 1: already on the target.
      if (pos.gx === goal.targetGx && pos.gz === goal.targetGz) {
        writeResult(world, entityId, "arrived", pos, goal);
        if (mover.queuedDirection?.dx !== 0 || mover.queuedDirection?.dz !== 0) {
          world.setComponent(entityId, GRID_MOVER, { ...mover, queuedDirection: { dx: 0, dz: 0 } });
        }
        trackers.delete(entityId);
        continue;
      }

      // Case 2a: target is out of grid bounds. Fail fast.
      if (grid !== undefined && !isInBounds(grid, goal.targetGx, goal.targetGz)) {
        writeResult(world, entityId, "unreachable", pos, goal);
        if (mover.queuedDirection?.dx !== 0 || mover.queuedDirection?.dz !== 0) {
          world.setComponent(entityId, GRID_MOVER, { ...mover, queuedDirection: { dx: 0, dz: 0 } });
        }
        trackers.delete(entityId);
        continue;
      }

      // Case 2b: target itself is blocked.
      if (occupancy !== undefined && occupancy.blocked(goal.targetGx, goal.targetGz, "movement")) {
        writeResult(world, entityId, "unreachable", pos, goal);
        if (mover.queuedDirection?.dx !== 0 || mover.queuedDirection?.dz !== 0) {
          world.setComponent(entityId, GRID_MOVER, { ...mover, queuedDirection: { dx: 0, dz: 0 } });
        }
        trackers.delete(entityId);
        continue;
      }

      // Case 2c: full BFS — only when both grid bounds and occupancy
      // are available. Exhausting the queue means no path exists.
      if (grid !== undefined && occupancy !== undefined) {
        const step = bfsFirstStep(
          pos.gx,
          pos.gz,
          goal.targetGx,
          goal.targetGz,
          { sizeX: grid.sizeX, sizeZ: grid.sizeZ },
          (gx, gz) => occupancy.blocked(gx, gz, "movement")
        );
        if (step === undefined) {
          writeResult(world, entityId, "unreachable", pos, goal);
          if (mover.queuedDirection?.dx !== 0 || mover.queuedDirection?.dz !== 0) {
            world.setComponent(entityId, GRID_MOVER, { ...mover, queuedDirection: { dx: 0, dz: 0 } });
          }
          trackers.delete(entityId);
          continue;
        }
        // Still also do stuck tracking — occupancy can churn (bombs
        // appear, etc.) and the BFS could theoretically oscillate.
        const dist = manhattan(pos.gx, pos.gz, goal.targetGx, goal.targetGz);
        let tracker = trackers.get(entityId);
        if (tracker === undefined) {
          tracker = { lastBest: dist, noProgressFrames: 0 };
          trackers.set(entityId, tracker);
        } else if (dist < tracker.lastBest) {
          tracker.lastBest = dist;
          tracker.noProgressFrames = 0;
        } else {
          tracker.noProgressFrames += 1;
        }
        if (tracker.noProgressFrames >= stuckGraceFrames) {
          writeResult(world, entityId, "stuck", pos, goal);
          if (mover.queuedDirection?.dx !== 0 || mover.queuedDirection?.dz !== 0) {
            world.setComponent(entityId, GRID_MOVER, { ...mover, queuedDirection: { dx: 0, dz: 0 } });
          }
          trackers.delete(entityId);
          continue;
        }
        const prev = mover.queuedDirection;
        if (prev?.dx !== step.dx || prev?.dz !== step.dz) {
          world.setComponent(entityId, GRID_MOVER, { ...mover, queuedDirection: step });
        }
        continue;
      }

      // Fallback path (no occupancy → no BFS): straight-line + stuck
      // detection. Used by unit tests that don't construct an occupancy
      // index.
      const dist = manhattan(pos.gx, pos.gz, goal.targetGx, goal.targetGz);
      let tracker = trackers.get(entityId);
      if (tracker === undefined) {
        tracker = { lastBest: dist, noProgressFrames: 0 };
        trackers.set(entityId, tracker);
      } else if (dist < tracker.lastBest) {
        tracker.lastBest = dist;
        tracker.noProgressFrames = 0;
      } else {
        tracker.noProgressFrames += 1;
      }
      if (tracker.noProgressFrames >= stuckGraceFrames) {
        writeResult(world, entityId, "stuck", pos, goal);
        if (mover.queuedDirection?.dx !== 0 || mover.queuedDirection?.dz !== 0) {
          world.setComponent(entityId, GRID_MOVER, { ...mover, queuedDirection: { dx: 0, dz: 0 } });
        }
        trackers.delete(entityId);
        continue;
      }
      const dx = Math.sign(goal.targetGx - pos.gx);
      const dz = Math.sign(goal.targetGz - pos.gz);
      const direction = dx !== 0 ? { dx, dz: 0 } : { dx: 0, dz };
      const prev = mover.queuedDirection;
      if (prev?.dx !== direction.dx || prev?.dz !== direction.dz) {
        world.setComponent(entityId, GRID_MOVER, { ...mover, queuedDirection: direction });
      }
    }
    // Drop trackers for entities that no longer carry AgentGoto.
    if (trackers.size > seen.size) {
      for (const id of [...trackers.keys()]) {
        if (!seen.has(id)) trackers.delete(id);
      }
    }
  };

  return { name, frameUpdate };
}
