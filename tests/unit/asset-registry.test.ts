import { describe, expect, it, vi } from "vitest";
import { AssetRegistry, type AssetLoader } from "../../engine/runtime/asset-registry";

function jsonLoader(name: string, payload: unknown): AssetLoader<unknown> {
  return {
    name,
    matches: (ref) => ref.endsWith(`.${name}.json`),
    load: vi.fn().mockResolvedValue(payload)
  };
}

describe("AssetRegistry", () => {
  it("dispatches refs to the first matching loader", async () => {
    const loader = jsonLoader("material", { id: "x", color: "#ffffff" });
    const registry = new AssetRegistry({ baseUrl: "http://example.test/assets/" });
    registry.register(loader);

    const result = await registry.get("runtime/materials/x.material.json");

    expect(result).toEqual({ id: "x", color: "#ffffff" });
    expect(loader.load).toHaveBeenCalledWith("http://example.test/assets/runtime/materials/x.material.json");
  });

  it("caches results so repeated gets return the same promise", async () => {
    const loader = jsonLoader("material", { id: "cached" });
    const registry = new AssetRegistry({ baseUrl: "http://example.test/assets/" });
    registry.register(loader);

    const first = registry.get("a.material.json");
    const second = registry.get("a.material.json");
    expect(first).toBe(second);
    await first;
    expect(loader.load).toHaveBeenCalledTimes(1);
  });

  it("rejects when no loader matches", async () => {
    const registry = new AssetRegistry({ baseUrl: "http://example.test/assets/" });

    await expect(registry.get("runtime/models/cube.bin")).rejects.toThrow(/No asset loader/);
  });

  it("drops failed loads from the cache so callers can retry", async () => {
    let calls = 0;
    const flaky: AssetLoader<{ ok: boolean }> = {
      name: "flaky",
      matches: () => true,
      async load() {
        calls += 1;
        if (calls === 1) {
          throw new Error("transient");
        }
        return { ok: true };
      }
    };
    const registry = new AssetRegistry({ baseUrl: "http://example.test/assets/" });
    registry.register(flaky);

    await expect(registry.get("anything.glb")).rejects.toThrow(/transient/);
    const second = await registry.get<{ ok: boolean }>("anything.glb");
    expect(second.ok).toBe(true);
    expect(calls).toBe(2);
  });

  it("accepts loaders provided at construction time", () => {
    const loader = jsonLoader("material", {});
    const registry = new AssetRegistry({
      baseUrl: "http://example.test/assets/",
      loaders: [loader]
    });

    expect(registry.loaderNames()).toEqual(["material"]);
  });

  it("invalidate(ref) drops the cached promise so the next get re-fetches", async () => {
    let loadCount = 0;
    const loader: AssetLoader<{ count: number }> = {
      name: "counting",
      matches: () => true,
      async load() {
        loadCount += 1;
        return { count: loadCount };
      }
    };
    const registry = new AssetRegistry({ baseUrl: "http://example.test/assets/" });
    registry.register(loader);

    const first = await registry.get<{ count: number }>("a");
    expect(first.count).toBe(1);

    expect(registry.invalidate("a")).toBe(true);
    expect(registry.has("a")).toBe(false);

    const second = await registry.get<{ count: number }>("a");
    expect(second.count).toBe(2);
    expect(loadCount).toBe(2);

    expect(registry.invalidate("missing")).toBe(false);
  });

  it("urlFor resolves refs against the baseUrl", () => {
    const registry = new AssetRegistry({ baseUrl: "http://example.test/assets/" });

    expect(registry.urlFor("runtime/materials/x.material.json")).toBe(
      "http://example.test/assets/runtime/materials/x.material.json"
    );
  });
});

describe("GlbLoader matcher", () => {
  it("matches .glb and .gltf extensions only", async () => {
    const { createGlbLoader } = await import("../../engine/render/glb-loader");
    const loader = createGlbLoader();

    expect(loader.matches("runtime/models/box.glb")).toBe(true);
    expect(loader.matches("runtime/models/box.gltf")).toBe(true);
    expect(loader.matches("runtime/models/box.obj")).toBe(false);
    expect(loader.matches("runtime/materials/x.material.json")).toBe(false);
  });
});

describe("MaterialLoader matcher", () => {
  it("matches .material.json suffix", async () => {
    const { createMaterialLoader } = await import("../../engine/runtime/asset-loaders/material-loader");
    const loader = createMaterialLoader();

    expect(loader.matches("runtime/materials/x.material.json")).toBe(true);
    expect(loader.matches("runtime/materials/x.json")).toBe(false);
  });
});
