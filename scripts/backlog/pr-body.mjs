#!/usr/bin/env node
// S79 BACKLOG-PR-BODY. Render a Markdown PR body for one sprint to stdout
// so `gh pr create --body-file -` can pipe directly without hand editing:
//
//   node scripts/backlog/pr-body.mjs                # active sprint
//   node scripts/backlog/pr-body.mjs --sprint S079  # specific sprint
//   node scripts/backlog/pr-body.mjs --title "..."  # override H1
//
// Sections written:
//   # <sprint title>
//   Status line (active or archived dates)
//   ## Summary
//   ## Implemented stories     — bullet per implemented story + verification + deliverables
//   ## Deferred                — bullet per deferred story + reason
//   ## Follow-ups              — verbatim from sprint.followUps[]
//   ## Out of scope            — verbatim from sprint.outOfScope[]
//   ## Notes                   — verbatim from sprint.notes[]
//
// Empty sections are skipped so the PR body stays tight.

import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const sprintsDir = resolve(repoRoot, "backlog/sprints");

const args = process.argv.slice(2);
let sprintFlag;
let titleOverride;
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--sprint") sprintFlag = args[++i];
  else if (a === "--title") titleOverride = args[++i];
}

const sprints = readdirSync(sprintsDir)
  .filter((n) => n.endsWith(".sprint.json"))
  .sort()
  .map((name) => JSON.parse(readFileSync(resolve(sprintsDir, name), "utf8")));

const target = sprintFlag
  ? sprints.find((s) => s.id === sprintFlag)
  : sprints.find((s) => s.status === "active") ?? sprints.findLast?.((s) => s.status === "archived");

if (target === undefined) {
  process.stderr.write(
    sprintFlag
      ? `[backlog:pr-body] no sprint with id "${sprintFlag}".\n`
      : `[backlog:pr-body] no active or archived sprint found.\n`
  );
  process.exit(1);
}

const lines = [];
const title = titleOverride ?? `${target.id} — ${target.title}`;
lines.push(`# ${title}`);
lines.push("");

const statusBits = [`Status: **${target.status}**`];
if (target.startedAt) statusBits.push(`started ${target.startedAt}`);
if (target.archivedAt) statusBits.push(`archived ${target.archivedAt}`);
lines.push(statusBits.join(" · ") + ".");
lines.push("");

const stories = target.stories ?? [];
const implemented = stories.filter((s) => s.status === "implemented");
const deferred = stories.filter((s) => s.status === "deferred");
const pending = stories.filter((s) => s.status === "pending" || s.status === "in_progress");

lines.push("## Summary");
lines.push("");
if (implemented.length === 0 && deferred.length === 0) {
  lines.push("_No completed stories yet. This sprint is still in flight._");
} else {
  const parts = [];
  if (implemented.length > 0) parts.push(`${implemented.length} implemented`);
  if (deferred.length > 0) parts.push(`${deferred.length} deferred`);
  if (pending.length > 0) parts.push(`${pending.length} still open`);
  lines.push(`${target.id}: ${parts.join(", ")}.`);
}
lines.push("");

if (implemented.length > 0) {
  lines.push("## Implemented stories");
  lines.push("");
  for (const story of implemented) {
    lines.push(`### ${story.id} — ${story.title}`);
    lines.push("");
    if (story.summary) {
      lines.push(oneLine(story.summary));
      lines.push("");
    }
    if (story.verification && story.verification.length > 0) {
      lines.push("Verification:");
      for (const v of story.verification) lines.push(`- \`${v}\``);
      lines.push("");
    }
    if (story.deliverables && story.deliverables.length > 0) {
      lines.push("Deliverables:");
      for (const d of story.deliverables) lines.push(`- \`${d}\``);
      lines.push("");
    }
  }
}

if (deferred.length > 0) {
  lines.push("## Deferred");
  lines.push("");
  for (const story of deferred) {
    lines.push(`- **${story.id}** — ${story.title}`);
    if (story.deferredReason) lines.push(`  Reason: ${oneLine(story.deferredReason)}`);
  }
  lines.push("");
}

if (pending.length > 0 && target.status !== "archived") {
  lines.push("## Still open in this sprint");
  lines.push("");
  for (const story of pending) {
    lines.push(`- **${story.id}** — ${story.title} _(${story.status})_`);
  }
  lines.push("");
}

if (target.followUps && target.followUps.length > 0) {
  lines.push("## Follow-ups");
  lines.push("");
  for (const f of target.followUps) lines.push(`- ${oneLine(f)}`);
  lines.push("");
}

if (target.outOfScope && target.outOfScope.length > 0) {
  lines.push("## Out of scope");
  lines.push("");
  for (const o of target.outOfScope) lines.push(`- ${oneLine(o)}`);
  lines.push("");
}

if (target.notes && target.notes.length > 0) {
  lines.push("## Notes");
  lines.push("");
  for (const n of target.notes) lines.push(`- ${oneLine(n)}`);
  lines.push("");
}

process.stdout.write(lines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n");

function oneLine(text) {
  return String(text).replace(/\s+/g, " ").trim();
}
