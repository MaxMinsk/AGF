// S096 AGF-PROBE-SNAPSHOT-DIFF — diffWorldSnapshots round-trips
// runtime-shaped WorldSnapshots through the existing diff pipeline.

import { describe, expect, it } from "vitest";

import { diffWorldSnapshots, worldSnapshotToInspectResult } from "../../engine/runtime/snapshot-diff-runtime";

function makeSnap(entities: ReadonlyArray<{ id: string; components: Record<string, unknown> }>) {
  return {
    entityCount: entities.length,
    entities: entities.map((e) => ({ id: e.id, components: e.components })),
    time: { elapsed: 0, dt: 1 / 60, fixedDt: 1 / 60, frameCount: 0, fixedStepCount: 0 }
  };
}

describe("diffWorldSnapshots (S096 AGF-PROBE-SNAPSHOT-DIFF)", () => {
  it("identical snapshots produce an empty diff", () => {
    const snap = makeSnap([{ id: "a", components: { Foo: { x: 1 } } }]);
    expect(diffWorldSnapshots(snap, snap)).toEqual([]);
  });

  it("entity added since `previous` shows up as entity.added", () => {
    const prev = makeSnap([{ id: "a", components: {} }]);
    const next = makeSnap([
      { id: "a", components: {} },
      { id: "b", components: { Foo: 1 } }
    ]);
    const diff = diffWorldSnapshots(prev, next);
    const added = diff.find((d) => d.kind === "entity.added");
    expect(added).toMatchObject({ kind: "entity.added", entityId: "b" });
  });

  it("entity removed since `previous` shows up as entity.removed", () => {
    const prev = makeSnap([
      { id: "a", components: {} },
      { id: "b", components: { Foo: 1 } }
    ]);
    const next = makeSnap([{ id: "a", components: {} }]);
    const diff = diffWorldSnapshots(prev, next);
    const removed = diff.find((d) => d.kind === "entity.removed");
    expect(removed).toMatchObject({ kind: "entity.removed", entityId: "b" });
  });

  it("component value change shows up as component.changed with previous + next", () => {
    const prev = makeSnap([{ id: "a", components: { Foo: { x: 1 } } }]);
    const next = makeSnap([{ id: "a", components: { Foo: { x: 2 } } }]);
    const diff = diffWorldSnapshots(prev, next);
    const changed = diff.find((d) => d.kind === "component.changed");
    expect(changed).toMatchObject({
      kind: "component.changed",
      entityId: "a",
      component: "Foo",
      previous: { x: 1 },
      next: { x: 2 }
    });
  });

  it("adding a brand-new component on an existing entity shows up as component.added", () => {
    const prev = makeSnap([{ id: "a", components: { Foo: 1 } }]);
    const next = makeSnap([{ id: "a", components: { Foo: 1, Bar: 2 } }]);
    const diff = diffWorldSnapshots(prev, next);
    expect(diff.some((d) => d.kind === "component.added" && d.component === "Bar")).toBe(true);
  });

  it("removing a component on an existing entity shows up as component.removed", () => {
    const prev = makeSnap([{ id: "a", components: { Foo: 1, Bar: 2 } }]);
    const next = makeSnap([{ id: "a", components: { Foo: 1 } }]);
    const diff = diffWorldSnapshots(prev, next);
    expect(diff.some((d) => d.kind === "component.removed" && d.component === "Bar")).toBe(true);
  });

  it("worldSnapshotToInspectResult preserves component shape + entity ids", () => {
    const snap = makeSnap([
      { id: "alpha", components: { Foo: 1, Bar: { x: 2 } } },
      { id: "beta", components: { Foo: 3 } }
    ]);
    const inspect = worldSnapshotToInspectResult(snap);
    expect(inspect.ok).toBe(true);
    expect(inspect.scene?.entities.map((e) => e.id)).toEqual(["alpha", "beta"]);
    expect(inspect.scene?.entities[0]?.componentNames).toEqual(["Foo", "Bar"]);
  });
});
