// S109 KABOOM-PROCEDURAL-VOCAL-SYNTH.
//
// Per-bomber procedural voice. Implements the recommendation in
// docs/research/voice-synth-research.md:
//
//   - 7 seed-derived voice-colour knobs (basePitchHz, formantF1Hz,
//     formantF2Hz, formantQ, vibratoHz, vibratoDepth, noiseMix).
//   - 5 fixed emotion slots: place-bomb, hit, pickup, death, victory.
//   - Source-filter formant synthesis: sawtooth oscillator → three
//     parallel bandpass filters tuned to F1/F2/F3 → gain envelope.
//   - All audio generated at play time via Web Audio API. Zero assets.
//
// Two entry points:
//
//   voiceParamsFromSeed(seed): VoiceColour
//     Pure function. Same seed → same voice. Drives per-bomber identity.
//
//   emitVoice(ctx, colour, slot, masterGain, terminal): void
//     Web Audio synth — connects oscillators + filters + envelope to
//     the supplied terminal node. The caller picks `terminal` so the
//     same emit can route through a positional PannerNode OR straight
//     to ctx.destination for non-positional UI chimes.

import type { AudioContextLike, AudioNodeLike } from "./audio-fx";

// ---- voice colour (per-bomber identity) ------------------------------------

export type VoiceColour = {
  /** Fundamental sawtooth pitch in Hz. Range 90..260. */
  basePitchHz: number;
  /** First formant centre frequency. Range 300..900. Affects vowel "openness". */
  formantF1Hz: number;
  /** Second formant centre frequency. Range 1200..2400. Affects vowel "frontness". */
  formantF2Hz: number;
  /** Bandpass Q (resonance). Range 4..12. Higher = more vocal-cavity-like. */
  formantQ: number;
  /** Vibrato rate in Hz. Range 0..8. 0 = robotic, 4–6 = warm. */
  vibratoHz: number;
  /** Vibrato depth as a fractional pitch wobble. Range 0..0.04. */
  vibratoDepth: number;
  /** Additive white-noise amplitude. Range 0..0.4. 0 = pure synth, 0.3+ = gravelly. */
  noiseMix: number;
};

const VOICE_RANGES = {
  basePitchHz: [90, 260] as const,
  formantF1Hz: [300, 900] as const,
  formantF2Hz: [1200, 2400] as const,
  formantQ: [4, 12] as const,
  vibratoHz: [0, 8] as const,
  vibratoDepth: [0, 0.04] as const,
  noiseMix: [0, 0.4] as const
};

/** xorshift32 stream from a seed string. Matches the resolveRecipeFromSeed pattern. */
function makeSeedStream(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  }
  let state = h | 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) / 0xffffffff);
  };
}

function lerp(min: number, max: number, t: number): number {
  return min + (max - min) * t;
}

/**
 * Derive a fully-populated voice colour from a seed string. Pure +
 * deterministic — `voiceParamsFromSeed("alice")` always returns the
 * same VoiceColour. Used by audio-fx to look up the voice colour for
 * a given event's entityId.
 */
export function voiceParamsFromSeed(seed: string): VoiceColour {
  const s = makeSeedStream(`voice.${seed}`);
  return {
    basePitchHz: lerp(VOICE_RANGES.basePitchHz[0], VOICE_RANGES.basePitchHz[1], s()),
    formantF1Hz: lerp(VOICE_RANGES.formantF1Hz[0], VOICE_RANGES.formantF1Hz[1], s()),
    formantF2Hz: lerp(VOICE_RANGES.formantF2Hz[0], VOICE_RANGES.formantF2Hz[1], s()),
    formantQ: lerp(VOICE_RANGES.formantQ[0], VOICE_RANGES.formantQ[1], s()),
    vibratoHz: lerp(VOICE_RANGES.vibratoHz[0], VOICE_RANGES.vibratoHz[1], s()),
    vibratoDepth: lerp(VOICE_RANGES.vibratoDepth[0], VOICE_RANGES.vibratoDepth[1], s()),
    noiseMix: lerp(VOICE_RANGES.noiseMix[0], VOICE_RANGES.noiseMix[1], s())
  };
}

// ---- slot patches (emotion) ------------------------------------------------

export type VoiceSlot = "place-bomb" | "hit" | "pickup" | "death" | "victory";

export type VoiceSlotPatch = {
  /** Total length of the slot in seconds. */
  durationS: number;
  attackS: number;
  decayS: number;
  /** Pitch automation as a 2-point linear ramp (start → end multipliers on basePitchHz). */
  pitchAutomation: { startMul: number; endMul: number };
  /**
   * Optional N-step pitch sequence (used by `victory` to produce three
   * rising notes). When present, OVERRIDES pitchAutomation — the synth
   * schedules a setValueAtTime for each step.
   */
  pitchSteps?: ReadonlyArray<{ atSeconds: number; pitchMul: number }>;
  /** Adjustment added to formant F1 for the duration of the clip. */
  formantBiasF1: number;
  /** Adjustment added to formant F2 for the duration of the clip. */
  formantBiasF2: number;
};

export const VOICE_SLOT_PATCHES: Readonly<Record<VoiceSlot, VoiceSlotPatch>> = {
  "place-bomb": {
    durationS: 0.12,
    attackS: 0.008,
    decayS: 0.11,
    pitchAutomation: { startMul: 1.0, endMul: 1.0 },
    formantBiasF1: 0,
    formantBiasF2: 0
  },
  hit: {
    // Survived a hit (shield consumed). Pitch jumps up briefly then settles.
    durationS: 0.18,
    attackS: 0.005,
    decayS: 0.175,
    pitchAutomation: { startMul: 1.3, endMul: 1.0 },
    formantBiasF1: 200,
    formantBiasF2: 0
  },
  pickup: {
    durationS: 0.15,
    attackS: 0.010,
    decayS: 0.14,
    pitchAutomation: { startMul: 1.0, endMul: 1.5 },
    formantBiasF1: 0,
    formantBiasF2: 400
  },
  death: {
    durationS: 0.28,
    attackS: 0.005,
    decayS: 0.275,
    pitchAutomation: { startMul: 1.0, endMul: 0.5 },
    formantBiasF1: -200,
    formantBiasF2: 0
  },
  victory: {
    durationS: 0.26,
    attackS: 0.012,
    decayS: 0.24,
    // Rising three-step arpeggio. atSeconds is relative to play start.
    pitchAutomation: { startMul: 1.0, endMul: 1.6 }, // fallback for synths without setValueAtTime
    pitchSteps: [
      { atSeconds: 0, pitchMul: 1.0 },
      { atSeconds: 0.087, pitchMul: 1.3 },
      { atSeconds: 0.174, pitchMul: 1.6 }
    ],
    formantBiasF1: 0,
    formantBiasF2: 200
  }
};

// ---- synth entrypoint ------------------------------------------------------

export type EmitVoiceOptions = {
  /** Master gain. Applied as a multiplier on the patch's gain envelope. */
  masterGain: number;
  /**
   * Where to terminate the gain chain. Usually a panner OR
   * `c.destination`. The caller owns spatialisation.
   */
  terminal: AudioNodeLike;
};

/**
 * Synthesise one voice slot on `c`. Connects sawtooth carrier → three
 * parallel bandpass filters (F1/F2/F3) → gain envelope → terminal.
 * Optional sub-features:
 *
 *   - vibratoHz > 0 + vibratoDepth > 0: a low-frequency oscillator
 *     modulates the carrier frequency.
 *   - noiseMix > 0: a short white-noise buffer plays in parallel with
 *     its own bandpass + gain envelope.
 *
 * Side effects: schedules `osc.start` / `osc.stop` etc on `c`. Returns
 * nothing. Idempotent in the sense that calling it twice plays the
 * voice twice (no state).
 */
export function emitVoice(
  c: AudioContextLike,
  colour: VoiceColour,
  slot: VoiceSlot,
  options: EmitVoiceOptions
): void {
  const patch = VOICE_SLOT_PATCHES[slot];
  const now = c.currentTime;
  const endAt = now + patch.durationS;

  // 1. Sawtooth carrier with pitch automation.
  const carrier = c.createOscillator();
  carrier.type = "sawtooth";
  if (patch.pitchSteps !== undefined) {
    // Discrete step sequence (victory).
    for (const step of patch.pitchSteps) {
      carrier.frequency.setValueAtTime(colour.basePitchHz * step.pitchMul, now + step.atSeconds);
    }
  } else {
    // Linear pitch ramp.
    const startHz = colour.basePitchHz * patch.pitchAutomation.startMul;
    const endHz = colour.basePitchHz * patch.pitchAutomation.endMul;
    carrier.frequency.setValueAtTime(startHz, now);
    if (Math.abs(endHz - startHz) > 0.5) {
      carrier.frequency.linearRampToValueAtTime(endHz, endAt);
    }
  }

  // 2. Three parallel bandpass formants. F3 is fixed relative to F2 so
  //    we don't carry it as a seven knob — keeps the seed space simple.
  const formants = [
    colour.formantF1Hz + patch.formantBiasF1,
    colour.formantF2Hz + patch.formantBiasF2,
    Math.min(3800, (colour.formantF2Hz + patch.formantBiasF2) * 1.6)
  ];
  const filterGain = c.createGain();
  // Filter sum normaliser — three parallel passes ≈ 3x amplitude.
  filterGain.gain.setValueAtTime(1.0 / 3, now);
  for (const hz of formants) {
    const bp = c.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.setValueAtTime(Math.max(60, hz), now);
    if (typeof (bp as { Q?: { setValueAtTime(v: number, t: number): void } }).Q?.setValueAtTime === "function") {
      (bp as unknown as { Q: { setValueAtTime(v: number, t: number): void } }).Q.setValueAtTime(colour.formantQ, now);
    }
    carrier.connect(bp);
    bp.connect(filterGain);
  }

  // 3. Envelope on top of the filter sum.
  const envelopeGain = c.createGain();
  envelopeGain.gain.setValueAtTime(0, now);
  envelopeGain.gain.linearRampToValueAtTime(options.masterGain * 0.35, now + patch.attackS);
  envelopeGain.gain.exponentialRampToValueAtTime(0.0001, now + patch.attackS + patch.decayS);
  filterGain.connect(envelopeGain);
  envelopeGain.connect(options.terminal);

  // 4. Optional noise layer for "gravel". Plays in parallel.
  if (colour.noiseMix > 0.001) {
    const buffer = c.createBuffer(1, Math.max(1, Math.floor(c.sampleRate * patch.durationS)), c.sampleRate);
    const data = buffer.getChannelData(0);
    // Cheap deterministic-ish noise — driven by the colour's noise knob
    // as a seed so two play()s of the same voice are similar but not
    // bit-identical (browsers don't expose seeded Math.random).
    for (let i = 0; i < data.length; i += 1) {
      data[i] = (Math.random() * 2 - 1) * colour.noiseMix;
    }
    const noiseSource = c.createBufferSource();
    noiseSource.buffer = buffer;
    const noiseGain = c.createGain();
    noiseGain.gain.setValueAtTime(0, now);
    noiseGain.gain.linearRampToValueAtTime(options.masterGain * 0.2 * colour.noiseMix, now + patch.attackS);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + patch.attackS + patch.decayS);
    noiseSource.connect(noiseGain);
    noiseGain.connect(options.terminal);
    noiseSource.start(now);
    noiseSource.stop(endAt + 0.02);
  }

  carrier.start(now);
  carrier.stop(endAt + 0.02);
}
