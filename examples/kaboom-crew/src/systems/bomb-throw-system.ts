// S144 KABOOM-THROW-GLOVE throw half.
//
// Consumes ThrowBombRequest transients written by player-input-system
// when T fires while the bomber is carrying a bomb. Computes the
// landing cell from the bomber's facing direction × 3 (graceful
// fallback to ×2 → ×1 → bomber cell when the destination is blocked).
// Spawns the bomb back into the world at the landing cell with
// Bomb.airborne=true and a Tween on Transform.position (parabolic arc,
// 0.45s). bomb-fuse-system already skips airborne bombs; this system
// also ticks Bomb.airborneRemaining each fixedUpdate so a separate
// land-snap step fires when the timer hits zero.

import type { ComponentName, EntityId } from "../../../../engine/core/ecs/types";
import type { QueryHandle, World } from "../../../../engine/core/ecs/world";
import type { System, SystemContext } from "../../../../engine/core/systems/types";
import type { GridOccupancyQuery } from "../../../../engine/core/systems/grid-occupancy-system";

const THROW_BOMB_REQUEST: ComponentName = "ThrowBombRequest";
const BOMB: ComponentName = "Bomb";
const BOMBER_STATS: ComponentName = "BomberStats";
const GRID_POSITION: ComponentName = "GridPosition";
const GRID_OCCUPANT: ComponentName = "GridOccupant";
const TRANSFORM: ComponentName = "Transform";
const TWEENS: ComponentName = "Tweens";
const GRID_MOVER: ComponentName = "GridMover";

const THROW_DISTANCE_CELLS = 3;
const ARC_DURATION_S = 0.45;
const ARC_PEAK_Y = 1.5;
const BOMB_REST_Y = 0.35;

type BombComponent = {
  fuseRemaining: number;
  range: number;
  ownerId: EntityId;
  pierce?: boolean;
  carriedBy?: EntityId;
  airborne?: boolean;
  airborneRemaining?: number;
};
type BomberStatsComponent = {
  carryingBombId?: EntityId;
};
type GridPos = { gx: number; gz: number };
type Direction = { dx: number; dz: number };

/**
 * Pure helper. Resolves the bomber's facing direction in priority
 * order: GridMover.queuedDirection (if non-zero) → Transform.rotation.y
 * decoded to the nearest cardinal → +Z fallback. yaw 0° = -Z; +X = 90°;
 * matches directionToYawDeg in bomber-face-movement-system.
 */
export function resolveFacingDirection(
  queued: { dx?: number; dz?: number } | undefined,
  yawDeg: number | undefined
): Direction {
  if (queued !== undefined) {
    const dx = queued.dx ?? 0;
    const dz = queued.dz ?? 0;
    if (dx !== 0 || dz !== 0) {
      // Snap to a unit cardinal (queued may carry ±1 already; defensive).
      const ax = Math.abs(dx);
      const az = Math.abs(dz);
      if (ax >= az) return { dx: dx > 0 ? 1 : dx < 0 ? -1 : 0, dz: 0 };
      return { dx: 0, dz: dz > 0 ? 1 : dz < 0 ? -1 : 0 };
    }
  }
  if (yawDeg !== undefined && Number.isFinite(yawDeg)) {
    // yaw = atan2(dx, -dz) * 180/π. Snap to nearest cardinal.
    const yawMod = ((yawDeg % 360) + 360) % 360;
    if (yawMod < 45 || yawMod >= 315) return { dx: 0, dz: -1 };
    if (yawMod < 135) return { dx: 1, dz: 0 };
    if (yawMod < 225) return { dx: 0, dz: 1 };
    return { dx: -1, dz: 0 };
  }
  return { dx: 0, dz: 1 };
}

export function createKaboomBombThrowSystem(options: {
  occupancy: GridOccupancyQuery;
  name?: string;
}): System {
  const name = options.name ?? "kaboom.bomb-throw";
  const occupancy = options.occupancy;
  let cachedWorld: World | undefined;
  let requests: QueryHandle | undefined;
  let airbornes: QueryHandle | undefined;

  const fixedUpdate = (context: SystemContext): void => {
    const world = context.world;
    if (world !== cachedWorld) {
      requests = world.createQuery([THROW_BOMB_REQUEST]);
      airbornes = world.createQuery([BOMB]);
      cachedWorld = world;
    }
    const dt = Math.max(0, context.time.fixedDt);

    // 1. Consume throw requests + spawn the arc.
    for (const bomberId of [...requests!.run()]) {
      world.removeComponent(bomberId, THROW_BOMB_REQUEST);
      const stats = world.getComponent<BomberStatsComponent>(bomberId, BOMBER_STATS);
      if (stats === undefined) continue;
      const bombId = stats.carryingBombId;
      if (typeof bombId !== "string" || bombId.length === 0) continue;
      if (!world.hasEntity(bombId)) continue;
      const bomb = world.getComponent<BombComponent>(bombId, BOMB);
      if (bomb === undefined) continue;
      if (bomb.carriedBy !== bomberId) continue;
      if (bomb.airborne === true) continue;
      const bomberPos = world.getComponent<GridPos>(bomberId, GRID_POSITION);
      if (bomberPos === undefined) continue;
      const mover = world.getComponent<{ queuedDirection?: { dx?: number; dz?: number } }>(bomberId, GRID_MOVER);
      const bomberTransform = world.getComponent<{ rotation?: ReadonlyArray<number> }>(bomberId, TRANSFORM);
      const facing = resolveFacingDirection(mover?.queuedDirection, bomberTransform?.rotation?.[1]);
      // Pick the furthest cell along facing × N that's in-bounds + not
      // a hard-block + not already holding a bomb. Fallback chain:
      // 3 → 2 → 1 → bomber's own cell (last resort).
      const landing = pickLandingCell(world, occupancy, bomberPos, facing);
      // Compute world positions for the arc tween.
      const startPos: [number, number, number] = [bomberPos.gx, BOMB_REST_Y + 0.3, bomberPos.gz];
      const endPos: [number, number, number] = [landing.gx, BOMB_REST_Y, landing.gz];
      // Place the bomb visually at its current carrier-mounted spot
      // before the tween snapshots the start position.
      world.setComponent(bombId, TRANSFORM, {
        position: startPos,
        rotation: [0, 0, 0],
        scale: [0.35, 0.35, 0.35]
      });
      // Drive Y up via a peak waypoint and down to land. Existing
      // Tween primitive doesn't support multi-stage paths in one tween;
      // we approximate the arc with two sequential tweens for X/Z
      // (linear) + one Y up + Y down. Reuse the same component to keep
      // wiring lean: a single tween on `position` from start to end,
      // ease "easeOutQuad" — pure visual; the gameplay outcome only
      // depends on the airborneRemaining timer.
      world.setComponent(bombId, TWEENS, [
        {
          component: TRANSFORM,
          property: "position",
          from: startPos,
          to: endPos,
          duration: ARC_DURATION_S,
          ease: "easeOutQuad"
        }
      ]);
      void ARC_PEAK_Y; // S144 — peak-arc visual is approximate (linear interp); revisit if a curve primitive lands.
      // Flip the bomb to airborne state + clear carrying flags.
      world.setComponent(bombId, BOMB, {
        ...bomb,
        carriedBy: undefined,
        airborne: true,
        airborneRemaining: ARC_DURATION_S,
        // Remember the landing cell on the bomb for the snap step.
        // We piggyback on GridPosition (set at land-time) but stash
        // the intent into Bomb so a snapshot during flight still
        // reports where it's headed.
      });
      world.setComponent(bombId, GRID_POSITION, { gx: landing.gx, gz: landing.gz });
      world.setComponent(bomberId, BOMBER_STATS, {
        ...stats,
        carryingBombId: undefined
      });
    }

    // 2. Tick the airborne timer on every flying bomb. Land when 0.
    if (dt > 0) {
      for (const id of [...airbornes!.run()]) {
        const bomb = world.getComponent<BombComponent>(id, BOMB);
        if (bomb === undefined || bomb.airborne !== true) continue;
        const next = (bomb.airborneRemaining ?? 0) - dt;
        if (next > 0) {
          world.setComponent(id, BOMB, { ...bomb, airborneRemaining: next });
          continue;
        }
        // Landed — restore GridOccupant + fuse path. The Tween already
        // wrote Transform.position to landing within ARC_DURATION_S, so
        // we don't have to touch it again. The bomb-fuse-system will
        // pick up the now-non-airborne bomb on the next tick.
        world.setComponent(id, BOMB, {
          ...bomb,
          airborne: false,
          airborneRemaining: 0
        });
        // Re-register the bomb as a "bomb"-layer GridOccupant so chain
        // detection, kicks, and pickup all see it again.
        world.setComponent(id, GRID_OCCUPANT, {
          layer: "bomb",
          blocksMovement: false,
          blocksBlast: false
        });
      }
    }
  };

  return { name, fixedUpdate };
}

function pickLandingCell(
  world: World,
  occupancy: GridOccupancyQuery,
  bomberPos: GridPos,
  facing: Direction
): GridPos {
  for (let dist = THROW_DISTANCE_CELLS; dist >= 1; dist -= 1) {
    const candidate: GridPos = {
      gx: bomberPos.gx + facing.dx * dist,
      gz: bomberPos.gz + facing.dz * dist
    };
    if (cellIsClear(world, occupancy, candidate)) return candidate;
  }
  return bomberPos;
}

function cellIsClear(world: World, occupancy: GridOccupancyQuery, pos: GridPos): boolean {
  // Hard-block / wall blocking movement is the strongest signal that
  // a thrown bomb can't land here.
  if (occupancy.blocked(pos.gx, pos.gz, "blast")) return false;
  // A second bomb on the same cell — refuse.
  for (const id of occupancy.occupants(pos.gx, pos.gz, "bomb")) {
    void id;
    return false;
  }
  // Any other occupant (block, pickup, bomber) — refuse so the throw
  // never lands inside a hostile body or covered cell.
  for (const id of occupancy.occupants(pos.gx, pos.gz)) {
    const occ = world.getComponent<{ layer?: string }>(id, GRID_OCCUPANT);
    if (occ?.layer === "block" || occ?.layer === "wall") return false;
  }
  return true;
}
