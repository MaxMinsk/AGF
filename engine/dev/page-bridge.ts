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

// S71 agent-debug: console tap. Patches `window.console.*` once per page
// load to capture recent messages into a ring buffer that the
// `/__agf/console-log` HTTP endpoint reads. Critical for agent
// debugging — WebGPU validation warnings come through `console.warn`,
// not `pageerror`, and the agent has no other way to see them without
// launching playwright.
const CONSOLE_RING_CAPACITY = 200;
type CapturedConsoleLine = {
  /** ms since page load (performance.now()) so an agent can correlate with frames. */
  t: number;
  /** "log" | "info" | "warn" | "error" | "debug" */
  level: string;
  /** Joined string of the original call's arguments (best-effort stringify). */
  text: string;
};
const consoleRing: CapturedConsoleLine[] = [];
let consoleTapInstalled = false;

function installConsoleTap(): void {
  if (consoleTapInstalled) return;
  consoleTapInstalled = true;
  const target = (globalThis as { console?: Console }).console;
  if (target === undefined) return;
  const levels: Array<keyof Console> = ["log", "info", "warn", "error", "debug"];
  const perf = (globalThis as { performance?: { now(): number } }).performance;
  const now = (): number => (perf !== undefined ? perf.now() : Date.now());
  for (const level of levels) {
    const original = target[level] as ((...args: unknown[]) => void) | undefined;
    if (typeof original !== "function") continue;
    (target as unknown as Record<string, (...args: unknown[]) => void>)[level as string] = (
      ...args: unknown[]
    ): void => {
      try {
        const text = args
          .map((arg) => {
            if (typeof arg === "string") return arg;
            if (arg instanceof Error) return `${arg.name}: ${arg.message}`;
            try {
              return JSON.stringify(arg);
            } catch {
              return String(arg);
            }
          })
          .join(" ");
        consoleRing.push({ t: Math.round(now()), level: String(level), text });
        if (consoleRing.length > CONSOLE_RING_CAPACITY) {
          consoleRing.splice(0, consoleRing.length - CONSOLE_RING_CAPACITY);
        }
      } catch {
        // Never let a tap failure break the original console output.
      }
      original.apply(target, args);
    };
  }
}
installConsoleTap();

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
  /** S095 AGF-PROBE-SNAPSHOT-HISTORY. */
  snapshotAt?: (at: number) => unknown;
  snapshotHistoryStats?: () => { capacity: number; size: number };
  diagnostics?: () => unknown;
  rendererInfo?: () => unknown;
  /** S83 AGF-AGENT-RENDERER-PROBE. */
  rendererInspect?: () => unknown;
  /** S86 AGF-ASSET-INVENTORY-PROBE. */
  assetInventory?: () => unknown;
  /** S88 AGF-POOL-INVENTORY-PROBE. */
  poolInventory?: () => unknown;
  /** S90 AGF-DEV-BRIDGE-TIME-SCALE. GET returns the live scale. */
  getTimeScale?: () => number;
  /** S90 AGF-DEV-BRIDGE-TIME-SCALE. POST forwards a new scale; returns the clamped value. */
  setTimeScale?: (scale: number) => number;
  /** S091 AGF-RENDER-DEBUG-MODE-AGENT. GET returns the live mode. */
  getRenderDebugMode?: () =>
    | "off"
    | "wireframe"
    | "unlit-white"
    | "normals"
    | "uv";
  /** S091 AGF-RENDER-DEBUG-MODE-AGENT. POST swaps materials and returns the active mode. */
  setRenderDebugMode?: (
    mode: "off" | "wireframe" | "unlit-white" | "normals" | "uv"
  ) => "off" | "wireframe" | "unlit-white" | "normals" | "uv";
  /** S095 AGF-AUDIO-MASTER-VOLUME. GET returns the live master volume. */
  getAudioMasterVolume?: () => number;
  /** S095 AGF-AUDIO-MASTER-VOLUME. POST forwards a [0,1] value; returns the clamped result. */
  setAudioMasterVolume?: (value: number) => number;
  /** S095 AGF-RENDER-DEBUG-FREECAM. GET returns the current pose or undefined. */
  getRenderFreeCam?: () => unknown;
  /** S095 AGF-RENDER-DEBUG-FREECAM. POST sets/clears the override. */
  setRenderFreeCam?: (
    spec: { position: readonly [number, number, number]; lookAt: readonly [number, number, number] } | null
  ) => boolean;
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
      case "snapshot-at": {
        // S095 AGF-PROBE-SNAPSHOT-HISTORY. `at: 0` is live; negative
        // values look back in the ring. We always return an envelope
        // so the dev-bridge can tell "history too short" apart from
        // a missing-handler condition.
        const at = (payloadIn as { at?: number } | undefined)?.at ?? 0;
        const snap = api?.snapshotAt?.(at);
        const stats = api?.snapshotHistoryStats?.() ?? { capacity: 0, size: 0 };
        payload = snap === undefined
          ? { outOfRange: true, capacity: stats.capacity, size: stats.size }
          : { snapshot: snap };
        break;
      }
      case "diagnostics":
        payload = api?.diagnostics?.();
        break;
      case "renderer-info":
        payload = api?.rendererInfo?.();
        break;
      case "renderer-inspect":
        // S83 AGF-AGENT-RENDERER-PROBE. Compact JSON dump of the
        // renderer state — info() summary plus the live handle list.
        payload = api?.rendererInspect?.();
        break;
      case "asset-inventory":
        // S86 AGF-ASSET-INVENTORY-PROBE.
        payload = api?.assetInventory?.();
        break;
      case "pool-inventory":
        // S88 AGF-POOL-INVENTORY-PROBE.
        payload = api?.poolInventory?.();
        break;
      case "runtime-timescale":
        // S90 AGF-DEV-BRIDGE-TIME-SCALE — GET path.
        payload = { scale: api?.getTimeScale?.() ?? 1 };
        break;
      case "render-debug-mode-get":
        // S091 AGF-RENDER-DEBUG-MODE-AGENT — GET path.
        payload = { mode: api?.getRenderDebugMode?.() ?? "off" };
        break;
      case "audio-master-volume-get":
        // S095 AGF-AUDIO-MASTER-VOLUME — GET path.
        payload = { value: api?.getAudioMasterVolume?.() ?? 1 };
        break;
      case "render-freecam-get":
        // S095 AGF-RENDER-DEBUG-FREECAM — GET path.
        payload = { freecam: api?.getRenderFreeCam?.() ?? null };
        break;
      case "render-freecam-set": {
        // S095 AGF-RENDER-DEBUG-FREECAM — POST path. Body is either
        // { off: true } to clear or { position, lookAt } to set.
        const body = payloadIn as { off?: boolean; position?: readonly [number, number, number]; lookAt?: readonly [number, number, number] } | undefined;
        if (body?.off === true) {
          api?.setRenderFreeCam?.(null);
          payload = { freecam: null };
        } else if (
          body !== undefined &&
          body.position !== undefined &&
          body.lookAt !== undefined &&
          api?.setRenderFreeCam !== undefined
        ) {
          api.setRenderFreeCam({ position: body.position, lookAt: body.lookAt });
          payload = { freecam: api?.getRenderFreeCam?.() ?? null };
        } else {
          payload = { freecam: api?.getRenderFreeCam?.() ?? null };
        }
        break;
      }
      case "audio-master-volume-set": {
        // S095 AGF-AUDIO-MASTER-VOLUME — POST path. Body contains `value`.
        const value = (payloadIn as { value?: number } | undefined)?.value;
        if (typeof value !== "number" || api?.setAudioMasterVolume === undefined) {
          payload = { value: api?.getAudioMasterVolume?.() ?? 1 };
        } else {
          payload = { value: api.setAudioMasterVolume(value) };
        }
        break;
      }
      case "render-debug-mode-set": {
        // S091 AGF-RENDER-DEBUG-MODE-AGENT — POST path.
        const mode = (payloadIn as { mode?: string } | undefined)?.mode;
        if (typeof mode !== "string" || api?.setRenderDebugMode === undefined) {
          payload = { mode: api?.getRenderDebugMode?.() ?? "off" };
        } else {
          payload = { mode: api.setRenderDebugMode(mode as never) };
        }
        break;
      }
      case "runtime-timescale-set": {
        // S90 AGF-DEV-BRIDGE-TIME-SCALE — POST path. Body contains `value`.
        const value = (payloadIn as { value?: number } | undefined)?.value;
        if (typeof value !== "number" || api?.setTimeScale === undefined) {
          payload = { scale: api?.getTimeScale?.() ?? 1 };
        } else {
          payload = { scale: api.setTimeScale(value) };
        }
        break;
      }
      case "reload-events":
        payload = api?.reloadEvents ?? [];
        break;
      case "console-log": {
        // S71 agent-debug. `console-log` is fetched via
        // `GET /__agf/console-log`. Returns a snapshot of the captured
        // ring buffer (last 200 messages across all severities). Always
        // a non-null payload — `[]` is a valid empty response.
        payload = { lines: consoleRing.slice() };
        break;
      }
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
      case "tuner-add": {
        const spec = (payloadIn as { spec?: unknown } | undefined)?.spec;
        const tuner = (api as { dev?: { tuner?: { add(s: unknown): void } } } | undefined)?.dev?.tuner;
        if (tuner === undefined || spec === undefined) {
          payload = undefined;
          break;
        }
        tuner.add(spec);
        payload = { added: (spec as { name?: string }).name };
        break;
      }
      case "tuner-remove": {
        const name = (payloadIn as { name?: string } | undefined)?.name;
        const tuner = (api as { dev?: { tuner?: { remove(n: string): void } } } | undefined)?.dev?.tuner;
        if (tuner === undefined || name === undefined) {
          payload = undefined;
          break;
        }
        tuner.remove(name);
        payload = { removed: name };
        break;
      }
      case "tuner-remove-all": {
        const tuner = (api as { dev?: { tuner?: { removeAll(): void } } } | undefined)?.dev?.tuner;
        if (tuner === undefined) {
          payload = undefined;
          break;
        }
        tuner.removeAll();
        payload = { removed: "all" };
        break;
      }
      case "tuner-list": {
        const tuner = (api as { dev?: { tuner?: { list(): unknown } } } | undefined)?.dev?.tuner;
        payload = tuner?.list();
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
