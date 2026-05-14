// AGF dev-server bridge.
//
// A Vite plugin (`apply: "serve"`) that registers `/__agf/*` HTTP middleware
// on the dev server, plus a WebSocket at `/__agf/ws` that the page-side
// bootstrap (engine/dev/page-bridge.ts) connects to. HTTP routes proxy RPC
// requests to the latest connected page and return its JSON reply.
//
// Story progression:
//   - `M15-a` /__agf/health endpoint + 404 envelope.
//   - `M15-b` WS server + page handshake.
//   - `M15-c` Pull endpoints: /snapshot, /diagnostics, /renderer-info,
//             /reload-events.
//   - `M15-d` /bug-report (composes the above).
//   - `M15-e` /recording/{start,stop}.
//   - `M15-f` POST /commands (live edit).
//   - `M15-g` /events SSE stream.
//
// Production builds exclude this plugin entirely (`apply: "serve"`).

import type { IncomingMessage, ServerResponse } from "node:http";
import type { Duplex } from "node:stream";
import type { Plugin, ViteDevServer } from "vite";
import { WebSocketServer, type WebSocket as WsConnection } from "ws";

export type DevBridgeOptions = {
  /** Override the version string returned by `/__agf/health`. */
  version?: string;
  /** Override the RPC timeout (ms). Defaults to 3000. */
  rpcTimeoutMs?: number;
};

export const DEV_BRIDGE_VERSION = "0.1.0-m15-c";
export const DEV_BRIDGE_PATH_PREFIX = "/__agf/";
export const DEV_BRIDGE_WS_PATH = "/__agf/ws";

const DEFAULT_RPC_TIMEOUT_MS = 3000;

type PendingRpc = {
  resolve: (payload: unknown) => void;
  reject: (error: { code: string; message: string }) => void;
  timer: ReturnType<typeof setTimeout>;
};

type ServerResponseLike = {
  statusCode: number;
  setHeader(name: string, value: string): unknown;
  end(payload: string): unknown;
};

export function agfDevBridge(options: DevBridgeOptions = {}): Plugin {
  const version = options.version ?? DEV_BRIDGE_VERSION;
  const rpcTimeoutMs = options.rpcTimeoutMs ?? DEFAULT_RPC_TIMEOUT_MS;

  let activeSocket: WsConnection | undefined;
  let activePageInfo: { projectId: string; profile: string } | undefined;
  const pending = new Map<number, PendingRpc>();
  let nextRpcId = 1;

  const setActiveSocket = (socket: WsConnection | undefined): void => {
    if (activeSocket !== undefined && activeSocket !== socket) {
      try {
        activeSocket.send(JSON.stringify({ kind: "displaced" }));
      } catch {
        // Swallow — the previous page is going away anyway.
      }
      activeSocket.close();
    }
    activeSocket = socket;
    if (socket === undefined) {
      activePageInfo = undefined;
    }
  };

  const rpc = (kind: string, payload?: unknown): Promise<unknown> =>
    new Promise((resolve, reject) => {
      if (activeSocket === undefined || activeSocket.readyState !== 1 /* OPEN */) {
        reject({
          code: "AGF_BRIDGE_PAGE_NOT_CONNECTED",
          message: `No active page on ${DEV_BRIDGE_WS_PATH} — open http://localhost:5173 in a tab first.`
        });
        return;
      }
      const id = nextRpcId++;
      const timer = setTimeout(() => {
        if (pending.has(id)) {
          pending.delete(id);
          reject({
            code: "AGF_BRIDGE_PAGE_TIMEOUT",
            message: `Page did not reply to ${kind} within ${rpcTimeoutMs}ms.`
          });
        }
      }, rpcTimeoutMs);
      pending.set(id, { resolve, reject, timer });
      activeSocket.send(JSON.stringify({ id, kind, payload }));
    });

  return {
    name: "agf-dev-bridge",
    apply: "serve",
    configureServer(server: ViteDevServer) {
      const wss = new WebSocketServer({ noServer: true });

      wss.on("connection", (socket) => {
        setActiveSocket(socket);
        socket.on("message", (raw) => {
          let msg: { id?: number; kind?: string; ok?: boolean; payload?: unknown; error?: { code: string; message: string } } | undefined;
          try {
            msg = JSON.parse(typeof raw === "string" ? raw : raw.toString("utf8"));
          } catch {
            return;
          }
          if (msg === undefined) return;
          if (msg.kind === "hello" && msg.payload !== undefined) {
            const info = msg.payload as { projectId?: string; profile?: string };
            if (typeof info.projectId === "string" && typeof info.profile === "string") {
              activePageInfo = { projectId: info.projectId, profile: info.profile };
              server.config.logger.info(
                `[agf dev-bridge] page connected (project=${info.projectId} profile=${info.profile})`
              );
            }
            return;
          }
          if (typeof msg.id === "number" && pending.has(msg.id)) {
            const entry = pending.get(msg.id);
            pending.delete(msg.id);
            if (entry === undefined) return;
            clearTimeout(entry.timer);
            if (msg.ok === true) {
              entry.resolve(msg.payload);
            } else {
              entry.reject(
                msg.error ?? { code: "AGF_BRIDGE_PAGE_HANDLER_FAILED", message: "Page returned no payload." }
              );
            }
          }
        });
        socket.on("close", () => {
          if (socket === activeSocket) {
            setActiveSocket(undefined);
            server.config.logger.info("[agf dev-bridge] page disconnected");
          }
        });
      });

      server.httpServer?.on(
        "upgrade",
        (req: IncomingMessage, socket: Duplex, head: Buffer) => {
          if (req.url !== DEV_BRIDGE_WS_PATH) {
            return;
          }
          wss.handleUpgrade(req, socket, head, (ws) => {
            wss.emit("connection", ws, req);
          });
        }
      );

      server.middlewares.use(DEV_BRIDGE_PATH_PREFIX, async (req, res, next) => {
        if (req.method !== "GET" && req.method !== "POST") {
          next();
          return;
        }
        const url = new URL(req.url ?? "", "http://localhost");
        const route = url.pathname;

        if (route === "/health" && req.method === "GET") {
          respondJson(res, 200, {
            ok: true,
            version,
            page: activePageInfo
          });
          return;
        }

        if (route === "/asset/invalidate" && req.method === "POST") {
          try {
            const body = await readJsonBody(req);
            const ref = (body as { ref?: unknown }).ref;
            if (typeof ref !== "string" || ref.length === 0) {
              respondJson(res, 400, {
                ok: false,
                error: {
                  code: "AGF_BRIDGE_INVALID_ASSET_REF",
                  message: "Body must be JSON with a `ref` string."
                }
              });
              return;
            }
            const payload = await rpc("asset-invalidate", { ref });
            respondJson(res, 200, { ok: true, payload });
          } catch (error) {
            const e = error as { code: string; message: string };
            const status = e.code === "AGF_BRIDGE_PAGE_NOT_CONNECTED" ? 503 : 502;
            respondJson(res, status, { ok: false, error: e });
          }
          return;
        }

        if (route === "/commands" && req.method === "POST") {
          try {
            const body = await readJsonBody(req);
            const commands = (body as { commands?: unknown }).commands;
            if (!Array.isArray(commands)) {
              respondJson(res, 400, {
                ok: false,
                error: {
                  code: "AGF_BRIDGE_INVALID_COMMANDS",
                  message: "Body must be JSON with a `commands` array."
                }
              });
              return;
            }
            const payload = await rpc("commands", { commands });
            respondJson(res, 200, { ok: true, payload });
          } catch (error) {
            const e = error as { code: string; message: string };
            const status = e.code === "AGF_BRIDGE_PAGE_NOT_CONNECTED" ? 503 : 502;
            respondJson(res, status, { ok: false, error: e });
          }
          return;
        }

        if (route === "/recording/start" && req.method === "POST") {
          try {
            const payload = await rpc("recording-start");
            respondJson(res, 200, { ok: true, payload });
          } catch (error) {
            const e = error as { code: string; message: string };
            const status = e.code === "AGF_BRIDGE_PAGE_NOT_CONNECTED" ? 503 : 502;
            respondJson(res, status, { ok: false, error: e });
          }
          return;
        }

        if (route === "/recording/stop" && req.method === "POST") {
          try {
            const payload = await rpc("recording-stop");
            respondJson(res, 200, { ok: true, payload });
          } catch (error) {
            const e = error as { code: string; message: string };
            const status = e.code === "AGF_BRIDGE_PAGE_NOT_CONNECTED" ? 503 : 502;
            respondJson(res, status, { ok: false, error: e });
          }
          return;
        }

        if (route === "/bug-report" && req.method === "GET") {
          if (activePageInfo === undefined) {
            respondJson(res, 503, {
              ok: false,
              error: {
                code: "AGF_BRIDGE_PAGE_NOT_CONNECTED",
                message: `No active page on ${DEV_BRIDGE_WS_PATH} — open http://localhost:5173 in a tab first.`
              }
            });
            return;
          }
          try {
            const [snapshot, diagnostics, rendererInfo, reloadEvents] = await Promise.all([
              rpc("snapshot"),
              rpc("diagnostics"),
              rpc("renderer-info"),
              rpc("reload-events")
            ]);
            respondJson(res, 200, {
              ok: true,
              payload: {
                agfFormatVersion: 1,
                projectId: activePageInfo.projectId,
                profile: activePageInfo.profile,
                capturedAt: new Date().toISOString(),
                snapshot,
                diagnostics,
                rendererInfo,
                reloadEvents
              }
            });
          } catch (error) {
            const e = error as { code: string; message: string };
            respondJson(res, 502, { ok: false, error: e });
          }
          return;
        }

        // RPC routes — proxy to the page over WS.
        const rpcKind = mapRouteToRpcKind(req.method, route);
        if (rpcKind !== undefined) {
          try {
            const payload = await rpc(rpcKind);
            respondJson(res, 200, { ok: true, payload });
          } catch (error) {
            const e = error as { code: string; message: string };
            respondJson(res, e.code === "AGF_BRIDGE_PAGE_NOT_CONNECTED" ? 503 : 502, {
              ok: false,
              error: e
            });
          }
          return;
        }

        respondJson(res, 404, {
          ok: false,
          error: {
            code: "AGF_BRIDGE_ROUTE_UNKNOWN",
            message: `No bridge route registered for ${req.method} ${DEV_BRIDGE_PATH_PREFIX}${route.slice(1)}`
          }
        });
      });
    }
  };
}

function mapRouteToRpcKind(method: string | undefined, route: string): string | undefined {
  if (method !== "GET") return undefined;
  switch (route) {
    case "/snapshot":
      return "snapshot";
    case "/diagnostics":
      return "diagnostics";
    case "/renderer-info":
      return "renderer-info";
    case "/reload-events":
      return "reload-events";
    default:
      return undefined;
  }
}

function respondJson(res: ServerResponseLike, status: number, payload: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(`${JSON.stringify(payload)}\n`);
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    req.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });
    req.on("end", () => resolve());
    req.on("error", (error: Error) => reject(error));
  });
  const raw = Buffer.concat(chunks).toString("utf8");
  if (raw.length === 0) {
    return {};
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw { code: "AGF_BRIDGE_INVALID_JSON", message: "Body is not valid JSON." };
  }
}

// Re-export type for ServerResponse for consumers — `ServerResponse` from
// node:http already satisfies `ServerResponseLike`.
export type { ServerResponse };
