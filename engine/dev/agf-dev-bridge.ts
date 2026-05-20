// AGF dev-server bridge (multi-page).
//
// A Vite plugin (`apply: "serve"`) that registers `/__agf/*` HTTP middleware
// on the dev server, plus a WebSocket at `/__agf/ws` that every page-side
// bootstrap connects to. HTTP routes proxy RPC requests to a target page and
// return its JSON reply.
//
// Targeting: routes accept an optional query string to pick a page:
//   ?page=<socketId>       — exact connection (returned by /__agf/health)
//   ?playerId=<id>         — first page that sent { playerId } in its hello
//   ?project=<id>          — first page that sent { projectId } in its hello
// With no query the bridge uses the most-recently connected page. Returns
// AGF_BRIDGE_PAGE_NOT_FOUND when the requested page isn't connected.
//
// Production builds exclude this plugin entirely (`apply: "serve"`).

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { isAbsolute, resolve as resolvePath, sep as pathSep } from "node:path";
import type { Duplex } from "node:stream";
import type { Plugin, ViteDevServer } from "vite";
import { WebSocketServer, type WebSocket as WsConnection } from "ws";

export type DevBridgeOptions = {
  /** Override the version string returned by `/__agf/health`. */
  version?: string;
  /** Override the RPC timeout (ms). Defaults to 3000. */
  rpcTimeoutMs?: number;
};

export const DEV_BRIDGE_VERSION = "0.1.0-m15-multi-page";
export const DEV_BRIDGE_PATH_PREFIX = "/__agf/";
export const DEV_BRIDGE_WS_PATH = "/__agf/ws";

/**
 * S097 AGF-PROBE-ENTITY-DUMP — pure URL path parser for `/entity/<entityId>`.
 * Exported for unit tests.
 */
export type EntityPathResult =
  | { kind: "ok"; entityId: string }
  | { kind: "error"; code: string; message: string };

export function parseEntityPath(route: string): EntityPathResult {
  if (!route.startsWith("/entity/")) {
    return {
      kind: "error",
      code: "AGF_BRIDGE_INVALID_ENTITY_PATH",
      message: "Route must start with /entity/"
    };
  }
  const tail = route.slice("/entity/".length);
  if (tail.length === 0 || tail.includes("/")) {
    return {
      kind: "error",
      code: "AGF_BRIDGE_INVALID_ENTITY_PATH",
      message: "Route must match /entity/<entityId> with no further path segments."
    };
  }
  const entityId = decodeURIComponent(tail);
  if (entityId.length === 0) {
    return {
      kind: "error",
      code: "AGF_BRIDGE_INVALID_ENTITY_PATH",
      message: "entityId must be non-empty."
    };
  }
  return { kind: "ok", entityId };
}

/**
 * S096 AGF-PROBE-COMPONENT-AT — pure URL path parser for
 * `/component/<entityId>/<componentName>`. Exported for unit tests.
 * Accepts URL-safe IDs (period, dash, underscore, alphanumeric).
 * Empty segments fail the parse.
 */
export type ComponentPathResult =
  | { kind: "ok"; entityId: string; componentName: string }
  | { kind: "error"; code: string; message: string };

export function parseComponentPath(route: string): ComponentPathResult {
  if (!route.startsWith("/component/")) {
    return {
      kind: "error",
      code: "AGF_BRIDGE_INVALID_COMPONENT_PATH",
      message: "Route must start with /component/"
    };
  }
  const tail = route.slice("/component/".length);
  const slash = tail.indexOf("/");
  if (slash <= 0 || slash === tail.length - 1) {
    return {
      kind: "error",
      code: "AGF_BRIDGE_INVALID_COMPONENT_PATH",
      message: "Route must match /component/<entityId>/<componentName> with non-empty segments."
    };
  }
  const entityId = decodeURIComponent(tail.slice(0, slash));
  const componentName = decodeURIComponent(tail.slice(slash + 1));
  if (entityId.length === 0 || componentName.length === 0) {
    return {
      kind: "error",
      code: "AGF_BRIDGE_INVALID_COMPONENT_PATH",
      message: "entityId and componentName must be non-empty."
    };
  }
  // Reject extra path segments (e.g. /component/a/b/c).
  if (componentName.includes("/")) {
    return {
      kind: "error",
      code: "AGF_BRIDGE_INVALID_COMPONENT_PATH",
      message: "componentName must not contain '/'."
    };
  }
  return { kind: "ok", entityId, componentName };
}

/**
 * S095 AGF-RENDER-DEBUG-FREECAM — pure body validator for the
 * POST /__agf/render/freecam route. Exported for unit tests so the
 * accept/reject rules can be locked without spinning up Vite.
 */
export type FreeCamBodyResult =
  | { kind: "off" }
  | { kind: "set"; position: [number, number, number]; lookAt: [number, number, number] }
  | { kind: "error"; code: string; message: string };

export function validateFreeCamBody(body: unknown): FreeCamBodyResult {
  if (body === null || typeof body !== "object") {
    return {
      kind: "error",
      code: "AGF_BRIDGE_INVALID_FREECAM",
      message: "Body must be a JSON object."
    };
  }
  const b = body as { off?: unknown; position?: unknown; lookAt?: unknown };
  if (b.off === true) return { kind: "off" };
  const isVec3 = (v: unknown): v is [number, number, number] =>
    Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === "number" && Number.isFinite(n));
  if (!isVec3(b.position) || !isVec3(b.lookAt)) {
    return {
      kind: "error",
      code: "AGF_BRIDGE_INVALID_FREECAM",
      message: "Body must be JSON with `position: [x, y, z]` + `lookAt: [x, y, z]` (finite numbers), or `{ off: true }` to clear."
    };
  }
  return { kind: "set", position: b.position, lookAt: b.lookAt };
}

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

type PageInfo = {
  projectId?: string;
  profile?: string;
  playerId?: string;
};

type PageEntry = {
  socketId: string;
  socket: WsConnection;
  info: PageInfo;
  connectedAt: string;
  pending: Map<number, PendingRpc>;
  nextRpcId: number;
  /**
   * SSE subscribers attached to this page's event stream. First subscriber
   * arms `events-start` on the page; last leaving fires `events-stop`. The
   * page forwards events back as `{ kind: "event", payload }` over WS.
   */
  sseSubscribers: Set<ServerResponseLike>;
};

export function agfDevBridge(options: DevBridgeOptions = {}): Plugin {
  const version = options.version ?? DEV_BRIDGE_VERSION;
  const rpcTimeoutMs = options.rpcTimeoutMs ?? DEFAULT_RPC_TIMEOUT_MS;

  const pages = new Map<string, PageEntry>();
  let nextSocketId = 1;

  const rpc = (entry: PageEntry, kind: string, payload?: unknown): Promise<unknown> =>
    new Promise((resolve, reject) => {
      if (entry.socket.readyState !== 1 /* OPEN */) {
        reject({
          code: "AGF_BRIDGE_PAGE_DISCONNECTED",
          message: `Page ${entry.socketId} is closed.`
        });
        return;
      }
      const id = entry.nextRpcId++;
      const timer = setTimeout(() => {
        if (entry.pending.has(id)) {
          entry.pending.delete(id);
          reject({
            code: "AGF_BRIDGE_PAGE_TIMEOUT",
            message: `Page ${entry.socketId} did not reply to ${kind} within ${rpcTimeoutMs}ms.`
          });
        }
      }, rpcTimeoutMs);
      entry.pending.set(id, { resolve, reject, timer });
      entry.socket.send(JSON.stringify({ id, kind, payload }));
    });

  const findPage = (url: URL): { entry: PageEntry } | { error: { code: string; message: string } } => {
    if (pages.size === 0) {
      return {
        error: {
          code: "AGF_BRIDGE_PAGE_NOT_CONNECTED",
          message: `No active page on ${DEV_BRIDGE_WS_PATH} — open http://localhost:5173 in a tab first.`
        }
      };
    }
    const pageQuery = url.searchParams.get("page");
    if (pageQuery !== null) {
      const entry = pages.get(pageQuery);
      if (entry === undefined) {
        return {
          error: {
            code: "AGF_BRIDGE_PAGE_NOT_FOUND",
            message: `No page with socketId "${pageQuery}". GET /__agf/health for the list.`
          }
        };
      }
      return { entry };
    }
    const playerQuery = url.searchParams.get("playerId");
    if (playerQuery !== null) {
      for (const entry of pages.values()) {
        if (entry.info.playerId === playerQuery) {
          return { entry };
        }
      }
      return {
        error: {
          code: "AGF_BRIDGE_PAGE_NOT_FOUND",
          message: `No connected page reported playerId "${playerQuery}".`
        }
      };
    }
    const projectQuery = url.searchParams.get("project");
    if (projectQuery !== null) {
      for (const entry of pages.values()) {
        if (entry.info.projectId === projectQuery) {
          return { entry };
        }
      }
      return {
        error: {
          code: "AGF_BRIDGE_PAGE_NOT_FOUND",
          message: `No connected page reported projectId "${projectQuery}".`
        }
      };
    }
    // Most recently connected page (insertion order tail).
    let latest: PageEntry | undefined;
    for (const entry of pages.values()) {
      latest = entry;
    }
    return { entry: latest as PageEntry };
  };

  return {
    name: "agf-dev-bridge",
    apply: "serve",
    configureServer(server: ViteDevServer) {
      const wss = new WebSocketServer({ noServer: true });

      wss.on("connection", (socket) => {
        const socketId = `ws-${nextSocketId++}`;
        const entry: PageEntry = {
          socketId,
          socket,
          info: {},
          connectedAt: new Date().toISOString(),
          pending: new Map(),
          nextRpcId: 1,
          sseSubscribers: new Set()
        };
        pages.set(socketId, entry);
        // Assigned-id handshake — page can echo it back if it wants to.
        socket.send(JSON.stringify({ kind: "ready", socketId }));

        socket.on("message", (raw) => {
          let msg: { id?: number; kind?: string; ok?: boolean; payload?: unknown; error?: { code: string; message: string } } | undefined;
          try {
            msg = JSON.parse(typeof raw === "string" ? raw : raw.toString("utf8"));
          } catch {
            return;
          }
          if (msg === undefined) return;
          if (msg.kind === "hello" && msg.payload !== undefined) {
            const info = msg.payload as PageInfo;
            entry.info = {
              ...(typeof info.projectId === "string" ? { projectId: info.projectId } : {}),
              ...(typeof info.profile === "string" ? { profile: info.profile } : {}),
              ...(typeof info.playerId === "string" ? { playerId: info.playerId } : {})
            };
            server.config.logger.info(
              `[agf dev-bridge] page connected (socketId=${socketId} project=${entry.info.projectId ?? "?"} profile=${entry.info.profile ?? "?"} playerId=${entry.info.playerId ?? "?"})`
            );
            return;
          }
          if (msg.kind === "event" && msg.payload !== undefined) {
            // Fan the event to every SSE subscriber attached to THIS page.
            const frame = `data: ${JSON.stringify(msg.payload)}\n\n`;
            for (const subscriber of entry.sseSubscribers) {
              try {
                (subscriber as ServerResponseLike & { write?: (chunk: string) => unknown }).write?.(frame);
              } catch {
                // Subscriber dropped; cleanup happens on close.
              }
            }
            return;
          }
          if (typeof msg.id === "number" && entry.pending.has(msg.id)) {
            const pendingEntry = entry.pending.get(msg.id);
            entry.pending.delete(msg.id);
            if (pendingEntry === undefined) return;
            clearTimeout(pendingEntry.timer);
            if (msg.ok === true) {
              pendingEntry.resolve(msg.payload);
            } else {
              pendingEntry.reject(
                msg.error ?? { code: "AGF_BRIDGE_PAGE_HANDLER_FAILED", message: "Page returned no payload." }
              );
            }
          }
        });
        socket.on("close", () => {
          pages.delete(socketId);
          for (const pendingEntry of entry.pending.values()) {
            clearTimeout(pendingEntry.timer);
            pendingEntry.reject({
              code: "AGF_BRIDGE_PAGE_DISCONNECTED",
              message: `Page ${socketId} closed before replying.`
            });
          }
          entry.pending.clear();
          // Close any SSE streams still attached to this page.
          for (const subscriber of entry.sseSubscribers) {
            try {
              (subscriber as ServerResponseLike & { end?: () => unknown }).end?.("");
            } catch {
              // ignore
            }
          }
          entry.sseSubscribers.clear();
          server.config.logger.info(`[agf dev-bridge] page disconnected (socketId=${socketId})`);
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

      const proxyToPage = async (
        req: { url?: string | undefined },
        res: ServerResponseLike,
        kind: string,
        payload?: unknown
      ): Promise<void> => {
        const url = new URL(req.url ?? "", "http://localhost");
        const found = findPage(url);
        if ("error" in found) {
          const status = found.error.code === "AGF_BRIDGE_PAGE_NOT_CONNECTED" ? 503 : 404;
          respondJson(res, status, { ok: false, error: found.error });
          return;
        }
        try {
          const result = await rpc(found.entry, kind, payload);
          respondJson(res, 200, { ok: true, page: found.entry.socketId, payload: result });
        } catch (error) {
          const e = error as { code: string; message: string };
          respondJson(res, 502, { ok: false, error: e });
        }
      };

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
            pages: [...pages.values()].map((entry) => ({
              socketId: entry.socketId,
              projectId: entry.info.projectId ?? null,
              profile: entry.info.profile ?? null,
              playerId: entry.info.playerId ?? null,
              connectedAt: entry.connectedAt
            }))
          });
          return;
        }

        if (route === "/asset/invalidate" && req.method === "POST") {
          const body = await readJsonBody(req).catch((e) => e as { code: string; message: string });
          if ("code" in (body as object)) {
            respondJson(res, 400, { ok: false, error: body });
            return;
          }
          const ref = (body as { ref?: unknown }).ref;
          if (typeof ref !== "string" || ref.length === 0) {
            respondJson(res, 400, {
              ok: false,
              error: { code: "AGF_BRIDGE_INVALID_ASSET_REF", message: "Body must be JSON with a `ref` string." }
            });
            return;
          }
          await proxyToPage(req, res, "asset-invalidate", { ref });
          return;
        }

        // S90 AGF-DEV-BRIDGE-TIME-SCALE. POST forwards to the page's
        // setTimeScale; GET reads the live value. Out-of-range values
        // clamp on the page side; the response always carries the
        // final scale so the caller can compare against its intent.
        if (route === "/runtime/timescale" && req.method === "POST") {
          const body = await readJsonBody(req).catch((e) => e as { code: string; message: string });
          if ("code" in (body as object)) {
            respondJson(res, 400, { ok: false, error: body });
            return;
          }
          const value = (body as { value?: unknown }).value;
          if (typeof value !== "number") {
            respondJson(res, 400, {
              ok: false,
              error: { code: "AGF_BRIDGE_INVALID_TIME_SCALE", message: "Body must be JSON with a `value` number." }
            });
            return;
          }
          await proxyToPage(req, res, "runtime-timescale-set", { value });
          return;
        }

        // S097 AGF-PROBE-ENTITY-DUMP. `/entity/<entityId>` returns the
        // full component map for one entity. `?at=-N` reads history.
        if (route.startsWith("/entity/") && req.method === "GET") {
          const parsed = parseEntityPath(route);
          if (parsed.kind === "error") {
            respondJson(res, 400, { ok: false, error: { code: parsed.code, message: parsed.message } });
            return;
          }
          const atRaw = url.searchParams.get("at");
          let at = 0;
          if (atRaw !== null) {
            const parsedAt = Number.parseInt(atRaw, 10);
            if (!Number.isFinite(parsedAt) || parsedAt > 0) {
              respondJson(res, 400, {
                ok: false,
                error: { code: "AGF_BRIDGE_INVALID_SNAPSHOT_AT", message: "`at` must be a non-positive integer." }
              });
              return;
            }
            at = parsedAt;
          }
          const url2 = new URL(req.url ?? "", "http://localhost");
          const found = findPage(url2);
          if ("error" in found) {
            const status = found.error.code === "AGF_BRIDGE_PAGE_NOT_CONNECTED" ? 503 : 404;
            respondJson(res, status, { ok: false, error: found.error });
            return;
          }
          try {
            const result = (await rpc(found.entry, "entity-at", { entityId: parsed.entityId, at })) as
              | { kind: "ok"; components: Record<string, unknown> }
              | { kind: "entity-not-found" }
              | { kind: "out-of-range"; capacity: number; size: number };
            if (result.kind === "ok") {
              respondJson(res, 200, {
                ok: true,
                page: found.entry.socketId,
                payload: { entityId: parsed.entityId, components: result.components }
              });
              return;
            }
            if (result.kind === "entity-not-found") {
              respondJson(res, 404, {
                ok: false,
                error: { code: "AGF_PROBE_ENTITY_NOT_FOUND", message: `No entity with id "${parsed.entityId}".` }
              });
              return;
            }
            // out-of-range
            respondJson(res, 400, {
              ok: false,
              error: {
                code: "AGF_PROBE_SNAPSHOT_OUT_OF_RANGE",
                message: `Snapshot at=${at} is out of range. Buffer capacity=${result.capacity}, current size=${result.size}.`
              }
            });
          } catch (error) {
            respondJson(res, 502, { ok: false, error: error as { code: string; message: string } });
          }
          return;
        }

        // S097 AGF-PROBE-COMPONENT-WRITE. POST /component/<entityId>/<componentName>
        // writes a single component value. Body must be { value: ... }.
        if (route.startsWith("/component/") && req.method === "POST") {
          const parsed = parseComponentPath(route);
          if (parsed.kind === "error") {
            respondJson(res, 400, { ok: false, error: { code: parsed.code, message: parsed.message } });
            return;
          }
          const body = await readJsonBody(req).catch((e) => e as { code: string; message: string });
          if ("code" in (body as object)) {
            respondJson(res, 400, { ok: false, error: body });
            return;
          }
          if (!Object.prototype.hasOwnProperty.call(body, "value")) {
            respondJson(res, 400, {
              ok: false,
              error: {
                code: "AGF_BRIDGE_INVALID_COMPONENT_WRITE",
                message: "Body must be JSON with a `value` field (any JSON-compatible shape; the entity gets this verbatim)."
              }
            });
            return;
          }
          const url2 = new URL(req.url ?? "", "http://localhost");
          const found = findPage(url2);
          if ("error" in found) {
            const status = found.error.code === "AGF_BRIDGE_PAGE_NOT_CONNECTED" ? 503 : 404;
            respondJson(res, status, { ok: false, error: found.error });
            return;
          }
          try {
            const result = (await rpc(found.entry, "component-write", {
              entityId: parsed.entityId,
              componentName: parsed.componentName,
              value: (body as { value: unknown }).value
            })) as { kind: "ok"; value: unknown } | { kind: "entity-not-found" };
            if (result.kind === "ok") {
              respondJson(res, 200, {
                ok: true,
                page: found.entry.socketId,
                payload: { entityId: parsed.entityId, component: parsed.componentName, value: result.value }
              });
              return;
            }
            respondJson(res, 404, {
              ok: false,
              error: { code: "AGF_PROBE_ENTITY_NOT_FOUND", message: `No entity with id "${parsed.entityId}".` }
            });
          } catch (error) {
            respondJson(res, 502, { ok: false, error: error as { code: string; message: string } });
          }
          return;
        }

        // S096 AGF-PROBE-COMPONENT-AT. `/component/<entityId>/<componentName>`
        // returns a single component's value. Optional `?at=-N` reads
        // the history ring. Typed errors:
        //   404 AGF_PROBE_ENTITY_NOT_FOUND, 404 AGF_PROBE_COMPONENT_NOT_FOUND,
        //   400 AGF_PROBE_SNAPSHOT_OUT_OF_RANGE, 400 AGF_BRIDGE_INVALID_COMPONENT_PATH,
        //   400 AGF_BRIDGE_INVALID_SNAPSHOT_AT.
        if (route.startsWith("/component/") && req.method === "GET") {
          const parsed = parseComponentPath(route);
          if (parsed.kind === "error") {
            respondJson(res, 400, { ok: false, error: { code: parsed.code, message: parsed.message } });
            return;
          }
          const atRaw = url.searchParams.get("at");
          let at = 0;
          if (atRaw !== null) {
            const parsedAt = Number.parseInt(atRaw, 10);
            if (!Number.isFinite(parsedAt) || parsedAt > 0) {
              respondJson(res, 400, {
                ok: false,
                error: {
                  code: "AGF_BRIDGE_INVALID_SNAPSHOT_AT",
                  message: "`at` must be a non-positive integer (e.g. 0, -1, -2, ...)."
                }
              });
              return;
            }
            at = parsedAt;
          }
          const url2 = new URL(req.url ?? "", "http://localhost");
          const found = findPage(url2);
          if ("error" in found) {
            const status = found.error.code === "AGF_BRIDGE_PAGE_NOT_CONNECTED" ? 503 : 404;
            respondJson(res, status, { ok: false, error: found.error });
            return;
          }
          try {
            const result = (await rpc(found.entry, "component-at", {
              entityId: parsed.entityId,
              componentName: parsed.componentName,
              at
            })) as
              | { kind: "ok"; value: unknown }
              | { kind: "entity-not-found" }
              | { kind: "component-not-found" }
              | { kind: "out-of-range"; capacity: number; size: number };
            if (result.kind === "ok") {
              respondJson(res, 200, {
                ok: true,
                page: found.entry.socketId,
                payload: {
                  entityId: parsed.entityId,
                  component: parsed.componentName,
                  value: result.value
                }
              });
              return;
            }
            if (result.kind === "entity-not-found") {
              respondJson(res, 404, {
                ok: false,
                error: {
                  code: "AGF_PROBE_ENTITY_NOT_FOUND",
                  message: `No entity with id "${parsed.entityId}".`
                }
              });
              return;
            }
            if (result.kind === "component-not-found") {
              respondJson(res, 404, {
                ok: false,
                error: {
                  code: "AGF_PROBE_COMPONENT_NOT_FOUND",
                  message: `Entity "${parsed.entityId}" has no component "${parsed.componentName}".`
                }
              });
              return;
            }
            // out-of-range
            respondJson(res, 400, {
              ok: false,
              error: {
                code: "AGF_PROBE_SNAPSHOT_OUT_OF_RANGE",
                message: `Snapshot at=${at} is out of range. Buffer capacity=${result.capacity}, current size=${result.size}.`
              }
            });
          } catch (error) {
            respondJson(res, 502, { ok: false, error: error as { code: string; message: string } });
          }
          return;
        }

        // S095 AGF-PROBE-SNAPSHOT-HISTORY. `?at=-N` looks back in the
        // ring of past fixedUpdate snapshots. `at` is an integer ≤ 0
        // (positive values are rejected at the bridge, default 0 →
        // live snapshot). Out-of-range lookups (|-at| > history size)
        // return HTTP 400 with AGF_PROBE_SNAPSHOT_OUT_OF_RANGE.
        if (route === "/snapshot" && req.method === "GET") {
          const atRaw = url.searchParams.get("at");
          let at = 0;
          if (atRaw !== null) {
            const parsed = Number.parseInt(atRaw, 10);
            if (!Number.isFinite(parsed) || parsed > 0) {
              respondJson(res, 400, {
                ok: false,
                error: {
                  code: "AGF_BRIDGE_INVALID_SNAPSHOT_AT",
                  message: "`at` must be a non-positive integer (e.g. 0, -1, -2, ...)."
                }
              });
              return;
            }
            at = parsed;
          }
          // S096 AGF-PROBE-SNAPSHOT-DIFF — `&diff=1` returns the diff
          // entries between the historical snapshot at `at` and live.
          // Requires `at` to be negative; `at=0 + diff=1` is rejected
          // (diff of live vs live is trivially empty + wastes a round
          // trip).
          const diffMode = url.searchParams.get("diff") === "1";
          if (diffMode) {
            if (at >= 0) {
              respondJson(res, 400, {
                ok: false,
                error: {
                  code: "AGF_BRIDGE_INVALID_SNAPSHOT_DIFF",
                  message: "`diff=1` requires `at` to be negative (e.g. ?at=-1&diff=1)."
                }
              });
              return;
            }
            const urlDiff = new URL(req.url ?? "", "http://localhost");
            const foundDiff = findPage(urlDiff);
            if ("error" in foundDiff) {
              const status = foundDiff.error.code === "AGF_BRIDGE_PAGE_NOT_CONNECTED" ? 503 : 404;
              respondJson(res, status, { ok: false, error: foundDiff.error });
              return;
            }
            try {
              const diffResult = (await rpc(foundDiff.entry, "snapshot-diff", { at })) as
                | { kind: "ok"; entries: ReadonlyArray<unknown> }
                | { kind: "out-of-range"; capacity: number; size: number };
              if (diffResult.kind === "out-of-range") {
                respondJson(res, 400, {
                  ok: false,
                  error: {
                    code: "AGF_PROBE_SNAPSHOT_OUT_OF_RANGE",
                    message: `Snapshot at=${at} is out of range. Buffer capacity=${diffResult.capacity}, current size=${diffResult.size}.`
                  }
                });
                return;
              }
              respondJson(res, 200, {
                ok: true,
                page: foundDiff.entry.socketId,
                payload: { at, entries: diffResult.entries }
              });
            } catch (error) {
              respondJson(res, 502, { ok: false, error: error as { code: string; message: string } });
            }
            return;
          }
          if (at === 0) {
            await proxyToPage(req, res, "snapshot");
            return;
          }
          // proxyToPage wraps the payload; the page-bridge handler for
          // snapshot-at returns either `{ snapshot }` (in-range) or
          // `{ outOfRange: true, capacity, size }` (history too short).
          // We translate the latter into a typed 400 here, in front of
          // the standard payload wrapping.
          const url2 = new URL(req.url ?? "", "http://localhost");
          const found = findPage(url2);
          if ("error" in found) {
            const status = found.error.code === "AGF_BRIDGE_PAGE_NOT_CONNECTED" ? 503 : 404;
            respondJson(res, status, { ok: false, error: found.error });
            return;
          }
          try {
            const result = (await rpc(found.entry, "snapshot-at", { at })) as {
              snapshot?: unknown;
              outOfRange?: boolean;
              capacity?: number;
              size?: number;
            };
            if (result?.outOfRange === true) {
              respondJson(res, 400, {
                ok: false,
                error: {
                  code: "AGF_PROBE_SNAPSHOT_OUT_OF_RANGE",
                  message: `Snapshot at=${at} is out of range. Buffer capacity=${result.capacity ?? 0}, current size=${result.size ?? 0}.`
                }
              });
              return;
            }
            respondJson(res, 200, { ok: true, page: found.entry.socketId, payload: result.snapshot });
          } catch (error) {
            respondJson(res, 502, { ok: false, error: error as { code: string; message: string } });
          }
          return;
        }

        // S091 AGF-RENDER-DEBUG-MODE-AGENT. POST forwards a mode; GET
        // returns the live mode. Invalid modes are rejected at the
        // bridge before reaching the page so misconfigured agents fail
        // loudly instead of silently no-op-ing.
        if (route === "/render/debug-mode" && req.method === "GET") {
          await proxyToPage(req, res, "render-debug-mode-get");
          return;
        }
        if (route === "/render/debug-mode" && req.method === "POST") {
          const body = await readJsonBody(req).catch((e) => e as { code: string; message: string });
          if ("code" in (body as object)) {
            respondJson(res, 400, { ok: false, error: body });
            return;
          }
          const mode = (body as { mode?: unknown }).mode;
          const allowed = ["off", "wireframe", "unlit-white", "normals", "uv"];
          if (typeof mode !== "string" || !allowed.includes(mode)) {
            respondJson(res, 400, {
              ok: false,
              error: {
                code: "AGF_BRIDGE_INVALID_RENDER_DEBUG_MODE",
                message: `Body must be JSON with a "mode" string in ${JSON.stringify(allowed)}.`
              }
            });
            return;
          }
          await proxyToPage(req, res, "render-debug-mode-set", { mode });
          return;
        }

        // S095 AGF-RENDER-DEBUG-FREECAM. POST sets the override (or
        // clears it with { off: true }); GET reads the current pose.
        if (route === "/render/freecam" && req.method === "GET") {
          await proxyToPage(req, res, "render-freecam-get");
          return;
        }
        if (route === "/render/freecam" && req.method === "POST") {
          const body = await readJsonBody(req).catch((e) => e as { code: string; message: string });
          if ("code" in (body as object)) {
            respondJson(res, 400, { ok: false, error: body });
            return;
          }
          const validated = validateFreeCamBody(body);
          if (validated.kind === "error") {
            respondJson(res, 400, {
              ok: false,
              error: { code: validated.code, message: validated.message }
            });
            return;
          }
          if (validated.kind === "off") {
            await proxyToPage(req, res, "render-freecam-set", { off: true });
            return;
          }
          await proxyToPage(req, res, "render-freecam-set", {
            position: validated.position,
            lookAt: validated.lookAt
          });
          return;
        }

        // S095 AGF-AUDIO-MASTER-VOLUME.
        if (route === "/audio/master-volume" && req.method === "GET") {
          await proxyToPage(req, res, "audio-master-volume-get");
          return;
        }
        if (route === "/audio/master-volume" && req.method === "POST") {
          const body = await readJsonBody(req).catch((e) => e as { code: string; message: string });
          if ("code" in (body as object)) {
            respondJson(res, 400, { ok: false, error: body });
            return;
          }
          const value = (body as { value?: unknown }).value;
          if (typeof value !== "number") {
            respondJson(res, 400, {
              ok: false,
              error: {
                code: "AGF_BRIDGE_INVALID_AUDIO_VOLUME",
                message: "Body must be JSON with a `value` number in [0, 1] (non-finite values are ignored)."
              }
            });
            return;
          }
          await proxyToPage(req, res, "audio-master-volume-set", { value });
          return;
        }

        if (route === "/project-patch" && req.method === "POST") {
          // S53 DEVBRIDGE-project-patch: shallow merge-patch onto a
          // project.json on disk. Dev-only (the whole `/__agf/*`
          // surface is); the shadow tuner is the first caller.
          const body = await readJsonBody(req).catch((e) => e as { code: string; message: string });
          if ("code" in (body as object)) {
            respondJson(res, 400, { ok: false, error: body });
            return;
          }
          const result = await handleProjectPatch(server, body as Record<string, unknown>);
          respondJson(res, result.status, result.payload);
          return;
        }

        if (route === "/commands" && req.method === "POST") {
          const body = await readJsonBody(req).catch((e) => e as { code: string; message: string });
          if ("code" in (body as object)) {
            respondJson(res, 400, { ok: false, error: body });
            return;
          }
          const commands = (body as { commands?: unknown }).commands;
          if (!Array.isArray(commands)) {
            respondJson(res, 400, {
              ok: false,
              error: { code: "AGF_BRIDGE_INVALID_COMMANDS", message: "Body must be JSON with a `commands` array." }
            });
            return;
          }
          await proxyToPage(req, res, "commands", { commands });
          return;
        }

        // S096 AGF-PROBE-RECORDING-LIST.
        if (route === "/recording/list" && req.method === "GET") {
          await proxyToPage(req, res, "recording-list");
          return;
        }

        if (route === "/recording/start" && req.method === "POST") {
          await proxyToPage(req, res, "recording-start");
          return;
        }
        if (route === "/recording/stop" && req.method === "POST") {
          await proxyToPage(req, res, "recording-stop");
          return;
        }

        if (route === "/tuner/add" && req.method === "POST") {
          const body = await readJsonBody(req).catch((e) => e as { code: string; message: string });
          if ("code" in (body as object)) {
            respondJson(res, 400, { ok: false, error: body });
            return;
          }
          await proxyToPage(req, res, "tuner-add", { spec: body });
          return;
        }
        if (route === "/tuner/remove" && req.method === "POST") {
          const body = await readJsonBody(req).catch((e) => e as { code: string; message: string });
          if ("code" in (body as object)) {
            respondJson(res, 400, { ok: false, error: body });
            return;
          }
          const name = (body as { name?: string }).name;
          if (typeof name !== "string") {
            respondJson(res, 400, {
              ok: false,
              error: { code: "AGF_BRIDGE_INVALID_TUNER_NAME", message: "Body must be JSON with a `name` string." }
            });
            return;
          }
          await proxyToPage(req, res, "tuner-remove", { name });
          return;
        }
        if (route === "/tuner/remove-all" && req.method === "POST") {
          await proxyToPage(req, res, "tuner-remove-all");
          return;
        }
        if (route === "/tuner/list" && req.method === "GET") {
          await proxyToPage(req, res, "tuner-list");
          return;
        }

        if (route === "/events" && req.method === "GET") {
          const found = findPage(url);
          if ("error" in found) {
            const status = found.error.code === "AGF_BRIDGE_PAGE_NOT_CONNECTED" ? 503 : 404;
            respondJson(res, status, { ok: false, error: found.error });
            return;
          }
          res.statusCode = 200;
          res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
          res.setHeader("Cache-Control", "no-cache, no-transform");
          res.setHeader("Connection", "keep-alive");
          res.setHeader("X-Accel-Buffering", "no");
          const writable = res as ServerResponseLike & {
            write?: (chunk: string) => unknown;
            flushHeaders?: () => unknown;
          };
          writable.write?.(`: agf dev bridge events (page=${found.entry.socketId})\n\n`);
          writable.flushHeaders?.();

          const wasEmpty = found.entry.sseSubscribers.size === 0;
          found.entry.sseSubscribers.add(res);
          if (wasEmpty && found.entry.socket.readyState === 1) {
            rpc(found.entry, "events-start").catch(() => undefined);
          }

          const cleanup = (): void => {
            found.entry.sseSubscribers.delete(res);
            if (
              found.entry.sseSubscribers.size === 0 &&
              found.entry.socket.readyState === 1
            ) {
              rpc(found.entry, "events-stop").catch(() => undefined);
            }
          };
          req.on("close", cleanup);
          req.on("error", cleanup);
          return;
        }

        if (route === "/bug-report" && req.method === "GET") {
          const found = findPage(url);
          if ("error" in found) {
            const status = found.error.code === "AGF_BRIDGE_PAGE_NOT_CONNECTED" ? 503 : 404;
            respondJson(res, status, { ok: false, error: found.error });
            return;
          }
          try {
            const [snapshot, diagnostics, rendererInfo, reloadEvents] = await Promise.all([
              rpc(found.entry, "snapshot"),
              rpc(found.entry, "diagnostics"),
              rpc(found.entry, "renderer-info"),
              rpc(found.entry, "reload-events")
            ]);
            respondJson(res, 200, {
              ok: true,
              page: found.entry.socketId,
              payload: {
                agfFormatVersion: 1,
                projectId: found.entry.info.projectId ?? null,
                profile: found.entry.info.profile ?? null,
                playerId: found.entry.info.playerId ?? null,
                capturedAt: new Date().toISOString(),
                snapshot,
                diagnostics,
                rendererInfo,
                reloadEvents
              }
            });
          } catch (error) {
            respondJson(res, 502, { ok: false, error: error as { code: string; message: string } });
          }
          return;
        }

        // GET pull routes (snapshot / diagnostics / renderer-info / reload-events).
        const rpcKind = mapRouteToRpcKind(req.method, route);
        if (rpcKind !== undefined) {
          await proxyToPage(req, res, rpcKind);
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
    case "/renderer-inspect":
      return "renderer-inspect";
    case "/asset-inventory":
      return "asset-inventory";
    case "/pool-inventory":
      return "pool-inventory";
    case "/runtime/timescale":
      return "runtime-timescale";
    case "/reload-events":
      return "reload-events";
    // S71 agent-debug. Returns the page's recent `console.*` lines
    // (error/warn/log/info/debug, all severities) so an agent can
    // `curl http://127.0.0.1:5173/__agf/console-log` and SEE WebGPU
    // validation warnings ("Destroyed texture used in submit"),
    // three.js `warnOnce` messages, and other browser-side signals
    // without launching playwright. Pairs with playwright probes
    // — playwright is heavier but supports a fresh page load;
    // console-log lets you tail the EXISTING tab's recent state.
    case "/console-log":
      return "console-log";
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

/**
 * S53 DEVBRIDGE-project-patch: shallow merge-patch a project.json on
 * disk. Body shape:
 *   {
 *     projectDir: "examples/shadows-bench",   // relative to vite root
 *     patch: { render: { shadows: { csm: { shadowMapSize: 2048 } } } }
 *   }
 * Validates `projectDir` is inside vite's project root, ensures
 * project.json exists, deep-merges the patch onto the current
 * contents, and writes the result back. Returns the merged document
 * on success.
 *
 * Validation is structural only — the route does NOT yet run the
 * project against `schemas/project.schema.json` (the doctor + engine
 * check already cover that path on the developer's next run). A
 * follow-up can wire AJV here if writes start producing invalid
 * config that breaks the running page mid-tune.
 */
async function handleProjectPatch(
  server: ViteDevServer,
  body: Record<string, unknown>
): Promise<{ status: number; payload: unknown }> {
  const projectDirInput = body["projectDir"];
  const patch = body["patch"];
  if (typeof projectDirInput !== "string" || projectDirInput.length === 0) {
    return {
      status: 400,
      payload: {
        ok: false,
        error: {
          code: "AGF_BRIDGE_PROJECT_PATCH_INVALID",
          message: "Body must be JSON `{ projectDir: string, patch: object }`."
        }
      }
    };
  }
  if (patch === null || typeof patch !== "object" || Array.isArray(patch)) {
    return {
      status: 400,
      payload: {
        ok: false,
        error: {
          code: "AGF_BRIDGE_PROJECT_PATCH_INVALID",
          message: "`patch` must be a JSON object."
        }
      }
    };
  }
  const viteRoot = resolvePath(server.config.root);
  const absoluteProjectDir = isAbsolute(projectDirInput)
    ? resolvePath(projectDirInput)
    : resolvePath(viteRoot, projectDirInput);
  // Path-traversal guard: only allow paths under the vite root.
  if (
    absoluteProjectDir !== viteRoot &&
    !absoluteProjectDir.startsWith(viteRoot + pathSep)
  ) {
    return {
      status: 400,
      payload: {
        ok: false,
        error: {
          code: "AGF_BRIDGE_PROJECT_PATCH_ESCAPE",
          message: `projectDir "${projectDirInput}" resolves outside vite root.`
        }
      }
    };
  }
  const projectJsonPath = resolvePath(absoluteProjectDir, "project.json");
  if (!existsSync(projectJsonPath)) {
    return {
      status: 404,
      payload: {
        ok: false,
        error: {
          code: "AGF_BRIDGE_PROJECT_PATCH_NOT_FOUND",
          message: `project.json not found at "${projectJsonPath}".`
        }
      }
    };
  }
  let current: Record<string, unknown>;
  try {
    current = JSON.parse(readFileSync(projectJsonPath, "utf8")) as Record<string, unknown>;
  } catch (err) {
    return {
      status: 500,
      payload: {
        ok: false,
        error: {
          code: "AGF_BRIDGE_PROJECT_PATCH_PARSE",
          message: `Failed to parse project.json: ${(err as Error).message}`
        }
      }
    };
  }
  const merged = deepMerge(current, patch as Record<string, unknown>);
  try {
    writeFileSync(projectJsonPath, `${JSON.stringify(merged, null, 2)}\n`);
  } catch (err) {
    return {
      status: 500,
      payload: {
        ok: false,
        error: {
          code: "AGF_BRIDGE_PROJECT_PATCH_WRITE",
          message: `Failed to write project.json: ${(err as Error).message}`
        }
      }
    };
  }
  return {
    status: 200,
    payload: { ok: true, projectJsonPath, merged }
  };
}

/**
 * Plain recursive merge for JSON-only structures: objects are merged
 * key-by-key, arrays + primitives in `patch` replace the value in
 * `base`. Sufficient for the shadow tuner's "save settings" flow
 * which only writes a handful of leaf fields under `render.shadows`.
 */
export function deepMerge(
  base: Record<string, unknown>,
  patch: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [key, patchValue] of Object.entries(patch)) {
    const baseValue = out[key];
    if (
      patchValue !== null &&
      typeof patchValue === "object" &&
      !Array.isArray(patchValue) &&
      baseValue !== null &&
      typeof baseValue === "object" &&
      !Array.isArray(baseValue)
    ) {
      out[key] = deepMerge(baseValue as Record<string, unknown>, patchValue as Record<string, unknown>);
    } else {
      out[key] = patchValue;
    }
  }
  return out;
}

export type { ServerResponse };
