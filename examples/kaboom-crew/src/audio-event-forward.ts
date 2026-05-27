// S145 — pure-helper extracted from bootstrap.ts so the audio-event
// wiring is unit-testable. The bug it documents: voice-* events
// only emit a synth utterance if entityId is forwarded; the prior
// bootstrap stripped entityId when building the audioFx.play()
// context, so every voice-place-bomb / voice-pickup / voice-hit /
// voice-death / voice-victory was silently dropped.

import type { AudioEventKind } from "./systems/audio-binding-system";

export type AudioForwardContext = {
  position?: readonly [number, number, number];
  entityId?: string;
};

export type AudioForwardSink = (
  kind: AudioEventKind,
  context: AudioForwardContext | undefined
) => void;

/**
 * Convert an audio-binding-system event context into the
 * PositionalPlayContext shape audioFx.play() expects. Critically:
 * voice-* events MUST carry entityId, because the voice synth uses
 * it to derive the per-bomber colour and refuses to play when it's
 * missing.
 */
export function forwardAudioEvent(
  kind: AudioEventKind,
  eventContext: AudioForwardContext | undefined,
  sink: AudioForwardSink
): void {
  const out: AudioForwardContext = {};
  if (eventContext?.position !== undefined) out.position = eventContext.position;
  if (eventContext?.entityId !== undefined) out.entityId = eventContext.entityId;
  sink(kind, Object.keys(out).length > 0 ? out : undefined);
}
