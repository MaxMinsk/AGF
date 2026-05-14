import { describe, expect, it } from "vitest";
import {
  agfDevBridge,
  DEV_BRIDGE_VERSION
} from "../../engine/dev/agf-dev-bridge";

describe("agfDevBridge", () => {
  it("is gated to apply: 'serve' so production builds exclude it", () => {
    const plugin = agfDevBridge();
    expect(plugin.name).toBe("agf-dev-bridge");
    expect(plugin.apply).toBe("serve");
  });

  it("exposes a stable version string", () => {
    expect(typeof DEV_BRIDGE_VERSION).toBe("string");
    expect(DEV_BRIDGE_VERSION.length).toBeGreaterThan(0);
  });

  it("registers GET /__agf/health on the Vite middleware stack", async () => {
    const plugin = agfDevBridge({ version: "test-version" });
    let registeredPrefix: string | undefined;
    type Handler = (req: unknown, res: unknown, next: () => void) => void;
    let handler: Handler | undefined;
    const fakeServer = {
      middlewares: {
        use(prefix: string, fn: Handler): void {
          registeredPrefix = prefix;
          handler = fn;
        }
      }
    };

    // `configureServer` is typed as a ServerHook by Vite. Cast to a loose
    // shape so we can drive it from the test without spinning up Vite.
    const configure = plugin.configureServer as unknown as (
      server: typeof fakeServer
    ) => void;
    configure(fakeServer);

    expect(registeredPrefix).toBe("/__agf/");
    expect(handler).toBeDefined();

    let status = 0;
    let body = "";
    const headers = new Map<string, string>();
    const fakeReq = { method: "GET", url: "/health" };
    const fakeRes = {
      statusCode: 0,
      setHeader(name: string, value: string): void {
        headers.set(name, value);
      },
      end(payload: string): void {
        status = (fakeRes as { statusCode: number }).statusCode;
        body = payload;
      }
    };
    let nextCalled = false;
    (handler as Handler)(fakeReq, fakeRes, () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(false);
    expect(status).toBe(200);
    expect(headers.get("Content-Type")).toMatch(/json/);
    expect(JSON.parse(body)).toEqual({ ok: true, version: "test-version", pages: [] });
  });

  it("responds with structured 404 for unknown /__agf/* routes", () => {
    const plugin = agfDevBridge();
    type Handler = (req: unknown, res: unknown, next: () => void) => void;
    let handler: Handler | undefined;
    const fakeServer = {
      middlewares: {
        use(_prefix: string, fn: Handler): void {
          handler = fn;
        }
      }
    };
    const configure = plugin.configureServer as unknown as (server: typeof fakeServer) => void;
    configure(fakeServer);

    let status = 0;
    let body = "";
    const fakeRes = {
      statusCode: 0,
      setHeader: () => undefined,
      end(payload: string): void {
        status = (fakeRes as { statusCode: number }).statusCode;
        body = payload;
      }
    };
    let nextCalled = false;
    (handler as Handler)(
      { method: "GET", url: "/unknown-route" },
      fakeRes,
      () => {
        nextCalled = true;
      }
    );
    expect(nextCalled).toBe(false);
    expect(status).toBe(404);
    expect(JSON.parse(body)).toMatchObject({
      ok: false,
      error: { code: "AGF_BRIDGE_ROUTE_UNKNOWN" }
    });
  });

  it("falls through (next()) when method is neither GET nor POST", () => {
    const plugin = agfDevBridge();
    type Handler = (req: unknown, res: unknown, next: () => void) => void;
    let handler: Handler | undefined;
    const fakeServer = {
      middlewares: {
        use(_prefix: string, fn: Handler): void {
          handler = fn;
        }
      }
    };
    const configure = plugin.configureServer as unknown as (server: typeof fakeServer) => void;
    configure(fakeServer);

    let nextCalled = false;
    (handler as Handler)(
      { method: "PUT", url: "/health" },
      { statusCode: 0, setHeader: () => undefined, end: () => undefined },
      () => {
        nextCalled = true;
      }
    );
    expect(nextCalled).toBe(true);
  });
});
