// S251 — second slice of the per-concern split of bot-ai-helpers.ts
// (S250 extracted the acceleration concern). This module owns the
// perception primitives the bot AI uses to read world state:
//
//   - Types: BotQueryHandleLike, BotOccupancyQuery, BotPersonality
//   - Shared constants: DIRECTIONS_4 + component name strings (also
//     consumed by the tactical / goal / decision helpers that still
//     live in bot-ai-helpers.ts — imported back from there).
//   - playerInDashLine — alive-player detector along a cardinal line
//   - predictNextCell — straight-line trajectory predictor
//   - buildBotDangerMap — danger-cell Set for pathfinding
//   - botPassableNeighbours — cardinal neighbours that are movement-passable
//
// Pure reads; no closure state. `bot-ai-helpers.ts` re-exports
// everything so existing imports stay unchanged.

import type { ComponentName, EntityId } from "../../../../engine/core/ecs/types";
import type { World } from "../../../../engine/core/ecs/world";
import { cellKey } from "../../../../engine/core/grid";

// Component name strings — exported so the still-in-helpers tactical /
// goal / decision functions can share them without redeclaring.
export const BOMBER_STATS: ComponentName = "BomberStats";
export const GRID_POSITION: ComponentName = "GridPosition";
export const BOMB: ComponentName = "Bomb";

/** Cardinal step deltas used by the perception + decision helpers. */
export const DIRECTIONS_4: ReadonlyArray<{ dx: number; dz: number }> = [
  { dx: 1, dz: 0 },
  { dx: -1, dz: 0 },
  { dx: 0, dz: 1 },
  { dx: 0, dz: -1 }
];

/** S236 V1 — minimal QueryHandle shape the helpers need. Exporting it
 *  keeps the helper signatures decoupled from the live `QueryHandle<T>`
 *  type so unit tests can pass plain `{ run: () => [...] }` stubs. */
export type BotQueryHandleLike = { run(): Iterable<EntityId> };

/** S236 V1 — minimal GridOccupancyQuery surface the helpers consume.
 *  Matches `engine/core/systems/grid-occupancy-system::GridOccupancyQuery`
 *  but typed structurally so tests don't have to build a real one. */
export type BotOccupancyQuery = {
  blocked: (gx: number, gz: number, layer: "movement" | "blast") => boolean;
  occupants: (gx: number, gz: number, key?: string) => Iterable<EntityId>;
};

// S100 KABOOM-BOT-PERSONALITY-VARIANTS. Each personality biases two
// decisions: WHERE to wander + WHEN to drop a bomb.
export type BotPersonality = "hunter" | "coward" | "miner";

/** S206 — true when an alive player.* bomber sits 2 or 3 cells in
 *  `(dx, dz)` direction from `(pos.gx, pos.gz)`, on the same row or
 *  column as the bot. */
export function playerInDashLine(
  world: World,
  pos: { gx: number; gz: number },
  direction: { dx: number; dz: number }
): boolean {
  if (direction.dx === 0 && direction.dz === 0) return false;
  if (direction.dx !== 0 && direction.dz !== 0) return false; // cardinal only
  for (const id of world.entityIds()) {
    if (!id.startsWith("player.")) continue;
    if (!world.hasComponent(id, BOMBER_STATS)) continue;
    const stats = world.getComponent<{ alive?: boolean }>(id, BOMBER_STATS);
    if (stats?.alive === false) continue;
    const gp = world.getComponent<{ gx?: number; gz?: number }>(id, GRID_POSITION);
    if (gp?.gx === undefined || gp?.gz === undefined) continue;
    const stepGx = gp.gx - pos.gx;
    const stepGz = gp.gz - pos.gz;
    if (direction.dx !== 0) {
      if (stepGz !== 0) continue;
      const dist = stepGx * Math.sign(direction.dx);
      if (dist === 2 || dist === 3) return true;
    } else {
      if (stepGx !== 0) continue;
      const dist = stepGz * Math.sign(direction.dz);
      if (dist === 2 || dist === 3) return true;
    }
  }
  return false;
}

/** S225 — predict next cell from straight-line trajectory. */
export function predictNextCell(
  recent: ReadonlyArray<{ gx: number; gz: number }>
): { gx: number; gz: number } | undefined {
  if (recent.length < 3) return undefined;
  const a = recent[recent.length - 3]!;
  const b = recent[recent.length - 2]!;
  const c = recent[recent.length - 1]!;
  const dx1 = b.gx - a.gx;
  const dz1 = b.gz - a.gz;
  const dx2 = c.gx - b.gx;
  const dz2 = c.gz - b.gz;
  if (dx1 !== dx2 || dz1 !== dz2) return undefined;
  if (Math.abs(dx1) + Math.abs(dz1) !== 1) return undefined;
  return { gx: c.gx + dx1, gz: c.gz + dz1 };
}

/** S236 V1 — danger map for bot pathfinding. For each Bomb in
 *  `bombs.run()`, mark its origin cell + every cell up to `bomb.range`
 *  along each cardinal, stopping at blast-blocking occupants OR at the
 *  first soft block (which absorbs the blast). Also marks every live
 *  BlastTile cell so the bot won't walk INTO an in-flight explosion. */
export function buildBotDangerMap(
  world: World,
  deps: {
    occupancy: BotOccupancyQuery;
    bombs: BotQueryHandleLike;
    blastTiles?: BotQueryHandleLike;
  }
): Set<string> {
  const danger = new Set<string>();
  // S88 — live BlastTile cells: walking onto one means instant death.
  if (deps.blastTiles !== undefined) {
    for (const id of deps.blastTiles.run()) {
      const pos = world.getComponent<{ gx?: number; gz?: number }>(id, GRID_POSITION);
      if (pos?.gx === undefined || pos.gz === undefined) continue;
      danger.add(cellKey(pos.gx, pos.gz));
    }
  }
  for (const id of deps.bombs.run()) {
    const pos = world.getComponent<{ gx?: number; gz?: number }>(id, GRID_POSITION);
    const bomb = world.getComponent<{ range?: number }>(id, BOMB);
    if (pos?.gx === undefined || pos.gz === undefined) continue;
    if (bomb?.range === undefined) continue;
    danger.add(cellKey(pos.gx, pos.gz));
    for (const dir of DIRECTIONS_4) {
      for (let step = 1; step <= bomb.range; step += 1) {
        const gx = pos.gx + dir.dx * step;
        const gz = pos.gz + dir.dz * step;
        if (deps.occupancy.blocked(gx, gz, "blast")) break;
        danger.add(cellKey(gx, gz));
        // Soft blocks shield further cells. `blocked('blast')` is
        // hard-walls only; a movement-blocking occupant that isn't
        // blast-blocking is a soft block.
        let softHere = false;
        for (const occId of deps.occupancy.occupants(gx, gz)) {
          if (deps.occupancy.blocked(gx, gz, "movement") && !deps.occupancy.blocked(gx, gz, "blast")) {
            softHere = true;
            break;
          }
          void occId;
        }
        if (softHere) break;
      }
    }
  }
  return danger;
}

/** S236 V1 — cardinals from `pos` that are movement-passable. Pure
 *  read; no allocation beyond the result array. */
export function botPassableNeighbours(
  pos: { gx: number; gz: number },
  occupancy: BotOccupancyQuery
): Array<{ dx: number; dz: number; gx: number; gz: number }> {
  const out: Array<{ dx: number; dz: number; gx: number; gz: number }> = [];
  for (const dir of DIRECTIONS_4) {
    const gx = pos.gx + dir.dx;
    const gz = pos.gz + dir.dz;
    if (occupancy.blocked(gx, gz, "movement")) continue;
    out.push({ dx: dir.dx, dz: dir.dz, gx, gz });
  }
  return out;
}
