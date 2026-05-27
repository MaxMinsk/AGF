// S148 KABOOM-POWERUP-HUD — icon library smoke tests. Validates each
// power-up kind produces non-empty SVG geometry + the pickup→icon and
// pickup→tooltip-label maps cover every shippable pickup. The DOM-side
// createPowerupIconSvg is covered indirectly: the inner-markup function
// is its single source of truth (the wrapper just sets viewBox + size).
// Visual review is a playtest concern.

import { describe, expect, it } from "vitest";

import {
  PICKUP_ICON,
  PICKUP_TOOLTIP_LABEL,
  powerupIconSvgInner,
  type PowerupIconKind
} from "../../src/powerup-icons";

const KINDS: ReadonlyArray<PowerupIconKind> = [
  "bomb",
  "fire",
  "speed",
  "kick",
  "remote",
  "shield",
  "pierce",
  "throw-glove"
];

describe("powerupIconSvgInner", () => {
  for (const kind of KINDS) {
    it(`returns non-empty markup for ${kind}`, () => {
      const inner = powerupIconSvgInner(kind);
      expect(inner.length).toBeGreaterThan(20);
    });

    it(`${kind} markup uses the cream fill colour`, () => {
      const inner = powerupIconSvgInner(kind);
      expect(inner).toContain("#f4e9d3");
    });
  }

  it("each kind produces a different silhouette (no copy-paste)", () => {
    const seen = new Set<string>();
    for (const kind of KINDS) {
      seen.add(powerupIconSvgInner(kind));
    }
    expect(seen.size).toBe(KINDS.length);
  });
});

describe("PICKUP_ICON mapping", () => {
  // Every pickup kind the server can ship + the client can spawn must
  // have an icon row, otherwise the tooltip layer renders blank.
  const REQUIRED_PICKUP_KINDS = [
    "bomb-up",
    "fire-up",
    "speed-up",
    "kick",
    "remote-detonate",
    "shield",
    "pierce",
    "throw-glove"
  ];

  for (const kind of REQUIRED_PICKUP_KINDS) {
    it(`pickup kind '${kind}' maps to an icon`, () => {
      expect(PICKUP_ICON[kind]).toBeDefined();
      expect(KINDS).toContain(PICKUP_ICON[kind]!);
    });

    it(`pickup kind '${kind}' has a tooltip label`, () => {
      expect(PICKUP_TOOLTIP_LABEL[kind]).toBeDefined();
      expect(PICKUP_TOOLTIP_LABEL[kind]!.length).toBeGreaterThan(0);
    });
  }
});
