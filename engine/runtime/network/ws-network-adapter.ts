// Browser-side WebSocket network adapter.
//
// Consumes inbound `world.snapshot` messages from a server that implements the
// AGF protocol and applies them to a local runtime through the same
// `applyCommands` path the agent uses. Server-owned entities show up in the
// local world; local logic continues to run unchanged.
//
// Scope (v0):
//   * connect to a ws:// URL, send player.join on open;
//   * for every inbound snapshot, diff against the local view of server-owned
//     entities and emit entity.create / component.set / entity.delete commands;
//   * expose sendIntent(direction) for outbound intent.move;
//   * dispose() closes the socket and removes the server-owned entities.

import type { EngineCommand } from "../../core/commands/types";

type SnapshotComponents = Record<string, unknown>;

type SnapshotEntity = {
  id: string;
  components: SnapshotComponents;
};

type ProtocolMessage =
  | { kind: "world.snapshot"; sequence?: number; payload: { elapsed?: number; entities: SnapshotEntity[] } }
  | { kind: "player.join"; payload: { playerId: string; displayName?: string } }
  | { kind: "player.leave"; payload: { playerId: string; reason?: string } }
  | { kind: "intent.move"; sequence?: number; payload: { playerId: string; direction: [number, number] } };

export type WsNetworkAdapterOptions = {
  url: string;
  playerId: string;
  /** Engine command sink — usually `runtime.applyCommands`. */
  applyCommands: (commands: ReadonlyArray<EngineCommand>) => void;
  /**
   * Local-world view of which entity ids already exist. Usually
   * `() => runtime.snapshot().entities.map((entity) => entity.id)`.
   * Used to skip entity.create when an id collides with a pre-existing entity
   * (e.g. the local PlayerControlled drone).
   */
  knownEntityIds?: () => ReadonlyArray<string>;
  log?: (line: string) => void;
  WebSocketCtor?: typeof WebSocket;
};

export type WsNetworkAdapterHandle = {
  readonly url: string;
  sendIntent(direction: readonly [number, number]): void;
  /** Last sequence number observed on an inbound world.snapshot, or undefined. */
  lastSnapshotSequence(): number | undefined;
  /** ws.readyState passthrough. */
  readyState(): number;
  dispose(): void;
};

const CONNECTING = 0;
const OPEN = 1;

export function startWsNetworkAdapter(options: WsNetworkAdapterOptions): WsNetworkAdapterHandle {
  const log = options.log ?? ((line: string) => console.log(line));
  const WebSocketCtor = options.WebSocketCtor ?? WebSocket;
  const socket = new WebSocketCtor(options.url);

  const serverOwnedIds = new Set<string>();
  let outboundSequence = 0;
  let lastSequence: number | undefined;
  let disposed = false;

  socket.addEventListener("open", () => {
    if (disposed) {
      return;
    }
    sendMessage({
      kind: "player.join",
      payload: { playerId: options.playerId }
    });
    log(`[ws-adapter] connected to ${options.url} as ${options.playerId}`);
  });

  socket.addEventListener("message", (event) => {
    if (disposed) {
      return;
    }
    let message: ProtocolMessage;
    try {
      message = JSON.parse(typeof event.data === "string" ? event.data : String(event.data));
    } catch {
      return;
    }
    if (message.kind !== "world.snapshot") {
      return;
    }
    lastSequence = message.sequence;
    applySnapshot(message.payload.entities);
  });

  socket.addEventListener("close", () => {
    log("[ws-adapter] connection closed");
  });

  socket.addEventListener("error", () => {
    log("[ws-adapter] socket error");
  });

  function sendMessage(message: ProtocolMessage): void {
    if (socket.readyState !== OPEN && socket.readyState !== CONNECTING) {
      return;
    }
    const send = (): void => socket.send(JSON.stringify(message));
    if (socket.readyState === OPEN) {
      send();
    } else {
      socket.addEventListener("open", send, { once: true });
    }
  }

  function applySnapshot(entities: SnapshotEntity[]): void {
    const knownIds = new Set(options.knownEntityIds?.() ?? []);
    const inboundIds = new Set<string>();
    const commands: EngineCommand[] = [];

    for (const entity of entities) {
      inboundIds.add(entity.id);
      const isNewToServer = !serverOwnedIds.has(entity.id);
      const isUnknownLocally = !knownIds.has(entity.id);
      if (isNewToServer && isUnknownLocally) {
        commands.push({
          kind: "entity.create",
          entityId: entity.id,
          components: entity.components as Record<string, Record<string, unknown>>
        });
      } else {
        for (const [name, data] of Object.entries(entity.components)) {
          commands.push({
            kind: "component.set",
            entityId: entity.id,
            component: name,
            data: data as Record<string, unknown>
          });
        }
      }
      serverOwnedIds.add(entity.id);
    }

    for (const id of serverOwnedIds) {
      if (!inboundIds.has(id)) {
        commands.push({ kind: "entity.delete", entityId: id });
        serverOwnedIds.delete(id);
      }
    }

    if (commands.length > 0) {
      options.applyCommands(commands);
    }
  }

  return {
    url: options.url,
    sendIntent(direction): void {
      if (disposed) {
        return;
      }
      sendMessage({
        kind: "intent.move",
        sequence: outboundSequence,
        payload: { playerId: options.playerId, direction: [direction[0], direction[1]] }
      });
      outboundSequence += 1;
    },
    lastSnapshotSequence(): number | undefined {
      return lastSequence;
    },
    readyState(): number {
      return socket.readyState;
    },
    dispose(): void {
      disposed = true;
      if (serverOwnedIds.size > 0) {
        const commands: EngineCommand[] = [];
        for (const id of serverOwnedIds) {
          commands.push({ kind: "entity.delete", entityId: id });
        }
        options.applyCommands(commands);
        serverOwnedIds.clear();
      }
      try {
        socket.close();
      } catch {
        // ignore close failure on already-closed sockets
      }
    }
  };
}
