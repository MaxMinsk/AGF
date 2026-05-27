// S161 KABOOM-HUD-TOOLTIPS — registry tests.

import { describe, expect, it } from "vitest";

import type { PowerupIconKind } from "../../src/powerup-icons";
import {
  __TOOLTIP_REGISTRY,
  tooltipFor,
  tooltipForOpponentBadge,
  tooltipToPlainText,
  type PowerUpSlotState
} from "../../src/hud/power-up-descriptions";

const ALL_KINDS: ReadonlyArray<PowerupIconKind> = [
  "bomb",
  "fire",
  "speed",
  "kick",
  "remote",
  "shield",
  "pierce",
  "throw-glove",
  "bomb-pass",
  "dash"
];

describe("tooltipFor (S161)", () => {
  it("every shipped PowerupIconKind has a name + description", () => {
    for (const k of ALL_KINDS) {
      const t = tooltipFor(k);
      expect(t.name).toBeTruthy();
      expect(t.description).toBeTruthy();
    }
  });

  it("counter slot renders 'current / max'", () => {
    const t = tooltipFor("bomb", { kind: "counter", current: 3, max: 6 });
    expect(t.state).toBe("3 / 6");
  });

  it("level slot at 0 renders baseline string", () => {
    const t = tooltipFor("speed", { kind: "level", level: 0, baseline: "baseline" });
    expect(t.state).toBe("baseline");
  });

  it("level slot > 0 renders '+N'", () => {
    const t = tooltipFor("speed", { kind: "level", level: 2, baseline: "baseline" });
    expect(t.state).toBe("+2");
  });

  it("flag active renders 'ACTIVE'", () => {
    const t = tooltipFor("kick", { kind: "flag", active: true });
    expect(t.state).toBe("ACTIVE");
  });

  it("flag inactive renders LOCKED hint", () => {
    const t = tooltipFor("kick", { kind: "flag", active: false });
    expect(t.state).toMatch(/^LOCKED/);
    expect(t.state).toContain("Kick");
  });

  it("cooldown ready renders ready label", () => {
    const t = tooltipFor("dash", { kind: "cooldown", readyLabel: "READY", cooldownMs: 0 });
    expect(t.state).toBe("READY");
  });

  it("cooldown remaining renders 'COOLDOWN N.Ns'", () => {
    const t = tooltipFor("dash", { kind: "cooldown", readyLabel: "READY", cooldownMs: 1500 });
    expect(t.state).toBe("COOLDOWN 1.5s");
  });

  it("no slot → no state line", () => {
    const t = tooltipFor("shield");
    expect(t.state).toBeUndefined();
  });
});

describe("tooltipForOpponentBadge (S161)", () => {
  it("uses opponent label as name", () => {
    const t = tooltipForOpponentBadge("shield", "bot.1");
    expect(t.name).toBe("bot.1");
    expect(t.state).toContain("Shield active");
  });

  it("shield badge has its specific description", () => {
    const t = tooltipForOpponentBadge("shield", "bot.1");
    expect(t.description).toContain("Shield");
    expect(t.description).toContain("blast");
  });

  it("falls back to a generic line for badges without a custom string", () => {
    const t = tooltipForOpponentBadge("kick", "bot.2");
    expect(t.description).toContain("Kick");
  });
});

describe("tooltipToPlainText (S161)", () => {
  it("single line when no state", () => {
    const txt = tooltipToPlainText({ name: "Shield", description: "desc" });
    expect(txt).toBe("Shield — desc");
  });

  it("two lines when state present", () => {
    const txt = tooltipToPlainText({ name: "Shield", description: "desc", state: "ACTIVE" });
    expect(txt).toBe("Shield — desc\nACTIVE");
  });
});

describe("registry coverage (S161)", () => {
  it("every flag-style icon has a LOCKED hint specifying the pickup name", () => {
    for (const k of ["kick", "remote", "shield", "pierce", "throw-glove", "bomb-pass"] as PowerupIconKind[]) {
      expect(__TOOLTIP_REGISTRY.LOCKED_HINT_BY_KIND[k]).toBeTruthy();
    }
  });

  it("every name maps to a non-empty string", () => {
    for (const k of ALL_KINDS) {
      expect(__TOOLTIP_REGISTRY.NAME_BY_KIND[k]).toBeTruthy();
    }
  });
});
