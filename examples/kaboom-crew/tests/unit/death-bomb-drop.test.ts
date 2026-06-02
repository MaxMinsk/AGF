// S226 KABOOM-DEATH-BOMB-DROP (GDP-2026-06-02-001). Pure helper +
// system integration tests for the auto-bomb-on-death mechanic.

import { describe, expect, it } from "vitest";

import { World } from "../../../../engine/core/ecs/world";

import {
  DEATH_BOMB_RANGE_DEFAULT,
  createKaboomDeathBombDropSystem,
  pickDeathBombCell
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
    if (id.startsWith("death-bomb.")) n += 1;
  }
  return n;
}

function deathBombCells(world: World): Array<{ gx: number; gz: number }> {
  const out: Array<{ gx: number; gz: number }> = [];
  for (const id of world.entityIds()) {
    if (!id.startsWith("death-bomb.")) continue;
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
    const sys = createKaboomDeathBombDropSystem({ occupancy: emptyOccupancy() });
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
    const sys = createKaboomDeathBombDropSystem({ occupancy: emptyOccupancy(), disabled: true });
    sys.fixedUpdate!(ctx(world));
    killBomber(world, "player.1");
    sys.fixedUpdate!(ctx(world));
    expect(countDeathBombs(world)).toBe(0);
  });

  it("system: kill credit — death bomb's ownerId = the dead bomber", () => {
    const world = new World();
    setupBomber(world, "player.1", 5, 5);
    const sys = createKaboomDeathBombDropSystem({ occupancy: emptyOccupancy() });
    sys.fixedUpdate!(ctx(world));
    killBomber(world, "player.1");
    sys.fixedUpdate!(ctx(world));
    for (const id of world.entityIds()) {
      if (!id.startsWith("death-bomb.")) continue;
      const b = world.getComponent<{ ownerId?: string; range?: number; fuseRemaining?: number }>(id, "Bomb");
      expect(b?.ownerId).toBe("player.1");
      expect(b?.range).toBe(DEATH_BOMB_RANGE_DEFAULT);
      expect(b?.fuseRemaining).toBeGreaterThan(0);
    }
  });

  it("system: re-triggering same alive=false doesn't double-spawn", () => {
    const world = new World();
    setupBomber(world, "player.1", 5, 5);
    const sys = createKaboomDeathBombDropSystem({ occupancy: emptyOccupancy() });
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
    const sys = createKaboomDeathBombDropSystem({ occupancy });
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
    const sys = createKaboomDeathBombDropSystem({ occupancy });
    sys.fixedUpdate!(ctx(world));
    killBomber(world, "player.1");
    sys.fixedUpdate!(ctx(world));
    // Only (5, 4) remains free among cardinals.
    expect(countDeathBombs(world)).toBe(1);
    expect(deathBombCells(world)[0]).toEqual({ gx: 5, gz: 4 });
  });
});
