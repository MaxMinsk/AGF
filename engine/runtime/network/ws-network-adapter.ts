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
import type { DiagnosticsBus } from "../diagnostics/diagnostics-bus";
import { createProtocolValidator, type ProtocolValidator } from "./protocol-validator";

type SnapshotComponents = Record<string, unknown>;

type SnapshotEntity = {
  id: string;
  components: SnapshotComponents;
};

type ProtocolMessage =
  | {
      kind: "world.snapshot";
      sequence?: number;
      payload: {
        elapsed?: number;
        entities: SnapshotEntity[];
        lastAcked?: Record<string, number>;
        playerSpeed?: number;
      };
    }
  | { kind: "player.join"; payload: { playerId: string; displayName?: string; recipe?: string } }
  | { kind: "player.leave"; payload: { playerId: string; reason?: string } }
  | { kind: "intent.move"; sequence?: number; payload: { playerId: string; direction: [number, number] } }
  // S117 KABOOM-MP-SPRINT-B chunk 2 — outbound: client asks the server
  // to spawn a bomb at (gx, gz). The server identifies the player from
  // the socket, so `entityId` here is purely informative (the schema
  // requires the field; the server ignores it).
  | { kind: "placeBombRequest"; sequence?: number; payload: { entityId: string; gx: number; gz: number } }
  // S117 KABOOM-MP-SPRINT-B chunk 3 — inbound: server tells every
  // client that a bomb detonated. Cells filled in S118 (propagation
  // walks the authoritative map); clients use the cells to spawn
  // local visual + audio + decoder effects.
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
  // S118 KABOOM-MP-SPRINT-B chunk 2 — inbound: server tells every
  // client that a soft block was destroyed. Client decoder looks up
  // the local soft.* entity at (gx, gz) and removes it.
  | {
      kind: "blockDestroyed";
      sequence?: number;
      payload: { gx: number; gz: number; droppedPickupKind?: string };
    }
  // S118 KABOOM-MP-SPRINT-B chunk 2 — inbound: server tells every
  // client that a bomber died. Client decoder fires the local
  // ragdoll/death-anim from BomberStats.alive=false in the snapshot.
  | {
      kind: "bomberDied";
      sequence?: number;
      payload: { entityId: string; blastOriginGx: number; blastOriginGz: number; killerId?: string };
    };

export type WsReconnectOptions = {
  /** First backoff delay in ms. Doubles on each subsequent failure up to `maxDelayMs`. */
  initialDelayMs?: number;
  /** Upper bound for backoff in ms. */
  maxDelayMs?: number;
  /** Stop reconnecting after this many failures. Infinity by default. */
  maxAttempts?: number;
};

/** One sample in the snapshot interpolation buffer. */
export type SnapshotSample = {
  /** Receive time in seconds, monotonic. */
  receivedAtSeconds: number;
  position: readonly [number, number, number];
};

/**
 * One client-side intent record retained until the server acknowledges it via
 * `world.snapshot.payload.lastAcked`. Used by the reconciliation system to
 * replay un-acked intents on top of the server position (rollback-replay).
 */
export type UnackedIntent = {
  sequence: number;
  direction: readonly [number, number];
  /** Client-side wall-clock timestamp (seconds) when the intent was sent. */
  sentAtSeconds: number;
};

export type WsNetworkAdapterOptions = {
  url: string;
  playerId: string;
  /**
   * S112 KABOOM-MP-RECIPE-SYNC — opaque project-specific recipe blob
   * sent in player.join.payload.recipe. The server echoes it back in
   * every snapshot as a `CharacterRecipe` component on the
   * `player.<id>` entity, so other clients can decode + render the
   * remote player with the correct visual identity. Kaboom Crew uses
   * `encodeRecipe(localRecipe)`; non-Kaboom clients leave undefined.
   */
  recipe?: string;
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
   * Monotonic clock used to timestamp each inbound `world.snapshot`. Returns
   * seconds. Defaults to `performance.now() / 1000`. Tests can pass a fake.
   */
  nowSeconds?: () => number;
  /** How many recent samples to retain per server-owned entity. Default 10. */
  snapshotBufferSize?: number;
  /**
   * When set, the adapter will automatically reconnect after an unexpected
   * close. `dispose()` always cancels reconnection. Pass `true` to use the
   * defaults: 250 ms initial backoff, 5 s cap, unlimited attempts.
   */
  reconnect?: boolean | WsReconnectOptions;
  /** Hook for unit tests so they don't have to wait real-world milliseconds. */
  setTimeoutFn?: (handler: () => void, delayMs: number) => unknown;
  clearTimeoutFn?: (handle: unknown) => void;
  /**
   * Validate every inbound message against `schemas/protocol.schema.json`
   * before routing it. Invalid messages are dropped with a log line. Defaults
   * to `true`; tests that drive the adapter with hand-crafted strings can
   * pass `false` to skip validation.
   */
  validateInbound?: boolean;
  /** Override the validator factory. Used by tests. */
  validatorFactory?: () => ProtocolValidator;
  /** When set, the adapter forwards problems to the runtime diagnostics bus. */
  diagnostics?: DiagnosticsBus;
};

/** S117 KABOOM-MP-SPRINT-B — one inbound blast event, exposed verbatim for project-level decorators. */
export type BlastEventSample = {
  receivedAtSeconds: number;
  originGx: number;
  originGz: number;
  range: number;
  ownerId: string;
  /** S118 — cardinal walk cells. Empty array for S117-era servers. */
  cells: ReadonlyArray<{ gx: number; gz: number }>;
};

/** S118 KABOOM-MP-SPRINT-B chunk 2 — one inbound blockDestroyed event. */
export type BlockDestroyedSample = {
  receivedAtSeconds: number;
  gx: number;
  gz: number;
  droppedPickupKind?: string;
};

/** S118 KABOOM-MP-SPRINT-B chunk 2 — one inbound bomberDied event. */
export type BomberDiedSample = {
  receivedAtSeconds: number;
  entityId: string;
  blastOriginGx: number;
  blastOriginGz: number;
  killerId?: string;
};

export type WsNetworkAdapterHandle = {
  readonly url: string;
  sendIntent(direction: readonly [number, number]): void;
  /**
   * S117 KABOOM-MP-SPRINT-B chunk 2 — ask the server to spawn a bomb
   * at the local player's current grid cell. The adapter dispatches a
   * `placeBombRequest` protocol frame; the spawned bomb shows up in the
   * next snapshot. The `entityId` field is filled with `player.<id>`
   * because the schema requires it; the server identifies the player
   * from the socket so clients can't impersonate other players.
   */
  sendPlaceBomb(gx: number, gz: number): void;
  /**
   * S117 KABOOM-MP-SPRINT-B chunk 3 — pull (and consume) the queue of
   * inbound blast events accumulated since the last call. Drained by
   * the project-level system that renders the local flash + audio.
   */
  drainBlastEvents(): ReadonlyArray<BlastEventSample>;
  /** S118 KABOOM-MP-SPRINT-B chunk 2 — pull + consume inbound blockDestroyed events. */
  drainBlockDestroyed(): ReadonlyArray<BlockDestroyedSample>;
  /** S118 KABOOM-MP-SPRINT-B chunk 2 — pull + consume inbound bomberDied events. */
  drainBomberDied(): ReadonlyArray<BomberDiedSample>;
  /** Last sequence number observed on an inbound world.snapshot, or undefined. */
  lastSnapshotSequence(): number | undefined;
  /** ws.readyState passthrough. Returns -1 when reconnecting between sockets. */
  readyState(): number;
  /** Number of automatic reconnects attempted so far. */
  reconnectCount(): number;
  /** Number of snapshot-sequence gaps detected so far (each triggers a resync). */
  snapshotGapCount(): number;
  /**
   * Last `intent.move` sequence the server reports it has applied for the
   * given playerId, or `undefined` if no ack has been observed yet. Used by
   * the reconciliation system to know how far behind the server is on input.
   */
  lastAckedFor(playerId: string): number | undefined;
  /**
   * Last `playerSpeed` value broadcast by the server, or `undefined` until
   * the first snapshot arrives. Lets the rollback-replay reconciliation use
   * the same speed the server is integrating with.
   */
  lastServerPlayerSpeed(): number | undefined;
  /**
   * Highest outbound intent sequence number sent so far, or `-1` when no
   * intent has been sent. Combined with `lastAckedFor` this gives the count
   * of un-acked inputs.
   */
  highestOutboundSequence(): number;
  /**
   * Returns a stable reference to the per-entity snapshot sample buffer.
   * Callers should treat it as read-only. Samples are appended in receive
   * order and trimmed to `snapshotBufferSize`. Used by the project-local
   * interpolation system to render remote players smoothly on jittery
   * networks.
   */
  getSnapshotBuffer(): ReadonlyMap<string, ReadonlyArray<SnapshotSample>>;
  /**
   * Returns the list of own-player `intent.move` records the server has not
   * yet acknowledged, sorted by sequence. Used by the reconciliation system
   * to replay these intents on top of the authoritative server position so
   * the local drone matches the prediction once the snapshot lands.
   */
  getUnackedIntents(): ReadonlyArray<UnackedIntent>;
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
  // agf-allow:console fallback log sink — production hosts supply options.log; this is the dev-time default.
  const log = options.log ?? ((line: string) => console.log(line));
  const diagnostics = options.diagnostics;
  const emitDiag = (
    severity: "warning" | "error" | "info",
    code: string,
    message: string,
    details?: Record<string, unknown>
  ): void => {
    diagnostics?.emit({
      severity,
      code,
      source: "ws-adapter",
      message,
      ...(details !== undefined ? { details } : {})
    });
  };
  const WebSocketCtor = options.WebSocketCtor ?? WebSocket;
  const setTimeoutFn = options.setTimeoutFn ?? ((handler, delay) => setTimeout(handler, delay));
  const clearTimeoutFn =
    options.clearTimeoutFn ??
    ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  const reconnectConfig = resolveReconnectConfig(options.reconnect);
  const validateInbound = options.validateInbound !== false;
  const validateProtocol: ProtocolValidator | undefined = validateInbound
    ? (options.validatorFactory ?? createProtocolValidator)()
    : undefined;
  const nowSeconds =
    options.nowSeconds ??
    ((): number =>
      typeof performance !== "undefined" ? performance.now() / 1000 : Date.now() / 1000);
  const bufferSize = Math.max(2, options.snapshotBufferSize ?? 10);

  const serverOwnedIds = new Set<string>();
  const snapshotBuffer = new Map<string, SnapshotSample[]>();
  const lastAckedBy = new Map<string, number>();
  const unackedIntents = new Map<number, UnackedIntent>();
  // S117 KABOOM-MP-SPRINT-B chunk 3 — queue of inbound blast events,
  // drained by the project-level decorator each frame.
  let blastInbox: BlastEventSample[] = [];
  // S118 KABOOM-MP-SPRINT-B chunk 2 — inbound queues for blockDestroyed + bomberDied.
  let blockDestroyedInbox: BlockDestroyedSample[] = [];
  let bomberDiedInbox: BomberDiedSample[] = [];
  let outboundSequence = 0;
  let highestSent = -1;
  let lastServerPlayerSpeed: number | undefined;
  let lastSequence: number | undefined;
  let disposed = false;
  let attempts = 0;
  let reconnectAttempts = 0;
  let pendingReconnect: unknown;
  let gapCount = 0;
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
        payload: {
          playerId: options.playerId,
          // S112 KABOOM-MP-RECIPE-SYNC — opaque blob, server echoes
          // it back in every snapshot as a CharacterRecipe component
          // on the player.<id> entity. Other clients decode it to
          // render the remote bomber with the right recipe.
          ...(options.recipe !== undefined ? { recipe: options.recipe } : {})
        }
      });
      log(`[ws-adapter] connected to ${options.url} as ${options.playerId} (attempt ${attempts})`);
    });

    created.addEventListener("message", (event) => {
      if (disposed) {
        return;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(typeof event.data === "string" ? event.data : String(event.data));
      } catch {
        log("[ws-adapter] dropping non-JSON frame");
        emitDiag("warning", "AGF_RUNTIME_WS_NON_JSON", "dropping non-JSON frame");
        return;
      }
      if (validateProtocol !== undefined) {
        const validation = validateProtocol(parsed);
        if (validation !== true) {
          log(`[ws-adapter] dropping invalid frame: ${validation}`);
          emitDiag(
            "warning",
            "AGF_RUNTIME_WS_INVALID_FRAME",
            `dropping invalid frame: ${validation}`,
            { reason: validation }
          );
          return;
        }
      }
      const message = parsed as ProtocolMessage;
      // S117 KABOOM-MP-SPRINT-B chunk 3 — capture inbound blastEvent
      // frames into the local inbox for the project decorator to drain.
      // Stays before the snapshot fast-path so the inbox is observable
      // independent of snapshot delivery cadence.
      if (message.kind === "blastEvent") {
        blastInbox.push({
          receivedAtSeconds: nowSeconds(),
          originGx: message.payload.originGx,
          originGz: message.payload.originGz,
          range: message.payload.range,
          ownerId: message.payload.ownerId,
          cells: message.payload.cells ?? []
        });
        return;
      }
      // S118 KABOOM-MP-SPRINT-B chunk 2 — buffer inbound blockDestroyed
      // + bomberDied for project decoders to drain. The static profile
      // never sees these (no server); on connected they drive soft
      // block removal + ragdoll firing.
      if (message.kind === "blockDestroyed") {
        blockDestroyedInbox.push({
          receivedAtSeconds: nowSeconds(),
          gx: message.payload.gx,
          gz: message.payload.gz,
          ...(message.payload.droppedPickupKind !== undefined
            ? { droppedPickupKind: message.payload.droppedPickupKind }
            : {})
        });
        return;
      }
      if (message.kind === "bomberDied") {
        bomberDiedInbox.push({
          receivedAtSeconds: nowSeconds(),
          entityId: message.payload.entityId,
          blastOriginGx: message.payload.blastOriginGx,
          blastOriginGz: message.payload.blastOriginGz,
          ...(message.payload.killerId !== undefined ? { killerId: message.payload.killerId } : {})
        });
        return;
      }
      if (message.kind !== "world.snapshot") {
        return;
      }
      if (
        message.sequence !== undefined &&
        lastSequence !== undefined &&
        message.sequence !== lastSequence + 1
      ) {
        log(
          `[ws-adapter] snapshot gap: expected sequence ${lastSequence + 1}, got ${message.sequence}; resyncing`
        );
        emitDiag(
          "warning",
          "AGF_RUNTIME_WS_SNAPSHOT_GAP",
          `snapshot gap: expected sequence ${lastSequence + 1}, got ${message.sequence}; resyncing`,
          { expected: lastSequence + 1, received: message.sequence }
        );
        flushServerOwnedEntities();
        gapCount += 1;
      }
      lastSequence = message.sequence;
      if (typeof message.payload.playerSpeed === "number" && message.payload.playerSpeed > 0) {
        lastServerPlayerSpeed = message.payload.playerSpeed;
      }
      if (message.payload.lastAcked !== undefined) {
        for (const [pid, seq] of Object.entries(message.payload.lastAcked)) {
          if (typeof seq === "number" && Number.isFinite(seq)) {
            const previous = lastAckedBy.get(pid);
            if (previous === undefined || seq > previous) {
              lastAckedBy.set(pid, seq);
            }
          }
        }
        const ackedForOwn = lastAckedBy.get(options.playerId);
        if (ackedForOwn !== undefined) {
          for (const seq of unackedIntents.keys()) {
            if (seq <= ackedForOwn) {
              unackedIntents.delete(seq);
            }
          }
        }
      }
      applySnapshot(message.payload.entities);
    });

    created.addEventListener("close", () => {
      if (disposed) {
        return;
      }
      log("[ws-adapter] connection closed");
      flushServerOwnedEntities();
      lastSequence = undefined;
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
    snapshotBuffer.clear();
    lastAckedBy.clear();
    unackedIntents.clear();
    lastServerPlayerSpeed = undefined;
    options.applyCommands(commands);
  }

  function recordSampleFor(entityId: string, position: readonly [number, number, number]): void {
    let buffer = snapshotBuffer.get(entityId);
    if (buffer === undefined) {
      buffer = [];
      snapshotBuffer.set(entityId, buffer);
    }
    buffer.push({ receivedAtSeconds: nowSeconds(), position });
    if (buffer.length > bufferSize) {
      buffer.splice(0, buffer.length - bufferSize);
    }
  }

  function applySnapshot(entities: SnapshotEntity[]): void {
    const knownIds = new Set(options.knownEntityIds?.() ?? []);
    const inboundIds = new Set<string>();
    const commands: EngineCommand[] = [];

    for (const entity of entities) {
      const isNewToServer = !serverOwnedIds.has(entity.id);
      const isUnknownLocally = !knownIds.has(entity.id);
      if (isNewToServer && !isUnknownLocally) {
        // Id collision: the server is claiming an id the client already owns
        // (e.g. `player.drone`). Reject — never mutate or capture a local
        // entity. Logged once per offending id per snapshot so a misbehaving
        // backend is visible without spamming the console.
        log(
          `[ws-adapter] dropping snapshot entity "${entity.id}" — id already owned by the local world`
        );
        emitDiag(
          "error",
          "AGF_RUNTIME_WS_ID_COLLISION",
          `dropping snapshot entity "${entity.id}" — id already owned by the local world`,
          { entityId: entity.id }
        );
        continue;
      }
      inboundIds.add(entity.id);
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

      const transform = entity.components["Transform"] as
        | { position?: ReadonlyArray<number> }
        | undefined;
      const pos = transform?.position;
      if (pos !== undefined && pos.length >= 3) {
        recordSampleFor(entity.id, [pos[0] ?? 0, pos[1] ?? 0, pos[2] ?? 0]);
      }
    }

    for (const id of serverOwnedIds) {
      if (!inboundIds.has(id)) {
        commands.push({ kind: "entity.delete", entityId: id });
        serverOwnedIds.delete(id);
        snapshotBuffer.delete(id);
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
      unackedIntents.set(outboundSequence, {
        sequence: outboundSequence,
        direction: [direction[0], direction[1]],
        sentAtSeconds: nowSeconds()
      });
      highestSent = outboundSequence;
      outboundSequence += 1;
    },
    sendPlaceBomb(gx, gz): void {
      if (disposed) return;
      send(socket, {
        kind: "placeBombRequest",
        sequence: outboundSequence,
        payload: { entityId: `player.${options.playerId}`, gx, gz }
      });
      outboundSequence += 1;
    },
    drainBlastEvents(): ReadonlyArray<BlastEventSample> {
      if (blastInbox.length === 0) return [];
      const out = blastInbox;
      blastInbox = [];
      return out;
    },
    drainBlockDestroyed(): ReadonlyArray<BlockDestroyedSample> {
      if (blockDestroyedInbox.length === 0) return [];
      const out = blockDestroyedInbox;
      blockDestroyedInbox = [];
      return out;
    },
    drainBomberDied(): ReadonlyArray<BomberDiedSample> {
      if (bomberDiedInbox.length === 0) return [];
      const out = bomberDiedInbox;
      bomberDiedInbox = [];
      return out;
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
    snapshotGapCount(): number {
      return gapCount;
    },
    lastAckedFor(playerId: string): number | undefined {
      return lastAckedBy.get(playerId);
    },
    lastServerPlayerSpeed(): number | undefined {
      return lastServerPlayerSpeed;
    },
    highestOutboundSequence(): number {
      return highestSent;
    },
    getSnapshotBuffer(): ReadonlyMap<string, ReadonlyArray<SnapshotSample>> {
      return snapshotBuffer;
    },
    getUnackedIntents(): ReadonlyArray<UnackedIntent> {
      return [...unackedIntents.values()].sort((a, b) => a.sequence - b.sequence);
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
