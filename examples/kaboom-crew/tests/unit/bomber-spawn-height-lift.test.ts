// S173 GDP-2026-05-28-010 — bombers / blocks / pickups authored on a
// non-zero heightmap cell sit visually on top of their cell. The
// applyHeightmapCommands helper builds the `component.set Transform`
// commands during scene-load.

import { describe, expect, it } from "vitest";

import type { SceneInput } from "../../../../engine/core/ecs/types";
import { applyHeightmapCommands } from "../../src/bootstrap-helpers";

describe("bomber spawn height lift (S173)", () => {
  it("returns no commands when the scene has no heightmap", () => {
    const scene: SceneInput = {
      id: "flat",
      entities: [
        {
          id: "grid.config",
          components: { Grid: { cellSize: 1, sizeX: 3, sizeZ: 3 } }
        },
        {
          id: "player.1",
          components: {
            Transform: { position: [1, 0.4, 1], rotation: [0, 0, 0], scale: [1, 1, 1] },
            GridPosition: { gx: 1, gz: 1 }
          }
        }
      ]
    };

    expect(applyHeightmapCommands(scene)).toEqual([]);
  });

  it("writes Heightmap on the grid singleton when the scene has a heightmap", () => {
    const heightmap = [
      [0, 0, 0],
      [0, 2, 0],
      [0, 0, 0]
    ];
    const scene: SceneInput = {
      id: "plateau",
      heightmap,
      entities: [
        {
          id: "grid.config",
          components: { Grid: { cellSize: 1, sizeX: 3, sizeZ: 3 } }
        }
      ]
    };

    const commands = applyHeightmapCommands(scene);
    const heightmapCommand = commands.find(
      (c) => c.kind === "component.set" && c.entityId === "grid.config" && c.component === "Heightmap"
    );
    expect(heightmapCommand).toBeDefined();
    expect((heightmapCommand as { data: { values: number[][] } }).data.values).toEqual(heightmap);
  });

  it("lifts a bomber root authored at Y=0.4 on a plateau cell to Y=0.4 + cellHeight", () => {
    const heightmap = [
      [0, 0, 0],
      [0, 2, 0],
      [0, 0, 0]
    ];
    const scene: SceneInput = {
      id: "plateau",
      heightmap,
      entities: [
        {
          id: "grid.config",
          components: { Grid: { cellSize: 1, sizeX: 3, sizeZ: 3 } }
        },
        {
          // Bomber root sitting on the plateau cell.
          id: "player.1",
          components: {
            Transform: { position: [1, 0.4, 1], rotation: [0, 0, 0], scale: [1, 1, 1] },
            GridPosition: { gx: 1, gz: 1 }
          }
        }
      ]
    };

    const commands = applyHeightmapCommands(scene);
    const transformCommand = commands.find(
      (c) => c.kind === "component.set" && c.entityId === "player.1" && c.component === "Transform"
    );
    expect(transformCommand).toBeDefined();
    const lifted = (transformCommand as { data: { position: number[] } }).data.position;
    expect(lifted[0]).toBe(1);
    expect(lifted[1]).toBeCloseTo(2.4, 5); // 0.4 (authored) + 2 (plateau)
    expect(lifted[2]).toBe(1);
  });

  it("does NOT lift entities on height-0 cells (no superfluous Transform writes)", () => {
    const heightmap = [
      [0, 0, 0],
      [0, 2, 0],
      [0, 0, 0]
    ];
    const scene: SceneInput = {
      id: "plateau",
      heightmap,
      entities: [
        {
          id: "grid.config",
          components: { Grid: { cellSize: 1, sizeX: 3, sizeZ: 3 } }
        },
        {
          id: "player.1",
          components: {
            Transform: { position: [0, 0.4, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
            GridPosition: { gx: 0, gz: 0 } // flat cell
          }
        }
      ]
    };

    const commands = applyHeightmapCommands(scene);
    const transformCommand = commands.find(
      (c) => c.kind === "component.set" && c.entityId === "player.1" && c.component === "Transform"
    );
    expect(transformCommand).toBeUndefined();
  });

  it("S174 — lifts a ramp cell entity to the midpoint between fromHeight + toHeight (not just the base cell height)", () => {
    const heightmap = [
      [0, 0, 0],
      [0, 0, 1],
      [0, 0, 0]
    ];
    const scene: SceneInput = {
      id: "ramp-demo",
      heightmap,
      entities: [
        {
          id: "grid.config",
          components: { Grid: { cellSize: 1, sizeX: 3, sizeZ: 3 } }
        },
        {
          // Ramp cell at (1,1): heightmap entry is 0 (fromHeight); the
          // ramp climbs east to (2,1) at H=1. Authored Y at 0 (cell
          // top) → expect lifted Y to be midpoint = 0.5.
          id: "ramp.east",
          components: {
            Transform: { position: [1, 0, 1], rotation: [0, 0, 0], scale: [0.95, 0.05, 0.95] },
            GridPosition: { gx: 1, gz: 1 },
            Ramp: { fromHeight: 0, toHeight: 1, direction: "E" }
          }
        }
      ]
    };

    const commands = applyHeightmapCommands(scene);
    const rampLift = commands.find(
      (c) => c.kind === "component.set" && c.entityId === "ramp.east" && c.component === "Transform"
    );
    expect(rampLift).toBeDefined();
    const lifted = (rampLift as { data: { position: number[] } }).data.position;
    expect(lifted[0]).toBe(1);
    // Midpoint of [0, 1] = 0.5; authored Y = 0 → final Y = 0.5.
    expect(lifted[1]).toBeCloseTo(0.5, 5);
    expect(lifted[2]).toBe(1);
  });

  it("S174 — a ramp cell whose heightmap entry is fromHeight=1 (mid-chain) lifts to 1.5", () => {
    const heightmap = [
      [0, 0, 0, 0],
      [0, 0, 1, 2],
      [0, 0, 0, 0]
    ];
    const scene: SceneInput = {
      id: "ramp-chain",
      heightmap,
      entities: [
        {
          id: "grid.config",
          components: { Grid: { cellSize: 1, sizeX: 4, sizeZ: 3 } }
        },
        {
          // Second-step ramp at (gx=2, gz=1): fromHeight=1, toHeight=2.
          id: "ramp.east.high",
          components: {
            Transform: { position: [2, 0, 1], rotation: [0, 0, 0], scale: [0.95, 0.05, 0.95] },
            GridPosition: { gx: 2, gz: 1 },
            Ramp: { fromHeight: 1, toHeight: 2, direction: "E" }
          }
        }
      ]
    };

    const commands = applyHeightmapCommands(scene);
    const rampLift = commands.find(
      (c) => c.kind === "component.set" && c.entityId === "ramp.east.high" && c.component === "Transform"
    );
    expect(rampLift).toBeDefined();
    const lifted = (rampLift as { data: { position: number[] } }).data.position;
    expect(lifted[1]).toBeCloseTo(1.5, 5);
  });

  it("skips entities parented to another Transform (avoids double-lifting limb meshes)", () => {
    const heightmap = [
      [2]
    ];
    const scene: SceneInput = {
      id: "single-plateau",
      heightmap,
      entities: [
        {
          id: "grid.config",
          components: { Grid: { cellSize: 1, sizeX: 1, sizeZ: 1 } }
        },
        {
          id: "player.1",
          components: {
            Transform: { position: [0, 0.4, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
            GridPosition: { gx: 0, gz: 0 }
          }
        },
        {
          // Child limb mesh — parented to player.1; its Y is local to
          // the parent and must not be lifted independently.
          id: "player.1.torso",
          components: {
            Transform: { position: [0, 0.5, 0], rotation: [0, 0, 0], scale: [1, 1, 1], parent: "player.1" },
            GridPosition: { gx: 0, gz: 0 }
          }
        }
      ]
    };

    const commands = applyHeightmapCommands(scene);
    const childLift = commands.find(
      (c) => c.kind === "component.set" && c.entityId === "player.1.torso" && c.component === "Transform"
    );
    expect(childLift).toBeUndefined();
  });
});
