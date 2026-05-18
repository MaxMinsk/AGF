#!/usr/bin/env node
// S80 BACKLOG-EPIC-STORY-BACKFILL. Sweep imported sprint files and
// assign a best-effort `story.epic` for stories whose title / summary
// mentions a known epic id. Never overwrites an existing `epic` field
// (so stories that S078/S079/S080 tagged by hand stay untouched).
//
// Heuristic, longest-prefix-wins:
//   1. Build a list of known epic ids (from `backlog/epics/*.epic.json`).
//   2. For each story, search the title + summary for word-boundary
//      occurrences of an epic id. Prefer the longest match (`M17-AUTO-BATCH`
//      beats `M17`).
//   3. If found and the story has no `epic` set, write it.
//   4. After the sweep: run `backlog:check` and assert no
//      AGF_BACKLOG_EPIC_UNKNOWN remains (it should already be empty —
//      we never add an unknown id).
//
// Modes:
//   node scripts/backlog/backfill-epic-refs.mjs            # write
//   node scripts/backlog/backfill-epic-refs.mjs --dry-run  # report only

import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const sprintsDir = resolve(repoRoot, "backlog/sprints");
const epicsDir = resolve(repoRoot, "backlog/epics");
const dryRun = process.argv.includes("--dry-run");

const epicIds = (() => {
  let names = [];
  try {
    if (statSync(epicsDir).isDirectory()) {
      names = readdirSync(epicsDir).filter((n) => n.endsWith(".epic.json"));
    }
  } catch { names = []; }
  return names.map((n) => JSON.parse(readFileSync(resolve(epicsDir, n), "utf8")).id);
})();

if (epicIds.length === 0) {
  process.stderr.write("[backlog:backfill-epic-refs] no epics found — nothing to backfill against.\n");
  process.exit(1);
}

// Sort longest first so `M17-BATCH-DEFAULT-ON` matches before plain `M17`.
const sortedEpicIds = [...epicIds].sort((a, b) => b.length - a.length);

// Hand-curated prefix table: when a story id starts with `<prefix>-`, route
// it to the corresponding epic. Filled from the actual prefix vocabulary
// used across S0–S77 (grep `^([A-Z]+)-` over imported sprint stories).
// Only mappings to KNOWN epic ids are kept; the rest are dropped at startup.
const PREFIX_TO_EPIC_RAW = {
  "WEBGPU": "M21",                       // WebGPU port lives under the renderer→ECS epic
  "ASSET": "M25",                        // asset pipeline epic
  "RENDER": "M17",                       // batching / pool refactor
  "BACKLOG": "AGF-BACKLOG-ENGINE",       // the engine we're building
  "BEACON": "BEACON-WORLD-SAMPLE",       // beacon-world sample
  "POLISH": "EXAMPLES-SHADOWS-BENCH-BENCHMARK-PROJECT",
  "BENCH": "EXAMPLES-SHADOWS-BENCH-BENCHMARK-PROJECT",
  "DOCTOR": "E-56-ENGINE-DOCTOR-PROJECTDIR-SCORECARD",
  "MIGRATE": "AGF-BACKLOG-ENGINE",
  "OSS": "REPO-HYGIENE-CI",              // open-source readiness work absorbed by hygiene epic
  "REFLECTION": "M26",                   // visual fidelity / reflection probes
  "POST": "M26",                         // post-FX
  "MATERIAL": "MATERIAL-AND-SHADER-SYSTEM",
  "RENDERER": "THREE-JS-RENDERER",
  "SHADOWS": "M21",
  "ADR": "AGENT-RELIABILITY-INFRASTRUCTURE",
  "HYGIENE": "REPO-HYGIENE-CI",
  "GROUND": "M26",
  "GROUNDED": "M26",
  "GPU": "M21",
  "PERF": "M22",
  "PERFTEST": "M22",
  "POSTPROCESS": "M26",
  "RUNTIME": "M11",                      // resource lifecycle / runtime
  "CI": "AGENT-RELIABILITY-INFRASTRUCTURE",
  "DEVBRIDGE": "M15",                    // engine dev server
  "AGENT": "AGENT-CLI",
  "DOCS": "M4-DOCS-SCHEMA-DRIVEN-DOCS-GENERATION",
  "ECS": "M22",
  "IDX": "M22",
  "CMD": "M22",
  "SYS": "M22",
  "PROTOCOL": "PERSISTENT-WORLD-BACKEND-CONTRACTS",
  "SHADOW": "M21",
  "SCENE": "SCENE-PROJECT-SCHEMAS",
  "BATCH": "M17"
};
const epicIdSet = new Set(epicIds);
const prefixToEpic = new Map();
for (const [prefix, epicId] of Object.entries(PREFIX_TO_EPIC_RAW)) {
  if (epicIdSet.has(epicId)) prefixToEpic.set(prefix, epicId);
}

const sprintFiles = readdirSync(sprintsDir).filter((n) => n.endsWith(".sprint.json")).sort();

let totalStories = 0;
let alreadyTagged = 0;
let newlyTagged = 0;
let untagged = 0;
const tagSamples = [];

for (const name of sprintFiles) {
  const file = resolve(sprintsDir, name);
  const data = JSON.parse(readFileSync(file, "utf8"));
  let changed = false;
  for (const story of data.stories ?? []) {
    totalStories += 1;
    if (typeof story.epic === "string" && story.epic.length > 0) {
      alreadyTagged += 1;
      continue;
    }
    const haystack = `${story.title ?? ""} ${story.summary ?? ""}`;
    let match = matchEpic(haystack, sortedEpicIds);
    if (match === undefined) {
      // Fallback: route by the leading bolded id in the title or by the
      // story-id prefix. The legacy imported stories carry their original
      // identifier inside the title as `**WEBGPU-renderer-import-boundary**`
      // because their `story.id` is a synthesized `S<NNN>-<n>` slot.
      const fromTitle = /\*\*([A-Z]+)[-_]/.exec(story.title ?? "")?.[1];
      const fromId = /^([A-Z]+)-/.exec(story.id ?? "")?.[1];
      const prefix = fromTitle ?? fromId;
      if (prefix !== undefined && prefixToEpic.has(prefix)) {
        match = prefixToEpic.get(prefix);
      }
    }
    if (match !== undefined) {
      story.epic = match;
      changed = true;
      newlyTagged += 1;
      if (tagSamples.length < 12) tagSamples.push(`  ${story.id} → ${match}`);
    } else {
      untagged += 1;
    }
  }
  if (changed && !dryRun) {
    writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
  }
}

process.stdout.write(`Sampled mappings:\n${tagSamples.join("\n")}\n\n`);
process.stdout.write(
  `[backlog:backfill-epic-refs] ${totalStories} stories total · ${alreadyTagged} already tagged · ${newlyTagged} ${dryRun ? "would tag" : "newly tagged"} · ${untagged} untagged.\n`
);

if (!dryRun) {
  const check = spawnSync("node", [resolve(repoRoot, "scripts/backlog/check.mjs")], { encoding: "utf8" });
  process.stdout.write(check.stdout);
  process.stderr.write(check.stderr);
  if (check.status !== 0) {
    process.stderr.write("[backlog:backfill-epic-refs] backlog:check FAILED after backfill.\n");
    process.exit(1);
  }
}

function matchEpic(haystack, idsLongestFirst) {
  // Case-insensitive word-boundary match. `\b` treats a digit-followed-by-hyphen
  // as a boundary, so the epic id `M17` correctly matches against a story title
  // like "M17-batch-default-on" or "M17 adapter — per-instance color". Longest
  // ids are tried first so `M17-AUTO-BATCH` beats `M17` when both are present.
  // The lowercase haystack covers titles like "m17-tween" / "webgpu-spike"
  // produced by the legacy migrator.
  for (const id of idsLongestFirst) {
    const re = new RegExp(`\\b${escapeRegExp(id)}\\b`, "i");
    if (re.test(haystack)) return id;
  }
  return undefined;
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
