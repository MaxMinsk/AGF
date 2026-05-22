// Server-side authoritative world for the node-world-server skeleton.
//
// Scope is intentionally tiny: enough to prove the protocol round-trip with a
// real client. Each connected player gets a Transform-only entity that the
// server moves in response to inbound `intent.move` messages. The world emits
// a `world.snapshot` on every tick.

type Vec3 = [number, number, number];
type Vec2 = readonly [number, number];

type PlayerEntity = {
  id: string;
  position: Vec3;
  direction: Vec2;
  lastIntentSequence: number;
  /** Server-elapsed timestamp of the most recent activity (join or intent). */
  lastActivity: number;
  /**
   * S112 KABOOM-MP-RECIPE-SYNC — opaque base64-url-safe recipe string
   * carried in player.join. The server treats it as a string blob and
   * echoes it back in every snapshot as a `CharacterRecipe` component
   * on the player.<id> entity. Untrusted client input — server does
   * NOT validate the content.
   */
  recipe?: string;
};

export type SnapshotEntity = {
  id: string;
  components: Record<string, unknown>;
};

export type Snapshot = {
  elapsed: number;
  entities: SnapshotEntity[];
  lastAcked: Record<string, number>;
  /**
   * The integration speed the server is using when applying `intent.move`.
   * Broadcast so the client's rollback-replay does not have to hard-code it.
   */
  playerSpeed: number;
};

/** Must match `PlayerControlled.speed` in the canonical Beacon scene so the client's prediction does not drift against the server. */
const PLAYER_SPEED = 3.5;
const SPAWN_POSITION: Vec3 = [0, 0.4, 0];

export class ServerWorld {
  private readonly players = new Map<string, PlayerEntity>();
  private elapsed = 0;

  join(playerId: string, recipe?: string): void {
    if (this.players.has(playerId)) {
      // S112 — re-join with a different recipe overwrites (reconnect
      // flow). Position / direction stay.
      const existing = this.players.get(playerId)!;
      if (recipe !== undefined) existing.recipe = recipe;
      return;
    }
    this.players.set(playerId, {
      id: playerId,
      position: [...SPAWN_POSITION],
      direction: [0, 0],
      lastIntentSequence: -1,
      lastActivity: this.elapsed,
      ...(recipe !== undefined ? { recipe } : {})
    });
  }

  leave(playerId: string): void {
    this.players.delete(playerId);
  }

  setIntent(playerId: string, direction: Vec2, sequence: number | undefined): void {
    const player = this.players.get(playerId);
    if (player === undefined) {
      return;
    }
    if (sequence !== undefined && sequence <= player.lastIntentSequence) {
      return;
    }
    if (sequence !== undefined) {
      player.lastIntentSequence = sequence;
    }
    player.direction = direction;
    player.lastActivity = this.elapsed;
  }

  tick(dt: number): void {
    this.elapsed += dt;
    for (const player of this.players.values()) {
      const [dx, dz] = player.direction;
      player.position[0] += dx * PLAYER_SPEED * dt;
      player.position[2] += dz * PLAYER_SPEED * dt;
    }
  }

  /**
   * Returns ids of players whose last activity is older than `timeoutSeconds`
   * relative to the current `elapsed`. Activity is bumped on join and on every
   * `intent.move`.
   */
  expiredPlayers(timeoutSeconds: number): string[] {
    if (!Number.isFinite(timeoutSeconds) || timeoutSeconds <= 0) {
      return [];
    }
    const threshold = this.elapsed - timeoutSeconds;
    const expired: string[] = [];
    for (const player of this.players.values()) {
      if (player.lastActivity < threshold) {
        expired.push(player.id);
      }
    }
    return expired;
  }

  /** Server-side elapsed seconds since the world started. */
  elapsedSeconds(): number {
    return this.elapsed;
  }

  snapshot(): Snapshot {
    const entities: SnapshotEntity[] = [];
    const lastAcked: Record<string, number> = {};
    for (const player of this.players.values()) {
      entities.push({
        id: `player.${player.id}`,
        components: {
          Transform: { position: [...player.position] },
          Presence: { playerId: player.id },
          Networked: { authority: "server" },
          // S112 KABOOM-MP-RECIPE-SYNC — opaque recipe blob; clients
          // decode it to render the remote bomber with the correct
          // visual identity. Omitted when the player hasn't supplied a
          // recipe in player.join (typed clients without the kaboom
          // module work as before).
          ...(player.recipe !== undefined ? { CharacterRecipe: { recipe: player.recipe } } : {})
        }
      });
      if (player.lastIntentSequence >= 0) {
        lastAcked[player.id] = player.lastIntentSequence;
      }
    }
    return { elapsed: this.elapsed, entities, lastAcked, playerSpeed: PLAYER_SPEED };
  }

  playerCount(): number {
    return this.players.size;
  }
}
