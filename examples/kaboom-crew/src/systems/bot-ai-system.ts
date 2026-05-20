// S82 KABOOM-BOT-AI v0. Decides per-bot `GridMover.queuedDirection`
// every ~0.2 s. Two behaviours:
//
//   1. Flee — when the bot's current cell is reachable by an active
//      bomb's blast, prefer the cardinal that ends in a non-danger
//      cell. Falls back to any passable cardinal if every direction
//      leads to danger (bot is cornered — at least it tries to move).
//   2. Wander — pick a random passable cardinal. Lightly biased toward
//      `lastDecision` to avoid zigzags. Occasionally drops a bomb when
//      a soft block sits in an adjacent cell (aggression dial).
//
// Danger map: for each Bomb in the world, mark its origin cell +
// every cell up to `range` along each cardinal, stopping at any
// blast-blocking occupant. Computed on every decision tick (cheap —
// few bombs at once + small grid).

import type { ComponentName, EntityId } from "../../../../engine/core/ecs/types";
import type { QueryHandle, World } from "../../../../engine/core/ecs/world";
import type { System, SystemContext } from "../../../../engine/core/systems/types";
import { createSeededRng, type SeededRng } from "../../../../engine/core/util/seeded-rng";
import { cellKey } from "../../../../engine/core/grid";
import type { GridOccupancyQuery } from "../../../../engine/core/systems/grid-occupancy-system";

const BOT_BRAIN: ComponentName = "BotBrain";
const GRID_MOVER: ComponentName = "GridMover";
const GRID_POSITION: ComponentName = "GridPosition";
const BOMB: ComponentName = "Bomb";
const BOMBER_STATS: ComponentName = "BomberStats";
const PLACE_BOMB_REQUEST: ComponentName = "PlaceBombRequest";
// S88 KABOOM-BOT-DANGER-AVOID. Live BlastTiles cover an active
// explosion for a fraction of a second — walking onto one kills.
const BLAST_TILE: ComponentName = "BlastTile";
// S89 KABOOM-BOT-PICKUP-MAGNET. Pickup entities live in the world
// with a GridPosition + Pickup component; the bot prefers safe
// neighbours that reduce manhattan distance to the nearest one.
const PICKUP: ComponentName = "Pickup";
/** Pickups beyond this radius are ignored (cheap nearest-search). */
const PICKUP_RADIUS = 5;

function manhattan(ax: number, az: number, bx: number, bz: number): number {
  return Math.abs(ax - bx) + Math.abs(az - bz);
}

const DIRECTIONS: ReadonlyArray<{ dx: number; dz: number }> = [
  { dx: 1, dz: 0 },
  { dx: -1, dz: 0 },
  { dx: 0, dz: 1 },
  { dx: 0, dz: -1 }
];

const DECISION_INTERVAL = 0.2; // seconds between brain ticks

type BotBrain = {
  aggression: number;
  nextDecisionIn?: number;
  lastDecisionDx?: number;
  lastDecisionDz?: number;
};

type GridMoverComponent = {
  speed: number;
  queuedDirection?: { dx: number; dz: number };
  currentLerp?: number;
  targetGx?: number;
  targetGz?: number;
};

type GridPos = { gx: number; gz: number };
type Bomb = { range: number };

export type BotAISystemOptions = {
  occupancy: GridOccupancyQuery;
  /** Deterministic RNG seed — keeps replay recordings reproducible. */
  seed?: number;
  name?: string;
};

export function createKaboomBotAISystem(options: BotAISystemOptions): System {
  const name = options.name ?? "kaboom.bot-ai";
  const rng: SeededRng = createSeededRng(options.seed ?? 1);

  let cachedWorld: World | undefined;
  let bots: QueryHandle | undefined;
  let bombs: QueryHandle | undefined;
  let blastTiles: QueryHandle | undefined;
  let pickups: QueryHandle | undefined;

  function buildDangerMap(world: World): Set<string> {
    const danger = new Set<string>();
    // S88 KABOOM-BOT-DANGER-AVOID. Live BlastTile cells: walking onto
    // one means instant death. Treat them as danger so the bot picks
    // a longer path that avoids the active fan-out of an explosion
    // that's still in flight.
    if (blastTiles !== undefined) {
      for (const id of blastTiles.run()) {
        const pos = world.getComponent<GridPos>(id, GRID_POSITION);
        if (pos === undefined) continue;
        danger.add(cellKey(pos.gx, pos.gz));
      }
    }
    for (const id of bombs!.run()) {
      const pos = world.getComponent<GridPos>(id, GRID_POSITION);
      const bomb = world.getComponent<Bomb>(id, BOMB);
      if (pos === undefined || bomb === undefined) continue;
      danger.add(cellKey(pos.gx, pos.gz));
      for (const dir of DIRECTIONS) {
        for (let step = 1; step <= bomb.range; step += 1) {
          const gx = pos.gx + dir.dx * step;
          const gz = pos.gz + dir.dz * step;
          if (options.occupancy.blocked(gx, gz, "blast")) break;
          danger.add(cellKey(gx, gz));
          // Soft blocks shield further cells.
          // GridOccupancyQuery.blocked('blast') is true only for hard
          // walls; we manually check for any block-layer occupant + stop.
          let softHere = false;
          for (const occId of options.occupancy.occupants(gx, gz)) {
            if (options.occupancy.blocked(gx, gz, "movement") && !options.occupancy.blocked(gx, gz, "blast")) {
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

  function passableNeighbours(pos: GridPos): Array<{ dx: number; dz: number; gx: number; gz: number }> {
    const out: Array<{ dx: number; dz: number; gx: number; gz: number }> = [];
    for (const dir of DIRECTIONS) {
      const gx = pos.gx + dir.dx;
      const gz = pos.gz + dir.dz;
      if (options.occupancy.blocked(gx, gz, "movement")) continue;
      out.push({ ...dir, gx, gz });
    }
    return out;
  }

  /**
   * S89 KABOOM-BOT-PICKUP-MAGNET. Cheap nearest-search over Pickup
   * entities within PICKUP_RADIUS manhattan; pickups in dangerous
   * cells are skipped so the magnet never overrides danger-avoid.
   */
  function nearestPickup(world: World, pos: GridPos, danger: Set<string>): { gx: number; gz: number } | undefined {
    if (pickups === undefined) return undefined;
    let best: { gx: number; gz: number; dist: number } | undefined;
    for (const id of pickups.run()) {
      const p = world.getComponent<GridPos>(id, GRID_POSITION);
      if (p === undefined) continue;
      if (danger.has(cellKey(p.gx, p.gz))) continue;
      const dist = manhattan(pos.gx, pos.gz, p.gx, p.gz);
      if (dist > PICKUP_RADIUS) continue;
      if (best === undefined || dist < best.dist) best = { gx: p.gx, gz: p.gz, dist };
    }
    if (best === undefined) return undefined;
    return { gx: best.gx, gz: best.gz };
  }

  function decideDirection(
    pos: GridPos,
    brain: BotBrain,
    danger: Set<string>,
    pickupGoal: { gx: number; gz: number } | undefined
  ): { dx: number; dz: number } {
    const neighbours = passableNeighbours(pos);
    if (neighbours.length === 0) return { dx: 0, dz: 0 };

    const inDanger = danger.has(cellKey(pos.gx, pos.gz));
    // S88 KABOOM-BOT-DANGER-AVOID. Always prefer neighbours that are
    // NOT in the danger map. Previously, only the flee path filtered;
    // the wander path could (and regularly did) randomly step into a
    // live blast or about-to-explode bomb. Falls back to ANY neighbour
    // when every adjacent cell is dangerous so the bot still moves
    // when boxed in.
    const safeNeighbours = neighbours.filter((n) => !danger.has(cellKey(n.gx, n.gz)));
    const pool = safeNeighbours.length > 0 ? safeNeighbours : neighbours;

    if (inDanger) {
      // Flee — uniform random over the safe pool so we don't bias
      // toward the bot's last heading (which got it into danger).
      const choice = pool[Math.floor(rng.next() * pool.length)]!;
      return { dx: choice.dx, dz: choice.dz };
    }

    // S89 KABOOM-BOT-PICKUP-MAGNET. When a non-dangerous pickup is
    // within PICKUP_RADIUS, prefer the safe neighbour that minimises
    // manhattan distance to it. Falls through to normal wander when
    // no pickup is in range OR every distance-reducing neighbour is
    // dangerous. Danger-avoid still wins (pool is the safe-filtered
    // set above).
    if (pickupGoal !== undefined) {
      const here = manhattan(pos.gx, pos.gz, pickupGoal.gx, pickupGoal.gz);
      const closer = pool.filter((n) => manhattan(n.gx, n.gz, pickupGoal.gx, pickupGoal.gz) < here);
      if (closer.length > 0) {
        const choice = closer[Math.floor(rng.next() * closer.length)]!;
        return { dx: choice.dx, dz: choice.dz };
      }
    }

    // Wander — light bias to continue in last direction if still
    // passable AND not dangerous, otherwise pick from the safe pool.
    if (
      brain.lastDecisionDx !== undefined &&
      brain.lastDecisionDz !== undefined &&
      (brain.lastDecisionDx !== 0 || brain.lastDecisionDz !== 0) &&
      rng.next() < 0.6
    ) {
      const match = pool.find((n) => n.dx === brain.lastDecisionDx && n.dz === brain.lastDecisionDz);
      if (match !== undefined) return { dx: match.dx, dz: match.dz };
    }
    const choice = pool[Math.floor(rng.next() * pool.length)]!;
    return { dx: choice.dx, dz: choice.dz };
  }

  function shouldDropBomb(
    world: World,
    botId: EntityId,
    pos: GridPos,
    brain: BotBrain,
    danger: Set<string>
  ): boolean {
    if (danger.has(cellKey(pos.gx, pos.gz))) return false; // not while fleeing
    const stats = world.getComponent<{ activeBombs?: number; maxBombs: number; alive?: boolean }>(botId, BOMBER_STATS);
    if (stats === undefined || stats.alive === false) return false;
    if ((stats.activeBombs ?? 0) >= stats.maxBombs) return false;
    // Adjacent soft block? Look at the four cardinals — if any
    // contains a movement-blocking, non-blast-blocking occupant, it's
    // a soft block.
    for (const dir of DIRECTIONS) {
      const gx = pos.gx + dir.dx;
      const gz = pos.gz + dir.dz;
      if (
        options.occupancy.blocked(gx, gz, "movement") &&
        !options.occupancy.blocked(gx, gz, "blast")
      ) {
        return rng.next() < brain.aggression;
      }
    }
    return false;
  }

  const fixedUpdate = (context: SystemContext): void => {
    const world = context.world;
    if (world !== cachedWorld) {
      bots = world.createQuery([BOT_BRAIN, GRID_MOVER, GRID_POSITION]);
      bombs = world.createQuery([BOMB, GRID_POSITION]);
      blastTiles = world.createQuery([BLAST_TILE, GRID_POSITION]);
      pickups = world.createQuery([PICKUP, GRID_POSITION]);
      cachedWorld = world;
    }
    // S84 KABOOM-TITLE-SCREEN. Game freezes while a GamePaused
    // singleton is present — bot decisions don't run so the title
    // screen looks static until the player commits.
    if (world.hasComponent("kaboom.game-state", "GamePaused")) return;
    const dt = Math.max(0, context.time.fixedDt);
    let danger: Set<string> | undefined;
    for (const botId of bots!.run()) {
      const brain = world.getComponent<BotBrain>(botId, BOT_BRAIN);
      if (brain === undefined) continue;
      const stats = world.getComponent<{ alive?: boolean }>(botId, BOMBER_STATS);
      if (stats !== undefined && stats.alive === false) continue;

      const cooldown = (brain.nextDecisionIn ?? 0) - dt;
      if (cooldown > 0) {
        world.setComponent(botId, BOT_BRAIN, { ...brain, nextDecisionIn: cooldown });
        continue;
      }
      const pos = world.getComponent<GridPos>(botId, GRID_POSITION);
      if (pos === undefined) {
        world.setComponent(botId, BOT_BRAIN, { ...brain, nextDecisionIn: DECISION_INTERVAL });
        continue;
      }
      if (danger === undefined) danger = buildDangerMap(world);
      const pickupGoal = nearestPickup(world, pos, danger);
      const direction = decideDirection(pos, brain, danger, pickupGoal);

      const mover = world.getComponent<GridMoverComponent>(botId, GRID_MOVER);
      if (mover !== undefined) {
        world.setComponent(botId, GRID_MOVER, { ...mover, queuedDirection: direction });
      }
      world.setComponent(botId, BOT_BRAIN, {
        ...brain,
        nextDecisionIn: DECISION_INTERVAL,
        lastDecisionDx: direction.dx,
        lastDecisionDz: direction.dz
      });

      if (shouldDropBomb(world, botId, pos, brain, danger)) {
        if (!world.hasComponent(botId, PLACE_BOMB_REQUEST)) {
          world.setComponent(botId, PLACE_BOMB_REQUEST, {});
        }
      }
    }
  };

  return { name, fixedUpdate };
}
