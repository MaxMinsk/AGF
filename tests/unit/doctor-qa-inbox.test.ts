// S93 QA-DOCTOR-INBOX — qaInbox population + formatBacklog rendering.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";

import { formatBacklog, summarizeBacklog } from "../../engine/tools/doctor/project-doctor";

function stageRepo(tickets: Array<Record<string, unknown>>): { repoRoot: string; cleanup(): void } {
  const root = mkdtempSync(join(tmpdir(), "qa-inbox-"));
  // formatBacklog short-circuits when there are zero sprints; we need
  // at least one active sprint for the QA inbox section to render in
  // the format pass.
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
  if (tickets.length > 0) {
    const qaDir = join(root, "backlog", "qa-tickets");
    mkdirSync(qaDir, { recursive: true });
    for (const t of tickets) {
      const id = t["id"] as string;
      writeFileSync(join(qaDir, `${id}.qa-ticket.json`), JSON.stringify(t, null, 2) + "\n", "utf8");
    }
  }
  return { repoRoot: root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

function ticket(id: string, severity: "critical" | "major" | "minor" | "polish", title: string, filedAt = "2026-05-20T12:00:00Z") {
  return {
    agfFormatVersion: 1,
    id,
    title,
    filedAt,
    severity,
    type: "bug",
    repro: ["step"]
  };
}

describe("BacklogReport.qaInbox (S93 QA-DOCTOR-INBOX)", () => {
  it("is undefined when there are no tickets", () => {
    const fx = stageRepo([]);
    try {
      const r = summarizeBacklog(fx.repoRoot);
      expect(r.qaInbox).toBeUndefined();
    } finally {
      fx.cleanup();
    }
  });

  it("counts tickets by severity", () => {
    const fx = stageRepo([
      ticket("QA-2026-05-20-001", "critical", "C bug"),
      ticket("QA-2026-05-20-002", "major", "M bug"),
      ticket("QA-2026-05-20-003", "major", "M bug 2"),
      ticket("QA-2026-05-20-004", "polish", "P bug")
    ]);
    try {
      const r = summarizeBacklog(fx.repoRoot);
      expect(r.qaInbox?.total).toBe(4);
      expect(r.qaInbox?.bySeverity).toEqual({ critical: 1, major: 2, minor: 0, polish: 1 });
    } finally {
      fx.cleanup();
    }
  });

  it("sorts oldest by severity-then-filedAt; lists up to 5", () => {
    const fx = stageRepo([
      ticket("QA-2026-05-20-001", "polish", "P bug", "2026-05-19T01:00:00Z"),
      ticket("QA-2026-05-20-002", "critical", "C bug recent", "2026-05-20T11:00:00Z"),
      ticket("QA-2026-05-20-003", "critical", "C bug old", "2026-05-19T11:00:00Z"),
      ticket("QA-2026-05-20-004", "major", "M bug")
    ]);
    try {
      const r = summarizeBacklog(fx.repoRoot);
      // critical-old first (older filedAt), then critical-recent, then major, then polish.
      expect(r.qaInbox?.oldest.map((t) => t.id)).toEqual([
        "QA-2026-05-20-003",
        "QA-2026-05-20-002",
        "QA-2026-05-20-004",
        "QA-2026-05-20-001"
      ]);
    } finally {
      fx.cleanup();
    }
  });

  it("flags critical tickets older than 24h in staleCritical", () => {
    const longAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const justNow = new Date(Date.now() - 60 * 1000).toISOString();
    const fx = stageRepo([
      ticket("QA-2026-05-20-001", "critical", "very old crit", longAgo),
      ticket("QA-2026-05-20-002", "critical", "fresh crit", justNow),
      ticket("QA-2026-05-20-003", "major", "old major", longAgo)
    ]);
    try {
      const r = summarizeBacklog(fx.repoRoot);
      expect(r.qaInbox?.staleCritical.map((t) => t.id)).toEqual(["QA-2026-05-20-001"]);
    } finally {
      fx.cleanup();
    }
  });

  it("formatBacklog renders a QA inbox: line when tickets exist", () => {
    const fx = stageRepo([
      ticket("QA-2026-05-20-001", "critical", "Crit bug title"),
      ticket("QA-2026-05-20-002", "major", "Major bug title")
    ]);
    try {
      const r = summarizeBacklog(fx.repoRoot);
      const out = formatBacklog(r);
      expect(out).toContain("QA inbox: 2 ticket(s)");
      expect(out).toContain("1 critical");
      expect(out).toContain("QA-2026-05-20-001");
      expect(out).toContain("Crit bug title");
    } finally {
      fx.cleanup();
    }
  });

  it("formatBacklog omits the QA inbox line when the inbox is empty", () => {
    const fx = stageRepo([]);
    try {
      const r = summarizeBacklog(fx.repoRoot);
      const out = formatBacklog(r);
      expect(out).not.toContain("QA inbox:");
    } finally {
      fx.cleanup();
    }
  });
});
