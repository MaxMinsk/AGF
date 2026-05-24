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
// S118 KABOOM-MP-SPRINT-B — minimal server-side bomber stats. Only
// `alive` is gameplay-load-bearing on the server today (kill detection);
// `range` + `maxBombs` will migrate to the server in S119 with pickups.
const BOMBER_STATS: ComponentName = "BomberStats";

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
  /** Pickup that should spawn in the cell. undefined in S118; S119 wires the pickup-spawn RNG. */
  droppedPickupKind?: string;
};

/** S118 KABOOM-MP-SPRINT-B chunk 2 — one bomber death from a blast. */
export type BomberDiedEvent = {
  entityId: string;
  blastOriginGx: number;
  blastOriginGz: number;
  killerId?: string;
};

export type ServerWorldOptions = {
  /** Override the map loader. Tests pass synthetic maps; production uses the bundled start.scene.json. */
  map?: LoadedMap;
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
  /** S118 KABOOM-MP-SPRINT-B chunk 2 — authoritative obstacle grid (hard walls + soft blocks). */
  private readonly map: LoadedMap;

  constructor(options: ServerWorldOptions = {}) {
    this.map = options.map ?? loadDefaultMap();
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
    // Integrate intent.move into Transform.position for every player
    // entity. A future Sprint B chunk can replace this inline loop
    // with a proper scheduler-registered system; today the surface is
    // small enough that a direct walk is cheaper.
    for (const playerId of this.playerIds) {
      const entityId = playerEntityId(playerId);
      const transform = this.world.getComponent<TransformLike>(entityId, TRANSFORM);
      const intent = this.world.getComponent<IntentLike>(entityId, SERVER_INTENT_MOVE);
      if (transform === undefined || intent === undefined) continue;
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
            this.pendingBlockDestroyed.push({ gx: cell.gx, gz: cell.gz });
          }
          // S118 KABOOM-MP-SPRINT-B chunk 2 — bomber kill scan. Any
          // ALIVE player.<id> whose GridPosition matches this cell
          // gets BomberStats.alive flipped to false + a bomberDied
          // event with killerId = blast.ownerId.
          for (const pid of this.playerIds) {
            if (killedThisTick.has(pid)) continue;
            const playerEnt = playerEntityId(pid);
            const gp = this.world.getComponent<{ gx?: number; gz?: number }>(playerEnt, GRID_POSITION);
            if (gp?.gx !== cell.gx || gp?.gz !== cell.gz) continue;
            const stats = this.world.getComponent<{ alive?: boolean; range?: number; maxBombs?: number }>(playerEnt, BOMBER_STATS);
            if (stats?.alive === false) continue;
            this.world.setComponent(playerEnt, BOMBER_STATS, { ...stats, alive: false });
            killedThisTick.add(pid);
            const killerId = event.ownerId !== "" ? event.ownerId : undefined;
            this.pendingBomberDied.push({
              entityId: playerEnt,
              blastOriginGx: event.originGx,
              blastOriginGz: event.originGz,
              ...(killerId !== undefined ? { killerId } : {})
            });
          }
        }
      }
      this.pendingBlastEvents.push(...detonated);
    }
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
    for (const playerId of this.playerIds) {
      const entityId = playerEntityId(playerId);
      const transform = this.world.getComponent<TransformLike>(entityId, TRANSFORM);
      const recipe = this.world.getComponent<RecipeLike>(entityId, CHARACTER_RECIPE);
      const intent = this.world.getComponent<IntentLike>(entityId, SERVER_INTENT_MOVE);
      const gp = this.world.getComponent<{ gx?: number; gz?: number }>(entityId, GRID_POSITION);
      const components: Record<string, unknown> = {
        Transform: { position: [...(transform?.position ?? SPAWN_POSITION)] },
        Presence: { playerId },
        Networked: { authority: "server" }
      };
      if (recipe?.recipe !== undefined) {
        components["CharacterRecipe"] = { recipe: recipe.recipe };
      }
      // S118 — ship GridPosition so clients (and future server-side
      // death/blast decoders) can read the bomber's authoritative cell.
      if (gp?.gx !== undefined && gp?.gz !== undefined) {
        components["GridPosition"] = { gx: gp.gx, gz: gp.gz };
      }
      // S118 — ship BomberStats.alive (range/maxBombs are static today
      // since pickup migration lands in S119, but emitting them keeps
      // the server snapshot self-contained for the eventual switch).
      const stats = this.world.getComponent<{ alive?: boolean; range?: number; maxBombs?: number }>(entityId, BOMBER_STATS);
      if (stats !== undefined) {
        components["BomberStats"] = {
          alive: stats.alive ?? true,
          range: stats.range ?? DEFAULT_BOMB_RANGE,
          maxBombs: stats.maxBombs ?? 1
        };
      }
      entities.push({ id: entityId, components });
      if (intent !== undefined && intent.lastSequence >= 0) {
        lastAcked[playerId] = intent.lastSequence;
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
