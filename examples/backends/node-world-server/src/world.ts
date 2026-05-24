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
const ROUND_RESOLVE_NEXT_ROUND_DELAY_S = 3.0;

/** Kaboom pickup kinds — matches the protocol's pickupCollected enum. */
export type PickupKind = "bomb-up" | "fire-up" | "speed-up" | "kick" | "remote-detonate" | "shield";

// Drop table — repeated entries scale relative frequency (S82 client mirror).
const PICKUP_KINDS: ReadonlyArray<PickupKind> = [
  "bomb-up", "bomb-up",
  "fire-up", "fire-up",
  "speed-up", "speed-up",
  "kick",
  "remote-detonate",
  "shield"
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
};

const MAX_BOMBS_CAP = 8;
const MAX_RANGE_CAP = 8;
const REMOTE_DETONATE_CHARGES_CAP = 3;

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
    case "speed-up":
      // Speed migration deferred — GridMover.speed lives client-side
      // until the client/server speed model is unified (post-S119).
      return undefined;
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
    // S120 — spawn bot.1 as a server-owned bomber. Carries the same
    // shape as a player.<id> entity so the kill-scan, pickup-collect,
    // and snapshot paths treat it uniformly. remote-bomber-decorator
    // on the client picks it up via Presence.playerId !== localPlayerId.
    this.hasBot = options.spawnBot !== false;
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

    // S121 — post-bomb flee: if the bot's current cell is dangerous
    // (it just placed a bomb here, or got caught in another bomb's
    // range), prefer the candidate that maximises manhattan distance
    // from the closest danger origin.
    let choice: Vec2 | undefined;
    if (choicePool.length > 0) {
      if (dangerCells.has(`${gp.gx},${gp.gz}`)) {
        let bestScore = -Infinity;
        let bestPick: Vec2 = choicePool[0]!;
        for (const cand of choicePool) {
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
        choice = choicePool[this.botRng.nextInt(0, choicePool.length)]!;
      }
      this.world.setComponent(BOT_ENTITY_ID, SERVER_INTENT_MOVE, {
        direction: choice,
        lastSequence: -1
      } satisfies IntentLike);
    }

    // S120/S121 — bot bomb. Chance boosted when adjacent to a soft-
    // block; never bomb when the current cell is already inside a
    // bomb's blast (would self-detonate immediately).
    if (!dangerCells.has(`${gp.gx},${gp.gz}`)) {
      const adjacentSoft = this.hasAdjacentSoftBlock(gp.gx, gp.gz);
      const chance = adjacentSoft ? BOT_BOMB_CHANCE_NEAR_SOFT : BOT_BOMB_CHANCE;
      if (this.botRng.next() < chance) {
        this.placeBombForEntity(BOT_ENTITY_ID, gp.gx, gp.gz);
      }
    }
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
      const bomb = this.world.getComponent<{ range?: number }>(bombId, BOMB);
      if (gp?.gx === undefined || gp?.gz === undefined) continue;
      const range = bomb?.range ?? DEFAULT_BOMB_RANGE;
      const cells = computeBlastCells(this.map, gp.gx, gp.gz, range);
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
    this.world.setComponent(bombId, BOMB, {
      fuseRemaining: DEFAULT_BOMB_FUSE_SECONDS,
      range: stats?.maxBombs !== undefined ? DEFAULT_BOMB_RANGE : DEFAULT_BOMB_RANGE,
      ownerId: ownerEntityId
    });
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
    this.world.setComponent(bombId, BOMB, {
      fuseRemaining: DEFAULT_BOMB_FUSE_SECONDS,
      range: DEFAULT_BOMB_RANGE,
      ownerId: playerEntId
    });
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
      const stats = this.world.getComponent<{ alive?: boolean }>(entityId, BOMBER_STATS);
      if (stats?.alive === false) continue;
      const pos = transform.position ?? SPAWN_POSITION;
      const [dx, dz] = intent.direction;
      let nextX = pos[0] ?? 0;
      let nextZ = pos[2] ?? 0;
      if (dx !== 0 || dz !== 0) {
        nextX = nextX + dx * PLAYER_SPEED * dt;
        nextZ = nextZ + dz * PLAYER_SPEED * dt;
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
      const bomb = this.world.getComponent<{ fuseRemaining?: number; range?: number; ownerId?: string }>(bombId, BOMB);
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
          cells: computeBlastCells(this.map, originGx, originGz, range)
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
          const bomb = this.world.getComponent<{ range?: number; ownerId?: string }>(bombId, BOMB);
          if (bomb === undefined) continue;
          const range = bomb.range ?? DEFAULT_BOMB_RANGE;
          detonatedIds.add(bombId);
          detonated.push({
            originGx: cell.gx,
            originGz: cell.gz,
            range,
            ownerId: bomb.ownerId ?? "",
            bombId,
            cells: computeBlastCells(this.map, cell.gx, cell.gz, range)
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
    // S120 — schedule the auto-restart timer (default 3 s).
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
    // S119 KABOOM-MP-SPRINT-B chunk 3 — RoundState is INTENTIONALLY
    // not shipped in the snapshot. The local kaboom-crew client owns
    // the kaboom.round-state entity (bootstrap creates it at boot for
    // the HUD); shipping it would trigger an id-collision rejection
    // in ws-network-adapter. Clients learn about state changes via
    // the discrete roundResolved protocol event instead.
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
