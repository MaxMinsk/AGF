// S143 — structural smoke tests for the 3 new arena variants
// (plaza, cross, pit) added in this sprint. Mirrors the S140
// corridor-scene test pattern: assert each scene has the canonical
// id, grid size, physical floor matching dimensions, all 4 bombers
// at distinct cells, and the expected hard/soft block counts.

import { describe, expect, it } from "vitest";

import plazaScene from "../../scenes/plaza.scene.json";
import crossScene from "../../scenes/cross.scene.json";
import pitScene from "../../scenes/pit.scene.json";
import beltZoneScene from "../../scenes/belt-zone.scene.json";

type Instance = {
  id: string;
  prefab: string;
  overrides?: { Transform?: { position?: number[] }; GridPosition?: { gx?: number; gz?: number } };
};
type Entity = { id: string; components: Record<string, unknown> };
type Scene = { id: string; entities: Entity[]; instances: Instance[] };

type Variant = {
  name: string;
  scene: Scene;
  gridSizeX: number;
  gridSizeZ: number;
  hardMin: number;
  hardMax: number;
  softMin: number;
  softMax: number;
};

const VARIANTS: ReadonlyArray<Variant> = [
  { name: "plaza", scene: plazaScene as Scene, gridSizeX: 13, gridSizeZ: 11, hardMin: 4, hardMax: 8, softMin: 4, softMax: 10 },
  { name: "cross", scene: crossScene as Scene, gridSizeX: 17, gridSizeZ: 17, hardMin: 24, hardMax: 30, softMin: 12, softMax: 20 },
  { name: "pit", scene: pitScene as Scene, gridSizeX: 11, gridSizeZ: 11, hardMin: 36, hardMax: 42, softMin: 14, softMax: 24 },
  // S146 belt-zone: hard walls + soft blocks are the only non-belt
  // instances; belts live as entities and are checked separately below.
  { name: "belt-zone", scene: beltZoneScene as Scene, gridSizeX: 15, gridSizeZ: 11, hardMin: 4, hardMax: 8, softMin: 4, softMax: 10 }
];

describe("S143 arena variants — plaza / cross / pit structural smoke", () => {
  for (const v of VARIANTS) {
    describe(`scene ${v.name}`, () => {
      it("has the canonical scene id", () => {
        expect(v.scene.id).toBe(v.name);
      });

      it(`has the ${v.gridSizeX}×${v.gridSizeZ} grid`, () => {
        const grid = v.scene.entities.find((e) => e.id === "grid.config");
        expect(grid).toBeDefined();
        const cfg = grid!.components["Grid"] as { sizeX?: number; sizeZ?: number };
        expect(cfg.sizeX).toBe(v.gridSizeX);
        expect(cfg.sizeZ).toBe(v.gridSizeZ);
      });

      it("floor is physical (RigidBody3D + Collider3D matching dimensions)", () => {
        const floor = v.scene.entities.find((e) => e.id === "floor");
        expect(floor).toBeDefined();
        const body = floor!.components["RigidBody3D"] as { type?: string };
        expect(body.type).toBe("fixed");
        const collider = floor!.components["Collider3D"] as { kind?: string; size?: number[] };
        expect(collider.kind).toBe("box");
        expect(collider.size).toEqual([v.gridSizeX, 0.1, v.gridSizeZ]);
      });

      it("seeds player.1 + bot.1 + bot.2 + bot.3 at distinct cells (multi-bot from S141)", () => {
        const bomberIds = ["player.1", "bot.1", "bot.2", "bot.3"];
        for (const id of bomberIds) {
          const inst = v.scene.instances.find((i) => i.id === id);
          expect(inst, `${v.name}: ${id} instance present`).toBeDefined();
        }
        const cells = new Set(
          bomberIds.map((id) => {
            const inst = v.scene.instances.find((i) => i.id === id)!;
            return `${inst.overrides?.GridPosition?.gx}.${inst.overrides?.GridPosition?.gz}`;
          })
        );
        expect(cells.size).toBe(4);
      });

      it(`hard-block count is within [${v.hardMin}, ${v.hardMax}]`, () => {
        const hard = v.scene.instances.filter((i) => i.prefab === "hard-block").length;
        expect(hard).toBeGreaterThanOrEqual(v.hardMin);
        expect(hard).toBeLessThanOrEqual(v.hardMax);
      });

      it(`soft-block count is within [${v.softMin}, ${v.softMax}]`, () => {
        const soft = v.scene.instances.filter((i) => i.prefab === "soft-block").length;
        expect(soft).toBeGreaterThanOrEqual(v.softMin);
        expect(soft).toBeLessThanOrEqual(v.softMax);
      });

      it("camera is orthographic + active", () => {
        const cam = v.scene.entities.find((e) => e.id === "camera.main");
        expect(cam).toBeDefined();
        const camera = cam!.components["Camera"] as { kind?: string; active?: boolean };
        expect(camera.kind).toBe("orthographic");
        expect(camera.active).toBe(true);
      });
    });
  }
});

describe("S146 belt-zone arena — ConveyorBelt entities", () => {
  const scene = beltZoneScene as Scene;

  it("has at least 4 belt cells", () => {
    const belts = scene.entities.filter((e) => e.components["ConveyorBelt"] !== undefined);
    expect(belts.length).toBeGreaterThanOrEqual(4);
  });

  it("each belt cell carries a valid direction (not zero-vector)", () => {
    const belts = scene.entities.filter((e) => e.components["ConveyorBelt"] !== undefined);
    for (const b of belts) {
      const cb = b.components["ConveyorBelt"] as { directionDx?: number; directionDz?: number };
      const nonZero = (cb.directionDx ?? 0) !== 0 || (cb.directionDz ?? 0) !== 0;
      expect(nonZero, `belt ${b.id} direction must be non-zero`).toBe(true);
    }
  });

  it("belt cells sit BELOW bombers (y ≤ 0.1) so the floor reads underneath", () => {
    const belts = scene.entities.filter((e) => e.components["ConveyorBelt"] !== undefined);
    for (const b of belts) {
      const t = b.components["Transform"] as { position?: number[] } | undefined;
      const y = t?.position?.[1] ?? 0;
      expect(y, `belt ${b.id} y=${y} must be ≤ 0.1`).toBeLessThanOrEqual(0.1);
    }
  });
});
