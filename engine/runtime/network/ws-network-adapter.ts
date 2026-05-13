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

export type WsReconnectOptions = {
  /** First backoff delay in ms. Doubles on each subsequent failure up to `maxDelayMs`. */
  initialDelayMs?: number;
  /** Upper bound for backoff in ms. */
  maxDelayMs?: number;
  /** Stop reconnecting after this many failures. Infinity by default. */
  maxAttempts?: number;
};

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
  /**
   * When set, the adapter will automatically reconnect after an unexpected
   * close. `dispose()` always cancels reconnection. Pass `true` to use the
   * defaults: 250 ms initial backoff, 5 s cap, unlimited attempts.
   */
  reconnect?: boolean | WsReconnectOptions;
  /** Hook for unit tests so they don't have to wait real-world milliseconds. */
  setTimeoutFn?: (handler: () => void, delayMs: number) => unknown;
  clearTimeoutFn?: (handle: unknown) => void;
};

export type WsNetworkAdapterHandle = {
  readonly url: string;
  sendIntent(direction: readonly [number, number]): void;
  /** Last sequence number observed on an inbound world.snapshot, or undefined. */
  lastSnapshotSequence(): number | undefined;
  /** ws.readyState passthrough. Returns -1 when reconnecting between sockets. */
  readyState(): number;
  /** Number of automatic reconnects attempted so far. */
  reconnectCount(): number;
  dispose(): void;
};

const CONNECTING = 0;
const OPEN = 1;
const DEFAULT_RECONNECT: Required<WsReconnectOptions> = {
  initialDelayMs: 250,
  maxDelayMs: 5000,
  maxAttempts: Number.POSITIVE_INFINITY
};

export function startWsNetworkAdapter(options: WsNetworkAdapterOptions): WsNetworkAdapterHandle {
  const log = options.log ?? ((line: string) => console.log(line));
  const WebSocketCtor = options.WebSocketCtor ?? WebSocket;
  const setTimeoutFn = options.setTimeoutFn ?? ((handler, delay) => setTimeout(handler, delay));
  const clearTimeoutFn =
    options.clearTimeoutFn ??
    ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  const reconnectConfig = resolveReconnectConfig(options.reconnect);

  const serverOwnedIds = new Set<string>();
  let outboundSequence = 0;
  let lastSequence: number | undefined;
  let disposed = false;
  let attempts = 0;
  let reconnectAttempts = 0;
  let pendingReconnect: unknown;
  let socket: WebSocket = openSocket();

  function openSocket(): WebSocket {
    attempts += 1;
    const created = new WebSocketCtor(options.url);
    created.addEventListener("open", () => {
      if (disposed) {
        return;
      }
      reconnectAttempts = 0;
      send(created, {
        kind: "player.join",
        payload: { playerId: options.playerId }
      });
      log(`[ws-adapter] connected to ${options.url} as ${options.playerId} (attempt ${attempts})`);
    });

    created.addEventListener("message", (event) => {
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

    created.addEventListener("close", () => {
      if (disposed) {
        return;
      }
      log("[ws-adapter] connection closed");
      flushServerOwnedEntities();
      if (reconnectConfig !== undefined && reconnectAttempts < reconnectConfig.maxAttempts) {
        scheduleReconnect();
      }
    });

    created.addEventListener("error", () => {
      log("[ws-adapter] socket error");
    });

    return created;
  }

  function scheduleReconnect(): void {
    if (reconnectConfig === undefined) {
      return;
    }
    const baseDelay = reconnectConfig.initialDelayMs * Math.pow(2, reconnectAttempts);
    const delay = Math.min(baseDelay, reconnectConfig.maxDelayMs);
    reconnectAttempts += 1;
    log(`[ws-adapter] reconnecting in ${delay} ms (attempt ${reconnectAttempts})`);
    pendingReconnect = setTimeoutFn(() => {
      pendingReconnect = undefined;
      if (disposed) {
        return;
      }
      socket = openSocket();
    }, delay);
  }

  function send(target: WebSocket, message: ProtocolMessage): void {
    if (target.readyState !== OPEN && target.readyState !== CONNECTING) {
      return;
    }
    const writeNow = (): void => target.send(JSON.stringify(message));
    if (target.readyState === OPEN) {
      writeNow();
    } else {
      target.addEventListener("open", writeNow, { once: true });
    }
  }

  function flushServerOwnedEntities(): void {
    if (serverOwnedIds.size === 0) {
      return;
    }
    const commands: EngineCommand[] = [];
    for (const id of serverOwnedIds) {
      commands.push({ kind: "entity.delete", entityId: id });
    }
    serverOwnedIds.clear();
    options.applyCommands(commands);
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
      send(socket, {
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
      if (pendingReconnect !== undefined) {
        return -1;
      }
      return socket.readyState;
    },
    reconnectCount(): number {
      return Math.max(0, attempts - 1);
    },
    dispose(): void {
      disposed = true;
      if (pendingReconnect !== undefined) {
        clearTimeoutFn(pendingReconnect);
        pendingReconnect = undefined;
      }
      flushServerOwnedEntities();
      try {
        socket.close();
      } catch {
        // ignore close failure on already-closed sockets
      }
    }
  };
}

function resolveReconnectConfig(
  input: boolean | WsReconnectOptions | undefined
): Required<WsReconnectOptions> | undefined {
  if (input === undefined || input === false) {
    return undefined;
  }
  if (input === true) {
    return { ...DEFAULT_RECONNECT };
  }
  return {
    initialDelayMs: input.initialDelayMs ?? DEFAULT_RECONNECT.initialDelayMs,
    maxDelayMs: input.maxDelayMs ?? DEFAULT_RECONNECT.maxDelayMs,
    maxAttempts: input.maxAttempts ?? DEFAULT_RECONNECT.maxAttempts
  };
}
