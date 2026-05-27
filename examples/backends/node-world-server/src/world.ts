// Server-side authoritative world for the node-world-server skeleton.
//
// S117 KABOOM-MP-SPRINT-B chunk 1 — replaced the bespoke Map-based
// store with an engine ECS World wrapper. The transport-ws surface is
// preserved (join / leave / setIntent / snapshot / tick / expiredPlayers
// / elapsedSeconds / playerCount) so the websocket layer keeps working
// unchanged. Underneath, every player becomes a `player.<id>` entity
// carrying Transform + Presence + Networked + optional CharacterRecipe +
// internal IntentMove + LastActivity components. Future Sprint B
// chunks (bomb-placement / bomb-fuse / blast-propagation / pickup /
// round-resolve) bolt new systems onto this same world.

import { World } from "../../../../engine/core/ecs/world";
import type { ComponentName, EntityId } from "../../../../engine/core/ecs/types";
import { createSeededRng } from "../../../../engine/core/util/seeded-rng";
import { computeBlastCells, loadDefaultMap, type CellType, type GridSize, type LoadedMap } from "./map-loader.js";

type Vec3 = [number, number, number];
type Vec2 = readonly [number, number];

export type SnapshotEntity = {
  id: string;
  components: Record<string, unknown>;
};

export type Snapshot = {
  elapsed: number;
  entities: SnapshotEntity[];
  lastAcked: Record<string, number>;
  playerSpeed: number;
};

/** Must match `PlayerControlled.speed` in the canonical Beacon scene. */
const PLAYER_SPEED = 3.5;
const SPAWN_POSITION: Vec3 = [0, 0.4, 0];
// S120 KABOOM-MP-SPRINT-B chunk 4 — bot.1 spawn cell mirrors the
// client's start.scene.json bot.1 instance.
const BOT_SPAWN_POSITION: Vec3 = [13, 0.4, 9];
const BOT_ENTITY_ID = "bot.1";
const BOT_DECISION_INTERVAL_S = 0.2;
const BOT_BOMB_CHANCE = 0.15;
// S121 — bot prefers bombing when a soft-block is adjacent (miner-ish).
const BOT_BOMB_CHANCE_NEAR_SOFT = 0.5;
// S122 — personality chances. Coward bombs rarely + only with an
// escape route. Hunter spikes when a human is within reach.
const BOT_BOMB_CHANCE_COWARD = 0.05;
const BOT_BOMB_CHANCE_HUNTER_TARGETED = 0.6;

export type BotPersonality = "hunter" | "coward" | "miner";
const DEFAULT_BOT_PERSONALITY: BotPersonality = "miner";
// S123 — bot steering radii. Pickup magnet has a tight radius (the
// bot doesn't chase pickups across the whole arena), while hunter
// chase reaches further so the bot actively closes in on humans.
const PICKUP_MAGNET_RADIUS = 5;
const HUNTER_CHASE_RADIUS = 8;

const BOT_DIRECTIONS: ReadonlyArray<Vec2> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1]
];

// S117 KABOOM-MP-SPRINT-B — server-side bomb spawn defaults. Range +
// maxBombs ENFORCEMENT lives client-side today (S119 will move pickup +
// stats to the server). For now the server trusts the client request.
const DEFAULT_BOMB_RANGE = 2;
const DEFAULT_BOMB_FUSE_SECONDS = 2.5;

// Internal-only components carried on player.<id> entities. Names
// chosen so they don't collide with any project-level component names
// the client serialises into the snapshot.
const TRANSFORM: ComponentName = "Transform";
const PRESENCE: ComponentName = "Presence";
const NETWORKED: ComponentName = "Networked";
const CHARACTER_RECIPE: ComponentName = "CharacterRecipe";
/** S117 — direction the player wants to move. Integrated into Transform.position each tick. */
const SERVER_INTENT_MOVE: ComponentName = "__ServerIntentMove";
/** S117 — last server-tick at which we received join/intent for this player. Drives expiredPlayers. */
const SERVER_LAST_ACTIVITY: ComponentName = "__ServerLastActivity";

// S117 KABOOM-MP-SPRINT-B — kaboom-specific components on bomb entities.
const BOMB: ComponentName = "Bomb";
const GRID_POSITION: ComponentName = "GridPosition";
// S118 KABOOM-MP-SPRINT-B — minimal server-side bomber stats. S119
// widens this to track maxBombs/range/kick/shield/remoteDetonate
// counters so pickup-collect can apply effects authoritatively.
const BOMBER_STATS: ComponentName = "BomberStats";
// S119 KABOOM-MP-SPRINT-B — server-side pickup entity. Snapshot ships
// Pickup + GridPosition so clients can render + remove via diff.
const PICKUP: ComponentName = "Pickup";
// S119 KABOOM-MP-SPRINT-B chunk 3 — RoundState singleton component on
// the kaboom.round-state entity. Snapshot ships it so client HUDs read
// authoritative phase + tally + roundNumber from one source.
const ROUND_STATE: ComponentName = "RoundState";
const ROUND_STATE_ENTITY: EntityId = "kaboom.round-state";
// S122 — surfaced under a server-namespaced id so the local client's
// identically-named `kaboom.round-state` entity (HUD scoreboard) isn't
// shadowed by ws-adapter's id-collision rejection.
const MP_ROUND_STATE_ENTITY: EntityId = "mp.round-state";
// S125 — server-side match-state (best-of-N session) + the snapshot
// surface id. kaboom.match-state singleton mirrors the client's local
// MatchState; mp.match-state ships verbatim under a server-namespaced
// id.
const MATCH_STATE: ComponentName = "MatchState";
const MATCH_STATE_ENTITY: EntityId = "kaboom.match-state";
const MP_MATCH_STATE_ENTITY: EntityId = "mp.match-state";
const DEFAULT_MATCH_TARGET = 3;
const ROUND_RESOLVE_NEXT_ROUND_DELAY_S = 3.0;

/** Kaboom pickup kinds — matches the protocol's pickupCollected enum. */
export type PickupKind = "bomb-up" | "fire-up" | "speed-up" | "kick" | "remote-detonate" | "shield" | "pierce";

// Drop table — repeated entries scale relative frequency (S82 client mirror).
const PICKUP_KINDS: ReadonlyArray<PickupKind> = [
  "bomb-up", "bomb-up",
  "fire-up", "fire-up",
  "speed-up", "speed-up",
  "kick",
  "remote-detonate",
  "shield",
  // S147 KABOOM-PIERCE-SERVER-PARITY — match the S142 client drop table.
  "pierce"
];
const DEFAULT_DROP_CHANCE = 0.3;
const DEFAULT_WORLD_SEED = 0xc0ffee;

function pickupCellHash(gx: number, gz: number): number {
  return ((gx * 73856093) ^ (gz * 19349663)) >>> 0;
}

type ServerBomberStats = {
  alive?: boolean;
  maxBombs?: number;
  range?: number;
  canKick?: boolean;
  remoteDetonateCharges?: number;
  shield?: boolean;
  /** S122 — additive movement speed in cells/sec; default PLAYER_SPEED when absent. */
  speed?: number;
  /** S147 KABOOM-PIERCE-SERVER-PARITY — true after collecting a pierce pickup; carried into Bomb.pierce on placement. */
  pierce?: boolean;
};

const MAX_BOMBS_CAP = 8;
const MAX_RANGE_CAP = 8;
const REMOTE_DETONATE_CHARGES_CAP = 3;
// S122 — speed-up cap matches the client static cap.
const MAX_SPEED_CAP = 12;
const SPEED_UP_STEP = 1;

/**
 * S119 — pure helper. Returns the new BomberStats after applying a
 * pickup effect, or undefined when the pickup has no server-side
 * effect (e.g. speed-up — speed lives client-side this sprint).
 */
function applyPickupEffect(stats: ServerBomberStats, kind: PickupKind): ServerBomberStats | undefined {
  switch (kind) {
    case "bomb-up":
      return { ...stats, maxBombs: Math.min((stats.maxBombs ?? 1) + 1, MAX_BOMBS_CAP) };
    case "fire-up":
      return { ...stats, range: Math.min((stats.range ?? 2) + 1, MAX_RANGE_CAP) };
    case "kick":
      return stats.canKick === true ? undefined : { ...stats, canKick: true };
    case "remote-detonate":
      return {
        ...stats,
        remoteDetonateCharges: Math.min((stats.remoteDetonateCharges ?? 0) + 1, REMOTE_DETONATE_CHARGES_CAP)
      };
    case "shield":
      return stats.shield === true ? undefined : { ...stats, shield: true };
    case "pierce":
      // S147 KABOOM-PIERCE-SERVER-PARITY — idempotent flip. Carried
      // at placement into Bomb.pierce so the placed bomb keeps the
      // property even if the bomber loses pierce afterwards.
      return stats.pierce === true ? undefined : { ...stats, pierce: true };
    case "speed-up": {
      // S122 — speed-up authoritative on the server. Add SPEED_UP_STEP
      // to BomberStats.speed, capped at MAX_SPEED_CAP. Default base is
      // PLAYER_SPEED; first pickup bumps to PLAYER_SPEED + step.
      const current = stats.speed;
      const next = Math.min((current ?? PLAYER_SPEED) + SPEED_UP_STEP, MAX_SPEED_CAP);
      if (next === current) return undefined;
      return { ...stats, speed: next };
    }
  }
}

type TransformLike = { position?: ReadonlyArray<number> };
type IntentLike = { direction: Vec2; lastSequence: number };
type ActivityLike = { lastActivity: number };
type PresenceLike = { playerId: string };
type RecipeLike = { recipe?: string };

function playerEntityId(playerId: string): EntityId {
  return `player.${playerId}`;
}

export type BlastEvent = {
  originGx: number;
  originGz: number;
  range: number;
  ownerId: string;
  /** Server-internal — id of the bomb that detonated. Helps clients dedupe + match the snapshot delete. */
  bombId: string;
  /** S118 — cells affected by this blast (origin + cardinal walk). Empty array preserves S117 behavior. */
  cells: Array<{ gx: number; gz: number }>;
};

/** S118 KABOOM-MP-SPRINT-B chunk 2 — one soft-block destruction. */
export type BlockDestroyedEvent = {
  gx: number;
  gz: number;
  /** S119 — pickup that spawned in the cell (if any). Snapshot also ships the Pickup entity. */
  droppedPickupKind?: PickupKind;
};

/** S118 KABOOM-MP-SPRINT-B chunk 2 — one bomber death from a blast. */
export type BomberDiedEvent = {
  entityId: string;
  blastOriginGx: number;
  blastOriginGz: number;
  killerId?: string;
};

/** S119 KABOOM-MP-SPRINT-B chunk 3 — one pickup collection. */
export type PickupCollectedEvent = {
  entityId: string;
  kind: PickupKind;
  gx: number;
  gz: number;
  pickerId: string;
};

/** S119 KABOOM-MP-SPRINT-B chunk 3 — round resolution. */
export type RoundResolvedEvent = {
  phase: "won" | "lost" | "draw";
  winnerId?: string;
  tally: { player: number; bot: number; draws: number };
  nextRoundAt?: number;
};

export type ServerWorldOptions = {
  /** Override the map loader. Tests pass synthetic maps; production uses the bundled start.scene.json. */
  map?: LoadedMap;
  /** S119 — deterministic seed for pickup spawn RNG. Default 0xc0ffee. */
  worldSeed?: number;
  /** S119 — probability (0..1) that a destroyed soft block yields a pickup. Default 0.3. */
  pickupDropChance?: number;
  /**
   * S120 — when false, the server doesn't auto-spawn the bot.1 entity.
   * Defaults to true. Existing unit tests that pre-date the bot pass
   * `spawnBot: false` to keep the 2-bomber resolve semantics.
   */
  spawnBot?: boolean;
  /**
   * S122 — server bot personality. 'miner' (default) keeps the
   * baseline behaviour (near-soft-block bias). 'coward' is shy +
   * flees harder; 'hunter' bombs aggressively when a human is in
   * range. KABOOM_BOT_PERSONALITY env var overrides on production.
   */
  botPersonality?: BotPersonality;
  /**
   * S125 — best-of-N match target. The match resolves the first time
   * either tally slot (player or bot) reaches this many round wins.
   * Default 3 = best-of-5. KABOOM_MATCH_TARGET env var overrides.
   */
  matchTarget?: number;
};

export class ServerWorld {
  private readonly world = new World();
  private readonly playerIds = new Set<string>();
  private readonly bombIds = new Set<string>();
  /** Monotonic counter so identical (gx, gz, ownerId) placements never collide. */
  private bombCounter = 0;
  private elapsed = 0;
  /** S117 KABOOM-MP-SPRINT-B chunk 3 — buffered blastEvents emitted by the most recent tick(). Drained by transport. */
  private pendingBlastEvents: BlastEvent[] = [];
  /** S118 KABOOM-MP-SPRINT-B chunk 2 — buffered blockDestroyed events emitted by the most recent tick(). */
  private pendingBlockDestroyed: BlockDestroyedEvent[] = [];
  /** S118 KABOOM-MP-SPRINT-B chunk 2 — buffered bomberDied events emitted by the most recent tick(). */
  private pendingBomberDied: BomberDiedEvent[] = [];
  /** S119 KABOOM-MP-SPRINT-B chunk 3 — buffered pickupCollected events. */
  private pendingPickupCollected: PickupCollectedEvent[] = [];
  /** S119 KABOOM-MP-SPRINT-B chunk 3 — buffered roundResolved events. */
  private pendingRoundResolved: RoundResolvedEvent[] = [];
  /** S119 — join order index for tally slot mapping (first joiner → 'player' slot). */
  private readonly playerJoinIndex = new Map<string, number>();
  /** S119 — incrementing counter feeding playerJoinIndex. */
  private joinOrderCounter = 0;
  /** S120 — countdown to round restart after roundResolved, or null when no reset is pending. */
  private resetCountdown: number | null = null;
  /** S120 — whether the server bot.1 entity exists. False when {spawnBot:false} was passed. */
  private readonly hasBot: boolean;
  /** S122 — server bot personality variant. */
  private readonly botPersonality: BotPersonality;
  /** S120 — countdown to the bot's next AI decision (direction + maybe-bomb). */
  private botDecisionTimer = 0;
  /** S120 — seeded RNG driving bot decisions. */
  private readonly botRng = createSeededRng((DEFAULT_WORLD_SEED ^ 0xb07a1) | 0);
  /** S118 KABOOM-MP-SPRINT-B chunk 2 — authoritative obstacle grid (hard walls + soft blocks). */
  private readonly map: LoadedMap;
  /** S119 — set of currently-alive pickup entity ids on the server. */
  private readonly pickupIds = new Set<string>();
  /** S119 — monotonic counter for pickup entity id minting. */
  private pickupCounter = 0;
  /** S119 — deterministic pickup spawn seed (worldSeed XOR cell hash). */
  private readonly worldSeed: number;
  /** S119 — probability per soft-block-destroy of dropping a pickup. */
  private readonly pickupDropChance: number;

  constructor(options: ServerWorldOptions = {}) {
    this.map = options.map ?? loadDefaultMap();
    this.worldSeed = options.worldSeed ?? DEFAULT_WORLD_SEED;
    this.pickupDropChance = options.pickupDropChance ?? DEFAULT_DROP_CHANCE;
    // S119 — seed the canonical RoundState singleton entity.
    this.world.addEntity(ROUND_STATE_ENTITY);
    this.world.setComponent(ROUND_STATE_ENTITY, ROUND_STATE, {
      phase: "playing",
      tally: { player: 0, bot: 0, draws: 0 },
      roundNumber: 1
    });
    // S125 — seed MatchState singleton + record target for resolve.
    const matchTarget = options.matchTarget ?? DEFAULT_MATCH_TARGET;
    this.world.addEntity(MATCH_STATE_ENTITY);
    this.world.setComponent(MATCH_STATE_ENTITY, MATCH_STATE, {
      phase: "playing",
      target: matchTarget,
      matchNumber: 1
    });
    // S120 — spawn bot.1 as a server-owned bomber. Carries the same
    // shape as a player.<id> entity so the kill-scan, pickup-collect,
    // and snapshot paths treat it uniformly. remote-bomber-decorator
    // on the client picks it up via Presence.playerId !== localPlayerId.
    this.hasBot = options.spawnBot !== false;
    this.botPersonality = options.botPersonality ?? DEFAULT_BOT_PERSONALITY;
    if (this.hasBot) this.spawnBot();
  }

  private spawnBot(): void {
    this.world.addEntity(BOT_ENTITY_ID);
    this.world.setComponent(BOT_ENTITY_ID, TRANSFORM, { position: [...BOT_SPAWN_POSITION] });
    this.world.setComponent(BOT_ENTITY_ID, PRESENCE, { playerId: BOT_ENTITY_ID });
    this.world.setComponent(BOT_ENTITY_ID, NETWORKED, { authority: "server" });
    this.world.setComponent(BOT_ENTITY_ID, GRID_POSITION, {
      gx: Math.round(BOT_SPAWN_POSITION[0]),
      gz: Math.round(BOT_SPAWN_POSITION[2])
    });
    this.world.setComponent(BOT_ENTITY_ID, BOMBER_STATS, { alive: true, range: DEFAULT_BOMB_RANGE, maxBombs: 1 });
    this.world.setComponent(BOT_ENTITY_ID, SERVER_INTENT_MOVE, { direction: [0, 0], lastSequence: -1 });
    this.world.setComponent(BOT_ENTITY_ID, SERVER_LAST_ACTIVITY, { lastActivity: 0 });
  }

  /** S120 — iterate all bomber entity ids (human players + bots). */
  private allBomberEntityIds(): string[] {
    const out: string[] = [];
    for (const playerId of this.playerIds) out.push(playerEntityId(playerId));
    if (this.hasBot) out.push(BOT_ENTITY_ID);
    return out;
  }

  /**
   * S120 KABOOM-MP-SPRINT-B chunk 4 — minimal server-side bot AI.
   *
   * Decision loop runs every BOT_DECISION_INTERVAL_S:
   *   1. If the bot is dead or the round isn't 'playing', skip.
   *   2. Pick a random cardinal direction; reject the ones that step
   *      into a hard-wall. Update the bot's IntentMove. If every
   *      direction is blocked (shouldn't happen on the canonical map)
   *      keep the previous intent.
   *   3. Roll BOT_BOMB_CHANCE; on hit, place a bomb at the bot's
   *      current cell (server-internal call into placeBomb).
   *
   * The bot's id maps to a 'player.<id>' shape for placeBomb (which
   * expects a player-id, not entity-id) — we synthesise the suffix
   * by stripping the 'bot.' prefix. placeBomb's existing alive +
   * round-phase gates apply automatically.
   */
  private tickBotAi(dt: number): void {
    this.botDecisionTimer -= dt;
    if (this.botDecisionTimer > 0) return;
    this.botDecisionTimer = BOT_DECISION_INTERVAL_S;
    const stats = this.world.getComponent<{ alive?: boolean }>(BOT_ENTITY_ID, BOMBER_STATS);
    if (stats?.alive === false) return;
    const round = this.world.getComponent<{ phase?: string }>(ROUND_STATE_ENTITY, ROUND_STATE);
    if (round?.phase !== "playing") return;
    const gp = this.world.getComponent<{ gx?: number; gz?: number }>(BOT_ENTITY_ID, GRID_POSITION);
    if (gp?.gx === undefined || gp?.gz === undefined) return;

    // S121 KABOOM-MP-SPRINT-S121 — danger map: cells covered by any
    // active bomb's blast walk. Bot rejects directions that step into
    // a dangerous cell. Falls back to ALL valid (wall-only) candidates
    // when every direction is dangerous (cornered — at least try).
    const dangerCells = this.computeBlastDangerCells();
    const safeCandidates: Vec2[] = [];
    const walkableCandidates: Vec2[] = [];
    for (const [dx, dz] of BOT_DIRECTIONS) {
      const nx = gp.gx + dx;
      const nz = gp.gz + dz;
      if (this.map.cellAt(nx, nz) === "hard-wall") continue;
      walkableCandidates.push([dx, dz]);
      if (!dangerCells.has(`${nx},${nz}`)) safeCandidates.push([dx, dz]);
    }
    const choicePool = safeCandidates.length > 0 ? safeCandidates : walkableCandidates;

    // S121 — post-bomb flee wins when current cell is dangerous.
    // S123 — otherwise: hunter chases the nearest human; everyone gets
    //        a pickup magnet pulling toward the nearest reachable
    //        pickup; falls back to RNG if neither target is in range.
    let choice: Vec2 | undefined;
    if (choicePool.length > 0) {
      if (dangerCells.has(`${gp.gx},${gp.gz}`)) {
        // S124 — flee logic prefers candidates OUTSIDE every active
        // blast walk over candidates that merely maximise manhattan
        // distance to a bomb origin. A bot 1 cell away from a range=2
        // bomb is still inside the blast — moving to that cell doesn't
        // save the bot. If at least one candidate exits dangerCells,
        // restrict the choice pool to those; otherwise fall back to
        // the old max-manhattan tiebreak.
        const fullySafe: Vec2[] = [];
        for (const cand of choicePool) {
          const nx = gp.gx + cand[0];
          const nz = gp.gz + cand[1];
          if (!dangerCells.has(`${nx},${nz}`)) fullySafe.push(cand);
        }
        const fleePool = fullySafe.length > 0 ? fullySafe : choicePool;
        let bestScore = -Infinity;
        let bestPick: Vec2 = fleePool[0]!;
        for (const cand of fleePool) {
          const nx = gp.gx + cand[0];
          const nz = gp.gz + cand[1];
          const score = this.minManhattanFromActiveBombs(nx, nz);
          if (score > bestScore) {
            bestScore = score;
            bestPick = cand;
          }
        }
        choice = bestPick;
      } else {
        // S123 — find a steering target: hunter chase wins for hunter
        // when a human is in chase range; otherwise pickup magnet.
        // S125 — pick the FIRST step on the BFS shortest path to the
        // target instead of myopic manhattan. Falls back to manhattan
        // when target is unreachable or BFS visit cap is hit.
        const steer = this.botSteeringTarget(gp.gx, gp.gz);
        if (steer !== undefined) {
          const bfsDir = this.bfsFirstStepTo(gp.gx, gp.gz, steer.gx, steer.gz, dangerCells, choicePool);
          if (bfsDir !== undefined) {
            choice = bfsDir;
          } else {
            // Fallback to manhattan steering when no BFS path exists.
            let bestScore = Infinity;
            let bestPick: Vec2 = choicePool[0]!;
            for (const cand of choicePool) {
              const nx = gp.gx + cand[0];
              const nz = gp.gz + cand[1];
              const score = Math.abs(nx - steer.gx) + Math.abs(nz - steer.gz);
              if (score < bestScore) {
                bestScore = score;
                bestPick = cand;
              }
            }
            choice = bestPick;
          }
        } else {
          choice = choicePool[this.botRng.nextInt(0, choicePool.length)]!;
        }
      }
      this.world.setComponent(BOT_ENTITY_ID, SERVER_INTENT_MOVE, {
        direction: choice,
        lastSequence: -1
      } satisfies IntentLike);
    }

    // S120/S121/S122 — bot bomb decision branches on personality. All
    // variants share: never bomb when the current cell is already
    // inside a bomb's blast (S121 no-compound-bomb guard).
    // S124 — additionally: don't bomb when the simulated bomb would
    // leave no ≤2-step escape (multi-step trap prevention).
    if (!dangerCells.has(`${gp.gx},${gp.gz}`)) {
      const chance = this.botBombChance(gp.gx, gp.gz, dangerCells);
      if (chance > 0 && this.botRng.next() < chance) {
        if (this.botHasTwoStepEscape(gp.gx, gp.gz, dangerCells)) {
          this.placeBombForEntity(BOT_ENTITY_ID, gp.gx, gp.gz);
        }
      }
    }
  }

  /**
   * S124 — would-placing-this-bomb leave the bot trapped? Simulates a
   * bomb at (gx, gz) on top of the current dangerCells map, then BFSes
   * the bot's cardinal neighbourhood up to 2 moves looking for a cell
   * outside the simulated dangerCells (and not a hard-wall, not OOB).
   * Returns true when ≥1 such escape cell exists.
   */
  private botHasTwoStepEscape(gx: number, gz: number, dangerCells: Set<string>): boolean {
    const stats = this.world.getComponent<{ range?: number; pierce?: boolean }>(BOT_ENTITY_ID, BOMBER_STATS);
    const simRange = stats?.range ?? DEFAULT_BOMB_RANGE;
    const simPierce = stats?.pierce === true;
    const sim = new Set(dangerCells);
    // S147 — when the bot is itself carrying Pierce, the simulated bomb
    // walks one extra cell per direction; reflect that in the trap test.
    for (const cell of computeBlastCells(this.map, gx, gz, simRange, simPierce)) {
      sim.add(`${cell.gx},${cell.gz}`);
    }
    // BFS up to depth 2. Origin is in sim so it never qualifies; we
    // need ANY reachable cell within 2 steps that is OUT of sim.
    const visited = new Set<string>([`${gx},${gz}`]);
    let frontier: Array<{ x: number; z: number; depth: number }> = [{ x: gx, z: gz, depth: 0 }];
    while (frontier.length > 0) {
      const next: typeof frontier = [];
      for (const node of frontier) {
        if (node.depth >= 2) continue;
        for (const [dx, dz] of BOT_DIRECTIONS) {
          const nx = node.x + dx;
          const nz = node.z + dz;
          const key = `${nx},${nz}`;
          if (visited.has(key)) continue;
          if (this.map.cellAt(nx, nz) === "hard-wall") continue;
          if (!sim.has(key)) return true;
          visited.add(key);
          next.push({ x: nx, z: nz, depth: node.depth + 1 });
        }
      }
      frontier = next;
    }
    return false;
  }

  /**
   * S122 — personality-driven bomb-place chance. Returns 0 when the
   * personality forbids placing here (e.g. coward without an escape
   * route).
   */
  private botBombChance(gx: number, gz: number, dangerCells: Set<string>): number {
    const adjacentSoft = this.hasAdjacentSoftBlock(gx, gz);
    switch (this.botPersonality) {
      case "miner":
        return adjacentSoft ? BOT_BOMB_CHANCE_NEAR_SOFT : BOT_BOMB_CHANCE;
      case "coward": {
        // Need at least one safe escape cell (cardinal neighbour OUT of
        // every blast cell AND not a hard-wall). Skip bombing without
        // one — coward dies of caution-fatigue otherwise.
        if (!this.hasSafeEscape(gx, gz, dangerCells)) return 0;
        // Coward STILL bombs occasionally — base rate only.
        return BOT_BOMB_CHANCE_COWARD;
      }
      case "hunter": {
        // Hunter spikes when a human is within reach. Range read from
        // the bot's own stats so power-ups widen the hunting radius.
        if (this.isHumanInRange(gx, gz)) return BOT_BOMB_CHANCE_HUNTER_TARGETED;
        return adjacentSoft ? BOT_BOMB_CHANCE_NEAR_SOFT : BOT_BOMB_CHANCE;
      }
    }
  }

  /** S122 — coward sanity: at least one non-blast, non-wall cardinal neighbour. */
  private hasSafeEscape(gx: number, gz: number, dangerCells: Set<string>): boolean {
    // Simulate the bomb the coward is about to place — it would cover
    // its origin + the cardinal walk. Skip ANY cell within that walk
    // (using the bot's range) AS DANGER for escape-route purposes.
    const stats = this.world.getComponent<{ range?: number; pierce?: boolean }>(BOT_ENTITY_ID, BOMBER_STATS);
    const simRange = stats?.range ?? DEFAULT_BOMB_RANGE;
    const simPierce = stats?.pierce === true;
    const sim = new Set(dangerCells);
    // S147 — pierce widens the simulated bomb by one cell per direction.
    for (const cell of computeBlastCells(this.map, gx, gz, simRange, simPierce)) {
      sim.add(`${cell.gx},${cell.gz}`);
    }
    for (const [dx, dz] of BOT_DIRECTIONS) {
      const nx = gx + dx;
      const nz = gz + dz;
      if (this.map.cellAt(nx, nz) === "hard-wall") continue;
      if (sim.has(`${nx},${nz}`)) continue;
      return true;
    }
    return false;
  }

  /**
   * S125 — BFS the shortest path from (sx, sz) to (tx, tz). Returns
   * the FIRST step (a direction in `choicePool`) on that path, or
   * undefined when no path exists within the visit cap. Hard walls
   * are impassable; danger cells stay walkable so a chase can route
   * through a brief blast (the flee branch wouldn't have called this
   * — the current cell is already safe by the time BFS runs).
   *
   * Visit cap 64 = 8x8 neighbourhood, plenty for the 15x11 arena.
   */
  private bfsFirstStepTo(
    sx: number,
    sz: number,
    tx: number,
    tz: number,
    dangerCells: Set<string>,
    choicePool: Vec2[]
  ): Vec2 | undefined {
    if (sx === tx && sz === tz) return undefined;
    // Parent map keyed by cell — stores the direction taken to reach
    // each cell from its predecessor (the very first step from start).
    const startKey = `${sx},${sz}`;
    const firstStep = new Map<string, Vec2>();
    const visited = new Set<string>([startKey]);
    type Node = { x: number; z: number; firstStep: Vec2 | undefined };
    let frontier: Node[] = [{ x: sx, z: sz, firstStep: undefined }];
    let visitCount = 0;
    const VISIT_CAP = 64;
    while (frontier.length > 0 && visitCount < VISIT_CAP) {
      const next: Node[] = [];
      for (const node of frontier) {
        for (const cand of BOT_DIRECTIONS) {
          const nx = node.x + cand[0];
          const nz = node.z + cand[1];
          const key = `${nx},${nz}`;
          if (visited.has(key)) continue;
          if (this.map.cellAt(nx, nz) === "hard-wall") continue;
          // From the START cell, restrict the first step to choicePool
          // (post-danger-filter). Beyond the first step, we allow any
          // walkable cell — chase planning otherwise gets too short-
          // sighted with dangerCells filtering.
          const stepFromStart: Vec2 = node.firstStep ?? cand;
          if (node === frontier[0] && frontier.length === 1 && node.x === sx && node.z === sz) {
            const allowed = choicePool.some((c) => c[0] === cand[0] && c[1] === cand[1]);
            if (!allowed) continue;
          }
          visited.add(key);
          firstStep.set(key, stepFromStart);
          if (nx === tx && nz === tz) return stepFromStart;
          next.push({ x: nx, z: nz, firstStep: stepFromStart });
          visitCount += 1;
          if (visitCount >= VISIT_CAP) break;
        }
        if (visitCount >= VISIT_CAP) break;
      }
      frontier = next;
    }
    // Target unreachable within visit cap → return undefined and let
    // the caller fall back to manhattan steering.
    // Suppress unused-var on dangerCells (kept in signature for future
    // BFS weighting; danger-aware planning is a follow-up).
    void dangerCells;
    return undefined;
  }

  /**
   * S123 — steering target for the bot's direction-pick when its
   * current cell is safe. Hunter prefers the nearest alive human if
   * within HUNTER_CHASE_RADIUS; everyone falls back to the nearest
   * pickup within PICKUP_MAGNET_RADIUS. Returns undefined when no
   * target is reachable (caller falls back to pure RNG).
   */
  private botSteeringTarget(gx: number, gz: number): { gx: number; gz: number } | undefined {
    if (this.botPersonality === "hunter") {
      const human = this.nearestAliveHuman(gx, gz, HUNTER_CHASE_RADIUS);
      if (human !== undefined) return human;
    }
    return this.nearestPickup(gx, gz, PICKUP_MAGNET_RADIUS);
  }

  private nearestPickup(gx: number, gz: number, maxRadius: number): { gx: number; gz: number } | undefined {
    let best: { gx: number; gz: number } | undefined;
    let bestDist = maxRadius + 1;
    for (const pickupId of this.pickupIds) {
      const pgp = this.world.getComponent<{ gx?: number; gz?: number }>(pickupId, GRID_POSITION);
      if (pgp?.gx === undefined || pgp?.gz === undefined) continue;
      const d = Math.abs(gx - pgp.gx) + Math.abs(gz - pgp.gz);
      if (d < bestDist) {
        bestDist = d;
        best = { gx: pgp.gx, gz: pgp.gz };
      }
    }
    return best;
  }

  private nearestAliveHuman(gx: number, gz: number, maxRadius: number): { gx: number; gz: number } | undefined {
    let best: { gx: number; gz: number } | undefined;
    let bestDist = maxRadius + 1;
    for (const playerId of this.playerIds) {
      const entity = playerEntityId(playerId);
      const stats = this.world.getComponent<{ alive?: boolean }>(entity, BOMBER_STATS);
      if (stats?.alive === false) continue;
      const pgp = this.world.getComponent<{ gx?: number; gz?: number }>(entity, GRID_POSITION);
      if (pgp?.gx === undefined || pgp?.gz === undefined) continue;
      const d = Math.abs(gx - pgp.gx) + Math.abs(gz - pgp.gz);
      if (d < bestDist) {
        bestDist = d;
        best = { gx: pgp.gx, gz: pgp.gz };
      }
    }
    return best;
  }

  /** S122 — hunter target check: any alive human player within manhattan range+1. */
  private isHumanInRange(gx: number, gz: number): boolean {
    const stats = this.world.getComponent<{ range?: number }>(BOT_ENTITY_ID, BOMBER_STATS);
    const reach = (stats?.range ?? DEFAULT_BOMB_RANGE) + 1;
    for (const playerId of this.playerIds) {
      const playerEnt = playerEntityId(playerId);
      const playerStats = this.world.getComponent<{ alive?: boolean }>(playerEnt, BOMBER_STATS);
      if (playerStats?.alive === false) continue;
      const playerGp = this.world.getComponent<{ gx?: number; gz?: number }>(playerEnt, GRID_POSITION);
      if (playerGp?.gx === undefined || playerGp?.gz === undefined) continue;
      const d = Math.abs(gx - playerGp.gx) + Math.abs(gz - playerGp.gz);
      if (d <= reach) return true;
    }
    return false;
  }

  /**
   * S121 — compute the set of cells currently within any active bomb's
   * blast walk. Used by the bot AI to dodge. Same cardinal walk as
   * computeBlastCells but ad-hoc (we don't want to import an unrelated
   * helper or allocate per-cell objects).
   */
  private computeBlastDangerCells(): Set<string> {
    const danger = new Set<string>();
    for (const bombId of this.bombIds) {
      const gp = this.world.getComponent<{ gx?: number; gz?: number }>(bombId, GRID_POSITION);
      const bomb = this.world.getComponent<{ range?: number; pierce?: boolean }>(bombId, BOMB);
      if (gp?.gx === undefined || gp?.gz === undefined) continue;
      const range = bomb?.range ?? DEFAULT_BOMB_RANGE;
      // S147 — bot dodge map must include the extra cell that an active
      // Pierce bomb threatens; otherwise the bot would happily walk
      // through the pierce extension and die.
      const cells = computeBlastCells(this.map, gp.gx, gp.gz, range, bomb?.pierce === true);
      for (const cell of cells) danger.add(`${cell.gx},${cell.gz}`);
    }
    return danger;
  }

  /** S121 — minimum manhattan distance from (gx, gz) to any active bomb origin. */
  private minManhattanFromActiveBombs(gx: number, gz: number): number {
    let best = Infinity;
    for (const bombId of this.bombIds) {
      const gp = this.world.getComponent<{ gx?: number; gz?: number }>(bombId, GRID_POSITION);
      if (gp?.gx === undefined || gp?.gz === undefined) continue;
      const d = Math.abs(gx - gp.gx) + Math.abs(gz - gp.gz);
      if (d < best) best = d;
    }
    return Number.isFinite(best) ? best : 0;
  }

  /** S121 — true when any cardinal neighbour is currently a soft-block. */
  private hasAdjacentSoftBlock(gx: number, gz: number): boolean {
    for (const [dx, dz] of BOT_DIRECTIONS) {
      if (this.map.cellAt(gx + dx, gz + dz) === "soft-block") return true;
    }
    return false;
  }

  /**
   * S120 KABOOM-MP-SPRINT-B chunk 5 — server-internal placeBomb that
   * routes through the same no-stack / round-locked / alive guards
   * as the protocol-driven path, but takes an entity id directly
   * instead of a player-namespaced id. Used by the bot AI.
   */
  private placeBombForEntity(ownerEntityId: string, gx: number, gz: number): string | undefined {
    if (!this.world.hasEntity(ownerEntityId)) return undefined;
    const round = this.world.getComponent<{ phase?: string }>(ROUND_STATE_ENTITY, ROUND_STATE);
    if (round !== undefined && round.phase !== undefined && round.phase !== "playing") return undefined;
    const stats = this.world.getComponent<{ alive?: boolean; maxBombs?: number }>(ownerEntityId, BOMBER_STATS);
    if (stats?.alive === false) return undefined;
    for (const existingBombId of this.bombIds) {
      const existingGp = this.world.getComponent<{ gx?: number; gz?: number }>(existingBombId, GRID_POSITION);
      if (existingGp?.gx === gx && existingGp?.gz === gz) return undefined;
    }
    this.bombCounter += 1;
    const bombId: EntityId = `bomb.${ownerEntityId}.${this.bombCounter}`;
    this.world.addEntity(bombId);
    this.world.setComponent(bombId, TRANSFORM, { position: [gx, 0.35, gz] });
    this.world.setComponent(bombId, GRID_POSITION, { gx, gz });
    // S147 KABOOM-PIERCE-SERVER-PARITY — carry pierce flag at placement,
    // mirroring the S142 client placement rule. The bomb keeps pierce
    // even if the bomber loses it before detonation.
    const ownerStats = this.world.getComponent<ServerBomberStats>(ownerEntityId, BOMBER_STATS);
    const bombComponent: { fuseRemaining: number; range: number; ownerId: string; pierce?: boolean } = {
      fuseRemaining: DEFAULT_BOMB_FUSE_SECONDS,
      range: stats?.maxBombs !== undefined ? DEFAULT_BOMB_RANGE : DEFAULT_BOMB_RANGE,
      ownerId: ownerEntityId
    };
    if (ownerStats?.pierce === true) bombComponent.pierce = true;
    this.world.setComponent(bombId, BOMB, bombComponent);
    this.bombIds.add(bombId);
    return bombId;
  }

  /** S118 — read the cell type at (gx, gz). Out-of-bounds reads as 'hard-wall'. */
  cellAt(gx: number, gz: number): CellType {
    return this.map.cellAt(gx, gz);
  }

  gridSize(): GridSize {
    return this.map.gridSize();
  }

  /** S118 — destroy a soft block; returns true if a block was removed. */
  destroySoftBlock(gx: number, gz: number): boolean {
    return this.map.destroySoftBlock(gx, gz);
  }

  /**
   * S119 KABOOM-MP-SPRINT-B chunk 3 — deterministic-by-cell pickup roll.
   * Same (gx, gz, worldSeed) always produces the same kind or undefined,
   * so the bot-vs-bot regression replay stays stable. Returns undefined
   * when no pickup should drop.
   */
  private rollPickupForCell(gx: number, gz: number): PickupKind | undefined {
    const rng = createSeededRng((this.worldSeed ^ pickupCellHash(gx, gz)) | 0);
    if (rng.next() >= this.pickupDropChance) return undefined;
    return rng.pick(PICKUP_KINDS);
  }

  /** S119 — spawn a Pickup entity on the server ECS world. */
  private spawnPickup(gx: number, gz: number, kind: PickupKind): EntityId {
    this.pickupCounter += 1;
    const pickupId: EntityId = `pickup.${kind}.${this.pickupCounter}.${gx}.${gz}`;
    this.world.addEntity(pickupId);
    this.world.setComponent(pickupId, TRANSFORM, { position: [gx, 0.3, gz] });
    this.world.setComponent(pickupId, GRID_POSITION, { gx, gz });
    this.world.setComponent(pickupId, PICKUP, { kind });
    this.pickupIds.add(pickupId);
    return pickupId;
  }

  /**
   * S119 KABOOM-MP-SPRINT-B chunk 3 — for each pickup whose cell
   * matches an alive bomber's GridPosition, apply the stat effect on
   * BomberStats, remove the pickup entity, and queue a
   * pickupCollected event for transport broadcast.
   *
   * Caps mirror the client (S82 KABOOM-PICKUPS-AND-STATS):
   *   - maxBombs cap 8
   *   - range cap 8
   *   - speed not yet authoritative on server (S119 scope)
   *   - kick: idempotent flag
   *   - remote-detonate: counter cap 3
   *   - shield: idempotent flag (no double-stack)
   */
  private collectPickupsForAliveBombers(): void {
    if (this.pickupIds.size === 0) return;
    const collected: string[] = [];
    for (const pickupId of this.pickupIds) {
      const pickupGp = this.world.getComponent<{ gx?: number; gz?: number }>(pickupId, GRID_POSITION);
      const pickup = this.world.getComponent<{ kind?: PickupKind }>(pickupId, PICKUP);
      if (pickupGp === undefined || pickup?.kind === undefined) continue;
      for (const bomberEnt of this.allBomberEntityIds()) {
        const bomberGp = this.world.getComponent<{ gx?: number; gz?: number }>(bomberEnt, GRID_POSITION);
        if (bomberGp?.gx !== pickupGp.gx || bomberGp?.gz !== pickupGp.gz) continue;
        const stats = this.world.getComponent<{
          alive?: boolean;
          maxBombs?: number;
          range?: number;
          canKick?: boolean;
          remoteDetonateCharges?: number;
          shield?: boolean;
        }>(bomberEnt, BOMBER_STATS);
        if (stats?.alive === false) continue;
        const nextStats = applyPickupEffect(stats ?? {}, pickup.kind);
        if (nextStats !== undefined) {
          this.world.setComponent(bomberEnt, BOMBER_STATS, nextStats);
        }
        this.pendingPickupCollected.push({
          entityId: pickupId,
          kind: pickup.kind,
          gx: pickupGp.gx ?? 0,
          gz: pickupGp.gz ?? 0,
          pickerId: bomberEnt
        });
        collected.push(pickupId);
        break; // Only one bomber per cell collects this pickup.
      }
    }
    for (const pickupId of collected) {
      this.world.removeEntity(pickupId);
      this.pickupIds.delete(pickupId);
    }
  }

  /** S119 — drain the per-tick queue of pickupCollected events. */
  drainPickupCollected(): PickupCollectedEvent[] {
    if (this.pendingPickupCollected.length === 0) return [];
    const out = this.pendingPickupCollected;
    this.pendingPickupCollected = [];
    return out;
  }

  join(playerId: string, recipe?: string): void {
    const entityId = playerEntityId(playerId);
    if (this.playerIds.has(playerId)) {
      // Re-join: keep position; overwrite recipe if supplied.
      if (recipe !== undefined) {
        this.world.setComponent(entityId, CHARACTER_RECIPE, { recipe });
      }
      return;
    }
    this.world.addEntity(entityId);
    this.world.setComponent(entityId, TRANSFORM, { position: [...SPAWN_POSITION] });
    this.world.setComponent(entityId, PRESENCE, { playerId } satisfies PresenceLike);
    this.world.setComponent(entityId, NETWORKED, { authority: "server" });
    // S118 — seed GridPosition immediately so blast-propagation lookups
    // on tick 0 find the bomber even before the first tick integration.
    this.world.setComponent(entityId, GRID_POSITION, {
      gx: Math.round(SPAWN_POSITION[0]),
      gz: Math.round(SPAWN_POSITION[2])
    });
    this.world.setComponent(entityId, SERVER_INTENT_MOVE, { direction: [0, 0], lastSequence: -1 } satisfies IntentLike);
    this.world.setComponent(entityId, SERVER_LAST_ACTIVITY, { lastActivity: this.elapsed } satisfies ActivityLike);
    // S118 — minimal authoritative bomber stats. range/maxBombs migrate
    // in S119 with the pickup system; today the server only needs
    // `alive` so it can decide kill ownership.
    this.world.setComponent(entityId, BOMBER_STATS, { alive: true, range: DEFAULT_BOMB_RANGE, maxBombs: 1 });
    if (recipe !== undefined) {
      this.world.setComponent(entityId, CHARACTER_RECIPE, { recipe });
    }
    this.playerIds.add(playerId);
    // S119 — remember join order so tally-slot mapping is stable
    // across the session (first joiner = 'player' slot, others = 'bot').
    if (!this.playerJoinIndex.has(playerId)) {
      this.playerJoinIndex.set(playerId, this.joinOrderCounter);
      this.joinOrderCounter += 1;
    }
  }

  leave(playerId: string): void {
    const entityId = playerEntityId(playerId);
    if (this.world.hasEntity(entityId)) this.world.removeEntity(entityId);
    this.playerIds.delete(playerId);
  }

  /**
   * S117 KABOOM-MP-SPRINT-B — server-authoritative bomb placement.
   * Spawns a Bomb entity on the authoritative ECS world. Returns the
   * spawned entity id on success, undefined when the request was
   * refused (no joined player, or cell already has a bomb).
   *
   * v1 contract: trusts the client's (gx, gz). Server-side range +
   * maxBombs caps stay on the client until S119 (pickup + stats
   * migration). No-stack check is enforced here because two bombs
   * on the same cell visually collide regardless of cap.
   */
  placeBomb(playerId: string, gx: number, gz: number): string | undefined {
    const playerEntId = playerEntityId(playerId);
    if (!this.world.hasEntity(playerEntId)) return undefined;
    // S119 KABOOM-MP-SPRINT-B chunk 3 — lock bomb placement after the
    // round resolves so post-mortem inputs can't spawn ghost bombs.
    const round = this.world.getComponent<{ phase?: string }>(ROUND_STATE_ENTITY, ROUND_STATE);
    if (round !== undefined && round.phase !== undefined && round.phase !== "playing") return undefined;
    // S119 — dead bombers can't place bombs.
    const placerStats = this.world.getComponent<{ alive?: boolean }>(playerEntId, BOMBER_STATS);
    if (placerStats?.alive === false) return undefined;
    // No-stack: scan existing bomb entities for the same cell.
    for (const existingBombId of this.bombIds) {
      const gp = this.world.getComponent<{ gx?: number; gz?: number }>(existingBombId, GRID_POSITION);
      if (gp?.gx === gx && gp?.gz === gz) return undefined;
    }
    this.bombCounter += 1;
    const bombId: EntityId = `bomb.${playerId}.${this.bombCounter}`;
    this.world.addEntity(bombId);
    this.world.setComponent(bombId, TRANSFORM, { position: [gx, 0.35, gz] });
    this.world.setComponent(bombId, GRID_POSITION, { gx, gz });
    // S147 KABOOM-PIERCE-SERVER-PARITY — carry pierce flag at placement.
    const ownerStats = this.world.getComponent<ServerBomberStats>(playerEntId, BOMBER_STATS);
    const bombComponent: { fuseRemaining: number; range: number; ownerId: string; pierce?: boolean } = {
      fuseRemaining: DEFAULT_BOMB_FUSE_SECONDS,
      range: DEFAULT_BOMB_RANGE,
      ownerId: playerEntId
    };
    if (ownerStats?.pierce === true) bombComponent.pierce = true;
    this.world.setComponent(bombId, BOMB, bombComponent);
    this.bombIds.add(bombId);
    this.world.setComponent(playerEntId, SERVER_LAST_ACTIVITY, { lastActivity: this.elapsed } satisfies ActivityLike);
    return bombId;
  }

  setIntent(playerId: string, direction: Vec2, sequence: number | undefined): void {
    const entityId = playerEntityId(playerId);
    const intent = this.world.getComponent<IntentLike>(entityId, SERVER_INTENT_MOVE);
    if (intent === undefined) return; // player not joined
    if (sequence !== undefined && sequence <= intent.lastSequence) return;
    const nextLast = sequence !== undefined ? sequence : intent.lastSequence;
    this.world.setComponent(entityId, SERVER_INTENT_MOVE, { direction, lastSequence: nextLast } satisfies IntentLike);
    this.world.setComponent(entityId, SERVER_LAST_ACTIVITY, { lastActivity: this.elapsed } satisfies ActivityLike);
  }

  tick(dt: number): void {
    this.elapsed += dt;
    // S120 KABOOM-MP-SPRINT-B chunk 4 — tick the reset countdown FIRST.
    // Decrementing before resolution avoids decrementing the same dt
    // we just used to set the countdown (otherwise a single big-dt
    // tick would resolve + reset in one call, masking the 3 s pause).
    if (this.resetCountdown !== null) {
      this.resetCountdown -= dt;
      if (this.resetCountdown <= 0) {
        this.resetCountdown = null;
        this.resetRound();
      }
    }
    // Integrate intent.move into Transform.position for every bomber
    // entity (human players + bots). A future Sprint B chunk can
    // replace this inline loop with a proper scheduler-registered
    // system; today the surface is small enough that a direct walk
    // is cheaper.
    for (const entityId of this.allBomberEntityIds()) {
      const transform = this.world.getComponent<TransformLike>(entityId, TRANSFORM);
      const intent = this.world.getComponent<IntentLike>(entityId, SERVER_INTENT_MOVE);
      if (transform === undefined || intent === undefined) continue;
      // S120 — dead bombers don't move; their last intent stays
      // bound but integration is skipped so they don't drift.
      const stats = this.world.getComponent<ServerBomberStats>(entityId, BOMBER_STATS);
      if (stats?.alive === false) continue;
      // S122 — per-bomber speed (default PLAYER_SPEED). speed-up
      // pickups bump this; round-reset clears it.
      const speed = stats?.speed ?? PLAYER_SPEED;
      const pos = transform.position ?? SPAWN_POSITION;
      const [dx, dz] = intent.direction;
      let nextX = pos[0] ?? 0;
      let nextZ = pos[2] ?? 0;
      if (dx !== 0 || dz !== 0) {
        nextX = nextX + dx * speed * dt;
        nextZ = nextZ + dz * speed * dt;
        this.world.setComponent(entityId, TRANSFORM, {
          position: [nextX, pos[1] ?? 0.4, nextZ]
        });
      }
      // S118 KABOOM-MP-SPRINT-B chunk 2 — derive GridPosition from the
      // (possibly-updated) Transform. Always write — even when the
      // player is stationary — so the snapshot is consistent on every
      // tick and blast-propagation lookups are reliable. Math.round
      // matches the client's grid mapping (cellSize=1, origin at 0,0).
      const gx = Math.round(nextX);
      const gz = Math.round(nextZ);
      const existing = this.world.getComponent<{ gx?: number; gz?: number }>(entityId, GRID_POSITION);
      if (existing?.gx !== gx || existing?.gz !== gz) {
        this.world.setComponent(entityId, GRID_POSITION, { gx, gz });
      }
    }
    // S120 KABOOM-MP-SPRINT-B chunk 4 — bot AI decision tick. Runs
    // every BOT_DECISION_INTERVAL_S; the inline integration loop
    // above does the actual movement based on the latest intent.
    if (this.hasBot) this.tickBotAi(dt);
    // S119 KABOOM-MP-SPRINT-B chunk 3 — pickup collection. After
    // movement integration writes new GridPositions, scan pickups for
    // matching alive bombers; apply the stat effect, emit
    // pickupCollected, remove the pickup entity.
    this.collectPickupsForAliveBombers();
    // S117 KABOOM-MP-SPRINT-B chunk 3 — tick bomb fuses; emit blastEvents
    // when a fuse hits zero. Mutating bombIds inside the loop is OK
    // because we collect detonated ids first then delete after.
    const detonated: BlastEvent[] = [];
    for (const bombId of this.bombIds) {
      const bomb = this.world.getComponent<{ fuseRemaining?: number; range?: number; ownerId?: string; pierce?: boolean }>(bombId, BOMB);
      if (bomb === undefined) continue;
      const fuse = bomb.fuseRemaining ?? 0;
      if (!Number.isFinite(fuse)) continue; // paused remote bombs — out of scope for S117
      const next = fuse - dt;
      if (next <= 0) {
        // Capture origin BEFORE we delete.
        const gp = this.world.getComponent<{ gx?: number; gz?: number }>(bombId, GRID_POSITION);
        const originGx = gp?.gx ?? 0;
        const originGz = gp?.gz ?? 0;
        const range = bomb.range ?? DEFAULT_BOMB_RANGE;
        detonated.push({
          originGx,
          originGz,
          range,
          ownerId: bomb.ownerId ?? "",
          bombId,
          // S118 — populate cells from the authoritative map walk.
          // S147 — pass the bomb's pierce flag so the walker walks
          // through the first soft block per direction when set.
          cells: computeBlastCells(this.map, originGx, originGz, range, bomb.pierce === true)
        });
      } else {
        this.world.setComponent(bombId, BOMB, { ...bomb, fuseRemaining: next });
      }
    }
    // S118 KABOOM-MP-SPRINT-B chunk 6 — chain detonations. Walk the
    // initial detonated list and look for bombs (not yet in detonated)
    // whose GridPosition matches any blast cell. Each match expands
    // the detonated list with its own cells; the loop re-scans because
    // newly-chained blasts can chain into more bombs. Capped to avoid
    // pathological cascades (default 64).
    const CHAIN_DEPTH_CAP = 64;
    const detonatedIds = new Set(detonated.map((d) => d.bombId));
    let chainCursor = 0;
    while (chainCursor < detonated.length && detonated.length < CHAIN_DEPTH_CAP) {
      const event = detonated[chainCursor];
      chainCursor += 1;
      if (event === undefined) break;
      for (const cell of event.cells) {
        for (const bombId of this.bombIds) {
          if (detonatedIds.has(bombId)) continue;
          const gp = this.world.getComponent<{ gx?: number; gz?: number }>(bombId, GRID_POSITION);
          if (gp?.gx !== cell.gx || gp?.gz !== cell.gz) continue;
          const bomb = this.world.getComponent<{ range?: number; ownerId?: string; pierce?: boolean }>(bombId, BOMB);
          if (bomb === undefined) continue;
          const range = bomb.range ?? DEFAULT_BOMB_RANGE;
          detonatedIds.add(bombId);
          detonated.push({
            originGx: cell.gx,
            originGz: cell.gz,
            range,
            ownerId: bomb.ownerId ?? "",
            bombId,
            // S147 — chained pierce bombs keep their own pierce; not
            // inherited from the trigger.
            cells: computeBlastCells(this.map, cell.gx, cell.gz, range, bomb.pierce === true)
          });
          if (detonated.length >= CHAIN_DEPTH_CAP) break;
        }
        if (detonated.length >= CHAIN_DEPTH_CAP) break;
      }
    }
    for (const event of detonated) {
      this.world.removeEntity(event.bombId);
      this.bombIds.delete(event.bombId);
    }
    // S118 KABOOM-MP-SPRINT-B chunk 2 — scan blast cells for soft
    // blocks; destroy + queue blockDestroyed events. Track destroyed
    // cells in a Set so two overlapping blasts (chain or simultaneous)
    // don't double-emit for the same cell. Pickup spawn ships in S119.
    if (detonated.length > 0) {
      const destroyedThisTick = new Set<string>();
      const killedThisTick = new Set<string>();
      for (const event of detonated) {
        for (const cell of event.cells) {
          const cellKey = `${cell.gx},${cell.gz}`;
          // Soft-block destruction
          if (!destroyedThisTick.has(cellKey) && this.map.cellAt(cell.gx, cell.gz) === "soft-block") {
            this.map.destroySoftBlock(cell.gx, cell.gz);
            destroyedThisTick.add(cellKey);
            // S119 — roll deterministic per-cell RNG for pickup drop.
            // Same cell always yields the same kind on the same world
            // seed, so the bot-vs-bot regression replay stays stable.
            const droppedPickupKind = this.rollPickupForCell(cell.gx, cell.gz);
            if (droppedPickupKind !== undefined) {
              this.spawnPickup(cell.gx, cell.gz, droppedPickupKind);
            }
            this.pendingBlockDestroyed.push({
              gx: cell.gx,
              gz: cell.gz,
              ...(droppedPickupKind !== undefined ? { droppedPickupKind } : {})
            });
          }
          // S118/S120 KABOOM-MP-SPRINT-B — bomber kill scan. Any ALIVE
          // bomber (human or bot) whose GridPosition matches this cell
          // gets BomberStats.alive flipped to false + a bomberDied
          // event with killerId = blast.ownerId.
          for (const bomberEnt of this.allBomberEntityIds()) {
            if (killedThisTick.has(bomberEnt)) continue;
            const gp = this.world.getComponent<{ gx?: number; gz?: number }>(bomberEnt, GRID_POSITION);
            if (gp?.gx !== cell.gx || gp?.gz !== cell.gz) continue;
            const stats = this.world.getComponent<{ alive?: boolean; range?: number; maxBombs?: number }>(bomberEnt, BOMBER_STATS);
            if (stats?.alive === false) continue;
            this.world.setComponent(bomberEnt, BOMBER_STATS, { ...stats, alive: false });
            killedThisTick.add(bomberEnt);
            const killerId = event.ownerId !== "" ? event.ownerId : undefined;
            this.pendingBomberDied.push({
              entityId: bomberEnt,
              blastOriginGx: event.originGx,
              blastOriginGz: event.originGz,
              ...(killerId !== undefined ? { killerId } : {})
            });
          }
        }
      }
      this.pendingBlastEvents.push(...detonated);
    }
    // S119 KABOOM-MP-SPRINT-B chunk 3 — evaluate round resolution
    // after all blast / kill / chain processing finishes. Idempotent —
    // once phase != 'playing' we skip until the next reset (S120).
    this.maybeResolveRound();
  }

  /**
   * S119 KABOOM-MP-SPRINT-B chunk 3 — examine alive bombers; emit
   * roundResolved once if the count dropped to ≤1. Picks phase from
   * the surviving bomber (won when one alive, draw when zero) and
   * bumps the tally slot for the appropriate player. Locks placeBomb
   * by leaving phase != 'playing'.
   */
  private maybeResolveRound(): void {
    const round = this.world.getComponent<{
      phase?: "playing" | "won" | "lost" | "draw";
      tally?: { player: number; bot: number; draws: number };
      roundNumber?: number;
    }>(ROUND_STATE_ENTITY, ROUND_STATE);
    if (round === undefined) return;
    if (round.phase !== "playing") return; // already resolved
    if (this.playerIds.size === 0) return; // empty session — nothing to resolve
    const allBomberIds = this.allBomberEntityIds();
    // Need at least 2 bombers for a meaningful resolve (solo human
    // without the bot is treated as "still playing").
    if (allBomberIds.length < 2) return;
    const aliveBomberIds: string[] = [];
    for (const entityId of allBomberIds) {
      const stats = this.world.getComponent<{ alive?: boolean }>(entityId, BOMBER_STATS);
      if (stats?.alive !== false) aliveBomberIds.push(entityId);
    }
    if (aliveBomberIds.length > 1) return; // round still in progress
    const winnerEntityId = aliveBomberIds[0];
    const tally = { ...(round.tally ?? { player: 0, bot: 0, draws: 0 }) };
    let phase: "won" | "lost" | "draw";
    if (aliveBomberIds.length === 0) {
      phase = "draw";
      tally.draws += 1;
    } else {
      // Winner mapping: if a human player (entity id "player.<x>") won
      // → 'won' (first-joined human) or 'lost' (later joiner). If the
      // bot won, also 'lost' from the first-human's POV.
      if (winnerEntityId === BOT_ENTITY_ID) {
        phase = "lost";
        tally.bot += 1;
      } else {
        const winnerPlayerId = winnerEntityId!.startsWith("player.")
          ? winnerEntityId!.slice("player.".length)
          : undefined;
        const winnerIndex = winnerPlayerId !== undefined ? this.playerJoinIndex.get(winnerPlayerId) ?? 0 : 0;
        if (winnerIndex === 0) {
          phase = "won";
          tally.player += 1;
        } else {
          phase = "lost";
          tally.bot += 1;
        }
      }
    }
    this.world.setComponent(ROUND_STATE_ENTITY, ROUND_STATE, {
      ...round,
      phase,
      tally,
      ...(winnerEntityId !== undefined ? { winnerId: winnerEntityId } : {})
    });
    this.pendingRoundResolved.push({
      phase,
      ...(winnerEntityId !== undefined ? { winnerId: winnerEntityId } : {}),
      tally,
      nextRoundAt: ROUND_RESOLVE_NEXT_ROUND_DELAY_S
    });
    // S125 — match-resolve check. When either tally slot reaches
    // MatchState.target the match flips to 'resolved' + records the
    // winning side ('player' / 'bot' / 'draw'). Match-resolve takes
    // precedence over round auto-restart: when phase === 'resolved'
    // we skip the round-reset (game stays paused on the final round
    // state until a fresh restart command — out of scope for S125).
    const match = this.world.getComponent<{
      phase?: "playing" | "resolved";
      target?: number;
      matchNumber?: number;
      lastMatchWinner?: "player" | "bot" | "draw";
    }>(MATCH_STATE_ENTITY, MATCH_STATE);
    if (match !== undefined && match.phase === "playing") {
      const target = match.target ?? DEFAULT_MATCH_TARGET;
      let matchWinner: "player" | "bot" | "draw" | undefined;
      if (tally.player >= target) matchWinner = "player";
      else if (tally.bot >= target) matchWinner = "bot";
      if (matchWinner !== undefined) {
        this.world.setComponent(MATCH_STATE_ENTITY, MATCH_STATE, {
          ...match,
          phase: "resolved",
          lastMatchWinner: matchWinner
        });
        // Match resolved → no auto-restart. Round-state.phase stays
        // at the resolved value indefinitely; placeBomb stays gated.
        return;
      }
    }
    // S120 — round-only resolve: schedule auto-restart timer (3 s).
    this.resetCountdown = ROUND_RESOLVE_NEXT_ROUND_DELAY_S;
  }

  /**
   * S120 KABOOM-MP-SPRINT-B chunk 4 — round reset.
   * Clears bombs + pickups, reloads the map (soft-blocks back), respawns
   * every player at SPAWN_POSITION, flips BomberStats.alive=true, clears
   * stat bumps, bumps RoundState.roundNumber, flips phase back to
   * 'playing'. The next placeBomb is accepted again.
   */
  private resetRound(): void {
    // Remove all bombs.
    for (const bombId of this.bombIds) {
      this.world.removeEntity(bombId);
    }
    this.bombIds.clear();
    // Remove all pickups.
    for (const pickupId of this.pickupIds) {
      this.world.removeEntity(pickupId);
    }
    this.pickupIds.clear();
    // Reload the obstacle map (re-add destroyed soft blocks).
    this.map.reset();
    // Respawn each bomber at its spawn cell + flip alive=true; clear
    // accumulated stat bumps so the next round starts from defaults.
    for (const playerId of this.playerIds) {
      const entityId = playerEntityId(playerId);
      this.world.setComponent(entityId, TRANSFORM, { position: [...SPAWN_POSITION] });
      this.world.setComponent(entityId, GRID_POSITION, {
        gx: Math.round(SPAWN_POSITION[0]),
        gz: Math.round(SPAWN_POSITION[2])
      });
      this.world.setComponent(entityId, BOMBER_STATS, { alive: true, range: DEFAULT_BOMB_RANGE, maxBombs: 1 });
      this.world.setComponent(entityId, SERVER_INTENT_MOVE, { direction: [0, 0], lastSequence: -1 });
    }
    // S120 — re-arm the server bot at its own spawn cell.
    if (this.hasBot) {
      this.world.setComponent(BOT_ENTITY_ID, TRANSFORM, { position: [...BOT_SPAWN_POSITION] });
      this.world.setComponent(BOT_ENTITY_ID, GRID_POSITION, {
        gx: Math.round(BOT_SPAWN_POSITION[0]),
        gz: Math.round(BOT_SPAWN_POSITION[2])
      });
      this.world.setComponent(BOT_ENTITY_ID, BOMBER_STATS, { alive: true, range: DEFAULT_BOMB_RANGE, maxBombs: 1 });
      this.world.setComponent(BOT_ENTITY_ID, SERVER_INTENT_MOVE, { direction: [0, 0], lastSequence: -1 });
    }
    // Bump RoundState.roundNumber + flip phase back to playing.
    const round = this.world.getComponent<{
      tally?: { player: number; bot: number; draws: number };
      roundNumber?: number;
    }>(ROUND_STATE_ENTITY, ROUND_STATE);
    this.world.setComponent(ROUND_STATE_ENTITY, ROUND_STATE, {
      phase: "playing",
      tally: round?.tally ?? { player: 0, bot: 0, draws: 0 },
      roundNumber: (round?.roundNumber ?? 1) + 1
    });
  }

  /** S119 — drain the per-tick queue of roundResolved events. */
  drainRoundResolved(): RoundResolvedEvent[] {
    if (this.pendingRoundResolved.length === 0) return [];
    const out = this.pendingRoundResolved;
    this.pendingRoundResolved = [];
    return out;
  }

  /**
   * S117 KABOOM-MP-SPRINT-B chunk 3 — drain the queue of blast events
   * accumulated during the latest tick(). Transport calls this each
   * server frame and broadcasts the events to every connected client.
   * Returns the queue + clears it.
   */
  drainBlastEvents(): BlastEvent[] {
    if (this.pendingBlastEvents.length === 0) return [];
    const out = this.pendingBlastEvents;
    this.pendingBlastEvents = [];
    return out;
  }

  /**
   * S118 KABOOM-MP-SPRINT-B chunk 2 — drain the per-tick queue of
   * blockDestroyed events. Transport calls this each server frame and
   * broadcasts to every client. Returns the queue + clears it.
   */
  drainBlockDestroyed(): BlockDestroyedEvent[] {
    if (this.pendingBlockDestroyed.length === 0) return [];
    const out = this.pendingBlockDestroyed;
    this.pendingBlockDestroyed = [];
    return out;
  }

  /**
   * S118 KABOOM-MP-SPRINT-B chunk 2 — drain the per-tick queue of
   * bomberDied events. Transport calls this each server frame and
   * broadcasts to every client. Returns the queue + clears it.
   */
  drainBomberDied(): BomberDiedEvent[] {
    if (this.pendingBomberDied.length === 0) return [];
    const out = this.pendingBomberDied;
    this.pendingBomberDied = [];
    return out;
  }

  expiredPlayers(timeoutSeconds: number): string[] {
    if (!Number.isFinite(timeoutSeconds) || timeoutSeconds <= 0) return [];
    const threshold = this.elapsed - timeoutSeconds;
    const expired: string[] = [];
    for (const playerId of this.playerIds) {
      const a = this.world.getComponent<ActivityLike>(playerEntityId(playerId), SERVER_LAST_ACTIVITY);
      if (a !== undefined && a.lastActivity < threshold) expired.push(playerId);
    }
    return expired;
  }

  elapsedSeconds(): number {
    return this.elapsed;
  }

  snapshot(): Snapshot {
    const entities: SnapshotEntity[] = [];
    const lastAcked: Record<string, number> = {};
    for (const entityId of this.allBomberEntityIds()) {
      const presence = this.world.getComponent<PresenceLike>(entityId, PRESENCE);
      const presencePlayerId = presence?.playerId ?? entityId;
      const transform = this.world.getComponent<TransformLike>(entityId, TRANSFORM);
      const recipe = this.world.getComponent<RecipeLike>(entityId, CHARACTER_RECIPE);
      const intent = this.world.getComponent<IntentLike>(entityId, SERVER_INTENT_MOVE);
      const gp = this.world.getComponent<{ gx?: number; gz?: number }>(entityId, GRID_POSITION);
      const components: Record<string, unknown> = {
        Transform: { position: [...(transform?.position ?? SPAWN_POSITION)] },
        Presence: { playerId: presencePlayerId },
        Networked: { authority: "server" }
      };
      if (recipe?.recipe !== undefined) {
        components["CharacterRecipe"] = { recipe: recipe.recipe };
      }
      if (gp?.gx !== undefined && gp?.gz !== undefined) {
        components["GridPosition"] = { gx: gp.gx, gz: gp.gz };
      }
      const stats = this.world.getComponent<ServerBomberStats>(entityId, BOMBER_STATS);
      if (stats !== undefined) {
        const out: Record<string, unknown> = {
          alive: stats.alive ?? true,
          range: stats.range ?? DEFAULT_BOMB_RANGE,
          maxBombs: stats.maxBombs ?? 1
        };
        if (stats.canKick === true) out["canKick"] = true;
        if ((stats.remoteDetonateCharges ?? 0) > 0) {
          out["remoteDetonateCharges"] = stats.remoteDetonateCharges;
        }
        if (stats.shield === true) out["shield"] = true;
        // S147 KABOOM-PIERCE-SERVER-PARITY — ship pierce so the connected-
        // mode HUD's P-flag (S142 FEAT-KABOOM-PIERCE-HUD-001) lights up
        // for both tabs.
        if (stats.pierce === true) out["pierce"] = true;
        // S122 — ship custom speed when it differs from the baseline.
        if (stats.speed !== undefined && stats.speed !== PLAYER_SPEED) {
          out["speed"] = stats.speed;
        }
        components["BomberStats"] = out;
      }
      entities.push({ id: entityId, components });
      if (intent !== undefined && intent.lastSequence >= 0 && presencePlayerId !== BOT_ENTITY_ID) {
        lastAcked[presencePlayerId] = intent.lastSequence;
      }
    }
    // S117 — bomb entities. Snapshot carries Transform + GridPosition +
    // Bomb so the client decorator can render the wiggle, the audio
    // emits, and the local bomb-fuse-system (when re-enabled) can read
    // fuseRemaining. The fuseRemaining number sent here is the
    // server's live value; clients display but don't authoritatively
    // tick it (fuse tick is server-side per S117 chunk 3).
    for (const bombId of this.bombIds) {
      const transform = this.world.getComponent<TransformLike>(bombId, TRANSFORM);
      const gp = this.world.getComponent<{ gx?: number; gz?: number }>(bombId, GRID_POSITION);
      const bomb = this.world.getComponent<{ fuseRemaining?: number; range?: number; ownerId?: string }>(bombId, BOMB);
      const components: Record<string, unknown> = {};
      if (transform?.position !== undefined) components["Transform"] = { position: [...transform.position] };
      if (gp?.gx !== undefined && gp?.gz !== undefined) components["GridPosition"] = { gx: gp.gx, gz: gp.gz };
      if (bomb !== undefined) components["Bomb"] = { ...bomb };
      entities.push({ id: bombId, components });
    }
    // S122 KABOOM-MP-MID-JOIN-CATCHUP — ship the server's authoritative
    // RoundState under the server-namespaced id `mp.round-state` so a
    // newly-joined client picks up the current phase/tally/roundNumber
    // immediately from the snapshot diff, instead of waiting for the
    // next roundResolved event. The local `kaboom.round-state` HUD
    // entity stays client-owned (no collision); the connected-blast-
    // decoder mirrors mp.round-state → kaboom.round-state each frame.
    const round = this.world.getComponent<{
      phase?: string;
      tally?: { player: number; bot: number; draws: number };
      roundNumber?: number;
      winnerId?: string;
    }>(ROUND_STATE_ENTITY, ROUND_STATE);
    if (round !== undefined) {
      const out: Record<string, unknown> = {
        phase: round.phase ?? "playing",
        tally: round.tally ?? { player: 0, bot: 0, draws: 0 },
        roundNumber: round.roundNumber ?? 1
      };
      if (round.winnerId !== undefined) out["winnerId"] = round.winnerId;
      entities.push({
        id: MP_ROUND_STATE_ENTITY,
        components: { RoundState: out, Networked: { authority: "server" } }
      });
    }
    // S125 — ship MatchState verbatim under mp.match-state so a new
    // client picks up the match phase + target + last winner from the
    // first snapshot.
    const match = this.world.getComponent<{
      phase?: string;
      target?: number;
      matchNumber?: number;
      lastMatchWinner?: string;
    }>(MATCH_STATE_ENTITY, MATCH_STATE);
    if (match !== undefined) {
      const out: Record<string, unknown> = {
        phase: match.phase ?? "playing",
        target: match.target ?? DEFAULT_MATCH_TARGET,
        matchNumber: match.matchNumber ?? 1
      };
      if (match.lastMatchWinner !== undefined) out["lastMatchWinner"] = match.lastMatchWinner;
      entities.push({
        id: MP_MATCH_STATE_ENTITY,
        components: { MatchState: out, Networked: { authority: "server" } }
      });
    }
    // S119 — pickup entities. Snapshot ships Pickup + GridPosition +
    // Transform so clients can render with the existing local pickup
    // visuals (the local pickup-spawn-system is dropped on connected).
    for (const pickupId of this.pickupIds) {
      const transform = this.world.getComponent<TransformLike>(pickupId, TRANSFORM);
      const gp = this.world.getComponent<{ gx?: number; gz?: number }>(pickupId, GRID_POSITION);
      const pickup = this.world.getComponent<{ kind?: PickupKind }>(pickupId, PICKUP);
      const components: Record<string, unknown> = {};
      if (transform?.position !== undefined) components["Transform"] = { position: [...transform.position] };
      if (gp?.gx !== undefined && gp?.gz !== undefined) components["GridPosition"] = { gx: gp.gx, gz: gp.gz };
      if (pickup?.kind !== undefined) components["Pickup"] = { kind: pickup.kind };
      entities.push({ id: pickupId, components });
    }
    return { elapsed: this.elapsed, entities, lastAcked, playerSpeed: PLAYER_SPEED };
  }

  playerCount(): number {
    return this.playerIds.size;
  }

  /**
   * S117 KABOOM-MP-SPRINT-B — accessor for future sprints (bomb-placement,
   * blast-propagation, etc.) that need to register systems against the
   * authoritative ECS world. Today the transport layer only uses the
   * canonical surface above; this is the seam Sprint B's per-system
   * stories bolt onto.
   */
  ecsWorld(): World {
    return this.world;
  }
}
