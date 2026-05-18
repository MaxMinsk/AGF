import { describe, expect, it, vi } from "vitest";
import { AssetRegistry, type AssetLoader } from "../../engine/runtime/asset-registry";
import { createDiagnosticsBus } from "../../engine/runtime/diagnostics/diagnostics-bus";

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

describe("AssetRegistry diagnostics integration", () => {
  it("emits AGF_RUNTIME_ASSET_NO_LOADER when nothing matches the ref", async () => {
    const diagnostics = createDiagnosticsBus({ nowSeconds: () => 0 });
    const registry = new AssetRegistry({ baseUrl: "http://test/", diagnostics });

    await expect(registry.get("missing/handler.unknown")).rejects.toThrow(
      /No asset loader matches/
    );

    const items = diagnostics.snapshot();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      severity: "error",
      code: "AGF_RUNTIME_ASSET_NO_LOADER",
      assetRef: "missing/handler.unknown"
    });
  });

  it("emits AGF_RUNTIME_ASSET_LOAD_FAILED when the matched loader rejects", async () => {
    const diagnostics = createDiagnosticsBus({ nowSeconds: () => 0 });
    const loader: AssetLoader = {
      name: "broken",
      matches: () => true,
      load: vi.fn().mockRejectedValue(new Error("boom"))
    };
    const registry = new AssetRegistry({
      baseUrl: "http://test/",
      loaders: [loader],
      diagnostics
    });

    await expect(registry.get("broken/asset.json")).rejects.toThrow(/boom/);
    await new Promise((resolve) => setTimeout(resolve, 0));

    const items = diagnostics.snapshot();
    const failure = items.find((d) => d.code === "AGF_RUNTIME_ASSET_LOAD_FAILED");
    expect(failure).toBeDefined();
    expect(failure?.details).toMatchObject({ loader: "broken", reason: "boom" });
  });

  it("S87 AGF-ASSET-INVENTORY-TEST: inventory transitions pending → loaded on resolve", async () => {
    const loader: AssetLoader<unknown> = {
      name: "json",
      matches: (ref) => ref.endsWith(".json"),
      load: vi.fn().mockResolvedValue({ hello: "world" })
    };
    const registry = new AssetRegistry({ baseUrl: "http://example.test/" });
    registry.register(loader);
    const promise = registry.get("a.json");
    const before = registry.inventory();
    expect(before).toEqual([{ ref: "a.json", status: "pending" }]);
    await promise;
    const after = registry.inventory();
    expect(after).toEqual([{ ref: "a.json", status: "loaded" }]);
  });

  it("S87 AGF-ASSET-INVENTORY-TEST: inventory transitions pending → failed on reject", async () => {
    const loader: AssetLoader<unknown> = {
      name: "bad",
      matches: (ref) => ref.endsWith(".bad"),
      load: vi.fn().mockRejectedValue(new Error("boom"))
    };
    const registry = new AssetRegistry({ baseUrl: "http://example.test/" });
    registry.register(loader);
    await registry.get("x.bad").catch(() => {});
    expect(registry.inventory()).toEqual([{ ref: "x.bad", status: "failed" }]);
  });

  it("S87 AGF-ASSET-INVENTORY-TEST: invalidate() drops the status entry", async () => {
    const loader: AssetLoader<unknown> = {
      name: "ok",
      matches: (ref) => ref.endsWith(".ok"),
      load: vi.fn().mockResolvedValue("x")
    };
    const registry = new AssetRegistry({ baseUrl: "http://example.test/" });
    registry.register(loader);
    await registry.get("y.ok");
    expect(registry.inventory()).toHaveLength(1);
    registry.invalidate("y.ok");
    expect(registry.inventory()).toEqual([]);
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
