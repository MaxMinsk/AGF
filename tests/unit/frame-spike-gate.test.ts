// S87 AGF-FRAME-SPIKE-UNIT-TEST.

import { describe, expect, it } from "vitest";

import { createFrameSpikeGate } from "../../engine/runtime/frame-spike-gate";

describe("createFrameSpikeGate (S87 AGF-FRAME-SPIKE-UNIT-TEST)", () => {
  it("returns false for sub-threshold ticks", () => {
    const gate = createFrameSpikeGate({ spikeMs: 50, cooldownMs: 1000 });
    expect(gate.observe(16, 0)).toBe(false);
    expect(gate.observe(49.9, 1000)).toBe(false);
  });

  it("returns true exactly once per cooldown window", () => {
    const gate = createFrameSpikeGate({ spikeMs: 50, cooldownMs: 1000 });
    expect(gate.observe(80, 0)).toBe(true);
    expect(gate.observe(80, 100)).toBe(false);
    expect(gate.observe(80, 999)).toBe(false);
    expect(gate.observe(80, 1000)).toBe(true);
    expect(gate.observe(80, 1500)).toBe(false);
    expect(gate.observe(80, 2000)).toBe(true);
  });

  it("spikeMs = 0 disables the gate entirely", () => {
    const gate = createFrameSpikeGate({ spikeMs: 0, cooldownMs: 1000 });
    expect(gate.observe(1000, 0)).toBe(false);
    expect(gate.observe(1_000_000, 5000)).toBe(false);
  });

  it("reset() drops the cooldown", () => {
    const gate = createFrameSpikeGate({ spikeMs: 50, cooldownMs: 10_000 });
    expect(gate.observe(80, 0)).toBe(true);
    expect(gate.observe(80, 100)).toBe(false);
    gate.reset();
    expect(gate.observe(80, 100)).toBe(true);
  });
});
