import { describe, expect, it } from "vitest";
import Ajv, { type ValidateFunction } from "ajv";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const schema = JSON.parse(
  readFileSync(resolve(repositoryRoot, "schemas/protocol.schema.json"), "utf8")
);

const ajv = new Ajv({ allErrors: true, strict: false });
const validate: ValidateFunction = ajv.compile(schema);

function expectValid(message: unknown): void {
  const ok = validate(message);
  if (!ok) {
    throw new Error(`Expected valid message, got errors: ${ajv.errorsText(validate.errors)}`);
  }
  expect(ok).toBe(true);
}

function expectInvalid(message: unknown): void {
  expect(validate(message)).toBe(false);
}

describe("protocol schema v0", () => {
  it("accepts a world.snapshot with sorted entities", () => {
    expectValid({
      kind: "world.snapshot",
      sequence: 0,
      payload: {
        elapsed: 1.25,
        entities: [
          { id: "player.alpha", components: { Transform: { position: [0, 0, 0] } } },
          { id: "player.bravo", components: { Transform: { position: [1, 0, 1] } } }
        ]
      }
    });
  });

  it("accepts a player.join with display name", () => {
    expectValid({
      kind: "player.join",
      payload: { playerId: "alpha", displayName: "Alpha Drone" }
    });
  });

  it("accepts a player.leave with timeout reason", () => {
    expectValid({
      kind: "player.leave",
      payload: { playerId: "alpha", reason: "timeout" }
    });
  });

  it("accepts an intent.move with a normalised direction", () => {
    expectValid({
      kind: "intent.move",
      sequence: 42,
      payload: { playerId: "alpha", direction: [0.7071, 0.7071] }
    });
  });

  it("rejects an unknown kind", () => {
    expectInvalid({ kind: "world.explode", payload: {} });
  });

  it("rejects player.join without a playerId", () => {
    expectInvalid({ kind: "player.join", payload: { displayName: "Anon" } });
  });

  it("rejects intent.move with a 3D direction", () => {
    expectInvalid({
      kind: "intent.move",
      payload: { playerId: "alpha", direction: [1, 0, 0] }
    });
  });

  it("rejects player.leave with an unknown reason", () => {
    expectInvalid({
      kind: "player.leave",
      payload: { playerId: "alpha", reason: "boredom" }
    });
  });

  it("rejects unknown top-level properties", () => {
    expectInvalid({
      kind: "player.join",
      payload: { playerId: "alpha" },
      timestamp: 1
    });
  });

  it("rejects a player id that does not match the pattern", () => {
    expectInvalid({ kind: "player.join", payload: { playerId: "ALPHA" } });
  });
});

// S116 KABOOM-MP-PROTOCOL-EXTENSIONS — 9 new message kinds for the
// upcoming Sprint B (server-authoritative Kaboom Crew).
describe("protocol schema — Sprint B extensions (S116)", () => {
  it("accepts placeBombRequest", () => {
    expectValid({
      kind: "placeBombRequest",
      sequence: 1,
      payload: { entityId: "player.alpha", gx: 4, gz: 7 }
    });
  });

  it("accepts detonateRemoteRequest", () => {
    expectValid({
      kind: "detonateRemoteRequest",
      payload: { entityId: "player.alpha" }
    });
  });

  it("accepts inputIntent with bounded dx/dz + monotonic tick", () => {
    expectValid({
      kind: "inputIntent",
      sequence: 42,
      payload: { entityId: "player.alpha", dx: 1, dz: 0, tick: 100 }
    });
    expectInvalid({
      kind: "inputIntent",
      payload: { entityId: "player.alpha", dx: 2, dz: 0, tick: 100 }
    });
  });

  it("accepts blastEvent with cells array", () => {
    expectValid({
      kind: "blastEvent",
      payload: {
        originGx: 5,
        originGz: 5,
        range: 2,
        ownerId: "bomb.1",
        cells: [
          { gx: 5, gz: 5 },
          { gx: 6, gz: 5 },
          { gx: 7, gz: 5 },
          { gx: 4, gz: 5 },
          { gx: 5, gz: 6 }
        ]
      }
    });
  });

  it("accepts pickupCollected with all valid kinds", () => {
    for (const kind of ["bomb-up", "fire-up", "speed-up", "kick", "remote-detonate", "shield"] as const) {
      expectValid({
        kind: "pickupCollected",
        payload: { entityId: "pickup.1", kind, gx: 3, gz: 4, pickerId: "player.alpha" }
      });
    }
    expectInvalid({
      kind: "pickupCollected",
      payload: { entityId: "pickup.1", kind: "monocle", gx: 3, gz: 4, pickerId: "player.alpha" }
    });
  });

  it("accepts bomberDied with optional killerId", () => {
    expectValid({
      kind: "bomberDied",
      payload: { entityId: "bot.1", blastOriginGx: 4, blastOriginGz: 4 }
    });
    expectValid({
      kind: "bomberDied",
      payload: { entityId: "bot.1", blastOriginGx: 4, blastOriginGz: 4, killerId: "player.alpha" }
    });
  });

  it("accepts shieldConsumed", () => {
    expectValid({
      kind: "shieldConsumed",
      payload: { entityId: "player.alpha", blastOriginGx: 4, blastOriginGz: 4 }
    });
  });

  it("accepts roundResolved with tally + nextRoundAt", () => {
    expectValid({
      kind: "roundResolved",
      payload: {
        phase: "won",
        winnerId: "player.alpha",
        tally: { player: 2, bot: 1, draws: 0 },
        nextRoundAt: 3
      }
    });
    expectInvalid({
      kind: "roundResolved",
      payload: {
        phase: "lol",
        tally: { player: 0, bot: 0, draws: 0 }
      }
    });
  });

  it("accepts blockDestroyed with optional droppedPickupKind", () => {
    expectValid({
      kind: "blockDestroyed",
      payload: { gx: 3, gz: 4 }
    });
    expectValid({
      kind: "blockDestroyed",
      payload: { gx: 3, gz: 4, droppedPickupKind: "fire-up" }
    });
  });

  it("rejects unknown top-level kind on the new shape (additionalProperties:false on each variant)", () => {
    expectInvalid({
      kind: "placeBombRequest",
      payload: { entityId: "player.alpha", gx: 4, gz: 7 },
      extra: 1
    });
  });
});
