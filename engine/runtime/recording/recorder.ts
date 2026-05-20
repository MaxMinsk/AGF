// Record / replay v0.
//
// Captures the initial scene plus every applied `EngineCommand` with a
// monotonic index and an elapsed-seconds timestamp. The resulting file is a
// reproducible regression artifact: `engine replay <file>` drives a headless
// World through the same commands and diffs the final snapshot.

import type { EngineCommand } from "../../core/commands/types";
import type { SceneInput } from "../../core/ecs/types";
import type { WorldSnapshot } from "../inspect";

export const RECORDING_FORMAT_VERSION = 1;

export type RecordedCommand = {
  index: number;
  /** Seconds since the recorder started. */
  t: number;
  command: EngineCommand;
};

export type Recording = {
  agfFormatVersion: number;
  projectId?: string;
  scene: SceneInput;
  commands: RecordedCommand[];
  /** Optional final-state snapshot for replay verification. */
  finalSnapshot?: WorldSnapshot;
};

export type RecorderOptions = {
  scene: SceneInput;
  projectId?: string;
  /** Override the clock for tests. Defaults to `performance.now() / 1000`. */
  now?: () => number;
};

export type RecorderHandle = {
  capture(command: EngineCommand): void;
  captureMany(commands: ReadonlyArray<EngineCommand>): void;
  setFinalSnapshot(snapshot: WorldSnapshot): void;
  count(): number;
  toRecording(): Recording;
};

/**
 * S096 AGF-PROBE-RECORDING-LIST — pure helper that turns the runtime's
 * "live recorder + metadata" state into the `recordings` envelope the
 * probe returns. Exposed so the shape can be unit-tested without
 * spinning up startRuntime.
 */
export function buildRecordingList(state: {
  recorder?: { count(): number };
  startedAtMs?: number;
  projectId?: string;
}): {
  recordings: ReadonlyArray<{
    id: string;
    startedAt: string;
    commandCount: number;
    projectId?: string;
  }>;
} {
  if (state.recorder === undefined || state.startedAtMs === undefined) {
    return { recordings: [] };
  }
  const entry: {
    id: string;
    startedAt: string;
    commandCount: number;
    projectId?: string;
  } = {
    id: "live",
    startedAt: new Date(state.startedAtMs).toISOString(),
    commandCount: state.recorder.count()
  };
  if (state.projectId !== undefined) {
    entry.projectId = state.projectId;
  }
  return { recordings: [entry] };
}

export function createRecorder(options: RecorderOptions): RecorderHandle {
  const startedAt = (options.now ?? defaultNow)();
  const commands: RecordedCommand[] = [];
  let nextIndex = 0;
  let finalSnapshot: WorldSnapshot | undefined;

  const stamp = (): number => (options.now ?? defaultNow)() - startedAt;

  return {
    capture(command): void {
      commands.push({ index: nextIndex, t: stamp(), command });
      nextIndex += 1;
    },
    captureMany(batch): void {
      const t = stamp();
      for (const command of batch) {
        commands.push({ index: nextIndex, t, command });
        nextIndex += 1;
      }
    },
    setFinalSnapshot(snapshot): void {
      finalSnapshot = snapshot;
    },
    count(): number {
      return commands.length;
    },
    toRecording(): Recording {
      const recording: Recording = {
        agfFormatVersion: RECORDING_FORMAT_VERSION,
        scene: options.scene,
        commands: commands.slice()
      };
      if (options.projectId !== undefined) {
        recording.projectId = options.projectId;
      }
      if (finalSnapshot !== undefined) {
        recording.finalSnapshot = finalSnapshot;
      }
      return recording;
    }
  };
}

function defaultNow(): number {
  const g = globalThis as { performance?: { now?: () => number } };
  if (g.performance?.now !== undefined) {
    return g.performance.now() / 1000;
  }
  return Date.now() / 1000;
}
