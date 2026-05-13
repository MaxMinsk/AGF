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
};

export type SnapshotEntity = {
  id: string;
  components: Record<string, unknown>;
};

export type Snapshot = {
  elapsed: number;
  entities: SnapshotEntity[];
};

const PLAYER_SPEED = 3;
const SPAWN_POSITION: Vec3 = [0, 0.4, 0];

export class ServerWorld {
  private readonly players = new Map<string, PlayerEntity>();
  private elapsed = 0;

  join(playerId: string): void {
    if (this.players.has(playerId)) {
      return;
    }
    this.players.set(playerId, {
      id: playerId,
      position: [...SPAWN_POSITION],
      direction: [0, 0],
      lastIntentSequence: -1
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
  }

  tick(dt: number): void {
    this.elapsed += dt;
    for (const player of this.players.values()) {
      const [dx, dz] = player.direction;
      player.position[0] += dx * PLAYER_SPEED * dt;
      player.position[2] += dz * PLAYER_SPEED * dt;
    }
  }

  snapshot(): Snapshot {
    const entities: SnapshotEntity[] = [];
    for (const player of this.players.values()) {
      entities.push({
        id: `player.${player.id}`,
        components: {
          Transform: { position: [...player.position] },
          Presence: { playerId: player.id },
          Networked: { authority: "server" }
        }
      });
    }
    return { elapsed: this.elapsed, entities };
  }

  playerCount(): number {
    return this.players.size;
  }
}
