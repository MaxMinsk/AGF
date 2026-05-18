// S82 KABOOM-AGENT-CONTROLS. Drives any entity with `AgentGoto`
// toward the target cell by writing `GridMover.queuedDirection` each
// frame. v0 is straight-line: pick the cardinal that reduces |dx|
// first, falling back to the cardinal that reduces |dz| when dx is
// already zero. GridMovementSystem's lane-assist handles the rest —
// blocked moves get a perpendicular fallback automatically, so the
// agent doesn't get stuck against soft blocks or walls in most cases.
// BFS pathfinding around obstacles lands as KABOOM-AGENT-PATHFIND.
//
// The system removes the `AgentGoto` component when the entity reaches
// the target cell so subsequent frames stop writing queuedDirection.

import type { ComponentName } from "../../../../engine/core/ecs/types";
import type { QueryHandle, World } from "../../../../engine/core/ecs/world";
import type { System, SystemContext } from "../../../../engine/core/systems/types";

const AGENT_GOTO: ComponentName = "AgentGoto";
const GRID_MOVER: ComponentName = "GridMover";
const GRID_POSITION: ComponentName = "GridPosition";

type AgentGoto = { targetGx: number; targetGz: number };
type GridPos = { gx: number; gz: number };
type GridMoverComponent = {
  speed: number;
  queuedDirection?: { dx: number; dz: number };
  currentLerp?: number;
  targetGx?: number;
  targetGz?: number;
};

export function createKaboomAgentGotoSystem(options: { name?: string } = {}): System {
  const name = options.name ?? "kaboom.agent-goto";
  let cachedWorld: World | undefined;
  let query: QueryHandle | undefined;

  const frameUpdate = (context: SystemContext): void => {
    const world = context.world;
    if (world !== cachedWorld) {
      query = world.createQuery([AGENT_GOTO, GRID_MOVER, GRID_POSITION]);
      cachedWorld = world;
    }
    for (const entityId of query!.run()) {
      const goal = world.getComponent<AgentGoto>(entityId, AGENT_GOTO);
      const pos = world.getComponent<GridPos>(entityId, GRID_POSITION);
      const mover = world.getComponent<GridMoverComponent>(entityId, GRID_MOVER);
      if (goal === undefined || pos === undefined || mover === undefined) continue;
      if (pos.gx === goal.targetGx && pos.gz === goal.targetGz) {
        // Arrived — clear the goto + stop motion.
        world.removeComponent(entityId, AGENT_GOTO);
        if (mover.queuedDirection?.dx !== 0 || mover.queuedDirection?.dz !== 0) {
          world.setComponent(entityId, GRID_MOVER, { ...mover, queuedDirection: { dx: 0, dz: 0 } });
        }
        continue;
      }
      // Prefer reducing |dx| first — feels natural in arcade arenas.
      const dx = Math.sign(goal.targetGx - pos.gx);
      const dz = Math.sign(goal.targetGz - pos.gz);
      const direction = dx !== 0 ? { dx, dz: 0 } : { dx: 0, dz };
      const prev = mover.queuedDirection;
      if (prev?.dx !== direction.dx || prev?.dz !== direction.dz) {
        world.setComponent(entityId, GRID_MOVER, { ...mover, queuedDirection: direction });
      }
    }
  };

  return { name, frameUpdate };
}
