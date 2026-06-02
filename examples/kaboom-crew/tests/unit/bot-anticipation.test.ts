// S225 KABOOM-BOT-ANTICIPATION (GDP-2026-05-29-010 Layer 1). Pure
// helper tests for `predictNextCell` — given a recent-positions
// ring, predict the projected next cell iff the last 3 entries
// form a straight cardinal line. The system-level closure track
// is exercised live by demo-30s + bot-vs-bot integration.

import { describe, expect, it } from "vitest";

import { predictNextCell } from "../../src/systems/bot-ai-system";

describe("kaboom bot player anticipation (S225)", () => {
  it("three cells in a straight east line → predicts next east cell", () => {
    const recent = [
      { gx: 3, gz: 5 },
      { gx: 4, gz: 5 },
      { gx: 5, gz: 5 }
    ];
    expect(predictNextCell(recent)).toEqual({ gx: 6, gz: 5 });
  });

  it("three cells in a straight north line → predicts next north cell", () => {
    const recent = [
      { gx: 5, gz: 8 },
      { gx: 5, gz: 7 },
      { gx: 5, gz: 6 }
    ];
    expect(predictNextCell(recent)).toEqual({ gx: 5, gz: 5 });
  });

  it("only 2 cells in the ring → undefined (need at least 3)", () => {
    expect(predictNextCell([{ gx: 3, gz: 5 }, { gx: 4, gz: 5 }])).toBeUndefined();
  });

  it("zigzag (east → north → east) → undefined (no straight-line confidence)", () => {
    const recent = [
      { gx: 3, gz: 5 },
      { gx: 4, gz: 5 },
      { gx: 4, gz: 4 }
    ];
    expect(predictNextCell(recent)).toBeUndefined();
  });

  it("stationary (3 identical cells) → undefined (zero-step trajectory)", () => {
    const recent = [
      { gx: 5, gz: 5 },
      { gx: 5, gz: 5 },
      { gx: 5, gz: 5 }
    ];
    expect(predictNextCell(recent)).toBeUndefined();
  });

  it("diagonal motion (dx=1, dz=1) — not a cardinal step → undefined", () => {
    const recent = [
      { gx: 3, gz: 3 },
      { gx: 4, gz: 4 },
      { gx: 5, gz: 5 }
    ];
    expect(predictNextCell(recent)).toBeUndefined();
  });

  it("ring of 5 — uses the last 3 to predict (ignores earlier history)", () => {
    const recent = [
      { gx: 0, gz: 0 },
      { gx: 1, gz: 0 },
      { gx: 5, gz: 5 },
      { gx: 6, gz: 5 },
      { gx: 7, gz: 5 }
    ];
    expect(predictNextCell(recent)).toEqual({ gx: 8, gz: 5 });
  });
});
