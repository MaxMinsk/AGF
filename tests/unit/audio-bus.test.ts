// S84 AGF-AUDIO-PRIMITIVE.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAudioBus } from "../../engine/runtime/audio/audio-bus";

type FakeAudio = {
  src: string;
  volume: number;
  playbackRate: number;
  currentTime: number;
  preload: string;
  style: { display: string };
  parentNode: { removeChild(node: unknown): void } | null;
  play: ReturnType<typeof vi.fn>;
  pause: ReturnType<typeof vi.fn>;
  load: ReturnType<typeof vi.fn>;
  removeAttribute: ReturnType<typeof vi.fn>;
};

const createdElements: FakeAudio[] = [];
const appendChildSpy = vi.fn();
const removeChildSpy = vi.fn();

function makeFakeDocument(): Document {
  return {
    createElement(tag: string): unknown {
      expect(tag).toBe("audio");
      const el: FakeAudio = {
        src: "",
        volume: 1,
        playbackRate: 1,
        currentTime: 0,
        preload: "",
        style: { display: "" },
        parentNode: { removeChild: removeChildSpy },
        play: vi.fn(() => Promise.resolve()),
        pause: vi.fn(),
        load: vi.fn(),
        removeAttribute: vi.fn()
      };
      createdElements.push(el);
      return el;
    },
    body: { appendChild: appendChildSpy }
  } as unknown as Document;
}

describe("createAudioBus (S84 AGF-AUDIO-PRIMITIVE)", () => {
  beforeEach(() => {
    createdElements.length = 0;
    appendChildSpy.mockReset();
    removeChildSpy.mockReset();
    (globalThis as unknown as { document?: unknown }).document = makeFakeDocument();
  });

  afterEach(() => {
    delete (globalThis as unknown as { document?: unknown }).document;
  });

  it("returns undefined when no DOM is available (SSR / Node)", () => {
    delete (globalThis as unknown as { document?: unknown }).document;
    expect(createAudioBus()).toBeUndefined();
  });

  it("load() registers a clip id; clips() lists insertion order", () => {
    const bus = createAudioBus()!;
    bus.load("a", "/a.wav");
    bus.load("b", "/b.wav");
    expect(bus.clips()).toEqual(["a", "b"]);
    // Lazy element creation — load doesn't materialise the <audio> tag yet.
    expect(createdElements).toHaveLength(0);
  });

  it("play() lazily creates an <audio> element + invokes play()", () => {
    const bus = createAudioBus()!;
    bus.load("boom", "/boom.wav");
    bus.play("boom", { volume: 0.6, rate: 1.2 });
    expect(createdElements).toHaveLength(1);
    expect(createdElements[0]?.src).toBe("/boom.wav");
    expect(createdElements[0]?.volume).toBe(0.6);
    expect(createdElements[0]?.playbackRate).toBe(1.2);
    expect(createdElements[0]?.play).toHaveBeenCalledTimes(1);
  });

  it("play() on unknown clip is a no-op (graceful)", () => {
    const bus = createAudioBus()!;
    expect(() => bus.play("missing")).not.toThrow();
    expect(createdElements).toHaveLength(0);
  });

  it("subsequent play() re-uses the same element + restarts from the top", () => {
    const bus = createAudioBus()!;
    bus.load("clip", "/c.wav");
    bus.play("clip");
    bus.play("clip");
    expect(createdElements).toHaveLength(1);
    expect(createdElements[0]?.play).toHaveBeenCalledTimes(2);
    expect(createdElements[0]?.currentTime).toBe(0);
  });

  it("stop() pauses + rewinds without releasing the element", () => {
    const bus = createAudioBus()!;
    bus.load("a", "/a.wav");
    bus.play("a");
    bus.stop("a");
    expect(createdElements[0]?.pause).toHaveBeenCalledTimes(1);
  });

  it("S095 AGF-AUDIO-MASTER-VOLUME: getMasterVolume defaults to 1; setMasterVolume clamps + returns the applied value", () => {
    const bus = createAudioBus()!;
    expect(bus.getMasterVolume()).toBe(1);
    expect(bus.setMasterVolume(0.5)).toBe(0.5);
    expect(bus.getMasterVolume()).toBe(0.5);
    // Clamping: above 1, below 0.
    expect(bus.setMasterVolume(99)).toBe(1);
    expect(bus.setMasterVolume(-5)).toBe(0);
    // Non-finite values are ignored — current master stays.
    bus.setMasterVolume(0.4);
    expect(bus.setMasterVolume(Number.NaN)).toBe(0.4);
    expect(bus.setMasterVolume(Infinity)).toBe(0.4);
  });

  it("S095 AGF-AUDIO-MASTER-VOLUME: play() multiplies master * per-call volume on el.volume", () => {
    const bus = createAudioBus()!;
    bus.load("a", "/a.wav");
    bus.setMasterVolume(0.4);
    bus.play("a", { volume: 0.5 });
    expect(createdElements[0]?.volume).toBeCloseTo(0.2, 5);
    // Subsequent play with new master + default volume → master * 1.
    bus.setMasterVolume(0.6);
    bus.play("a");
    expect(createdElements[0]?.volume).toBeCloseTo(0.6, 5);
  });

  it("S095 AGF-AUDIO-MASTER-VOLUME: master * volume clamps at 1.0 so excessive per-call volume can't overshoot", () => {
    const bus = createAudioBus()!;
    bus.load("a", "/a.wav");
    bus.setMasterVolume(0.5);
    // Per-call volume 5 would push final to 2.5 — must clamp to 1.0.
    bus.play("a", { volume: 5 });
    expect(createdElements[0]?.volume).toBe(1);
  });

  it("dispose() pauses every clip + removes from the DOM + is idempotent", () => {
    const bus = createAudioBus()!;
    bus.load("a", "/a.wav");
    bus.load("b", "/b.wav");
    bus.play("a");
    bus.play("b");
    bus.dispose();
    expect(createdElements[0]?.pause).toHaveBeenCalled();
    expect(createdElements[1]?.pause).toHaveBeenCalled();
    expect(removeChildSpy).toHaveBeenCalledTimes(2);
    // Second dispose stays silent.
    bus.dispose();
    expect(removeChildSpy).toHaveBeenCalledTimes(2);
    // Post-dispose play() is a no-op.
    bus.play("a");
    expect(createdElements[0]?.play).toHaveBeenCalledTimes(1);
  });
});
