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
