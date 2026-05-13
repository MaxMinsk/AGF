import { describe, expect, it } from "vitest";
import { diffSnapshots } from "../../engine/tools/inspect/snapshot-diff";
import type { InspectEntity, InspectResult } from "../../engine/tools/inspect/project-inspect";

function snapshot(entities: InspectEntity[]): InspectResult {
  return {
    ok: true,
    projectDir: "/tmp/project",
    diagnostics: [],
    project: {
      id: "test",
      name: "Test",
      startScene: "scenes/start.scene.json",
      assetRoot: "assets",
      profiles: ["static"]
    },
    scene: {
      id: "start",
      entityCount: entities.length,
      matchedEntityCount: entities.length,
      entities
    }
  };
}

function entity(id: string, components: Record<string, unknown>): InspectEntity {
  return {
    id,
    order: 0,
    componentNames: Object.keys(components).sort(),
    components: components as InspectEntity["components"]
  };
}

describe("diffSnapshots", () => {
  it("returns no changes when both snapshots are equal", () => {
    const a = snapshot([entity("cube", { Transform: { position: [0, 0, 0] } })]);
    const b = snapshot([entity("cube", { Transform: { position: [0, 0, 0] } })]);

    expect(diffSnapshots(a, b)).toEqual([]);
  });

  it("reports an added entity", () => {
    const a = snapshot([]);
    const b = snapshot([entity("hero", { Transform: { position: [1, 0, 0] } })]);

    expect(diffSnapshots(a, b)).toEqual([
      {
        kind: "entity.added",
        entityId: "hero",
        components: ["Transform"]
      }
    ]);
  });

  it("reports a removed entity", () => {
    const a = snapshot([entity("hero", { Transform: {} })]);
    const b = snapshot([]);

    expect(diffSnapshots(a, b)).toEqual([
      {
        kind: "entity.removed",
        entityId: "hero",
        components: ["Transform"]
      }
    ]);
  });

  it("reports a changed component", () => {
    const a = snapshot([entity("cube", { Transform: { position: [0, 0, 0] } })]);
    const b = snapshot([entity("cube", { Transform: { position: [1, 0, 0] } })]);

    expect(diffSnapshots(a, b)).toEqual([
      {
        kind: "component.changed",
        entityId: "cube",
        component: "Transform",
        previous: { position: [0, 0, 0] },
        next: { position: [1, 0, 0] }
      }
    ]);
  });

  it("reports an added component on an existing entity", () => {
    const a = snapshot([entity("cube", { Transform: {} })]);
    const b = snapshot([entity("cube", { Transform: {}, Spin: { axis: "y", speed: 10 } })]);

    expect(diffSnapshots(a, b)).toEqual([
      {
        kind: "component.added",
        entityId: "cube",
        component: "Spin",
        next: { axis: "y", speed: 10 }
      }
    ]);
  });

  it("reports a removed component on an existing entity", () => {
    const a = snapshot([entity("cube", { Transform: {}, Spin: { axis: "y", speed: 10 } })]);
    const b = snapshot([entity("cube", { Transform: {} })]);

    expect(diffSnapshots(a, b)).toEqual([
      {
        kind: "component.removed",
        entityId: "cube",
        component: "Spin",
        previous: { axis: "y", speed: 10 }
      }
    ]);
  });

  it("treats object key order as irrelevant", () => {
    const a = snapshot([entity("cube", { Transform: { position: [0, 0, 0], rotation: [0, 0, 0] } })]);
    const b = snapshot([entity("cube", { Transform: { rotation: [0, 0, 0], position: [0, 0, 0] } })]);

    expect(diffSnapshots(a, b)).toEqual([]);
  });
});
