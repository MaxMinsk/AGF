// S110 KABOOM-PROCEDURAL-CV-BABBLE-VOC — babble synth unit tests.

import { describe, expect, it } from "vitest";

import {
  PHRASE_PATCHES,
  emitVoice,
  planUtterance,
  utteranceDurationS,
  voiceParamsFromSeed,
  type VoiceColour
} from "../../src/voice-synth";

// ---- voice colour ---------------------------------------------------------

describe("voiceParamsFromSeed (S110 10-knob)", () => {
  it("is deterministic — same seed → identical voice colour", () => {
    expect(voiceParamsFromSeed("alice")).toEqual(voiceParamsFromSeed("alice"));
  });

  it("differs across distinct seeds", () => {
    const a = voiceParamsFromSeed("alice");
    const b = voiceParamsFromSeed("bob");
    expect(a).not.toEqual(b);
  });

  it("populates all 10 knobs in their documented ranges", () => {
    for (const seed of ["a", "bot.1", "player.1", "remote.alice", "ZZZ"]) {
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
      // S110 — three new knobs.
      expect(v.phrasePaceMultiplier).toBeGreaterThanOrEqual(0.6);
      expect(v.phrasePaceMultiplier).toBeLessThanOrEqual(1.4);
      expect(v.consonantStyle).toBeGreaterThanOrEqual(0);
      expect(v.consonantStyle).toBeLessThanOrEqual(1);
      expect(v.vowelDriftAmount).toBeGreaterThanOrEqual(0);
      expect(v.vowelDriftAmount).toBeLessThanOrEqual(0.3);
    }
  });
});

// ---- phrase patches -------------------------------------------------------

describe("PHRASE_PATCHES (S110)", () => {
  it("has all five slots", () => {
    for (const slot of ["place-bomb", "hit", "pickup", "death", "victory"] as const) {
      expect(PHRASE_PATCHES[slot]).toBeDefined();
    }
  });

  it("syllable counts match the design override", () => {
    expect(PHRASE_PATCHES["place-bomb"].pitchContour.length).toBe(3);
    expect(PHRASE_PATCHES.hit.pitchContour.length).toBe(2);
    expect(PHRASE_PATCHES.pickup.pitchContour.length).toBe(3);
    expect(PHRASE_PATCHES.death.pitchContour.length).toBe(4);
    expect(PHRASE_PATCHES.victory.pitchContour.length).toBe(5);
  });

  it("pitchContour length matches vowelDeltas length for every slot", () => {
    for (const [slot, patch] of Object.entries(PHRASE_PATCHES)) {
      expect(patch.pitchContour.length).toBe(patch.vowelDeltas.length);
      void slot;
    }
  });

  it("pickup + victory are rising contours; death is falling; place-bomb is flat", () => {
    const pickup = PHRASE_PATCHES.pickup.pitchContour;
    expect(pickup[pickup.length - 1]!).toBeGreaterThan(pickup[0]!);
    const victory = PHRASE_PATCHES.victory.pitchContour;
    expect(victory[victory.length - 1]!).toBeGreaterThan(victory[0]!);
    const death = PHRASE_PATCHES.death.pitchContour;
    expect(death[death.length - 1]!).toBeLessThan(death[0]!);
    const place = PHRASE_PATCHES["place-bomb"].pitchContour;
    expect(place.every((p) => p === place[0]!)).toBe(true);
  });
});

// ---- planner --------------------------------------------------------------

describe("planUtterance (S110 pure planner)", () => {
  it("returns one syllable per pitchContour entry", () => {
    const colour = voiceParamsFromSeed("alice");
    for (const slot of ["place-bomb", "hit", "pickup", "death", "victory"] as const) {
      const schedule = planUtterance(colour, slot);
      expect(schedule.length).toBe(PHRASE_PATCHES[slot].pitchContour.length);
    }
  });

  it("syllable startSeconds are strictly increasing", () => {
    const colour = voiceParamsFromSeed("alice");
    const schedule = planUtterance(colour, "victory");
    for (let i = 1; i < schedule.length; i += 1) {
      expect(schedule[i]!.startSeconds).toBeGreaterThan(schedule[i - 1]!.startSeconds);
    }
  });

  it("vowel pitchHz = colour.basePitchHz × pitchContour[i]", () => {
    const colour = voiceParamsFromSeed("alice");
    const schedule = planUtterance(colour, "victory");
    const contour = PHRASE_PATCHES.victory.pitchContour;
    for (let i = 0; i < schedule.length; i += 1) {
      expect(schedule[i]!.vowel.pitchHz).toBeCloseTo(colour.basePitchHz * contour[i]!, 6);
    }
  });

  it("is deterministic — same colour + same slot → identical schedule", () => {
    const colour = voiceParamsFromSeed("alice");
    expect(planUtterance(colour, "pickup")).toEqual(planUtterance(colour, "pickup"));
  });

  it("phrasePaceMultiplier scales the gap (faster talker = shorter total)", () => {
    const colour = voiceParamsFromSeed("alice");
    const fast: VoiceColour = { ...colour, phrasePaceMultiplier: 0.6 };
    const slow: VoiceColour = { ...colour, phrasePaceMultiplier: 1.4 };
    const fastSchedule = planUtterance(fast, "victory");
    const slowSchedule = planUtterance(slow, "victory");
    expect(utteranceDurationS(slowSchedule)).toBeGreaterThan(utteranceDurationS(fastSchedule));
  });

  it("vowelDriftAmount=0 → vowel formants equal colour.formantF1/F2 (no delta applied)", () => {
    const colour: VoiceColour = { ...voiceParamsFromSeed("alice"), vowelDriftAmount: 0 };
    const schedule = planUtterance(colour, "pickup");
    for (const syl of schedule) {
      expect(syl.vowel.formantF1Hz).toBeCloseTo(colour.formantF1Hz, 4);
      expect(syl.vowel.formantF2Hz).toBeCloseTo(colour.formantF2Hz, 4);
    }
  });

  it("vowelDriftAmount=0.3 → vowel formants follow the delta table", () => {
    const colour: VoiceColour = { ...voiceParamsFromSeed("alice"), vowelDriftAmount: 0.3 };
    const schedule = planUtterance(colour, "pickup");
    const deltas = PHRASE_PATCHES.pickup.vowelDeltas;
    for (let i = 0; i < schedule.length; i += 1) {
      expect(schedule[i]!.vowel.formantF1Hz).toBeCloseTo(colour.formantF1Hz + deltas[i]![0]!, 3);
      expect(schedule[i]!.vowel.formantF2Hz).toBeCloseTo(colour.formantF2Hz + deltas[i]![1]!, 3);
    }
  });

  it("utteranceDurationS scales monotonically with phrasePaceMultiplier", () => {
    const base = voiceParamsFromSeed("alice");
    const fast = utteranceDurationS(planUtterance({ ...base, phrasePaceMultiplier: 0.6 }, "victory"));
    const mid = utteranceDurationS(planUtterance({ ...base, phrasePaceMultiplier: 1.0 }, "victory"));
    const slow = utteranceDurationS(planUtterance({ ...base, phrasePaceMultiplier: 1.4 }, "victory"));
    expect(mid).toBeGreaterThan(fast);
    expect(slow).toBeGreaterThan(mid);
  });
});

// ---- emitter wiring (stubbed Web Audio) ----------------------------------

type StubNode = { name: string; connect: (n: StubNode) => void; connected: StubNode[] };

function makeStubContext() {
  let nodes: StubNode[] = [];
  const make = (name: string): StubNode => {
    const connected: StubNode[] = [];
    const n: StubNode = { name, connect(t: StubNode) { connected.push(t); }, connected };
    nodes.push(n);
    return n;
  };
  let startedOsc = 0;
  let startedNoise = 0;
  let createdFilters = 0;
  const ctx = {
    sampleRate: 48000,
    currentTime: 5,
    state: "running",
    destination: make("destination"),
    createGain(): StubNode & { gain: any } {
      const n = make("gain") as StubNode & { gain: any };
      n.gain = { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} };
      return n;
    },
    createOscillator(): StubNode & any {
      const n = make("oscillator") as StubNode & any;
      n.frequency = { setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {} };
      n.start = () => { startedOsc += 1; };
      n.stop = () => {};
      n.type = "";
      return n;
    },
    createBufferSource(): StubNode & any {
      const n = make("buffer-source") as StubNode & any;
      n.buffer = null;
      n.start = () => { startedNoise += 1; };
      n.stop = () => {};
      return n;
    },
    createBuffer(_ch: number, length: number) {
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
    stats() { return { nodes: nodes.length, startedOsc, startedNoise, createdFilters }; },
    reset() { nodes = []; startedOsc = 0; startedNoise = 0; createdFilters = 0; }
  };
}

describe("emitVoice (S110 babble synth wiring)", () => {
  it("schedules one carrier oscillator per syllable (3 bandpass formants each)", () => {
    const colour: VoiceColour = { ...voiceParamsFromSeed("alice"), consonantStyle: 1.0, noiseMix: 0 };
    for (const slot of ["place-bomb", "hit", "pickup", "death", "victory"] as const) {
      const { ctx, stats, reset } = makeStubContext();
      reset();
      emitVoice(ctx as any, colour, slot, { masterGain: 0.5, terminal: ctx.destination as any });
      const expectedSyllables = PHRASE_PATCHES[slot].pitchContour.length;
      const s = stats();
      // Each syllable: 1 carrier oscillator + (style=1) 1 click oscillator. With style=1, noiseMix=0 → 2 oscillators per syllable.
      expect(s.startedOsc).toBe(expectedSyllables * 2);
      // 3 bandpass formants per vowel + 1 bandpass per consonant when noise present (none here, style=1) = 3 per syllable.
      expect(s.createdFilters).toBe(expectedSyllables * 3);
    }
  });

  it("with consonantStyle=0 (pure noise) emits noise bursts for every consonant", () => {
    const colour: VoiceColour = { ...voiceParamsFromSeed("alice"), consonantStyle: 0, noiseMix: 0 };
    const { ctx, stats } = makeStubContext();
    emitVoice(ctx as any, colour, "victory", { masterGain: 0.5, terminal: ctx.destination as any });
    const expectedSyllables = PHRASE_PATCHES.victory.pitchContour.length;
    // One noise BufferSource per consonant (no click oscillator with style=0).
    expect(stats().startedNoise).toBe(expectedSyllables);
    // Carrier oscillator per syllable; no click oscillator.
    expect(stats().startedOsc).toBe(expectedSyllables);
  });

  it("noiseMix>0 schedules an additional gravel-noise burst over the utterance", () => {
    const colour: VoiceColour = { ...voiceParamsFromSeed("alice"), consonantStyle: 1, noiseMix: 0.3 };
    const { ctx, stats } = makeStubContext();
    emitVoice(ctx as any, colour, "hit", { masterGain: 0.5, terminal: ctx.destination as any });
    // 2 syllables, consonantStyle=1 → no per-consonant noise burst, but +1 gravel noise for the utterance.
    expect(stats().startedNoise).toBe(1);
  });
});
