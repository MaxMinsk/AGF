// `engine replay <file>` — drive a headless `World` through a recorded
// command stream and emit the resulting `WorldSnapshot`. Supports
// `--expect <snapshot.json>` to fail on drift, which makes recorded
// playtests usable as regression artifacts.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { applyCommand } from "../../core/commands/command-queue";
import { World } from "../../core/ecs/world";
import { snapshotWorld, type WorldSnapshot } from "../../runtime/inspect";
import type { Recording } from "../../runtime/recording/recorder";
import type { TimeContext } from "../../core/loop/types";

export type ReplayResult = {
  recordingFile: string;
  commandsApplied: number;
  finalSnapshot: WorldSnapshot;
  drift?: {
    expected: WorldSnapshot;
    observed: WorldSnapshot;
    differences: string[];
  };
};

export function loadRecording(filePath: string): Recording {
  const absolute = resolve(filePath);
  if (!existsSync(absolute)) {
    throw new Error(`Recording not found: ${absolute}`);
  }
  return JSON.parse(readFileSync(absolute, "utf8")) as Recording;
}

export function replay(filePath: string, expectPath?: string): ReplayResult {
  const recording = loadRecording(filePath);
  const world = World.fromScene(recording.scene);
  for (const entry of recording.commands) {
    applyCommand(world, entry.command);
  }

  const time: TimeContext = {
    elapsed: 0,
    dt: 0,
    fixedDt: 1 / 60,
    frameCount: 0,
    fixedStepCount: 0
  };
  const finalSnapshot = snapshotWorld(world, time);

  const result: ReplayResult = {
    recordingFile: resolve(filePath),
    commandsApplied: recording.commands.length,
    finalSnapshot
  };

  if (expectPath !== undefined) {
    const expected = JSON.parse(readFileSync(resolve(expectPath), "utf8")) as WorldSnapshot;
    const differences = diffSnapshots(expected, finalSnapshot);
    if (differences.length > 0) {
      result.drift = { expected, observed: finalSnapshot, differences };
    }
  } else if (recording.finalSnapshot !== undefined) {
    const differences = diffSnapshots(recording.finalSnapshot, finalSnapshot);
    if (differences.length > 0) {
      result.drift = { expected: recording.finalSnapshot, observed: finalSnapshot, differences };
    }
  }

  return result;
}

export function formatReplay(result: ReplayResult): string {
  const lines: string[] = [];
  lines.push(`Replay: ${result.recordingFile}`);
  lines.push(`  commands applied: ${result.commandsApplied}`);
  lines.push(`  final entities: ${result.finalSnapshot.entityCount}`);
  if (result.drift !== undefined) {
    lines.push(`  drift: ${result.drift.differences.length} difference(s)`);
    for (const diff of result.drift.differences.slice(0, 10)) {
      lines.push(`    - ${diff}`);
    }
    if (result.drift.differences.length > 10) {
      lines.push(`    ... (+${result.drift.differences.length - 10} more)`);
    }
  } else {
    lines.push(`  drift: none`);
  }
  return lines.join("\n");
}

export function writeSnapshot(snapshot: WorldSnapshot, outPath: string): void {
  writeFileSync(resolve(outPath), JSON.stringify(snapshot, null, 2));
}

function diffSnapshots(a: WorldSnapshot, b: WorldSnapshot): string[] {
  const differences: string[] = [];
  if (a.entityCount !== b.entityCount) {
    differences.push(`entityCount: expected ${a.entityCount}, got ${b.entityCount}`);
  }
  const aById = new Map(a.entities.map((entity) => [entity.id, entity]));
  const bById = new Map(b.entities.map((entity) => [entity.id, entity]));
  for (const [id, expected] of aById) {
    const observed = bById.get(id);
    if (observed === undefined) {
      differences.push(`entity "${id}": missing in observed snapshot`);
      continue;
    }
    const expectedKeys = Object.keys(expected.components).sort();
    const observedKeys = Object.keys(observed.components).sort();
    if (expectedKeys.join(",") !== observedKeys.join(",")) {
      differences.push(
        `entity "${id}" components: expected [${expectedKeys.join(", ")}], got [${observedKeys.join(", ")}]`
      );
      continue;
    }
    for (const key of expectedKeys) {
      const expectedValue = JSON.stringify(expected.components[key]);
      const observedValue = JSON.stringify(observed.components[key]);
      if (expectedValue !== observedValue) {
        differences.push(`entity "${id}" component "${key}" drifted`);
      }
    }
  }
  for (const id of bById.keys()) {
    if (!aById.has(id)) {
      differences.push(`entity "${id}": present in observed snapshot but not expected`);
    }
  }
  return differences;
}
