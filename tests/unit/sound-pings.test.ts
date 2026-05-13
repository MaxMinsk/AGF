import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSoundPings } from "../../examples/beacon-world/src/audio/sound-pings";

describe("Beacon World sound pings", () => {
  beforeEach(() => {
    // Vitest's default environment has no AudioContext — the module should
    // silently no-op, not throw. That property is what beacon-world relies
    // on when running headless under playtest / unit tests.
    delete (globalThis as { AudioContext?: unknown }).AudioContext;
  });

  afterEach(() => {
    delete (globalThis as { AudioContext?: unknown }).AudioContext;
  });

  it("no-ops when AudioContext is unavailable", () => {
    const pings = createSoundPings();
    expect(() => pings.play("pickup")).not.toThrow();
    expect(() => pings.play("deposit")).not.toThrow();
    expect(() => pings.play("damage")).not.toThrow();
    pings.dispose();
  });

  it("uses an injected AudioContext when available", () => {
    const startSpy = vi.fn();
    const stopSpy = vi.fn();
    const connectGain = { connect: vi.fn(() => ({ connect: vi.fn() })) };
    const gain = {
      gain: { value: 0, exponentialRampToValueAtTime: vi.fn() },
      connect: vi.fn(() => connectGain)
    };
    const oscillator = {
      type: "" as OscillatorType,
      frequency: { value: 0 },
      connect: vi.fn(() => gain),
      start: startSpy,
      stop: stopSpy
    };
    const ctx = {
      currentTime: 0,
      destination: {},
      createOscillator: vi.fn(() => oscillator),
      createGain: vi.fn(() => gain),
      close: vi.fn(() => Promise.resolve())
    };
    (globalThis as { AudioContext?: unknown }).AudioContext = function AudioContextStub() {
      return ctx;
    } as unknown;

    const pings = createSoundPings();
    pings.play("pickup");

    expect(ctx.createOscillator).toHaveBeenCalledOnce();
    expect(ctx.createGain).toHaveBeenCalledOnce();
    expect(startSpy).toHaveBeenCalledOnce();
    expect(stopSpy).toHaveBeenCalledOnce();
    expect(oscillator.type).toBe("triangle");
    expect(oscillator.frequency.value).toBe(880);

    pings.dispose();
    expect(ctx.close).toHaveBeenCalledOnce();
  });
});
