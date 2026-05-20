// S100 AGF-DOCTOR-REJECTED-INBOX — rejectedInbox population +
// formatBacklog rendering.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";

import { formatBacklog, summarizeBacklog } from "../../engine/tools/doctor/project-doctor";

function stageRepo(rejected: string[]): { repoRoot: string; cleanup(): void } {
  const root = mkdtempSync(join(tmpdir(), "rejected-inbox-"));
  // Stub sprint so formatBacklog renders the backlog section.
  const sprintsDir = join(root, "backlog", "sprints");
  mkdirSync(sprintsDir, { recursive: true });
  writeFileSync(
    join(sprintsDir, "S999.sprint.json"),
    JSON.stringify({
      agfFormatVersion: 1,
      id: "S999",
      title: "Stub",
      status: "active",
      stories: [{ id: "S999-A", title: "Stub", status: "pending" }]
    }, null, 2) + "\n",
    "utf8"
  );
  if (rejected.length > 0) {
    const dir = join(root, "backlog", "qa-tickets", "archive", "rejected");
    mkdirSync(dir, { recursive: true });
    for (const id of rejected) {
      writeFileSync(
        join(dir, `${id}.qa-ticket.json`),
        JSON.stringify({ agfFormatVersion: 1, id, title: "Stub", filedAt: "2026-05-20T00:00:00Z", severity: "minor", type: "bug", repro: ["x"] }, null, 2) + "\n",
        "utf8"
      );
    }
  }
  return { repoRoot: root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

describe("BacklogReport.rejectedInbox (S100 AGF-DOCTOR-REJECTED-INBOX)", () => {
  it("is undefined when the rejected directory doesn't exist", () => {
    const fx = stageRepo([]);
    try {
      const r = summarizeBacklog(fx.repoRoot);
      expect(r.rejectedInbox).toBeUndefined();
    } finally {
      fx.cleanup();
    }
  });

  it("counts rejected tickets", () => {
    const fx = stageRepo(["QA-2026-05-20-001", "QA-2026-05-20-003", "QA-2026-05-20-999"]);
    try {
      const r = summarizeBacklog(fx.repoRoot);
      expect(r.rejectedInbox?.total).toBe(3);
    } finally {
      fx.cleanup();
    }
  });

  it("formatBacklog renders the Rejected QA tickets line when total > 0", () => {
    const fx = stageRepo(["QA-2026-05-20-001", "QA-2026-05-20-003"]);
    try {
      const out = formatBacklog(summarizeBacklog(fx.repoRoot));
      expect(out).toContain("Rejected QA tickets: 2");
      expect(out).toContain("archive/rejected/README.md");
    } finally {
      fx.cleanup();
    }
  });

  it("formatBacklog suppresses the Rejected line when there are no rejections", () => {
    const fx = stageRepo([]);
    try {
      const out = formatBacklog(summarizeBacklog(fx.repoRoot));
      expect(out).not.toContain("Rejected QA tickets");
    } finally {
      fx.cleanup();
    }
  });
});
