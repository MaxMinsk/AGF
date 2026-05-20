// S85 KABOOM-AUDIO-PROCEDURAL-SFX.
//
// Procedural Web Audio synth for the four Kaboom Crew SFX events. No
// CC0 binary assets to ship — every clip is generated on the fly via
// OscillatorNode + GainNode + (for the blast) BufferSource with white
// noise. AudioContext is created lazily on the first `play()` because
// browsers reject AudioContext construction before a user gesture
// (autoplay policy). The bootstrap calls `play(kind)` from the audio
// binding system, which is itself driven by keyboard / placement
// systems — so by the time we hit play() the user has typically
// already pressed a key. Multiple play() calls re-use the same
// context; dispose() tears it down so HMR replays don't leak audio
// graphs.

export type AudioEventKind =
  | "bomb-place"
  | "blast"
  | "pickup"
  | "death"
  | "match-won"
  | "match-lost"
  | "match-draw"
  | "footstep";

/**
 * S91 KABOOM-AUDIO-POSITIONAL-ADOPT. Optional world-space position
 * carried alongside each event. Bomber-driven events (footstep,
 * bomb-place, blast, death, pickup) pass [gx, 0, gz]; UI chimes
 * (match-won/lost/draw) omit it. When set, play() routes through a
 * PannerNode so the SFX pans by the listener's relative offset.
 */
export type PositionalPlayContext = {
  position?: readonly [number, number, number];
};

export type KaboomAudioFx = {
  play(kind: AudioEventKind, context?: PositionalPlayContext): void;
  dispose(): void;
  /** S89 KABOOM-PAUSE-AUDIO-MUTE. true → every play() is a no-op without tearing down the context. */
  setMuted(muted: boolean): void;
  /** Read the current mute state — drives the pause menu's toggle label. */
  isMuted(): boolean;
  /**
   * S91 KABOOM-AUDIO-POSITIONAL-ADOPT. Update the AudioListener's
   * world-space position so positional clips pan relative to it.
   * No-op when the AudioContext isn't initialised yet (browser
   * autoplay policy may delay creation until the first play()).
   */
  setListenerPosition(x: number, y: number, z: number): void;
};

export const AUDIO_VOLUME_STORAGE_KEY_EXPORT = "agf.audio.volume";

export type AudioFxOptions = {
  /** Test seam — supply a fake AudioContext constructor. */
  contextFactory?: () => AudioContextLike | undefined;
  /** Global gain multiplier for every SFX. Default 0.4. */
  masterGain?: number;
};

/**
 * S86 AGF-AUDIO-VOLUME-DIAL. Parse a URL `?audio=` value into a
 * normalised masterGain. Returns:
 *   `undefined`   — when the param is absent and no override should
 *                    apply (caller falls back to default + localStorage)
 *   `0`           — when the user explicitly requested mute
 *   `0..1`        — clamped numeric volume
 *
 * Accepted strings: 'off' / 'mute' (→ 0), 'on' (→ 1), bare numbers
 * '0.5', '1', '0' (clamped to 0..1). Anything else → undefined.
 */
export function parseAudioVolumeParam(raw: string | undefined | null): number | undefined {
  if (raw === undefined || raw === null) return undefined;
  const trimmed = raw.trim();
  if (trimmed === "") return undefined;
  const lower = trimmed.toLowerCase();
  if (lower === "off" || lower === "mute") return 0;
  if (lower === "on") return 1;
  const num = Number(trimmed);
  if (!Number.isFinite(num)) return undefined;
  if (num < 0) return 0;
  if (num > 1) return 1;
  return num;
}

const AUDIO_VOLUME_STORAGE_KEY = "agf.audio.volume";

/**
 * Resolve the effective master volume by checking, in order:
 *   1. `?audio=` from the URL (if provided AND parseable)
 *   2. localStorage[`agf.audio.volume`]
 *   3. The supplied default (1.0)
 * Side effect: when (1) is used, the value is also persisted to
 * localStorage so reloads without the param remember the choice.
 */
export function resolveAudioVolume(options: {
  search?: string;
  storage?: { getItem(key: string): string | null; setItem(key: string, value: string): void } | undefined;
  defaultVolume?: number;
} = {}): number {
  const defaultVolume = Math.max(0, Math.min(1, options.defaultVolume ?? 1));
  const storage = options.storage;
  let fromUrl: number | undefined;
  if (typeof options.search === "string" && options.search.length > 0) {
    try {
      fromUrl = parseAudioVolumeParam(new URLSearchParams(options.search).get("audio"));
    } catch {
      fromUrl = undefined;
    }
  }
  if (fromUrl !== undefined) {
    if (storage !== undefined) {
      try {
        storage.setItem(AUDIO_VOLUME_STORAGE_KEY, String(fromUrl));
      } catch {
        // ignore quota / disabled storage
      }
    }
    return fromUrl;
  }
  if (storage !== undefined) {
    try {
      const raw = storage.getItem(AUDIO_VOLUME_STORAGE_KEY);
      if (raw !== null) {
        const parsed = parseAudioVolumeParam(raw);
        if (parsed !== undefined) return parsed;
      }
    } catch {
      // ignore
    }
  }
  return defaultVolume;
}

// Narrow AudioContext surface the synth needs. Lets the unit test mock
// without dragging in the Web Audio types.
export type AudioContextLike = {
  state: string;
  destination: AudioNodeLike;
  currentTime: number;
  sampleRate: number;
  createGain(): GainNodeLike;
  createOscillator(): OscillatorNodeLike;
  createBufferSource(): BufferSourceLike;
  createBuffer(channels: number, length: number, sampleRate: number): AudioBufferLike;
  createBiquadFilter(): BiquadFilterLike;
  /** S91 KABOOM-AUDIO-POSITIONAL-ADOPT. Optional — the bus skips positional routing when unavailable. */
  createPanner?(): PannerNodeLike;
  /** S91 KABOOM-AUDIO-POSITIONAL-ADOPT. Optional — bus skips listener updates when unavailable. */
  listener?: AudioListenerLike;
  resume?(): Promise<void>;
  close?(): Promise<void>;
};
type AudioNodeLike = { connect(target: AudioNodeLike): void; disconnect?(): void };
type GainNodeLike = AudioNodeLike & {
  gain: { setValueAtTime(value: number, when: number): void; linearRampToValueAtTime(value: number, when: number): void; exponentialRampToValueAtTime(value: number, when: number): void };
};
type OscillatorNodeLike = AudioNodeLike & {
  type: string;
  frequency: { setValueAtTime(value: number, when: number): void; exponentialRampToValueAtTime(value: number, when: number): void; linearRampToValueAtTime(value: number, when: number): void };
  start(when?: number): void;
  stop(when?: number): void;
};
type BufferSourceLike = AudioNodeLike & {
  buffer: AudioBufferLike | null;
  start(when?: number): void;
  stop(when?: number): void;
};
type AudioBufferLike = { getChannelData(channel: number): Float32Array };
type BiquadFilterLike = AudioNodeLike & {
  type: string;
  frequency: { setValueAtTime(value: number, when: number): void };
};
// S91 KABOOM-AUDIO-POSITIONAL-ADOPT. PannerNode pans the gain chain by
// world-space position relative to the listener. Two APIs exist in
// browsers — the legacy mutator (setPosition) and the modern AudioParam
// (positionX). Type accepts both via optional members.
type PannerNodeLike = AudioNodeLike & {
  panningModel?: string;
  distanceModel?: string;
  refDistance?: number;
  maxDistance?: number;
  rolloffFactor?: number;
  setPosition?(x: number, y: number, z: number): void;
  positionX?: { setValueAtTime(value: number, when: number): void };
  positionY?: { setValueAtTime(value: number, when: number): void };
  positionZ?: { setValueAtTime(value: number, when: number): void };
};
type AudioListenerLike = {
  setPosition?(x: number, y: number, z: number): void;
  positionX?: { setValueAtTime(value: number, when: number): void };
  positionY?: { setValueAtTime(value: number, when: number): void };
  positionZ?: { setValueAtTime(value: number, when: number): void };
};

function defaultFactory(): AudioContextLike | undefined {
  const w = globalThis as unknown as {
    AudioContext?: new () => AudioContextLike;
    webkitAudioContext?: new () => AudioContextLike;
  };
  const Ctor = w.AudioContext ?? w.webkitAudioContext;
  if (Ctor === undefined) return undefined;
  try {
    return new Ctor();
  } catch {
    return undefined;
  }
}

export function createKaboomAudioFx(options: AudioFxOptions = {}): KaboomAudioFx {
  const factory = options.contextFactory ?? defaultFactory;
  const masterGain = Math.max(0, Math.min(1, options.masterGain ?? 0.4));
  let ctx: AudioContextLike | undefined;
  // S89 KABOOM-PAUSE-AUDIO-MUTE. When muted, play() returns early
  // without touching the AudioContext — the context stays alive so
  // unmute is a free no-arg toggle (no autoplay-policy round trip).
  let muted = masterGain === 0;
  // S095 KABOOM-AUDIO-MIXER-DUCK-ON-MATCH-END. Shared gain node sits
  // between every NON-match event and `c.destination`; ducked when a
  // match chime plays so simultaneous bomb/blast/footstep events feel
  // quieter and the chime sits on top. Match-* chimes bypass this
  // node (they connect to destination directly) so the chime itself
  // is unaffected.
  let masterDuckNode: GainNodeLike | undefined;

  function ensureContext(): AudioContextLike | undefined {
    if (ctx !== undefined) return ctx;
    const created = factory();
    if (created === undefined) return undefined;
    ctx = created;
    if (ctx.state === "suspended" && typeof ctx.resume === "function") {
      ctx.resume().catch(() => {
        // Browser may still reject; play() will silently no-op.
      });
    }
    // S095 — wire the shared duck node now so connectOutput can route
    // through it. Gain starts at 1.0 (no duck active).
    try {
      masterDuckNode = ctx.createGain();
      masterDuckNode.gain.setValueAtTime(1, ctx.currentTime);
      masterDuckNode.connect(ctx.destination);
    } catch {
      masterDuckNode = undefined;
    }
    return ctx;
  }

  function duckFor(c: AudioContextLike, durationSeconds: number, depth: number): void {
    if (masterDuckNode === undefined) return;
    const now = c.currentTime;
    const clampedDepth = Math.max(0, Math.min(1, depth));
    const safeDuration = Math.max(0.01, durationSeconds);
    try {
      masterDuckNode.gain.setValueAtTime(clampedDepth, now);
      masterDuckNode.gain.linearRampToValueAtTime(1, now + safeDuration);
    } catch {
      // ignore — duck failure shouldn't break gameplay
    }
  }

  // S91 KABOOM-AUDIO-POSITIONAL-ADOPT. Final routing step. When the
  // event carries a world-space position AND the AudioContext exposes
  // createPanner, the chain ends at a PannerNode (HRTF) before
  // destination. Otherwise we connect straight to destination — the
  // pre-S91 behaviour, unchanged for UI chimes.
  // S095 — `bypassDuck` is true for match-* chimes, false for every
  // gameplay event. When false (default) the chain ends at the shared
  // duck node so the active duck attenuates the event; when true it
  // ends at c.destination directly so the chime itself is at full
  // volume even while ducking other sounds.
  function connectOutput(
    c: AudioContextLike,
    gain: GainNodeLike,
    position: readonly [number, number, number] | undefined,
    bypassDuck = false
  ): void {
    const terminal: AudioNodeLike =
      !bypassDuck && masterDuckNode !== undefined ? masterDuckNode : c.destination;
    if (position === undefined || c.createPanner === undefined) {
      gain.connect(terminal);
      return;
    }
    const panner = c.createPanner();
    panner.panningModel = "HRTF";
    panner.distanceModel = "inverse";
    panner.refDistance = 2;
    panner.rolloffFactor = 1;
    panner.maxDistance = 60;
    const [x, y, z] = position;
    if (typeof panner.setPosition === "function") {
      panner.setPosition(x, y, z);
    } else if (panner.positionX !== undefined && panner.positionY !== undefined && panner.positionZ !== undefined) {
      const now = c.currentTime;
      panner.positionX.setValueAtTime(x, now);
      panner.positionY.setValueAtTime(y, now);
      panner.positionZ.setValueAtTime(z, now);
    }
    gain.connect(panner);
    panner.connect(terminal);
  }

  function envelope(c: AudioContextLike, gain: GainNodeLike, attack: number, peak: number, release: number): void {
    const now = c.currentTime;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(peak, now + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + attack + release);
  }

  function playBombPlace(c: AudioContextLike, position?: readonly [number, number, number]): void {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = "square";
    const now = c.currentTime;
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.exponentialRampToValueAtTime(80, now + 0.08);
    envelope(c, gain, 0.005, masterGain * 0.6, 0.08);
    osc.connect(gain);
    connectOutput(c, gain, position);
    osc.start(now);
    osc.stop(now + 0.12);
  }

  function playBlast(c: AudioContextLike, position?: readonly [number, number, number]): void {
    // White-noise burst → low-pass filter → envelope.
    const duration = 0.28;
    const buffer = c.createBuffer(1, Math.max(1, Math.floor(c.sampleRate * duration)), c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    const source = c.createBufferSource();
    source.buffer = buffer;
    const filter = c.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(800, c.currentTime);
    const gain = c.createGain();
    envelope(c, gain, 0.005, masterGain * 1.0, duration);
    source.connect(filter);
    filter.connect(gain);
    connectOutput(c, gain, position);
    source.start(c.currentTime);
    source.stop(c.currentTime + duration + 0.02);
  }

  function playPickup(c: AudioContextLike, position?: readonly [number, number, number]): void {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = "triangle";
    const now = c.currentTime;
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.linearRampToValueAtTime(720, now + 0.08);
    envelope(c, gain, 0.005, masterGain * 0.5, 0.16);
    osc.connect(gain);
    connectOutput(c, gain, position);
    osc.start(now);
    osc.stop(now + 0.18);
  }

  function playDeath(c: AudioContextLike, position?: readonly [number, number, number]): void {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = "sawtooth";
    const now = c.currentTime;
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.exponentialRampToValueAtTime(60, now + 0.36);
    envelope(c, gain, 0.01, masterGain * 0.7, 0.36);
    osc.connect(gain);
    connectOutput(c, gain, position);
    osc.start(now);
    osc.stop(now + 0.4);
  }

  // S88 KABOOM-WIN-CHIME. Three short procedural chords on match
  // resolution. Triumph triad (won), descending minor (lost), neutral
  // perfect-fifth (draw). Each is a single AudioContext frame; the
  // dial scales through `masterGain` so the existing ?audio= +
  // localStorage path keeps working.
  function playChord(c: AudioContextLike, freqs: ReadonlyArray<number>, totalSeconds: number, gainScale = 0.45, position?: readonly [number, number, number], bypassDuck = false): void {
    const now = c.currentTime;
    for (const f of freqs) {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(f, now);
      envelope(c, gain, 0.01, masterGain * gainScale, totalSeconds);
      osc.connect(gain);
      connectOutput(c, gain, position, bypassDuck);
      osc.start(now);
      osc.stop(now + totalSeconds + 0.05);
    }
  }
  function playMatchWon(c: AudioContextLike, position?: readonly [number, number, number]): void {
    // C major triad (C5 E5 G5). bypassDuck=true so the chime sits on
    // top of the active duck rather than getting attenuated by it.
    playChord(c, [523.25, 659.25, 783.99], 0.6, 0.5, position, true);
  }
  function playMatchLost(c: AudioContextLike, position?: readonly [number, number, number]): void {
    // A minor descent (A4 → F4 → D4). bypassDuck — see playMatchWon.
    const now = c.currentTime;
    const seq: Array<{ freq: number; offset: number }> = [
      { freq: 440, offset: 0 },
      { freq: 349.23, offset: 0.18 },
      { freq: 293.66, offset: 0.36 }
    ];
    for (const note of seq) {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(note.freq, now + note.offset);
      envelope(c, gain, 0.01, masterGain * 0.45, 0.32);
      gain.gain.setValueAtTime(0, now);
      osc.connect(gain);
      connectOutput(c, gain, position, true);
      osc.start(now + note.offset);
      osc.stop(now + note.offset + 0.35);
    }
  }
  function playMatchDraw(c: AudioContextLike, position?: readonly [number, number, number]): void {
    // Perfect fifth — open neutral tone. bypassDuck — see playMatchWon.
    playChord(c, [392.0, 587.33], 0.5, 0.4, position, true);
  }

  // S90 KABOOM-FOOTSTEP-TICK. ~25 ms low-gain click — barely audible
  // solo, satisfying when chained one per cell crossing. Triangle wave
  // around 180 Hz with a sharp gain envelope; lowpass shaves harshness.
  function playFootstep(c: AudioContextLike, position?: readonly [number, number, number]): void {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = "triangle";
    const now = c.currentTime;
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.exponentialRampToValueAtTime(120, now + 0.025);
    envelope(c, gain, 0.002, masterGain * 0.18, 0.025);
    osc.connect(gain);
    connectOutput(c, gain, position);
    osc.start(now);
    osc.stop(now + 0.05);
  }

  return {
    play(kind: AudioEventKind, context?: PositionalPlayContext): void {
      if (muted) return;
      const c = ensureContext();
      if (c === undefined) return;
      // S91 KABOOM-AUDIO-POSITIONAL-ADOPT. Bomber-driven events pass
      // through the panner when a position is provided; UI chimes
      // (match-*) ignore the position even if the caller supplies one
      // — players expect those at full stereo, not localised.
      const pos = context?.position;
      try {
        if (kind === "bomb-place") playBombPlace(c, pos);
        else if (kind === "blast") playBlast(c, pos);
        else if (kind === "pickup") playPickup(c, pos);
        else if (kind === "death") playDeath(c, pos);
        else if (kind === "match-won") { duckFor(c, 0.6, 0.3); playMatchWon(c); }
        else if (kind === "match-lost") { duckFor(c, 0.6, 0.3); playMatchLost(c); }
        else if (kind === "match-draw") { duckFor(c, 0.6, 0.3); playMatchDraw(c); }
        else if (kind === "footstep") playFootstep(c, pos);
      } catch {
        // Browser quirks (e.g. context closed) — fail silent so a
        // misbehaving audio path doesn't break gameplay.
      }
    },
    dispose(): void {
      if (ctx === undefined) return;
      try {
        if (typeof ctx.close === "function") ctx.close().catch(() => {});
      } catch {
        // ignore
      }
      ctx = undefined;
    },
    setMuted(next: boolean): void {
      muted = next;
    },
    isMuted(): boolean {
      return muted;
    },
    setListenerPosition(x: number, y: number, z: number): void {
      // S91 KABOOM-AUDIO-POSITIONAL-ADOPT. AudioContext may not exist
      // yet (autoplay policy delays creation until first play). When
      // it does, push the new listener position. Two API styles —
      // legacy setPosition vs modern positionX AudioParam.
      if (ctx === undefined || ctx.listener === undefined) return;
      const listener = ctx.listener;
      try {
        if (typeof listener.setPosition === "function") {
          listener.setPosition(x, y, z);
        } else if (listener.positionX !== undefined && listener.positionY !== undefined && listener.positionZ !== undefined) {
          const now = ctx.currentTime;
          listener.positionX.setValueAtTime(x, now);
          listener.positionY.setValueAtTime(y, now);
          listener.positionZ.setValueAtTime(z, now);
        }
      } catch {
        // ignore — listener update failure isn't worth breaking gameplay
      }
    }
  };
}
