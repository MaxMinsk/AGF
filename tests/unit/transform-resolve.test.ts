import { describe, expect, it } from "vitest";
import {
  resolveHierarchy,
  type TransformInput
} from "../../engine/core/transform/resolve";

describe("resolveHierarchy", () => {
  it("returns identity world transforms for flat entities", () => {
    const result = resolveHierarchy([
      { id: "a", position: [1, 0, 0] },
      { id: "b", position: [0, 2, 0] }
    ]);
    expect(result.get("a")?.world.position).toEqual([1, 0, 0]);
    expect(result.get("b")?.world.position).toEqual([0, 2, 0]);
  });

  it("offsets a child by its parent's world position", () => {
    const result = resolveHierarchy([
      { id: "cart", position: [10, 0, 0] },
      { id: "wheel", parent: "cart", position: [0, 0, 1] }
    ]);
    expect(result.get("wheel")?.world.position).toEqual([10, 0, 1]);
  });

  it("multiplies scale componentwise through the chain", () => {
    const result = resolveHierarchy([
      { id: "root", scale: [2, 2, 2] },
      { id: "child", parent: "root", scale: [3, 3, 3] }
    ]);
    expect(result.get("child")?.world.scale).toEqual([6, 6, 6]);
  });

  it("accumulates rotation through a chain — composed via the position of a child offset", () => {
    // Two 90° Y rotations stack to 180°. Decomposing 180° back into Euler XYZ
    // is ambiguous (asin singularity), so don't assert on the raw Euler
    // values — verify the rotation by where it places a unit-X offset child.
    const half = Math.PI / 2;
    const result = resolveHierarchy([
      { id: "root", rotation: [0, half, 0] },
      { id: "mid", parent: "root", rotation: [0, half, 0] },
      { id: "tip", parent: "mid", position: [1, 0, 0] }
    ]);
    const world = result.get("tip")?.world.position ?? [0, 0, 0];
    expect(world[0]).toBeCloseTo(-1, 5);
    expect(world[1]).toBeCloseTo(0, 5);
    expect(world[2]).toBeCloseTo(0, 5);
  });

  it("rotates child position by parent's rotation", () => {
    // 90deg rotation around Y maps +X to -Z in our XYZ-Euler convention.
    const half = Math.PI / 2;
    const result = resolveHierarchy([
      { id: "root", rotation: [0, half, 0] },
      { id: "tip", parent: "root", position: [1, 0, 0] }
    ]);
    const world = result.get("tip")?.world.position ?? [0, 0, 0];
    expect(world[0]).toBeCloseTo(0, 6);
    expect(world[2]).toBeCloseTo(-1, 6);
  });

  it("resolves a deep chain regardless of input order", () => {
    const inputs: TransformInput[] = [
      { id: "leaf", parent: "mid", position: [0, 0, 1] },
      { id: "mid", parent: "root", position: [0, 1, 0] },
      { id: "root", position: [1, 0, 0] }
    ];
    const result = resolveHierarchy(inputs);
    expect(result.get("leaf")?.world.position).toEqual([1, 1, 1]);
  });

  it("throws on a self-reference", () => {
    expect(() =>
      resolveHierarchy([{ id: "loop", parent: "loop" }])
    ).toThrow(/itself as parent/);
  });

  it("throws on a missing parent", () => {
    expect(() =>
      resolveHierarchy([{ id: "orphan", parent: "ghost" }])
    ).toThrow(/missing parent/);
  });

  it("throws on a cycle", () => {
    expect(() =>
      resolveHierarchy([
        { id: "a", parent: "b" },
        { id: "b", parent: "a" }
      ])
    ).toThrow(/cycle/);
  });
});
