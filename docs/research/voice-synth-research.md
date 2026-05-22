# Procedural voice synthesis — research for Kaboom Crew bombers

**Spike output for `RESEARCH-VOCAL-SYNTH-APPROACHES-001` (S109).**
**Owner:** dev terminal. **Status:** draft 2026-05-22.
**Outcome:** recommendation + parameter sketch for `FEAT-PROCEDURAL-VOCAL-SYNTH-S-001`.

This is a research artifact only — no engine code, no schema changes. The
goal is to derisk the feature story before any system code lands.

---

## 1. What Kaboom Crew actually needs

| Constraint | Value |
|---|---|
| Slots | 5: `place-bomb`, `hit` (shielded survival), `pickup`, `death`, `victory` |
| Per-clip length | 80–300 ms |
| Source of variance | The bomber's `CharacterRecipe.seed` (already exists, deterministic xorshift32 stream) |
| Determinism | Same seed → same voice on every run (replay, network, screenshot) |
| Runtime | Web Audio API only. Shares the existing `kaboom audio-fx` graph |
| Asset budget | **Zero** — no `.wav`, no pre-rendered ML weights, no voice-actor pipeline |
| Bundle budget | <10 KB of synth code (must coexist with the bomb / blast / footstep paths in `audio-fx.ts`) |
| Style target | Cartoon-grunt / yell — vowel-like, NOT intelligible speech |
| Co-existence | Plays under simultaneous `blast`, `bomb-place`, `pickup` — must not clash spectrally with low-end rumble |

What this **isn't**: not text-to-speech, not "hello bomber #1", not narrative
voice acting. The five slots are non-verbal phoneme bursts — closer to
*Mario yelps* or *Bomberman pip-squeaks* than to spoken lines.

---

## 2. The design space

Eight families. Each row notes the technique, whether it fits Kaboom Crew,
and the rough complexity (LOC + DSP cost) of a minimal implementation on
top of the existing Web Audio path.

| # | Family | Idea (1 line) | Fits us? | LOC | Cost |
|---|---|---|---|---|---|
| 1 | **Source–filter formant** | Sawtooth carrier → bandpass filters at F1/F2/F3 → gain envelope. Klatt 1980 cascade synthesizer in miniature | ✅ **best fit** | ~80 | Low |
| 2 | **Additive sine partials** | Sum N sines at harmonic ratios; amplitude profile tuned to formant peaks | ✅ alt fit | ~120 | Low-med |
| 3 | **FM / PM (DX7 style)** | One carrier modulated by one operator at a fixed ratio. Vowel-like timbres at ratios 1:1, 2:1, 3:1 | ⚠️ workable but harder to "tune to a vowel" | ~60 | Low |
| 4 | **Subtractive (analog-synth)** | Sawtooth → resonant lowpass with cutoff sweep. Filter resonance pretends to be a formant peak | ⚠️ one-formant ceiling (single-peak), reads less "voice-like" | ~50 | Low |
| 5 | **Granular** | Time-stretch a short seed sample at variable rate/density | ❌ needs a sample asset (out of scope: no .wav files) | n/a | n/a |
| 6 | **LPC vocoder** | Encode a real recording as LPC coefficients, replay with synthetic excitation | ❌ needs source audio + encoder; LPC tables are still asset bytes | n/a | n/a |
| 7 | **Phoneme TTS engine** (SAM / MeSpeak / eSpeak) | Stitch fixed phoneme samples for intelligible speech | ❌ overkill — we don't want words, and the smallest (SAM port) is ~30 KB | n/a | n/a |
| 8 | **Neural TTS / vocoder** (Tacotron / Bark / Coqui) | Sequence-to-sequence model emits waveform | ❌ multi-MB weights, GPU/WASM, latency — wildly out of scope | n/a | n/a |

**Verdict:** rows 1 and 2 fit. Row 1 (source–filter formant) is the canonical
recipe for "robot character grunts" and matches our existing
oscillator-and-bandpass-filter idiom in `audio-fx.ts`. Pick row 1, keep row
2 as a fallback if formant tuning proves fragile.

---

## 3. Why formant synthesis specifically

A vowel sound = a harmonic-rich source (vocal-fold buzz) filtered by the
resonant cavities of the throat/mouth. Three resonance peaks (formants F1,
F2, F3) carry almost all the perceptual identity. F1/F2 alone identifies the
vowel: `/a/` ≈ (730, 1090) Hz, `/i/` ≈ (270, 2290) Hz, `/u/` ≈ (300, 870) Hz
(Peterson & Barney 1952 standard table).

Minimal Web Audio recipe:

```
OscillatorNode (sawtooth, base pitch) ─┐
                                       ├─→ Gain (envelope) ─→ Output
       BiquadFilter[bandpass, F1, Q] ──┤
       BiquadFilter[bandpass, F2, Q] ──┤
       BiquadFilter[bandpass, F3, Q] ──┘
```

The sawtooth has all harmonics; the parallel bandpass bank picks out three
resonance peaks. That's a vowel. Sweeping F1/F2 across a clip morphs vowels
(/a/ → /o/ feels like "ohh"). Adding tiny pitch jitter (~3–5%) and a noise
floor (~0.05 amplitude) gives gravel and breath — pushes it from "synth pad"
to "voice".

This pattern is well-trodden in chiptune toolboxes:

- **JSFXR** (sfxr.me) has a "vowel" oscillator mode for exactly this reason.
- **Bfxr** ships preset templates ("powerup", "hit/hurt") that are essentially
  envelope + filter sweep combinations.
- **SuperCollider** examples (Klang.ar with bandpass arrays) are the same
  topology in academic clothing.

---

## 4. Concrete references

### Papers / foundational

- Klatt, D. (1980). *Software for a cascade/parallel formant synthesizer*.
  J. Acoust. Soc. Am. 67(3). The reference paper; cascade is closer to real
  speech, parallel is cheaper — we want parallel.
- Peterson & Barney (1952). *Control methods used in a study of the
  vowels*. The F1/F2 tables for American English vowels — still the citation
  every formant synth pulls from.
- Stevens, K. (1999). *Acoustic Phonetics*. Chapter 6 has the cleanest
  intuition for "why three formants are enough".

### Web-Audio-API tutorials / demos

- Chris Wilson's classic formant synth demo (2013):
  https://github.com/cwilso/Audio-Buffer-Workers (older but the topology
  matches ours exactly).
- WebAudio examples repo:
  https://github.com/mdn/webaudio-examples → `voice-change-o-matic` shows
  filter chain wiring.
- Tone.js `Synth` + `Filter` composition docs:
  https://tonejs.github.io/docs/14.7.77/Synth — overkill as a dependency but
  the patch graphs are good reading.

### Open-source projects to crib patches from

- **sfxr / jsfxr** — https://github.com/grumdrig/jsfxr — the canonical
  procedural-game-SFX tool. ~300 LOC of vanilla JS. Their `square wave +
  vibrato + filter` pipeline is essentially what we want, just with a
  bandpass-bank instead of a single lowpass.
- **Bfxr** — https://www.bfxr.net/ — Flash-era cousin, lots of preset
  templates exposed.
- **ZzFX** — https://github.com/KilledByAPixel/ZzFX — *1 KB minified*
  procedural SFX engine; their parameter list (frequency, attack, sustain,
  release, shape, slide, deltaSlide, pitchJump, pitchJumpTime, repeat,
  noise, modulation, bitCrush, delay, sweep, pitchRandom, stereoDelay,
  tremolo, drumNoise, drumPitch) is a reference shopping list for compact
  procedural SFX.
- **Klystrack / FamiTracker** — chiptune-era tools whose duty-cycle +
  filter sweep idioms apply directly.
- **SAM (Software Automatic Mouth) JS port** — https://github.com/discordier/sam
  — included as a counter-example: ~30 KB, makes actual phonemes, is wildly
  more capable than we need, and the bundle hit is not justified for 5
  non-verbal grunts.

### Game references (sound design, not code)

- Bomberman *Super Bomberman* (SNES, 1993) — pickup chirps and death
  yelps are ~150 ms blips with a single pitch slide. The bar we're chasing.
- *Super Mario 64* — Mario's "let's-a go", "yahoo", "wahaha" — pre-recorded,
  but the pitch envelopes (rising for "yahoo", inverted-V for "yahaha")
  are templates we can copy as pitch automation curves.
- *Bastion* (Supergiant) — "Stranger" narrator is sampled, but the
  in-game weapon procedural pings show how a synth can sit under voiced
  events without competing with them.
- *Hollow Knight* — bug-creature chirps are FM-synth-y and per-character —
  similar problem shape.

---

## 5. Recommended approach (the actual proposal)

**Source–filter formant synth, 7 seed-derived knobs, 5 slot envelopes.**

### Per-bomber voice colour (7 knobs derived from `recipe.seed`)

Add to the existing `CharacterRecipe` schema in a `voice` block. Default
ranges below; all derived by `xorshift32` from the recipe seed so two
bombers with the same seed always sound identical.

| Knob | Range | Effect |
|---|---|---|
| `basePitchHz` | 90 – 260 | Lower = "big robot/heavy", higher = "small robot/squeaky". Mid (~160) = neutral |
| `formantF1Hz` | 300 – 900 | First formant. Low = closed/round (/o/ /u/), high = open (/a/) |
| `formantF2Hz` | 1200 – 2400 | Second formant. Low = back vowel, high = front vowel (/i/) |
| `formantQ` | 4 – 12 | Filter resonance. Higher = more "vocal-cavity", lower = muffled |
| `vibratoHz` | 0 – 8 | 0 = robotic, 4–6 = warm, 7+ = panic/giddy |
| `vibratoDepth` | 0 – 0.04 | Fractional pitch wobble. 0.04 = pronounced |
| `noiseMix` | 0 – 0.4 | Amplitude of additive white-noise band. 0 = pure synth, 0.3+ = gravelly |

That's 7 knobs. A `CharacterRecipe.voice` block of ~30 bytes JSON.

### Per-slot envelope patches (5 fixed patches, NOT seed-derived)

The voice colour is the bomber's identity; the slot patches are the
*emotion*. All five share the same synth graph; they differ only in pitch
automation, envelope shape, and total length.

| Slot | Length | Pitch automation | Envelope | Vowel target |
|---|---|---|---|---|
| `place-bomb` | 120 ms | flat (basePitch) | attack 8 ms / decay 110 ms | F1/F2 at default (neutral grunt) |
| `hit` (shielded) | 180 ms | +30% pitch jump in first 25 ms, then decay | attack 5 ms / decay 175 ms | F1 +200 Hz (open mouth) |
| `pickup` | 150 ms | +50% pitch sweep over the full clip (rising) | attack 10 ms / decay 140 ms | F2 +400 Hz (brighten — chime-like) |
| `death` | 280 ms | −50% pitch sweep (deflate) + +50% vibratoDepth | attack 5 ms / decay 275 ms | F1 −200 Hz (close mouth — muffled) |
| `victory` | 260 ms | three-step rising: basePitch → +30% → +60% (arpeggio-ish) | attack 12 ms / decay each step 80 ms | F2 +200 Hz (cheerful) |

These five patches plus 7 voice knobs give 5 × ∞ = a per-bomber palette of
distinguishable emotional moments. Two bombers with very different seeds
will sound clearly different on the same slot; two bombers with the same
seed will sound identical.

### Implementation sketch (NOT for this story — for the feature story)

```ts
// New file: examples/kaboom-crew/src/voice-synth.ts
// Pure helpers (testable without Web Audio):
function voiceParamsFromSeed(seed: number): VoiceColour;       // 7 knobs
function emitVoice(ctx: AudioContextLike, colour: VoiceColour, slot: VoiceSlot, position?: Vec3): void;
// audio-fx.ts gains:
//   play("voice-place-bomb", { entityId, position })  →  emitVoice(slot="place-bomb", colour=lookup(entityId))
//   play("voice-hit", ...)
//   play("voice-pickup", ...)
//   play("voice-death", ...)
//   play("voice-victory", ...)
// audio-binding-system.ts fires the new events alongside the existing ones
// (bomb-place fires both "bomb-place" and "voice-place-bomb"; the bus is
// free to mix them — they sit in different spectral bands).
```

Per-bomber voice colour is computed once at recipe-instantiation time and
cached. Five slot patches are static maps from slot name → modulation
function. Total: ~80 LOC of new code, no new dependencies, full unit-test
coverage via the same `contextFactory` seam the existing synths use.

---

## 6. Out of scope (explicit, so the feature story has a clean perimeter)

The recommended approach **deliberately does not cover**:

- **Intelligible speech.** No words, no phonemes, no language. If we want
  "ow!" or "victory!" we use English vowels approximately, not stitched
  phonemes.
- **Multi-syllable utterances.** Each slot is one envelope. Victory's
  three-step pitch sweep reads as a flourish, not as "yay-hoo".
- **Lip sync.** Renderer has no mouth pivot. Out of scope until the
  bomber head gets a mouth socket (not on any roadmap epic).
- **Per-bomber slot variation.** Same seed always plays the same patch for
  the same slot — we don't randomise per-event within a session. Variance
  comes from the 7-knob voice colour, not from per-event jitter. If the
  same bomber dies twice they sound the same on both deaths. This is by
  design (replay / network consistency).
- **Voice-actor pipeline / pre-recorded samples.** Adding a `.wav` per
  emotion is cheap and tempting; it also drags in a content pipeline we
  don't have (CC0 licensing, format negotiation, asset bundling, voice
  direction). Defer indefinitely.
- **Genre-specific voices** (e.g. "monster", "robot", "child"). The 7-knob
  colour can be tuned to approximate any of these, but we ship one voice
  family.
- **Singing / pitched lines.** No melodic content. Victory's 3-step sweep
  is the closest we get.

---

## 7. Risks + open questions for the feature story

1. **Spectral collision with `blast`.** The existing `blast` SFX is a
   broadband noise burst + low-end thump. The `hit` voice fires
   simultaneously (shield consumption). If they overlap badly, the voice
   gets masked. Mitigation: voice formants live at 300–2400 Hz, blast
   thump lives at <200 Hz — but verify by ear once both run. If they
   clash, side-chain duck the blast on the `hit` slot.
2. **5 ms attack on a non-AudioWorklet path.** `AudioContext.currentTime`
   has ~5 ms scheduling granularity in some browsers; the 5 ms attack on
   `hit` may smear into 10 ms. Acceptable.
3. **Vowel identification is culture-bound.** F1/F2 tables we cited are
   American English. For non-verbal grunts this matters less — listeners
   read "vowel-ish blob" rather than "the vowel /a/" — but worth
   acknowledging that "a /u/ death-grunt" isn't universally /u/-shaped.
4. **Determinism vs. mute / pause.** `audio-fx.setMuted` already exists.
   Voice slots must respect it. No state to leak across mute toggles.
5. **Mobile autoplay policy.** Same as the existing synths — the
   `AudioContext` is lazy-initialised on the first `play()` call after a
   user gesture. Voice slots add no new gesture requirements.

---

## 8. Recommendation

Implement **source–filter formant synth, 7-knob voice colour, 5-slot
emotion patches** in `FEAT-PROCEDURAL-VOCAL-SYNTH-S-001`. Reuse the
existing `audio-fx.ts` graph topology and `contextFactory` test seam.
Skip every other family in §2. If formant tuning proves more fragile than
expected in playtest, fall back to additive partials (row 2) — same data
model, different synth backend, no schema change.

Estimated story size: comparable to S109 FEAT-SHIELD (1 sprint slot,
~5–8 hours implementation + tests + tuning).

---

## 9. Verification for this spike story

This spike is verified by:

- ✅ This document exists, covers all six required sections (design space,
  needs, references, recommendation, out-of-scope, risks).
- ✅ Recommendation names ONE primary approach + ONE fallback.
- ✅ Parameter sketch is concrete (7 knobs with explicit numeric ranges).
- ✅ Per-slot patches are concrete (5 fixed envelopes + pitch automations).
- ✅ Concrete references (papers, OSS projects, game references) cited.
- ✅ Out-of-scope list is non-empty and specific.

The feature story `FEAT-PROCEDURAL-VOCAL-SYNTH-S-001` can now proceed with
its design pre-locked.
