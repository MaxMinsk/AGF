// S59 GPU-timer-test. Regression coverage for the WebGL errors caught
// live in S58:
//   1. INVALID_ENUM: getQueryParameter — `ext.QUERY_RESULT_AVAILABLE` /
//      `ext.QUERY_RESULT` are `undefined` on the WebGL2 disjoint-timer
//      extension object; those constants live on the rendering context.
//   2. INVALID_OPERATION: endQuery: target query is not active —
//      previous fix tracked `pending !== undefined` for the end-query
//      gate, which left endQuery firing across a frame where begin()
//      bailed (previous query still in flight).
//
// The state machine exists separately from the renderer so it can be
// driven against a small mock context. The renderer itself stays under
// e2e coverage.

import { describe, expect, it, vi } from "vitest";
import { GpuTimer, type GpuTimerCtx, type GpuTimerExt } from "../../engine/render/gpu-timer";

const EXT: GpuTimerExt = {
  TIME_ELAPSED_EXT: 0x88bf,
  GPU_DISJOINT_EXT: 0x8fbb
};

function makeCtx(overrides: Partial<MockState> = {}): { ctx: GpuTimerCtx; state: MockState } {
  const state: MockState = {
    nextQueryId: 1,
    queries: new Map(),
    disjoint: false,
    activeTarget: null,
    ...overrides
  };
  const ctx: GpuTimerCtx = {
    QUERY_RESULT_AVAILABLE: 0x9302,
    QUERY_RESULT: 0x8866,
    createQuery: vi.fn((): WebGLQuery => {
      const id = state.nextQueryId++;
      const q = { __id: id } as unknown as WebGLQuery;
      state.queries.set(q, { ready: false, ns: 0, deleted: false });
      return q;
    }),
    beginQuery: vi.fn((target: number, q: WebGLQuery) => {
      if (state.activeTarget !== null) {
        throw new Error("INVALID_OPERATION: query already active");
      }
      const entry = state.queries.get(q);
      if (entry === undefined || entry.deleted) {
        throw new Error("INVALID_OPERATION: query not found");
      }
      state.activeTarget = target;
    }),
    endQuery: vi.fn((target: number) => {
      if (state.activeTarget === null) {
        throw new Error("INVALID_OPERATION: endQuery: target query is not active");
      }
      if (state.activeTarget !== target) {
        throw new Error("INVALID_OPERATION: endQuery: target mismatch");
      }
      state.activeTarget = null;
    }),
    deleteQuery: vi.fn((q: WebGLQuery | null) => {
      if (q === null) return;
      const entry = state.queries.get(q);
      if (entry !== undefined) entry.deleted = true;
    }),
    getQueryParameter: vi.fn((q: WebGLQuery, pname: number): unknown => {
      // Reject the historic bug — undefined parameter names mirror the
      // browser's INVALID_ENUM exactly.
      if (pname === undefined) {
        throw new Error("INVALID_ENUM: getQueryParameter invalid pname");
      }
      const entry = state.queries.get(q);
      if (entry === undefined) {
        throw new Error("INVALID_OPERATION: unknown query");
      }
      if (pname === ctx.QUERY_RESULT_AVAILABLE) return entry.ready;
      if (pname === ctx.QUERY_RESULT) return entry.ns;
      throw new Error(`INVALID_ENUM: unexpected pname 0x${pname.toString(16)}`);
    }),
    getParameter: vi.fn((pname: number): unknown => {
      if (pname === EXT.GPU_DISJOINT_EXT) return state.disjoint;
      throw new Error(`INVALID_ENUM: unexpected pname 0x${pname.toString(16)}`);
    })
  };
  return { ctx, state };
}

type MockState = {
  nextQueryId: number;
  queries: Map<WebGLQuery, { ready: boolean; ns: number; deleted: boolean }>;
  disjoint: boolean;
  activeTarget: number | null;
};

describe("GpuTimer", () => {
  it("uses core WebGL2 constants for getQueryParameter (no INVALID_ENUM)", () => {
    const { ctx } = makeCtx();
    const timer = new GpuTimer(ctx, EXT);
    expect(() => {
      timer.begin();
      timer.end();
    }).not.toThrow();
    // getQueryParameter would only be called on the second begin(); first
    // begin had no prior query to poll.
    expect(ctx.getQueryParameter).not.toHaveBeenCalled();
    // But beginQuery + endQuery must both have been called against the
    // extension's TIME_ELAPSED_EXT target.
    expect(ctx.beginQuery).toHaveBeenCalledWith(EXT.TIME_ELAPSED_EXT, expect.anything());
    expect(ctx.endQuery).toHaveBeenCalledWith(EXT.TIME_ELAPSED_EXT);
  });

  it("end() is a no-op when begin() did NOT open a new query (regression: dangling endQuery)", () => {
    const { ctx, state } = makeCtx();
    const timer = new GpuTimer(ctx, EXT);

    // Frame 1: open + close
    expect(timer.begin()).toBe(true);
    timer.end();
    // Frame 2: previous query NOT ready → begin() should bail without
    // starting a new one, and end() must therefore not call endQuery.
    const opened = timer.begin();
    expect(opened).toBe(false);
    expect(ctx.beginQuery).toHaveBeenCalledTimes(1); // only frame 1
    timer.end();
    expect(ctx.endQuery).toHaveBeenCalledTimes(1); // only frame 1
    // No INVALID_OPERATION thrown by the mock — would happen if we
    // attempted endQuery without a matching beginQuery.
    expect(state.activeTarget).toBeNull();
  });

  it("reads elapsed time once the previous query is ready", () => {
    const { ctx, state } = makeCtx();
    const timer = new GpuTimer(ctx, EXT);

    // Frame 1
    timer.begin();
    timer.end();
    const [q1] = [...state.queries.keys()];
    // Mark frame 1's query ready with a 4 ms result (4 ms in ns).
    state.queries.get(q1!)!.ready = true;
    state.queries.get(q1!)!.ns = 4_000_000;
    expect(timer.read()).toBeUndefined();

    // Frame 2: begin() polls frame 1's query, finds it ready, reads it,
    // then opens a new query.
    timer.begin();
    timer.end();
    expect(timer.read()).toBeCloseTo(4, 3);
  });

  it("discards the result when GPU_DISJOINT_EXT was true (clock changed mid-query)", () => {
    const { ctx, state } = makeCtx();
    const timer = new GpuTimer(ctx, EXT);

    // Frame 1 — produce a result, then mark disjoint so frame 2 throws
    // it out.
    timer.begin();
    timer.end();
    const [q1] = [...state.queries.keys()];
    state.queries.get(q1!)!.ready = true;
    state.queries.get(q1!)!.ns = 9_000_000;
    state.disjoint = true;

    timer.begin();
    timer.end();
    expect(timer.read()).toBeUndefined();
  });

  it("never overlaps queries on the single TIME_ELAPSED target", () => {
    const { ctx, state } = makeCtx();
    const timer = new GpuTimer(ctx, EXT);

    // Drive 10 frames where the previous query is never ready (long GPU
    // tail). The mock would throw `INVALID_OPERATION: query already
    // active` if we ever issued an overlapping beginQuery.
    for (let i = 0; i < 10; i++) {
      timer.begin();
      timer.end();
      expect(state.activeTarget).toBeNull();
    }
    expect(ctx.beginQuery).toHaveBeenCalledTimes(1); // only frame 1
    expect(ctx.endQuery).toHaveBeenCalledTimes(1);
  });

  it("returns false from begin() when the WebGL driver refuses createQuery", () => {
    const { ctx } = makeCtx();
    (ctx.createQuery as ReturnType<typeof vi.fn>).mockReturnValueOnce(null);
    const timer = new GpuTimer(ctx, EXT);
    expect(timer.begin()).toBe(false);
    timer.end(); // no-op
    expect(ctx.beginQuery).not.toHaveBeenCalled();
    expect(ctx.endQuery).not.toHaveBeenCalled();
  });
});
