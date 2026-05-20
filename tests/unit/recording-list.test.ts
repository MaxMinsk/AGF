// S096 AGF-PROBE-RECORDING-LIST — pure list-shape helper tests.

import { describe, expect, it } from "vitest";

import { buildRecordingList } from "../../engine/runtime/recording/recorder";

const fakeRecorder = (count: number): { count(): number } => ({ count: () => count });

describe("buildRecordingList (S096 AGF-PROBE-RECORDING-LIST)", () => {
  it("no live recorder → empty list", () => {
    expect(buildRecordingList({})).toEqual({ recordings: [] });
  });

  it("recorder without startedAtMs → empty list (defensive)", () => {
    expect(buildRecordingList({ recorder: fakeRecorder(5) })).toEqual({ recordings: [] });
  });

  it("recorder + startedAtMs → one entry with id 'live'", () => {
    const result = buildRecordingList({
      recorder: fakeRecorder(7),
      startedAtMs: 1_700_000_000_000
    });
    expect(result.recordings.length).toBe(1);
    expect(result.recordings[0]).toMatchObject({
      id: "live",
      commandCount: 7,
      startedAt: new Date(1_700_000_000_000).toISOString()
    });
  });

  it("includes projectId when supplied", () => {
    const result = buildRecordingList({
      recorder: fakeRecorder(0),
      startedAtMs: 1_700_000_000_000,
      projectId: "kaboom-crew"
    });
    expect(result.recordings[0]).toMatchObject({ projectId: "kaboom-crew" });
  });

  it("omits projectId when not supplied", () => {
    const result = buildRecordingList({
      recorder: fakeRecorder(0),
      startedAtMs: 1_700_000_000_000
    });
    expect(result.recordings[0]).not.toHaveProperty("projectId");
  });

  it("commandCount reflects the live count() at query time", () => {
    let n = 0;
    const recorder = { count: () => n };
    const stateA = buildRecordingList({ recorder, startedAtMs: 1 });
    n = 42;
    const stateB = buildRecordingList({ recorder, startedAtMs: 1 });
    expect(stateA.recordings[0]?.commandCount).toBe(0);
    expect(stateB.recordings[0]?.commandCount).toBe(42);
  });
});
