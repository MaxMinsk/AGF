// S87 AGF-FRAME-SPIKE-UNIT-TEST.
//
// Pure side-effect-free spike detector pulled out of start.ts so it
// can be unit-tested without spinning the runtime. The runtime calls
// `gate.observe(tickMs, nowMs)` once per animation frame; the gate
// returns `true` iff the caller should emit an AGF_FRAME_SPIKE event
// for this tick.
//
// Stateful: keeps the timestamp of the last accepted emission so a
// stuck frame doesn't spam the bus.

export type FrameSpikeGate = {
  /**
   * Returns true exactly when the caller should emit an
   * AGF_FRAME_SPIKE event for the just-observed tick. The caller
   * supplies the wall-clock timestamp so tests can drive a fake
   * clock.
   */
  observe(tickMs: number, nowMs: number): boolean;
  /** Drop the cooldown state (rarely useful — pre-test cleanup). */
  reset(): void;
};

export type FrameSpikeGateOptions = {
  /** Tick total threshold in ms; observe() returns false when set to 0. */
  spikeMs: number;
  /** Minimum gap between accepted emissions, ms. */
  cooldownMs: number;
};

export function createFrameSpikeGate(options: FrameSpikeGateOptions): FrameSpikeGate {
  let lastEmittedAt = -Infinity;
  return {
    observe(tickMs: number, nowMs: number): boolean {
      if (options.spikeMs <= 0) return false;
      if (tickMs <= options.spikeMs) return false;
      if (nowMs - lastEmittedAt < options.cooldownMs) return false;
      lastEmittedAt = nowMs;
      return true;
    },
    reset(): void {
      lastEmittedAt = -Infinity;
    }
  };
}
