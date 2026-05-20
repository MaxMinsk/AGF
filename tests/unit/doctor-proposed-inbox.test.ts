// S99 AGF-DOCTOR-PROPOSED-STORIES — proposedInbox population +
// formatBacklog rendering.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";

import { formatBacklog, summarizeBacklog } from "../../engine/tools/doctor/project-doctor";

function stageRepo(proposals: Array<Record<string, unknown>>): { repoRoot: string; cleanup(): void } {
  const root = mkdtempSync(join(tmpdir(), "proposed-inbox-"));
  // formatBacklog short-circuits when there are zero sprints; need a
  // stub sprint so the proposedInbox section renders.
  const sprintsDir = join(root, "backlog", "sprints");
  mkdirSync(sprintsDir, { recursive: true });
  writeFileSync(
    join(sprintsDir, "S999.sprint.json"),
    JSON.stringify({
      agfFormatVersion: 1,
      id: "S999",
      title: "Test stub sprint",
      status: "active",
      stories: [{ id: "S999-A", title: "Stub story", status: "pending" }]
    }, null, 2) + "\n",
    "utf8"
  );
  // Stage the proposed-stories directory only when we have proposals
  // OR when the test explicitly needs the (empty dir) state. Both
  // paths exist — see individual tests.
  if (proposals.length > 0) {
    const dir = join(root, "backlog", "proposed-stories");
    mkdirSync(dir, { recursive: true });
    for (const p of proposals) {
      const id = p["id"] as string;
      writeFileSync(join(dir, `${id}.story-proposal.json`), JSON.stringify(p, null, 2) + "\n", "utf8");
    }
  }
  return { repoRoot: root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

function proposal(id: string, priority: "must" | "should" | "could", title: string, createdAt = "2026-05-20T12:00:00Z") {
  return {
    agfFormatVersion: 1,
    id,
    title,
    createdAt,
    kind: "feature",
    intent: "Twenty-character intent body for the schema's minLength.",
    priority
  };
}

describe("BacklogReport.proposedInbox (S99 AGF-DOCTOR-PROPOSED-STORIES)", () => {
  it("is undefined when the proposed-stories directory doesn't exist", () => {
    const fx = stageRepo([]);
    try {
      const r = summarizeBacklog(fx.repoRoot);
      expect(r.proposedInbox).toBeUndefined();
    } finally {
      fx.cleanup();
    }
  });

  it("counts proposals by priority", () => {
    const fx = stageRepo([
      proposal("GDP-2026-05-20-001", "must", "Big rock"),
      proposal("GDP-2026-05-20-002", "should", "Medium rock"),
      proposal("GDP-2026-05-20-003", "should", "Another medium"),
      proposal("GDP-2026-05-20-004", "could", "Pebble")
    ]);
    try {
      const r = summarizeBacklog(fx.repoRoot);
      expect(r.proposedInbox?.total).toBe(4);
      expect(r.proposedInbox?.byPriority).toEqual({ must: 1, should: 2, could: 1 });
    } finally {
      fx.cleanup();
    }
  });

  it("sorts oldest by priority-then-createdAt; lists up to 5", () => {
    const fx = stageRepo([
      proposal("GDP-2026-05-20-001", "could", "C 1", "2026-05-19T01:00:00Z"),
      proposal("GDP-2026-05-20-002", "must", "M 1", "2026-05-20T01:00:00Z"),
      proposal("GDP-2026-05-20-003", "must", "M 2", "2026-05-20T02:00:00Z"),
      proposal("GDP-2026-05-20-004", "should", "S 1", "2026-05-20T03:00:00Z"),
      proposal("GDP-2026-05-20-005", "should", "S 2", "2026-05-20T04:00:00Z"),
      proposal("GDP-2026-05-20-006", "could", "C 2", "2026-05-20T05:00:00Z")
    ]);
    try {
      const r = summarizeBacklog(fx.repoRoot);
      expect(r.proposedInbox?.oldest.length).toBe(5);
      // First two are must, then should×2, then the older could.
      expect(r.proposedInbox?.oldest.map((p) => p.id)).toEqual([
        "GDP-2026-05-20-002",
        "GDP-2026-05-20-003",
        "GDP-2026-05-20-004",
        "GDP-2026-05-20-005",
        "GDP-2026-05-20-001"
      ]);
    } finally {
      fx.cleanup();
    }
  });

  it("flags proposals older than 7 days as stalePending", () => {
    const old = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    const fresh = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();
    const fx = stageRepo([
      proposal("GDP-2026-05-20-001", "must", "Old proposal", old),
      proposal("GDP-2026-05-20-002", "must", "Fresh proposal", fresh)
    ]);
    try {
      const r = summarizeBacklog(fx.repoRoot);
      expect(r.proposedInbox?.stalePending.map((p) => p.id)).toEqual(["GDP-2026-05-20-001"]);
    } finally {
      fx.cleanup();
    }
  });

  it("formatBacklog renders the 'Proposed-story inbox' line + per-proposal breakdown", () => {
    const fx = stageRepo([
      proposal("GDP-2026-05-20-001", "must", "Top rock"),
      proposal("GDP-2026-05-20-002", "could", "Pebble rock")
    ]);
    try {
      const r = summarizeBacklog(fx.repoRoot);
      const out = formatBacklog(r);
      expect(out).toContain("Proposed-story inbox: 2 pending");
      expect(out).toContain("1 must");
      expect(out).toContain("GDP-2026-05-20-001 [must] Top rock");
      expect(out).toContain("GDP-2026-05-20-002 [could] Pebble rock");
    } finally {
      fx.cleanup();
    }
  });

  it("formatBacklog includes the ⚠ stale hint when proposals are > 7 days old", () => {
    const old = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    const fx = stageRepo([proposal("GDP-2026-05-20-001", "should", "Old", old)]);
    try {
      const out = formatBacklog(summarizeBacklog(fx.repoRoot));
      expect(out).toContain("older than 7 days");
      expect(out).toContain("propose:promote");
    } finally {
      fx.cleanup();
    }
  });
});
