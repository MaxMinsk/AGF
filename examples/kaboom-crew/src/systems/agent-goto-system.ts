// S82 KABOOM-AGENT-CONTROLS. Drives any entity with `AgentGoto`
// toward the target cell by writing `GridMover.queuedDirection` each
// frame. v0 is straight-line: pick the cardinal that reduces |dx|
// first, falling back to the cardinal that reduces |dz| when dx is
// already zero. GridMovementSystem's lane-assist handles the rest —
// blocked moves get a perpendicular fallback automatically, so the
// agent doesn't get stuck against soft blocks or walls in most cases.
// BFS pathfinding around obstacles lands as KABOOM-AGENT-PATHFIND.
//
// Termination contract (consumed by `runtime.kaboom.gotoCell`):
//   - "arrived"     — entity reached the target cell exactly.
//   - "unreachable" — the target cell itself is blocked at request time
//                     (hard wall / soft block / out-of-bounds). Caller
//                     usually wants to retry against an adjacent cell.
//   - "stuck"       — entity hasn't reduced Manhattan distance to the
//                     target for `stuckGraceFrames` consecutive frames.
//                     This is the v0 substitute for proper pathfinding.
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
  /** Optional occupancy query — when provided, the system fails fast with `unreachable` if the target cell is already blocked. */
  occupancy?: GridOccupancyQuery;
  /** Consecutive frames without distance progress that count as stuck. Default 60 (~1 s @ 60 Hz). */
  stuckGraceFrames?: number;
};

type Tracker = {
  lastBest: number;
  noProgressFrames: number;
};

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

      // Case 2a: target is out of grid bounds. Fail fast — the entity
      // would otherwise burn through stuckGraceFrames against the wall.
      if (grid !== undefined && !isInBounds(grid, goal.targetGx, goal.targetGz)) {
        writeResult(world, entityId, "unreachable", pos, goal);
        if (mover.queuedDirection?.dx !== 0 || mover.queuedDirection?.dz !== 0) {
          world.setComponent(entityId, GRID_MOVER, { ...mover, queuedDirection: { dx: 0, dz: 0 } });
        }
        trackers.delete(entityId);
        continue;
      }

      // Case 2b: target itself is blocked (hard wall / soft block).
      // Only checked when occupancy is wired; the unit-test path doesn't
      // need to know about occupancy.
      if (occupancy !== undefined && occupancy.blocked(goal.targetGx, goal.targetGz, "movement")) {
        writeResult(world, entityId, "unreachable", pos, goal);
        if (mover.queuedDirection?.dx !== 0 || mover.queuedDirection?.dz !== 0) {
          world.setComponent(entityId, GRID_MOVER, { ...mover, queuedDirection: { dx: 0, dz: 0 } });
        }
        trackers.delete(entityId);
        continue;
      }

      // Case 3: stuck-detection. Track Manhattan distance to target and
      // count consecutive frames without progress. v0 substitute for
      // proper BFS — KABOOM-AGENT-PATHFIND replaces this.
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

      // Case 4: pick the cardinal that reduces |dx| first. Feels
      // natural in arcade arenas + matches the v0 tests.
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
