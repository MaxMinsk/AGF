// S226 KABOOM-DEATH-BOMB-DROP (GDP-2026-06-02-001). Pure helper +
// system integration tests for the auto-bomb-on-death mechanic.

import { describe, expect, it } from "vitest";

import { World } from "../../../../engine/core/ecs/world";

import {
  DEATH_BOMB_RANGE_DEFAULT,
  createKaboomDeathBombDropSystem,
  pickDeathBombCell,
  readRagdollLandingCell
} from "../../src/systems/death-bomb-drop-system";

function ctx(world: World, dt = 1 / 60) {
  return {
    world,
    time: { elapsed: 0, dt, fixedDt: dt, frameCount: 0, fixedStepCount: 0 }
  };
}

/** Always-empty occupancy stub. */
function emptyOccupancy(): Parameters<typeof createKaboomDeathBombDropSystem>[0]["occupancy"] {
  return {
    blocked: () => false,
    occupants: () => [] as string[],
    occupiedCells: () => [] as Array<{ gx: number; gz: number }>
  } as unknown as Parameters<typeof createKaboomDeathBombDropSystem>[0]["occupancy"];
}

/** Occupancy with the given cells movement-blocked + the given
 *  cells containing a 'bomb' occupant. */
function occupancyFromSets(
  blocked: Array<{ gx: number; gz: number }>,
  bombs: Array<{ gx: number; gz: number; id: string }>
): Parameters<typeof createKaboomDeathBombDropSystem>[0]["occupancy"] {
  const blockedKey = new Set(blocked.map((c) => `${c.gx},${c.gz}`));
  const bombsByCell = new Map<string, string[]>();
  for (const b of bombs) {
    const key = `${b.gx},${b.gz}`;
    if (!bombsByCell.has(key)) bombsByCell.set(key, []);
    bombsByCell.get(key)!.push(b.id);
  }
  return {
    blocked: (gx: number, gz: number, layer: "movement" | "blast"): boolean => {
      if (layer === "movement") return blockedKey.has(`${gx},${gz}`);
      return false;
    },
    occupants: (gx: number, gz: number, layer?: string): string[] => {
      if (layer === "bomb") return bombsByCell.get(`${gx},${gz}`) ?? [];
      return [];
    },
    occupiedCells: () => [] as Array<{ gx: number; gz: number }>
  } as unknown as Parameters<typeof createKaboomDeathBombDropSystem>[0]["occupancy"];
}

function setupBomber(world: World, id: string, gx: number, gz: number): void {
  world.addEntity(id);
  world.setComponent(id, "BomberStats", { maxBombs: 1, range: 2, alive: true });
  world.setComponent(id, "GridPosition", { gx, gz });
}

function killBomber(world: World, id: string): void {
  const s = world.getComponent<Record<string, unknown>>(id, "BomberStats") ?? {};
  world.setComponent(id, "BomberStats", { ...s, alive: false });
}

function countDeathBombs(world: World): number {
  let n = 0;
  for (const id of world.entityIds()) {
    // S228 — co-spawn telegraph emitters share the `death-bomb.`
    // prefix (`death-bomb.<owner>.<n>.puff`). Filter on the Bomb
    // component so only the actual bomb counts.
    if (id.startsWith("death-bomb.") && world.hasComponent(id, "Bomb")) n += 1;
  }
  return n;
}

function deathBombCells(world: World): Array<{ gx: number; gz: number }> {
  const out: Array<{ gx: number; gz: number }> = [];
  for (const id of world.entityIds()) {
    if (!id.startsWith("death-bomb.")) continue;
    if (!world.hasComponent(id, "Bomb")) continue; // skip the puff emitter
    const gp = world.getComponent<{ gx?: number; gz?: number }>(id, "GridPosition");
    if (gp?.gx !== undefined && gp.gz !== undefined) out.push({ gx: gp.gx, gz: gp.gz });
  }
  return out;
}

const ALWAYS_AVAILABLE = () => true;

describe("kaboom death-bomb drop (S226)", () => {
  it("pickDeathBombCell: all 4 cardinals available + rng 0 → picks first (east)", () => {
    const cell = pickDeathBombCell({ gx: 5, gz: 5 }, ALWAYS_AVAILABLE, { next: () => 0 });
    expect(cell).toEqual({ gx: 6, gz: 5 });
  });

  it("pickDeathBombCell: all 4 cardinals available + rng 0.9 → picks fourth (south)", () => {
    const cell = pickDeathBombCell({ gx: 5, gz: 5 }, ALWAYS_AVAILABLE, { next: () => 0.9 });
    expect(cell).toEqual({ gx: 5, gz: 4 });
  });

  it("pickDeathBombCell: 3 cardinals blocked + east free → returns east regardless of rng", () => {
    const east = { gx: 6, gz: 5 };
    const ok = (cell: { gx: number; gz: number }) => cell.gx === east.gx && cell.gz === east.gz;
    expect(pickDeathBombCell({ gx: 5, gz: 5 }, ok, { next: () => 0.5 })).toEqual(east);
  });

  it("pickDeathBombCell: all 4 cardinals blocked → undefined (silent skip — death cell NEVER used as fallback)", () => {
    const deathCell = { gx: 5, gz: 5 };
    // isAvailable returns true ONLY for the death cell itself. The
    // helper must still return undefined because cardinals are the
    // only valid spawn cells per spec.
    const onlyDeathOk = (cell: { gx: number; gz: number }) => cell.gx === deathCell.gx && cell.gz === deathCell.gz;
    expect(pickDeathBombCell(deathCell, onlyDeathOk, { next: () => 0.5 })).toBeUndefined();
  });

  it("pickDeathBombCell: every cell blocked → undefined (silent skip)", () => {
    const cell = pickDeathBombCell({ gx: 5, gz: 5 }, () => false, { next: () => 0.5 });
    expect(cell).toBeUndefined();
  });

  it("system: bomber dies on open cell → exactly one death-bomb spawns adjacent", () => {
    const world = new World();
    setupBomber(world, "player.1", 5, 5);
    const sys = createKaboomDeathBombDropSystem({ occupancy: emptyOccupancy(), deferS: 0 });
    sys.fixedUpdate!(ctx(world));
    expect(countDeathBombs(world)).toBe(0);
    killBomber(world, "player.1");
    sys.fixedUpdate!(ctx(world));
    expect(countDeathBombs(world)).toBe(1);
    const [cell] = deathBombCells(world);
    expect(cell).toBeDefined();
    const dx = Math.abs(cell!.gx - 5);
    const dz = Math.abs(cell!.gz - 5);
    expect(dx + dz).toBe(1); // a cardinal adjacent
  });

  it("system: ?deathBomb=off equivalent (disabled:true) → no bomb on death", () => {
    const world = new World();
    setupBomber(world, "player.1", 5, 5);
    const sys = createKaboomDeathBombDropSystem({ occupancy: emptyOccupancy(), disabled: true, deferS: 0 });
    sys.fixedUpdate!(ctx(world));
    killBomber(world, "player.1");
    sys.fixedUpdate!(ctx(world));
    expect(countDeathBombs(world)).toBe(0);
  });

  it("system: kill credit — death bomb's ownerId = the dead bomber", () => {
    const world = new World();
    setupBomber(world, "player.1", 5, 5);
    const sys = createKaboomDeathBombDropSystem({ occupancy: emptyOccupancy(), deferS: 0 });
    sys.fixedUpdate!(ctx(world));
    killBomber(world, "player.1");
    sys.fixedUpdate!(ctx(world));
    for (const id of world.entityIds()) {
      if (!id.startsWith("death-bomb.")) continue;
      // Skip the S228 telegraph puff — it shares the prefix but has
      // no Bomb component.
      if (!world.hasComponent(id, "Bomb")) continue;
      const b = world.getComponent<{ ownerId?: string; range?: number; fuseRemaining?: number }>(id, "Bomb");
      expect(b?.ownerId).toBe("player.1");
      expect(b?.range).toBe(DEATH_BOMB_RANGE_DEFAULT);
      expect(b?.fuseRemaining).toBeGreaterThan(0);
    }
  });

  it("system: re-triggering same alive=false doesn't double-spawn", () => {
    const world = new World();
    setupBomber(world, "player.1", 5, 5);
    const sys = createKaboomDeathBombDropSystem({ occupancy: emptyOccupancy(), deferS: 0 });
    sys.fixedUpdate!(ctx(world));
    killBomber(world, "player.1");
    sys.fixedUpdate!(ctx(world));
    const after = countDeathBombs(world);
    sys.fixedUpdate!(ctx(world));
    sys.fixedUpdate!(ctx(world));
    expect(countDeathBombs(world)).toBe(after);
  });

  it("system: bomber surrounded by hard blocks → silent skip (no spawn on death cell)", () => {
    const world = new World();
    setupBomber(world, "player.1", 5, 5);
    const occupancy = occupancyFromSets(
      [
        { gx: 6, gz: 5 },
        { gx: 4, gz: 5 },
        { gx: 5, gz: 6 },
        { gx: 5, gz: 4 }
      ],
      []
    );
    const sys = createKaboomDeathBombDropSystem({ occupancy, deferS: 0 });
    sys.fixedUpdate!(ctx(world));
    killBomber(world, "player.1");
    sys.fixedUpdate!(ctx(world));
    expect(countDeathBombs(world)).toBe(0);
  });

  it("system: bombs-at-cardinal block placement (avoid double-bomb-stacking)", () => {
    const world = new World();
    setupBomber(world, "player.1", 5, 5);
    const occupancy = occupancyFromSets(
      [],
      [
        { gx: 6, gz: 5, id: "n.bomb" },
        { gx: 4, gz: 5, id: "s.bomb" },
        { gx: 5, gz: 6, id: "e.bomb" }
      ]
    );
    const sys = createKaboomDeathBombDropSystem({ occupancy, deferS: 0 });
    sys.fixedUpdate!(ctx(world));
    killBomber(world, "player.1");
    sys.fixedUpdate!(ctx(world));
    // Only (5, 4) remains free among cardinals.
    expect(countDeathBombs(world)).toBe(1);
    expect(deathBombCells(world)[0]).toEqual({ gx: 5, gz: 4 });
  });

  it("system: defer — bomb does NOT spawn on the same tick the bomber dies", () => {
    const world = new World();
    setupBomber(world, "player.1", 5, 5);
    // 0.6 s defer (default). Tick once to seed prevAlive.
    const sys = createKaboomDeathBombDropSystem({ occupancy: emptyOccupancy() });
    sys.fixedUpdate!(ctx(world));
    killBomber(world, "player.1");
    // The kill is detected here, but the spawn must wait for the
    // ragdoll-landing defer.
    sys.fixedUpdate!(ctx(world));
    expect(countDeathBombs(world)).toBe(0);
  });

  it("system: spawn fires after enough ticks elapse (defer ≈ 0.6 s)", () => {
    const world = new World();
    setupBomber(world, "player.1", 5, 5);
    const sys = createKaboomDeathBombDropSystem({ occupancy: emptyOccupancy() });
    sys.fixedUpdate!(ctx(world));
    killBomber(world, "player.1");
    // 0.6 s at 1/60 dt ≈ 36 ticks. Loop 40 ticks to be safe.
    for (let i = 0; i < 40; i += 1) sys.fixedUpdate!(ctx(world));
    expect(countDeathBombs(world)).toBe(1);
  });

  it("system: arena-bounds gate — bomber dies in corner cell + cardinals out of bounds → silent skip", () => {
    const world = new World();
    setupBomber(world, "player.1", 0, 0);
    // Cardinals of (0,0): (1,0), (-1,0), (0,1), (0,-1). Two are out
    // of bounds on a 1×1 arena.
    const sys = createKaboomDeathBombDropSystem({
      occupancy: emptyOccupancy(),
      deferS: 0,
      arenaSize: { width: 1, depth: 1 }
    });
    sys.fixedUpdate!(ctx(world));
    killBomber(world, "player.1");
    sys.fixedUpdate!(ctx(world));
    expect(countDeathBombs(world)).toBe(0);
  });

  it("system: arena-bounds gate — bomber dies inside 3×3 arena → only in-bounds cardinals are eligible", () => {
    const world = new World();
    setupBomber(world, "player.1", 0, 0);
    // (0,0) corner of a 3×3 grid → only (1,0) and (0,1) are in bounds.
    const sys = createKaboomDeathBombDropSystem({
      occupancy: emptyOccupancy(),
      deferS: 0,
      arenaSize: { width: 3, depth: 3 }
    });
    sys.fixedUpdate!(ctx(world));
    killBomber(world, "player.1");
    sys.fixedUpdate!(ctx(world));
    expect(countDeathBombs(world)).toBe(1);
    const [cell] = deathBombCells(world);
    expect(cell).toBeDefined();
    expect(cell!.gx >= 0 && cell!.gx < 3 && cell!.gz >= 0 && cell!.gz < 3).toBe(true);
  });

  it("readRagdollLandingCell: returns torso Transform.position rounded to grid", () => {
    const world = new World();
    world.addEntity("player.1.torso");
    world.setComponent("player.1.torso", "Transform", {
      position: [7.3, 0.2, 4.6],
      rotation: [0, 0, 0],
      scale: [1, 1, 1]
    });
    const cell = readRagdollLandingCell(world, "player.1");
    expect(cell).toEqual({ gx: 7, gz: 5 });
  });

  it("readRagdollLandingCell: torso entity absent → undefined", () => {
    const world = new World();
    expect(readRagdollLandingCell(world, "player.1")).toBeUndefined();
  });

  it("S228 telegraph: bomb spawn co-creates a short-lived ParticleEmitter", () => {
    const world = new World();
    setupBomber(world, "player.1", 5, 5);
    const sys = createKaboomDeathBombDropSystem({ occupancy: emptyOccupancy(), deferS: 0 });
    sys.fixedUpdate!(ctx(world));
    killBomber(world, "player.1");
    sys.fixedUpdate!(ctx(world));
    let puffId: string | undefined;
    for (const id of world.entityIds()) {
      if (id.startsWith("death-bomb.") && id.endsWith(".puff")) puffId = id;
    }
    expect(puffId).toBeDefined();
    const emitter = world.getComponent<{ preset?: string; lifetime?: number }>(puffId!, "ParticleEmitter");
    expect(emitter?.preset).toBe("spark");
    expect(emitter?.lifetime).toBeGreaterThan(0);
  });
});
