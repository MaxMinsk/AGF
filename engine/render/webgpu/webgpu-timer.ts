// S70 WEBGPU-gpu-timer. Wraps the WebGPU `GPUQuerySet { type: "timestamp" }`
// path that three.js exposes when the renderer is constructed with
// `trackTimestamp: true`. Three.js owns the query pool, begin/end writes
// (via `initTimestampQuery` in `WebGPUBackend`), and the readback buffer;
// this helper just throttles `resolveTimestampsAsync()` to once per N
// frames and surfaces the latest duration in milliseconds.
//
// Why throttle: the resolve walks the query pool and triggers a GPU→CPU
// readback. Doing it every frame defeats the point of having timestamps
// (and back-pressures the queue once enough resolves are inflight). One
// resolve every ~30 frames keeps the metric fresh (~2 Hz at 60 fps) while
// keeping the readback rate low.
//
// Why a separate class: keeps the WebGPU-specific import surface
// (`three/webgpu` types) out of the WebGL hot path so the lazy-import
// refactor (S70-2) can move it behind a dynamic boundary without touching
// the adapter's draw loop.

/**
 * Minimal subset of `WebGPURenderer` the timer needs. Typed structurally
 * so unit tests can drive it with a stub.
 */
export type WebGpuTimerHost = {
  resolveTimestampsAsync: (type?: string) => Promise<number | undefined>;
  readonly info: {
    readonly render: {
      readonly timestamp: number;
    };
  };
};

export class WebGpuTimer {
  private readonly host: WebGpuTimerHost;
  private readonly resolveEveryNFrames: number;
  private frameCounter = 0;
  private resolveInflight = false;
  private lastMs: number | undefined;

  constructor(host: WebGpuTimerHost, resolveEveryNFrames = 30) {
    this.host = host;
    this.resolveEveryNFrames = Math.max(1, resolveEveryNFrames);
  }

  /**
   * Returns the latest resolved GPU duration in milliseconds, or
   * `undefined` until the first successful resolve completes.
   */
  read(): number | undefined {
    return this.lastMs;
  }

  /**
   * Called once per frame after the renderer's `render()` invocation.
   * Triggers a throttled `resolveTimestampsAsync()`; the result lands in
   * `host.info.render.timestamp` (nanoseconds) which this method reads
   * back to milliseconds when the promise resolves.
   */
  onFrame(): void {
    this.frameCounter += 1;
    if (this.frameCounter < this.resolveEveryNFrames) return;
    if (this.resolveInflight) return;
    this.frameCounter = 0;
    this.resolveInflight = true;
    this.host.resolveTimestampsAsync("render").then(
      () => {
        const ns = this.host.info.render.timestamp;
        if (typeof ns === "number" && ns > 0) {
          this.lastMs = ns / 1_000_000;
        }
        this.resolveInflight = false;
      },
      () => {
        // Three.js throws when the query pool overflows or the feature is
        // not available; swallow + keep lastMs as-is so the metric simply
        // stays stale rather than crashing the frame loop.
        this.resolveInflight = false;
      }
    );
  }
}
