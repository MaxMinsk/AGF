// S83 AGF-LOG-PER-SYSTEM-DEBUG. Named per-system debug logger.
//
// Engine systems opt into debug emission via:
//
//   const log = createDebugLogger("grid-movement");
//   ...
//   log.debug("AGF_GRIDMOVE_TICK", { moved, blocked });
//
// `createDebugLogger` returns no-ops unless the current AGF_DEBUG
// allowlist matches the logger's name. AGF_DEBUG accepts:
//   - unset / empty / "0" / "false"  — every logger no-ops.
//   - "*"                            — every logger emits.
//   - "grid-movement"                — only that logger emits.
//   - "grid-movement,batching"       — comma-separated allowlist.
//
// In the browser the value is read from `?agf_debug=…` on `location`
// at logger-creation time (or the global `__AGF_DEBUG__` override —
// useful for tests that don't want to touch the URL). In Node we read
// `process.env.AGF_DEBUG`.
//
// Emissions land on the diagnostics bus when supplied. Loggers
// without a bus (early bootstrap, plain Node tools) keep silent — we
// would rather drop a debug line than reach for `console.log`.

import type { DiagnosticsBus } from "./diagnostics-bus";

export type DebugLogger = {
  /** Logger source name (matches the AGF_DEBUG allowlist entry). */
  readonly source: string;
  /** True when the logger will actually emit. */
  readonly enabled: boolean;
  /** Emit a `debug`-severity diagnostic. */
  debug(code: string, message?: string, details?: Record<string, unknown>): void;
  /** Emit a `trace`-severity diagnostic. */
  trace(code: string, message?: string, details?: Record<string, unknown>): void;
};

export type CreateDebugLoggerOptions = {
  /** Diagnostics bus to emit through. When absent, the logger no-ops. */
  bus?: DiagnosticsBus;
  /** Override the AGF_DEBUG selector (test seam). */
  selector?: string;
};

/**
 * Parse an AGF_DEBUG selector into a matcher callback.
 * Exported for tests + tooling that want to mirror the matching rules.
 */
export function parseDebugSelector(raw: string | undefined): (name: string) => boolean {
  if (raw === undefined) return () => false;
  const trimmed = raw.trim();
  if (trimmed === "" || trimmed === "0" || trimmed.toLowerCase() === "false") return () => false;
  if (trimmed === "*") return () => true;
  const allow = new Set(
    trimmed
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
  );
  return (name: string) => allow.has(name);
}

function readSelector(override: string | undefined): string | undefined {
  if (override !== undefined) return override;
  const globals = globalThis as unknown as {
    __AGF_DEBUG__?: string;
    process?: { env?: Record<string, string | undefined> };
    location?: { search?: string };
  };
  if (typeof globals.__AGF_DEBUG__ === "string") return globals.__AGF_DEBUG__;
  if (globals.process?.env?.["AGF_DEBUG"] !== undefined) return globals.process.env["AGF_DEBUG"];
  const search = globals.location?.search;
  if (typeof search === "string" && search.length > 0) {
    try {
      const params = new URLSearchParams(search);
      const value = params.get("agf_debug");
      if (value !== null) return value;
    } catch {
      // No URL parser — fall through.
    }
  }
  return undefined;
}

const NOOP: DebugLogger = {
  source: "",
  enabled: false,
  debug(): void {
    // intentional no-op
  },
  trace(): void {
    // intentional no-op
  }
};

/**
 * Build a debug logger for a named source. Cheap to call — returns
 * the shared no-op when disabled, so cold paths cost only a Set
 * lookup against the selector.
 */
export function createDebugLogger(source: string, options: CreateDebugLoggerOptions = {}): DebugLogger {
  const match = parseDebugSelector(readSelector(options.selector));
  if (!match(source)) return { ...NOOP, source };
  const bus = options.bus;
  if (bus === undefined) return { ...NOOP, source, enabled: false };
  return {
    source,
    enabled: true,
    debug(code: string, message?: string, details?: Record<string, unknown>): void {
      bus.emit({ severity: "debug", code, source, message: message ?? code, ...(details !== undefined ? { details } : {}) });
    },
    trace(code: string, message?: string, details?: Record<string, unknown>): void {
      bus.emit({ severity: "trace", code, source, message: message ?? code, ...(details !== undefined ? { details } : {}) });
    }
  };
}
