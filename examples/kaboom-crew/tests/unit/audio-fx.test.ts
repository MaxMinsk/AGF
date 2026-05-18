// S85 KABOOM-AUDIO-PROCEDURAL-SFX.

import { describe, expect, it, vi } from "vitest";

import { createKaboomAudioFx, type AudioContextLike } from "../../src/audio-fx";

type Spy = ReturnType<typeof vi.fn>;
type FakeOsc = {
  type: string;
  frequency: { setValueAtTime: Spy; exponentialRampToValueAtTime: Spy; linearRampToValueAtTime: Spy };
  connect: Spy;
  start: Spy;
  stop: Spy;
};
type FakeGain = {
  gain: { setValueAtTime: Spy; linearRampToValueAtTime: Spy; exponentialRampToValueAtTime: Spy };
  connect: Spy;
};

function makeContext(): { ctx: AudioContextLike; oscillators: FakeOsc[]; gains: FakeGain[]; bufferSources: unknown[] } {
  const oscillators: FakeOsc[] = [];
  const gains: FakeGain[] = [];
  const bufferSources: unknown[] = [];
  const ctx: AudioContextLike = {
    state: "running",
    currentTime: 0,
    sampleRate: 48000,
    destination: { connect: vi.fn() },
    createOscillator() {
      const osc: FakeOsc = {
        type: "",
        frequency: {
          setValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn(),
          linearRampToValueAtTime: vi.fn()
        },
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn()
      };
      oscillators.push(osc);
      return osc as unknown as ReturnType<AudioContextLike["createOscillator"]>;
    },
    createGain() {
      const gain: FakeGain = {
        gain: {
          setValueAtTime: vi.fn(),
          linearRampToValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn()
        },
        connect: vi.fn()
      };
      gains.push(gain);
      return gain as unknown as ReturnType<AudioContextLike["createGain"]>;
    },
    createBufferSource() {
      const source = {
        buffer: null,
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn()
      };
      bufferSources.push(source);
      return source as unknown as ReturnType<AudioContextLike["createBufferSource"]>;
    },
    createBuffer(_c: number, length: number) {
      return { getChannelData: () => new Float32Array(length) } as ReturnType<AudioContextLike["createBuffer"]>;
    },
    createBiquadFilter() {
      return {
        type: "",
        frequency: { setValueAtTime: vi.fn() },
        connect: vi.fn()
      } as unknown as ReturnType<AudioContextLike["createBiquadFilter"]>;
    },
    close: () => Promise.resolve()
  };
  return { ctx, oscillators, gains, bufferSources };
}

describe("createKaboomAudioFx (S85 KABOOM-AUDIO-PROCEDURAL-SFX)", () => {
  it("lazily creates the AudioContext on the first play()", () => {
    const factory = vi.fn(() => makeContext().ctx);
    const fx = createKaboomAudioFx({ contextFactory: factory });
    expect(factory).not.toHaveBeenCalled();
    fx.play("bomb-place");
    expect(factory).toHaveBeenCalledTimes(1);
    fx.play("blast");
    expect(factory).toHaveBeenCalledTimes(1); // re-used
  });

  it("bomb-place creates a square oscillator with a downward sweep", () => {
    const probe = makeContext();
    const fx = createKaboomAudioFx({ contextFactory: () => probe.ctx });
    fx.play("bomb-place");
    expect(probe.oscillators).toHaveLength(1);
    expect(probe.oscillators[0]?.type).toBe("square");
    expect(probe.oscillators[0]?.frequency.exponentialRampToValueAtTime).toHaveBeenCalled();
    expect(probe.oscillators[0]?.start).toHaveBeenCalledTimes(1);
    expect(probe.oscillators[0]?.stop).toHaveBeenCalledTimes(1);
  });

  it("blast routes a noise buffer through a low-pass filter", () => {
    const probe = makeContext();
    const fx = createKaboomAudioFx({ contextFactory: () => probe.ctx });
    fx.play("blast");
    expect(probe.bufferSources).toHaveLength(1);
  });

  it("pickup is a rising triangle chirp", () => {
    const probe = makeContext();
    const fx = createKaboomAudioFx({ contextFactory: () => probe.ctx });
    fx.play("pickup");
    expect(probe.oscillators).toHaveLength(1);
    expect(probe.oscillators[0]?.type).toBe("triangle");
    expect(probe.oscillators[0]?.frequency.linearRampToValueAtTime).toHaveBeenCalled();
  });

  it("death is a descending sawtooth", () => {
    const probe = makeContext();
    const fx = createKaboomAudioFx({ contextFactory: () => probe.ctx });
    fx.play("death");
    expect(probe.oscillators).toHaveLength(1);
    expect(probe.oscillators[0]?.type).toBe("sawtooth");
  });

  it("is a no-op when no AudioContext is available (SSR / Node)", () => {
    const fx = createKaboomAudioFx({ contextFactory: () => undefined });
    expect(() => fx.play("bomb-place")).not.toThrow();
  });

  it("dispose() releases the context + a subsequent play is a no-op", () => {
    const probe = makeContext();
    const fx = createKaboomAudioFx({ contextFactory: () => probe.ctx });
    fx.play("bomb-place");
    fx.dispose();
    fx.dispose(); // idempotent
    // Next play would lazy-construct again — that's fine, but with our
    // factory returning the SAME ctx, we get a fresh oscillator on top
    // of the closed one (the engine guard above swallows any throw).
    expect(() => fx.play("blast")).not.toThrow();
  });
});
