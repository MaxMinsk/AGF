// S149 KABOOM-WARP-HOLE — second hazard module from gameplay-systems.md
// §11 catalogue, after Conveyor Belt (S146).
//
// A warp hole is a pair of grid cells linked bidirectionally. Any
// bomber or bomb landing on a warp cell is teleported to the partner
// cell (same pairId, opposite role) on the next fixedUpdate.
//
// Per-pair cooldown (300 ms) prevents infinite ping-pong: when an
// entity warps, both cells of the pair stamp lastWarpAt to the
// current sim time; subsequent warps within the cooldown window are
// suppressed, so the bomber/bomb stays on the destination cell long
// enough to step off.
//
// Bombs warp normally while fuseRemaining > 0; bombs in the middle
// of detonation (fuseRemaining = 0 + pending BlastEvent) are NOT
// teleported — the blast fires at the warp cell so the warp doesn't
// also become a damage-vector. Blasts themselves do not transmit
// through warps.

import type { ComponentName, EntityId } from "../../../../engine/core/ecs/types";
import type { QueryHandle, World } from "../../../../engine/core/ecs/world";
import type { System, SystemContext } from "../../../../engine/core/systems/types";
import type { GridOccupancyQuery } from "../../../../engine/core/systems/grid-occupancy-system";

const WARP_HOLE: ComponentName = "WarpHole";
const GRID_POSITION: ComponentName = "GridPosition";
const TRANSFORM: ComponentName = "Transform";
const BOMB: ComponentName = "Bomb";
const BOMBER_STATS: ComponentName = "BomberStats";
const GRID_MOVER: ComponentName = "GridMover";

const COOLDOWN_SECONDS = 0.3;

type WarpHoleComponent = {
  pairId: number;
  role: "a" | "b";
  lastWarpAt?: number;
};

type GridPos = { gx: number; gz: number };
type TransformComponent = {
  position?: ReadonlyArray<number>;
  rotation?: ReadonlyArray<number>;
  scale?: ReadonlyArray<number>;
};
type GridMoverComponent = {
  speed: number;
  queuedDirection?: { dx: number; dz: number };
  currentLerp?: number;
  targetGx?: number;
  targetGz?: number;
};
type BombComponent = { fuseRemaining?: number };

export function createKaboomWarpHoleSystem(options: {
  occupancy: GridOccupancyQuery;
  name?: string;
}): System {
  const name = options.name ?? "kaboom.warp-hole";
  const occupancy = options.occupancy;
  let cachedWorld: World | undefined;
  let warps: QueryHandle | undefined;
  // Sim-time accumulator; using context.time.fixedDt instead of
  // performance.now keeps the cooldown deterministic in tests.
  let simTime = 0;

  const fixedUpdate = (context: SystemContext): void => {
    const world = context.world;
    if (world !== cachedWorld) {
      warps = world.createQuery([WARP_HOLE, GRID_POSITION]);
      cachedWorld = world;
      simTime = 0;
    }
    simTime += Math.max(0, context.time.fixedDt);

    // Build pairId → (a-cell, b-cell) map. Iterating warp entities is
    // O(N) with N = number of warp cells, typically <8 per arena.
    const warpIds = [...warps!.run()].sort();
    type PairEntry = { aId?: EntityId; bId?: EntityId; aPos?: GridPos; bPos?: GridPos; lastWarpAt: number };
    const pairs = new Map<number, PairEntry>();
    for (const warpId of warpIds) {
      const warp = world.getComponent<WarpHoleComponent>(warpId, WARP_HOLE);
      const pos = world.getComponent<GridPos>(warpId, GRID_POSITION);
      if (warp === undefined || pos === undefined) continue;
      const existing = pairs.get(warp.pairId) ?? { lastWarpAt: -Infinity };
      if (warp.role === "a") {
        existing.aId = warpId;
        existing.aPos = pos;
      } else {
        existing.bId = warpId;
        existing.bPos = pos;
      }
      // Treat the absence of lastWarpAt as "never warped" so the first
      // warp on a fresh pair isn't accidentally inside the cooldown
      // window. Once the system stamps a value both ends share it.
      if (warp.lastWarpAt !== undefined) {
        existing.lastWarpAt = Math.max(existing.lastWarpAt, warp.lastWarpAt);
      }
      pairs.set(warp.pairId, existing);
    }

    for (const [pairId, entry] of pairs) {
      if (entry.aId === undefined || entry.bId === undefined ||
          entry.aPos === undefined || entry.bPos === undefined) {
        // Authoring error — engine:check should catch this at load.
        continue;
      }
      if (simTime - entry.lastWarpAt < COOLDOWN_SECONDS) continue;

      // For each end of the pair, look at occupants and teleport them
      // to the partner cell. We collect occupants first so we don't
      // re-process the just-teleported entity on the partner cell in
      // the same tick.
      const aOccupants = collectWarpableOccupants(world, occupancy, entry.aPos.gx, entry.aPos.gz);
      const bOccupants = collectWarpableOccupants(world, occupancy, entry.bPos.gx, entry.bPos.gz);
      let warped = false;
      for (const id of aOccupants) {
        teleport(world, id, entry.bPos.gx, entry.bPos.gz);
        warped = true;
      }
      for (const id of bOccupants) {
        teleport(world, id, entry.aPos.gx, entry.aPos.gz);
        warped = true;
      }
      if (warped) {
        const stampedA = { ...world.getComponent<WarpHoleComponent>(entry.aId, WARP_HOLE)!, lastWarpAt: simTime };
        const stampedB = { ...world.getComponent<WarpHoleComponent>(entry.bId, WARP_HOLE)!, lastWarpAt: simTime };
        world.setComponent(entry.aId, WARP_HOLE, stampedA);
        world.setComponent(entry.bId, WARP_HOLE, stampedB);
      }
      void pairId;
    }
  };

  return { name, fixedUpdate };
}

function collectWarpableOccupants(
  world: World,
  occupancy: GridOccupancyQuery,
  gx: number,
  gz: number
): Array<EntityId> {
  const out: Array<EntityId> = [];
  for (const id of occupancy.occupants(gx, gz)) {
    if (world.hasComponent(id, BOMBER_STATS)) {
      const stats = world.getComponent<{ alive?: boolean }>(id, BOMBER_STATS);
      if (stats?.alive === false) continue;
      out.push(id);
    } else if (world.hasComponent(id, BOMB)) {
      const bomb = world.getComponent<BombComponent>(id, BOMB);
      // Bomb mid-detonation (fuse already at zero) stays put so the
      // blast fires at the warp cell instead of teleporting damage.
      if ((bomb?.fuseRemaining ?? 0) <= 0) continue;
      out.push(id);
    }
  }
  return out;
}

function teleport(world: World, entityId: EntityId, destGx: number, destGz: number): void {
  world.setComponent(entityId, GRID_POSITION, { gx: destGx, gz: destGz });
  const transform = world.getComponent<TransformComponent>(entityId, TRANSFORM);
  if (transform !== undefined) {
    // Preserve y so bombs stay at bomb-height and bombers stay at
    // bomber-height — both have non-trivial Y offsets.
    const y = transform.position?.[1] ?? 0.4;
    world.setComponent(entityId, TRANSFORM, {
      ...transform,
      position: [destGx, y, destGz]
    });
  }
  // Reset queued movement so the grid-mover doesn't immediately slide
  // the bomber back through the warp.
  const mover = world.getComponent<GridMoverComponent>(entityId, GRID_MOVER);
  if (mover !== undefined) {
    world.setComponent(entityId, GRID_MOVER, {
      ...mover,
      queuedDirection: { dx: 0, dz: 0 },
      currentLerp: 0,
      targetGx: destGx,
      targetGz: destGz
    });
  }
}
