// S93 QA-INTAKE-PROMOTE — driven via spawnSync against temp dirs.
//
// We use `--qa-dir` + `--sprints-dir` overrides + `--skip-check` so
// the script reads/writes inside an isolated tmp tree without
// touching the real backlog/. The inline backlog:check step is the
// one thing we skip — separate tests cover the full repo's check
// behaviour.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(__dirname, "../..");
const cli = resolve(repoRoot, "scripts/backlog/promote-qa.mjs");

type Ticket = Record<string, unknown>;

function setupFixture(tickets: Array<{ name: string; body: Ticket }>, sprintStories: unknown[] = []): {
  qaDir: string;
  sprintsDir: string;
  sprintFile: string;
  cleanup(): void;
} {
  const root = mkdtempSync(join(tmpdir(), "qa-promote-"));
  const qaDir = join(root, "qa-tickets");
  const sprintsDir = join(root, "sprints");
  mkdirSync(qaDir, { recursive: true });
  mkdirSync(sprintsDir, { recursive: true });
  for (const t of tickets) {
    writeFileSync(join(qaDir, t.name), JSON.stringify(t.body, null, 2) + "\n", "utf8");
  }
  const sprintFile = join(sprintsDir, "S999.sprint.json");
  const sprintBody = {
    agfFormatVersion: 1,
    id: "S999",
    title: "Test target sprint",
    status: "pending",
    stories: sprintStories
  };
  writeFileSync(sprintFile, JSON.stringify(sprintBody, null, 2) + "\n", "utf8");
  return {
    qaDir,
    sprintsDir,
    sprintFile,
    cleanup: () => rmSync(root, { recursive: true, force: true })
  };
}

function run(args: string[]) {
  const result = spawnSync("node", [cli, ...args], {
    cwd: repoRoot,
    encoding: "utf8"
  });
  return {
    status: result.status ?? -1,
    stdout: result.stdout,
    stderr: result.stderr
  };
}

function bugTicket(id: string, severity: "critical" | "major" | "minor" | "polish" = "major"): Ticket {
  return {
    agfFormatVersion: 1,
    id,
    title: `Sample bug ${id}`,
    filedAt: "2026-05-20T14:00:00Z",
    severity,
    type: "bug",
    summary: "Sample summary",
    repro: ["Step one"],
    expected: "the right thing",
    actual: "the wrong thing"
  };
}

function regressionTicket(id: string, regressionFor: string): Ticket {
  return {
    agfFormatVersion: 1,
    id,
    title: `Regression test for ${regressionFor}`,
    filedAt: "2026-05-20T14:05:00Z",
    severity: "major",
    type: "regression-needed",
    regressionFor,
    repro: ["Step one"],
    playtest: "examples/example/playtests/qa-proposed/test.playtest.json"
  };
}

describe("scripts/backlog/promote-qa.mjs (S93 QA-INTAKE-PROMOTE)", () => {
  it("promotes a bug ticket into the target sprint as a BUG-... story", () => {
    const fx = setupFixture([
      { name: "QA-2026-05-20-001.qa-ticket.json", body: bugTicket("QA-2026-05-20-001") }
    ]);
    try {
      const result = run([
        "--into", "S999",
        "--qa-dir", fx.qaDir,
        "--sprints-dir", fx.sprintsDir,
        "--skip-check"
      ]);
      expect(result.status, result.stderr).toBe(0);
      const sprint = JSON.parse(readFileSync(fx.sprintFile, "utf8")) as { stories: Array<{ id: string; status: string }> };
      expect(sprint.stories).toHaveLength(1);
      expect(sprint.stories[0]!.id).toMatch(/^BUG-/);
      expect(sprint.stories[0]!.status).toBe("pending");
    } finally {
      fx.cleanup();
    }
  });

  it("links a regression-needed ticket via dependsOn", () => {
    const fx = setupFixture([
      { name: "QA-2026-05-20-001.qa-ticket.json", body: bugTicket("QA-2026-05-20-001") },
      { name: "QA-2026-05-20-002.qa-ticket.json", body: regressionTicket("QA-2026-05-20-002", "QA-2026-05-20-001") }
    ]);
    try {
      const result = run(["--into", "S999", "--qa-dir", fx.qaDir, "--sprints-dir", fx.sprintsDir, "--skip-check"]);
      expect(result.status, result.stderr).toBe(0);
      const sprint = JSON.parse(readFileSync(fx.sprintFile, "utf8")) as { stories: Array<{ id: string; dependsOn?: string[] }> };
      expect(sprint.stories).toHaveLength(2);
      const bug = sprint.stories.find((s) => s.id.startsWith("BUG-"))!;
      const reg = sprint.stories.find((s) => s.id.startsWith("REGRESSION-"))!;
      expect(bug.dependsOn).toEqual([reg.id]);
    } finally {
      fx.cleanup();
    }
  });

  it("--dry-run does not modify any files", () => {
    const fx = setupFixture([{ name: "QA-2026-05-20-001.qa-ticket.json", body: bugTicket("QA-2026-05-20-001") }]);
    try {
      const sprintBefore = readFileSync(fx.sprintFile, "utf8");
      const result = run(["--into", "S999", "--qa-dir", fx.qaDir, "--sprints-dir", fx.sprintsDir, "--skip-check", "--dry-run"]);
      expect(result.status).toBe(0);
      expect(readFileSync(fx.sprintFile, "utf8")).toBe(sprintBefore);
      // Source ticket also untouched.
      expect(readdirSync(fx.qaDir)).toContain("QA-2026-05-20-001.qa-ticket.json");
      expect(result.stdout).toContain("DRY RUN");
    } finally {
      fx.cleanup();
    }
  });

  it("--min-severity major filters out polish + minor tickets", () => {
    const fx = setupFixture([
      { name: "QA-2026-05-20-001.qa-ticket.json", body: bugTicket("QA-2026-05-20-001", "polish") },
      { name: "QA-2026-05-20-002.qa-ticket.json", body: bugTicket("QA-2026-05-20-002", "major") },
      { name: "QA-2026-05-20-003.qa-ticket.json", body: bugTicket("QA-2026-05-20-003", "critical") }
    ]);
    try {
      const result = run([
        "--into", "S999",
        "--qa-dir", fx.qaDir,
        "--sprints-dir", fx.sprintsDir,
        "--skip-check",
        "--min-severity", "major"
      ]);
      expect(result.status, result.stderr).toBe(0);
      const sprint = JSON.parse(readFileSync(fx.sprintFile, "utf8")) as { stories: Array<{ id: string }> };
      // Only the major + critical tickets were promoted.
      expect(sprint.stories).toHaveLength(2);
      // The polish source ticket should still be in the inbox (unpromoted).
      expect(readdirSync(fx.qaDir)).toContain("QA-2026-05-20-001.qa-ticket.json");
    } finally {
      fx.cleanup();
    }
  });

  it("archives source tickets after a successful promote", () => {
    const fx = setupFixture([{ name: "QA-2026-05-20-001.qa-ticket.json", body: bugTicket("QA-2026-05-20-001") }]);
    try {
      run(["--into", "S999", "--qa-dir", fx.qaDir, "--sprints-dir", fx.sprintsDir, "--skip-check"]);
      // Source file gone, archive directory has it.
      expect(readdirSync(fx.qaDir).filter((n) => n.endsWith(".qa-ticket.json"))).toHaveLength(0);
      const archive = join(fx.qaDir, "archive", "S999");
      expect(existsSync(archive)).toBe(true);
      expect(readdirSync(archive)).toContain("QA-2026-05-20-001.qa-ticket.json");
    } finally {
      fx.cleanup();
    }
  });

  it("refuses to promote into an archived sprint", () => {
    const fx = setupFixture([{ name: "QA-2026-05-20-001.qa-ticket.json", body: bugTicket("QA-2026-05-20-001") }]);
    try {
      // Re-write the target sprint as archived. Active is allowed now
      // (QA can promote into the live sprint mid-polish); archived
      // sprints are immutable so they stay rejected.
      const data = JSON.parse(readFileSync(fx.sprintFile, "utf8")) as { status: string };
      data.status = "archived";
      writeFileSync(fx.sprintFile, JSON.stringify(data, null, 2) + "\n", "utf8");
      const result = run(["--into", "S999", "--qa-dir", fx.qaDir, "--sprints-dir", fx.sprintsDir, "--skip-check"]);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("archived");
      // Source ticket untouched.
      expect(readdirSync(fx.qaDir)).toContain("QA-2026-05-20-001.qa-ticket.json");
    } finally {
      fx.cleanup();
    }
  });

  it("empty inbox is a clean exit, no writes", () => {
    const fx = setupFixture([]);
    try {
      const sprintBefore = readFileSync(fx.sprintFile, "utf8");
      const result = run(["--into", "S999", "--qa-dir", fx.qaDir, "--sprints-dir", fx.sprintsDir, "--skip-check"]);
      expect(result.status).toBe(0);
      expect(readFileSync(fx.sprintFile, "utf8")).toBe(sprintBefore);
      expect(result.stderr).toContain("empty");
    } finally {
      fx.cleanup();
    }
  });
});
