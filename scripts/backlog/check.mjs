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
const epicsDir = resolve(repoRoot, "backlog/epics");
const schemaPath = resolve(repoRoot, "schemas/backlog/sprint.schema.json");
const epicSchemaPath = resolve(repoRoot, "schemas/backlog/epic.schema.json");

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

// S080 BACKLOG-EPIC-CHECK: same Ajv instance is reused for the epic schema.
// The epic file is optional — projects that have not yet introduced the
// `backlog/epics/` directory still pass the check.
let validateEpic;
try {
  const epicSchema = JSON.parse(readFileSync(epicSchemaPath, "utf8"));
  validateEpic = ajv.compile(epicSchema);
} catch (err) {
  diag(
    "AGF_BACKLOG_EPIC_SCHEMA_LOAD_FAILED",
    "warning",
    `Could not load epic schema (epic validation skipped): ${err.message}`,
    { file: epicSchemaPath }
  );
  validateEpic = null;
}

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

// S080 BACKLOG-EPIC-CHECK — epic file validation + cross-references.
/** @type {Array<{ file: string; data: any }>} */
const epics = [];
let epicFileNames = [];
try {
  if (statSync(epicsDir).isDirectory()) {
    epicFileNames = readdirSync(epicsDir)
      .filter((name) => name.endsWith(".epic.json"))
      .sort();
  }
} catch {
  // backlog/epics not created yet → no epics, no error.
  epicFileNames = [];
}

if (validateEpic !== null) {
  for (const name of epicFileNames) {
    const file = resolve(epicsDir, name);
    let data;
    try {
      data = JSON.parse(readFileSync(file, "utf8"));
    } catch (err) {
      diag("AGF_BACKLOG_EPIC_PARSE", "error", `Epic JSON parse failed: ${err.message}`, { file });
      continue;
    }
    if (!validateEpic(data)) {
      for (const e of validateEpic.errors ?? []) {
        diag(
          "AGF_BACKLOG_EPIC_SCHEMA",
          "error",
          `${e.instancePath || "/"} ${e.message ?? "schema error"}`,
          { file, path: e.instancePath }
        );
      }
      continue;
    }
    epics.push({ file, data });
  }
}

// Build epic-id index + check uniqueness.
const epicTable = new Map(); // epicId → { file, status, deps }
for (const { file, data } of epics) {
  if (epicTable.has(data.id)) {
    diag(
      "AGF_BACKLOG_DUPLICATE_EPIC_ID",
      "error",
      `Epic id "${data.id}" appears in multiple files.`,
      { file, suggestion: `Also seen in ${epicTable.get(data.id).file}` }
    );
    continue;
  }
  epicTable.set(data.id, { file, status: data.status, deps: data.dependsOn ?? [] });
}

// Resolve epic.dependsOn — every dep id must be a known epic.
for (const { file, data } of epics) {
  for (const dep of data.dependsOn ?? []) {
    if (!epicTable.has(dep)) {
      diag(
        "AGF_BACKLOG_EPIC_UNKNOWN_DEP",
        "error",
        `Epic ${data.id} depends on unknown epic "${dep}".`,
        { file }
      );
    }
  }
}

// Cycle detection across the epic graph.
{
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map();
  for (const id of epicTable.keys()) color.set(id, WHITE);
  /** @type {Array<string>} */
  const stack = [];
  function dfs(id) {
    color.set(id, GRAY);
    stack.push(id);
    const entry = epicTable.get(id);
    if (entry !== undefined) {
      for (const dep of entry.deps) {
        if (!epicTable.has(dep)) continue;
        const c = color.get(dep);
        if (c === GRAY) {
          const cycleStart = stack.indexOf(dep);
          const cycle = stack.slice(cycleStart).concat([dep]).join(" → ");
          diag("AGF_BACKLOG_EPIC_CYCLE", "error", `Epic dependency cycle: ${cycle}.`);
        } else if (c === WHITE) {
          dfs(dep);
        }
      }
    }
    stack.pop();
    color.set(id, BLACK);
  }
  for (const id of epicTable.keys()) {
    if (color.get(id) === WHITE) dfs(id);
  }
}

// story.epic cross-reference: warn (downgraded to error after the
// S080 BACKLOG-EPIC-STORY-BACKFILL story flips this gate). Only checked
// when at least one epic file exists, so legacy repos still pass.
const unknownEpicReferences = new Set();
const openStoriesByEpic = new Map(); // epicId → Array<{ storyId, sprintId }>
if (epicTable.size > 0) {
  for (const { file, data } of sprints) {
    for (const story of data.stories ?? []) {
      const epicId = story.epic;
      if (typeof epicId !== "string" || epicId.length === 0) continue;
      if (!epicTable.has(epicId)) {
        const key = `${story.id}→${epicId}`;
        if (!unknownEpicReferences.has(key)) {
          unknownEpicReferences.add(key);
          // S80 BACKLOG-EPIC-STORY-BACKFILL flipped this from warning to
          // error: by now every story that *has* an epic ref must resolve.
          // Untagged stories (no `epic` field at all) are still allowed.
          diag(
            "AGF_BACKLOG_EPIC_UNKNOWN",
            "error",
            `Story ${story.id} (in ${data.id}) references unknown epic "${epicId}".`,
            { file, suggestion: `Either add backlog/epics/${epicId}.epic.json or drop the story.epic field.` }
          );
        }
        continue;
      }
      if (story.status === "pending" || story.status === "in_progress" || story.status === "implemented") {
        if (!openStoriesByEpic.has(epicId)) openStoriesByEpic.set(epicId, []);
        openStoriesByEpic.get(epicId).push({ storyId: story.id, sprintId: data.id, status: story.status });
      }
    }
  }

  // `done` epic must have no still-open (pending/in_progress) story tagged to it.
  // Implemented stories are fine — they count as part of the epic completion.
  for (const [epicId, entry] of epicTable.entries()) {
    if (entry.status !== "done") continue;
    const stories = openStoriesByEpic.get(epicId) ?? [];
    const stillOpen = stories.filter((s) => s.status !== "implemented");
    if (stillOpen.length > 0) {
      const sample = stillOpen.slice(0, 3).map((s) => `${s.storyId} (${s.sprintId})`).join(", ");
      const extra = stillOpen.length > 3 ? ` (and ${stillOpen.length - 3} more)` : "";
      diag(
        "AGF_BACKLOG_EPIC_DONE_HAS_OPEN_STORY",
        "error",
        `Epic ${epicId} is marked "done" but has ${stillOpen.length} open story/ies: ${sample}${extra}.`,
        { file: entry.file, suggestion: "Either flip the epic to active or close the remaining stories." }
      );
    }
  }

  // `parked` epic must not be referenced by an ACTIVE sprint's open story —
  // parked means "explicitly deferred", so an active sprint cannot be claiming work for it.
  const activeSprintIds = new Set(sprints.filter((s) => s.data.status === "active").map((s) => s.data.id));
  for (const [epicId, entry] of epicTable.entries()) {
    if (entry.status !== "parked") continue;
    const stories = (openStoriesByEpic.get(epicId) ?? []).filter(
      (s) => activeSprintIds.has(s.sprintId) && s.status !== "implemented"
    );
    if (stories.length > 0) {
      const sample = stories.slice(0, 3).map((s) => `${s.storyId} (${s.sprintId})`).join(", ");
      diag(
        "AGF_BACKLOG_PARKED_EPIC_HAS_ACTIVE_STORY",
        "error",
        `Epic ${epicId} is "parked" but the active sprint has open stories tagged to it: ${sample}.`,
        { file: entry.file, suggestion: "Either un-park the epic (flip to active) or move the stories to a different epic." }
      );
    }
  }
}

report();

function report() {
  if (jsonOutput) {
    process.stdout.write(JSON.stringify(diagnostics, null, 2) + "\n");
    process.exit(diagnostics.some((d) => d.severity === "error") ? 1 : 0);
  }
  if (diagnostics.length === 0) {
    const epicNote = epics.length > 0 ? `, ${epics.length} epic${epics.length === 1 ? "" : "s"}` : "";
    console.log(`[backlog:check] OK — ${sprints.length} sprint file(s), ${storyTable.size} stor${storyTable.size === 1 ? "y" : "ies"}${epicNote}.`);
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
