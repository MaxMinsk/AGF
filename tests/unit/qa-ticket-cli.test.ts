// S93 QA-INTAKE-NEW — scripts/backlog/qa-ticket.mjs new
//
// Drives the CLI via spawnSync against a temp `--into` directory so
// the test doesn't pollute the real backlog/qa-tickets/ inbox.

import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import Ajv from "ajv";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(__dirname, "../..");
const cli = resolve(repoRoot, "scripts/backlog/qa-ticket.mjs");
const schemaPath = resolve(repoRoot, "schemas/qa-ticket.schema.json");

function run(args: string[], cwd = repoRoot) {
  const result = spawnSync("node", [cli, ...args], {
    cwd,
    encoding: "utf8"
  });
  return {
    status: result.status ?? -1,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim()
  };
}

function compileSchema() {
  const schema = JSON.parse(readFileSync(schemaPath, "utf8"));
  const ajv = new Ajv({ allErrors: true, strict: false, strictSchema: false });
  return ajv.compile(schema);
}

describe("scripts/backlog/qa-ticket.mjs new (S93 QA-INTAKE-NEW)", () => {
  it("creates a file with the QA-YYYY-MM-DD-NNN id pattern", () => {
    const dir = mkdtempSync(join(tmpdir(), "qa-cli-"));
    try {
      const result = run(["new", "Smoke ticket title", "--severity", "major", "--type", "bug", "--into", dir]);
      expect(result.status).toBe(0);
      const files = readdirSync(dir);
      expect(files).toHaveLength(1);
      const filename = files[0]!;
      expect(filename).toMatch(/^QA-\d{4}-\d{2}-\d{2}-\d{3}\.qa-ticket\.json$/);
      expect(result.stdout.endsWith(filename)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("auto-increments NNN when files for the same day already exist", () => {
    const dir = mkdtempSync(join(tmpdir(), "qa-cli-"));
    try {
      run(["new", "First ticket of the day", "--severity", "major", "--type", "bug", "--into", dir]);
      run(["new", "Second ticket of the day", "--severity", "minor", "--type", "bug", "--into", dir]);
      const files = readdirSync(dir).sort();
      expect(files).toHaveLength(2);
      // Second file's NNN must be greater than the first's.
      const nnn = (name: string) => Number(/-(\d{3})\.qa-ticket\.json$/.exec(name)?.[1] ?? "0");
      expect(nnn(files[0]!)).toBe(1);
      expect(nnn(files[1]!)).toBe(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("produces a file that validates clean against qa-ticket.schema.json", () => {
    const dir = mkdtempSync(join(tmpdir(), "qa-cli-"));
    try {
      run(["new", "Validates against the schema", "--severity", "major", "--type", "bug", "--into", dir]);
      const files = readdirSync(dir);
      const data = JSON.parse(readFileSync(join(dir, files[0]!), "utf8"));
      const validate = compileSchema();
      const ok = validate(data);
      expect(ok, `schema rejected: ${JSON.stringify(validate.errors)}`).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("regression-needed ticket auto-fills regressionFor from --regression-for", () => {
    const dir = mkdtempSync(join(tmpdir(), "qa-cli-"));
    try {
      const result = run([
        "new",
        "Regression test ticket for bug X",
        "--severity",
        "major",
        "--type",
        "regression-needed",
        "--regression-for",
        "QA-2026-05-20-007",
        "--into",
        dir
      ]);
      expect(result.status).toBe(0);
      const files = readdirSync(dir);
      const data = JSON.parse(readFileSync(join(dir, files[0]!), "utf8"));
      expect(data.regressionFor).toBe("QA-2026-05-20-007");
      // Should pass schema (regressionFor satisfies the conditional rule).
      const validate = compileSchema();
      expect(validate(data)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("refuses to clobber an existing file with the same id", () => {
    const dir = mkdtempSync(join(tmpdir(), "qa-cli-"));
    try {
      const today = new Date();
      const yyyy = today.getUTCFullYear().toString().padStart(4, "0");
      const mm = (today.getUTCMonth() + 1).toString().padStart(2, "0");
      const dd = today.getUTCDate().toString().padStart(2, "0");
      // Pre-write 001 manually.
      const seedName = `QA-${yyyy}-${mm}-${dd}-001.qa-ticket.json`;
      writeFileSync(join(dir, seedName), "{}", "utf8");
      // CLI should pick 002, not 001.
      const result = run(["new", "Avoid clobber", "--severity", "minor", "--type", "bug", "--into", dir]);
      expect(result.status).toBe(0);
      const files = readdirSync(dir).sort();
      expect(files).toHaveLength(2);
      expect(files[1]).toMatch(/-002\.qa-ticket\.json$/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects a title shorter than 5 characters", () => {
    const dir = mkdtempSync(join(tmpdir(), "qa-cli-"));
    try {
      const result = run(["new", "hi", "--severity", "minor", "--type", "bug", "--into", dir]);
      expect(result.status).not.toBe(0);
      expect(result.stderr.toLowerCase()).toContain("title");
      expect(readdirSync(dir)).toHaveLength(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
