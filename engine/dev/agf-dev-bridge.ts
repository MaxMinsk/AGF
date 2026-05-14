// AGF dev-server bridge (M15-a scaffold).
//
// A Vite plugin (`apply: "serve"`) that registers `/__agf/*` HTTP middleware
// on the dev server. Future stories build on this scaffold:
//   - `M15-b` opens a WS at `/__agf/ws` for page ↔ server RPC.
//   - `M15-c` adds pull endpoints (`/snapshot`, `/diagnostics`, ...).
//   - `M15-d` adds `/bug-report` + the bug-report schema.
//   - `M15-g` adds the SSE event stream.
//
// Sprint 31 / `M15-a`: scaffold + a single `GET /__agf/health` endpoint that
// lets an agent confirm the bridge is alive before exercising richer routes.
// Production builds explicitly exclude this plugin (`apply: "serve"`).

import type { Plugin } from "vite";

export type DevBridgeOptions = {
  /**
   * Override the version string returned by `/__agf/health`. Defaults to the
   * literal `"0.1.0-m15-a"` so future endpoint changes can be detected.
   */
  version?: string;
};

export const DEV_BRIDGE_VERSION = "0.1.0-m15-a";
export const DEV_BRIDGE_PATH_PREFIX = "/__agf/";

export function agfDevBridge(options: DevBridgeOptions = {}): Plugin {
  const version = options.version ?? DEV_BRIDGE_VERSION;

  return {
    name: "agf-dev-bridge",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(DEV_BRIDGE_PATH_PREFIX, (req, res, next) => {
        if (req.method !== "GET" && req.method !== "POST") {
          next();
          return;
        }
        const url = new URL(req.url ?? "", "http://localhost");
        const route = url.pathname;

        if (route === "/health" && req.method === "GET") {
          respondJson(res, 200, { ok: true, version });
          return;
        }

        // Any other path under `/__agf/` is an agent miscall — return a
        // structured 404 instead of falling through to Vite's SPA index
        // (which would silently serve HTML and confuse RPC callers).
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

function respondJson(res: ServerResponseLike, status: number, payload: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(`${JSON.stringify(payload)}\n`);
}

type ServerResponseLike = {
  statusCode: number;
  setHeader(name: string, value: string): unknown;
  end(payload: string): unknown;
};
