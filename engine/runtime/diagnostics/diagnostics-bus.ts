// Runtime diagnostics bus — structured, in-process event stream for warnings
// and errors that happen after the browser starts (asset load failures,
// network protocol issues, shader compile errors, etc.).
//
// Distinct from `engine check` diagnostics: those are pre-runtime data
// checks. This bus carries live events the agent can observe through
// `window.__agf.diagnostics()` and tests can assert against.

// S83 AGF-LOG-POLICY-DOC. `debug` + `trace` are opt-in (off by default)
// and routed through `createDebugLogger(name)`; tooling can still emit
// them directly when it has explicit consent from the host. See
// `docs/diagnostics-policy.md` for the full severity scale.
export const DIAGNOSTIC_SEVERITIES = ["info", "warning", "error", "debug", "trace"] as const;
export type DiagnosticSeverity = (typeof DIAGNOSTIC_SEVERITIES)[number];

export type RuntimeDiagnostic = {
  /** Monotonic id assigned by the bus, useful for test polling. */
  readonly id: number;
  /** Wall-clock seconds when the diagnostic was emitted. */
  readonly emittedAtSeconds: number;
  readonly severity: DiagnosticSeverity;
  /**
   * Stable machine-readable code, e.g. `AGF_RUNTIME_ASSET_LOAD_FAILED`.
   * Treat as part of the wire contract — never repurpose a value.
   */
  readonly code: string;
  /** Human-readable producer label, e.g. `asset-registry` / `ws-adapter`. */
  readonly source: string;
  /** Plain English description. */
  readonly message: string;
  /** Optional ECS entity id the diagnostic relates to. */
  readonly entityId?: string;
  /** Optional component name the diagnostic relates to. */
  readonly component?: string;
  /** Optional asset ref the diagnostic relates to. */
  readonly assetRef?: string;
  /**
   * Optional free-form structured data. Stays JSON-serializable so the bus
   * can be inspected from any context.
   */
  readonly details?: Record<string, unknown>;
};

export type EmitDiagnosticInput = Omit<RuntimeDiagnostic, "id" | "emittedAtSeconds"> & {
  /** Override the bus clock (test helper). */
  emittedAtSeconds?: number;
};

export type DiagnosticsListener = (diagnostic: RuntimeDiagnostic) => void;

export type DiagnosticsBus = {
  emit(input: EmitDiagnosticInput): RuntimeDiagnostic;
  /** Read-only snapshot of all retained diagnostics. */
  snapshot(): ReadonlyArray<RuntimeDiagnostic>;
  /**
   * S097 AGF-PROBE-DIAGNOSTICS-SINCE — read every retained diagnostic
   * with `emittedAtSeconds > threshold`. Threshold is wall-clock
   * seconds (the same units `emittedAtSeconds` uses). Use Infinity
   * (or any high value) to get an empty list; use 0 to get all.
   */
  snapshotSince(thresholdSeconds: number): ReadonlyArray<RuntimeDiagnostic>;
  /** Drop retained diagnostics; listeners stay subscribed. */
  clear(): void;
  /** Subscribe to live emissions. Returns a disposer. */
  subscribe(listener: DiagnosticsListener): () => void;
};

/**
 * S097 AGF-PROBE-DIAGNOSTICS-SINCE — pure filter helper exposed for
 * unit tests. Returns the strict suffix where emittedAtSeconds is
 * greater than the threshold. Defensive against non-finite thresholds
 * (treats them as 0 → return all).
 */
export function filterDiagnosticsSince(
  diagnostics: ReadonlyArray<RuntimeDiagnostic>,
  thresholdSeconds: number
): ReadonlyArray<RuntimeDiagnostic> {
  if (!Number.isFinite(thresholdSeconds)) return diagnostics;
  return diagnostics.filter((d) => d.emittedAtSeconds > thresholdSeconds);
}

export type DiagnosticsBusOptions = {
  /**
   * How many diagnostics to retain. Older ones roll off the ring buffer when
   * the cap is reached. Defaults to 200.
   */
  retain?: number;
  /** Monotonic clock for `emittedAtSeconds`. Defaults to `performance.now() / 1000`. */
  nowSeconds?: () => number;
};

// S83 AGF-LOG-DOCTOR-DIAGNOSTICS. Compact summary of a diagnostics
// snapshot — count by severity + top-N codes. Pure function so the
// engine doctor and CI scripts can both call it on a recorded buffer
// (JSON snapshot) without a live runtime.
export type DiagnosticsSummary = {
  total: number;
  bySeverity: Record<DiagnosticSeverity, number>;
  topCodes: Array<{ code: string; count: number }>;
};

export function summarizeDiagnostics(
  events: ReadonlyArray<RuntimeDiagnostic>,
  options: { topCodes?: number } = {}
): DiagnosticsSummary {
  const topN = Math.max(1, options.topCodes ?? 5);
  const bySeverity: Record<DiagnosticSeverity, number> = {
    info: 0,
    warning: 0,
    error: 0,
    debug: 0,
    trace: 0
  };
  const codeCounts = new Map<string, number>();
  for (const ev of events) {
    bySeverity[ev.severity] = (bySeverity[ev.severity] ?? 0) + 1;
    codeCounts.set(ev.code, (codeCounts.get(ev.code) ?? 0) + 1);
  }
  const topCodes = [...codeCounts.entries()]
    .map(([code, count]) => ({ code, count }))
    .sort((a, b) => (b.count - a.count) || a.code.localeCompare(b.code))
    .slice(0, topN);
  return { total: events.length, bySeverity, topCodes };
}

export function createDiagnosticsBus(options: DiagnosticsBusOptions = {}): DiagnosticsBus {
  const retain = Math.max(1, options.retain ?? 200);
  const nowSeconds =
    options.nowSeconds ??
    ((): number =>
      typeof performance !== "undefined" ? performance.now() / 1000 : Date.now() / 1000);

  const items: RuntimeDiagnostic[] = [];
  const listeners = new Set<DiagnosticsListener>();
  let nextId = 1;

  const emit: DiagnosticsBus["emit"] = (input) => {
    const diagnostic: RuntimeDiagnostic = {
      id: nextId,
      emittedAtSeconds: input.emittedAtSeconds ?? nowSeconds(),
      severity: input.severity,
      code: input.code,
      source: input.source,
      message: input.message,
      ...(input.entityId !== undefined ? { entityId: input.entityId } : {}),
      ...(input.component !== undefined ? { component: input.component } : {}),
      ...(input.assetRef !== undefined ? { assetRef: input.assetRef } : {}),
      ...(input.details !== undefined ? { details: input.details } : {})
    };
    nextId += 1;
    items.push(diagnostic);
    if (items.length > retain) {
      items.splice(0, items.length - retain);
    }
    for (const listener of listeners) {
      try {
        listener(diagnostic);
      } catch {
        // never let a misbehaving listener swallow other listeners
      }
    }
    return diagnostic;
  };

  return {
    emit,
    snapshot(): ReadonlyArray<RuntimeDiagnostic> {
      return items.slice();
    },
    snapshotSince(thresholdSeconds: number): ReadonlyArray<RuntimeDiagnostic> {
      return filterDiagnosticsSince(items, thresholdSeconds);
    },
    clear(): void {
      items.length = 0;
    },
    subscribe(listener): () => void {
      listeners.add(listener);
      return (): void => {
        listeners.delete(listener);
      };
    }
  };
}
