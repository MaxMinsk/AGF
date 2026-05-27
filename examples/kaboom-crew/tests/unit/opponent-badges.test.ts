// S150 KABOOM-OPPONENT-BADGES — pure-function tests for the badge
// extractor + accent-colour helper. The HUD widget integration is
// covered indirectly by the existing engine HUD test harness.

import { describe, expect, it } from "vitest";

import {
  badgesForOpponent,
  isOpponent,
  LOCAL_BOMBER_ID,
  opponentAccentColor
} from "../../src/opponent-badges";

describe("badgesForOpponent", () => {
  it("returns empty when alive=false (dead bombers don't render badges)", () => {
    expect(badgesForOpponent({ alive: false, shield: true, pierce: true })).toEqual([]);
  });

  it("returns empty when all discrete states are off", () => {
    expect(badgesForOpponent({ alive: true })).toEqual([]);
    expect(badgesForOpponent({ alive: true, shield: false, pierce: false, canThrow: false, remoteDetonateCharges: 0 })).toEqual([]);
  });

  it("returns shield when shield=true", () => {
    expect(badgesForOpponent({ alive: true, shield: true })).toEqual(["shield"]);
  });

  it("returns pierce when pierce=true", () => {
    expect(badgesForOpponent({ alive: true, pierce: true })).toEqual(["pierce"]);
  });

  it("returns remote when remoteDetonateCharges > 0", () => {
    expect(badgesForOpponent({ alive: true, remoteDetonateCharges: 1 })).toEqual(["remote"]);
    expect(badgesForOpponent({ alive: true, remoteDetonateCharges: 3 })).toEqual(["remote"]);
  });

  it("returns throw-glove when canThrow=true", () => {
    expect(badgesForOpponent({ alive: true, canThrow: true })).toEqual(["throw-glove"]);
  });

  it("order is fixed (shield, pierce, remote, throw-glove) regardless of input order", () => {
    expect(
      badgesForOpponent({
        alive: true,
        canThrow: true,
        remoteDetonateCharges: 2,
        pierce: true,
        shield: true
      })
    ).toEqual(["shield", "pierce", "remote", "throw-glove"]);
  });

  it("never includes numeric stats (no bombs / fire / speed)", () => {
    // The GDP § Layer 3 explicitly excludes numeric counts to preserve
    // the tactical guessing layer.
    const badges = badgesForOpponent({ alive: true, shield: true });
    expect(badges).not.toContain("bomb");
    expect(badges).not.toContain("fire");
    expect(badges).not.toContain("speed");
  });

  it("never includes kick (passive — no visible behaviour pre-use)", () => {
    // GDP §3 Layer 3 acceptance: "Does NOT show: Kick".
    const badges = badgesForOpponent({ alive: true });
    expect(badges).not.toContain("kick");
  });

  it("remote charges = 0 does NOT produce a remote badge", () => {
    expect(badgesForOpponent({ alive: true, remoteDetonateCharges: 0 })).toEqual([]);
  });

  it("alive undefined defaults to 'alive enough to badge' (matches snapshot fallback)", () => {
    // The snapshot omits alive when stats are minimal; we don't want
    // to hide badges for under-described bombers.
    expect(badgesForOpponent({ shield: true })).toEqual(["shield"]);
  });
});

describe("isOpponent", () => {
  it("identifies the local human as not-opponent", () => {
    expect(isOpponent(LOCAL_BOMBER_ID)).toBe(false);
    expect(isOpponent("player.1")).toBe(false);
  });

  it("identifies bots + other players as opponents", () => {
    expect(isOpponent("bot.1")).toBe(true);
    expect(isOpponent("bot.2")).toBe(true);
    expect(isOpponent("bot.3")).toBe(true);
    expect(isOpponent("player.bravo")).toBe(true);
  });
});

describe("opponentAccentColor", () => {
  it("returns the ember head colour for hunter", () => {
    expect(opponentAccentColor("hunter")).toBe("#ff9874");
  });

  it("returns the slate head colour for coward", () => {
    expect(opponentAccentColor("coward")).toBe("#c2cad6");
  });

  it("returns the sand head colour for miner", () => {
    expect(opponentAccentColor("miner")).toBe("#f0d59a");
  });

  it("returns the rose fallback for unknown personality", () => {
    expect(opponentAccentColor(undefined)).toBe("#ffb7c5");
    expect(opponentAccentColor("unknown-personality")).toBe("#ffb7c5");
  });
});
