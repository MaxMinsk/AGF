// S110 KABOOM-PROCEDURAL-CV-BABBLE-VOC — Animal-Crossing-style babble.
//
// Replaces the S109 single-envelope direction with multi-syllable
// utterances per the design override in docs/game-design/voice-synth-design.md.
//
// Building blocks:
//
//   - VoiceColour: 10 seed-derived knobs (7 from S109 research + 3 new
//     for speech-cadence: phrasePaceMultiplier, consonantStyle,
//     vowelDriftAmount).
//   - PHRASE_PATCHES: 5 fixed templates (place-bomb / hit / pickup /
//     death / victory). Each defines syllable count, pitch contour,
//     per-syllable F1/F2 deltas, gap.
//   - planUtterance(colour, slot): pure deterministic — returns a
//     SyllableSchedule[] with absolute start offsets. No Web Audio.
//   - emitUtterance(ctx, schedule, colour, opts): schedules every
//     syllable's consonant transient + vowel pulse on the AudioContext
//     timeline.
//
// The dev research artifact (docs/research/voice-synth-research.md)
// stays authoritative for the per-vowel primitive (sawtooth → 2-3
// bandpass formants → envelope). This module reuses that primitive
// but sequences it into multi-syllable phrases — which is what makes
// the listener perceive "speech" rather than "beep".

import type { AudioContextLike, AudioNodeLike } from "./audio-fx";

// ---- voice colour ----------------------------------------------------------

export type VoiceColour = {
  /** Fundamental sawtooth pitch in Hz. Range 90..260. */
  basePitchHz: number;
  /** First formant centre. Range 300..900. */
  formantF1Hz: number;
  /** Second formant centre. Range 1200..2400. */
  formantF2Hz: number;
  /** Bandpass Q (resonance). Range 4..12. */
  formantQ: number;
  /** Vibrato rate in Hz. Range 0..8. */
  vibratoHz: number;
  /** Vibrato depth, fractional pitch wobble. Range 0..0.04. */
  vibratoDepth: number;
  /** Additive white-noise amplitude. Range 0..0.4. */
  noiseMix: number;
  /** S110 — multiplies each slot's inter-syllable gap. <1 = fast talker, >1 = slow talker. Range 0.6..1.4. */
  phrasePaceMultiplier: number;
  /** S110 — 0 = pure noise transient, 0.5 = mixed, 1 = pure pitched click. Range 0..1. */
  consonantStyle: number;
  /** S110 — multiplier on per-syllable F1/F2 deltas. 0 = monotone vowel; 0.3 = pronounced vowel variation. Range 0..0.3. */
  vowelDriftAmount: number;
};

const VOICE_RANGES = {
  basePitchHz: [90, 260] as const,
  formantF1Hz: [300, 900] as const,
  formantF2Hz: [1200, 2400] as const,
  formantQ: [4, 12] as const,
  vibratoHz: [0, 8] as const,
  vibratoDepth: [0, 0.04] as const,
  noiseMix: [0, 0.4] as const,
  phrasePaceMultiplier: [0.6, 1.4] as const,
  consonantStyle: [0, 1] as const,
  vowelDriftAmount: [0, 0.3] as const
};

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
 * Derive a 10-knob voice colour from a seed string. Deterministic +
 * pure. Same seed → same colour on every call.
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
    noiseMix: lerp(VOICE_RANGES.noiseMix[0], VOICE_RANGES.noiseMix[1], s()),
    phrasePaceMultiplier: lerp(VOICE_RANGES.phrasePaceMultiplier[0], VOICE_RANGES.phrasePaceMultiplier[1], s()),
    consonantStyle: lerp(VOICE_RANGES.consonantStyle[0], VOICE_RANGES.consonantStyle[1], s()),
    vowelDriftAmount: lerp(VOICE_RANGES.vowelDriftAmount[0], VOICE_RANGES.vowelDriftAmount[1], s())
  };
}

// ---- phrase patches --------------------------------------------------------

export type VoiceSlot = "place-bomb" | "hit" | "pickup" | "death" | "victory";

export type PhrasePatch = {
  /** Pitch multipliers per syllable. Length = syllable count. */
  pitchContour: ReadonlyArray<number>;
  /** Per-syllable [F1 delta, F2 delta] in Hz from the bomber's base colour. */
  vowelDeltas: ReadonlyArray<readonly [number, number]>;
  /** Base inter-syllable gap in seconds (before phrasePaceMultiplier scales it). */
  gapS: number;
  /** Vowel pulse length in seconds. */
  vowelDurationS: number;
  /** Consonant transient length in seconds (0 = no consonant). */
  consonantDurationS: number;
};

/**
 * S110 — five fixed multi-syllable phrase templates from the
 * voice-synth-design.md design override. The vowel "names" in the
 * doc are mnemonic; listeners localise to whatever language family
 * they're used to.
 *
 *   place-bomb → 3-syllable neutral mutter ("bi-da-bo")
 *   hit        → 2-syllable sharp yelp     ("wha-OO!")
 *   pickup     → 3-syllable rising cheer   ("yi-pi-pa!")
 *   death      → 4-syllable falling whine  ("wuu-uuh-uh-uh")
 *   victory    → 5-syllable rising flourish ("yi-pi-pa-ha-a!")
 */
export const PHRASE_PATCHES: Readonly<Record<VoiceSlot, PhrasePatch>> = {
  "place-bomb": {
    pitchContour: [1.0, 1.0, 1.0],
    vowelDeltas: [[0, 0], [0, 200], [-100, 0]],
    gapS: 0.020,
    vowelDurationS: 0.060,
    consonantDurationS: 0.015
  },
  hit: {
    pitchContour: [1.0, 0.7],
    vowelDeltas: [[150, 200], [0, -100]],
    gapS: 0.015,
    vowelDurationS: 0.060,
    consonantDurationS: 0.015
  },
  pickup: {
    pitchContour: [1.0, 1.15, 1.3],
    vowelDeltas: [[0, 300], [-50, 100], [-100, 0]],
    gapS: 0.018,
    vowelDurationS: 0.060,
    consonantDurationS: 0.012
  },
  death: {
    pitchContour: [1.0, 0.85, 0.7, 0.55],
    vowelDeltas: [[-150, -100], [-100, 0], [-150, -100], [-100, -150]],
    gapS: 0.030,
    vowelDurationS: 0.080,
    consonantDurationS: 0.015
  },
  victory: {
    pitchContour: [1.0, 1.15, 1.3, 1.45, 1.5],
    vowelDeltas: [[0, 200], [-50, 100], [-100, 0], [50, 300], [100, 200]],
    gapS: 0.022,
    vowelDurationS: 0.060,
    consonantDurationS: 0.015
  }
};

// ---- utterance planner (pure) ----------------------------------------------

export type ConsonantSpec = {
  /** 0 = pure noise, 1 = pure pitched click; from VoiceColour.consonantStyle. */
  styleBlend: number;
  /** Length in seconds. */
  durationS: number;
  /** Bandpass centre Hz for the noise component. Derived from a per-syllable hash. */
  noiseHz: number;
  /** Pitch for the optional pitched-click component (Hz). */
  pitchHz: number;
};

export type VowelSpec = {
  /** Length in seconds. */
  durationS: number;
  /** Pitch in Hz. */
  pitchHz: number;
  /** First formant in Hz (after delta + drift). */
  formantF1Hz: number;
  /** Second formant in Hz. */
  formantF2Hz: number;
  /** Filter Q from the colour. */
  formantQ: number;
};

export type SyllableSchedule = {
  /** Offset from utterance start in seconds. */
  startSeconds: number;
  /** Optional consonant transient (omitted if consonantDurationS == 0). */
  consonant: ConsonantSpec | null;
  vowel: VowelSpec;
};

/**
 * Pure deterministic planner. Given a voice colour + slot, returns the
 * exact schedule (start offsets, pitches, formants, gap lengths).
 * Useful as a fixture for unit tests + future replay determinism
 * harness — no Web Audio nodes involved.
 */
export function planUtterance(colour: VoiceColour, slot: VoiceSlot): ReadonlyArray<SyllableSchedule> {
  const patch = PHRASE_PATCHES[slot];
  const syllableCount = patch.pitchContour.length;
  const gap = patch.gapS * colour.phrasePaceMultiplier;
  const consonantDur = patch.consonantDurationS;
  const vowelDur = patch.vowelDurationS;

  const out: SyllableSchedule[] = [];
  let cursor = 0;
  for (let i = 0; i < syllableCount; i += 1) {
    const start = cursor;
    const pitchMul = patch.pitchContour[i]!;
    const pitchHz = colour.basePitchHz * pitchMul;
    const [dF1, dF2] = patch.vowelDeltas[i]!;
    // Drift amount scales the delta — 0 = ignore deltas (monotone),
    // 1 = full delta (max expressiveness). Knob is 0..0.3; we
    // normalise by 0.3 so 0.3 = 100% delta.
    const drift = Math.min(1, colour.vowelDriftAmount / 0.3);
    const consonant: ConsonantSpec | null =
      consonantDur > 0
        ? {
            styleBlend: colour.consonantStyle,
            durationS: consonantDur,
            // Per-syllable noise centre: hash the syllable index into 2-4 kHz.
            noiseHz: 2000 + ((i * 7) % 5) * 500,
            // Pitched click sits ~1.5× the base pitch.
            pitchHz: colour.basePitchHz * 1.5
          }
        : null;
    const vowel: VowelSpec = {
      durationS: vowelDur,
      pitchHz,
      formantF1Hz: Math.max(80, colour.formantF1Hz + dF1 * drift),
      formantF2Hz: Math.max(150, colour.formantF2Hz + dF2 * drift),
      formantQ: colour.formantQ
    };
    out.push({ startSeconds: start, consonant, vowel });
    cursor = start + consonantDur + vowelDur + gap;
  }
  return out;
}

/** Total length of an utterance in seconds (including the trailing gap). */
export function utteranceDurationS(schedule: ReadonlyArray<SyllableSchedule>): number {
  if (schedule.length === 0) return 0;
  const last = schedule[schedule.length - 1]!;
  const consonantDur = last.consonant?.durationS ?? 0;
  return last.startSeconds + consonantDur + last.vowel.durationS;
}

// ---- emitter (Web Audio) ---------------------------------------------------

export type EmitVoiceOptions = {
  masterGain: number;
  terminal: AudioNodeLike;
};

/**
 * Schedule every syllable of a planned utterance on the AudioContext
 * timeline. Each syllable's consonant transient + vowel pulse routes
 * through `terminal`. Caller owns spatialisation (via the terminal
 * being a panner OR ctx.destination).
 */
export function emitUtterance(
  c: AudioContextLike,
  schedule: ReadonlyArray<SyllableSchedule>,
  colour: VoiceColour,
  options: EmitVoiceOptions
): void {
  const now = c.currentTime;
  for (const syl of schedule) {
    const startAt = now + syl.startSeconds;
    // Consonant transient (optional) — kicks off the syllable.
    if (syl.consonant !== null) {
      const cs = syl.consonant;
      scheduleConsonant(c, cs, startAt, options);
    }
    // Vowel pulse — starts after the consonant.
    const vowelStart = startAt + (syl.consonant?.durationS ?? 0);
    scheduleVowel(c, syl.vowel, vowelStart, colour, options);
  }
  // Optional noise floor for "gravel" voices. One short noise burst at
  // utterance start; scaled by the colour's noiseMix knob.
  if (colour.noiseMix > 0.001) {
    const total = utteranceDurationS(schedule);
    scheduleGravelNoise(c, now, total, colour.noiseMix, options);
  }
}

function scheduleConsonant(
  c: AudioContextLike,
  spec: ConsonantSpec,
  startAt: number,
  options: EmitVoiceOptions
): void {
  // Two sub-emitters mixed by styleBlend: noise burst + pitched click.
  // styleBlend 0 → pure noise; 1 → pure click.
  const noiseGain = (1 - spec.styleBlend) * options.masterGain * 0.18;
  const clickGain = spec.styleBlend * options.masterGain * 0.20;

  if (noiseGain > 0.001) {
    const sampleCount = Math.max(2, Math.floor(c.sampleRate * spec.durationS));
    const buffer = c.createBuffer(1, sampleCount, c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = (Math.random() * 2 - 1);
    const src = c.createBufferSource();
    src.buffer = buffer;
    const bp = c.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.setValueAtTime(spec.noiseHz, startAt);
    if (bp.Q !== undefined) bp.Q.setValueAtTime(4, startAt);
    const gain = c.createGain();
    gain.gain.setValueAtTime(0, startAt);
    gain.gain.linearRampToValueAtTime(noiseGain, startAt + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + spec.durationS);
    src.connect(bp);
    bp.connect(gain);
    gain.connect(options.terminal);
    src.start(startAt);
    src.stop(startAt + spec.durationS + 0.01);
  }

  if (clickGain > 0.001) {
    const osc = c.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(spec.pitchHz, startAt);
    const gain = c.createGain();
    gain.gain.setValueAtTime(0, startAt);
    gain.gain.linearRampToValueAtTime(clickGain, startAt + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + spec.durationS);
    osc.connect(gain);
    gain.connect(options.terminal);
    osc.start(startAt);
    osc.stop(startAt + spec.durationS + 0.01);
  }
}

function scheduleVowel(
  c: AudioContextLike,
  spec: VowelSpec,
  startAt: number,
  colour: VoiceColour,
  options: EmitVoiceOptions
): void {
  // S158 KABOOM-VOICE-V2 — speech-like vowel pulse. Replaces the
  // S110 sawtooth-only carrier with a richer dual-source (sawtooth +
  // pulse-train approximation), wired-up vibrato (S109 colour knob
  // that was a no-op since 2026-05), tighter formant Q for vowel
  // clarity, and a slower-attack envelope (~25 ms rise) that reads
  // as "vowel start" rather than "click+ring". Playtest 2026-05-27:
  // user expected речь-like vocals but heard chirps/bops.
  const end = startAt + spec.durationS;

  // Two carriers mixed: sawtooth (rich harmonics → formants pick out
  // resonances) + square-wave fundamental (slightly hollow, gives
  // the synth a vowel-like timbre when summed). Both share the same
  // base pitch + vibrato modulation.
  const sawCarrier = c.createOscillator();
  sawCarrier.type = "sawtooth";
  sawCarrier.frequency.setValueAtTime(spec.pitchHz, startAt);

  const squareCarrier = c.createOscillator();
  squareCarrier.type = "square";
  squareCarrier.frequency.setValueAtTime(spec.pitchHz, startAt);

  // Vibrato — LFO modulating both carriers' frequency. Wired up via
  // the colour knob (was bypassed since S109). Depth scales by the
  // carrier's pitch so the wobble feels proportional.
  if (colour.vibratoHz > 0.01 && colour.vibratoDepth > 0.0005) {
    const lfo = c.createOscillator();
    lfo.type = "sine";
    lfo.frequency.setValueAtTime(colour.vibratoHz, startAt);
    const lfoGain = c.createGain();
    lfoGain.gain.setValueAtTime(spec.pitchHz * colour.vibratoDepth, startAt);
    lfo.connect(lfoGain);
    // AudioParam.connect works on BiquadFilter/Gain — vibrato writes
    // into the frequency parameter of both carriers.
    const sawFreq = sawCarrier.frequency as unknown as AudioNodeLike;
    const squareFreq = squareCarrier.frequency as unknown as AudioNodeLike;
    if (typeof (lfoGain as unknown as { connect?: (n: AudioNodeLike) => void }).connect === "function") {
      try { lfoGain.connect(sawFreq); } catch { /* test stub may not support param-connect */ }
      try { lfoGain.connect(squareFreq); } catch { /* idem */ }
    }
    lfo.start(startAt);
    lfo.stop(end + 0.01);
  }

  // Carrier mix node — sawtooth gets the bulk of the energy (richer
  // harmonics), square adds a touch of warmth.
  const carrierMix = c.createGain();
  carrierMix.gain.setValueAtTime(1, startAt);
  const sawGain = c.createGain();
  sawGain.gain.setValueAtTime(0.75, startAt);
  const squareGain = c.createGain();
  squareGain.gain.setValueAtTime(0.25, startAt);
  sawCarrier.connect(sawGain);
  squareCarrier.connect(squareGain);
  sawGain.connect(carrierMix);
  squareGain.connect(carrierMix);

  // Three parallel bandpass formants (F1 + F2 + F3=F2*1.6). Q comes
  // from the spec — slightly tightened ranges in the patches give a
  // clearer vowel.
  const filterSum = c.createGain();
  filterSum.gain.setValueAtTime(1.0 / 3, startAt);
  for (const hz of [spec.formantF1Hz, spec.formantF2Hz, Math.min(3800, spec.formantF2Hz * 1.6)]) {
    const bp = c.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.setValueAtTime(Math.max(60, hz), startAt);
    if (bp.Q !== undefined) bp.Q.setValueAtTime(spec.formantQ, startAt);
    carrierMix.connect(bp);
    bp.connect(filterSum);
  }

  // S158 — slower attack (25 ms) reads as a vowel onset rather than a
  // click. Sustain at full peak for the bulk of the vowel, then
  // exponential fade. Peak gain bumped to masterGain * 0.45 (was
  // 0.30) so the vocal sits above the percussive SFX in the mix.
  const envelopeGain = c.createGain();
  const attackS = Math.min(0.025, spec.durationS * 0.25);
  const peak = options.masterGain * 0.45;
  envelopeGain.gain.setValueAtTime(0, startAt);
  envelopeGain.gain.linearRampToValueAtTime(peak, startAt + attackS);
  // Hold a touch then exp-fade so the vowel has audible body.
  const sustainEnd = startAt + spec.durationS * 0.65;
  if (sustainEnd > startAt + attackS) {
    envelopeGain.gain.linearRampToValueAtTime(peak * 0.85, sustainEnd);
  }
  envelopeGain.gain.exponentialRampToValueAtTime(0.0001, end);
  filterSum.connect(envelopeGain);
  envelopeGain.connect(options.terminal);

  sawCarrier.start(startAt);
  sawCarrier.stop(end + 0.01);
  squareCarrier.start(startAt);
  squareCarrier.stop(end + 0.01);
}

function scheduleGravelNoise(
  c: AudioContextLike,
  startAt: number,
  durationS: number,
  noiseMix: number,
  options: EmitVoiceOptions
): void {
  const sampleCount = Math.max(2, Math.floor(c.sampleRate * durationS));
  const buffer = c.createBuffer(1, sampleCount, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = (Math.random() * 2 - 1) * noiseMix;
  const src = c.createBufferSource();
  src.buffer = buffer;
  const gain = c.createGain();
  gain.gain.setValueAtTime(0, startAt);
  gain.gain.linearRampToValueAtTime(options.masterGain * 0.12 * noiseMix, startAt + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + durationS);
  src.connect(gain);
  gain.connect(options.terminal);
  src.start(startAt);
  src.stop(startAt + durationS + 0.02);
}

// ---- back-compat shim for the audio-fx dispatcher --------------------------

/**
 * S110 — kept for the audio-fx playVoice dispatcher's existing
 * signature. Plans the utterance + emits it in one shot.
 */
export function emitVoice(
  c: AudioContextLike,
  colour: VoiceColour,
  slot: VoiceSlot,
  options: EmitVoiceOptions
): void {
  const schedule = planUtterance(colour, slot);
  emitUtterance(c, schedule, colour, options);
}
