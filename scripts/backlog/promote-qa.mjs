#!/usr/bin/env node
// S93 QA-INTAKE-PROMOTE. Promotes QA tickets into stories on a pending
// sprint. See notes/qa-workflow-design.md §5 for the contract.
//
//   node scripts/backlog/promote-qa.mjs --into S093
//                                       [--min-severity major|critical]
//                                       [--dry-run]
//
// Behaviour:
//   1. Walk `backlog/qa-tickets/*.qa-ticket.json` (skip `archive/`).
//   2. Validate every ticket against `schemas/qa-ticket.schema.json`.
//      Any schema failure aborts the run (no partial writes).
//   3. Filter by `--min-severity` if supplied.
//   4. Build one story per ticket:
//        BUG-<slug>-<NNN>            for type='bug' | 'doc' | 'ux'
//        REGRESSION-<slug>-<NNN>     for type='regression-needed'
//      `<slug>` is title-derived (lowercase, alnum-only, max 24 chars).
//      `<NNN>` is the next free 3-digit slot per slug inside the target
//      sprint (avoids collisions across multiple promotion runs).
//   5. Build the story body:
//        - title: ticket.title
//        - summary: a fenced "QA repro" block (severity, filedAt, repro
//          steps, expected, actual, logs) so the sprint render carries
//          the full reproducer
//        - epic: ticket.epicHint when present
//   6. Wire dependsOn between paired tickets:
//        - regression-needed.regressionFor = QA-... bug id
//        - resulting bug story.dependsOn = [regression-test-story-id]
//   7. Append the stories to the target sprint's `stories[]` (must be
//      status='pending'). Write with 2-space indent.
//   8. Run `scripts/backlog/check.mjs` inline. On failure, restore the
//      original sprint JSON and exit non-zero.
//   9. `git mv` each promoted source file to
//      `backlog/qa-tickets/archive/<sprint-id>/<original>.json`.
//      `--dry-run` skips steps 7-9 and prints the plan instead.

import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const qaSchemaPath = resolve(repoRoot, "schemas/qa-ticket.schema.json");

const args = process.argv.slice(2);
const flags = {};
for (let i = 0; i < args.length; i += 1) {
  const token = args[i];
  if (!token.startsWith("--")) continue;
  const key = token.slice(2);
  if (key === "dry-run" || key === "skip-check") {
    flags[key] = true;
    continue;
  }
  flags[key] = args[i + 1];
  i += 1;
}

if (typeof flags.into !== "string" || flags.into.length === 0) {
  exit(2, "usage: promote-qa --into S0NN [--min-severity critical|major|minor|polish] [--dry-run] [--qa-dir <path>] [--sprints-dir <path>]");
}

// Test-time path overrides; default to the repo layout.
const sprintsDir = typeof flags["sprints-dir"] === "string"
  ? resolve(repoRoot, flags["sprints-dir"])
  : resolve(repoRoot, "backlog/sprints");
const qaTicketsDir = typeof flags["qa-dir"] === "string"
  ? resolve(repoRoot, flags["qa-dir"])
  : resolve(repoRoot, "backlog/qa-tickets");
const qaArchiveDir = resolve(qaTicketsDir, "archive");

const targetSprintId = flags.into;
const dryRun = flags["dry-run"] === true;
const severityOrder = { critical: 4, major: 3, minor: 2, polish: 1 };
const minSeverity = flags["min-severity"] ?? "polish";
if (!(minSeverity in severityOrder)) exit(2, `unknown --min-severity "${minSeverity}"`);
const minSeverityRank = severityOrder[minSeverity];

// Load + compile the QA-ticket schema.
let validateQaTicket;
try {
  const schema = JSON.parse(readFileSync(qaSchemaPath, "utf8"));
  const ajv = new Ajv({ allErrors: true, strict: false, strictSchema: false });
  validateQaTicket = ajv.compile(schema);
} catch (err) {
  exit(1, `could not load ${qaSchemaPath}: ${err.message}`);
}

// Walk the inbox.
let ticketFiles = [];
try {
  if (statSync(qaTicketsDir).isDirectory()) {
    ticketFiles = readdirSync(qaTicketsDir)
      .filter((name) => name.endsWith(".qa-ticket.json"))
      .map((name) => resolve(qaTicketsDir, name))
      .sort();
  }
} catch {
  ticketFiles = [];
}

const tickets = [];
for (const file of ticketFiles) {
  let data;
  try {
    data = JSON.parse(readFileSync(file, "utf8"));
  } catch (err) {
    exit(1, `JSON parse failed on ${file}: ${err.message}`);
  }
  if (!validateQaTicket(data)) {
    const reasons = (validateQaTicket.errors ?? []).map((e) => `${e.instancePath || "/"} ${e.message}`).join("; ");
    exit(1, `schema validation failed on ${file}: ${reasons}`);
  }
  tickets.push({ file, data });
}

if (tickets.length === 0) {
  console.error("[promote-qa] no tickets to promote — backlog/qa-tickets/ is empty.");
  process.exit(0);
}

// Apply severity filter.
const eligible = tickets.filter((t) => severityOrder[t.data.severity] >= minSeverityRank);
if (eligible.length === 0) {
  console.error(`[promote-qa] no tickets match --min-severity=${minSeverity}. ${tickets.length} skipped.`);
  process.exit(0);
}

// Load the target sprint.
const sprintPath = resolve(sprintsDir, `${targetSprintId}.sprint.json`);
let sprintData;
try {
  sprintData = JSON.parse(readFileSync(sprintPath, "utf8"));
} catch (err) {
  exit(1, `could not load target sprint ${targetSprintId}: ${err.message}`);
}
if (sprintData.status !== "pending") {
  exit(1, `target sprint ${targetSprintId} has status="${sprintData.status}"; promotion only allowed into pending sprints.`);
}
if (!Array.isArray(sprintData.stories)) sprintData.stories = [];

// Build existing-id tables.
const existingStoryIds = new Set(sprintData.stories.map((s) => s.id));
const usedSlugCounts = new Map(); // base story id → highest seen NNN
for (const s of sprintData.stories) {
  const m = /^(BUG|REGRESSION)-([a-z0-9-]+)-(\d{3})$/.exec(s.id ?? "");
  if (m === null) continue;
  const base = `${m[1]}-${m[2]}`;
  const seen = Number(m[3]);
  if (!usedSlugCounts.has(base) || seen > usedSlugCounts.get(base)) {
    usedSlugCounts.set(base, seen);
  }
}

// Generate story shells (id + slug only; bodies built after).
const ticketIdToStoryId = new Map();
const plan = [];
for (const t of eligible) {
  const kind = t.data.type === "regression-needed" ? "REGRESSION" : "BUG";
  const slug = slugify(t.data.title).slice(0, 24).replace(/-+$/, "");
  const base = `${kind}-${slug}`;
  const nextN = (usedSlugCounts.get(base) ?? 0) + 1;
  usedSlugCounts.set(base, nextN);
  const storyId = `${base}-${nextN.toString().padStart(3, "0")}`;
  if (existingStoryIds.has(storyId)) {
    exit(1, `generated story id ${storyId} already exists in ${targetSprintId} — slug collision; resolve by editing the source ticket title.`);
  }
  existingStoryIds.add(storyId);
  ticketIdToStoryId.set(t.data.id, storyId);
  plan.push({ ticket: t, storyId });
}

// Wire dependsOn links. A bug whose id appears in another ticket's
// `regressionFor` field gets `dependsOn = [regression-test-story-id]`
// so the bug fix can't be marked implemented until the regression
// test exists.
const dependsByStoryId = new Map();
for (const t of eligible) {
  if (t.data.type !== "regression-needed") continue;
  const target = t.data.regressionFor;
  if (target === undefined) continue;
  const bugStoryId = ticketIdToStoryId.get(target);
  const regressionStoryId = ticketIdToStoryId.get(t.data.id);
  if (bugStoryId === undefined || regressionStoryId === undefined) continue;
  const existing = dependsByStoryId.get(bugStoryId) ?? [];
  if (!existing.includes(regressionStoryId)) existing.push(regressionStoryId);
  dependsByStoryId.set(bugStoryId, existing);
}

// Materialise full story bodies.
const newStories = plan.map(({ ticket, storyId }) => {
  const story = {
    id: storyId,
    title: ticket.data.title,
    status: "pending",
    summary: buildSummary(ticket.data)
  };
  if (ticket.data.epicHint !== undefined) story.epic = ticket.data.epicHint;
  const deps = dependsByStoryId.get(storyId);
  if (deps !== undefined && deps.length > 0) story.dependsOn = deps;
  return story;
});

// Dry-run report.
if (dryRun) {
  console.log(`[promote-qa] DRY RUN — would promote ${eligible.length} ticket(s) into ${targetSprintId}:`);
  for (const story of newStories) {
    console.log(`  ${story.id}  ←  ${plan.find((p) => p.storyId === story.id)?.ticket.data.id}`);
    if (story.dependsOn !== undefined) console.log(`    dependsOn: ${story.dependsOn.join(", ")}`);
  }
  console.log(`[promote-qa] no files modified. Re-run without --dry-run to apply.`);
  process.exit(0);
}

// Apply: write sprint, run check, archive sources.
const sprintBackup = readFileSync(sprintPath, "utf8");
sprintData.stories.push(...newStories);
writeFileSync(sprintPath, JSON.stringify(sprintData, null, 2) + "\n", "utf8");

if (flags["skip-check"] !== true) {
  const check = spawnSync("node", [resolve(repoRoot, "scripts/backlog/check.mjs"), "--json"], {
    cwd: repoRoot,
    encoding: "utf8"
  });
  const checkPayload = check.stdout.trim().length > 0 ? safeParse(check.stdout) : [];
  const errors = Array.isArray(checkPayload) ? checkPayload.filter((d) => d.severity === "error") : [];
  if (check.status !== 0 || errors.length > 0) {
    writeFileSync(sprintPath, sprintBackup, "utf8");
    console.error("[promote-qa] backlog:check failed after promotion — sprint restored:");
    for (const e of errors) console.error(`  ${e.code}: ${e.message}`);
    if (errors.length === 0 && check.stderr.length > 0) console.error(check.stderr);
    process.exit(1);
  }
}

// Archive the source ticket files.
const archiveTarget = resolve(qaArchiveDir, targetSprintId);
mkdirSync(archiveTarget, { recursive: true });
for (const { ticket } of plan) {
  const dest = join(archiveTarget, `${ticket.data.id}.qa-ticket.json`);
  try {
    renameSync(ticket.file, dest);
  } catch (err) {
    console.error(`[promote-qa] WARN — failed to archive ${ticket.file}: ${err.message}`);
  }
}

console.log(`[promote-qa] promoted ${newStories.length} ticket(s) into ${targetSprintId}:`);
for (const story of newStories) console.log(`  ${story.id}`);
console.log(`[promote-qa] archived sources → ${archiveTarget.replace(repoRoot + "/", "")}/`);

function slugify(text) {
  // Story id pattern from schemas/backlog/sprint.schema.json:
  //   ^[A-Z][A-Z0-9-]*$
  // So we emit uppercase letters / digits / hyphens, no leading hyphen.
  return String(text)
    .toUpperCase()
    .normalize("NFKD")
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
}

function buildSummary(t) {
  const lines = [];
  if (typeof t.summary === "string" && t.summary.trim().length > 0) {
    lines.push(t.summary.trim());
    lines.push("");
  }
  const meta = [`severity: ${t.severity}`, `type: ${t.type}`, `filed: ${t.filedAt}`];
  if (t.foundInPr !== undefined) meta.push(`PR #${t.foundInPr}`);
  if (t.foundInSprint !== undefined) meta.push(`under sprint ${t.foundInSprint}`);
  if (t.regressionFor !== undefined) meta.push(`regression-for ${t.regressionFor}`);
  lines.push("QA repro");
  lines.push("--------");
  lines.push(meta.join(" · "));
  lines.push("");
  lines.push("Steps:");
  for (let i = 0; i < t.repro.length; i += 1) lines.push(`  ${i + 1}. ${t.repro[i]}`);
  if (typeof t.expected === "string" && t.expected.length > 0) lines.push(`Expected: ${t.expected}`);
  if (typeof t.actual === "string" && t.actual.length > 0) lines.push(`Actual:   ${t.actual}`);
  if (typeof t.logs === "string" && t.logs.length > 0) {
    lines.push("");
    lines.push("Logs:");
    lines.push(t.logs);
  }
  if (typeof t.screenshot === "string" && t.screenshot.length > 0) lines.push(`Screenshot: ${t.screenshot}`);
  if (typeof t.playtest === "string" && t.playtest.length > 0) lines.push(`Playtest:   ${t.playtest}`);
  lines.push("");
  lines.push(`Source ticket: ${t.id}`);
  return lines.join("\n");
}

function safeParse(s) {
  try { return JSON.parse(s); } catch { return null; }
}

function exit(code, message) {
  console.error(`[promote-qa] ${message}`);
  process.exit(code);
}
