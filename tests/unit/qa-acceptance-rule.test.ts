// S93 QA-ACCEPTANCE-CONVENTION — backlog:check warning rule.
//
// We can't isolate the rule cleanly without refactoring check.mjs into
// a library — the script reads from repoRoot directly. So this test
// invokes the live check.mjs against a temp-cloned sprint set: we
// stage a fixture sprint under a temp dir and run `backlog:check`
// with the actual repo (sanity), then inspect specific entries.

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(__dirname, "../..");
const checkScript = resolve(repoRoot, "scripts/backlog/check.mjs");

function runCheckJson(): Array<{ code: string; severity: string; message: string; file?: string }> {
  const result = spawnSync("node", [checkScript, "--json"], { cwd: repoRoot, encoding: "utf8" });
  try {
    return JSON.parse(result.stdout);
  } catch {
    return [];
  }
}

describe("AGF_BACKLOG_NO_ACCEPTANCE rule (S93 QA-ACCEPTANCE-CONVENTION)", () => {
  it("does NOT fire for archived sprints with implemented stories lacking acceptance lines", () => {
    // We have hundreds of archived stories that don't have acceptance
    // lines (legacy). The rule must skip them.
    const diags = runCheckJson();
    const archivedWarnings = diags.filter((d) => d.code === "AGF_BACKLOG_NO_ACCEPTANCE");
    // Should only fire on non-archived sprints — and none of the
    // active/pending sprint stories at the moment are status=implemented
    // AND missing acceptance.
    // The exact count depends on repo state; at MINIMUM we never see
    // a warning whose file points at an archived sprint id.
    for (const w of archivedWarnings) {
      // Read the sprint file the warning points at; status must be active/pending.
      if (w.file === undefined) continue;
      const data = JSON.parse(readFileSync(w.file, "utf8")) as { status: string };
      expect(data.status, `warning fired on archived sprint ${w.file}`).not.toBe("archived");
    }
  });

  it("emits a warning when a pending sprint's implemented story has no acceptance line", () => {
    // Write a temp sprint under backlog/sprints/ that exercises the
    // rule; restore on cleanup. We use sprint id S888 to avoid any
    // collision with real sprints.
    const sprintsDir = resolve(repoRoot, "backlog/sprints");
    const file = join(sprintsDir, "S888.sprint.json");
    const body = {
      agfFormatVersion: 1,
      id: "S888",
      title: "Acceptance-rule smoke fixture",
      status: "pending",
      stories: [
        {
          id: "S888-A",
          title: "Story without acceptance line",
          status: "implemented",
          verification: ["did the thing"]
        },
        {
          id: "S888-B",
          title: "Story with acceptance line",
          status: "implemented",
          verification: ["acceptance: a user clicks the thing", "ran tests"]
        }
      ]
    };
    writeFileSync(file, JSON.stringify(body, null, 2) + "\n", "utf8");
    try {
      const diags = runCheckJson();
      const warnings = diags.filter(
        (d) => d.code === "AGF_BACKLOG_NO_ACCEPTANCE" && d.message.includes("S888-A")
      );
      expect(warnings.length).toBe(1);
      // The "good" story must not warn.
      const goodWarnings = diags.filter(
        (d) => d.code === "AGF_BACKLOG_NO_ACCEPTANCE" && d.message.includes("S888-B")
      );
      expect(goodWarnings.length).toBe(0);
    } finally {
      rmSync(file, { force: true });
    }
  });

  it("case-insensitive: Acceptance and ACCEPTANCE both silence the warning", () => {
    const sprintsDir = resolve(repoRoot, "backlog/sprints");
    const file = join(sprintsDir, "S889.sprint.json");
    const body = {
      agfFormatVersion: 1,
      id: "S889",
      title: "Acceptance case-insensitive fixture",
      status: "pending",
      stories: [
        {
          id: "S889-A",
          title: "Title-case prefix",
          status: "implemented",
          verification: ["Acceptance: user sees X"]
        },
        {
          id: "S889-B",
          title: "UPPER prefix",
          status: "implemented",
          verification: ["ACCEPTANCE: user sees Y"]
        }
      ]
    };
    writeFileSync(file, JSON.stringify(body, null, 2) + "\n", "utf8");
    try {
      const diags = runCheckJson();
      const matchingWarnings = diags.filter(
        (d) =>
          d.code === "AGF_BACKLOG_NO_ACCEPTANCE" &&
          (d.message.includes("S889-A") || d.message.includes("S889-B"))
      );
      expect(matchingWarnings.length).toBe(0);
    } finally {
      rmSync(file, { force: true });
    }
  });
});
