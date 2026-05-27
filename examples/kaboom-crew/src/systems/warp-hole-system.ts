// S149 KABOOM-WARP-HOLE — second hazard module from gameplay-systems.md
// §11 catalogue, after Conveyor Belt (S146).
//
// A warp hole is a pair of grid cells linked bidirectionally. Any
// bomber or bomb landing on a warp cell is teleported to the partner
// cell (same pairId, opposite role) on the next fixedUpdate.
//
// QA-2026-05-27-001 fix — anti-ping-pong is PER-ENTITY, not per-pair.
// When the system warps entity E from cell A to cell B, it records
// recentlyWarpedTo[E] = B. As long as E's GridPosition stays on B,
// the system skips E during its scan of B (E doesn't get re-warped
// to A). The moment E's GridPosition changes (they walked off OR
// were displaced by something else), the recording is cleared and E
// becomes eligible again. Lets the user walk in → arrive → walk off,
// no ping-pong, while still warping anyone else who arrives on the
// cell. The earlier per-pair cooldown was a debounce that broke when
// the player couldn't step off in 300 ms (gridmover at speed=4 takes
// ~250 ms per cell — half the cooldown).
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

type WarpHoleComponent = {
  pairId: number;
  role: "a" | "b";
  // Legacy field — kept in the schema for backward-compat with already-
  // authored scenes, but the system no longer reads or writes it.
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
  let simTime = 0;
  // QA-2026-05-27-001 (warp ping-pong) + follow-up (warp UX): both
  // failure modes need addressing simultaneously.
  // 1. Stationary bomber on the destination cell — original ping-pong
  //    bug from PR #184. Skip via per-entity recordedDestination: as
  //    long as their GridPosition matches the cell we just warped them
  //    to, they're immune.
  // 2. Held-key continuous motion — the user's UX complaint after #184.
  //    The bomber walks off the destination + the immunity drops + the
  //    next adjacent warp cell re-triggers. Skip via entity-wide
  //    time-based cooldown (0.55 s ≈ 2 cells at speed=4).
  // BOTH gates are OR — exit cooldown only when (time expired) AND
  // (no longer on recorded destination cell).
  type WarpState = { destGx: number; destGz: number; cooldownUntilSec: number };
  const warpStateByEntity = new Map<EntityId, WarpState>();
  const COOLDOWN_DURATION_SEC = 0.55;

  const fixedUpdate = (context: SystemContext): void => {
    const world = context.world;
    if (world !== cachedWorld) {
      warps = world.createQuery([WARP_HOLE, GRID_POSITION]);
      cachedWorld = world;
      warpStateByEntity.clear();
      simTime = 0;
    }
    simTime += Math.max(0, context.time.fixedDt);

    // Garbage-collect entries where the cooldown expired AND the
    // entity is no longer on the recorded destination cell. Drop
    // entries for despawned entities outright.
    for (const [entityId, state] of warpStateByEntity) {
      if (!world.hasEntity(entityId)) {
        warpStateByEntity.delete(entityId);
        continue;
      }
      if (state.cooldownUntilSec > simTime) continue; // cooldown still active
      const pos = world.getComponent<GridPos>(entityId, GRID_POSITION);
      if (pos === undefined || pos.gx !== state.destGx || pos.gz !== state.destGz) {
        warpStateByEntity.delete(entityId);
      }
    }

    // Build pairId → (a-cell, b-cell) map. Iterating warp entities is
    // O(N) with N = number of warp cells, typically <8 per arena.
    const warpIds = [...warps!.run()].sort();
    type PairEntry = { aId?: EntityId; bId?: EntityId; aPos?: GridPos; bPos?: GridPos };
    const pairs = new Map<number, PairEntry>();
    for (const warpId of warpIds) {
      const warp = world.getComponent<WarpHoleComponent>(warpId, WARP_HOLE);
      const pos = world.getComponent<GridPos>(warpId, GRID_POSITION);
      if (warp === undefined || pos === undefined) continue;
      const existing = pairs.get(warp.pairId) ?? {};
      if (warp.role === "a") {
        existing.aId = warpId;
        existing.aPos = pos;
      } else {
        existing.bId = warpId;
        existing.bPos = pos;
      }
      pairs.set(warp.pairId, existing);
    }

    for (const [pairId, entry] of pairs) {
      if (entry.aId === undefined || entry.bId === undefined ||
          entry.aPos === undefined || entry.bPos === undefined) {
        // Authoring error — engine:check should catch this at load.
        continue;
      }
      // For each end of the pair, look at occupants and teleport them
      // to the partner cell. Skip occupants whose entity-wide cooldown
      // is still active (just-warped or otherwise).
      const aOccupants = collectWarpableOccupants(world, occupancy, entry.aPos.gx, entry.aPos.gz, warpStateByEntity, simTime);
      const bOccupants = collectWarpableOccupants(world, occupancy, entry.bPos.gx, entry.bPos.gz, warpStateByEntity, simTime);
      for (const id of aOccupants) {
        teleport(world, id, entry.bPos.gx, entry.bPos.gz);
        warpStateByEntity.set(id, {
          destGx: entry.bPos.gx,
          destGz: entry.bPos.gz,
          cooldownUntilSec: simTime + COOLDOWN_DURATION_SEC
        });
      }
      for (const id of bOccupants) {
        teleport(world, id, entry.aPos.gx, entry.aPos.gz);
        warpStateByEntity.set(id, {
          destGx: entry.aPos.gx,
          destGz: entry.aPos.gz,
          cooldownUntilSec: simTime + COOLDOWN_DURATION_SEC
        });
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
  gz: number,
  warpStateByEntity: Map<EntityId, { destGx: number; destGz: number; cooldownUntilSec: number }>,
  simTime: number
): Array<EntityId> {
  const out: Array<EntityId> = [];
  for (const id of occupancy.occupants(gx, gz)) {
    // QA-2026-05-27-001 + UX follow-up — skip if EITHER the entity is
    // still on the cell we last warped them to (stationary case) OR
    // the entity-wide cooldown is still active (continuous-motion
    // case). The GC step expires entries when BOTH gates clear.
    const state = warpStateByEntity.get(id);
    if (state !== undefined) {
      if (simTime < state.cooldownUntilSec) continue;
      if (state.destGx === gx && state.destGz === gz) continue;
    }
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
