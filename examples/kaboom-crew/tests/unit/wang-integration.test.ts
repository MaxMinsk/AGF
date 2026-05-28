// S170 KABOOM-WANG-INTEGRATION (GDP-2026-05-28-004 Stage 3) — end-to-
// end coverage of the integration flow:
//
//   1. block-variant-system stamps WangTile + WangTileFamilyMember on
//      every hard / soft block cell.
//   2. engine WangTileResolverSystem (via resolveAll) reads the tags +
//      writes currentVariantIndex (= the 4-edge bitmask).
//   3. createKaboomWangMeshSyncSystem reads the variant index, maps it
//      via wang-family-lookup, and rewrites MeshRenderer.mesh.
//
// Wang resolver is engine code (tested in tests/unit/wang-tile-*); this
// suite covers the project-side stitching only.

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { World } from "../../../../engine/core/ecs/world";
import type { SystemContext } from "../../../../engine/core/systems/types";
import {
  clearWangTileFamilies,
  resolveAll,
  WANG_TILE,
  WANG_TILE_FAMILY_MEMBER,
  type WangTileComponent
} from "../../../../engine/render/autotile";

import {
  HARD_BLOCK_WANG_FAMILY,
  registerKaboomWangFamilies,
  SOFT_BLOCK_WANG_FAMILY
} from "../../src/blocks/register-wang-families";
import {
  hardBlockBitmaskToVariant,
  softBlockBitmaskToVariant
} from "../../src/blocks/wang-family-lookup";
import {
  createKaboomBlockVariantSystem,
  createKaboomWangMeshSyncSystem
} from "../../src/systems/block-variant-system";

function makeContext(world: World): SystemContext {
  return {
    world,
    time: { elapsed: 0, dt: 1 / 60, fixedDt: 1 / 60, frameCount: 0, fixedStepCount: 0 }
  };
}

function addSoftBlockCell(world: World, id: string, gx: number, gz: number): void {
  world.addEntity(id);
  world.setComponent(id, "GridPosition", { gx, gz });
  world.setComponent(id, "GridOccupant", { layer: "block" });
  world.setComponent(id, "MeshRenderer", { mesh: "box-1x1x1" });
}

function addHardBlockCell(world: World, id: string, gx: number, gz: number): void {
  world.addEntity(id);
  world.setComponent(id, "GridPosition", { gx, gz });
  world.setComponent(id, "GridOccupant", { layer: "wall" });
  world.setComponent(id, "MeshRenderer", { mesh: "box-1x1x1" });
}

describe("S170 KABOOM-WANG-INTEGRATION — full bridge flow", () => {
  beforeEach(() => {
    clearWangTileFamilies();
    registerKaboomWangFamilies();
  });
  afterEach(() => {
    clearWangTileFamilies();
  });

  it("stamps WangTile + WangTileFamilyMember on every soft block via block-variant-system", () => {
    const world = new World();
    // 3×3 grid of soft blocks.
    for (let gx = 0; gx < 3; gx += 1) {
      for (let gz = 0; gz < 3; gz += 1) {
        addSoftBlockCell(world, `soft-${gx}-${gz}`, gx, gz);
      }
    }
    const variantSystem = createKaboomBlockVariantSystem();
    variantSystem.fixedUpdate!(makeContext(world));

    // Every cell should now carry WangTile + WangTileFamilyMember.
    for (let gx = 0; gx < 3; gx += 1) {
      for (let gz = 0; gz < 3; gz += 1) {
        const id = `soft-${gx}-${gz}`;
        const wang = world.getComponent<WangTileComponent>(id, WANG_TILE);
        const member = world.getComponent<{ familyName: string }>(id, WANG_TILE_FAMILY_MEMBER);
        expect(wang?.familyName).toBe(SOFT_BLOCK_WANG_FAMILY);
        expect(member?.familyName).toBe(SOFT_BLOCK_WANG_FAMILY);
      }
    }
  });

  it("resolveAll writes the expected bitmask for each cell in a 3×3 soft-block grid", () => {
    const world = new World();
    for (let gx = 0; gx < 3; gx += 1) {
      for (let gz = 0; gz < 3; gz += 1) {
        addSoftBlockCell(world, `soft-${gx}-${gz}`, gx, gz);
      }
    }
    createKaboomBlockVariantSystem().fixedUpdate!(makeContext(world));
    resolveAll(world);

    // Centre cell (1,1) has N/E/S/W neighbours → bitmask 15.
    const centre = world.getComponent<WangTileComponent>("soft-1-1", WANG_TILE);
    expect(centre?.currentVariantIndex).toBe(15);

    // Top-left corner (0,0): N=no, E=yes, S=yes, W=no → bit2|bit1 = 4|2 = 6.
    const topLeft = world.getComponent<WangTileComponent>("soft-0-0", WANG_TILE);
    expect(topLeft?.currentVariantIndex).toBe(0b0110);

    // Top-right corner (2,0): N=no, E=no, S=yes, W=yes → bit1|bit0 = 2|1 = 3.
    const topRight = world.getComponent<WangTileComponent>("soft-2-0", WANG_TILE);
    expect(topRight?.currentVariantIndex).toBe(0b0011);

    // Bottom-left (0,2): N=yes, E=yes, S=no, W=no → bit3|bit2 = 8|4 = 12.
    const bottomLeft = world.getComponent<WangTileComponent>("soft-0-2", WANG_TILE);
    expect(bottomLeft?.currentVariantIndex).toBe(0b1100);

    // Top-edge centre (1,0): N=no, E=yes, S=yes, W=yes → 4|2|1 = 7.
    const topCentre = world.getComponent<WangTileComponent>("soft-1-0", WANG_TILE);
    expect(topCentre?.currentVariantIndex).toBe(0b0111);
  });

  it("mesh-sync bridge rewrites MeshRenderer.mesh per the lookup table for soft blocks", () => {
    const world = new World();
    for (let gx = 0; gx < 3; gx += 1) {
      for (let gz = 0; gz < 3; gz += 1) {
        addSoftBlockCell(world, `soft-${gx}-${gz}`, gx, gz);
      }
    }
    createKaboomBlockVariantSystem().fixedUpdate!(makeContext(world));
    resolveAll(world);
    const syncSystem = createKaboomWangMeshSyncSystem();
    syncSystem.fixedUpdate!(makeContext(world));

    // Centre (1,1): bitmask 15 → variant 2 → procedural:kaboom-soft-block-2.
    const centreMesh = world.getComponent<{ mesh?: string }>("soft-1-1", "MeshRenderer");
    expect(centreMesh?.mesh).toBe("procedural:kaboom-soft-block-2");

    // Top-left (0,0): bitmask 6 → variant 1 → procedural:kaboom-soft-block-1.
    const tlMesh = world.getComponent<{ mesh?: string }>("soft-0-0", "MeshRenderer");
    expect(tlMesh?.mesh).toBe(`procedural:kaboom-soft-block-${softBlockBitmaskToVariant(0b0110)}`);
    expect(tlMesh?.mesh).toBe("procedural:kaboom-soft-block-1");

    // Top-edge centre (1,0): bitmask 7 → variant 1 (T-junction).
    const tcMesh = world.getComponent<{ mesh?: string }>("soft-1-0", "MeshRenderer");
    expect(tcMesh?.mesh).toBe("procedural:kaboom-soft-block-1");
  });

  it("mesh-sync bridge writes the matching key for an isolated cell (variant 3)", () => {
    const world = new World();
    addSoftBlockCell(world, "isolated", 7, 7);
    createKaboomBlockVariantSystem().fixedUpdate!(makeContext(world));
    resolveAll(world);
    createKaboomWangMeshSyncSystem().fixedUpdate!(makeContext(world));

    const mesh = world.getComponent<{ mesh?: string }>("isolated", "MeshRenderer");
    // Isolated → bitmask 0 → variant 3.
    expect(softBlockBitmaskToVariant(0)).toBe(3);
    expect(mesh?.mesh).toBe("procedural:kaboom-soft-block-3");
  });

  it("hard blocks resolve to procedural:kaboom-hard-block-N keys", () => {
    const world = new World();
    addHardBlockCell(world, "h1", 0, 0);
    addHardBlockCell(world, "h2", 1, 0);
    createKaboomBlockVariantSystem().fixedUpdate!(makeContext(world));
    resolveAll(world);
    createKaboomWangMeshSyncSystem().fixedUpdate!(makeContext(world));

    // h1 (0,0) has east neighbour only → bitmask 4 → variant 0.
    expect(hardBlockBitmaskToVariant(0b0100)).toBe(0);
    const h1 = world.getComponent<{ mesh?: string }>("h1", "MeshRenderer");
    expect(h1?.mesh).toBe("procedural:kaboom-hard-block-0");
    // h2 (1,0) has west neighbour only → bitmask 1 → variant 0.
    const h2 = world.getComponent<{ mesh?: string }>("h2", "MeshRenderer");
    expect(h2?.mesh).toBe("procedural:kaboom-hard-block-0");
  });

  it("hard + soft families resolve independently — neighbour of different family doesn't count", () => {
    const world = new World();
    // Centre = soft, north neighbour = hard. Soft centre should see
    // ZERO neighbours of its family.
    addSoftBlockCell(world, "centre", 5, 5);
    addHardBlockCell(world, "n", 5, 4);
    createKaboomBlockVariantSystem().fixedUpdate!(makeContext(world));
    resolveAll(world);
    createKaboomWangMeshSyncSystem().fixedUpdate!(makeContext(world));
    const centre = world.getComponent<{ mesh?: string }>("centre", "MeshRenderer");
    // Bitmask 0 (isolated) → soft variant 3.
    expect(centre?.mesh).toBe("procedural:kaboom-soft-block-3");
    // Hard north: hard has no other hard cells → bitmask 0 → variant 3.
    const n = world.getComponent<{ mesh?: string }>("n", "MeshRenderer");
    expect(n?.mesh).toBe("procedural:kaboom-hard-block-3");
  });

  it("registerKaboomWangFamilies is idempotent (HMR re-import safe)", () => {
    // The beforeEach already called it once. A second call must not throw.
    expect(() => registerKaboomWangFamilies()).not.toThrow();
  });
});
