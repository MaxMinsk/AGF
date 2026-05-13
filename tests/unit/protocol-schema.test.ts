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
