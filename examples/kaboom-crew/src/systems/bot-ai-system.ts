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
const DASH_REQUEST: ComponentName = "DashRequest";
const REMOTE_DETONATE_REQUEST: ComponentName = "RemoteDetonateRequest";
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

// S100 KABOOM-BOT-PERSONALITY-VARIANTS. 'hunter' / 'coward' / 'miner'
// drive both the wander goal + the bomb-drop rate. The type lives in
// bot-ai-helpers (S234 refactor); re-export keeps existing imports
// from `bot-ai-system` working.
export { type BotPersonality } from "./bot-ai-helpers";
import type { BotPersonality } from "./bot-ai-helpers";
// S234 — re-export the pure tactical/decision helpers from their
// new home so tests + downstream callers don't have to update
// their import paths. New code can import directly from
// `bot-ai-helpers` to avoid the indirection.
export {
  BOT_ACCELERATION_BASE_BOOST_DEFAULT,
  BOT_ACCELERATION_ESCALATION_CAP,
  BOT_ACCELERATION_ESCALATION_INTERVAL_S,
  BOT_ACCELERATION_ESCALATION_STEP,
  botAccelerationBoost,
  botPassableNeighbours,
  buildBotDangerMap,
  countAliveBombers,
  countSoftBlocksInLine,
  maybeFireBotThrow,
  personalityTallyBias,
  playerInDashLine,
  predictNextCell,
  shouldRemoteDetonate,
  wouldKillEnemyAt
} from "./bot-ai-helpers";
import {
  BOT_ACCELERATION_BASE_BOOST_DEFAULT,
  botAccelerationBoost,
  botPassableNeighbours,
  buildBotDangerMap,
  countAliveBombers,
  countSoftBlocksInLine,
  maybeFireBotThrow,
  personalityTallyBias,
  playerInDashLine,
  predictNextCell,
  shouldRemoteDetonate,
  wouldKillEnemyAt
} from "./bot-ai-helpers";

type BotBrain = {
  aggression: number;
  personality?: BotPersonality;
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
type BomberStatsForDash = {
  alive?: boolean;
  dashing?: boolean;
  dashCooldownRemainingMs?: number;
};

export type BotAISystemOptions = {
  occupancy: GridOccupancyQuery;
  /** Deterministic RNG seed — keeps replay recordings reproducible. */
  seed?: number;
  name?: string;
  /** S210 KABOOM-BOT-ACCELERATION — disable bot-only round
   *  acceleration (URL `?botAccelerate=off`). Defaults to enabled. */
  accelerationDisabled?: boolean;
  /** S210 — base aggression boost added once all humans die and 2+
   *  bots remain. URL `?botAccelerationBoost=N`. Default 0.25. */
  accelerationBaseBoost?: number;
};

// S210 KABOOM-BOT-ACCELERATION constants + helpers live in
// bot-ai-helpers.ts (re-exported above).

export function createKaboomBotAISystem(options: BotAISystemOptions): System {
  const name = options.name ?? "kaboom.bot-ai";
  const rng: SeededRng = createSeededRng(options.seed ?? 1);
  const accelerationDisabled = options.accelerationDisabled === true;
  const accelerationBaseBoost = Math.max(
    0,
    options.accelerationBaseBoost ?? BOT_ACCELERATION_BASE_BOOST_DEFAULT
  );

  let cachedWorld: World | undefined;
  let bots: QueryHandle | undefined;
  let bombs: QueryHandle | undefined;
  let blastTiles: QueryHandle | undefined;
  let pickups: QueryHandle | undefined;
  // S210 — simulation seconds (context.time.elapsed) when all human
  // PlayerControlled bombers first died with 2+ bots still alive.
  // Reset on world change or whenever a human is alive again (round
  // restart, revive, reconnect-within-grace).
  let humansAllDeadAt: number | undefined;
  // S225 — per-player ring of the last 3 grid positions observed.
  // Populated at the top of each fixedUpdate; the hunter chase
  // path consults `anticipatedPlayerCell` to project a straight-
  // line trajectory into the next cell.
  const playerTracks = new Map<EntityId, ReadonlyArray<GridPos>>();
  // S210 hotfix — only arm the boost when at least one PlayerControlled
  // bomber was ALIVE earlier in the round. Demos / regression tests
  // run pure bot-vs-bot from frame 1 (no humans ever) and must keep
  // their deterministic baseline behaviour; the boost is a 'humans
  // DIED' response, not a 'no humans here' response.
  let humansEverAlive = false;

  // S236 V1 — `buildDangerMap` + `passableNeighbours` were extracted
  // to bot-ai-helpers (`buildBotDangerMap` / `botPassableNeighbours`).
  // Local thunks here keep the call-sites + closure-captured query
  // handles unchanged. Behaviour preserving.
  function buildDangerMap(world: World): Set<string> {
    const deps: { occupancy: GridOccupancyQuery; bombs: QueryHandle; blastTiles?: QueryHandle } = {
      occupancy: options.occupancy,
      bombs: bombs!
    };
    if (blastTiles !== undefined) deps.blastTiles = blastTiles;
    return buildBotDangerMap(world, deps);
  }

  function passableNeighbours(pos: GridPos): Array<{ dx: number; dz: number; gx: number; gz: number }> {
    return botPassableNeighbours(pos, options.occupancy);
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

  // S100 KABOOM-BOT-PERSONALITY-VARIANTS — pick the goal cell that
  // the bias-toward path should chase, based on the bot's personality.
  //
  // 'hunter' (default): nearest player (PlayerControlled + GridPosition)
  // within sight, falling back to the existing pickup magnet.
  //
  // 'coward': no goal — the bot just wanders the safe pool. Avoiding
  // the player is implicit: hunter would chase, coward simply doesn't.
  //
  // 'miner': nearest pickup OR nearest soft block, whichever is closer.
  // Soft blocks are movement-blocking, non-blast-blocking occupants
  // (same predicate the shouldDropBomb path uses).
  function personalityGoal(
    world: World,
    pos: GridPos,
    personality: BotPersonality,
    danger: Set<string>
  ): { gx: number; gz: number } | undefined {
    if (personality === "coward") return undefined;
    if (personality === "miner") {
      const pickupGoal = nearestPickup(world, pos, danger);
      const softGoal = nearestSoftBlock(world, pos, danger);
      if (pickupGoal === undefined) return softGoal;
      if (softGoal === undefined) return pickupGoal;
      const dPickup = manhattan(pos.gx, pos.gz, pickupGoal.gx, pickupGoal.gz);
      const dSoft = manhattan(pos.gx, pos.gz, softGoal.gx, softGoal.gz);
      return dPickup <= dSoft ? pickupGoal : softGoal;
    }
    // hunter (default): chase nearest player; fall through to pickup.
    // S225 — anticipatedPlayerCell returns the projected next cell
    // when the player has been moving in a straight line for ≥ 3
    // ticks, else falls back to the current cell. Hunter aims
    // ahead of the player so chase + bomb-place land WHERE the
    // player will be.
    const playerGoal = anticipatedPlayerCell(world, pos);
    if (playerGoal !== undefined) return playerGoal;
    return nearestPickup(world, pos, danger);
  }

  /** S220 — KICK opportunity detector. For each cardinal direction
   *  D, returns D iff:
   *    - the bot has BomberStats.canKick === true,
   *    - the cell ahead (pos + D) holds one of THIS bot's own bombs,
   *    - the cell beyond (pos + 2·D) is movement-passable,
   *    - some alive enemy bomber sits between 2 and 6 cells from
   *      the bot along D (same row / column, line-of-sight stops
   *      at any movement-blocking cell).
   *  Returns undefined when no cardinal qualifies. Pure read — the
   *  caller overrides direction; bomb-kick-system does the actual
   *  bomb-slide once the bot walks INTO the bomb cell. */
  function findKickOpportunity(
    world: World,
    botId: EntityId,
    pos: GridPos,
    canKick: boolean
  ): { dx: number; dz: number } | undefined {
    if (!canKick) return undefined;
    for (const dir of DIRECTIONS) {
      const aheadGx = pos.gx + dir.dx;
      const aheadGz = pos.gz + dir.dz;
      // Own bomb in the ahead cell?
      let ownBombHere = false;
      for (const id of options.occupancy.occupants(aheadGx, aheadGz, "bomb")) {
        const bomb = world.getComponent<{ ownerId?: string }>(id, BOMB);
        if (bomb?.ownerId === botId) { ownBombHere = true; break; }
      }
      if (!ownBombHere) continue;
      // Beyond cell must be movement-clear (the kick path needs
      // somewhere to push the bomb to). The mechanic also refuses to
      // stack two bombs at the beyond cell — close enough for the
      // bot-side check.
      const beyondGx = aheadGx + dir.dx;
      const beyondGz = aheadGz + dir.dz;
      if (options.occupancy.blocked(beyondGx, beyondGz, "movement")) continue;
      // Alive enemy bomber along this direction, 2..6 cells away.
      for (let step = 2; step <= 6; step += 1) {
        const probeGx = pos.gx + dir.dx * step;
        const probeGz = pos.gz + dir.dz * step;
        if (step > 2 && options.occupancy.blocked(probeGx, probeGz, "movement")) break;
        for (const id of world.entityIds()) {
          if (id === botId) continue;
          if (!world.hasComponent(id, BOMBER_STATS)) continue;
          const s = world.getComponent<{ alive?: boolean }>(id, BOMBER_STATS);
          if (s?.alive === false) continue;
          const p = world.getComponent<GridPos>(id, GRID_POSITION);
          if (p === undefined) continue;
          if (p.gx === probeGx && p.gz === probeGz) {
            return { dx: dir.dx, dz: dir.dz };
          }
        }
      }
    }
    return undefined;
  }

  /** S210 — when HUMANS_DEAD is active, every personality (including
   *  coward) targets the nearest alive non-self bomber. This is what
   *  makes coward + coward stop their mutual avoidance and engage.
   *  Returns undefined when no other bomber is alive. */
  function nearestOtherBomberCell(
    world: World,
    selfId: EntityId,
    pos: GridPos
  ): { gx: number; gz: number } | undefined {
    let best: { gx: number; gz: number; dist: number } | undefined;
    for (const id of world.entityIds()) {
      if (id === selfId) continue;
      if (!world.hasComponent(id, BOMBER_STATS)) continue;
      const stats = world.getComponent<{ alive?: boolean }>(id, BOMBER_STATS);
      if (stats?.alive === false) continue;
      const p = world.getComponent<GridPos>(id, GRID_POSITION);
      if (p === undefined) continue;
      const dist = manhattan(pos.gx, pos.gz, p.gx, p.gz);
      if (best === undefined || dist < best.dist) best = { gx: p.gx, gz: p.gz, dist };
    }
    return best === undefined ? undefined : { gx: best.gx, gz: best.gz };
  }

  function nearestPlayer(world: World, pos: GridPos): { gx: number; gz: number } | undefined {
    let best: { gx: number; gz: number; dist: number } | undefined;
    // agf-allow: world.query — bot AI ticks at DECISION_INTERVAL (~5 Hz), not per-frame.
    for (const id of world.query(["PlayerControlled", GRID_POSITION])) {
      const p = world.getComponent<GridPos>(id, GRID_POSITION);
      if (p === undefined) continue;
      const dist = manhattan(pos.gx, pos.gz, p.gx, p.gz);
      if (dist > PICKUP_RADIUS * 2) continue; // 'hunter' sees further than the pickup magnet
      if (best === undefined || dist < best.dist) best = { gx: p.gx, gz: p.gz, dist };
    }
    if (best === undefined) return undefined;
    return { gx: best.gx, gz: best.gz };
  }

  /** S225 — player anticipation. Returns the projected NEXT cell of
   *  the player nearest to `pos` if the player's last 3 tracked
   *  positions form a straight cardinal line (one direction, no
   *  reversal), else falls back to the current cell from
   *  nearestPlayer. The hunter chases the predicted cell to land
   *  bombs WHERE the player will be, not where they ARE — adds
   *  real difficulty without making the AI feel cheap, because
   *  the prediction only fires on committed straight runs. */
  function anticipatedPlayerCell(world: World, pos: GridPos): { gx: number; gz: number } | undefined {
    const here = nearestPlayer(world, pos);
    if (here === undefined) return undefined;
    // Find the player id matching `here` — track is keyed by id.
    let trackedId: EntityId | undefined;
    // agf-allow: world.query — bot AI ticks at DECISION_INTERVAL (~5 Hz), not per-frame.
    for (const id of world.query(["PlayerControlled", GRID_POSITION])) {
      const p = world.getComponent<GridPos>(id, GRID_POSITION);
      if (p?.gx === here.gx && p?.gz === here.gz) {
        trackedId = id;
        break;
      }
    }
    if (trackedId === undefined) return here;
    const recent = playerTracks.get(trackedId);
    if (recent === undefined) return here;
    const predicted = predictNextCell(recent);
    return predicted ?? here;
  }

  function nearestSoftBlock(world: World, pos: GridPos, danger: Set<string>): { gx: number; gz: number } | undefined {
    let best: { gx: number; gz: number; dist: number } | undefined;
    // agf-allow: world.query — same cadence as above.
    for (const id of world.query([GRID_POSITION, "GridOccupant"])) {
      const p = world.getComponent<GridPos>(id, GRID_POSITION);
      if (p === undefined) continue;
      const occ = world.getComponent<{ layer?: string; blocksMovement?: boolean; blocksBlast?: boolean }>(id, "GridOccupant");
      // Soft block = movement-blocker AND NOT blast-blocker (hard walls block both).
      if (occ?.blocksMovement !== true || occ?.blocksBlast === true) continue;
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
    danger: Set<string>,
    boost: number
  ): boolean {
    if (danger.has(cellKey(pos.gx, pos.gz))) return false; // not while fleeing
    const stats = world.getComponent<{
      activeBombs?: number;
      maxBombs: number;
      range?: number;
      alive?: boolean;
      remoteDetonateCharges?: number;
      shield?: boolean;
      pierce?: boolean;
    }>(botId, BOMBER_STATS);
    if (stats === undefined || stats.alive === false) return false;
    if ((stats.activeBombs ?? 0) >= stats.maxBombs) return false;

    // S221 — REMOTE-DETONATE tactical placement. When the bot holds
    // any remote charges, the next-placed bomb spawns paused
    // (fuseRemaining=Infinity). If an alive enemy already sits in
    // the would-be bomb's blast radius, placing here turns the
    // bomb into a trap-with-trigger — S204 `shouldRemoteDetonate`
    // fires on the next tick as long as the enemy stays in range,
    // and the bot dashes off the bomb cell using the existing
    // flee path (danger map adds the new bomb next tick). High-
    // value shot; the bot commits past aggression dice + the
    // adjacent-soft-block requirement.
    if ((stats.remoteDetonateCharges ?? 0) > 0) {
      const range = Math.max(1, Math.floor(stats.range ?? 2));
      if (wouldKillEnemyAt(world, botId, pos, range)) {
        return true;
      }
    }

    // S222 — SHIELD tactical placement. Parallel to S221's remote
    // branch but for the shield power-up: bot trades a free hit
    // for a clean shot. When the shield is up AND an alive enemy
    // sits in the would-be bomb's blast from the bot's current
    // cell, drop the bomb. Best case the bot dashes off and kills
    // the enemy clean; worst case the shield absorbs the trade
    // and the bomber's alive=true survives. Same approximation
    // as S221 (no wall-stop math here — the blast walker handles
    // real stops at fire time, over-trigger preferable).
    if (stats.shield === true) {
      const range = Math.max(1, Math.floor(stats.range ?? 2));
      if (wouldKillEnemyAt(world, botId, pos, range)) {
        return true;
      }
    }

    // S100 KABOOM-BOT-PERSONALITY-VARIANTS — personality scales the
    // base aggression. 'coward' bombs more eagerly as a defensive
    // shield; 'miner' bombs more eagerly toward soft blocks. 'hunter'
    // uses the unscaled aggression.
    // S210 — `boost` is the HUMANS_DEAD acceleration term; it's
    // additive on top of the personality scale (cap 1.0).
    const persona = brain.personality ?? "hunter";
    const aggressionScale = persona === "coward" ? 1.5 : persona === "miner" ? 1.4 : 1.0;
    // S227 — tally-driven personality bias (GDP-2026-05-29-010 L2).
    // When the bots are leading 2+ rounds, Coward stops orbiting +
    // gains aggression; when the bots are trailing 2+ rounds,
    // Hunter dials back risky placements. Miner ignores the tally
    // (it focuses on soft blocks regardless of score).
    const tallyBias = personalityTallyBias(world, persona);
    const aggression = Math.min(1, Math.max(0, brain.aggression * aggressionScale + boost + tallyBias));
    // S210 — also place bombs on EMPTY cells (no soft-block adjacent)
    // when boosted. The GDP calls for "+20% bomb-place rate" on top of
    // the personality bias; lifting the soft-block requirement under
    // acceleration is what actually drives bot-vs-bot resolution.
    const boosting = boost > 0;
    // S223 — PIERCE tactical placement. When the bomber holds the
    // pierce power-up, the placed bomb's blast walks through the
    // first soft block in each direction (per S142). If THIS cell
    // has any cardinal with 2+ soft blocks in line, the pierce
    // bomb is high-value (one bomb clears two crates). Commit
    // past the aggression dice in that case — pierce bombs are
    // rare enough that we don't want the bot to fritter them on
    // single-crate sites. Falls through to the standard adjacent-
    // soft-block check if no double-line found.
    if (stats.pierce === true) {
      for (const dir of DIRECTIONS) {
        if (countSoftBlocksInLine(options.occupancy, pos, dir, 2) >= 2) {
          return true;
        }
      }
    }
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
        return rng.next() < aggression;
      }
    }
    if (boosting) {
      // Under HUMANS_DEAD acceleration, bots will bomb open cells too,
      // since no soft blocks usually remain by then. Probability scales
      // with `boost` so early HUMANS_DEAD is gentler than escalated.
      return rng.next() < Math.min(1, boost);
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
      humansAllDeadAt = undefined;
      humansEverAlive = false;
      playerTracks.clear();
    }
    // S84 KABOOM-TITLE-SCREEN. Game freezes while a GamePaused
    // singleton is present — bot decisions don't run so the title
    // screen looks static until the player commits.
    if (world.hasComponent("kaboom.game-state", "GamePaused")) return;

    // S225 — refresh per-player tracking ring. Append the current
    // cell for every PlayerControlled bomber; keep the last 3 cells
    // so `predictNextCell` can see a straight-line trajectory.
    // Static map across the whole bot loop so all bots that tick
    // this fixedUpdate consult the SAME snapshot — keeps decisions
    // coherent.
    // agf-allow: world.query — bot AI ticks at 5 Hz, not per-frame.
    for (const id of world.query(["PlayerControlled", GRID_POSITION])) {
      const p = world.getComponent<GridPos>(id, GRID_POSITION);
      if (p === undefined) continue;
      const prev = playerTracks.get(id) ?? [];
      const last = prev[prev.length - 1];
      if (last !== undefined && last.gx === p.gx && last.gz === p.gz) continue; // dedupe stationary
      const next = [...prev.slice(-2), { gx: p.gx, gz: p.gz }];
      playerTracks.set(id, next);
    }
    const dt = Math.max(0, context.time.fixedDt);
    let danger: Set<string> | undefined;

    // S210 KABOOM-BOT-ACCELERATION — detect HUMANS_DEAD edge.
    // Triggers ONLY when humans were ALIVE earlier in the round AND
    // all of them are dead now AND 2+ bots still remain. The
    // "earlier-alive" gate keeps pure bot-vs-bot rounds (demos,
    // regression tests) on their deterministic baseline — they have
    // no humans from frame 1 and shouldn't fire the boost.
    let boostNow = 0;
    if (!accelerationDisabled) {
      const counts = countAliveBombers(world);
      if (counts.humans > 0) humansEverAlive = true;
      if (humansEverAlive && counts.humans === 0 && counts.bots >= 2) {
        if (humansAllDeadAt === undefined) humansAllDeadAt = context.time.elapsed;
      } else {
        humansAllDeadAt = undefined;
      }
      boostNow = botAccelerationBoost(humansAllDeadAt, context.time.elapsed, accelerationBaseBoost);
    }
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
      // S100 KABOOM-BOT-PERSONALITY-VARIANTS — pick the goal cell
      // based on the bot's personality (default 'hunter' chases the
      // player; 'coward' has no goal; 'miner' adds soft blocks).
      // S210 — when HUMANS_DEAD is active, every personality switches
      // to nearest-other-bomber so cowards stop their mutual orbit
      // and engage their fellow bots.
      let goal: { gx: number; gz: number } | undefined;
      if (boostNow > 0) {
        goal = nearestOtherBomberCell(world, botId, pos) ?? personalityGoal(world, pos, brain.personality ?? "hunter", danger);
      } else {
        goal = personalityGoal(world, pos, brain.personality ?? "hunter", danger);
      }
      // S220 — KICK opportunity check. When the bot has canKick + an
      // own bomb adjacent + an alive enemy 2..6 cells beyond it,
      // walking INTO the bomb is the right move — bomb-kick-system
      // slides the bomb toward the enemy and the bot proceeds in
      // the same direction. Overrides the personality goal so this
      // tactical shot wins over the default wander/chase.
      const statsForKick = world.getComponent<{ canKick?: boolean }>(botId, BOMBER_STATS);
      const kickDir = findKickOpportunity(world, botId, pos, statsForKick?.canKick === true);
      const direction = kickDir ?? decideDirection(pos, brain, danger, goal);

      const mover = world.getComponent<GridMoverComponent>(botId, GRID_MOVER);
      if (mover !== undefined) {
        world.setComponent(botId, GRID_MOVER, { ...mover, queuedDirection: direction });
      }
      // S203 — bot dashes to escape when the current cell is in the
      // danger set AND the dash is ready. The dash-system inflates
      // GridMover.speed for 240ms (S198), so the bot clears the
      // danger cell faster than a normal walk. Uses the AI-chosen
      // escape direction; only fires when that direction is a clean
      // cardinal (not both-zero) so the dash always points somewhere.
      //
      // S206 — hunter personality ALSO dashes proactively to close
      // distance on the player when they're 2 or 3 cells away in
      // the bot's chosen direction. Other personalities (coward,
      // miner) only use dash for the escape path.
      const inDangerNow = danger.has(cellKey(pos.gx, pos.gz));
      const hunterChase =
        !inDangerNow
        && (brain.personality ?? "hunter") === "hunter"
        && playerInDashLine(world, pos, direction);
      if (
        (inDangerNow || hunterChase)
        && (direction.dx !== 0 || direction.dz !== 0)
      ) {
        const stats = world.getComponent<BomberStatsForDash>(botId, BOMBER_STATS);
        const dashReady =
          stats !== undefined
          && stats.alive !== false
          && (stats.dashCooldownRemainingMs ?? 0) <= 0
          && stats.dashing !== true;
        if (dashReady && !world.hasComponent(botId, DASH_REQUEST)) {
          world.setComponent(botId, DASH_REQUEST, { dx: direction.dx, dz: direction.dz });
        }
      }
      world.setComponent(botId, BOT_BRAIN, {
        ...brain,
        nextDecisionIn: DECISION_INTERVAL,
        lastDecisionDx: direction.dx,
        lastDecisionDz: direction.dz
      });

      if (shouldDropBomb(world, botId, pos, brain, danger, boostNow)) {
        if (!world.hasComponent(botId, PLACE_BOMB_REQUEST)) {
          world.setComponent(botId, PLACE_BOMB_REQUEST, {});
        }
      }

      // S204 — bot triggers RemoteDetonateRequest when any of its own
      // paused bombs has an ENEMY (not itself) inside its blast
      // radius. Engine bomb-fuse-system reads the request next tick
      // and drops fuseRemaining → 0 on every paused bomb the bot
      // owns, so a well-placed paused bomb becomes a triggered trap.
      if (shouldRemoteDetonate(world, botId)) {
        if (!world.hasComponent(botId, REMOTE_DETONATE_REQUEST)) {
          world.setComponent(botId, REMOTE_DETONATE_REQUEST, {});
        }
      }

      // S224 — THROW tactical slice. When a bot holds canThrow,
      // mirror the player's pickup → throw two-step:
      //   - If already carrying (carryingBombId set on stats),
      //     emit ThrowBombRequest. The throw-system reads the bot's
      //     facing rotation (driven by GridMover queuedDirection)
      //     and picks a landing 3 cells along that line.
      //   - Else if standing on top of an OWN bomb, 30 %/brain-tick
      //     emits PickupBombRequest{ bombId } — the bomb-pickup
      //     system pauses the fuse + parents the bomb to the
      //     bomber's back socket. Next brain tick the carrying
      //     branch fires the throw.
      // No personality variation here yet (V1 = hunter-only feel);
      // miner / coward THROW lands as a follow-up.
      maybeFireBotThrow(world, botId, pos, rng);
    }
  };

  return { name, fixedUpdate };
}

/** S204 — returns true when this bot owns at least one paused bomb
 *  (Bomb.fuseRemaining === Infinity) AND some enemy alive bomber sits
 *  inside any of those bombs' blast radius cells. Pure read-only —
 *  exported so unit tests can lock the policy without spinning the
 *  whole system. */
/** S206 — pure helper: returns true when an alive player.* bomber sits
 *  2 or 3 cells in `(dx, dz)` direction from `(pos.gx, pos.gz)`, on the
 *  same row or column as the bot. The hunter bot uses this signal to
 *  fire an offensive DashRequest in the same direction so it closes
 *  distance on the player before the player can react. Exported for
 *  unit tests. */
// S234 — playerInDashLine / shouldRemoteDetonate / cellInBlast /
// collectAliveEnemyCells / personalityTallyBias / predictNextCell /
// countSoftBlocksInLine / wouldKillEnemyAt / maybeFireBotThrow all
// live in bot-ai-helpers.ts (re-exported at the top of this file).
