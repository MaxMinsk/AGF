// S59 GPU-timer-test (originally surfaced as console errors in S58):
// EXT_disjoint_timer_query_webgl2 driver requires us to:
//   1. issue one TIME_ELAPSED query at a time
//   2. read availability + result via core WebGL2 enums
//      (gl.QUERY_RESULT_AVAILABLE / gl.QUERY_RESULT), NOT off the
//      extension object — that's what produced the original INVALID_ENUM
//      regression
//   3. balance every beginQuery with exactly one endQuery
//
// This state machine lives outside the WebGLRenderer-bound adapter so it
// can be unit-tested against a small mock context. The adapter wraps an
// instance; tests can drive it directly.

export type GpuTimerCtx = Pick<
  WebGL2RenderingContext,
  | "createQuery"
  | "beginQuery"
  | "endQuery"
  | "deleteQuery"
  | "getQueryParameter"
  | "getParameter"
> & {
  readonly QUERY_RESULT_AVAILABLE: number;
  readonly QUERY_RESULT: number;
};

export type GpuTimerExt = {
  readonly TIME_ELAPSED_EXT: number;
  readonly GPU_DISJOINT_EXT: number;
};

export class GpuTimer {
  private readonly gl: GpuTimerCtx;
  private readonly ext: GpuTimerExt;
  private pending: WebGLQuery | undefined;
  /**
   * True only between a successful `begin()` and its matching `end()`.
   * Decouples "we have a query waiting for result" from "we just started
   * a NEW query this frame" — the bug in the S58-era impl was using a
   * single field for both, so end() called endQuery against an old
   * already-ended query whenever begin() bailed.
   */
  private active = false;
  private lastMs: number | undefined;

  constructor(gl: GpuTimerCtx, ext: GpuTimerExt) {
    this.gl = gl;
    this.ext = ext;
  }

  /**
   * Reads the latest GPU-side elapsed-time measurement in milliseconds.
   * `undefined` until at least one query has come back ready and not
   * been invalidated by a disjoint event.
   */
  read(): number | undefined {
    return this.lastMs;
  }

  /**
   * Open a TIME_ELAPSED query around the upcoming render. First polls
   * the previous query (if any) for availability; on success, stores
   * its elapsed time. On disjoint event, drops the result without
   * updating. If the previous query is still in-flight, skips opening
   * a new one (overlapping queries aren't allowed on a single target).
   *
   * Returns true if a new query was opened (paired `end()` must run).
   */
  begin(): boolean {
    if (this.pending !== undefined) {
      // `QUERY_RESULT*` are core WebGL2 constants on the rendering
      // context, NOT on the disjoint-timer extension object.
      const ready = this.gl.getQueryParameter(this.pending, this.gl.QUERY_RESULT_AVAILABLE) as boolean;
      const disjoint = this.gl.getParameter(this.ext.GPU_DISJOINT_EXT) as boolean;
      if (ready && !disjoint) {
        const ns = this.gl.getQueryParameter(this.pending, this.gl.QUERY_RESULT) as number;
        this.lastMs = ns / 1_000_000;
        this.gl.deleteQuery(this.pending);
        this.pending = undefined;
      } else if (disjoint) {
        this.gl.deleteQuery(this.pending);
        this.pending = undefined;
        this.lastMs = undefined;
      }
      if (this.pending !== undefined) return false;
    }
    const query = this.gl.createQuery();
    if (query === null) return false;
    this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT, query);
    this.pending = query;
    this.active = true;
    return true;
  }

  /**
   * Closes the query opened by the matching `begin()`. No-op if begin()
   * returned false (no new query was started) — the previous frame's
   * endQuery already balanced its beginQuery.
   */
  end(): void {
    if (!this.active) return;
    this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);
    this.active = false;
  }
}
