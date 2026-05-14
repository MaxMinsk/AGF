// Page-side counterpart of engine/dev/agf-dev-bridge.ts.
//
// In DEV, the browser opens a WebSocket to the Vite plugin and answers RPC
// messages with the current `window.__agf.*` state. Production builds skip
// this entirely (`import.meta.env.DEV` is statically false in build mode,
// so Vite drops the call).

// Page-side event-stream state. Only one stream is active per page at a
// time; the bridge multiplexes SSE subscribers on its side. Capturing in
// module scope is fine because there is exactly one page-bridge per tab.
let activeEventUnsubs: Array<() => void> = [];
let assetReloadHandler: ((event: Event) => void) | undefined;

function emitEvent(socket: WebSocket, type: string, data: unknown): void {
  if (socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify({ kind: "event", payload: { type, data } }));
}

function startEventStream(socket: WebSocket, api: AgfApi): void {
  stopEventStream();

  if (api.subscribeDiagnostics !== undefined) {
    const unsub = api.subscribeDiagnostics((diagnostic) => {
      emitEvent(socket, "diagnostic", diagnostic);
    });
    activeEventUnsubs.push(unsub);
  }

  // HMR asset-changed events arrive as window CustomEvents; the existing
  // src/main.ts listener also handles them, this is a parallel subscriber.
  assetReloadHandler = (event: Event): void => {
    const detail = (event as CustomEvent).detail;
    emitEvent(socket, "asset-changed", detail);
  };
  (globalThis as { addEventListener?: typeof window.addEventListener })
    .addEventListener?.("agf:asset-changed", assetReloadHandler);
}

function stopEventStream(): void {
  for (const unsub of activeEventUnsubs) {
    try {
      unsub();
    } catch {
      // ignore
    }
  }
  activeEventUnsubs = [];
  if (assetReloadHandler !== undefined) {
    (globalThis as { removeEventListener?: typeof window.removeEventListener })
      .removeEventListener?.("agf:asset-changed", assetReloadHandler);
    assetReloadHandler = undefined;
  }
}

type AgfApi = {
  snapshot?: () => unknown;
  diagnostics?: () => unknown;
  rendererInfo?: () => unknown;
  reloadEvents?: unknown;
  applyCommands?: (commands: ReadonlyArray<unknown>) => unknown;
  startRecording?: () => unknown;
  stopRecording?: () => unknown;
  reloadAsset?: (ref: string) => unknown;
  subscribeDiagnostics?: (listener: (diagnostic: unknown) => void) => () => void;
};

export type PageBridgeOptions = {
  /** Optional WS URL override (used by tests). Defaults to ws://<host>/__agf/ws. */
  url?: string;
  /** Project id reported in the hello handshake. */
  projectId: string;
  /** Active profile reported in the hello handshake. */
  profile: string;
  /**
   * Player id reported in the hello handshake. Lets agents target a
   * specific tab via `/__agf/...?playerId=<id>` in multiplayer projects.
   */
  playerId?: string;
};

export type PageBridgeHandle = {
  close(): void;
};

type IncomingMessage = {
  id?: number;
  kind?: string;
  payload?: unknown;
};

export function mountPageBridge(options: PageBridgeOptions): PageBridgeHandle {
  const w = globalThis as { WebSocket?: typeof WebSocket; location?: { host: string } };
  const WebSocketCtor = w.WebSocket;
  if (WebSocketCtor === undefined) {
    return { close: () => undefined };
  }
  const host = w.location?.host ?? "localhost:5173";
  const url = options.url ?? `ws://${host}/__agf/ws`;
  let socket: WebSocket | undefined;
  let closedByUser = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

  const connect = (): void => {
    if (closedByUser) return;
    try {
      socket = new WebSocketCtor(url);
    } catch {
      scheduleReconnect();
      return;
    }
    const current = socket;
    current.addEventListener("open", () => {
      const helloPayload: Record<string, string> = {
        projectId: options.projectId,
        profile: options.profile
      };
      if (options.playerId !== undefined) {
        helloPayload["playerId"] = options.playerId;
      }
      current.send(JSON.stringify({ kind: "hello", payload: helloPayload }));
    });
    current.addEventListener("message", (event: MessageEvent) => {
      let msg: IncomingMessage | undefined;
      try {
        msg = JSON.parse(typeof event.data === "string" ? event.data : "") as IncomingMessage;
      } catch {
        return;
      }
      if (msg === undefined || typeof msg.id !== "number" || typeof msg.kind !== "string") {
        return;
      }
      handleRpc(current, msg.id, msg.kind, msg.payload);
    });
    current.addEventListener("close", () => {
      // Multi-page bridge (Sprint 32) no longer displaces other pages; we
      // still reconnect after a transient close (Vite dev server restart,
      // sleep/wake, etc.).
      scheduleReconnect();
    });
  };

  const scheduleReconnect = (): void => {
    if (closedByUser) return;
    if (reconnectTimer !== undefined) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = undefined;
      connect();
    }, 250);
  };

  connect();

  return {
    close(): void {
      closedByUser = true;
      if (reconnectTimer !== undefined) {
        clearTimeout(reconnectTimer);
        reconnectTimer = undefined;
      }
      socket?.close();
    }
  };
}

function handleRpc(socket: WebSocket, id: number, kind: string, payloadIn?: unknown): void {
  const api = (globalThis as { __agf?: AgfApi }).__agf;
  try {
    let payload: unknown;
    switch (kind) {
      case "snapshot":
        payload = api?.snapshot?.();
        break;
      case "diagnostics":
        payload = api?.diagnostics?.();
        break;
      case "renderer-info":
        payload = api?.rendererInfo?.();
        break;
      case "reload-events":
        payload = api?.reloadEvents ?? [];
        break;
      case "commands": {
        const commands = (payloadIn as { commands?: ReadonlyArray<unknown> } | undefined)?.commands;
        if (!Array.isArray(commands) || api?.applyCommands === undefined) {
          payload = undefined;
          break;
        }
        api.applyCommands(commands);
        payload = { applied: commands.length };
        break;
      }
      case "recording-start":
        payload = api?.startRecording?.() ?? { started: true };
        break;
      case "recording-stop":
        payload = api?.stopRecording?.();
        break;
      case "asset-invalidate": {
        const ref = (payloadIn as { ref?: string } | undefined)?.ref;
        if (typeof ref !== "string" || api?.reloadAsset === undefined) {
          payload = undefined;
          break;
        }
        api.reloadAsset(ref);
        payload = { invalidated: ref };
        break;
      }
      case "events-start": {
        if (api?.subscribeDiagnostics === undefined) {
          payload = { subscribed: false };
          break;
        }
        startEventStream(socket, api);
        payload = { subscribed: true };
        break;
      }
      case "events-stop": {
        stopEventStream();
        payload = { subscribed: false };
        break;
      }
      default: {
        socket.send(
          JSON.stringify({
            id,
            ok: false,
            error: {
              code: "AGF_BRIDGE_PAGE_HANDLER_UNKNOWN",
              message: `Unknown RPC kind "${kind}".`
            }
          })
        );
        return;
      }
    }
    if (payload === undefined) {
      socket.send(
        JSON.stringify({
          id,
          ok: false,
          error: {
            code: "AGF_BRIDGE_PAGE_HANDLER_MISSING",
            message: `window.__agf.${kind} not available (page may still be booting).`
          }
        })
      );
      return;
    }
    socket.send(JSON.stringify({ id, ok: true, payload }));
  } catch (error) {
    socket.send(
      JSON.stringify({
        id,
        ok: false,
        error: {
          code: "AGF_BRIDGE_PAGE_HANDLER_FAILED",
          message: (error as Error).message ?? String(error)
        }
      })
    );
  }
}
