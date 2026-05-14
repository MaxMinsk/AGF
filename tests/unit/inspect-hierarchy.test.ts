import { describe, expect, it } from "vitest";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inspectProject } from "../../engine/tools/inspect/project-inspect";

const here = dirname(fileURLToPath(import.meta.url));
const fixturesRoot = resolve(here, "../fixtures");

describe("inspect — transform hierarchy decoration", () => {
  it("exposes parent + derived worldPosition for parented entities", () => {
    const result = inspectProject(resolve(fixturesRoot, "valid-hierarchy"));
    expect(result.ok).toBe(true);
    const entities = result.scene?.entities ?? [];
    const cart = entities.find((e) => e.id === "cart.root");
    const wheel = entities.find((e) => e.id === "cart.wheel");

    expect(cart?.parent).toBeUndefined();
    expect(cart?.worldPosition).toEqual([10, 0, 0]);

    expect(wheel?.parent).toBe("cart.root");
    expect(wheel?.worldPosition).toEqual([10, 0, 1]);
  });

  it("omits parent + worldPosition when the scene has no hierarchy at all", () => {
    const result = inspectProject(resolve(fixturesRoot, "valid-project"));
    expect(result.ok).toBe(true);
    const camera = result.scene?.entities.find((e) => e.id === "camera.main");
    expect(camera?.parent).toBeUndefined();
    expect(camera?.worldPosition).toBeUndefined();
  });
});
