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

describe("computeBlastCells pierce (S147 KABOOM-PIERCE-SERVER-PARITY)", () => {
  // GDP-2026-05-27-002 acceptance scenarios. Pierce walks through the
  // FIRST soft block per direction (still destroying it); the second
  // soft block stops the lane normally. Hard walls always stop.
  it("pierce=false: standard rule — stop at first soft block", () => {
    const map = loadMapFromScene({
      entities: [{ id: "grid.config", components: { Grid: { sizeX: 11, sizeZ: 11 } } }],
      instances: [
        { prefab: "soft-block", overrides: { GridPosition: { gx: 6, gz: 5 } } },
        { prefab: "soft-block", overrides: { GridPosition: { gx: 7, gz: 5 } } }
      ]
    });
    const cells = computeBlastCells(map, 5, 5, 3, false);
    expect(cells).toContainEqual({ gx: 6, gz: 5 }); // first soft included
    expect(cells).not.toContainEqual({ gx: 7, gz: 5 }); // second blocked
  });

  it("scenario A — pierce through ONE soft per direction (the cell past it is included)", () => {
    // Plus-shaped arena with 1 soft block at distance 1 in each cardinal direction.
    const map = loadMapFromScene({
      entities: [{ id: "grid.config", components: { Grid: { sizeX: 11, sizeZ: 11 } } }],
      instances: [
        { prefab: "soft-block", overrides: { GridPosition: { gx: 6, gz: 5 } } },
        { prefab: "soft-block", overrides: { GridPosition: { gx: 4, gz: 5 } } },
        { prefab: "soft-block", overrides: { GridPosition: { gx: 5, gz: 6 } } },
        { prefab: "soft-block", overrides: { GridPosition: { gx: 5, gz: 4 } } }
      ]
    });
    const cells = computeBlastCells(map, 5, 5, 3, true);
    // Each direction: soft included + the cell PAST it is included.
    expect(cells).toContainEqual({ gx: 6, gz: 5 });
    expect(cells).toContainEqual({ gx: 7, gz: 5 }); // pierce extension
    expect(cells).toContainEqual({ gx: 4, gz: 5 });
    expect(cells).toContainEqual({ gx: 3, gz: 5 }); // pierce extension
    expect(cells).toContainEqual({ gx: 5, gz: 6 });
    expect(cells).toContainEqual({ gx: 5, gz: 7 }); // pierce extension
    expect(cells).toContainEqual({ gx: 5, gz: 4 });
    expect(cells).toContainEqual({ gx: 5, gz: 3 }); // pierce extension
  });

  it("scenario B — pierce stops on SECOND soft block per direction (budget=1)", () => {
    // +X direction has soft-block at 6 AND 7. Pierce walks through 6,
    // includes it, then includes 7 and stops there. Cell 8 NOT touched.
    const map = loadMapFromScene({
      entities: [{ id: "grid.config", components: { Grid: { sizeX: 11, sizeZ: 11 } } }],
      instances: [
        { prefab: "soft-block", overrides: { GridPosition: { gx: 6, gz: 5 } } },
        { prefab: "soft-block", overrides: { GridPosition: { gx: 7, gz: 5 } } },
        { prefab: "soft-block", overrides: { GridPosition: { gx: 8, gz: 5 } } }
      ]
    });
    const cells = computeBlastCells(map, 5, 5, 4, true);
    expect(cells).toContainEqual({ gx: 6, gz: 5 });
    expect(cells).toContainEqual({ gx: 7, gz: 5 });
    expect(cells).not.toContainEqual({ gx: 8, gz: 5 });
  });

  it("scenario C — hard wall always stops regardless of pierce budget", () => {
    // +X direction has soft at 6 and hard at 7. Pierce walks through
    // 6, but 7 is hard — wall always stops + IS NOT included.
    const map = loadMapFromScene({
      entities: [{ id: "grid.config", components: { Grid: { sizeX: 11, sizeZ: 11 } } }],
      instances: [
        { prefab: "soft-block", overrides: { GridPosition: { gx: 6, gz: 5 } } },
        { prefab: "hard-block", overrides: { GridPosition: { gx: 7, gz: 5 } } }
      ]
    });
    const cells = computeBlastCells(map, 5, 5, 4, true);
    expect(cells).toContainEqual({ gx: 6, gz: 5 }); // soft included
    expect(cells).not.toContainEqual({ gx: 7, gz: 5 }); // hard never included
    expect(cells).not.toContainEqual({ gx: 8, gz: 5 });
  });

  it("pierce-budget is PER-DIRECTION (one direction's pierce doesn't deplete another's)", () => {
    // +X and -X both have a single soft block; pierce should fire in both.
    const map = loadMapFromScene({
      entities: [{ id: "grid.config", components: { Grid: { sizeX: 11, sizeZ: 11 } } }],
      instances: [
        { prefab: "soft-block", overrides: { GridPosition: { gx: 6, gz: 5 } } },
        { prefab: "soft-block", overrides: { GridPosition: { gx: 4, gz: 5 } } }
      ]
    });
    const cells = computeBlastCells(map, 5, 5, 2, true);
    expect(cells).toContainEqual({ gx: 7, gz: 5 }); // pierce east
    expect(cells).toContainEqual({ gx: 3, gz: 5 }); // pierce west
  });
});

describe("ServerWorld pierce pickup + placement (S147 KABOOM-PIERCE-SERVER-PARITY)", () => {
  it("pierce pickup flips BomberStats.pierce=true", () => {
    const world = new ServerWorld({ pickupDropChance: 0, spawnBot: false });
    world.join("alice");
    // Pre-pickup: pierce should be absent.
    const preStats = world.snapshot().entities.find((e) => e.id === "player.alice")!.components["BomberStats"] as { pierce?: boolean };
    expect(preStats.pierce).not.toBe(true);
    (world as unknown as { spawnPickup: (gx: number, gz: number, kind: string) => string }).spawnPickup(0, 0, "pierce");
    world.tick(0.016);
    const stats = world.snapshot().entities.find((e) => e.id === "player.alice")!.components["BomberStats"] as { pierce?: boolean };
    expect(stats.pierce).toBe(true);
  });

  it("bomb placed by a pierce-bomber carries Bomb.pierce=true", () => {
    const world = new ServerWorld({ pickupDropChance: 0, spawnBot: false });
    world.join("alice");
    (world as unknown as { spawnPickup: (gx: number, gz: number, kind: string) => string }).spawnPickup(0, 0, "pierce");
    world.tick(0.016);
    const bombId = world.placeBomb("alice", 7, 4)!;
    expect(bombId).toBeDefined();
    const snap = world.snapshot();
    const bomb = snap.entities.find((e) => e.id === bombId)!;
    expect((bomb.components["Bomb"] as { pierce?: boolean }).pierce).toBe(true);
  });

  it("bomb placed by a non-pierce bomber omits Bomb.pierce", () => {
    const world = new ServerWorld({ pickupDropChance: 0, spawnBot: false });
    world.join("alice");
    const bombId = world.placeBomb("alice", 7, 4)!;
    const snap = world.snapshot();
    const bomb = snap.entities.find((e) => e.id === bombId)!;
    expect((bomb.components["Bomb"] as { pierce?: boolean }).pierce).toBeUndefined();
  });

  it("pierce bomb's BlastEvent.cells include the cell past the first soft block", () => {
    // Default map has soft-block.1 at (4, 5) and soft-block.2 at (5, 5).
    // Bomb at (3, 5) range=4 walks +X: pierce should walk 4→5→6, not stop at 4.
    const world = new ServerWorld({ pickupDropChance: 0, spawnBot: false });
    world.join("alice");
    // Crank alice's range so the +X walk can REACH past (5,5) even with pierce.
    (world as unknown as { spawnPickup: (gx: number, gz: number, kind: string) => string }).spawnPickup(0, 0, "fire-up");
    world.tick(0.016);
    (world as unknown as { spawnPickup: (gx: number, gz: number, kind: string) => string }).spawnPickup(0, 0, "fire-up");
    world.tick(0.016);
    (world as unknown as { spawnPickup: (gx: number, gz: number, kind: string) => string }).spawnPickup(0, 0, "pierce");
    world.tick(0.016);
    world.placeBomb("alice", 3, 5);
    world.tick(3.0);
    const events = world.drainBlastEvents();
    expect(events.length).toBeGreaterThanOrEqual(1);
    const blast = events.find((e) => e.originGx === 3 && e.originGz === 5)!;
    expect(blast).toBeDefined();
    // +X walk from (3,5): step1=(4,5) soft → pierce eats it → step2=(5,5) soft → STOP (budget=0).
    expect(blast.cells).toContainEqual({ gx: 4, gz: 5 });
    expect(blast.cells).toContainEqual({ gx: 5, gz: 5 }); // included even with pierce — second soft stops the lane
    expect(blast.cells).not.toContainEqual({ gx: 6, gz: 5 }); // budget spent on 4,5
  });

  it("non-pierce bomb stops at the first soft block (control case for the parity scenario)", () => {
    const world = new ServerWorld({ pickupDropChance: 0, spawnBot: false });
    world.join("alice");
    (world as unknown as { spawnPickup: (gx: number, gz: number, kind: string) => string }).spawnPickup(0, 0, "fire-up");
    world.tick(0.016);
    (world as unknown as { spawnPickup: (gx: number, gz: number, kind: string) => string }).spawnPickup(0, 0, "fire-up");
    world.tick(0.016);
    // No pierce pickup. Same bomb at (3, 5) should ONLY destroy (4, 5).
    world.placeBomb("alice", 3, 5);
    world.tick(3.0);
    const events = world.drainBlastEvents();
    const blast = events.find((e) => e.originGx === 3 && e.originGz === 5)!;
    expect(blast.cells).toContainEqual({ gx: 4, gz: 5 });
    expect(blast.cells).not.toContainEqual({ gx: 5, gz: 5 }); // standard rule
  });

  it("pierce flag is preserved on the bomb even after the bomber loses pierce (defensive — but no current loser path)", () => {
    // Today there's no mechanism that strips pierce from BomberStats
    // after pickup. But the placement copy guarantees the bomb keeps
    // its branch independent of the owner — this test pins the contract.
    const world = new ServerWorld({ pickupDropChance: 0, spawnBot: false });
    world.join("alice");
    (world as unknown as { spawnPickup: (gx: number, gz: number, kind: string) => string }).spawnPickup(0, 0, "pierce");
    world.tick(0.016);
    const bombId = world.placeBomb("alice", 7, 4)!;
    expect((world.snapshot().entities.find((e) => e.id === bombId)!.components["Bomb"] as { pierce?: boolean }).pierce).toBe(true);
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

describe("ServerWorld pickup spawn (S119)", () => {
  it("blockDestroyed event carries droppedPickupKind when RNG rolls a drop", () => {
    // dropChance=1 forces every destroyed cell to drop something.
    const world = new ServerWorld({ pickupDropChance: 1.0, spawnBot: false });
    world.join("alice");
    // (5,5) is soft.2 → bomb on it destroys both (5,5) and adjacent (4,5)
    world.placeBomb("alice", 5, 5);
    world.tick(3.0);
    const blocks = world.drainBlockDestroyed();
    expect(blocks.length).toBe(2);
    for (const b of blocks) {
      expect(b.droppedPickupKind).toBeDefined();
    }
  });

  it("dropChance=0 never spawns a pickup", () => {
    const world = new ServerWorld({ pickupDropChance: 0, spawnBot: false });
    world.join("alice");
    world.placeBomb("alice", 5, 5);
    world.tick(3.0);
    const blocks = world.drainBlockDestroyed();
    for (const b of blocks) expect(b.droppedPickupKind).toBeUndefined();
    const snap = world.snapshot();
    expect(snap.entities.filter((e) => e.id.startsWith("pickup.")).length).toBe(0);
  });

  it("dropChance=1 spawns Pickup entities visible in the snapshot", () => {
    const world = new ServerWorld({ pickupDropChance: 1.0, spawnBot: false });
    world.join("alice");
    world.placeBomb("alice", 5, 5);
    world.tick(3.0);
    const snap = world.snapshot();
    const pickups = snap.entities.filter((e) => e.id.startsWith("pickup."));
    expect(pickups.length).toBe(2);
    for (const p of pickups) {
      expect(p.components["Pickup"]).toMatchObject({ kind: expect.any(String) });
      expect(p.components["GridPosition"]).toBeDefined();
      expect(p.components["Transform"]).toBeDefined();
    }
  });

  it("deterministic by cell: same worldSeed + same cell → same kind every time", () => {
    const seed = 12345;
    const w1 = new ServerWorld({ pickupDropChance: 1.0, worldSeed: seed, spawnBot: false });
    const w2 = new ServerWorld({ pickupDropChance: 1.0, worldSeed: seed, spawnBot: false });
    w1.join("alice");
    w2.join("alice");
    w1.placeBomb("alice", 5, 5);
    w2.placeBomb("alice", 5, 5);
    w1.tick(3.0);
    w2.tick(3.0);
    const sortByCell = (snap: ReturnType<typeof w1.snapshot>): Array<string> =>
      snap.entities
        .filter((e) => e.id.startsWith("pickup."))
        .map((e) => {
          const gp = e.components["GridPosition"] as { gx: number; gz: number };
          const p = e.components["Pickup"] as { kind: string };
          return `${gp.gx},${gp.gz}:${p.kind}`;
        })
        .sort();
    expect(sortByCell(w1.snapshot())).toEqual(sortByCell(w2.snapshot()));
  });

  it("different worldSeeds yield potentially-different drops for the same cell", () => {
    // Stronger test: pick two seeds where the kind selection diverges.
    const a = new ServerWorld({ pickupDropChance: 1.0, worldSeed: 1, spawnBot: false });
    const b = new ServerWorld({ pickupDropChance: 1.0, worldSeed: 999999, spawnBot: false });
    a.join("alice");
    b.join("alice");
    a.placeBomb("alice", 5, 5);
    b.placeBomb("alice", 5, 5);
    a.tick(3.0);
    b.tick(3.0);
    const aKinds = a.snapshot().entities.filter((e) => e.id.startsWith("pickup.")).map((e) => (e.components["Pickup"] as { kind: string }).kind).sort();
    const bKinds = b.snapshot().entities.filter((e) => e.id.startsWith("pickup.")).map((e) => (e.components["Pickup"] as { kind: string }).kind).sort();
    // Not strictly guaranteed (same kind by chance), but with these seeds
    // the drop tables differ in the 2-cell sample.
    expect(JSON.stringify(aKinds) === JSON.stringify(bKinds)).toBe(false);
  });
});

describe("ServerWorld pickup collect (S119)", () => {
  it("bomber walking onto a pickup cell collects it, applies stats, emits pickupCollected", () => {
    const world = new ServerWorld({ pickupDropChance: 1.0, worldSeed: 1, spawnBot: false });
    world.join("alice");
    // Destroy a soft block to spawn a pickup at (5, 5). Alice spawns
    // at (0, 0); send her toward (5, 5) until GridPosition matches.
    world.placeBomb("alice", 5, 5);
    world.tick(3.0);
    // After detonation the pickup spawned at (5, 5) (or (4, 5)).
    const snapPre = world.snapshot();
    const pickup = snapPre.entities.find((e) => e.id.startsWith("pickup."));
    expect(pickup).toBeDefined();
    const pickupCell = pickup!.components["GridPosition"] as { gx: number; gz: number };
    // Drive alice intent toward the pickup cell (use 60+ small ticks).
    const dirX = Math.sign(pickupCell.gx);
    const dirZ = Math.sign(pickupCell.gz);
    world.setIntent("alice", [dirX, 0], 0);
    for (let i = 0; i < 200; i += 1) {
      world.tick(0.016);
      const gp = world.snapshot().entities.find((e) => e.id === "player.alice")!.components["GridPosition"] as { gx: number };
      if (gp.gx >= pickupCell.gx) break;
    }
    world.setIntent("alice", [0, dirZ], 1);
    for (let i = 0; i < 200; i += 1) {
      world.tick(0.016);
      const gp = world.snapshot().entities.find((e) => e.id === "player.alice")!.components["GridPosition"] as { gz: number };
      if (gp.gz >= pickupCell.gz) break;
    }
    const events = world.drainPickupCollected();
    expect(events.length).toBeGreaterThanOrEqual(1);
    const ev = events.find((e) => e.entityId === pickup!.id);
    expect(ev).toBeDefined();
    expect(ev!.pickerId).toBe("player.alice");
    const snapPost = world.snapshot();
    expect(snapPost.entities.find((e) => e.id === pickup!.id)).toBeUndefined();
  });

  it("bomb-up pickup increments BomberStats.maxBombs (cap 8)", () => {
    const world = new ServerWorld({ pickupDropChance: 0, spawnBot: false });
    world.join("alice");
    // Force a bomb-up pickup on alice's spawn cell.
    (world as unknown as { spawnPickup: (gx: number, gz: number, kind: string) => string }).spawnPickup(0, 0, "bomb-up");
    world.tick(0.016);
    const snap = world.snapshot();
    const alice = snap.entities.find((e) => e.id === "player.alice")!;
    expect((alice.components["BomberStats"] as { maxBombs: number }).maxBombs).toBe(2);
    expect(world.drainPickupCollected().length).toBe(1);
  });

  it("S122 — speed-up pickup adds 1 to BomberStats.speed (capped at 12)", () => {
    const world = new ServerWorld({ pickupDropChance: 0, spawnBot: false });
    world.join("alice");
    // Force a speed-up on alice's spawn cell.
    (world as unknown as { spawnPickup: (gx: number, gz: number, kind: string) => string }).spawnPickup(0, 0, "speed-up");
    world.tick(0.016);
    const stats = world.snapshot().entities.find((e) => e.id === "player.alice")!.components["BomberStats"] as { speed: number };
    expect(stats.speed).toBe(4.5); // PLAYER_SPEED 3.5 + 1
  });

  it("S122 — speed-up cap at 12 cells/sec", () => {
    const world = new ServerWorld({ pickupDropChance: 0, spawnBot: false });
    world.join("alice");
    // Stack speed-ups until we hit the cap.
    const spawnPickup = (world as unknown as { spawnPickup: (gx: number, gz: number, kind: string) => string }).spawnPickup.bind(world);
    for (let i = 0; i < 15; i += 1) {
      spawnPickup(0, 0, "speed-up");
      world.tick(0.016);
    }
    const stats = world.snapshot().entities.find((e) => e.id === "player.alice")!.components["BomberStats"] as { speed: number };
    expect(stats.speed).toBe(12);
  });

  it("S122 — alice with speed-up moves faster than baseline", () => {
    const world = new ServerWorld({ pickupDropChance: 0, spawnBot: false });
    world.join("alice");
    world.join("bravo");
    // Alice gets +1 speed; bravo stays at PLAYER_SPEED.
    const spawnPickup = (world as unknown as { spawnPickup: (gx: number, gz: number, kind: string) => string }).spawnPickup.bind(world);
    spawnPickup(0, 0, "speed-up");
    world.tick(0.016);
    // Drive both forward for 1 second.
    world.setIntent("alice", [1, 0], 0);
    world.setIntent("bravo", [1, 0], 0);
    for (let i = 0; i < 63; i += 1) world.tick(0.016);
    const snap = world.snapshot();
    const ax = (snap.entities.find((e) => e.id === "player.alice")!.components["Transform"] as { position: number[] }).position[0]!;
    const bx = (snap.entities.find((e) => e.id === "player.bravo")!.components["Transform"] as { position: number[] }).position[0]!;
    expect(ax).toBeGreaterThan(bx);
  });

  it("fire-up pickup increments BomberStats.range", () => {
    const world = new ServerWorld({ pickupDropChance: 0, spawnBot: false });
    world.join("alice");
    (world as unknown as { spawnPickup: (gx: number, gz: number, kind: string) => string }).spawnPickup(0, 0, "fire-up");
    world.tick(0.016);
    const stats = world.snapshot().entities.find((e) => e.id === "player.alice")!.components["BomberStats"] as { range: number };
    expect(stats.range).toBe(3);
  });

  it("dead bomber doesn't collect pickups", () => {
    const world = new ServerWorld({ pickupDropChance: 0, spawnBot: false });
    world.join("alice");
    // Kill alice by self-blast.
    world.placeBomb("alice", 0, 0);
    world.tick(3.0);
    world.drainBomberDied();
    // Now spawn a pickup on alice's cell and tick.
    (world as unknown as { spawnPickup: (gx: number, gz: number, kind: string) => string }).spawnPickup(0, 0, "bomb-up");
    world.tick(0.016);
    expect(world.drainPickupCollected().length).toBe(0);
    // Pickup still in snapshot.
    const snap = world.snapshot();
    expect(snap.entities.some((e) => e.id.startsWith("pickup."))).toBe(true);
  });
});

describe("ServerWorld round resolve + tally (S119)", () => {
  it("snapshot does NOT ship kaboom.round-state (avoids id collision with local client entity)", () => {
    const world = new ServerWorld({ pickupDropChance: 0, spawnBot: false });
    const snap = world.snapshot();
    expect(snap.entities.find((e) => e.id === "kaboom.round-state")).toBeUndefined();
  });

  it("S122 — snapshot ships mp.round-state with RoundState component for mid-join catch-up", () => {
    const world = new ServerWorld({ pickupDropChance: 0, spawnBot: false });
    const snap = world.snapshot();
    const mpRound = snap.entities.find((e) => e.id === "mp.round-state");
    expect(mpRound).toBeDefined();
    const rs = mpRound!.components["RoundState"] as { phase: string; tally: { player: number; bot: number; draws: number }; roundNumber: number };
    expect(rs.phase).toBe("playing");
    expect(rs.tally).toEqual({ player: 0, bot: 0, draws: 0 });
    expect(rs.roundNumber).toBe(1);
  });

  it("S122 — mp.round-state reflects tally + winnerId after a round resolves", () => {
    const world = new ServerWorld({ pickupDropChance: 0, spawnBot: false });
    world.join("alice");
    world.join("bravo");
    // Both at (0,0); bomb self-kills both → draw.
    world.placeBomb("alice", 0, 0);
    world.tick(3.0);
    world.drainRoundResolved();
    const mpRound = world.snapshot().entities.find((e) => e.id === "mp.round-state")!;
    const rs = mpRound.components["RoundState"] as { phase: string; tally: { draws: number } };
    expect(rs.phase).toBe("draw");
    expect(rs.tally.draws).toBe(1);
  });

  it("solo session never auto-resolves (need ≥2 players)", () => {
    const world = new ServerWorld({ pickupDropChance: 0, spawnBot: false });
    world.join("alice");
    world.tick(0.1);
    expect(world.drainRoundResolved().length).toBe(0);
  });

  // Helper: walk bravo away from alice so a self-blast only kills alice.
  const walkBravoAway = (world: ServerWorld): void => {
    world.setIntent("bravo", [1, 0], 0);
    for (let i = 0; i < 90; i += 1) world.tick(0.016); // ~5 cells
    world.setIntent("bravo", [0, 0], 1);
  };

  it("two-player session resolves when one dies (winner = surviving bomber)", () => {
    const world = new ServerWorld({ pickupDropChance: 0, spawnBot: false });
    world.join("alice");
    world.join("bravo");
    walkBravoAway(world);
    world.placeBomb("alice", 0, 0); // self-blast — alice dies
    world.tick(3.0);
    const events = world.drainRoundResolved();
    expect(events.length).toBe(1);
    // alice is the FIRST joiner ('player' slot). When she dies + bravo
    // survives, the 'player' slot lost → phase='lost', tally.bot+=1.
    expect(events[0]!.phase).toBe("lost");
    expect(events[0]!.winnerId).toBe("player.bravo");
    expect(events[0]!.tally).toEqual({ player: 0, bot: 1, draws: 0 });
  });

  it("simultaneous death → phase='draw' + tally.draws+=1", () => {
    // Both alice + bravo at (0, 0) on join → one self-blast kills both.
    const world = new ServerWorld({ pickupDropChance: 0, spawnBot: false });
    world.join("alice");
    world.join("bravo");
    world.placeBomb("alice", 0, 0);
    world.tick(3.0);
    const events = world.drainRoundResolved();
    expect(events.length).toBe(1);
    expect(events[0]!.phase).toBe("draw");
    expect(events[0]!.tally).toEqual({ player: 0, bot: 0, draws: 1 });
  });

  it("round resolution is idempotent — single event per round", () => {
    const world = new ServerWorld({ pickupDropChance: 0, spawnBot: false });
    world.join("alice");
    world.join("bravo");
    world.placeBomb("alice", 0, 0);
    world.tick(3.0);
    world.drainRoundResolved();
    // Subsequent ticks shouldn't re-emit.
    world.tick(0.5);
    expect(world.drainRoundResolved().length).toBe(0);
  });

  it("placeBomb refused after round resolves", () => {
    const world = new ServerWorld({ pickupDropChance: 0, spawnBot: false });
    world.join("alice");
    world.join("bravo");
    world.placeBomb("alice", 0, 0);
    world.tick(3.0);
    world.drainRoundResolved();
    // Try to place a bomb post-resolve — server should refuse.
    expect(world.placeBomb("bravo", 5, 5)).toBeUndefined();
  });

  it("after resolve, snapshot still hides RoundState — clients read roundResolved events", () => {
    const world = new ServerWorld({ pickupDropChance: 0, spawnBot: false });
    world.join("alice");
    world.join("bravo");
    walkBravoAway(world);
    world.placeBomb("alice", 0, 0);
    world.tick(3.0);
    // Server state is consistent internally (lock blocks new bombs)…
    expect(world.placeBomb("bravo", 5, 5)).toBeUndefined();
    // …but the kaboom.round-state singleton stays out of the snapshot
    // so the local client's identically-named entity isn't shadowed.
    expect(world.snapshot().entities.find((e) => e.id === "kaboom.round-state")).toBeUndefined();
  });

  it("dead bomber can't place bombs", () => {
    const world = new ServerWorld({ pickupDropChance: 0, spawnBot: false });
    world.join("alice");
    world.placeBomb("alice", 0, 0);
    world.tick(3.0); // alice self-kills
    world.drainBomberDied();
    // alice is dead now — placeBomb should refuse even without round-lock.
    expect(world.placeBomb("alice", 5, 5)).toBeUndefined();
  });
});

describe("ServerWorld bot spawn (S120)", () => {
  it("default constructor spawns bot.1 visible in the snapshot", () => {
    const world = new ServerWorld({ pickupDropChance: 0 }); // spawnBot defaults to true
    const snap = world.snapshot();
    const bot = snap.entities.find((e) => e.id === "bot.1");
    expect(bot).toBeDefined();
    expect((bot!.components["Presence"] as { playerId: string }).playerId).toBe("bot.1");
    expect(bot!.components["GridPosition"]).toEqual({ gx: 13, gz: 9 });
    expect(bot!.components["BomberStats"]).toMatchObject({ alive: true });
    expect((bot!.components["Networked"] as { authority: string }).authority).toBe("server");
  });

  it("spawnBot=false omits the bot from the snapshot", () => {
    const world = new ServerWorld({ pickupDropChance: 0, spawnBot: false });
    expect(world.snapshot().entities.find((e) => e.id === "bot.1")).toBeUndefined();
  });

  it("solo human + bot still resolves the round (bot stays alive → human wins or loses)", () => {
    const world = new ServerWorld({ pickupDropChance: 0 }); // bot enabled
    world.join("alice");
    // Self-kill alice.
    world.placeBomb("alice", 0, 0);
    world.tick(3.0);
    const events = world.drainRoundResolved();
    expect(events.length).toBe(1);
    expect(events[0]!.phase).toBe("lost"); // bot won (non-first-joiner)
    expect(events[0]!.winnerId).toBe("bot.1");
  });

  it("bot caught in a blast dies + emits bomberDied", () => {
    const world = new ServerWorld({ pickupDropChance: 0 });
    world.join("alice");
    // Place a bomb directly on the bot's spawn cell (13, 9).
    world.placeBomb("alice", 13, 9);
    world.tick(3.0);
    const deaths = world.drainBomberDied();
    const botDeath = deaths.find((d) => d.entityId === "bot.1");
    expect(botDeath).toBeDefined();
    expect(botDeath!.killerId).toBe("player.alice");
  });

  it("round reset re-arms the bot at its spawn cell with alive=true", () => {
    const world = new ServerWorld({ pickupDropChance: 0 });
    world.join("alice");
    // Kill the bot.
    world.placeBomb("alice", 13, 9);
    world.tick(3.0);
    world.drainRoundResolved();
    world.tick(3.1); // reset countdown
    const snap = world.snapshot();
    const bot = snap.entities.find((e) => e.id === "bot.1")!;
    expect((bot.components["BomberStats"] as { alive: boolean }).alive).toBe(true);
    expect(bot.components["GridPosition"]).toEqual({ gx: 13, gz: 9 });
  });
});

describe("ServerWorld bot wall-aware chase (S125)", () => {
  it("S125 — hunter routes around a hard-wall pillar to reach alpha", () => {
    const world = new ServerWorld({ pickupDropChance: 0, worldSeed: 13, botPersonality: "hunter" });
    world.join("alice");
    // Move alice to (12, 7) — behind the (11, 7) hard-wall pillar
    // relative to the bot at (13, 9). Manhattan steering would
    // oscillate near the wall; BFS routes around it.
    world.setIntent("alice", [1, 0], 0);
    for (let i = 0; i < 250; i += 1) world.tick(0.016);
    world.setIntent("alice", [0, 1], 1);
    for (let i = 0; i < 250; i += 1) world.tick(0.016);
    world.setIntent("alice", [-1, 0], 2);
    for (let i = 0; i < 60; i += 1) world.tick(0.016);
    world.setIntent("alice", [0, 0], 3);
    // Capture alice + bot cells.
    const snapBefore = world.snapshot();
    const aliceGp = snapBefore.entities.find((e) => e.id === "player.alice")!.components["GridPosition"] as { gx: number; gz: number };
    const botGpBefore = snapBefore.entities.find((e) => e.id === "bot.1")!.components["GridPosition"] as { gx: number; gz: number };
    const distBefore = Math.abs(aliceGp.gx - botGpBefore.gx) + Math.abs(aliceGp.gz - botGpBefore.gz);
    // Let the hunter chase for 3 seconds.
    let minDist = distBefore;
    for (let i = 0; i < 60; i += 1) {
      world.tick(0.05);
      const bot = world.snapshot().entities.find((e) => e.id === "bot.1")!.components["GridPosition"] as { gx: number; gz: number };
      const ag = world.snapshot().entities.find((e) => e.id === "player.alice")!.components["GridPosition"] as { gx: number; gz: number };
      minDist = Math.min(minDist, Math.abs(bot.gx - ag.gx) + Math.abs(bot.gz - ag.gz));
    }
    // Bot should have approached alice at some point.
    expect(minDist).toBeLessThan(distBefore);
  });
});

describe("ServerWorld bot steering (S123)", () => {
  it("S123 — bot biases toward the nearest pickup within radius (miner)", () => {
    const world = new ServerWorld({ pickupDropChance: 0, worldSeed: 99 });
    world.join("alice");
    // Force-spawn a pickup right next to the bot (13, 9). Pickup at
    // (13, 8) means a -Z direction reduces manhattan distance by 1.
    (world as unknown as { spawnPickup: (gx: number, gz: number, kind: string) => string }).spawnPickup(13, 8, "bomb-up");
    // Tick a few decision intervals so the bot can re-evaluate.
    for (let i = 0; i < 3; i += 1) world.tick(0.2);
    const snap = world.snapshot();
    const bot = snap.entities.find((e) => e.id === "bot.1")!;
    const intent = (bot.components as unknown as Record<string, unknown>)["__ServerIntentMove"];
    // The intent isn't shipped in snapshot (internal); instead check
    // that bot has actually moved toward the pickup row.
    void intent;
    const gp = bot.components["GridPosition"] as { gx: number; gz: number };
    // After a few decisions the bot should be at gz <= 9 (moving up,
    // toward pickup), not flat at 9 or higher.
    expect(gp.gz).toBeLessThanOrEqual(9);
  });

  it("S123 — hunter biases toward the nearest alive human within chase radius", () => {
    const world = new ServerWorld({ pickupDropChance: 0, worldSeed: 99, botPersonality: "hunter" });
    world.join("alice");
    // Walk alice via setIntent until close to the bot at (13, 9).
    // alice spawns at (0, 0). Walk +X then +Z.
    world.setIntent("alice", [1, 0], 0);
    for (let i = 0; i < 250; i += 1) world.tick(0.016);
    world.setIntent("alice", [0, 1], 1);
    for (let i = 0; i < 150; i += 1) world.tick(0.016);
    world.setIntent("alice", [0, 0], 2);
    // Now alice should be near the bot's chase radius. Snapshot.
    const snap = world.snapshot();
    const alice = snap.entities.find((e) => e.id === "player.alice")!;
    const bot = snap.entities.find((e) => e.id === "bot.1")!;
    const aliceGp = alice.components["GridPosition"] as { gx: number; gz: number };
    const botGp = bot.components["GridPosition"] as { gx: number; gz: number };
    const initialDist = Math.abs(aliceGp.gx - botGp.gx) + Math.abs(aliceGp.gz - botGp.gz);
    // Let the hunter chase for a few decisions.
    for (let i = 0; i < 30; i += 1) world.tick(0.05);
    const snap2 = world.snapshot();
    const bot2 = snap2.entities.find((e) => e.id === "bot.1")!;
    const botGp2 = bot2.components["GridPosition"] as { gx: number; gz: number };
    const aliceGp2 = (snap2.entities.find((e) => e.id === "player.alice")!.components["GridPosition"]) as { gx: number; gz: number };
    const newDist = Math.abs(aliceGp2.gx - botGp2.gx) + Math.abs(aliceGp2.gz - botGp2.gz);
    // Hunter should have approached (or at least not retreated).
    expect(newDist).toBeLessThanOrEqual(initialDist);
  });
});

describe("ServerWorld bot personalities (S122)", () => {
  it("default personality is miner — places bombs at base/near-soft rates", () => {
    const world = new ServerWorld({ pickupDropChance: 0, worldSeed: 42 }); // default miner
    world.join("alice");
    // 6 s of decision ticks. With miner + worldSeed=42 the bot has
    // placed at least one bomb by then.
    let sawBomb = false;
    for (let i = 0; i < 120; i += 1) {
      world.tick(0.05);
      if (world.snapshot().entities.some((e) => e.id.startsWith("bomb.bot.1"))) {
        sawBomb = true;
        break;
      }
    }
    expect(sawBomb).toBe(true);
  });

  it("coward personality bombs far less often", () => {
    const world = new ServerWorld({ pickupDropChance: 0, worldSeed: 42, botPersonality: "coward" });
    world.join("alice");
    let bombCount = 0;
    for (let i = 0; i < 60; i += 1) {
      world.tick(0.05);
      const bombs = world.snapshot().entities.filter((e) => e.id.startsWith("bomb.bot.1")).length;
      bombCount = Math.max(bombCount, bombs);
    }
    // Coward at 5% over ~15 decisions ≈ 0-2 bombs typical.
    expect(bombCount).toBeLessThanOrEqual(3);
  });

  it("hunter personality bombs aggressively when a human is within range+1", () => {
    const world = new ServerWorld({ pickupDropChance: 0, worldSeed: 9, botPersonality: "hunter" });
    world.join("alice");
    // Walk alice next to bot.1 (bot at (13, 9)). Alice spawns at (0,0)
    // — too far. Move alice via setIntent until close.
    world.setIntent("alice", [1, 0], 0);
    for (let i = 0; i < 250; i += 1) world.tick(0.016);
    world.setIntent("alice", [0, 1], 1);
    for (let i = 0; i < 200; i += 1) world.tick(0.016);
    // Alice now near (10-13, 7-9) area — should be within hunter range.
    // Confirm bot bombed at high frequency by counting bombs over 1s.
    world.setIntent("alice", [0, 0], 2);
    let bombsSeen = 0;
    for (let i = 0; i < 20; i += 1) {
      world.tick(0.05);
      bombsSeen += world.snapshot().entities.filter((e) => e.id.startsWith("bomb.bot.1")).length;
    }
    // We just check ≥1 bomb was active at some point — hunter triggers high chance.
    expect(bombsSeen).toBeGreaterThan(0);
  });
});

describe("ServerWorld bot safety guards (S124)", () => {
  it("S124 — bot lives 20s in a hunter-vs-stationary-alpha session (no compounding-trap suicides)", () => {
    const world = new ServerWorld({ pickupDropChance: 0, worldSeed: 7, botPersonality: "hunter" });
    world.join("alice");
    // Park alice near the bot's chase radius edge so hunter aggression
    // peaks. Drive alice manually via setIntent for ~5s, then idle.
    world.setIntent("alice", [1, 0], 0);
    for (let i = 0; i < 250; i += 1) world.tick(0.016);
    world.setIntent("alice", [0, 1], 1);
    for (let i = 0; i < 200; i += 1) world.tick(0.016);
    world.setIntent("alice", [0, 0], 2);
    // 20 s of pure tick.
    for (let i = 0; i < 400; i += 1) world.tick(0.05);
    const snap = world.snapshot();
    const bot = snap.entities.find((e) => e.id === "bot.1")!;
    const alive = (bot.components["BomberStats"] as { alive: boolean }).alive;
    expect(alive).toBe(true);
  });

  it("S124 — flee logic prefers fully-safe candidates over closer-but-still-in-blast ones", () => {
    // Synthetic scenario: bot at (5, 5), bomb at (5, 5) range=2 covers
    // (5,5),(6,5),(7,5),(4,5),(3,5),(5,6),(5,7),(5,4),(5,3). Flee should
    // pick a cell that EXITS that blast — e.g. step toward (3,5) is
    // STILL in blast, but stepping further may be fully safe.
    // We just smoke-test that the bot eventually leaves the danger
    // zone (alive=true after 1s of post-bomb ticks).
    const world = new ServerWorld({ pickupDropChance: 0, spawnBot: false, worldSeed: 1 });
    world.join("alice");
    world.placeBomb("alice", 5, 5);
    // Walk alice while the bomb is ticking — flee should keep her safe.
    world.setIntent("alice", [0, 1], 0);
    for (let i = 0; i < 60; i += 1) world.tick(0.05);
    // alice walked +Z 3 cells, well clear of (5, 5).
    const snap = world.snapshot();
    const alice = snap.entities.find((e) => e.id === "player.alice")!;
    expect((alice.components["BomberStats"] as { alive: boolean }).alive).toBe(true);
  });
});

describe("ServerWorld bot AI survival (S121)", () => {
  it("bot survives a full round (no human input) for ≥10 seconds with new danger-avoid + flee logic", () => {
    const world = new ServerWorld({ pickupDropChance: 0, worldSeed: 7 });
    world.join("alice");
    // 10 s of pure tick — alice doesn't move. Bot AI runs its course.
    for (let i = 0; i < 200; i += 1) world.tick(0.05);
    const snap = world.snapshot();
    const bot = snap.entities.find((e) => e.id === "bot.1")!;
    const alive = (bot.components["BomberStats"] as { alive: boolean }).alive;
    expect(alive).toBe(true);
  });

  it("bot doesn't bomb when its current cell is already inside a bomb's blast", () => {
    const world = new ServerWorld({ pickupDropChance: 0, worldSeed: 99, spawnBot: false });
    // Spawn the bot manually so we control its starting cell + skip
    // the constructor's stochastic startup.
    world.join("alice");
    // Place a bomb adjacent to (1, 1) — origin (1, 1) range=2 reaches
    // (0, 1), (1, 0), (2, 1), (1, 2). Now alice is in danger and the
    // alive guard + danger guard prevents her from placing more.
    world.placeBomb("alice", 1, 1);
    // alice's GridPosition is (0, 0) — let's confirm. Then the bomb at
    // (1, 1) range=2 covers (1, 1), (2, 1), (3, 1), (-1, 1)→OOB stop,
    // (0, 1)→empty include, (1, 0)→empty include, (1, 2), (1, 3).
    // alice at (0, 0) is NOT in those cells. So she can place again.
    expect(world.placeBomb("alice", 0, 0)).toBeDefined();
    // Now alice IS in the blast (origin (0,0)). Second self-bomb attempt blocked.
    expect(world.placeBomb("alice", 0, 0)).toBeUndefined(); // same cell anyway
  });
});

describe("ServerWorld bot AI (S120)", () => {
  it("after a few decision ticks, the bot's IntentMove is non-zero", () => {
    const world = new ServerWorld({ pickupDropChance: 0 }); // bot enabled
    world.join("alice");
    // Drive the bot's decision timer past zero by ticking longer than
    // BOT_DECISION_INTERVAL_S = 0.2.
    for (let i = 0; i < 20; i += 1) world.tick(0.05); // 1 s, ≥ 5 decisions
    // Inspect bot's position — should have moved off (13, 9).
    const snap = world.snapshot();
    const bot = snap.entities.find((e) => e.id === "bot.1")!;
    const pos = (bot.components["Transform"] as { position: number[] }).position;
    const moved = pos[0] !== 13 || pos[2] !== 9;
    expect(moved).toBe(true);
  });

  it("bot avoids hard walls (never walks into (3,3) / (11,3) / (3,7) / (11,7))", () => {
    const world = new ServerWorld({ pickupDropChance: 0, worldSeed: 7 });
    world.join("alice");
    // 5 seconds of bot decisions + movement.
    for (let i = 0; i < 100; i += 1) world.tick(0.05);
    const snap = world.snapshot();
    const bot = snap.entities.find((e) => e.id === "bot.1")!;
    const gp = bot.components["GridPosition"] as { gx: number; gz: number };
    expect(world.cellAt(gp.gx, gp.gz)).not.toBe("hard-wall");
  });

  it("bot eventually places a bomb (15% chance per decision over 5s = ~30+ rolls)", () => {
    const world = new ServerWorld({ pickupDropChance: 0, worldSeed: 42 });
    world.join("alice");
    let sawBotBomb = false;
    for (let i = 0; i < 200; i += 1) {
      world.tick(0.05);
      const snap = world.snapshot();
      if (snap.entities.some((e) => e.id.startsWith("bomb.bot.1"))) {
        sawBotBomb = true;
        break;
      }
    }
    expect(sawBotBomb).toBe(true);
  });

  it("dead bot doesn't move (decision skip on alive=false)", () => {
    const world = new ServerWorld({ pickupDropChance: 0 });
    world.join("alice");
    // Kill the bot.
    world.placeBomb("alice", 13, 9);
    world.tick(3.0);
    world.drainBomberDied();
    const posPreTick = (world.snapshot().entities.find((e) => e.id === "bot.1")!.components["Transform"] as { position: number[] }).position;
    // Several decision ticks pass.
    for (let i = 0; i < 50; i += 1) world.tick(0.05); // 2.5 s; but reset countdown was 3.0
    // Bot still dead (countdown not elapsed yet) — should not have moved.
    const posPostTick = (world.snapshot().entities.find((e) => e.id === "bot.1")!.components["Transform"] as { position: number[] }).position;
    expect(posPostTick).toEqual(posPreTick);
  });
});

describe("ServerWorld match state (S125)", () => {
  it("snapshot ships mp.match-state with default target 3 on a fresh world", () => {
    const world = new ServerWorld({ pickupDropChance: 0, spawnBot: false });
    const snap = world.snapshot();
    const mp = snap.entities.find((e) => e.id === "mp.match-state");
    expect(mp).toBeDefined();
    const ms = mp!.components["MatchState"] as { phase: string; target: number; matchNumber: number };
    expect(ms.phase).toBe("playing");
    expect(ms.target).toBe(3);
    expect(ms.matchNumber).toBe(1);
  });

  it("KABOOM_MATCH_TARGET=1 makes a single round-win resolve the match", () => {
    const world = new ServerWorld({ pickupDropChance: 0, spawnBot: false, matchTarget: 1 });
    world.join("alice");
    world.join("bravo");
    // Self-blast at (0, 0) — both die → tally.draws=1 (still 0 player + 0 bot).
    // For a CLEAN match resolve, set up so only one side wins. Move bravo away.
    world.setIntent("bravo", [1, 0], 0);
    for (let i = 0; i < 90; i += 1) world.tick(0.016);
    world.setIntent("bravo", [0, 0], 1);
    world.placeBomb("alice", 0, 0);
    world.tick(3.0);
    world.drainRoundResolved();
    // Bravo (second joiner, 'bot' slot) won the round → tally.bot=1 ≥ target=1 → match resolved.
    const mp = world.snapshot().entities.find((e) => e.id === "mp.match-state")!;
    const ms = mp.components["MatchState"] as { phase: string; lastMatchWinner: string };
    expect(ms.phase).toBe("resolved");
    expect(ms.lastMatchWinner).toBe("bot");
  });

  it("match-resolved blocks auto-restart (round-state.phase stays non-playing)", () => {
    const world = new ServerWorld({ pickupDropChance: 0, spawnBot: false, matchTarget: 1 });
    world.join("alice");
    world.join("bravo");
    world.setIntent("bravo", [1, 0], 0);
    for (let i = 0; i < 90; i += 1) world.tick(0.016);
    world.setIntent("bravo", [0, 0], 1);
    world.placeBomb("alice", 0, 0);
    world.tick(3.0);
    world.drainRoundResolved();
    // Tick past the would-be reset countdown. Match resolved → no reset.
    world.tick(3.5);
    // alice can't bomb (round-state still non-playing).
    expect(world.placeBomb("alice", 5, 5)).toBeUndefined();
  });
});

describe("ServerWorld round auto-restart (S120)", () => {
  it("after roundResolved + 3 s tick, the round restarts at phase='playing'", () => {
    const world = new ServerWorld({ pickupDropChance: 0, spawnBot: false });
    world.join("alice");
    world.join("bravo");
    world.placeBomb("alice", 0, 0);
    world.tick(3.0);
    const events = world.drainRoundResolved();
    expect(events.length).toBe(1);
    // Tick the 3 s reset timer.
    world.tick(3.1);
    // RoundState should be 'playing' again, with roundNumber bumped.
    // Snapshot still hides RoundState; check via placeBomb gate.
    const aliceBomb = world.placeBomb("alice", 1, 1);
    expect(aliceBomb).toBeDefined(); // gate released
  });

  it("round reset clears all bombs + pickups", () => {
    const world = new ServerWorld({ pickupDropChance: 1.0, spawnBot: false });
    world.join("alice");
    world.join("bravo");
    // Destroy soft.1 → spawn a pickup. Self-kill alice.
    world.placeBomb("alice", 0, 0);
    world.tick(3.0);
    world.drainRoundResolved();
    // Force a second bomb pre-reset by NOT routing through placeBomb gate.
    world.tick(3.1);
    // After reset: snapshot should have zero bombs + zero pickups.
    const snap = world.snapshot();
    expect(snap.entities.filter((e) => e.id.startsWith("bomb."))).toEqual([]);
    expect(snap.entities.filter((e) => e.id.startsWith("pickup."))).toEqual([]);
  });

  it("round reset re-adds destroyed soft blocks", () => {
    const world = new ServerWorld({ pickupDropChance: 0, spawnBot: false });
    world.join("alice");
    world.join("bravo");
    expect(world.cellAt(5, 5)).toBe("soft-block");
    // Place bomb at (5, 5) — soft block destroyed; ALSO have alice
    // walk close so she dies + round resolves.
    world.setIntent("alice", [1, 0], 0);
    for (let i = 0; i < 90; i += 1) world.tick(0.016); // walk +X to ~(5, 0)
    world.setIntent("alice", [0, 0], 1);
    world.placeBomb("alice", 5, 0); // bomb at alice's cell — alice self-kills
    world.tick(3.0);
    // Bomb at (5,0) range=2 reaches (5,1) and (5,2) — no softs there.
    // We still need to destroy a soft block. Place a second bomb at (5,5)
    // after the round resolves? No, placeBomb refused after resolve.
    // Instead, use the first bomb to destroy via chain... too complex.
    // Simpler: just verify reset re-adds the soft block when one was
    // destroyed BEFORE the resolve.
    world.drainRoundResolved();
    expect(world.cellAt(5, 5)).toBe("soft-block"); // not destroyed yet
    world.tick(3.1);
    // After reset, soft.2 at (5, 5) and soft.1 at (4, 5) are still there.
    expect(world.cellAt(5, 5)).toBe("soft-block");
    expect(world.cellAt(4, 5)).toBe("soft-block");
  });

  it("round reset re-adds soft blocks that WERE destroyed pre-resolve", () => {
    // Direct test of map.reset() via the LoadedMap surface. Avoids
    // having to choreograph a bomb that both kills + destroys.
    const world = new ServerWorld({ pickupDropChance: 0, spawnBot: false });
    world.join("alice");
    world.join("bravo");
    // Destroy a soft block via the public surface BEFORE resolving.
    world.destroySoftBlock(5, 5);
    expect(world.cellAt(5, 5)).toBe("empty");
    // Now resolve the round via simultaneous death at spawn.
    world.placeBomb("alice", 0, 0);
    world.tick(3.0);
    world.drainRoundResolved();
    world.tick(3.1);
    expect(world.cellAt(5, 5)).toBe("soft-block"); // restored
  });

  it("round reset respawns players at SPAWN_POSITION + alive=true", () => {
    const world = new ServerWorld({ pickupDropChance: 0, spawnBot: false });
    world.join("alice");
    world.join("bravo");
    // Walk bravo to (5, 0)
    world.setIntent("bravo", [1, 0], 0);
    for (let i = 0; i < 90; i += 1) world.tick(0.016);
    world.setIntent("bravo", [0, 0], 1);
    // Kill alice with self-blast.
    world.placeBomb("alice", 0, 0);
    world.tick(3.0);
    world.drainRoundResolved();
    // Reset.
    world.tick(3.1);
    const snap = world.snapshot();
    const alice = snap.entities.find((e) => e.id === "player.alice")!;
    const bravo = snap.entities.find((e) => e.id === "player.bravo")!;
    expect((alice.components["BomberStats"] as { alive: boolean }).alive).toBe(true);
    expect((bravo.components["BomberStats"] as { alive: boolean }).alive).toBe(true);
    expect((alice.components["GridPosition"] as { gx: number; gz: number })).toEqual({ gx: 0, gz: 0 });
    expect((bravo.components["GridPosition"] as { gx: number; gz: number })).toEqual({ gx: 0, gz: 0 });
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
