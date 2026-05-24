// WebSocket transport for node-world-server.
//
// Stateless framing: one JSON object per WS text frame, matching
// `schemas/protocol.schema.json`. The server validates every inbound message
// with AJV before routing it. Outbound messages are not re-validated — the
// `ServerWorld` only emits well-typed snapshots.

import { WebSocketServer, WebSocket } from "ws";
import type { ValidateFunction } from "ajv";
import type { ServerWorld, Snapshot } from "./world.js";

type ProtocolMessage =
  | { kind: "player.join"; sequence?: number; payload: { playerId: string; displayName?: string; recipe?: string } }
  | { kind: "player.leave"; sequence?: number; payload: { playerId: string; reason?: string } }
  | {
      kind: "intent.move";
      sequence?: number;
      payload: { playerId: string; direction: [number, number] };
    }
  // S117 KABOOM-MP-SPRINT-B chunk 2 — client requests a bomb spawn at
  // its current grid cell. Server validates + spawns; the new Bomb
  // entity appears in the next snapshot to all clients.
  | { kind: "placeBombRequest"; sequence?: number; payload: { entityId: string; gx: number; gz: number } }
  // S117 KABOOM-MP-SPRINT-B chunk 3 — server emits a blastEvent each
  // time a bomb's fuse hits zero. cells[] stays empty in S117 (no
  // propagation yet; S118 fills it). Schema requires payload.cells +
  // payload.ownerId (string); we keep `bombId` separate from `ownerId`
  // because the schema's `ownerId` already maps onto the bomb entity id.
  | {
      kind: "blastEvent";
      sequence?: number;
      payload: {
        originGx: number;
        originGz: number;
        range: number;
        ownerId: string;
        cells: { gx: number; gz: number }[];
      };
    }
  // S118 KABOOM-MP-SPRINT-B chunk 2 — server tells every client that
  // a soft block was destroyed by a blast. Client maps (gx, gz) back
  // to the local soft.* entity (spawned from the scene) and deletes it.
  | {
      kind: "blockDestroyed";
      sequence?: number;
      payload: {
        gx: number;
        gz: number;
        droppedPickupKind?: string;
      };
    }
  // S118 KABOOM-MP-SPRINT-B chunk 2 — server tells every client that
  // a bomber's BomberStats.alive flipped to false. entityId is the
  // server-owned player.<id>; killerId (when present) is the placer's
  // player.<id> for scoring/credits in S119.
  | {
      kind: "bomberDied";
      sequence?: number;
      payload: {
        entityId: string;
        blastOriginGx: number;
        blastOriginGz: number;
        killerId?: string;
      };
    }
  // S119 KABOOM-MP-SPRINT-B chunk 3 — server tells every client that
  // a bomber collected a pickup. Client decoder consumes for HUD/audio;
  // the pickup entity itself leaves the snapshot via diff.
  | {
      kind: "pickupCollected";
      sequence?: number;
      payload: {
        entityId: string;
        kind: string;
        gx: number;
        gz: number;
        pickerId: string;
      };
    }
  // S119 KABOOM-MP-SPRINT-B chunk 3 — server emits roundResolved
  // when the alive bomber count drops to ≤1. Fires once per round;
  // RoundState in snapshot mirrors the same phase/tally.
  | {
      kind: "roundResolved";
      sequence?: number;
      payload: {
        phase: "won" | "lost" | "draw";
        winnerId?: string;
        tally: { player: number; bot: number; draws: number };
        nextRoundAt?: number;
      };
    }
  | { kind: "world.snapshot"; sequence?: number; payload: Snapshot };

export type TransportOptions = {
  port: number;
  world: ServerWorld;
  validate: ValidateFunction;
  log?: (line: string) => void;
  /**
   * Snapshot tick rate in Hz. Server ticks {@link tickHz} times per second and
   * broadcasts the resulting snapshot to every connected client. Defaults to
   * 30 — the client uses input prediction so it does not need a full 60 Hz
   * stream just to feel responsive; remote players are smoothed against the
   * incoming snapshots.
   */
  tickHz?: number;
  /**
   * Drop a player whose last activity is older than this many seconds. Default
   * is 30 s. Pass 0 or a non-finite number to disable.
   */
  playerTimeoutSeconds?: number;
};

export type TransportHandle = {
  port: number;
  close(): Promise<void>;
};

export async function startWsTransport(options: TransportOptions): Promise<TransportHandle> {
  const log = options.log ?? ((line: string) => console.log(line));
  const tickHz = options.tickHz ?? 30;
  const tickIntervalMs = 1000 / tickHz;
  const dt = 1 / tickHz;
  const playerTimeoutSeconds = options.playerTimeoutSeconds ?? 30;
  const { world, validate } = options;

  const wss = new WebSocketServer({ port: options.port });
  await new Promise<void>((resolve, reject) => {
    wss.once("listening", () => resolve());
    wss.once("error", (error) => reject(error));
  });
  log(`[node-world-server] websocket listening on ws://127.0.0.1:${options.port}`);

  let outboundSequence = 0;
  const clients = new Set<WebSocket>();
  const clientPlayer = new WeakMap<WebSocket, string>();
  const playerSocket = new Map<string, WebSocket>();

  wss.on("connection", (socket) => {
    clients.add(socket);
    log("[node-world-server] client connected");

    socket.on("message", (data) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(String(data));
      } catch {
        log("[node-world-server] dropping non-JSON frame");
        return;
      }
      if (!validate(parsed)) {
        log(`[node-world-server] dropping invalid frame: ${formatAjvErrors(validate)}`);
        return;
      }
      const message = parsed as ProtocolMessage;
      switch (message.kind) {
        case "player.join": {
          const { playerId, recipe } = message.payload;
          clientPlayer.set(socket, playerId);
          playerSocket.set(playerId, socket);
          world.join(playerId, recipe);
          log(`[node-world-server] join playerId=${playerId}${recipe !== undefined ? ` (recipe=${recipe.slice(0, 20)}...)` : ""} (total=${world.playerCount()})`);
          break;
        }
        case "player.leave": {
          const { playerId } = message.payload;
          world.leave(playerId);
          playerSocket.delete(playerId);
          log(`[node-world-server] leave playerId=${playerId} (total=${world.playerCount()})`);
          break;
        }
        case "intent.move": {
          world.setIntent(message.payload.playerId, message.payload.direction, message.sequence);
          break;
        }
        case "placeBombRequest": {
          // S117 KABOOM-MP-SPRINT-B — recover the local-player id from
          // the socket; ignore the entityId in the payload (clients
          // can't address other players' bomb placements).
          const playerId = clientPlayer.get(socket);
          if (playerId === undefined) break;
          const bombId = world.placeBomb(playerId, message.payload.gx, message.payload.gz);
          if (bombId !== undefined) {
            log(`[node-world-server] placeBomb playerId=${playerId} cell=(${message.payload.gx},${message.payload.gz}) → ${bombId}`);
          }
          break;
        }
        case "world.snapshot":
          break;
      }
    });

    socket.on("close", () => {
      const playerId = clientPlayer.get(socket);
      if (playerId !== undefined) {
        world.leave(playerId);
        if (playerSocket.get(playerId) === socket) {
          playerSocket.delete(playerId);
        }
      }
      clients.delete(socket);
      log("[node-world-server] client disconnected");
    });

    socket.on("error", (error) => {
      log(`[node-world-server] socket error: ${error.message}`);
    });
  });

  const tickId = setInterval(() => {
    world.tick(dt);

    // S117 KABOOM-MP-SPRINT-B chunk 3 — drain blast events from the
    // tick and broadcast each one to every connected client. Send the
    // blast frame BEFORE the snapshot so the client can react to the
    // detonation in the same frame the bomb leaves the snapshot.
    const blasts = world.drainBlastEvents();
    for (const blast of blasts) {
      const frame: ProtocolMessage = {
        kind: "blastEvent",
        sequence: outboundSequence,
        payload: {
          originGx: blast.originGx,
          originGz: blast.originGz,
          range: blast.range,
          ownerId: blast.ownerId,
          // S118 — cells now carry the cardinal walk (S117 sent []).
          cells: blast.cells.map((c) => ({ gx: c.gx, gz: c.gz }))
        }
      };
      outboundSequence += 1;
      const serialized = JSON.stringify(frame);
      for (const client of clients) {
        if (client.readyState === WebSocket.OPEN) client.send(serialized);
      }
      log(`[node-world-server] blastEvent origin=(${blast.originGx},${blast.originGz}) range=${blast.range} owner=${blast.ownerId} bomb=${blast.bombId} cells=${blast.cells.length}`);
    }

    // S118 KABOOM-MP-SPRINT-B chunk 2 — broadcast blockDestroyed for
    // each soft block the blast walk hit. Sent AFTER the blast frames
    // so clients receive the visual cue then the cleanup in order.
    const blocks = world.drainBlockDestroyed();
    for (const block of blocks) {
      const frame: ProtocolMessage = {
        kind: "blockDestroyed",
        sequence: outboundSequence,
        payload: {
          gx: block.gx,
          gz: block.gz,
          ...(block.droppedPickupKind !== undefined ? { droppedPickupKind: block.droppedPickupKind } : {})
        }
      };
      outboundSequence += 1;
      const serialized = JSON.stringify(frame);
      for (const client of clients) {
        if (client.readyState === WebSocket.OPEN) client.send(serialized);
      }
      log(`[node-world-server] blockDestroyed (${block.gx},${block.gz})`);
    }

    // S118 KABOOM-MP-SPRINT-B chunk 2 — broadcast bomberDied frames.
    // Sent AFTER blockDestroyed so clients see the cause (block) then
    // the consequence (death) in causal order on the wire.
    const deaths = world.drainBomberDied();
    for (const death of deaths) {
      const frame: ProtocolMessage = {
        kind: "bomberDied",
        sequence: outboundSequence,
        payload: {
          entityId: death.entityId,
          blastOriginGx: death.blastOriginGx,
          blastOriginGz: death.blastOriginGz,
          ...(death.killerId !== undefined ? { killerId: death.killerId } : {})
        }
      };
      outboundSequence += 1;
      const serialized = JSON.stringify(frame);
      for (const client of clients) {
        if (client.readyState === WebSocket.OPEN) client.send(serialized);
      }
      log(`[node-world-server] bomberDied entity=${death.entityId} killer=${death.killerId ?? "?"} origin=(${death.blastOriginGx},${death.blastOriginGz})`);
    }

    // S119 KABOOM-MP-SPRINT-B chunk 3 — broadcast pickupCollected.
    const pickups = world.drainPickupCollected();
    for (const ev of pickups) {
      const frame: ProtocolMessage = {
        kind: "pickupCollected",
        sequence: outboundSequence,
        payload: {
          entityId: ev.entityId,
          kind: ev.kind,
          gx: ev.gx,
          gz: ev.gz,
          pickerId: ev.pickerId
        }
      };
      outboundSequence += 1;
      const serialized = JSON.stringify(frame);
      for (const client of clients) {
        if (client.readyState === WebSocket.OPEN) client.send(serialized);
      }
      log(`[node-world-server] pickupCollected entity=${ev.entityId} picker=${ev.pickerId} kind=${ev.kind}`);
    }

    // S119 KABOOM-MP-SPRINT-B chunk 3 — broadcast roundResolved.
    const rounds = world.drainRoundResolved();
    for (const ev of rounds) {
      const frame: ProtocolMessage = {
        kind: "roundResolved",
        sequence: outboundSequence,
        payload: {
          phase: ev.phase,
          ...(ev.winnerId !== undefined ? { winnerId: ev.winnerId } : {}),
          tally: ev.tally,
          ...(ev.nextRoundAt !== undefined ? { nextRoundAt: ev.nextRoundAt } : {})
        }
      };
      outboundSequence += 1;
      const serialized = JSON.stringify(frame);
      for (const client of clients) {
        if (client.readyState === WebSocket.OPEN) client.send(serialized);
      }
      log(`[node-world-server] roundResolved phase=${ev.phase} winner=${ev.winnerId ?? "?"} tally=p${ev.tally.player}/b${ev.tally.bot}/d${ev.tally.draws}`);
    }

    const expired = world.expiredPlayers(playerTimeoutSeconds);
    for (const playerId of expired) {
      world.leave(playerId);
      log(`[node-world-server] timeout playerId=${playerId} (idle > ${playerTimeoutSeconds}s)`);
      const socket = playerSocket.get(playerId);
      if (socket !== undefined) {
        playerSocket.delete(playerId);
        if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
          socket.close(1000, "idle timeout");
        }
      }
    }

    if (clients.size === 0) {
      return;
    }
    const snapshot: ProtocolMessage = {
      kind: "world.snapshot",
      sequence: outboundSequence,
      payload: world.snapshot()
    };
    outboundSequence += 1;
    const frame = JSON.stringify(snapshot);
    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(frame);
      }
    }
  }, tickIntervalMs);

  return {
    port: options.port,
    async close(): Promise<void> {
      clearInterval(tickId);
      for (const client of clients) {
        client.close();
      }
      await new Promise<void>((resolve) => wss.close(() => resolve()));
    }
  };
}

function formatAjvErrors(validate: ValidateFunction): string {
  if (!validate.errors || validate.errors.length === 0) {
    return "unknown validation error";
  }
  return validate.errors
    .map((error) => `${error.instancePath || "/"} ${error.message ?? ""}`.trim())
    .join("; ");
}
