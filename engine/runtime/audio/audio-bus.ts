// S84 AGF-AUDIO-PRIMITIVE.
//
// Tiny engine-level audio surface. Wraps HTMLAudioElement — enough
// for one-shot SFX (the only audio Kaboom Crew MVP-1 needs). When a
// project outgrows HTMLAudio (positional audio, ducking, music
// crossfade) we'll swap the backend to Web Audio API behind the
// same `AudioBus` shape, no project rewrite.
//
// SSR / no-DOM safety: `createAudioBus` returns `undefined` when
// `globalThis.document` is unavailable; consumers branch on the
// optional handle. The runtime exposes the bus as `runtime.audio`,
// so projects bind clips through that surface instead of touching
// the DOM directly.

export type PlayOptions = {
  /** 0..1 linear gain. Default 1. */
  volume?: number;
  /** Playback rate multiplier. Default 1. */
  rate?: number;
};

export type AudioBus = {
  /** Register a clip id → url. Decodes the audio element lazily on the first play. */
  load(id: string, url: string): void;
  /** Trigger a clip. No-op when the id is unknown — graceful degradation when an asset is missing. */
  play(id: string, options?: PlayOptions): void;
  /** Stop a clip if it's currently playing. */
  stop(id: string): void;
  /** Stop everything + release all <audio> elements. Idempotent. */
  dispose(): void;
  /** Listed clip ids (insertion order). Useful for diagnostics + tests. */
  clips(): ReadonlyArray<string>;
  /**
   * S095 AGF-AUDIO-MASTER-VOLUME. Master multiplier (clamped to [0, 1])
   * applied to every subsequent `play(id, { volume })` call:
   * `el.volume = clamp(masterVolume * (volume ?? 1), 0, 1)`. Calling
   * setMasterVolume() does NOT affect clips that are already playing —
   * those keep their current volume until they restart on the next
   * `play()`. Default 1.
   */
  setMasterVolume(value: number): number;
  /** Read the current master volume (0..1). */
  getMasterVolume(): number;
};

type Entry = {
  id: string;
  url: string;
  element: HTMLAudioElement | undefined;
};

/**
 * Build an audio bus rooted at `parent`. Returns `undefined` when no
 * DOM is available (Vitest unit-tests, Node CLI) so callers can
 * branch with `runtime.audio?.play(...)`.
 */
export function createAudioBus(parent?: HTMLElement): AudioBus | undefined {
  const doc = globalThis.document;
  if (doc === undefined) return undefined;

  const order: string[] = [];
  const entries = new Map<string, Entry>();
  let disposed = false;
  // S095 AGF-AUDIO-MASTER-VOLUME — master multiplier, clamp [0, 1].
  let masterVolume = 1;

  function ensureElement(entry: Entry): HTMLAudioElement {
    if (entry.element !== undefined) return entry.element;
    const el = doc.createElement("audio");
    el.preload = "auto";
    el.src = entry.url;
    // Hidden — the bus owns the lifecycle, no need for the controls UI.
    el.style.display = "none";
    (parent ?? doc.body).appendChild(el);
    entry.element = el;
    return el;
  }

  return {
    load(id: string, url: string): void {
      if (disposed) return;
      const existing = entries.get(id);
      if (existing !== undefined) {
        // Url change → release the old element so the next play() picks the new src.
        if (existing.url !== url) {
          if (existing.element?.parentNode !== null && existing.element !== undefined) {
            existing.element.parentNode?.removeChild(existing.element);
          }
          existing.url = url;
          existing.element = undefined;
        }
        return;
      }
      entries.set(id, { id, url, element: undefined });
      order.push(id);
    },
    play(id: string, options: PlayOptions = {}): void {
      if (disposed) return;
      const entry = entries.get(id);
      if (entry === undefined) return;
      const el = ensureElement(entry);
      // S095 AGF-AUDIO-MASTER-VOLUME — master multiplies per-call volume.
      el.volume = Math.max(0, Math.min(1, masterVolume * (options.volume ?? 1)));
      el.playbackRate = Math.max(0.1, options.rate ?? 1);
      // Restart from the top so back-to-back triggers don't queue silence.
      try {
        el.currentTime = 0;
      } catch {
        // Some browsers throw on currentTime before the metadata loads — safe to swallow.
      }
      // play() returns a promise; the project doesn't care about the result, but we
      // catch so unhandled-rejection noise doesn't pollute the console (autoplay block).
      const result = el.play();
      if (result !== undefined && typeof result.catch === "function") {
        result.catch(() => {
          // Most common cause: user gesture not yet observed (autoplay policy).
          // Project code can call play() again after the next interaction.
        });
      }
    },
    stop(id: string): void {
      if (disposed) return;
      const entry = entries.get(id);
      if (entry === undefined || entry.element === undefined) return;
      entry.element.pause();
      try {
        entry.element.currentTime = 0;
      } catch {
        // ignore
      }
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      for (const entry of entries.values()) {
        if (entry.element !== undefined) {
          try {
            entry.element.pause();
          } catch {
            // ignore
          }
          entry.element.removeAttribute("src");
          entry.element.load();
          if (entry.element.parentNode !== null) {
            entry.element.parentNode.removeChild(entry.element);
          }
        }
      }
      entries.clear();
      order.length = 0;
    },
    clips(): ReadonlyArray<string> {
      return [...order];
    },
    setMasterVolume(value: number): number {
      if (!Number.isFinite(value)) return masterVolume;
      masterVolume = Math.max(0, Math.min(1, value));
      return masterVolume;
    },
    getMasterVolume(): number {
      return masterVolume;
    }
  };
}
