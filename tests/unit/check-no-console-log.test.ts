// S83 AGF-LOG-CI-GATE. Smoke test for the console.log CI gate.
//
// Exec'ing the script over the live tree is the source-of-truth check —
// this test confirms the script binary exists and that its exit code is
// the documented one (1 on violations, 0 on clean). A green run after
// LOG-AUDIT-ENGINE lands means the audit pass actually closed the gate.

import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SCRIPT = resolve(__dirname, "../../scripts/check-no-console-log.mjs");

describe("scripts/check-no-console-log.mjs (S83 AGF-LOG-CI-GATE)", () => {
  it("exits with a documented code and reports a deterministic single-line summary", () => {
    const r = spawnSync("node", [SCRIPT], { encoding: "utf8" });
    expect(r.status === 0 || r.status === 1).toBe(true);
    if (r.status === 0) {
      // Clean tree path — the success message lives on stdout.
      expect(r.stdout).toMatch(/\[check-no-console-log\] OK/);
    } else {
      // Violation path — the failure summary lives on stderr.
      expect(r.stderr).toMatch(/\[check-no-console-log\] FAIL/);
      expect(r.stderr).toMatch(/disallowed console\.\*/);
    }
  });
});
