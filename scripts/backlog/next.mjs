#!/usr/bin/env node
// S79 BACKLOG-NEXT. Picks the first unblocked story in the active sprint:
//
//   - status is `pending` (in_progress stories are owned by someone already)
//   - every entry in `dependsOn[]` resolves to a story whose status is
//     `implemented` (anywhere across the sprint files — cross-sprint
//     dependencies are allowed)
//   - story id has no other consumer that already claimed it
//     (heuristic: prefer the earliest such story in declaration order)
//
// Output:
//   - default mode prints the story id to stdout + a 1-line summary to
//     stderr; exits 0;
//   - `--json` mode prints the full story object to stdout as JSON;
//   - exits 1 with no stdout when no story is ready (sprint blocked or
//     done).

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const sprintsDir = resolve(repoRoot, "backlog/sprints");
const jsonOutput = process.argv.includes("--json");

const sprints = (() => {
  try {
    return readdirSync(sprintsDir)
      .filter((n) => n.endsWith(".sprint.json"))
      .sort()
      .map((name) => JSON.parse(readFileSync(resolve(sprintsDir, name), "utf8")));
  } catch {
    return [];
  }
})();

const active = sprints.find((s) => s.status === "active");
if (active === undefined) {
  if (jsonOutput) process.stdout.write("null\n");
  else process.stderr.write("[backlog:next] no active sprint.\n");
  process.exit(1);
}

const storyById = new Map();
for (const sprint of sprints) {
  for (const story of sprint.stories ?? []) {
    storyById.set(story.id, { story, sprintId: sprint.id });
  }
}

function ready(story) {
  if (story.status !== "pending") return false;
  for (const dep of story.dependsOn ?? []) {
    const target = storyById.get(dep);
    if (target === undefined) return false; // unresolved → block (also flagged by backlog:check)
    if (target.story.status !== "implemented") return false;
  }
  return true;
}

const candidate = (active.stories ?? []).find(ready);
if (candidate === undefined) {
  if (jsonOutput) process.stdout.write("null\n");
  else {
    const open = (active.stories ?? []).filter((s) => s.status === "pending" || s.status === "in_progress");
    if (open.length === 0) {
      process.stderr.write(`[backlog:next] ${active.id} has no pending or in_progress stories — archive it?\n`);
    } else {
      process.stderr.write(`[backlog:next] ${active.id}: ${open.length} open stor${open.length === 1 ? "y is" : "ies are"} blocked by unfinished dependencies.\n`);
    }
  }
  process.exit(1);
}

if (jsonOutput) {
  process.stdout.write(JSON.stringify(candidate, null, 2) + "\n");
} else {
  process.stdout.write(`${candidate.id}\n`);
  process.stderr.write(`[backlog:next] ${active.id} → ${candidate.id} (${candidate.title})\n`);
}
process.exit(0);
