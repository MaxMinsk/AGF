// S097 GAME-DESIGN-PROPOSED-STORY-SCHEMA — validator behaviour.
//
// Runs the AJV validator directly so this test doesn't depend on
// spawning check.mjs; the schema is the same artefact
// scripts/backlog/check.mjs compiles.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import Ajv from "ajv";

const repoRoot = resolve(__dirname, "../..");
const schemaPath = resolve(repoRoot, "schemas/proposed-story.schema.json");

function compile() {
  const schema = JSON.parse(readFileSync(schemaPath, "utf8"));
  const ajv = new Ajv({ allErrors: true, strict: false, strictSchema: false });
  return ajv.compile(schema);
}

const valid = {
  agfFormatVersion: 1,
  id: "GDP-2026-05-20-001",
  title: "Bombs leave a scorch decal for 5s after the blast",
  createdAt: "2026-05-20T12:00:00Z",
  kind: "feature",
  intent: "Players who walked through a recently-bombed cell should see a visible scorch decal lingering for ~5 s as a readability signal.",
  priority: "should",
  epic: "KABOOM-CREW-MVP-2",
  rationale: "Playtest finding: players were re-entering blast zones with no visual signal that 'this cell was just dangerous'.",
  acceptanceHints: [
    "Scorch decal appears at every blast cell on detonation",
    "Decal fades over 5 seconds via easeOutQuad"
  ]
};

describe("proposed-story schema (S097 GAME-DESIGN-PROPOSED-STORY-SCHEMA)", () => {
  it("accepts a canonical valid fixture", () => {
    const validate = compile();
    expect(validate(valid)).toBe(true);
  });

  it("accepts the minimal-required fixture (no optional fields)", () => {
    const validate = compile();
    const data = {
      agfFormatVersion: 1,
      id: "GDP-2026-05-20-002",
      title: "Tiny title",
      createdAt: "2026-05-20T12:00:00Z",
      kind: "balance",
      intent: "A short reason long enough to clear the minLength.",
      priority: "could"
    };
    expect(validate(data)).toBe(true);
  });

  it("rejects an id that doesn't match GDP-YYYY-MM-DD-NNN", () => {
    const validate = compile();
    const data = { ...valid, id: "GDP-2026-5-20-001" };
    expect(validate(data)).toBe(false);
  });

  it("rejects intent shorter than the 20-char minimum", () => {
    const validate = compile();
    const data = { ...valid, intent: "too short" };
    expect(validate(data)).toBe(false);
  });

  it("rejects an unknown kind", () => {
    const validate = compile();
    const data = { ...valid, kind: "wishlist" };
    expect(validate(data)).toBe(false);
  });

  it("rejects an unknown priority", () => {
    const validate = compile();
    const data = { ...valid, priority: "asap" };
    expect(validate(data)).toBe(false);
  });

  it("rejects additionalProperties on the root object", () => {
    const validate = compile();
    const data = { ...valid, randomExtra: "nope" };
    expect(validate(data)).toBe(false);
  });

  it("rejects acceptanceHints with a too-short entry", () => {
    const validate = compile();
    const data = { ...valid, acceptanceHints: ["a"] };
    expect(validate(data)).toBe(false);
  });

  it("rejects a non-numeric agfFormatVersion", () => {
    const validate = compile();
    const data = { ...valid, agfFormatVersion: "1" };
    expect(validate(data)).toBe(false);
  });
});
