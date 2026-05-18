// S83 AGF-LOG-ENTITY-RECREATED.

import { describe, expect, it } from "vitest";

import { World } from "../../engine/core/ecs/world";
import { createDiagnosticsBus } from "../../engine/runtime/diagnostics/diagnostics-bus";
import { CommandQueue } from "../../engine/core/commands/command-queue";

function eventsOf(bus: ReturnType<typeof createDiagnosticsBus>, code: string) {
  return bus.snapshot().filter((e) => e.code === code);
}

describe("AGF_ENTITY_RECREATED (S83 AGF-LOG-ENTITY-RECREATED)", () => {
  it("warns when entity.create re-uses a previously deleted id", () => {
    const world = new World();
    const bus = createDiagnosticsBus();
    const queue = new CommandQueue({ diagnostics: bus });
    queue.enqueue({ kind: "entity.create", entityId: "foo" });
    queue.enqueue({ kind: "entity.delete", entityId: "foo" });
    queue.enqueue({ kind: "entity.create", entityId: "foo" });
    queue.drainInto(world);
    const ev = eventsOf(bus, "AGF_ENTITY_RECREATED");
    expect(ev).toHaveLength(1);
    expect(ev[0]?.severity).toBe("warning");
    expect(ev[0]?.entityId).toBe("foo");
  });

  it("does NOT warn on a fresh create (no prior delete)", () => {
    const world = new World();
    const bus = createDiagnosticsBus();
    const queue = new CommandQueue({ diagnostics: bus });
    queue.enqueue({ kind: "entity.create", entityId: "fresh" });
    queue.drainInto(world);
    expect(eventsOf(bus, "AGF_ENTITY_RECREATED")).toEqual([]);
  });

  it("warns when an id wiped by scene.load is then re-created", () => {
    const world = new World();
    world.addEntity("ghost");
    const bus = createDiagnosticsBus();
    const queue = new CommandQueue({ diagnostics: bus });
    queue.enqueue({
      kind: "scene.load",
      scene: { id: "blank", entities: [] }
    });
    queue.enqueue({ kind: "entity.create", entityId: "ghost" });
    queue.drainInto(world);
    const ev = eventsOf(bus, "AGF_ENTITY_RECREATED");
    expect(ev).toHaveLength(1);
    expect(ev[0]?.entityId).toBe("ghost");
  });

  it("does NOT warn when scene.load re-creates the same ids (legitimate reload)", () => {
    const world = new World();
    world.addEntity("keep");
    const bus = createDiagnosticsBus();
    const queue = new CommandQueue({ diagnostics: bus });
    queue.enqueue({
      kind: "scene.load",
      scene: { id: "same", entities: [{ id: "keep", components: {} }] }
    });
    queue.enqueue({
      kind: "scene.load",
      scene: { id: "same2", entities: [{ id: "keep", components: {} }] }
    });
    queue.drainInto(world);
    expect(eventsOf(bus, "AGF_ENTITY_RECREATED")).toEqual([]);
  });
});
