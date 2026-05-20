#!/usr/bin/env node
// S97 GAME-DESIGN-PROPOSE-PROMOTE. Promotes story-proposal tickets into
// stories on a pending or active sprint. Companion to promote-qa.mjs.
//
//   node scripts/backlog/promote-proposed.mjs --into S097
//                                             [--min-priority should|must]
//                                             [--dry-run]
//                                             [--proposed-dir <path>]
//                                             [--sprints-dir <path>]
//                                             [--skip-check]
//
// Behaviour:
//   1. Walk `backlog/proposed-stories/*.story-proposal.json` (skip `archive/`).
//   2. Validate every proposal against `schemas/proposed-story.schema.json`.
//   3. Filter by `--min-priority` (could < should < must).
//   4. Build one story per proposal:
//        FEAT-<slug>-<NNN>     for kind='feature' | 'mechanic'
//        BAL-<slug>-<NNN>      for kind='balance'
//        CONTENT-<slug>-<NNN>  for kind='content'
//      `<slug>` is title-derived (uppercase alnum + hyphens, max 24 chars).
//   5. Build the story body:
//        - title: proposal.title
//        - summary: proposal.intent + proposal.rationale (if present) +
//          acceptanceHints rendered as a bulleted "Acceptance hints" list
//        - epic: proposal.epic when present
//   6. Append to the target sprint's `stories[]`. Sprint must be
//      pending or active.
//   7. Run `scripts/backlog/check.mjs` inline. On failure, restore the
//      original sprint JSON and exit non-zero.
//   8. `renameSync` each promoted source file to
//      `backlog/proposed-stories/archive/<sprint-id>/<original>.json`.
//      `--dry-run` skips steps 6-8 and prints the plan instead.

import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const schemaPath = resolve(repoRoot, "schemas/proposed-story.schema.json");

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
  exit(2, "usage: promote-proposed --into S0NN [--min-priority could|should|must] [--dry-run] [--proposed-dir <path>] [--sprints-dir <path>] [--skip-check]");
}

const sprintsDir = typeof flags["sprints-dir"] === "string"
  ? resolve(repoRoot, flags["sprints-dir"])
  : resolve(repoRoot, "backlog/sprints");
const proposedDir = typeof flags["proposed-dir"] === "string"
  ? resolve(repoRoot, flags["proposed-dir"])
  : resolve(repoRoot, "backlog/proposed-stories");
const archiveDir = resolve(proposedDir, "archive");

const targetSprintId = flags.into;
const dryRun = flags["dry-run"] === true;
const priorityOrder = { must: 3, should: 2, could: 1 };
const minPriority = flags["min-priority"] ?? "could";
if (!(minPriority in priorityOrder)) exit(2, `unknown --min-priority "${minPriority}"`);
const minPriorityRank = priorityOrder[minPriority];

// Load + compile the schema.
let validate;
try {
  const schema = JSON.parse(readFileSync(schemaPath, "utf8"));
  const ajv = new Ajv({ allErrors: true, strict: false, strictSchema: false });
  validate = ajv.compile(schema);
} catch (err) {
  exit(1, `could not load ${schemaPath}: ${err.message}`);
}

// Walk the inbox.
let proposalFiles = [];
try {
  if (statSync(proposedDir).isDirectory()) {
    proposalFiles = readdirSync(proposedDir)
      .filter((name) => name.endsWith(".story-proposal.json"))
      .map((name) => resolve(proposedDir, name))
      .sort();
  }
} catch {
  proposalFiles = [];
}

const proposals = [];
for (const file of proposalFiles) {
  let data;
  try {
    data = JSON.parse(readFileSync(file, "utf8"));
  } catch (err) {
    exit(1, `JSON parse failed on ${file}: ${err.message}`);
  }
  if (!validate(data)) {
    const reasons = (validate.errors ?? []).map((e) => `${e.instancePath || "/"} ${e.message}`).join("; ");
    exit(1, `schema validation failed on ${file}: ${reasons}`);
  }
  proposals.push({ file, data });
}

if (proposals.length === 0) {
  console.error("[promote-proposed] no proposals to promote — inbox is empty.");
  process.exit(0);
}

const eligible = proposals.filter((p) => priorityOrder[p.data.priority] >= minPriorityRank);
if (eligible.length === 0) {
  console.error(`[promote-proposed] no proposals match --min-priority=${minPriority}. ${proposals.length} skipped.`);
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
if (sprintData.status !== "pending" && sprintData.status !== "active") {
  exit(1, `target sprint ${targetSprintId} has status="${sprintData.status}"; promotion only allowed into pending or active sprints.`);
}
if (!Array.isArray(sprintData.stories)) sprintData.stories = [];

const existingStoryIds = new Set(sprintData.stories.map((s) => s.id));
const usedSlugCounts = new Map();
for (const s of sprintData.stories) {
  const m = /^(FEAT|BAL|CONTENT)-([A-Z0-9-]+)-(\d{3})$/.exec(s.id ?? "");
  if (m === null) continue;
  const base = `${m[1]}-${m[2]}`;
  const seen = Number(m[3]);
  if (!usedSlugCounts.has(base) || seen > usedSlugCounts.get(base)) usedSlugCounts.set(base, seen);
}

const plan = [];
for (const p of eligible) {
  const kindPrefix = p.data.kind === "balance" ? "BAL"
    : p.data.kind === "content" ? "CONTENT"
    : "FEAT"; // feature + mechanic both map to FEAT (most stories are "build the thing")
  const slug = slugify(p.data.title).slice(0, 24).replace(/-+$/, "");
  const base = `${kindPrefix}-${slug}`;
  const nextN = (usedSlugCounts.get(base) ?? 0) + 1;
  usedSlugCounts.set(base, nextN);
  const storyId = `${base}-${nextN.toString().padStart(3, "0")}`;
  if (existingStoryIds.has(storyId)) {
    exit(1, `generated story id ${storyId} already exists in ${targetSprintId} — slug collision; edit the source proposal title.`);
  }
  existingStoryIds.add(storyId);
  plan.push({ proposal: p, storyId });
}

const newStories = plan.map(({ proposal, storyId }) => {
  const story = {
    id: storyId,
    title: proposal.data.title,
    status: "pending",
    summary: buildSummary(proposal.data)
  };
  if (proposal.data.epic !== undefined) story.epic = proposal.data.epic;
  return story;
});

if (dryRun) {
  console.log(`[promote-proposed] DRY RUN — would promote ${eligible.length} proposal(s) into ${targetSprintId}:`);
  for (const story of newStories) {
    console.log(`  ${story.id}  ←  ${plan.find((p) => p.storyId === story.id)?.proposal.data.id}`);
  }
  console.log(`[promote-proposed] no files modified. Re-run without --dry-run to apply.`);
  process.exit(0);
}

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
    console.error("[promote-proposed] backlog:check failed after promotion — sprint restored:");
    for (const e of errors) console.error(`  ${e.code}: ${e.message}`);
    if (errors.length === 0 && check.stderr.length > 0) console.error(check.stderr);
    process.exit(1);
  }
}

const archiveTarget = resolve(archiveDir, targetSprintId);
mkdirSync(archiveTarget, { recursive: true });
for (const { proposal } of plan) {
  const dest = join(archiveTarget, `${proposal.data.id}.story-proposal.json`);
  try {
    renameSync(proposal.file, dest);
  } catch (err) {
    console.error(`[promote-proposed] WARN — failed to archive ${proposal.file}: ${err.message}`);
  }
}

console.log(`[promote-proposed] promoted ${newStories.length} proposal(s) into ${targetSprintId}:`);
for (const story of newStories) console.log(`  ${story.id}`);
console.log(`[promote-proposed] archived sources → ${archiveTarget.replace(repoRoot + "/", "")}/`);

function slugify(text) {
  return String(text)
    .toUpperCase()
    .normalize("NFKD")
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
}

function buildSummary(p) {
  const lines = [];
  lines.push(p.intent.trim());
  if (typeof p.rationale === "string" && p.rationale.trim().length > 0) {
    lines.push("");
    lines.push("Rationale:");
    lines.push(p.rationale.trim());
  }
  if (Array.isArray(p.acceptanceHints) && p.acceptanceHints.length > 0) {
    lines.push("");
    lines.push("Acceptance hints (game-design proposal — dev to tighten into verification[]):");
    for (const hint of p.acceptanceHints) lines.push(`  - ${hint}`);
  }
  lines.push("");
  lines.push(`Source proposal: ${p.id} (kind=${p.kind}, priority=${p.priority})`);
  return lines.join("\n");
}

function safeParse(s) {
  try { return JSON.parse(s); } catch { return null; }
}

function exit(code, message) {
  console.error(`[promote-proposed] ${message}`);
  process.exit(code);
}
