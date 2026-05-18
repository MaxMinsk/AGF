#!/usr/bin/env node
// S80 BACKLOG-EPIC-CLI. `npm run backlog:epics` — list every epic with a
// rollup of stories tagged to it across all sprints.
//
// Default output is a human-friendly table sorted by status (active first).
// `--json` switches to machine output for agents.
// `--status <state>` filters by epic status (planned | active | done | parked).
// `--category <cat>` filters by epic category (engine | sample-game | infra | research).
// `--milestone <label>` filters by targetMilestone (free-text match).

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const sprintsDir = resolve(repoRoot, "backlog/sprints");
const epicsDir = resolve(repoRoot, "backlog/epics");

const args = process.argv.slice(2);
let jsonOutput = false;
const filter = { status: undefined, category: undefined, milestone: undefined };
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--json") jsonOutput = true;
  else if (a === "--status") filter.status = args[++i];
  else if (a === "--category") filter.category = args[++i];
  else if (a === "--milestone") filter.milestone = args[++i];
}

const epics = loadEpics();
const sprints = loadSprints();
const rollup = buildRollup(sprints);

const rows = epics
  .filter((e) => filter.status === undefined || e.status === filter.status)
  .filter((e) => filter.category === undefined || e.category === filter.category)
  .filter((e) => filter.milestone === undefined || e.targetMilestone === filter.milestone);

const statusOrder = { active: 0, planned: 1, done: 2, parked: 3 };
rows.sort((a, b) => {
  const sa = statusOrder[a.status] ?? 9;
  const sb = statusOrder[b.status] ?? 9;
  if (sa !== sb) return sa - sb;
  return a.id.localeCompare(b.id);
});

if (jsonOutput) {
  const out = rows.map((e) => ({
    ...e,
    rollup: rollup.get(e.id) ?? { implemented: 0, open: 0, deferred: 0, total: 0, sprints: [] }
  }));
  // Replace Set with array for JSON serialization.
  for (const o of out) o.rollup = { ...o.rollup, sprints: Array.from(o.rollup.sprints ?? []).sort() };
  process.stdout.write(JSON.stringify(out, null, 2) + "\n");
  process.exit(0);
}

if (rows.length === 0) {
  process.stderr.write("[backlog:epics] no epics match the filter.\n");
  process.exit(rows.length === 0 ? 1 : 0);
}

const widths = { id: 4, status: 6, cat: 8 };
for (const e of rows) {
  widths.id = Math.max(widths.id, e.id.length);
  widths.status = Math.max(widths.status, e.status.length);
  widths.cat = Math.max(widths.cat, e.category.length);
}

function pad(s, w) { return s + " ".repeat(Math.max(0, w - s.length)); }

process.stdout.write(
  `${pad("ID", widths.id)}  ${pad("STATUS", widths.status)}  ${pad("CATEGORY", widths.cat)}  IMPL / OPEN / TOT  TITLE\n`
);
for (const e of rows) {
  const r = rollup.get(e.id) ?? { implemented: 0, open: 0, total: 0 };
  const counts = `${String(r.implemented).padStart(4)} / ${String(r.open).padStart(4)} / ${String(r.total).padStart(3)}`;
  process.stdout.write(
    `${pad(e.id, widths.id)}  ${pad(e.status, widths.status)}  ${pad(e.category, widths.cat)}  ${counts}  ${e.title}\n`
  );
}

process.stderr.write(`\n[backlog:epics] ${rows.length} epic${rows.length === 1 ? "" : "s"} listed.\n`);

// --- helpers (shared shape with render.mjs intentionally; small enough to inline) ---

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

function buildRollup(sprints) {
  const byEpic = new Map();
  for (const sprint of sprints) {
    for (const story of sprint.stories ?? []) {
      const epicId = story.epic;
      if (typeof epicId !== "string" || epicId.length === 0) continue;
      if (!byEpic.has(epicId)) {
        byEpic.set(epicId, { implemented: 0, open: 0, deferred: 0, total: 0, sprints: new Set() });
      }
      const entry = byEpic.get(epicId);
      entry.total += 1;
      entry.sprints.add(sprint.id);
      if (story.status === "implemented") entry.implemented += 1;
      else if (story.status === "deferred") entry.deferred += 1;
      else entry.open += 1;
    }
  }
  return byEpic;
}
