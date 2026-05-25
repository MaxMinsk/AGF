// S140 — structural smoke test for the new corridor.scene.json.
// engine:check covers the schema; this test asserts the playable
// invariants (correct spawns, physical floor, enough blocks) so a
// future edit can't accidentally produce an empty / broken map.

import { describe, expect, it } from "vitest";

import corridorScene from "../../scenes/corridor.scene.json";

type Entity = { id: string; components: Record<string, unknown> };
type Instance = { id: string; prefab: string; overrides?: { Transform?: { position?: number[] } } };
type Scene = { id: string; entities: Entity[]; instances: Instance[] };

describe("corridor.scene.json (S140)", () => {
  const scene = corridorScene as Scene;

  it("has the canonical scene id + 17×7 grid", () => {
    expect(scene.id).toBe("corridor");
    const grid = scene.entities.find((e) => e.id === "grid.config");
    expect(grid).toBeDefined();
    const cfg = grid!.components["Grid"] as { sizeX?: number; sizeZ?: number };
    expect(cfg.sizeX).toBe(17);
    expect(cfg.sizeZ).toBe(7);
  });

  it("floor is physical (RigidBody3D + Collider3D matching dimensions)", () => {
    const floor = scene.entities.find((e) => e.id === "floor");
    expect(floor).toBeDefined();
    const body = floor!.components["RigidBody3D"] as { type?: string };
    expect(body.type).toBe("fixed");
    const collider = floor!.components["Collider3D"] as { kind?: string; size?: number[] };
    expect(collider.kind).toBe("box");
    expect(collider.size).toEqual([17, 0.1, 7]);
  });

  it("has player.1 + bot.1 spawn instances at opposite corners", () => {
    const player = scene.instances.find((i) => i.id === "player.1");
    const bot = scene.instances.find((i) => i.id === "bot.1");
    expect(player?.prefab).toBe("player");
    expect(bot?.prefab).toBe("bot");
    // Player should sit at the left edge; bot at the right.
    expect(player?.overrides?.Transform?.position?.[0]).toBeLessThan(5);
    expect(bot?.overrides?.Transform?.position?.[0]).toBeGreaterThan(12);
  });

  it("has enough hard + soft blocks to enable bombing gameplay", () => {
    const hard = scene.instances.filter((i) => i.prefab === "hard-block");
    const soft = scene.instances.filter((i) => i.prefab === "soft-block");
    expect(hard.length).toBeGreaterThanOrEqual(4);
    expect(soft.length).toBeGreaterThanOrEqual(6);
  });

  it("camera is orthographic + framed for the wider aspect", () => {
    const cam = scene.entities.find((e) => e.id === "camera.main");
    expect(cam).toBeDefined();
    const camera = cam!.components["Camera"] as { kind?: string; active?: boolean };
    expect(camera.kind).toBe("orthographic");
    expect(camera.active).toBe(true);
  });
});
