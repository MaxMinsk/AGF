// Page-side counterpart of engine/dev/agf-dev-bridge.ts.
//
// In DEV, the browser opens a WebSocket to the Vite plugin and answers RPC
// messages with the current `window.__agf.*` state. Production builds skip
// this entirely (`import.meta.env.DEV` is statically false in build mode,
// so Vite drops the call).

type AgfApi = {
  snapshot?: () => unknown;
  diagnostics?: () => unknown;
  rendererInfo?: () => unknown;
  reloadEvents?: unknown;
  applyCommands?: (commands: ReadonlyArray<unknown>) => unknown;
  startRecording?: () => unknown;
  stopRecording?: () => unknown;
  reloadAsset?: (ref: string) => unknown;
};

export type PageBridgeOptions = {
  /** Optional WS URL override (used by tests). Defaults to ws://<host>/__agf/ws. */
  url?: string;
  /** Project id reported in the hello handshake. */
  projectId: string;
  /** Active profile reported in the hello handshake. */
  profile: string;
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
  if (w.WebSocket === undefined) {
    return { close: () => undefined };
  }
  const host = w.location?.host ?? "localhost:5173";
  const url = options.url ?? `ws://${host}/__agf/ws`;
  let socket: WebSocket;
  try {
    socket = new w.WebSocket(url);
  } catch {
    return { close: () => undefined };
  }

  socket.addEventListener("open", () => {
    socket.send(
      JSON.stringify({
        kind: "hello",
        payload: { projectId: options.projectId, profile: options.profile }
      })
    );
  });

  socket.addEventListener("message", (event: MessageEvent) => {
    let msg: IncomingMessage | undefined;
    try {
      msg = JSON.parse(typeof event.data === "string" ? event.data : "") as IncomingMessage;
    } catch {
      return;
    }
    if (msg === undefined || typeof msg.id !== "number" || typeof msg.kind !== "string") {
      return;
    }
    handleRpc(socket, msg.id, msg.kind, msg.payload);
  });

  return {
    close(): void {
      socket.close();
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
