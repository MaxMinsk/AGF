// S53 DEVBRIDGE-project-patch — covers the `deepMerge` helper that
// powers `/__agf/project-patch`. End-to-end route behaviour is
// exercised by the existing dev-bridge e2e suite + the shadow tuner
// in Story 9; this file pins the pure merge semantics so future
// edits don't accidentally turn shallow-merge into object replace.

import { describe, expect, it } from "vitest";

import { deepMerge } from "../../engine/dev/agf-dev-bridge";

describe("deepMerge (S53 DEVBRIDGE-project-patch)", () => {
  it("returns a shallow clone when patch is empty", () => {
    const base = { id: "shadows-bench", render: { mode: "webgl" } };
    const merged = deepMerge(base, {});
    expect(merged).toEqual(base);
    expect(merged).not.toBe(base);
  });

  it("overwrites primitives at leaf keys", () => {
    const base = { render: { shadows: { algorithm: "pcss" } } } as Record<string, unknown>;
    const patch = { render: { shadows: { algorithm: "pcf" } } } as Record<string, unknown>;
    expect(deepMerge(base, patch)).toEqual({
      render: { shadows: { algorithm: "pcf" } }
    });
  });

  it("recursively merges nested objects (does not replace whole subtrees)", () => {
    const base = {
      render: {
        shadows: {
          algorithm: "pcss",
          csm: { cascades: 3, shadowMapSize: 1024 }
        }
      }
    } as Record<string, unknown>;
    const patch = {
      render: { shadows: { csm: { shadowMapSize: 2048 } } }
    } as Record<string, unknown>;
    expect(deepMerge(base, patch)).toEqual({
      render: {
        shadows: {
          algorithm: "pcss",
          csm: { cascades: 3, shadowMapSize: 2048 }
        }
      }
    });
  });

  it("replaces arrays whole — does not array-merge", () => {
    const base = { render: { post: [{ kind: "fxaa" }] } } as Record<string, unknown>;
    const patch = { render: { post: [] } } as Record<string, unknown>;
    expect(deepMerge(base, patch)).toEqual({ render: { post: [] } });
  });

  it("adds new top-level keys without disturbing existing ones", () => {
    const base = { id: "x" };
    const patch = { name: "X" } as Record<string, unknown>;
    expect(deepMerge(base, patch)).toEqual({ id: "x", name: "X" });
  });

  it("treats null in the patch as a deliberate value (overwrite)", () => {
    const base = { render: { background: "#000000" } } as Record<string, unknown>;
    const patch = { render: { background: null } } as Record<string, unknown>;
    expect(deepMerge(base, patch)).toEqual({ render: { background: null } });
  });
});
