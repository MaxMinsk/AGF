// S90 KABOOM-MINIMAP-DANGER-OVERLAY.
//
// Shared helper for "which cells are about to be set on fire" — used
// by BotAISystem (avoid these cells when wandering) AND by the
// project-local minimap overlay (paint these cells red). Mirrors the
// projection blast-propagation actually walks: from each live Bomb,
// fan four cardinals up to Bomb.range, stopping at the first
// blast-blocking cell. Hard walls block; soft blocks block but
// themselves catch fire.

import type { EntityId } from "../../../engine/core/ecs/types";
import type { World } from "../../../engine/core/ecs/world";
import type { GridOccupancyQuery } from "../../../engine/core/systems/grid-occupancy-system";

type Bomb = { range: number };
type GridPos = { gx: number; gz: number };

const BOMB = "Bomb";
const GRID_POSITION = "GridPosition";

const DIRECTIONS: ReadonlyArray<{ dx: number; dz: number }> = [
  { dx: 1, dz: 0 },
  { dx: -1, dz: 0 },
  { dx: 0, dz: 1 },
  { dx: 0, dz: -1 }
];

export type DangerCell = { gx: number; gz: number };

/**
 * Union of cells covered by every live Bomb's projected blast. The
 * caller can convert to minimap markers or a danger Set keyed by
 * `${gx},${gz}`. Pure function — no caching, no allocations beyond
 * the returned array.
 */
export function projectedBlastCells(world: World, occupancy: GridOccupancyQuery): ReadonlyArray<DangerCell> {
  const seen = new Set<string>();
  const out: DangerCell[] = [];
  const push = (gx: number, gz: number): void => {
    const key = `${gx},${gz}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ gx, gz });
  };
  for (const id of world.createQuery([BOMB, GRID_POSITION]).run()) {
    const pos = world.getComponent<GridPos>(id, GRID_POSITION);
    const bomb = world.getComponent<Bomb>(id, BOMB);
    if (pos === undefined || bomb === undefined) continue;
    push(pos.gx, pos.gz);
    for (const dir of DIRECTIONS) {
      for (let step = 1; step <= bomb.range; step += 1) {
        const gx = pos.gx + dir.dx * step;
        const gz = pos.gz + dir.dz * step;
        if (occupancy.blocked(gx, gz, "blast")) break;
        push(gx, gz);
        // Soft-block stop: a movement-blocking, non-blast-blocking
        // occupant catches fire and stops further propagation.
        let softHere = false;
        for (const occId of occupancy.occupants(gx, gz)) {
          if (occupancy.blocked(gx, gz, "movement") && !occupancy.blocked(gx, gz, "blast")) {
            softHere = true;
            break;
          }
          void occId;
        }
        if (softHere) break;
      }
    }
  }
  return out;
}

// Re-export for tests that need the same suppressed-unused pattern.
export type _DangerExports = EntityId;
