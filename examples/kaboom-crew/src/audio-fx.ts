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

export type AudioEventKind = "bomb-place" | "blast" | "pickup" | "death";

export type KaboomAudioFx = {
  play(kind: AudioEventKind): void;
  dispose(): void;
};

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
    return ctx;
  }

  function envelope(c: AudioContextLike, gain: GainNodeLike, attack: number, peak: number, release: number): void {
    const now = c.currentTime;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(peak, now + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + attack + release);
  }

  function playBombPlace(c: AudioContextLike): void {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = "square";
    const now = c.currentTime;
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.exponentialRampToValueAtTime(80, now + 0.08);
    envelope(c, gain, 0.005, masterGain * 0.6, 0.08);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(now);
    osc.stop(now + 0.12);
  }

  function playBlast(c: AudioContextLike): void {
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
    gain.connect(c.destination);
    source.start(c.currentTime);
    source.stop(c.currentTime + duration + 0.02);
  }

  function playPickup(c: AudioContextLike): void {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = "triangle";
    const now = c.currentTime;
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.linearRampToValueAtTime(720, now + 0.08);
    envelope(c, gain, 0.005, masterGain * 0.5, 0.16);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(now);
    osc.stop(now + 0.18);
  }

  function playDeath(c: AudioContextLike): void {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = "sawtooth";
    const now = c.currentTime;
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.exponentialRampToValueAtTime(60, now + 0.36);
    envelope(c, gain, 0.01, masterGain * 0.7, 0.36);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(now);
    osc.stop(now + 0.4);
  }

  return {
    play(kind: AudioEventKind): void {
      const c = ensureContext();
      if (c === undefined) return;
      try {
        if (kind === "bomb-place") playBombPlace(c);
        else if (kind === "blast") playBlast(c);
        else if (kind === "pickup") playPickup(c);
        else if (kind === "death") playDeath(c);
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
    }
  };
}
