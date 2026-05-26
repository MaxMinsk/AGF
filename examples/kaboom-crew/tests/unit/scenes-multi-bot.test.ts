// S141 — every kaboom-crew arena seeds bot.1 + bot.2 + bot.3 at
// distinct cells inside the grid bounds. Catches an accidental
// scene edit that drops one of the multi-bot spawn points.

import { describe, expect, it } from "vitest";

import startScene from "../../scenes/start.scene.json";
import wideScene from "../../scenes/wide.scene.json";
import corridorScene from "../../scenes/corridor.scene.json";

type Instance = { id: string; prefab: string; overrides?: { GridPosition?: { gx?: number; gz?: number } } };
type Entity = { id: string; components: Record<string, unknown> };
type Scene = { id: string; entities: Entity[]; instances: Instance[] };

const SCENES: ReadonlyArray<{ name: string; scene: Scene }> = [
  { name: "start", scene: startScene as Scene },
  { name: "wide", scene: wideScene as Scene },
  { name: "corridor", scene: corridorScene as Scene }
];

describe("multi-bot scene seeds (S141)", () => {
  for (const { name, scene } of SCENES) {
    describe(`scene ${name}`, () => {
      const bots = scene.instances.filter((i) => i.prefab === "bot");

      it("has exactly three bot instances", () => {
        expect(bots).toHaveLength(3);
        const ids = new Set(bots.map((b) => b.id));
        expect(ids).toEqual(new Set(["bot.1", "bot.2", "bot.3"]));
      });

      it("each bot spawns at a distinct cell", () => {
        const cells = new Set(bots.map((b) => `${b.overrides?.GridPosition?.gx}.${b.overrides?.GridPosition?.gz}`));
        expect(cells.size).toBe(3);
      });

      it("every bot cell is inside the grid bounds", () => {
        const grid = scene.entities.find((e) => e.id === "grid.config");
        expect(grid).toBeDefined();
        const cfg = grid!.components["Grid"] as { sizeX?: number; sizeZ?: number };
        const sizeX = cfg.sizeX ?? 0;
        const sizeZ = cfg.sizeZ ?? 0;
        for (const b of bots) {
          const gx = b.overrides?.GridPosition?.gx;
          const gz = b.overrides?.GridPosition?.gz;
          expect(gx, `${b.id} gx`).toBeDefined();
          expect(gz, `${b.id} gz`).toBeDefined();
          expect(gx!).toBeGreaterThanOrEqual(0);
          expect(gx!).toBeLessThan(sizeX);
          expect(gz!).toBeGreaterThanOrEqual(0);
          expect(gz!).toBeLessThan(sizeZ);
        }
      });
    });
  }
});
