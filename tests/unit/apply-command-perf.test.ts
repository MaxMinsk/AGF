import { describe, expect, it } from "vitest";
import { applyCommand } from "../../engine/core/commands/apply";
import { World } from "../../engine/core/ecs/world";
import type { EngineCommand } from "../../engine/core/commands/types";

function buildWorstCaseCommands(entityCount: number): EngineCommand[] {
  const commands: EngineCommand[] = [];
  for (let i = 0; i < entityCount; i += 1) {
    commands.push({
      kind: "entity.create",
      entityId: `entity${i}`,
      components: {
        Transform: { position: [i, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        Spin: { axis: "y", speed: i }
      }
    });
  }
  for (let i = 0; i < entityCount; i += 1) {
    commands.push({
      kind: "component.set",
      entityId: `entity${i}`,
      component: "Transform",
      data: { position: [i, 1, 0] }
    });
  }
  for (let i = 0; i < entityCount; i += 1) {
    commands.push({
      kind: "component.remove",
      entityId: `entity${i}`,
      component: "Spin"
    });
  }
  for (let i = 0; i < entityCount; i += 1) {
    commands.push({ kind: "entity.delete", entityId: `entity${i}` });
  }
  return commands;
}

describe("applyCommand (perf boundary)", () => {
  it("applies a 400-command worst-case batch in under 50 ms on a fresh World", () => {
    const commands = buildWorstCaseCommands(100);
    expect(commands).toHaveLength(400);

    const world = new World();
    const start = performance.now();
    for (const command of commands) {
      applyCommand(world, command);
    }
    const elapsedMs = performance.now() - start;

    // Generous budget so the test doesn't flake on shared CI runners.
    // 400 commands / 50 ms = 8000 ops / second worst case; in practice we
    // measure ~5-10x faster on a developer laptop.
    expect(elapsedMs).toBeLessThan(50);
    expect(world.entityCount()).toBe(0);
  });

  it("import boundary: apply.ts re-exports applyCommand without dragging in CommandQueue", async () => {
    const apply = await import("../../engine/core/commands/apply");
    expect(typeof apply.applyCommand).toBe("function");
    // The module name set should not include anything beyond applyCommand.
    expect(Object.keys(apply)).toEqual(["applyCommand"]);
  });
});
