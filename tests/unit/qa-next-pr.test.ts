// S94 QA-NEXT-PR — drives the CLI via spawnSync with a PATH-stubbed `gh`.
//
// We don't want the test to hit a real GitHub API. The trick: create a
// temp dir holding a tiny `gh` shell script that prints a canned JSON
// response, prepend that dir to PATH, then invoke the script.

import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(__dirname, "../..");
const cli = resolve(repoRoot, "scripts/backlog/qa-next-pr.mjs");

function stubGh(jsonOutput: string): { binDir: string; cleanup(): void } {
  const dir = mkdtempSync(join(tmpdir(), "gh-stub-"));
  const ghPath = join(dir, "gh");
  writeFileSync(
    ghPath,
    `#!/usr/bin/env bash\ncat <<'JSON'\n${jsonOutput}\nJSON\n`,
    "utf8"
  );
  chmodSync(ghPath, 0o755);
  return { binDir: dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

function runCli(extraEnv: Record<string, string>, args: string[] = []) {
  const result = spawnSync("node", [cli, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, ...extraEnv }
  });
  return {
    status: result.status ?? -1,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim()
  };
}

describe("scripts/backlog/qa-next-pr.mjs (S94 QA-NEXT-PR)", () => {
  it("prints 'Caught up' + exit 0 when gh returns no sprint PRs", () => {
    const stub = stubGh("[]");
    try {
      const out = runCli({ PATH: `${stub.binDir}:${process.env["PATH"] ?? ""}` });
      expect(out.status).toBe(0);
      expect(out.stdout).toContain("Caught up");
    } finally {
      stub.cleanup();
    }
  });

  it("--json output reports { status: 'caught-up' } when nothing pending", () => {
    const stub = stubGh("[]");
    try {
      const out = runCli({ PATH: `${stub.binDir}:${process.env["PATH"] ?? ""}` }, ["--json"]);
      expect(out.status).toBe(0);
      const parsed = JSON.parse(out.stdout);
      expect(parsed.status).toBe("caught-up");
    } finally {
      stub.cleanup();
    }
  });

  it("picks the newest mergedAt and ignores PRs already referenced by a qa-ticket's foundInPr", () => {
    // PR #999 was reviewed (foundInPr=999 lives under archive/S094/), PR #1000 is new.
    // gh stub returns both; the CLI should pick #1000.
    const stub = stubGh(JSON.stringify([
      { number: 999, title: "S999: legacy sprint", mergedAt: "2026-05-01T10:00:00Z", headRefName: "sprint/999-legacy" },
      { number: 1000, title: "S1000: future sprint", mergedAt: "2026-05-10T10:00:00Z", headRefName: "sprint/1000-future" }
    ]));
    try {
      const out = runCli({ PATH: `${stub.binDir}:${process.env["PATH"] ?? ""}` }, ["--json"]);
      expect(out.status).toBe(0);
      const parsed = JSON.parse(out.stdout);
      expect(parsed.status).toBe("review");
      // Both unreviewed → newest mergedAt wins.
      expect(parsed.pr.number).toBe(1000);
    } finally {
      stub.cleanup();
    }
  });

  it("surfaces acceptance lines from the matching sprint JSON when available", () => {
    // Use a fixture sprint that actually exists.
    const stub = stubGh(JSON.stringify([
      { number: 1001, title: "S093: QA workflow engine + docs (S092 follow-up)", mergedAt: "2026-05-20T10:00:00Z", headRefName: "sprint/93-qa-workflow-engine" }
    ]));
    try {
      const out = runCli({ PATH: `${stub.binDir}:${process.env["PATH"] ?? ""}` }, ["--json"]);
      expect(out.status).toBe(0);
      const parsed = JSON.parse(out.stdout);
      expect(parsed.sprintId).toBe("S093");
      // S093 has many implemented stories with acceptance: lines.
      expect(Array.isArray(parsed.acceptance)).toBe(true);
      expect(parsed.acceptance.length).toBeGreaterThan(0);
      for (const a of parsed.acceptance) {
        expect(a.line.toLowerCase().startsWith("acceptance:")).toBe(true);
      }
    } finally {
      stub.cleanup();
    }
  });
});
