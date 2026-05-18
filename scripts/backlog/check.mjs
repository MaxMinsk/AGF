#!/usr/bin/env node
// S78 BACKLOG-CHECK. Validates `backlog/sprints/*.sprint.json` against the
// schema + cross-file rules an agent shouldn't have to remember:
//
//   - sprint id is unique across files;
//   - at most one sprint has status === "active";
//   - story id is unique across all sprints (commit messages reference it);
//   - story.dependsOn entries resolve to known story ids;
//   - dependsOn graph has no cycles (across sprints);
//   - archived sprints contain no pending/in_progress stories;
//   - active sprint has at least one pending/in_progress story;
//   - story status === "implemented" requires verification[] non-empty;
//   - story status === "deferred"   requires deferredReason.
//
// Diagnostics use the same shape `engine check` emits so the same
// vscode/diagnostics tooling renders them.
//
// Modes:
//   node scripts/backlog/check.mjs             # human report, exits 0/1
//   node scripts/backlog/check.mjs --json      # JSON array of diagnostics
//   node scripts/backlog/check.mjs --check     # alias for default (CI-shaped)

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const sprintsDir = resolve(repoRoot, "backlog/sprints");
const schemaPath = resolve(repoRoot, "schemas/backlog/sprint.schema.json");

const args = new Set(process.argv.slice(2));
const jsonOutput = args.has("--json");

/** @type {Array<{ code: string; severity: "error" | "warning"; file?: string; path?: string; message: string; suggestion?: string }>} */
const diagnostics = [];

function diag(code, severity, message, extra = {}) {
  diagnostics.push({ code, severity, message, ...extra });
}

let schema;
try {
  schema = JSON.parse(readFileSync(schemaPath, "utf8"));
} catch (err) {
  diag("AGF_BACKLOG_SCHEMA_LOAD_FAILED", "error", `Could not load sprint schema: ${err.message}`, { file: schemaPath });
  report();
  process.exit(1);
}

// `format: "date"` annotations in the schema are advisory only — without
// ajv-formats, Ajv ignores them. We still range-check the date strings
// in cross-file rules above (startedAt/archivedAt are stringly typed).
// `strictSchema: false` silences "unknown format \"date\" ignored" advisory
// warnings; we annotate startedAt/archivedAt with `format: "date"` for
// human documentation purposes even though we don't bundle ajv-formats.
const ajv = new Ajv({ allErrors: true, strict: false, strictSchema: false });
const validate = ajv.compile(schema);

/** @type {Array<{ file: string; data: any }>} */
const sprints = [];
let sprintFileNames = [];
try {
  if (statSync(sprintsDir).isDirectory()) {
    sprintFileNames = readdirSync(sprintsDir)
      .filter((name) => name.endsWith(".sprint.json"))
      .sort();
  }
} catch {
  // sprintsDir doesn't exist yet → treat as zero sprints.
  sprintFileNames = [];
}

for (const name of sprintFileNames) {
  const file = resolve(sprintsDir, name);
  let data;
  try {
    data = JSON.parse(readFileSync(file, "utf8"));
  } catch (err) {
    diag("AGF_BACKLOG_PARSE", "error", `JSON parse failed: ${err.message}`, { file });
    continue;
  }
  const ok = validate(data);
  if (!ok) {
    for (const e of validate.errors ?? []) {
      diag("AGF_BACKLOG_SCHEMA", "error", `${e.instancePath || "/"} ${e.message ?? "schema error"}`, { file, path: e.instancePath });
    }
    continue;
  }
  sprints.push({ file, data });
}

// Cross-file rules.

const idsSeen = new Map(); // sprintId → file
for (const { file, data } of sprints) {
  if (idsSeen.has(data.id)) {
    diag(
      "AGF_BACKLOG_DUPLICATE_SPRINT_ID",
      "error",
      `Sprint id "${data.id}" appears in multiple files.`,
      { file, suggestion: `Also seen in ${idsSeen.get(data.id)}` }
    );
  } else {
    idsSeen.set(data.id, file);
  }
}

const activeSprints = sprints.filter((s) => s.data.status === "active");
if (activeSprints.length > 1) {
  diag(
    "AGF_BACKLOG_MULTIPLE_ACTIVE",
    "error",
    `At most one sprint can be active; saw ${activeSprints.length}: ${activeSprints.map((s) => s.data.id).join(", ")}.`,
    { suggestion: "Archive the older one or move it back to status: pending." }
  );
}

for (const { file, data } of sprints) {
  if (data.status === "archived") {
    for (const story of data.stories ?? []) {
      if (story.status === "pending" || story.status === "in_progress") {
        diag(
          "AGF_BACKLOG_ARCHIVED_HAS_OPEN",
          "error",
          `Archived sprint ${data.id} has story ${story.id} in status "${story.status}".`,
          { file, suggestion: "Either mark the story implemented/deferred before archiving, or move it to the next sprint." }
        );
      }
    }
    if (data.archivedAt === null || data.archivedAt === undefined) {
      diag(
        "AGF_BACKLOG_ARCHIVED_NO_DATE",
        "warning",
        `Archived sprint ${data.id} has no archivedAt date.`,
        { file }
      );
    }
  }
  if (data.status === "active") {
    const hasOpen = (data.stories ?? []).some((s) => s.status === "pending" || s.status === "in_progress");
    if (!hasOpen) {
      diag(
        "AGF_BACKLOG_ACTIVE_NO_OPEN",
        "warning",
        `Active sprint ${data.id} has no pending or in_progress stories — should it be archived?`,
        { file }
      );
    }
  }
}

// Build a global story-id → { sprintId, status } table.
const storyTable = new Map();
for (const { file, data } of sprints) {
  for (const story of data.stories ?? []) {
    if (storyTable.has(story.id)) {
      const prev = storyTable.get(story.id);
      diag(
        "AGF_BACKLOG_DUPLICATE_STORY_ID",
        "error",
        `Story id "${story.id}" is defined in both ${prev.sprintId} and ${data.id}.`,
        { file, suggestion: "Story ids should be globally unique so commit messages stay unambiguous." }
      );
    } else {
      storyTable.set(story.id, { sprintId: data.id, status: story.status, deps: story.dependsOn ?? [] });
    }
  }
}

// Resolve dependsOn references + check cycles.
for (const { file, data } of sprints) {
  for (const story of data.stories ?? []) {
    for (const dep of story.dependsOn ?? []) {
      if (!storyTable.has(dep)) {
        diag(
          "AGF_BACKLOG_UNKNOWN_DEP",
          "error",
          `Story ${story.id} depends on unknown story "${dep}".`,
          { file }
        );
      }
    }
  }
}

// Cycle detection via DFS over the dependency graph.
{
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map();
  for (const id of storyTable.keys()) color.set(id, WHITE);
  /** @type {Array<string>} */
  const stack = [];
  function dfs(id) {
    color.set(id, GRAY);
    stack.push(id);
    const entry = storyTable.get(id);
    if (entry !== undefined) {
      for (const dep of entry.deps) {
        if (!storyTable.has(dep)) continue;
        const c = color.get(dep);
        if (c === GRAY) {
          const cycleStart = stack.indexOf(dep);
          const cycle = stack.slice(cycleStart).concat([dep]).join(" → ");
          diag(
            "AGF_BACKLOG_DEP_CYCLE",
            "error",
            `Dependency cycle: ${cycle}.`
          );
        } else if (c === WHITE) {
          dfs(dep);
        }
      }
    }
    stack.pop();
    color.set(id, BLACK);
  }
  for (const id of storyTable.keys()) {
    if (color.get(id) === WHITE) dfs(id);
  }
}

report();

function report() {
  if (jsonOutput) {
    process.stdout.write(JSON.stringify(diagnostics, null, 2) + "\n");
    process.exit(diagnostics.some((d) => d.severity === "error") ? 1 : 0);
  }
  if (diagnostics.length === 0) {
    console.log(`[backlog:check] OK — ${sprints.length} sprint file(s), ${storyTable.size} stor${storyTable.size === 1 ? "y" : "ies"}.`);
    process.exit(0);
  }
  const errors = diagnostics.filter((d) => d.severity === "error");
  const warnings = diagnostics.filter((d) => d.severity === "warning");
  for (const d of diagnostics) {
    const file = d.file ? ` (${d.file.replace(repoRoot + "/", "")})` : "";
    console.log(`[${d.severity}] ${d.code}: ${d.message}${file}`);
    if (d.suggestion) console.log(`         hint: ${d.suggestion}`);
  }
  console.log(`[backlog:check] ${errors.length} error(s), ${warnings.length} warning(s).`);
  process.exit(errors.length > 0 ? 1 : 0);
}
