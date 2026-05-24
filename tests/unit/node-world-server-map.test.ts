// S118 KABOOM-MP-SPRINT-B chunk 2 — map-loader + ServerWorld map seam.

import { describe, expect, it } from "vitest";

import { computeBlastCells, loadDefaultMap, loadMapFromScene } from "../../examples/backends/node-world-server/src/map-loader";
import { ServerWorld } from "../../examples/backends/node-world-server/src/world";

describe("map-loader (S118)", () => {
  it("loadDefaultMap reads start.scene.json: 15×11 grid + 4 hard walls + 4 soft blocks", () => {
    const map = loadDefaultMap();
    expect(map.gridSize()).toEqual({ sizeX: 15, sizeZ: 11 });
    // Hard-block corners per start.scene.json
    expect(map.cellAt(3, 3)).toBe("hard-wall");
    expect(map.cellAt(11, 3)).toBe("hard-wall");
    expect(map.cellAt(3, 7)).toBe("hard-wall");
    expect(map.cellAt(11, 7)).toBe("hard-wall");
    // Soft-block row at z=5
    expect(map.cellAt(4, 5)).toBe("soft-block");
    expect(map.cellAt(5, 5)).toBe("soft-block");
    expect(map.cellAt(9, 5)).toBe("soft-block");
    expect(map.cellAt(10, 5)).toBe("soft-block");
    // Random empty cells
    expect(map.cellAt(0, 0)).toBe("empty");
    expect(map.cellAt(7, 5)).toBe("empty");
  });

  it("out-of-bounds reads as hard-wall", () => {
    const map = loadDefaultMap();
    expect(map.cellAt(-1, 5)).toBe("hard-wall");
    expect(map.cellAt(15, 5)).toBe("hard-wall");
    expect(map.cellAt(5, -1)).toBe("hard-wall");
    expect(map.cellAt(5, 11)).toBe("hard-wall");
  });

  it("destroySoftBlock removes the soft block + cellAt returns empty", () => {
    const map = loadDefaultMap();
    expect(map.cellAt(4, 5)).toBe("soft-block");
    expect(map.destroySoftBlock(4, 5)).toBe(true);
    expect(map.cellAt(4, 5)).toBe("empty");
  });

  it("destroySoftBlock returns false for an empty cell or a hard wall", () => {
    const map = loadDefaultMap();
    expect(map.destroySoftBlock(0, 0)).toBe(false); // empty
    expect(map.destroySoftBlock(3, 3)).toBe(false); // hard
    // hard wall stays
    expect(map.cellAt(3, 3)).toBe("hard-wall");
  });

  it("loadMapFromScene handles synthetic scenes for tests", () => {
    const map = loadMapFromScene({
      entities: [{ id: "grid.config", components: { Grid: { sizeX: 4, sizeZ: 4 } } }],
      instances: [
        { prefab: "hard-block", overrides: { GridPosition: { gx: 1, gz: 1 } } },
        { prefab: "soft-block", overrides: { GridPosition: { gx: 2, gz: 2 } } }
      ]
    });
    expect(map.gridSize()).toEqual({ sizeX: 4, sizeZ: 4 });
    expect(map.cellAt(1, 1)).toBe("hard-wall");
    expect(map.cellAt(2, 2)).toBe("soft-block");
    expect(map.cellAt(0, 0)).toBe("empty");
  });
});

describe("computeBlastCells (S118)", () => {
  it("origin cell is always included, even with range=0", () => {
    const map = loadMapFromScene({
      entities: [{ id: "grid.config", components: { Grid: { sizeX: 9, sizeZ: 9 } } }]
    });
    const cells = computeBlastCells(map, 4, 4, 0);
    expect(cells).toEqual([{ gx: 4, gz: 4 }]);
  });

  it("range=2 in an empty arena: origin + 2 cells in each of 4 directions = 9 cells", () => {
    const map = loadMapFromScene({
      entities: [{ id: "grid.config", components: { Grid: { sizeX: 11, sizeZ: 11 } } }]
    });
    const cells = computeBlastCells(map, 5, 5, 2);
    expect(cells.length).toBe(9);
    expect(cells).toContainEqual({ gx: 5, gz: 5 });
    expect(cells).toContainEqual({ gx: 6, gz: 5 });
    expect(cells).toContainEqual({ gx: 7, gz: 5 });
    expect(cells).toContainEqual({ gx: 3, gz: 5 });
    expect(cells).toContainEqual({ gx: 4, gz: 5 });
  });

  it("blast stops at a hard wall WITHOUT including the wall cell", () => {
    const map = loadMapFromScene({
      entities: [{ id: "grid.config", components: { Grid: { sizeX: 11, sizeZ: 11 } } }],
      instances: [{ prefab: "hard-block", overrides: { GridPosition: { gx: 7, gz: 5 } } }]
    });
    const cells = computeBlastCells(map, 5, 5, 3);
    // +X direction: 6 included, 7 (wall) excluded, 8 unreachable
    expect(cells).toContainEqual({ gx: 6, gz: 5 });
    expect(cells).not.toContainEqual({ gx: 7, gz: 5 });
    expect(cells).not.toContainEqual({ gx: 8, gz: 5 });
  });

  it("blast hits soft block then stops INCLUDING the block cell", () => {
    const map = loadMapFromScene({
      entities: [{ id: "grid.config", components: { Grid: { sizeX: 11, sizeZ: 11 } } }],
      instances: [{ prefab: "soft-block", overrides: { GridPosition: { gx: 7, gz: 5 } } }]
    });
    const cells = computeBlastCells(map, 5, 5, 3);
    expect(cells).toContainEqual({ gx: 6, gz: 5 });
    expect(cells).toContainEqual({ gx: 7, gz: 5 }); // soft included
    expect(cells).not.toContainEqual({ gx: 8, gz: 5 });
  });

  it("blast stops at arena edge (out-of-bounds reads as hard-wall)", () => {
    const map = loadMapFromScene({
      entities: [{ id: "grid.config", components: { Grid: { sizeX: 3, sizeZ: 3 } } }]
    });
    const cells = computeBlastCells(map, 0, 0, 5);
    // From (0,0) only +X (1,0)+(2,0) and +Z (0,1)+(0,2) reachable
    expect(cells.length).toBe(5);
    expect(cells).toContainEqual({ gx: 0, gz: 0 });
    expect(cells).toContainEqual({ gx: 1, gz: 0 });
    expect(cells).toContainEqual({ gx: 2, gz: 0 });
    expect(cells).toContainEqual({ gx: 0, gz: 1 });
    expect(cells).toContainEqual({ gx: 0, gz: 2 });
  });

  it("default-map blast at (4,5) with range=2 hits soft-block(4,5)+(5,5) but not soft(9,5)", () => {
    const map = loadDefaultMap();
    const cells = computeBlastCells(map, 4, 5, 2);
    expect(cells).toContainEqual({ gx: 4, gz: 5 }); // origin (a soft block)
    expect(cells).toContainEqual({ gx: 5, gz: 5 }); // hit + stop
    expect(cells).not.toContainEqual({ gx: 6, gz: 5 });
  });
});

describe("ServerWorld bomb detonation emits blast cells (S118)", () => {
  it("detonation populates BlastEvent.cells", () => {
    const world = new ServerWorld();
    world.join("alice");
    // Move alice into empty mid-arena before placing.
    world.placeBomb("alice", 7, 4);
    world.tick(3.0);
    const events = world.drainBlastEvents();
    expect(events.length).toBe(1);
    expect(events[0]!.cells.length).toBeGreaterThan(1);
    expect(events[0]!.cells).toContainEqual({ gx: 7, gz: 4 }); // origin
  });
});

describe("ServerWorld bomb chain detonation (S118)", () => {
  it("blast cell touching another bomb chains its detonation in the same tick", () => {
    const world = new ServerWorld();
    world.join("alice");
    // Two bombs one apart on the +X axis. Bomb A at (5, 0) range=2
    // → blast reaches (6, 0) and (7, 0). Bomb B at (6, 0) is within
    // the blast → chains.
    const a = world.placeBomb("alice", 5, 0)!;
    const b = world.placeBomb("alice", 6, 0)!;
    expect(a).toBeDefined();
    expect(b).toBeDefined();
    // Only A fuses out via timer; B chains.
    world.tick(3.0);
    const events = world.drainBlastEvents();
    expect(events.length).toBe(2);
    const ids = events.map((e) => e.bombId).sort();
    expect(ids).toEqual([a, b].sort());
  });

  it("chain detonation has origin = the chained bomb's cell, not the initial bomb", () => {
    const world = new ServerWorld();
    world.join("alice");
    world.placeBomb("alice", 5, 0);
    world.placeBomb("alice", 7, 0);
    world.tick(3.0);
    const events = world.drainBlastEvents();
    expect(events.length).toBe(2);
    const origins = events.map((e) => `${e.originGx},${e.originGz}`).sort();
    expect(origins).toEqual(["5,0", "7,0"]);
  });

  it("three-bomb chain cascades A → B → C in one tick", () => {
    const world = new ServerWorld();
    world.join("alice");
    world.placeBomb("alice", 1, 0);
    world.placeBomb("alice", 2, 0);
    world.placeBomb("alice", 4, 0); // A(1) → B(2) → C(4) via B's blast (2,0)→(3,0)→(4,0 stops if not OOB)
    world.tick(3.0);
    const events = world.drainBlastEvents();
    expect(events.length).toBe(3);
  });

});

describe("ServerWorld bomber death (S118)", () => {
  it("snapshot ships BomberStats.alive=true on join", () => {
    const world = new ServerWorld();
    world.join("alice");
    const snap = world.snapshot();
    const entity = snap.entities.find((e) => e.id === "player.alice")!;
    expect(entity.components["BomberStats"]).toMatchObject({ alive: true });
  });

  it("bomb that hits a bomber's cell flips alive=false + emits bomberDied with killerId", () => {
    const world = new ServerWorld();
    world.join("alice");
    world.join("bravo");
    // Walk bravo to (3, 0) using small-dt ticks (so the integration
    // doesn't overshoot), THEN stop her intent so the big detonation
    // tick doesn't carry her out of the blast.
    world.setIntent("bravo", [1, 0], 0);
    for (let i = 0; i < 60; i += 1) world.tick(0.016);
    world.setIntent("bravo", [0, 0], 1);
    world.placeBomb("alice", 3, 0);
    world.tick(3.0);
    const deaths = world.drainBomberDied();
    const bravoDeath = deaths.find((d) => d.entityId === "player.bravo");
    expect(bravoDeath).toBeDefined();
    expect(bravoDeath!.killerId).toBe("player.alice");
    const snap = world.snapshot();
    const bravoEntity = snap.entities.find((e) => e.id === "player.bravo")!;
    expect((bravoEntity.components["BomberStats"] as { alive: boolean }).alive).toBe(false);
  });

  it("dead bomber is not killed again by a second blast", () => {
    const world = new ServerWorld();
    world.join("alice");
    // alice is at (0,0); bomb on the same cell self-kills.
    world.placeBomb("alice", 0, 0);
    world.tick(3.0);
    expect(world.drainBomberDied().length).toBe(1);
    world.placeBomb("alice", 0, 0);
    world.tick(3.0);
    expect(world.drainBomberDied().length).toBe(0); // already dead
  });

  it("blast that does NOT touch a bomber emits no bomberDied", () => {
    const world = new ServerWorld();
    world.join("alice");
    world.join("bravo");
    world.setIntent("bravo", [1, 0], 0);
    for (let i = 0; i < 120; i += 1) world.tick(0.016); // bravo to ~(6-7, 0)
    world.setIntent("bravo", [0, 0], 1);
    // alice at (0, 0); bomb at (10, 0) range=2 — alice not in range,
    // and bravo (~6-7, 0) is just out of range too.
    world.placeBomb("alice", 10, 0);
    world.tick(3.0);
    expect(world.drainBomberDied().length).toBe(0);
  });
});

describe("ServerWorld block destruction (S118)", () => {
  it("blast adjacent to soft-block(4,5) destroys it + emits blockDestroyed", () => {
    const world = new ServerWorld();
    world.join("alice");
    // soft.1 sits at (4, 5). Place a bomb at (5, 5) which is also a soft-block.
    // Per S118 propagation: origin (5,5) is included (it's a soft-block — included+stop in +X and -Z; -X goes one step to (4,5) which is also soft — included+stop).
    // Origin cell itself: server checks cellAt — currently (5,5) is soft-block. The walk includes it.
    // Net: both (5,5) and (4,5) destroyed.
    world.placeBomb("alice", 5, 5);
    world.tick(3.0);
    const blasts = world.drainBlastEvents();
    expect(blasts.length).toBe(1);
    const blocks = world.drainBlockDestroyed();
    expect(blocks.length).toBe(2);
    const cells = blocks.map((b) => `${b.gx},${b.gz}`).sort();
    expect(cells).toEqual(["4,5", "5,5"]);
    expect(world.cellAt(5, 5)).toBe("empty");
    expect(world.cellAt(4, 5)).toBe("empty");
  });

  it("blast in empty cells emits no blockDestroyed", () => {
    const world = new ServerWorld();
    world.join("alice");
    world.placeBomb("alice", 7, 4); // open cell
    world.tick(3.0);
    expect(world.drainBlastEvents().length).toBe(1);
    expect(world.drainBlockDestroyed().length).toBe(0);
  });

  it("blast that hits a hard wall does not destroy or emit for the wall", () => {
    const world = new ServerWorld();
    world.join("alice");
    // Bomb at (1,3) range=2: hard-wall at (3,3) stops the +X walk
    // before it can reach it; no soft-blocks within range, so the
    // only destruction would be a hard-wall — which the propagation
    // rules forbid.
    world.placeBomb("alice", 1, 3);
    world.tick(3.0);
    const blasts = world.drainBlastEvents();
    expect(blasts[0]!.cells).not.toContainEqual({ gx: 3, gz: 3 });
    expect(world.cellAt(3, 3)).toBe("hard-wall"); // still there
    expect(world.drainBlockDestroyed().length).toBe(0);
  });

  it("drainBlockDestroyed clears the queue", () => {
    const world = new ServerWorld();
    world.join("alice");
    world.placeBomb("alice", 5, 5);
    world.tick(3.0);
    expect(world.drainBlockDestroyed().length).toBeGreaterThan(0);
    expect(world.drainBlockDestroyed().length).toBe(0);
  });
});

describe("ServerWorld map seam (S118)", () => {
  it("ServerWorld exposes the default map via cellAt + gridSize + destroySoftBlock", () => {
    const world = new ServerWorld();
    expect(world.gridSize()).toEqual({ sizeX: 15, sizeZ: 11 });
    expect(world.cellAt(3, 3)).toBe("hard-wall");
    expect(world.cellAt(4, 5)).toBe("soft-block");
    expect(world.destroySoftBlock(4, 5)).toBe(true);
    expect(world.cellAt(4, 5)).toBe("empty");
  });

  it("ServerWorld accepts an injected map for tests (no fs read)", () => {
    const injected = loadMapFromScene({
      entities: [{ id: "grid.config", components: { Grid: { sizeX: 3, sizeZ: 3 } } }],
      instances: [{ prefab: "hard-block", overrides: { GridPosition: { gx: 1, gz: 1 } } }]
    });
    const world = new ServerWorld({ map: injected });
    expect(world.gridSize()).toEqual({ sizeX: 3, sizeZ: 3 });
    expect(world.cellAt(1, 1)).toBe("hard-wall");
  });
});
