// Procedural beep cues for Beacon World gameplay events.
//
// Web Audio is used directly so we ship zero audio assets in v0. Browsers
// require a user gesture before an AudioContext can `start()`, so we lazily
// instantiate on the first play call and silently swallow failures.

export type PingKind = "pickup" | "deposit" | "damage";

export type SoundPings = {
  play(kind: PingKind): void;
  /** Drop the AudioContext (used by app dispose). */
  dispose(): void;
};

type PingConfig = {
  frequency: number;
  durationSeconds: number;
  gain: number;
  type: OscillatorType;
};

const PRESETS: Record<PingKind, PingConfig> = {
  pickup: { frequency: 880, durationSeconds: 0.08, gain: 0.06, type: "triangle" },
  deposit: { frequency: 660, durationSeconds: 0.18, gain: 0.08, type: "sine" },
  damage: { frequency: 180, durationSeconds: 0.22, gain: 0.1, type: "sawtooth" }
};

export function createSoundPings(): SoundPings {
  let context: AudioContext | undefined;

  const ensureContext = (): AudioContext | undefined => {
    if (context !== undefined) {
      return context;
    }
    const w = globalThis as { AudioContext?: typeof AudioContext };
    if (w.AudioContext === undefined) {
      return undefined;
    }
    try {
      context = new w.AudioContext();
      return context;
    } catch {
      return undefined;
    }
  };

  return {
    play(kind): void {
      const ctx = ensureContext();
      if (ctx === undefined) {
        return;
      }
      const preset = PRESETS[kind];
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = preset.type;
      oscillator.frequency.value = preset.frequency;
      gain.gain.value = preset.gain;
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + preset.durationSeconds);
      oscillator.connect(gain).connect(ctx.destination);
      oscillator.start();
      oscillator.stop(ctx.currentTime + preset.durationSeconds);
    },
    dispose(): void {
      if (context !== undefined) {
        void context.close();
        context = undefined;
      }
    }
  };
}
