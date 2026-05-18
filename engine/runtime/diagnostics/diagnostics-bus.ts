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
  /** Drop retained diagnostics; listeners stay subscribed. */
  clear(): void;
  /** Subscribe to live emissions. Returns a disposer. */
  subscribe(listener: DiagnosticsListener): () => void;
};

export type DiagnosticsBusOptions = {
  /**
   * How many diagnostics to retain. Older ones roll off the ring buffer when
   * the cap is reached. Defaults to 200.
   */
  retain?: number;
  /** Monotonic clock for `emittedAtSeconds`. Defaults to `performance.now() / 1000`. */
  nowSeconds?: () => number;
};

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
