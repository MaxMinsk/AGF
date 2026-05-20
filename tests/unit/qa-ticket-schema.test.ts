// S093 QA-INTAKE-SCHEMA — validator behaviour against fixtures.
//
// Runs the AJV validator directly so this test doesn't depend on
// spawning the check.mjs script; the schema is the same artefact
// scripts/backlog/check.mjs compiles.

import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import Ajv from "ajv";

const repoRoot = resolve(__dirname, "../..");
const schemaPath = resolve(repoRoot, "schemas/qa-ticket.schema.json");
const validFixtures = resolve(repoRoot, "tests/fixtures/qa-tickets/valid");
const invalidFixtures = resolve(repoRoot, "tests/fixtures/qa-tickets/invalid");

function compile() {
  const schema = JSON.parse(readFileSync(schemaPath, "utf8"));
  const ajv = new Ajv({ allErrors: true, strict: false, strictSchema: false });
  return ajv.compile(schema);
}

function loadFixture(file: string): unknown {
  return JSON.parse(readFileSync(file, "utf8"));
}

describe("qa-ticket schema (S93 QA-INTAKE-SCHEMA)", () => {
  it("accepts the canonical bug + regression-needed fixture pair", () => {
    const validate = compile();
    for (const name of readdirSync(validFixtures)) {
      if (!name.endsWith(".qa-ticket.json")) continue;
      const data = loadFixture(resolve(validFixtures, name));
      const ok = validate(data);
      expect(ok, `valid fixture rejected: ${name} → ${JSON.stringify(validate.errors)}`).toBe(true);
    }
  });

  it("rejects a regression-needed ticket missing regressionFor", () => {
    const validate = compile();
    const data = loadFixture(resolve(invalidFixtures, "QA-2026-05-20-901-missing-regression-for.qa-ticket.json"));
    expect(validate(data)).toBe(false);
    const messages = (validate.errors ?? []).map((e) => e.message ?? "");
    expect(messages.some((m) => m.includes("regressionFor"))).toBe(true);
  });

  it("rejects a ticket missing repro steps", () => {
    const validate = compile();
    const data = loadFixture(resolve(invalidFixtures, "QA-2026-05-20-902-missing-repro.qa-ticket.json"));
    expect(validate(data)).toBe(false);
    const messages = (validate.errors ?? []).map((e) => e.message ?? "");
    expect(messages.some((m) => m.includes("repro"))).toBe(true);
  });

  it("rejects an id that does not match QA-YYYY-MM-DD-NNN", () => {
    const validate = compile();
    const data = {
      agfFormatVersion: 1,
      id: "qa-bad-id",
      title: "Bad id sample",
      filedAt: "2026-05-20T14:23:00Z",
      severity: "minor",
      type: "bug",
      repro: ["step"]
    };
    expect(validate(data)).toBe(false);
    const messages = (validate.errors ?? []).map((e) => e.message ?? "");
    expect(messages.some((m) => m.includes("pattern"))).toBe(true);
  });

  it("rejects an unknown severity", () => {
    const validate = compile();
    const data = {
      agfFormatVersion: 1,
      id: "QA-2026-05-20-005",
      title: "Severity not in enum",
      filedAt: "2026-05-20T14:23:00Z",
      severity: "showstopper",
      type: "bug",
      repro: ["step"]
    };
    expect(validate(data)).toBe(false);
  });
});
