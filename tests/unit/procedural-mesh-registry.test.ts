// S101 AGF-PROCMESH-REGISTRY — registry behavior + parse helpers.

import { BoxGeometry } from "three";
import { describe, expect, it, vi } from "vitest";

import {
  createProceduralMeshRegistry,
  isProceduralMeshRef,
  parseProceduralRef
} from "../../engine/render/procedural-mesh-registry";

describe("isProceduralMeshRef (S101)", () => {
  it("recognises procedural: refs", () => {
    expect(isProceduralMeshRef("procedural:procbomber")).toBe(true);
    expect(isProceduralMeshRef("procedural:procbomber#42")).toBe(true);
  });

  it("rejects primitive + external + bare refs", () => {
    expect(isProceduralMeshRef("box")).toBe(false);
    expect(isProceduralMeshRef("sphere")).toBe(false);
    expect(isProceduralMeshRef("bomber.glb")).toBe(false);
    expect(isProceduralMeshRef("")).toBe(false);
  });
});

describe("parseProceduralRef (S101)", () => {
  it("parses key + default seed when no hash", () => {
    expect(parseProceduralRef("procedural:procbomber")).toEqual({ key: "procbomber", seed: "default" });
  });

  it("parses key + seed when hash present", () => {
    expect(parseProceduralRef("procedural:procbomber#42")).toEqual({ key: "procbomber", seed: "42" });
    expect(parseProceduralRef("procedural:foo#bar-baz/qux")).toEqual({ key: "foo", seed: "bar-baz/qux" });
  });

  it("returns undefined for empty key or non-procedural", () => {
    expect(parseProceduralRef("procedural:")).toBeUndefined();
    expect(parseProceduralRef("procedural:#42")).toBeUndefined();
    expect(parseProceduralRef("box")).toBeUndefined();
    expect(parseProceduralRef("")).toBeUndefined();
  });
});

describe("createProceduralMeshRegistry (S101)", () => {
  it("returns undefined when key is not registered", () => {
    const r = createProceduralMeshRegistry();
    expect(r.resolve("procedural:unknown")).toBeUndefined();
    expect(r.resolve("procedural:unknown#42")).toBeUndefined();
  });

  it("returns the builder's geometry once registered", () => {
    const r = createProceduralMeshRegistry();
    const geom = new BoxGeometry(1, 2, 3);
    r.register("box-like", () => geom);
    expect(r.resolve("procedural:box-like")).toBe(geom);
  });

  it("caches by <key>:<seed> — same seed returns same geometry, builder invoked once", () => {
    const r = createProceduralMeshRegistry();
    const builder = vi.fn((seed: string) => {
      const g = new BoxGeometry(1, 1, 1);
      g.userData["seed"] = seed;
      return g;
    });
    r.register("foo", builder);
    const a1 = r.resolve("procedural:foo#1");
    const a2 = r.resolve("procedural:foo#1");
    const b = r.resolve("procedural:foo#2");
    expect(a1).toBe(a2);
    expect(a1).not.toBe(b);
    expect(builder).toHaveBeenCalledTimes(2);
    expect(r.cacheSize()).toBe(2);
  });

  it("re-registering a key drops cached geometries from the previous builder", () => {
    const r = createProceduralMeshRegistry();
    r.register("foo", () => new BoxGeometry(1, 1, 1));
    r.resolve("procedural:foo#1");
    r.resolve("procedural:foo#2");
    expect(r.cacheSize()).toBe(2);
    r.register("foo", () => new BoxGeometry(2, 2, 2));
    expect(r.cacheSize()).toBe(0);
  });

  it("invalidate(key) drops only that key's cache entries", () => {
    const r = createProceduralMeshRegistry();
    r.register("a", () => new BoxGeometry(1, 1, 1));
    r.register("b", () => new BoxGeometry(2, 2, 2));
    r.resolve("procedural:a#1");
    r.resolve("procedural:a#2");
    r.resolve("procedural:b#1");
    expect(r.cacheSize()).toBe(3);
    r.invalidate("a");
    expect(r.cacheSize()).toBe(1);
    expect(r.has("a")).toBe(true);
  });

  it("clear() drops every cached geometry, leaves builders in place", () => {
    const r = createProceduralMeshRegistry();
    r.register("a", () => new BoxGeometry(1, 1, 1));
    r.resolve("procedural:a#1");
    expect(r.cacheSize()).toBe(1);
    r.clear();
    expect(r.cacheSize()).toBe(0);
    expect(r.has("a")).toBe(true);
  });

  it("keys() lists every registered builder", () => {
    const r = createProceduralMeshRegistry();
    r.register("a", () => new BoxGeometry(1, 1, 1));
    r.register("b", () => new BoxGeometry(1, 1, 1));
    expect([...r.keys()].sort()).toEqual(["a", "b"]);
  });
});
