// S169 ENGINE-WANG-AUTOTILE (GDP-2026-05-28-002) — resolver system tests.

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { World } from "../../engine/core/ecs/world";
import type { SystemContext } from "../../engine/core/systems/types";
import {
  clearWangTileFamilies,
  registerWangTileFamily,
  type WangTileFamily,
  type WangTileVariant
} from "../../engine/render/autotile/family-registry";
import {
  createWangTileResolverSystem,
  resolveAll,
  WANG_TILE,
  WANG_TILE_FAMILY_MEMBER,
  type WangTileComponent
} from "../../engine/render/autotile/wang-tile-resolver-system";

const GRID_POSITION = "GridPosition";

function buildFamily(name: string): WangTileFamily {
  const variants: WangTileVariant[] = [];
  for (let i = 0; i < 16; i += 1) variants.push({ meshKey: `${name}:variant-${i}` });
  return { name, variants };
}

function buildCell(world: World, id: string, gx: number, gz: number, familyName: string): void {
  world.addEntity(id);
  world.setComponent(id, GRID_POSITION, { gx, gz });
  world.setComponent(id, WANG_TILE, { familyName } satisfies WangTileComponent);
  world.setComponent(id, WANG_TILE_FAMILY_MEMBER, { familyName });
}

function makeContext(world: World): SystemContext {
  return {
    world,
    time: {
      elapsed: 0,
      dt: 1 / 60,
      fixedDt: 1 / 60,
      frameCount: 0,
      fixedStepCount: 0
    }
  };
}

describe("WangTileResolverSystem (S169) — resolveAll", () => {
  beforeEach(() => {
    clearWangTileFamilies();
    registerWangTileFamily(buildFamily("soft-block"));
  });
  afterEach(() => {
    clearWangTileFamilies();
  });

  it("writes currentVariantIndex on every WangTile entity", () => {
    const world = new World();
    // Three cells in a row at gz=5, gx=0,1,2 — all soft-block.
    buildCell(world, "c0", 0, 5, "soft-block");
    buildCell(world, "c1", 1, 5, "soft-block");
    buildCell(world, "c2", 2, 5, "soft-block");

    resolveAll(world);

    const w0 = world.getComponent<WangTileComponent>("c0", WANG_TILE);
    const w1 = world.getComponent<WangTileComponent>("c1", WANG_TILE);
    const w2 = world.getComponent<WangTileComponent>("c2", WANG_TILE);

    // c0 has only east-neighbour → bit2=4
    expect(w0?.currentVariantIndex).toBe(0b0100);
    // c1 has east + west → bit2|bit0 = 5
    expect(w1?.currentVariantIndex).toBe(0b0101);
    // c2 has only west → bit0=1
    expect(w2?.currentVariantIndex).toBe(0b0001);

    // currentMeshKey mirrors the resolved variant.
    expect(w1?.currentMeshKey).toBe("soft-block:variant-5");
  });

  it("isolated cell resolves to variant 0", () => {
    const world = new World();
    buildCell(world, "alone", 7, 7, "soft-block");
    resolveAll(world);
    const w = world.getComponent<WangTileComponent>("alone", WANG_TILE);
    expect(w?.currentVariantIndex).toBe(0);
    expect(w?.currentMeshKey).toBe("soft-block:variant-0");
  });

  it("fully-surrounded cell resolves to variant 15", () => {
    const world = new World();
    buildCell(world, "centre", 5, 5, "soft-block");
    buildCell(world, "n", 5, 4, "soft-block");
    buildCell(world, "e", 6, 5, "soft-block");
    buildCell(world, "s", 5, 6, "soft-block");
    buildCell(world, "w", 4, 5, "soft-block");
    resolveAll(world);
    const centre = world.getComponent<WangTileComponent>("centre", WANG_TILE);
    expect(centre?.currentVariantIndex).toBe(15);
  });

  it("ignores neighbours from a different family", () => {
    const world = new World();
    registerWangTileFamily(buildFamily("hard-block"));
    buildCell(world, "centre", 5, 5, "soft-block");
    // North + east are HARD blocks (different family) → centre still isolated.
    buildCell(world, "n", 5, 4, "hard-block");
    buildCell(world, "e", 6, 5, "hard-block");
    resolveAll(world);
    const centre = world.getComponent<WangTileComponent>("centre", WANG_TILE);
    expect(centre?.currentVariantIndex).toBe(0);
  });

  it("leaves the cell unresolved when the family is not registered", () => {
    const world = new World();
    world.addEntity("ghost");
    world.setComponent("ghost", GRID_POSITION, { gx: 0, gz: 0 });
    world.setComponent("ghost", WANG_TILE, { familyName: "no-such-family" });
    resolveAll(world);
    const w = world.getComponent<WangTileComponent>("ghost", WANG_TILE);
    expect(w?.currentVariantIndex).toBeUndefined();
    expect(w?.currentMeshKey).toBeUndefined();
  });
});

describe("WangTileResolverSystem (S169) — system fixedUpdate", () => {
  beforeEach(() => {
    clearWangTileFamilies();
    registerWangTileFamily(buildFamily("soft-block"));
  });
  afterEach(() => {
    clearWangTileFamilies();
  });

  it("first fixedUpdate performs a full resolve", () => {
    const world = new World();
    buildCell(world, "a", 0, 0, "soft-block");
    buildCell(world, "b", 1, 0, "soft-block");
    const sys = createWangTileResolverSystem();
    sys.fixedUpdate!(makeContext(world));
    expect(
      world.getComponent<WangTileComponent>("a", WANG_TILE)?.currentVariantIndex
    ).toBe(0b0100); // east neighbour only
    expect(
      world.getComponent<WangTileComponent>("b", WANG_TILE)?.currentVariantIndex
    ).toBe(0b0001); // west neighbour only
  });

  it("re-resolves the cell + 4 neighbours when a new family-member is added", () => {
    const world = new World();
    // 3×3 board, centre at (1,1). Initially only centre + east-of-east
    // (2,1) carry the soft-block family. North/south/west empty.
    buildCell(world, "c", 1, 1, "soft-block");
    buildCell(world, "e2", 2, 1, "soft-block");

    const sys = createWangTileResolverSystem();
    sys.fixedUpdate!(makeContext(world));

    // Centre starts with east neighbour only → bit2 = 4.
    expect(
      world.getComponent<WangTileComponent>("c", WANG_TILE)?.currentVariantIndex
    ).toBe(0b0100);
    // e2 starts with west neighbour only (centre) → bit0 = 1.
    expect(
      world.getComponent<WangTileComponent>("e2", WANG_TILE)?.currentVariantIndex
    ).toBe(0b0001);

    // Add a new north-neighbour of centre at (1, 0).
    buildCell(world, "n", 1, 0, "soft-block");

    sys.fixedUpdate!(makeContext(world));

    // Centre now has north (bit3=8) + east (bit2=4) = 0b1100 (12).
    expect(
      world.getComponent<WangTileComponent>("c", WANG_TILE)?.currentVariantIndex
    ).toBe(0b1100);
    // New cell n: only south neighbour (centre) → bit1=2.
    expect(
      world.getComponent<WangTileComponent>("n", WANG_TILE)?.currentVariantIndex
    ).toBe(0b0010);
    // e2 unchanged — still only west neighbour.
    expect(
      world.getComponent<WangTileComponent>("e2", WANG_TILE)?.currentVariantIndex
    ).toBe(0b0001);
  });

  it("re-resolves neighbours when a family-member is removed", () => {
    const world = new World();
    // Surrounded centre — all four cardinal neighbours soft-block.
    buildCell(world, "c", 5, 5, "soft-block");
    buildCell(world, "n", 5, 4, "soft-block");
    buildCell(world, "e", 6, 5, "soft-block");
    buildCell(world, "s", 5, 6, "soft-block");
    buildCell(world, "w", 4, 5, "soft-block");

    const sys = createWangTileResolverSystem();
    sys.fixedUpdate!(makeContext(world));

    expect(
      world.getComponent<WangTileComponent>("c", WANG_TILE)?.currentVariantIndex
    ).toBe(15);

    // Remove the north neighbour's family-member tag (block destroyed by blast).
    world.removeComponent("n", WANG_TILE_FAMILY_MEMBER);

    sys.fixedUpdate!(makeContext(world));

    // Centre lost its N bit → 0b0111 (7).
    expect(
      world.getComponent<WangTileComponent>("c", WANG_TILE)?.currentVariantIndex
    ).toBe(0b0111);
    // South neighbour unchanged (still has E + W + own connection to centre via N).
    // South cell (5,6): N=centre, E=undefined, S=undefined, W=undefined → bit3 = 8.
    expect(
      world.getComponent<WangTileComponent>("s", WANG_TILE)?.currentVariantIndex
    ).toBe(0b1000);
  });

  it("steady-state fixedUpdate with no changes is a no-op (does not re-resolve)", () => {
    const world = new World();
    buildCell(world, "a", 0, 0, "soft-block");

    const sys = createWangTileResolverSystem();
    sys.fixedUpdate!(makeContext(world));
    const revAfterFirst = world.componentRevision("a", WANG_TILE);

    // No changes between ticks.
    sys.fixedUpdate!(makeContext(world));
    sys.fixedUpdate!(makeContext(world));

    // Revision did not bump on subsequent ticks → no spurious re-resolve.
    expect(world.componentRevision("a", WANG_TILE)).toBe(revAfterFirst);
  });

  it("supports a custom same-family predicate factory", () => {
    const world = new World();
    // Project-style: cell entities tagged with project-specific family
    // markers ('MyBlock') instead of the generic WangTileFamilyMember.
    world.addEntity("c");
    world.setComponent("c", GRID_POSITION, { gx: 0, gz: 0 });
    world.setComponent("c", WANG_TILE, { familyName: "soft-block" });
    world.setComponent("c", "MyBlock", {});
    world.addEntity("n");
    world.setComponent("n", GRID_POSITION, { gx: 0, gz: -1 });
    world.setComponent("n", "MyBlock", {});

    const sys = createWangTileResolverSystem({
      sameFamilyPredicateFactory: (w) => {
        const index = new Map<string, true>();
        for (const id of w.query(["MyBlock", GRID_POSITION])) {
          const pos = w.getComponent<{ gx: number; gz: number }>(id, GRID_POSITION);
          if (pos !== undefined) index.set(`${pos.gx},${pos.gz}`, true);
        }
        return {
          predicateFor(): (gx: number, gz: number) => boolean {
            return (gx, gz) => index.has(`${gx},${gz}`);
          }
        };
      }
    });
    sys.fixedUpdate!(makeContext(world));
    // Centre has only north neighbour via MyBlock → bit3 = 8.
    expect(
      world.getComponent<WangTileComponent>("c", WANG_TILE)?.currentVariantIndex
    ).toBe(0b1000);
  });
});
