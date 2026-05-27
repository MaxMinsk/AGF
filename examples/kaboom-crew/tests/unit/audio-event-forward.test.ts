// S145 — regression test for the voice-* wiring bug.
//
// Live playtest: voice-place-bomb / voice-hit / voice-pickup / voice-death
// / voice-victory never produced any audible voice. Root cause: the
// bootstrap audio-event handler built a play() context that included
// only `position`, stripping the `entityId` that the voice synth needs
// to derive its per-bomber colour. audio-fx playVoice() short-circuits
// on `entityId === undefined`, so every voice event was silently
// swallowed.
//
// forwardAudioEvent is the extracted wiring function. These tests pin
// the contract: voice events MUST carry entityId through to the sink.

import { describe, expect, it, vi } from "vitest";

import { forwardAudioEvent } from "../../src/audio-event-forward";

describe("forwardAudioEvent (S145)", () => {
  it("voice-pickup forwards entityId to the sink", () => {
    const sink = vi.fn();
    forwardAudioEvent("voice-pickup", { entityId: "player.1", position: [3, 0, 4] }, sink);
    expect(sink).toHaveBeenCalledTimes(1);
    const [, ctx] = sink.mock.calls[0]!;
    expect(ctx?.entityId).toBe("player.1");
    expect(ctx?.position).toEqual([3, 0, 4]);
  });

  it("voice-death forwards entityId even without position", () => {
    const sink = vi.fn();
    forwardAudioEvent("voice-death", { entityId: "bot.2" }, sink);
    expect(sink).toHaveBeenCalledWith("voice-death", { entityId: "bot.2" });
  });

  it("voice-place-bomb forwards entityId — pin the regression for the silent-voice bug", () => {
    const sink = vi.fn();
    forwardAudioEvent("voice-place-bomb", { entityId: "bot.1", position: [5, 0, 5] }, sink);
    const ctx = sink.mock.calls[0]?.[1];
    expect(ctx?.entityId, "voice-place-bomb must carry entityId; without it audio-fx playVoice silently drops the call").toBe("bot.1");
  });

  it("non-voice events still forward position when entityId is absent", () => {
    const sink = vi.fn();
    forwardAudioEvent("blast", { position: [4, 0, 7] }, sink);
    expect(sink).toHaveBeenCalledWith("blast", { position: [4, 0, 7] });
  });

  it("empty context → forwards undefined (lets audioFx fall through to the default path)", () => {
    const sink = vi.fn();
    forwardAudioEvent("match-won", undefined, sink);
    expect(sink).toHaveBeenCalledWith("match-won", undefined);
    forwardAudioEvent("blast", {}, sink);
    expect(sink).toHaveBeenLastCalledWith("blast", undefined);
  });

  it("all 5 voice slots forward entityId end-to-end", () => {
    const voiceSlots = [
      "voice-place-bomb",
      "voice-hit",
      "voice-pickup",
      "voice-death",
      "voice-victory"
    ] as const;
    for (const kind of voiceSlots) {
      const sink = vi.fn();
      forwardAudioEvent(kind, { entityId: "bomber.x", position: [1, 0, 2] }, sink);
      const ctx = sink.mock.calls[0]?.[1];
      expect(ctx?.entityId, `${kind} must carry entityId`).toBe("bomber.x");
    }
  });
});
