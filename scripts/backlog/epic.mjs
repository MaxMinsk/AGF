#!/usr/bin/env node
// S80 BACKLOG-EPIC-CLI. `npm run backlog:epic <id>` — open one epic and
// walk every sprint that holds a story tagged to it. Prints epic header
// + done criteria + dependency status + the per-sprint story breakdown.
//
// `--json` switches to machine output.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const sprintsDir = resolve(repoRoot, "backlog/sprints");
const epicsDir = resolve(repoRoot, "backlog/epics");

const rest = process.argv.slice(2);
const jsonOutput = rest.includes("--json");
const positional = rest.filter((a) => !a.startsWith("--"));
const epicId = positional[0];
if (epicId === undefined) {
  process.stderr.write("[backlog:epic] usage: backlog:epic <EPIC-ID> [--json]\n");
  process.exit(2);
}

const epics = loadEpics();
const sprints = loadSprints();
const epic = epics.find((e) => e.id === epicId);
if (epic === undefined) {
  process.stderr.write(`[backlog:epic] no epic with id "${epicId}"\n`);
  process.exit(1);
}

const storiesBySprint = new Map();
for (const sprint of sprints) {
  for (const story of sprint.stories ?? []) {
    if (story.epic !== epicId) continue;
    if (!storiesBySprint.has(sprint.id)) storiesBySprint.set(sprint.id, []);
    storiesBySprint.get(sprint.id).push({ ...story, sprintStatus: sprint.status });
  }
}

const counts = { implemented: 0, open: 0, deferred: 0, total: 0 };
for (const stories of storiesBySprint.values()) {
  for (const s of stories) {
    counts.total += 1;
    if (s.status === "implemented") counts.implemented += 1;
    else if (s.status === "deferred") counts.deferred += 1;
    else counts.open += 1;
  }
}

const depStatus = (epic.dependsOn ?? []).map((id) => {
  const dep = epics.find((e) => e.id === id);
  return { id, status: dep?.status ?? "missing" };
});

if (jsonOutput) {
  process.stdout.write(
    JSON.stringify(
      { epic, dependencyStatus: depStatus, counts, storiesBySprint: Object.fromEntries(storiesBySprint) },
      null,
      2
    ) + "\n"
  );
  process.exit(0);
}

const lines = [];
lines.push(`${epic.id} — ${epic.title}`);
lines.push(`  status: ${epic.status}   category: ${epic.category}` + (epic.targetMilestone ? `   milestone: ${epic.targetMilestone}` : ""));
if (epic.sourceDoc) lines.push(`  source: ${epic.sourceDoc}`);
lines.push("");
lines.push(`  summary: ${epic.summary}`);
lines.push("");
if (depStatus.length > 0) {
  lines.push(`  dependencies:`);
  for (const d of depStatus) lines.push(`    - ${d.id} (${d.status})`);
  lines.push("");
}
if (epic.doneCriteria && epic.doneCriteria.length > 0) {
  lines.push(`  done criteria:`);
  for (const c of epic.doneCriteria) lines.push(`    - ${c}`);
  lines.push("");
}
lines.push(
  `  story rollup: ${counts.implemented} implemented, ${counts.open} open, ${counts.deferred} deferred, ${counts.total} total`
);
lines.push("");

if (storiesBySprint.size === 0) {
  lines.push(`  (no stories reference this epic yet)`);
} else {
  for (const sprintId of [...storiesBySprint.keys()].sort()) {
    const stories = storiesBySprint.get(sprintId);
    const sprintStatus = stories[0]?.sprintStatus ?? "?";
    lines.push(`  ${sprintId} (${sprintStatus}):`);
    for (const s of stories) {
      const icon = s.status === "implemented" ? "✓" : s.status === "deferred" ? "—" : s.status === "in_progress" ? "▸" : "○";
      lines.push(`    ${icon} ${s.id} — ${s.title}`);
    }
  }
}

process.stdout.write(lines.join("\n") + "\n");

// --- helpers ---

function loadEpics() {
  let names = [];
  try {
    if (statSync(epicsDir).isDirectory()) {
      names = readdirSync(epicsDir).filter((n) => n.endsWith(".epic.json")).sort();
    }
  } catch { names = []; }
  return names.map((n) => JSON.parse(readFileSync(resolve(epicsDir, n), "utf8")));
}

function loadSprints() {
  let names = [];
  try {
    if (statSync(sprintsDir).isDirectory()) {
      names = readdirSync(sprintsDir).filter((n) => n.endsWith(".sprint.json")).sort();
    }
  } catch { names = []; }
  return names.map((n) => JSON.parse(readFileSync(resolve(sprintsDir, n), "utf8")));
}
