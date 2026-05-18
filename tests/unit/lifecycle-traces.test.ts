// S83 AGF-LOG-LIFECYCLE-TRACES.
//
// Verifies the scheduler + scene.load command emit the documented
// AGF_SCHEDULER_SYSTEM_{REGISTERED,DEREGISTERED} and
// AGF_SCENE_LOAD_APPLIED info events through a diagnostics bus.

import { describe, expect, it } from "vitest";

import { World } from "../../engine/core/ecs/world";
import { SystemScheduler } from "../../engine/core/systems/scheduler";
import { createDiagnosticsBus } from "../../engine/runtime/diagnostics/diagnostics-bus";
import { CommandQueue } from "../../engine/core/commands/command-queue";
import type { System } from "../../engine/core/systems/types";

function noopSystem(name: string): System {
  return {
    name,
    frameUpdate(): void {}
  };
}

describe("SystemScheduler lifecycle traces (S83 AGF-LOG-LIFECYCLE-TRACES)", () => {
  it("emits AGF_SCHEDULER_SYSTEM_REGISTERED when a system registers", () => {
    const bus = createDiagnosticsBus();
    const scheduler = new SystemScheduler({ diagnostics: bus });
    scheduler.register(noopSystem("alpha"));
    const events = bus.snapshot().filter((e) => e.code === "AGF_SCHEDULER_SYSTEM_REGISTERED");
    expect(events).toHaveLength(1);
    expect(events[0]?.severity).toBe("info");
    expect(events[0]?.source).toBe("scheduler");
    expect(events[0]?.details).toEqual({ name: "alpha", total: 1 });
  });

  it("emits AGF_SCHEDULER_SYSTEM_DEREGISTERED on unregister", () => {
    const bus = createDiagnosticsBus();
    const scheduler = new SystemScheduler({ diagnostics: bus });
    scheduler.register(noopSystem("alpha"));
    scheduler.unregister("alpha");
    const events = bus.snapshot().filter((e) => e.code === "AGF_SCHEDULER_SYSTEM_DEREGISTERED");
    expect(events).toHaveLength(1);
    expect(events[0]?.details).toEqual({ name: "alpha", total: 0 });
  });

  it("stays silent on unregister(unknown name)", () => {
    const bus = createDiagnosticsBus();
    const scheduler = new SystemScheduler({ diagnostics: bus });
    scheduler.unregister("nope");
    expect(bus.snapshot().filter((e) => e.code.startsWith("AGF_SCHEDULER"))).toEqual([]);
  });

  it("emits no events when no bus is wired (legacy default)", () => {
    const scheduler = new SystemScheduler();
    expect(() => scheduler.register(noopSystem("alpha"))).not.toThrow();
    expect(() => scheduler.unregister("alpha")).not.toThrow();
  });
});

describe("CommandQueue lifecycle traces (S83 AGF-LOG-LIFECYCLE-TRACES)", () => {
  it("emits AGF_SCENE_LOAD_APPLIED with entity counts before/after", () => {
    const world = new World();
    world.addEntity("seed.a");
    world.addEntity("seed.b");
    const bus = createDiagnosticsBus();
    const queue = new CommandQueue({ diagnostics: bus });
    queue.enqueue({
      kind: "scene.load",
      scene: {
        id: "test-scene",
        entities: [
          { id: "fresh.1", components: {} },
          { id: "fresh.2", components: {} },
          { id: "fresh.3", components: {} }
        ]
      }
    });
    queue.drainInto(world);
    const events = bus.snapshot().filter((e) => e.code === "AGF_SCENE_LOAD_APPLIED");
    expect(events).toHaveLength(1);
    expect(events[0]?.details).toEqual({ entityCountBefore: 2, entityCountAfter: 3, sceneId: "test-scene" });
    expect(events[0]?.severity).toBe("info");
    expect(events[0]?.source).toBe("scene");
  });

  it("does not emit for non-scene.load commands", () => {
    const world = new World();
    const bus = createDiagnosticsBus();
    const queue = new CommandQueue({ diagnostics: bus });
    queue.enqueue({ kind: "entity.create", entityId: "e1" });
    queue.enqueue({ kind: "component.set", entityId: "e1", component: "Test", data: { x: 1 } });
    queue.drainInto(world);
    expect(bus.snapshot().filter((e) => e.code === "AGF_SCENE_LOAD_APPLIED")).toEqual([]);
  });
});
