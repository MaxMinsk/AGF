import { describe, expect, it } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRecorder } from "../../engine/runtime/recording/recorder";
import { World } from "../../engine/core/ecs/world";
import { applyCommand } from "../../engine/core/commands/command-queue";
import { snapshotWorld } from "../../engine/runtime/inspect";
import { replay } from "../../engine/tools/replay/project-replay";
import type { EngineCommand } from "../../engine/core/commands/types";
import type { SceneInput } from "../../engine/core/ecs/types";
import type { TimeContext } from "../../engine/core/loop/types";

const here = dirname(fileURLToPath(import.meta.url));
const sandboxRoot = resolve(here, "../tmp/replay");

function setupSandbox(name: string): string {
  const dir = resolve(sandboxRoot, name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  return dir;
}

const baseScene: SceneInput = {
  id: "test",
  entities: [
    { id: "drone", components: { transform: { position: [0, 0, 0] } } }
  ]
};

const time: TimeContext = {
  elapsed: 0,
  dt: 0,
  fixedDt: 1 / 60,
  frameCount: 0,
  fixedStepCount: 0
};

describe("record + replay v0", () => {
  it("captures commands and replays them deterministically", () => {
    let clock = 0;
    const recorder = createRecorder({ scene: baseScene, projectId: "test", now: () => clock });

    const world = World.fromScene(baseScene);
    const commands: EngineCommand[] = [
      { kind: "entity.create", entityId: "core-a", components: { transform: { position: [1, 0, 0] } } },
      { kind: "component.set", entityId: "drone", component: "transform", data: { position: [2, 0, 0] } },
      { kind: "component.set", entityId: "core-a", component: "transform", data: { position: [3, 0, 0] } }
    ];

    for (const command of commands) {
      clock += 0.05;
      applyCommand(world, command);
      recorder.capture(command);
    }
    recorder.setFinalSnapshot(snapshotWorld(world, time));
    const recording = recorder.toRecording();

    expect(recording.commands).toHaveLength(3);
    expect(recording.commands[0]?.t).toBeCloseTo(0.05, 5);
    expect(recording.finalSnapshot?.entityCount).toBe(2);

    const dir = setupSandbox("deterministic");
    const recordingFile = resolve(dir, "test.replay.json");
    writeFileSync(recordingFile, JSON.stringify(recording, null, 2));

    const result = replay(recordingFile);

    expect(result.commandsApplied).toBe(3);
    expect(result.finalSnapshot.entityCount).toBe(2);
    expect(result.drift).toBeUndefined();
  });

  it("flags drift when an --expect snapshot disagrees", () => {
    const recorder = createRecorder({ scene: baseScene, projectId: "test", now: () => 0 });
    const world = World.fromScene(baseScene);
    const cmd: EngineCommand = {
      kind: "component.set",
      entityId: "drone",
      component: "transform",
      data: { position: [5, 0, 0] }
    };
    applyCommand(world, cmd);
    recorder.capture(cmd);
    recorder.setFinalSnapshot(snapshotWorld(world, time));

    const dir = setupSandbox("drift");
    const recordingFile = resolve(dir, "test.replay.json");
    writeFileSync(recordingFile, JSON.stringify(recorder.toRecording(), null, 2));

    const expected = snapshotWorld(World.fromScene(baseScene), time);
    const expectFile = resolve(dir, "expected.snapshot.json");
    writeFileSync(expectFile, JSON.stringify(expected, null, 2));

    const result = replay(recordingFile, expectFile);
    expect(result.drift).toBeDefined();
    expect(result.drift?.differences[0]).toMatch(/transform/);
  });
});
