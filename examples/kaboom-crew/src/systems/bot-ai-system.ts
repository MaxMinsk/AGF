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
  decideBotShouldDropBomb,
  findBotKickOpportunity,
  maybeFireBotThrow,
  nearestBotOtherBomber,
  nearestBotPickup,
  nearestBotPlayer,
  nearestBotSoftBlock,
  personalityTallyBias,
  pickBotDirection,
  selectBotPersonalityGoal,
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
  decideBotShouldDropBomb,
  findBotKickOpportunity,
  maybeFireBotThrow,
  nearestBotOtherBomber,
  nearestBotPickup,
  nearestBotPlayer,
  nearestBotSoftBlock,
  personalityTallyBias,
  pickBotDirection,
  selectBotPersonalityGoal,
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
   *
   * S236 V2 — implementation extracted to bot-ai-helpers. This thunk
   * forwards + captures the closure-bound `pickups` QueryHandle.
   */
  function nearestPickup(world: World, pos: GridPos, danger: ReadonlySet<string>): { gx: number; gz: number } | undefined {
    if (pickups === undefined) return undefined;
    return nearestBotPickup(world, pos, danger, pickups, PICKUP_RADIUS);
  }

  // S100 KABOOM-BOT-PERSONALITY-VARIANTS. S239 — dispatch extracted
  // to `selectBotPersonalityGoal` in bot-ai-helpers. Local thunk wires
  // the deps to the closure-bound thunks above (which themselves
  // forward to the helpers).
  function personalityGoal(
    world: World,
    pos: GridPos,
    personality: BotPersonality,
    danger: Set<string>
  ): { gx: number; gz: number } | undefined {
    return selectBotPersonalityGoal(world, pos, personality, danger, {
      nearestPickup,
      nearestSoftBlock,
      anticipatedPlayer: anticipatedPlayerCell
    });
  }

  /** S220 KABOOM-BOT-KICK. S238 — extracted to bot-ai-helpers
   *  (`findBotKickOpportunity`). Local thunk captures `options.occupancy`. */
  function findKickOpportunity(
    world: World,
    botId: EntityId,
    pos: GridPos,
    canKick: boolean
  ): { dx: number; dz: number } | undefined {
    return findBotKickOpportunity(world, botId, pos, canKick, options.occupancy);
  }

  /** S210 — when HUMANS_DEAD is active, every personality (including
   *  coward) targets the nearest alive non-self bomber. S236 V2 —
   *  forwards to `nearestBotOtherBomber` in bot-ai-helpers. */
  function nearestOtherBomberCell(
    world: World,
    selfId: EntityId,
    pos: GridPos
  ): { gx: number; gz: number } | undefined {
    return nearestBotOtherBomber(world, selfId, pos);
  }

  function nearestPlayer(world: World, pos: GridPos): { gx: number; gz: number } | undefined {
    // 'hunter' sees further than the pickup magnet — 2× radius.
    return nearestBotPlayer(world, pos, PICKUP_RADIUS * 2);
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

  function nearestSoftBlock(world: World, pos: GridPos, danger: ReadonlySet<string>): { gx: number; gz: number } | undefined {
    // S236 V2 — forwards to `nearestBotSoftBlock` in bot-ai-helpers.
    return nearestBotSoftBlock(world, pos, danger, PICKUP_RADIUS);
  }

  // S241 — direction-picker extracted to `pickBotDirection` in
  // bot-ai-helpers. Local thunk forwards + captures closure-bound
  // `passableNeighbours` thunk + the SeededRng.
  function decideDirection(
    pos: GridPos,
    brain: BotBrain,
    danger: Set<string>,
    pickupGoal: { gx: number; gz: number } | undefined
  ): { dx: number; dz: number } {
    return pickBotDirection(pos, brain, danger, pickupGoal, {
      passableNeighbours,
      rng
    });
  }

  // S240 — bomb-drop decision tree extracted to bot-ai-helpers
  // (`decideBotShouldDropBomb`). Local thunk forwards + captures
  // closure-bound `options.occupancy` + `rng`.
  function shouldDropBomb(
    world: World,
    botId: EntityId,
    pos: GridPos,
    brain: BotBrain,
    danger: Set<string>,
    boost: number
  ): boolean {
    return decideBotShouldDropBomb(world, botId, pos, brain, danger, boost, {
      occupancy: options.occupancy,
      rng
    });
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
