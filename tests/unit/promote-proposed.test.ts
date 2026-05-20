// S097 GAME-DESIGN-PROPOSE-PROMOTE — spawn-driven CLI tests.
//
// Pattern mirrors tests/unit/qa-promote.test.ts: temp fixture dirs +
// --proposed-dir / --sprints-dir / --skip-check overrides so the test
// doesn't touch the real backlog/.

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(__dirname, "../..");
const cli = resolve(repoRoot, "scripts/backlog/promote-proposed.mjs");

type Proposal = Record<string, unknown>;

function setupFixture(
  proposals: Array<{ name: string; body: Proposal }>,
  sprintStories: unknown[] = [],
  sprintStatus: "pending" | "active" | "archived" = "pending"
): { proposedDir: string; sprintsDir: string; sprintFile: string; cleanup(): void } {
  const root = mkdtempSync(join(tmpdir(), "promote-proposed-"));
  const proposedDir = join(root, "proposed-stories");
  const sprintsDir = join(root, "sprints");
  mkdirSync(proposedDir, { recursive: true });
  mkdirSync(sprintsDir, { recursive: true });
  for (const p of proposals) {
    writeFileSync(join(proposedDir, p.name), JSON.stringify(p.body, null, 2) + "\n", "utf8");
  }
  const sprintFile = join(sprintsDir, "S999.sprint.json");
  const sprintBody = {
    agfFormatVersion: 1,
    id: "S999",
    title: "Test target sprint",
    status: sprintStatus,
    stories: sprintStories
  };
  writeFileSync(sprintFile, JSON.stringify(sprintBody, null, 2) + "\n", "utf8");
  return {
    proposedDir,
    sprintsDir,
    sprintFile,
    cleanup: () => rmSync(root, { recursive: true, force: true })
  };
}

function run(args: string[]) {
  const result = spawnSync("node", [cli, ...args], { cwd: repoRoot, encoding: "utf8" });
  return {
    status: result.status ?? -1,
    stdout: result.stdout,
    stderr: result.stderr
  };
}

function proposal(id: string, opts: Partial<Proposal> = {}): Proposal {
  return {
    agfFormatVersion: 1,
    id,
    title: opts.title ?? `Sample feature ${id}`,
    createdAt: "2026-05-20T12:00:00Z",
    kind: opts.kind ?? "feature",
    intent: opts.intent ?? "This is a long enough intent body to clear the schema minLength check.",
    priority: opts.priority ?? "should",
    ...opts
  };
}

describe("promote-proposed (S097 GAME-DESIGN-PROPOSE-PROMOTE)", () => {
  it("promotes a single proposal into the target sprint and archives the source", () => {
    const fx = setupFixture([
      { name: "GDP-2026-05-20-001.story-proposal.json", body: proposal("GDP-2026-05-20-001") }
    ]);
    try {
      const result = run([
        "--into", "S999",
        "--proposed-dir", fx.proposedDir,
        "--sprints-dir", fx.sprintsDir,
        "--skip-check"
      ]);
      expect(result.status, result.stderr).toBe(0);
      const sprint = JSON.parse(readFileSync(fx.sprintFile, "utf8")) as { stories: Array<{ id: string; title: string; status: string }> };
      expect(sprint.stories.length).toBe(1);
      expect(sprint.stories[0]?.id).toMatch(/^FEAT-/);
      expect(sprint.stories[0]?.status).toBe("pending");
      // Source archived under archive/S999/
      expect(readdirSync(fx.proposedDir)).not.toContain("GDP-2026-05-20-001.story-proposal.json");
      const archive = join(fx.proposedDir, "archive", "S999");
      expect(readdirSync(archive)).toContain("GDP-2026-05-20-001.story-proposal.json");
    } finally {
      fx.cleanup();
    }
  });

  it("empty inbox is a clean no-op exit", () => {
    const fx = setupFixture([]);
    try {
      const before = readFileSync(fx.sprintFile, "utf8");
      const result = run([
        "--into", "S999",
        "--proposed-dir", fx.proposedDir,
        "--sprints-dir", fx.sprintsDir,
        "--skip-check"
      ]);
      expect(result.status).toBe(0);
      expect(readFileSync(fx.sprintFile, "utf8")).toBe(before);
      expect(result.stderr).toContain("empty");
    } finally {
      fx.cleanup();
    }
  });

  it("refuses to promote into an archived sprint", () => {
    const fx = setupFixture(
      [{ name: "GDP-2026-05-20-001.story-proposal.json", body: proposal("GDP-2026-05-20-001") }],
      [],
      "archived"
    );
    try {
      const result = run([
        "--into", "S999",
        "--proposed-dir", fx.proposedDir,
        "--sprints-dir", fx.sprintsDir,
        "--skip-check"
      ]);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("archived");
      // Source untouched.
      expect(readdirSync(fx.proposedDir)).toContain("GDP-2026-05-20-001.story-proposal.json");
    } finally {
      fx.cleanup();
    }
  });

  it("accepts an active target sprint (in addition to pending)", () => {
    const fx = setupFixture(
      [{ name: "GDP-2026-05-20-001.story-proposal.json", body: proposal("GDP-2026-05-20-001") }],
      [],
      "active"
    );
    try {
      const result = run([
        "--into", "S999",
        "--proposed-dir", fx.proposedDir,
        "--sprints-dir", fx.sprintsDir,
        "--skip-check"
      ]);
      expect(result.status, result.stderr).toBe(0);
    } finally {
      fx.cleanup();
    }
  });

  it("--min-priority filters out lower-priority proposals", () => {
    const fx = setupFixture([
      { name: "GDP-2026-05-20-001.story-proposal.json", body: proposal("GDP-2026-05-20-001", { priority: "could" }) },
      { name: "GDP-2026-05-20-002.story-proposal.json", body: proposal("GDP-2026-05-20-002", { priority: "must", title: "Higher priority feature" }) }
    ]);
    try {
      const result = run([
        "--into", "S999",
        "--proposed-dir", fx.proposedDir,
        "--sprints-dir", fx.sprintsDir,
        "--skip-check",
        "--min-priority", "must"
      ]);
      expect(result.status, result.stderr).toBe(0);
      const sprint = JSON.parse(readFileSync(fx.sprintFile, "utf8")) as { stories: Array<{ id: string }> };
      expect(sprint.stories.length).toBe(1);
      expect(sprint.stories[0]?.id).toContain("HIGHER-PRIORITY-FEATURE");
      // Lower-priority source NOT archived.
      expect(readdirSync(fx.proposedDir)).toContain("GDP-2026-05-20-001.story-proposal.json");
    } finally {
      fx.cleanup();
    }
  });

  it("--dry-run does not modify the sprint file or archive sources", () => {
    const fx = setupFixture([
      { name: "GDP-2026-05-20-001.story-proposal.json", body: proposal("GDP-2026-05-20-001") }
    ]);
    try {
      const before = readFileSync(fx.sprintFile, "utf8");
      const result = run([
        "--into", "S999",
        "--proposed-dir", fx.proposedDir,
        "--sprints-dir", fx.sprintsDir,
        "--skip-check",
        "--dry-run"
      ]);
      expect(result.status, result.stderr).toBe(0);
      expect(readFileSync(fx.sprintFile, "utf8")).toBe(before);
      expect(readdirSync(fx.proposedDir)).toContain("GDP-2026-05-20-001.story-proposal.json");
      expect(result.stdout).toContain("DRY RUN");
    } finally {
      fx.cleanup();
    }
  });

  it("balance and content kinds get their own id prefixes", () => {
    const fx = setupFixture([
      { name: "GDP-2026-05-20-001.story-proposal.json", body: proposal("GDP-2026-05-20-001", { kind: "balance", title: "Tweak bomb fuse" }) },
      { name: "GDP-2026-05-20-002.story-proposal.json", body: proposal("GDP-2026-05-20-002", { kind: "content", title: "New arena skin" }) }
    ]);
    try {
      const result = run([
        "--into", "S999",
        "--proposed-dir", fx.proposedDir,
        "--sprints-dir", fx.sprintsDir,
        "--skip-check"
      ]);
      expect(result.status, result.stderr).toBe(0);
      const sprint = JSON.parse(readFileSync(fx.sprintFile, "utf8")) as { stories: Array<{ id: string }> };
      expect(sprint.stories.some((s) => /^BAL-/.test(s.id))).toBe(true);
      expect(sprint.stories.some((s) => /^CONTENT-/.test(s.id))).toBe(true);
    } finally {
      fx.cleanup();
    }
  });
});
