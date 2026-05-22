# Voice Synth Design — speech-like babble for Kaboom Crew

> **Status: design decision.** First pass: 2026-05-22.
> Companion to (and **partial override of**) `docs/research/voice-synth-research.md`.
> Owns the voice-synth direction for `GDP-2026-05-22-008`.
> Dev research artifact derived the **technical** sound-design space well;
> this doc disagrees with the **product** direction it concluded with.

---

## 1. The brief

User feedback 2026-05-22, paraphrased in English (the original quote
was in Russian; the repo-hygiene check forbids Cyrillic content in
tracked files, so the verbatim is replaced with this paraphrase):
> "I want the sounds the characters emit to feel like actual words —
> something like Animal Crossing, where the characters almost seem to
> be speaking."

What the user wants: **a "babble" voice that reads as **speech**, not as a
grunt**. The model is *Animal Crossing's "animalese"* — fast pitched
syllables strung together with the rhythm + cadence of speech, even
though no real words exist. The listener's brain parses it as "this
character is talking", not "this character grunted once."

What the dev research recommended: source–filter formant synth, single
180–280 ms envelope per emotion slot, **explicitly excluded
multi-syllable utterances** (§6 "Out of scope" bullet 2 of
voice-synth-research.md).

**This doc overrides that exclusion.** Multi-syllable IS the feature.
The grunt-shaped output the research recommended sells "a robot
reacted" but not "a character spoke." For the design centre we want,
the latter is what matters.

---

## 2. What we keep from the dev research

The research artifact is solid technical groundwork. We re-use:

- **Source–filter formant synthesis** as the per-vowel sound primitive.
  Sawtooth carrier → parallel bandpass filters at F1/F2/F3 → gain
  envelope is the right per-syllable primitive. We just don't ship one
  single envelope per slot — we ship a *sequence* of these.
- **The 7-knob seed-derived voice colour** as the bomber-identity layer
  (basePitchHz, F1, F2, formantQ, vibratoHz, vibratoDepth, noiseMix).
  Per-bomber identity comes from these knobs, NOT from per-emotion
  variation.
- **No assets, no neural TTS, no real speech.** All the §2 elimination
  rows of the research stand. Granular, LPC, phoneme TTS (SAM/MeSpeak),
  neural — all rejected for the same reasons as the research listed.
- **`contextFactory` test seam + Web Audio API graph topology** — the
  research's implementation skeleton remains, we just generate a
  multi-syllable schedule instead of a single envelope schedule.

---

## 3. The reference matrix — 8 known approaches to "fake speech"

To pick the right speech-like approach, here is the broader design
space than the research artifact covered. Rows 1–3 are pure-synth
(no assets); rows 4–6 are sample-based (asset cost); rows 7–8 are
heavy (rejected).

| # | Approach | Reference game | How it works | Fits us? |
|---|---|---|---|---|
| 1 | **Animalese (CV-babble)** | Animal Crossing (GameCube+) | Each text character → 1 short pitched chirp (~50 ms). Pitch and timbre vary per character. Strung at conversational pace. | ✅ **best fit** |
| 2 | **Undertale text-bleeps** | Undertale (2015) | Each text character → identical short tone at a CHARACTER-VOICE-specific pitch. Pace is text-scroll rate. | ✅ partial — too monotone solo, but the timing model fits |
| 3 | **Procedural CV-formant babble** | (no famous game; common in academic toys) | Sequence of (consonant transient + vowel formant) syllable pairs, formant filters move between vowels mid-phrase. | ✅ **the version we'll actually ship** — Animalese with proper vowels |
| 4 | **Pitched grunt samples** | Banjo-Kazooie, Donkey Kong 64 | One short recorded "ah" / "ooh" sample per character, pitch-shifted per "syllable". | ❌ needs voice-actor samples |
| 5 | **Simlish** | The Sims | Actor records full nonsense language; large bank of clips played back. | ❌ massive asset + actor cost |
| 6 | **Splatoon callouts** | Splatoon series | Pitched callout samples ("booyah!") — pre-recorded, pitch-shifted. | ❌ same as 4 |
| 7 | **Phoneme TTS engine** (SAM / eSpeak / MeSpeak) | DECtalk era | Stitches fixed phoneme samples for intelligible speech. | ❌ ~30 KB+ bundle, makes real words (not desired) |
| 8 | **Neural TTS / vocoder** | Modern AAA | seq2seq model emits waveform. | ❌ MB-scale weights, GPU, latency |

**Verdict:** row 3. It is Animalese with formant-shaped vowels —
better-tuned than Animal Crossing's classic chirps and just as
procedural. Row 1 (raw Animalese chirps) is the cheaper fallback if
formant tuning proves too fragile in playtest. Rows 4–8 are
permanently out.

---

## 4. Why multi-syllable is non-negotiable for the "talking" feel

Single-envelope synth (research recommendation):

```
[ENVELOPE attack 8 ms decay 110 ms]
[--------- 120 ms total ---------]
ONE pitched grunt. Player hears: "blip".
```

Multi-syllable synth (this doc's recommendation):

```
[Syl1] gap [Syl2] gap [Syl3]
[~80] [25] [~80] [25] [~80]
[----------- 290 ms total -----------]
THREE pitched syllables with cadence. Player hears: "bi-da-bo".
```

The total time budget is similar (~300 ms for both). What differs is
**rhythm**. The human ear classifies "speech" vs "noise" primarily by
inter-syllable timing, not by spectral content. A monotone single tone
at vowel formants reads as a beep; the same vowel content split into 3
syllables with 25 ms gaps reads as speech. This is exactly why Animal
Crossing's chirps work despite being trivially simple per-chirp.

The five emotion slots become *short utterances* instead of single
sounds:

- `place-bomb` → 3-syllable neutral mutter ("bi-da-bo")
- `hit` → 2-syllable sharp yelp ("wha-OO!")
- `pickup` → 3-syllable rising cheer ("yi-pi-pa!")
- `death` → 4-syllable falling-and-sustained whine ("wuu-uuh-uh-uh")
- `victory` → 5-syllable rising flourish ("yi-pi-pa-ha-a!")

Each utterance fits in 250–600 ms (still short enough to fire during
gameplay without delaying anything). Total duration is 2–4× the dev
research's single-envelope budget, which is fine — Animal Crossing's
animalese for "Hello!" runs ~400 ms; nobody perceives that as long.

---

## 5. The CV-babble synth (recommended approach)

### 5.1 Building blocks

Every utterance is a sequence of **syllables**. Every syllable is a
**consonant transient** (optional, 10–30 ms) followed by a **vowel
formant pulse** (40–100 ms), with a small **inter-syllable gap** (10–40
ms). Scheduled in advance via Web Audio `AudioContext.currentTime`.

```
[C][V][gap][C][V][gap][C][V]
```

| Sub-unit | DSP recipe (Web Audio) | Length |
|---|---|---|
| **Consonant** transient | One of: short noise burst (BufferSource of 5 ms white noise → bandpass at 2–4 kHz → gain envelope), OR brief sawtooth click (one-cycle saw at 1.5× basePitchHz). Selection per-syllable from a small set ('b','d','g','p','t','k','m','n','w','y') | 10–30 ms |
| **Vowel** pulse | Sawtooth oscillator at current pitch → 2 parallel bandpass filters at F1, F2 (the 7-knob voice colour values, possibly per-syllable-shifted ±10%) → gain envelope (5 ms attack, ramp to peak, decay) | 40–100 ms |
| **Inter-syllable gap** | Silence (no audio nodes scheduled — just an offset) | 10–40 ms |
| **Phrase contour** | A pre-computed array of pitch multipliers per syllable, driving each vowel's oscillator frequency. Rising / falling / flat per slot. | applied to vowel |

### 5.2 Per-slot phrase patches (5 fixed templates)

Each patch defines (a) the syllable count, (b) the pitch contour
shape, (c) the inter-syllable gap, and (d) which vowels appear (as F1/F2
deltas from the bomber's base voice colour).

| Slot | Syllable count | Pitch contour | Gap (ms) | Vowel sequence (F1/F2 deltas, in Hz from base) |
|---|---|---|---|---|
| `place-bomb` | 3 | flat (1.0, 1.0, 1.0) | 20 | (0,0), (0,+200), (-100,0) — "bi-da-bo" |
| `hit` (shielded) | 2 | (1.0, 0.7) — drop on second | 15 | (+150,+200), (0,-100) — "wha-OO!" |
| `pickup` | 3 | (1.0, 1.15, 1.3) — rising | 18 | (0,+300), (-50,+100), (-100,0) — "yi-pi-pa!" |
| `death` | 4 | (1.0, 0.85, 0.7, 0.55) — falling | 30 | (-150,-100), (-100,0), (-150,-100), (-100,-150) — "wuu-uuh-uh-uh" |
| `victory` | 5 | (1.0, 1.15, 1.3, 1.45, 1.5) — rising arpeggio | 22 | (0,+200), (-50,+100), (-100,0), (+50,+300), (+100,+200) — "yi-pi-pa-ha-a!" |

The vowel "names" are mnemonic — the player doesn't hear English
phonemes precisely; they hear vowel-like blobs in cadenced rhythm.
Listeners localise them to whatever language family they're used to
(Russian listener "wuh-uh-uh" ≈ English listener "ooh-ah-uh").

### 5.3 Per-bomber voice colour (expanded from research's 7 → 10 knobs)

The dev research's 7 knobs stay; we add 3 more to control the
*speech* aspect (not the *grunt* aspect).

| Knob | Range | Role | Status |
|---|---|---|---|
| `basePitchHz` | 90–260 | Vowel oscillator base frequency | research |
| `formantF1Hz` | 300–900 | First formant | research |
| `formantF2Hz` | 1200–2400 | Second formant | research |
| `formantQ` | 4–12 | Filter resonance | research |
| `vibratoHz` | 0–8 | Vibrato rate | research |
| `vibratoDepth` | 0–0.04 | Vibrato depth | research |
| `noiseMix` | 0–0.4 | Additive noise (gravel) | research |
| `phrasePaceMultiplier` | 0.6–1.4 | **NEW** — multiplies the slot's gap-ms (low = fast talker, high = slow) | THIS DOC |
| `consonantStyle` | 0–1 | **NEW** — 0 = pure noise transient, 0.5 = mixed, 1 = pure pitched click. Drives the "softer / harder" articulation feel | THIS DOC |
| `vowelDriftAmount` | 0–0.3 | **NEW** — multiplier on the slot's per-syllable F1/F2 deltas. 0 = monotone vowel, 0.3 = pronounced vowel variation. Drives "expressiveness" | THIS DOC |

10 knobs derived from `recipe.seed` via xorshift32. Recipe `voice`
block grows from ~30 bytes JSON to ~45 bytes. Still trivially small.

### 5.4 Implementation sketch

```ts
// examples/kaboom-crew/src/voice-synth.ts
// Pure helpers (no Web Audio dependency in the unit tests):

type VoiceColour = {
  basePitchHz: number;       formantF1Hz: number;       formantF2Hz: number;
  formantQ: number;          vibratoHz: number;         vibratoDepth: number;
  noiseMix: number;          phrasePaceMultiplier: number;
  consonantStyle: number;    vowelDriftAmount: number;
};

type VoiceSlot = "place-bomb" | "hit" | "pickup" | "death" | "victory";

type SyllableSchedule = {
  startMs: number;                  // offset from utterance start
  consonant: ConsonantSpec | null;  // optional transient
  vowel: VowelSpec;                 // mandatory vowel pulse
};

function voiceColourFromSeed(seed: number): VoiceColour;       // 10-knob derive
function planUtterance(colour: VoiceColour, slot: VoiceSlot): SyllableSchedule[];
function emitUtterance(ctx: AudioContext, schedule: SyllableSchedule[]): void;

// audio-fx.ts gains five new events:
//   play("voice-place-bomb", { entityId })
//   play("voice-hit", { entityId })
//   play("voice-pickup", { entityId })
//   play("voice-death", { entityId })
//   play("voice-victory", { entityId })
```

`planUtterance` is the pure deterministic function. Given the colour
and the slot, it returns the exact schedule (start times, pitches,
formant frequencies, gap lengths). The Web-Audio-touching `emitUtterance`
only handles the audio node setup. The 90/10 split keeps the
unit-test surface generous: tests can verify the schedule shape
without running an AudioContext.

Total estimated LOC: ~250 (compared to dev research's ~80). The extra
~170 LOC is the multi-syllable scheduling + the 3 extra knob mappings
+ the per-slot phrase tables.

---

## 6. What we override from `docs/research/voice-synth-research.md`

Concrete overrides (so dev sees the deltas at a glance):

| Research §6 "Out of scope" item | This doc's position |
|---|---|
| "**Intelligible speech.** No words, no phonemes, no language." | **PARTIALLY KEPT** — still no intelligible language, but DO use vowel-like phonemes (F1/F2-tuned vowels) and consonant-like transients. The result is babble that *sounds* like speech without being intelligible. |
| "**Multi-syllable utterances.** Each slot is one envelope." | **OVERRIDDEN** — multi-syllable is the design centre. 2–5 syllables per slot. |
| "**Lip sync.** Renderer has no mouth pivot." | **KEPT** — no mouth, no lip-sync. The babble drives no visual. |
| "**Per-bomber slot variation.** Same seed always plays the same patch." | **KEPT** — same bomber + same slot = identical utterance always. Variance is per-bomber via the 10 voice knobs, not per-event. |
| "**Voice-actor pipeline / pre-recorded samples.**" | **KEPT** — zero assets. All synthesis. |
| "**Genre-specific voices (monster/robot/child).**" | **KEPT** — we ship one voice family; bomber identity comes from the 10-knob colour. |
| "**Singing / pitched lines.**" | **KEPT loosely** — victory's 5-syllable rising arpeggio is the most musical we get; it stays under "expressive vocalisation", not "melody". |

§6 of the research was the *only* place we override. §1–5 + §7–9 stay
authoritative (the technical foundation is right).

---

## 7. Why this is still cheap

Even with multi-syllable, the cost is bounded:

- **CPU per utterance**: 5 syllables × (1 oscillator + 2 filters + 1
  noise burst) = ~20 audio nodes scheduled, all torn down within
  600 ms. Web Audio handles thousands of such schedules per second
  without breaking sweat.
- **Memory**: zero persistent. Schedule arrays are tens of objects,
  garbage-collected after each utterance.
- **Bundle**: still under the 10 KB synth code budget the dev research
  set. The 5 phrase tables are tiny constants.
- **Determinism**: planUtterance is fully pure. Same seed + same slot
  = bit-identical schedule. Test it with a snapshot fixture.
- **No new dependencies**. Web Audio API only.
- **Mute respects the existing `audio-fx.setMuted` path** — research
  §7 risk 4 handled identically.

---

## 8. Listener test (the QA bar)

The acceptance criterion is **the listener test**: two bombers with
different seeds talking through a round must trigger the perception
"these are two different characters speaking", not "these are two
different beep generators."

Concrete QA scenarios:

1. Two bombers with seeds 1 + 42 play a full round. After 10 seconds
   of listening, blindfolded listener must be able to identify which
   bomber just placed a bomb based on the voice alone (≥ 70% accuracy
   across 10 events).
2. The same bomber's pickup vs death vs victory must be
   distinguishable by emotion alone (rising vs falling vs sustained).
3. A non-Russian-speaking listener should describe the bomber as
   "speaking" rather than "beeping" when asked. (Anecdotal test, but
   it's the only test that catches the user's "almost-as-if-the-
   characters-are-speaking" criterion.)

If any of these fail, the synth needs more vowel variation or pace
differentiation between bombers. Tuning lever: increase
`vowelDriftAmount` range, increase `phrasePaceMultiplier` range, add
1–2 more vowels to the slot phrase tables.

---

## 9. Future hooks (NOT in scope for the immediate feature story)

These are deliberately punted so the first feature ships clean:

- **Per-emotion vocabulary expansion** — adding "fear" / "surprise" /
  "anger" slots later. The schedule format supports it; only the
  phrase patch table grows.
- **Phrase variation per bomber** — letting `recipe.voice.phraseSet`
  pick between {default, terse, talkative} preset families that
  re-shape syllable count + gap per slot. Currently all bombers
  share the slot patches; only the colour varies.
- **Server-side voice mute for accessibility** — when `?vocals=off`
  ships, the URL flag is global; per-bomber muting is not needed.
- **Cosmetic voice unlocks** — same hook as the cosmetic accessory
  unlocks (gdd.md Cosmetic unlocks): a cosmetic could swap the
  default voice colour preset. Defer until persistent profile lands.
- **Voice fade-out under simultaneous blast SFX** — if voice gets
  drowned out, side-chain duck the blast on voice events. Research
  §7 risk 1; address in tuning if it's actually a problem.

---

## 10. Recommendation summary

Implement **CV-babble (consonant + vowel) sequences** as the synth
backend. Five fixed slot phrase tables, 10 seed-derived voice-colour
knobs (the research's 7 + 3 new for cadence + articulation +
expressiveness). Source–filter formant per vowel (kept from research).
No samples, no TTS, no neural.

The dev research is right about *almost everything except scope*. We
extend the scope from single-envelope grunts to multi-syllable
babble. Everything else carries over.

Story `GDP-2026-05-22-008` rewritten under this design.

---

## 11. Open questions (resolved later)

1. **Phrase length variance per-bomber?** Currently each bomber uses
   the same syllable count for the same slot. Could vary via
   `recipe.voice.phraseLengthMultiplier` (0.7–1.3). Punted to §9.
2. **Russian-flavored vowels vs English-flavored vowels?** Vowel
   formants we cited are American English (Peterson & Barney). For
   non-verbal babble this matters less than for real speech, but
   could add a `recipe.voice.vowelLanguage` enum if playtest reveals
   a strong preference. Punt — listeners likely won't notice.
3. **Stuttering / hesitation patterns?** Inserting an extra gap mid-
   phrase ("yi-pi-... pa!") could read as "thinking". Out of scope
   for v1; revisit if the babble feels too uniform.
