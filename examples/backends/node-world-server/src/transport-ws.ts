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
  | { kind: "player.join"; sequence?: number; payload: { playerId: string; displayName?: string } }
  | { kind: "player.leave"; sequence?: number; payload: { playerId: string; reason?: string } }
  | {
      kind: "intent.move";
      sequence?: number;
      payload: { playerId: string; direction: [number, number] };
    }
  | { kind: "world.snapshot"; sequence?: number; payload: Snapshot };

export type TransportOptions = {
  port: number;
  world: ServerWorld;
  validate: ValidateFunction;
  log?: (line: string) => void;
  /**
   * Snapshot tick rate in Hz. Server ticks {@link tickHz} times per second and
   * broadcasts the resulting snapshot to every connected client.
   */
  tickHz?: number;
};

export type TransportHandle = {
  port: number;
  close(): Promise<void>;
};

export async function startWsTransport(options: TransportOptions): Promise<TransportHandle> {
  const log = options.log ?? ((line: string) => console.log(line));
  const tickHz = options.tickHz ?? 20;
  const tickIntervalMs = 1000 / tickHz;
  const dt = 1 / tickHz;
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
          const { playerId } = message.payload;
          clientPlayer.set(socket, playerId);
          world.join(playerId);
          log(`[node-world-server] join playerId=${playerId} (total=${world.playerCount()})`);
          break;
        }
        case "player.leave": {
          const { playerId } = message.payload;
          world.leave(playerId);
          log(`[node-world-server] leave playerId=${playerId} (total=${world.playerCount()})`);
          break;
        }
        case "intent.move": {
          world.setIntent(message.payload.playerId, message.payload.direction, message.sequence);
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
