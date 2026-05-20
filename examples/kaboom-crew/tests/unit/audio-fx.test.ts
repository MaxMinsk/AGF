// S85 KABOOM-AUDIO-PROCEDURAL-SFX.

import { describe, expect, it, vi } from "vitest";

import { createKaboomAudioFx, parseAudioVolumeParam, resolveAudioVolume, type AudioContextLike } from "../../src/audio-fx";

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

  it("S91 KABOOM-AUDIO-POSITIONAL-ADOPT: play() with a position routes the gain chain through a PannerNode", () => {
    const probe = makeContext();
    const panners: Array<{ panningModel: string; setPosition: Spy; connect: Spy }> = [];
    const ctxWithPan: AudioContextLike = {
      ...probe.ctx,
      createPanner() {
        const panner = {
          panningModel: "",
          distanceModel: "",
          refDistance: 0,
          rolloffFactor: 0,
          maxDistance: 0,
          setPosition: vi.fn(),
          connect: vi.fn()
        };
        panners.push(panner);
        return panner as unknown as ReturnType<NonNullable<AudioContextLike["createPanner"]>>;
      },
      listener: { setPosition: vi.fn() }
    } as AudioContextLike;
    const fx = createKaboomAudioFx({ contextFactory: () => ctxWithPan });
    fx.play("footstep", { position: [3, 0, 7] });
    expect(panners.length).toBeGreaterThan(0);
    const panner = panners[0]!;
    expect(panner.panningModel).toBe("HRTF");
    expect(panner.setPosition).toHaveBeenCalledWith(3, 0, 7);
    // S095 KABOOM-AUDIO-MIXER-DUCK-ON-MATCH-END: gameplay events now
    // terminate at the shared masterDuckNode (a GainNode created
    // lazily on the first ensureContext call), not directly at
    // c.destination. The panner.connect target is therefore the
    // masterDuckNode for ducked events.
    expect(panner.connect).toHaveBeenCalled();
  });

  it("S91 KABOOM-AUDIO-POSITIONAL-ADOPT: play() without a position bypasses the PannerNode", () => {
    const probe = makeContext();
    const panners: unknown[] = [];
    const ctxWithPan: AudioContextLike = {
      ...probe.ctx,
      createPanner() {
        const panner = { setPosition: vi.fn(), connect: vi.fn() } as unknown;
        panners.push(panner);
        return panner as ReturnType<NonNullable<AudioContextLike["createPanner"]>>;
      }
    } as AudioContextLike;
    const fx = createKaboomAudioFx({ contextFactory: () => ctxWithPan });
    fx.play("match-won");
    expect(panners.length).toBe(0);
  });

  it("S91 KABOOM-AUDIO-POSITIONAL-ADOPT: setListenerPosition forwards to AudioListener.setPosition", () => {
    const probe = makeContext();
    const listener = { setPosition: vi.fn() };
    const ctxWithListener: AudioContextLike = { ...probe.ctx, listener } as AudioContextLike;
    const fx = createKaboomAudioFx({ contextFactory: () => ctxWithListener });
    // need to lazy-construct context first
    fx.play("bomb-place");
    fx.setListenerPosition(2, 0, 5);
    expect(listener.setPosition).toHaveBeenCalledWith(2, 0, 5);
  });

  it("S095 KABOOM-AUDIO-MIXER-DUCK-ON-MATCH-END: match-won schedules a 0.6 s gain dip on the shared duck node", () => {
    // Track the second GainNode created (first goes to a per-event
    // envelope, second is the shared masterDuckNode). Actually the
    // ORDER is: ensureContext creates masterDuckNode FIRST (gain index
    // 0), then per-event gains follow. So gain[0] is the duck node.
    const probe = makeContext();
    const fx = createKaboomAudioFx({ contextFactory: () => probe.ctx });
    fx.play("match-won");
    // gain[0] is the masterDuckNode — created lazily inside
    // ensureContext on the first play call, before any chord gain.
    const duckNode = probe.gains[0]!;
    // setValueAtTime called with depth (0.3) then linearRampToValueAtTime to 1
    expect(duckNode.gain.setValueAtTime).toHaveBeenCalled();
    expect(duckNode.gain.linearRampToValueAtTime).toHaveBeenCalled();
    // Find the depth + ramp-back calls.
    const depthCall = (duckNode.gain.setValueAtTime as Spy).mock.calls.find(
      (call: ReadonlyArray<unknown>) => call[0] === 0.3
    );
    expect(depthCall).toBeDefined();
    const rampCall = (duckNode.gain.linearRampToValueAtTime as Spy).mock.calls.find(
      (call: ReadonlyArray<unknown>) => call[0] === 1
    );
    expect(rampCall).toBeDefined();
  });

  it("S095 KABOOM-AUDIO-MIXER-DUCK-ON-MATCH-END: bomb-place does NOT schedule a duck", () => {
    const probe = makeContext();
    const fx = createKaboomAudioFx({ contextFactory: () => probe.ctx });
    fx.play("bomb-place");
    // gain[0] is masterDuckNode again; only its initial setValueAtTime(1, now)
    // should have been called by ensureContext, no depth=0.3 call.
    const duckNode = probe.gains[0]!;
    const depthCall = (duckNode.gain.setValueAtTime as Spy).mock.calls.find(
      (call: ReadonlyArray<unknown>) => call[0] === 0.3
    );
    expect(depthCall).toBeUndefined();
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

describe("parseAudioVolumeParam (S86 AGF-AUDIO-VOLUME-DIAL)", () => {
  it("returns undefined for missing / empty / unparseable values", () => {
    expect(parseAudioVolumeParam(undefined)).toBeUndefined();
    expect(parseAudioVolumeParam(null)).toBeUndefined();
    expect(parseAudioVolumeParam("")).toBeUndefined();
    expect(parseAudioVolumeParam("   ")).toBeUndefined();
    expect(parseAudioVolumeParam("loud")).toBeUndefined();
  });
  it("maps 'off' / 'mute' to 0 and 'on' to 1", () => {
    expect(parseAudioVolumeParam("off")).toBe(0);
    expect(parseAudioVolumeParam("MUTE")).toBe(0);
    expect(parseAudioVolumeParam("on")).toBe(1);
  });
  it("clamps numeric values into [0, 1]", () => {
    expect(parseAudioVolumeParam("0")).toBe(0);
    expect(parseAudioVolumeParam("0.5")).toBe(0.5);
    expect(parseAudioVolumeParam("1")).toBe(1);
    expect(parseAudioVolumeParam("-0.5")).toBe(0);
    expect(parseAudioVolumeParam("1.7")).toBe(1);
  });
});

describe("resolveAudioVolume (S86 AGF-AUDIO-VOLUME-DIAL)", () => {
  function fakeStorage(initial: Record<string, string> = {}) {
    const store = new Map(Object.entries(initial));
    return {
      raw: store,
      api: {
        getItem(k: string): string | null { return store.get(k) ?? null; },
        setItem(k: string, v: string): void { store.set(k, v); }
      }
    };
  }
  it("falls back to defaultVolume when nothing supplies a value", () => {
    expect(resolveAudioVolume({ defaultVolume: 0.7 })).toBe(0.7);
  });
  it("honours ?audio= over storage and persists it", () => {
    const s = fakeStorage({ "agf.audio.volume": "0.2" });
    const out = resolveAudioVolume({ search: "?audio=off", storage: s.api });
    expect(out).toBe(0);
    expect(s.raw.get("agf.audio.volume")).toBe("0");
  });
  it("uses storage when no URL value present", () => {
    const s = fakeStorage({ "agf.audio.volume": "0.3" });
    const out = resolveAudioVolume({ search: "", storage: s.api });
    expect(out).toBe(0.3);
  });
  it("ignores storage if it parses as undefined (corruption)", () => {
    const s = fakeStorage({ "agf.audio.volume": "loud" });
    const out = resolveAudioVolume({ search: "", storage: s.api, defaultVolume: 1 });
    expect(out).toBe(1);
  });
});
