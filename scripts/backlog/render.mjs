#!/usr/bin/env node
// S78 BACKLOG-RENDER. Regenerates the human-readable views of the
// backlog from JSON source of truth:
//
//   BACKLOG.md          — replaces everything between
//                         `<!-- backlog:render:start -->` and
//                         `<!-- backlog:render:end -->` with a
//                         rendering of the ACTIVE sprint (status:
//                         "active"). Everything else in the file
//                         (preamble, "Next Sprint candidates" list)
//                         stays as hand-authored Markdown.
//
//   BACKLOG_ARCHIVE.md  — same marker pair; the block between the
//                         markers is replaced with a rendering of
//                         every ARCHIVED sprint, oldest first. The
//                         hand-written prelude (S0–S77 prose
//                         imported by `BACKLOG-MIGRATE-HISTORY`)
//                         stays above the start marker.
//
// Modes:
//   node scripts/backlog/render.mjs           # writes the files
//   node scripts/backlog/render.mjs --check   # exits non-zero if
//                                              writing would change
//                                              anything (CI-friendly)

import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const sprintsDir = resolve(repoRoot, "backlog/sprints");
const backlogPath = resolve(repoRoot, "BACKLOG.md");
const archivePath = resolve(repoRoot, "BACKLOG_ARCHIVE.md");
const startMarker = "<!-- backlog:render:start -->";
const endMarker = "<!-- backlog:render:end -->";
const checkMode = process.argv.includes("--check");

function loadSprints() {
  let names = [];
  try {
    if (statSync(sprintsDir).isDirectory()) {
      names = readdirSync(sprintsDir)
        .filter((n) => n.endsWith(".sprint.json"))
        .sort();
    }
  } catch {
    names = [];
  }
  return names.map((name) => {
    const file = resolve(sprintsDir, name);
    return JSON.parse(readFileSync(file, "utf8"));
  });
}

const sprints = loadSprints();
const active = sprints.find((s) => s.status === "active");
const archived = sprints.filter((s) => s.status === "archived");

const backlogBlock = renderActiveBlock(active);
const archiveBlock = renderArchiveBlock(archived);

const backlogResult = applyBlock(readFileSync(backlogPath, "utf8"), backlogBlock, "BACKLOG.md");
const archiveResult = applyBlock(readFileSync(archivePath, "utf8"), archiveBlock, "BACKLOG_ARCHIVE.md");

const changes = [];
if (backlogResult.changed) changes.push("BACKLOG.md");
if (archiveResult.changed) changes.push("BACKLOG_ARCHIVE.md");

if (checkMode) {
  if (changes.length > 0) {
    console.error(`[backlog:render --check] FAIL — generated content is stale: ${changes.join(", ")}`);
    console.error(`  Run \`npm run backlog:render\` and commit the result.`);
    process.exit(1);
  }
  console.log(`[backlog:render --check] OK — rendered Markdown matches sprint JSON.`);
  process.exit(0);
}

if (backlogResult.changed) writeFileSync(backlogPath, backlogResult.text);
if (archiveResult.changed) writeFileSync(archivePath, archiveResult.text);

if (changes.length === 0) {
  console.log(`[backlog:render] OK — nothing to update.`);
} else {
  console.log(`[backlog:render] wrote: ${changes.join(", ")}`);
}

// --- block helpers ---

function applyBlock(text, newBlock, label) {
  const startIdx = text.indexOf(startMarker);
  const endIdx = text.indexOf(endMarker);
  if (startIdx < 0 || endIdx < 0 || endIdx < startIdx) {
    console.error(`[backlog:render] FAIL — ${label} is missing the marker block. Insert:`);
    console.error(`  ${startMarker}`);
    console.error(`  (generated)`);
    console.error(`  ${endMarker}`);
    process.exit(2);
  }
  const before = text.slice(0, startIdx + startMarker.length);
  const after = text.slice(endIdx);
  const next = `${before}\n${newBlock}\n${after}`;
  return { changed: next !== text, text: next };
}

// --- renderers ---

function renderActiveBlock(sprint) {
  if (sprint === undefined) {
    return [
      "",
      "_No sprint is currently `active`. Edit a `backlog/sprints/S<NN>.sprint.json` to `status: \"active\"` and re-run `npm run backlog:render`._",
      ""
    ].join("\n");
  }
  const lines = [];
  lines.push("");
  lines.push(`## Current Sprint: ${sprint.id} — ${sprint.title}`);
  lines.push("");
  const started = sprint.startedAt ? ` (started ${sprint.startedAt})` : "";
  lines.push(`Status: **active**${started}. Source: \`backlog/sprints/${sprint.id}.sprint.json\`.`);
  lines.push("");
  lines.push("### Stories");
  lines.push("");
  for (const story of sprint.stories ?? []) {
    lines.push(`- **${story.id}** — ${story.title} _(${story.status})_`);
    if (story.summary) lines.push(`  ${oneLine(story.summary)}`);
    if (story.dependsOn && story.dependsOn.length > 0) {
      lines.push(`  Depends on: ${story.dependsOn.join(", ")}.`);
    }
  }
  if (sprint.outOfScope && sprint.outOfScope.length > 0) {
    lines.push("");
    lines.push("### Out of scope");
    lines.push("");
    for (const item of sprint.outOfScope) lines.push(`- ${oneLine(item)}`);
  }
  if (sprint.followUps && sprint.followUps.length > 0) {
    lines.push("");
    lines.push("### Follow-ups already noted");
    lines.push("");
    for (const item of sprint.followUps) lines.push(`- ${oneLine(item)}`);
  }
  if (sprint.notes && sprint.notes.length > 0) {
    lines.push("");
    lines.push("### Notes");
    lines.push("");
    for (const item of sprint.notes) lines.push(`- ${oneLine(item)}`);
  }
  lines.push("");
  return lines.join("\n");
}

function renderArchiveBlock(archivedSprints) {
  if (archivedSprints.length === 0) {
    return [
      "",
      "_No archived sprints in the JSON source yet. Legacy entries are in the prelude above this marker._",
      ""
    ].join("\n");
  }
  // Compact view: one bullet per sprint with title + link to the source
  // JSON file. The full body lives in the JSON; rendering everything
  // inline blows BACKLOG_ARCHIVE.md to thousands of lines.
  const lines = [];
  lines.push("");
  lines.push("## Archived sprints (JSON source of truth)");
  lines.push("");
  lines.push("Each entry links to its `backlog/sprints/<id>.sprint.json` — open the JSON for completed-work bullets, verification, deliverables, follow-ups.");
  lines.push("");
  const sorted = [...archivedSprints].sort((a, b) => a.id.localeCompare(b.id));
  for (const sprint of sorted) {
    const stories = sprint.stories ?? [];
    const implemented = stories.filter((s) => s.status === "implemented").length;
    const deferred = stories.filter((s) => s.status === "deferred").length;
    const archivedAt = sprint.archivedAt ? ` · archived ${sprint.archivedAt}` : "";
    const counts = [];
    if (implemented > 0) counts.push(`${implemented} implemented`);
    if (deferred > 0) counts.push(`${deferred} deferred`);
    const countStr = counts.length > 0 ? ` — ${counts.join(", ")}` : "";
    lines.push(
      `- **[${sprint.id}](backlog/sprints/${sprint.id}.sprint.json)** — ${oneLine(sprint.title)}${countStr}${archivedAt}`
    );
  }
  lines.push("");
  return lines.join("\n");
}

function oneLine(text) {
  return text.replace(/\s+/g, " ").trim();
}
