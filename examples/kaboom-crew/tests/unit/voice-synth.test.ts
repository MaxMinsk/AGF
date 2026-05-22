// S109 KABOOM-PROCEDURAL-VOCAL-SYNTH — pure-helper + synth wiring tests.

import { describe, expect, it } from "vitest";

import {
  VOICE_SLOT_PATCHES,
  emitVoice,
  voiceParamsFromSeed,
  type VoiceColour
} from "../../src/voice-synth";

// ---- pure helper ----------------------------------------------------------

describe("voiceParamsFromSeed (S109 pure helper)", () => {
  it("is deterministic — same seed → identical voice colour", () => {
    expect(voiceParamsFromSeed("alice")).toEqual(voiceParamsFromSeed("alice"));
  });

  it("differs across distinct seeds", () => {
    const a = voiceParamsFromSeed("alice");
    const b = voiceParamsFromSeed("bob");
    // Some knob has to disagree — they're independent streams.
    const same =
      a.basePitchHz === b.basePitchHz &&
      a.formantF1Hz === b.formantF1Hz &&
      a.formantF2Hz === b.formantF2Hz &&
      a.formantQ === b.formantQ;
    expect(same).toBe(false);
  });

  it("every knob lands in the documented range", () => {
    const seeds = ["a", "bot.1", "player.1", "x", "remote.alice", "ZZZ"];
    for (const seed of seeds) {
      const v = voiceParamsFromSeed(seed);
      expect(v.basePitchHz).toBeGreaterThanOrEqual(90);
      expect(v.basePitchHz).toBeLessThanOrEqual(260);
      expect(v.formantF1Hz).toBeGreaterThanOrEqual(300);
      expect(v.formantF1Hz).toBeLessThanOrEqual(900);
      expect(v.formantF2Hz).toBeGreaterThanOrEqual(1200);
      expect(v.formantF2Hz).toBeLessThanOrEqual(2400);
      expect(v.formantQ).toBeGreaterThanOrEqual(4);
      expect(v.formantQ).toBeLessThanOrEqual(12);
      expect(v.vibratoHz).toBeGreaterThanOrEqual(0);
      expect(v.vibratoHz).toBeLessThanOrEqual(8);
      expect(v.vibratoDepth).toBeGreaterThanOrEqual(0);
      expect(v.vibratoDepth).toBeLessThanOrEqual(0.04);
      expect(v.noiseMix).toBeGreaterThanOrEqual(0);
      expect(v.noiseMix).toBeLessThanOrEqual(0.4);
    }
  });
});

describe("VOICE_SLOT_PATCHES (S109)", () => {
  it("has all five slots", () => {
    const expected: ReadonlyArray<keyof typeof VOICE_SLOT_PATCHES> = [
      "place-bomb",
      "hit",
      "pickup",
      "death",
      "victory"
    ];
    for (const slot of expected) expect(VOICE_SLOT_PATCHES[slot]).toBeDefined();
  });

  it("every slot's attackS + decayS is close to (within 10%) durationS — sanity that the patch shape is plausible", () => {
    for (const [slot, patch] of Object.entries(VOICE_SLOT_PATCHES)) {
      const sum = patch.attackS + patch.decayS;
      expect(sum).toBeGreaterThan(patch.durationS * 0.9);
      expect(sum).toBeLessThanOrEqual(patch.durationS * 1.1);
      void slot;
    }
  });

  it("victory has a 3-step pitch sequence (rising arpeggio)", () => {
    const v = VOICE_SLOT_PATCHES.victory;
    expect(v.pitchSteps).toBeDefined();
    expect(v.pitchSteps!.length).toBe(3);
    expect(v.pitchSteps![0]!.pitchMul).toBe(1);
    expect(v.pitchSteps![2]!.pitchMul).toBeGreaterThan(v.pitchSteps![0]!.pitchMul);
  });

  it("death sweeps pitch downward (endMul < startMul)", () => {
    const d = VOICE_SLOT_PATCHES.death;
    expect(d.pitchAutomation.endMul).toBeLessThan(d.pitchAutomation.startMul);
  });

  it("pickup sweeps pitch upward (endMul > startMul)", () => {
    const p = VOICE_SLOT_PATCHES.pickup;
    expect(p.pitchAutomation.endMul).toBeGreaterThan(p.pitchAutomation.startMul);
  });
});

// ---- synth wiring (stubbed Web Audio) ------------------------------------

type StubNode = { name: string; connect: (n: StubNode) => void; connected: StubNode[] };

function makeStubContext() {
  let nodes: StubNode[] = [];
  const make = (name: string): StubNode => {
    const n = { name, connect(t: StubNode) { this.connected.push(t); }, connected: [] };
    nodes.push(n);
    return n;
  };
  let startedOsc = 0;
  let startedNoise = 0;
  let createdBuffers = 0;
  let createdFilters = 0;
  const ctx = {
    sampleRate: 48000,
    currentTime: 5,
    state: "running",
    destination: make("destination"),
    createGain(): StubNode & { gain: any } {
      const n = make("gain") as StubNode & { gain: any };
      const op = { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} };
      (n as any).gain = op;
      return n;
    },
    createOscillator(): StubNode & { frequency: any; start: () => void; stop: () => void; type: string } {
      const n = make("oscillator") as StubNode & any;
      n.frequency = { setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {} };
      n.start = () => { startedOsc += 1; };
      n.stop = () => {};
      n.type = "";
      return n;
    },
    createBufferSource(): StubNode & { buffer: any; start: () => void; stop: () => void } {
      const n = make("buffer-source") as StubNode & any;
      n.buffer = null;
      n.start = () => { startedNoise += 1; };
      n.stop = () => {};
      return n;
    },
    createBuffer(_ch: number, length: number) {
      createdBuffers += 1;
      const arr = new Float32Array(length);
      return { getChannelData: () => arr };
    },
    createBiquadFilter() {
      createdFilters += 1;
      const n = make("bandpass") as StubNode & any;
      n.type = "";
      n.frequency = { setValueAtTime() {} };
      n.Q = { setValueAtTime() {} };
      return n;
    }
  };
  return {
    ctx,
    stats() {
      return {
        nodes: nodes.length,
        startedOsc,
        startedNoise,
        createdBuffers,
        createdFilters
      };
    },
    reset() {
      nodes = [];
      startedOsc = 0;
      startedNoise = 0;
      createdBuffers = 0;
      createdFilters = 0;
    }
  };
}

describe("emitVoice (S109 synth wiring)", () => {
  it("creates an oscillator + 3 bandpass filters + envelope gain for every slot", () => {
    const { ctx, stats, reset } = makeStubContext();
    const colour = voiceParamsFromSeed("alice");
    for (const slot of ["place-bomb", "hit", "pickup", "death", "victory"] as const) {
      reset();
      emitVoice(ctx as any, colour, slot, { masterGain: 0.5, terminal: ctx.destination as any });
      const s = stats();
      expect(s.startedOsc).toBe(1); // carrier
      expect(s.createdFilters).toBe(3); // F1 + F2 + F3
    }
  });

  it("with noiseMix=0 does not allocate a noise buffer", () => {
    const colour: VoiceColour = { ...voiceParamsFromSeed("alice"), noiseMix: 0 };
    const { ctx, stats } = makeStubContext();
    emitVoice(ctx as any, colour, "hit", { masterGain: 0.5, terminal: ctx.destination as any });
    expect(stats().createdBuffers).toBe(0);
    expect(stats().startedNoise).toBe(0);
  });

  it("with noiseMix>0 allocates a noise buffer + starts a buffer source", () => {
    const colour: VoiceColour = { ...voiceParamsFromSeed("alice"), noiseMix: 0.3 };
    const { ctx, stats } = makeStubContext();
    emitVoice(ctx as any, colour, "hit", { masterGain: 0.5, terminal: ctx.destination as any });
    expect(stats().createdBuffers).toBe(1);
    expect(stats().startedNoise).toBe(1);
  });
});
