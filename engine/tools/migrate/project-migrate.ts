// Project migration v0 — minimal scope so the CLI surface exists when the
// first breaking schema change lands. Today migrating only touches the
// `agfFormatVersion` field on project.json:
//   * missing or 0 → set to CURRENT_FORMAT_VERSION
//   * stale (< CURRENT) → bumped to CURRENT (no-op for v0→v1 since v1 is
//     the first version)
//
// Returns the planned mutations as a list of patches so `--dry-run` can
// print them without writing anything.

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { CURRENT_FORMAT_VERSION } from "../check/format-version";

export type MigrationPatch = {
  /** Project-relative file path. */
  file: string;
  /** JSONPath-style key the patch touches. */
  path: string;
  /** Previous value (undefined when adding a new field). */
  before: unknown;
  /** New value (undefined when removing a field). */
  after: unknown;
};

export type MigrationPlan = {
  projectDir: string;
  fromVersion: number | undefined;
  toVersion: number;
  patches: MigrationPatch[];
};

export function planMigration(projectDirInput: string): MigrationPlan {
  const projectDir = resolve(projectDirInput);
  const projectPath = resolve(projectDir, "project.json");
  const raw = JSON.parse(readFileSync(projectPath, "utf8")) as Record<string, unknown>;
  const current = typeof raw["agfFormatVersion"] === "number" ? (raw["agfFormatVersion"] as number) : undefined;

  const patches: MigrationPatch[] = [];
  if (current === undefined || current < CURRENT_FORMAT_VERSION) {
    patches.push({
      file: "project.json",
      path: "$.agfFormatVersion",
      before: current,
      after: CURRENT_FORMAT_VERSION
    });
  }

  return {
    projectDir,
    fromVersion: current,
    toVersion: CURRENT_FORMAT_VERSION,
    patches
  };
}

export function applyMigration(plan: MigrationPlan): void {
  if (plan.patches.length === 0) {
    return;
  }
  const projectPath = resolve(plan.projectDir, "project.json");
  const raw = JSON.parse(readFileSync(projectPath, "utf8")) as Record<string, unknown>;
  const withVersion: Record<string, unknown> = { agfFormatVersion: plan.toVersion };
  for (const [key, value] of Object.entries(raw)) {
    if (key !== "agfFormatVersion") {
      withVersion[key] = value;
    }
  }
  writeFileSync(projectPath, JSON.stringify(withVersion, null, 2) + "\n");
}

export function formatPlan(plan: MigrationPlan): string {
  const lines: string[] = [];
  lines.push(`Migration plan for ${plan.projectDir}`);
  lines.push(`  from version: ${plan.fromVersion ?? "(none)"}`);
  lines.push(`  to version:   ${plan.toVersion}`);
  if (plan.patches.length === 0) {
    lines.push("  patches: (no changes needed)");
    return lines.join("\n");
  }
  lines.push(`  patches (${plan.patches.length}):`);
  for (const patch of plan.patches) {
    const before = JSON.stringify(patch.before);
    const after = JSON.stringify(patch.after);
    lines.push(`    ~ ${patch.file} ${patch.path}: ${before} -> ${after}`);
  }
  return lines.join("\n");
}
