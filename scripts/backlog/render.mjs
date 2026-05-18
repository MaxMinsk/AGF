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
const epicsDir = resolve(repoRoot, "backlog/epics");
const backlogPath = resolve(repoRoot, "BACKLOG.md");
const archivePath = resolve(repoRoot, "BACKLOG_ARCHIVE.md");
const highLevelPath = resolve(repoRoot, "HIGH_LEVEL_BACKLOG.md");
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

function loadEpics() {
  let names = [];
  try {
    if (statSync(epicsDir).isDirectory()) {
      names = readdirSync(epicsDir)
        .filter((n) => n.endsWith(".epic.json"))
        .sort();
    }
  } catch {
    names = [];
  }
  return names.map((name) => {
    const file = resolve(epicsDir, name);
    return JSON.parse(readFileSync(file, "utf8"));
  });
}

function buildEpicStoryRollup(sprints) {
  /** @type {Map<string, { implemented: number; open: number; deferred: number; total: number; sprints: Set<string> }>} */
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
      else entry.open += 1; // pending or in_progress
    }
  }
  return byEpic;
}

const sprints = loadSprints();
const epics = loadEpics();
const active = sprints.find((s) => s.status === "active");
const archived = sprints.filter((s) => s.status === "archived");

// S080 BACKLOG-EPIC-RENDER: build a per-epic story rollup that walks every
// sprint and groups stories by their `epic` field. Used by the
// HIGH_LEVEL_BACKLOG.md renderer to show implemented / open / total counts.
const storyRollupByEpic = buildEpicStoryRollup(sprints);

const backlogBlock = renderActiveBlock(active);
const archiveBlock = renderArchiveBlock(archived);
const highLevelBlock = renderHighLevelBlock(epics, storyRollupByEpic);

const backlogResult = applyBlock(readFileSync(backlogPath, "utf8"), backlogBlock, "BACKLOG.md");
const archiveResult = applyBlock(readFileSync(archivePath, "utf8"), archiveBlock, "BACKLOG_ARCHIVE.md");
const highLevelResult = applyBlock(readFileSync(highLevelPath, "utf8"), highLevelBlock, "HIGH_LEVEL_BACKLOG.md");

const changes = [];
if (backlogResult.changed) changes.push("BACKLOG.md");
if (archiveResult.changed) changes.push("BACKLOG_ARCHIVE.md");
if (highLevelResult.changed) changes.push("HIGH_LEVEL_BACKLOG.md");

if (checkMode) {
  if (changes.length > 0) {
    console.error(`[backlog:render --check] FAIL — generated content is stale: ${changes.join(", ")}`);
    console.error(`  Run \`npm run backlog:render\` and commit the result.`);
    process.exit(1);
  }
  console.log(`[backlog:render --check] OK — rendered Markdown matches sprint JSON + epic JSON.`);
  process.exit(0);
}

if (backlogResult.changed) writeFileSync(backlogPath, backlogResult.text);
if (archiveResult.changed) writeFileSync(archivePath, archiveResult.text);
if (highLevelResult.changed) writeFileSync(highLevelPath, highLevelResult.text);

if (changes.length === 0) {
  console.log(`[backlog:render] OK — nothing to update.`);
} else {
  console.log(`[backlog:render] wrote: ${changes.join(", ")}`);
}

// --- block helpers ---

function applyBlock(text, newBlock, label) {
  // Match the markers ONLY when they appear on their own line. Without
  // this anchor, story summaries that quote the marker string (e.g.
  // BACKLOG-EPIC-RENDER's own summary) would be treated as the end
  // marker and the renderer would clobber the wrong region of the file.
  const startRe = new RegExp(`(^|\\n)${escapeRegExp(startMarker)}[ \\t]*(\\r?\\n|$)`);
  const endRe = new RegExp(`(^|\\n)${escapeRegExp(endMarker)}[ \\t]*(\\r?\\n|$)`);
  const startMatch = startRe.exec(text);
  if (startMatch === null) {
    console.error(`[backlog:render] FAIL — ${label} is missing the start marker. Insert on its own line:`);
    console.error(`  ${startMarker}`);
    console.error(`  (generated)`);
    console.error(`  ${endMarker}`);
    process.exit(2);
  }
  // End marker must appear AFTER the start marker.
  endRe.lastIndex = startMatch.index + startMatch[0].length;
  const tail = text.slice(startMatch.index + startMatch[0].length);
  const endRel = endRe.exec(tail);
  if (endRel === null) {
    console.error(`[backlog:render] FAIL — ${label} is missing the end marker after the start marker. Insert on its own line:`);
    console.error(`  ${endMarker}`);
    process.exit(2);
  }
  const startBoundary = startMatch.index + startMatch[0].length - (startMatch[2]?.length ?? 0);
  // Position of the (newline + endMarker) in the original text.
  const endAbsoluteIdx = startMatch.index + startMatch[0].length + endRel.index + (endRel[1]?.length ?? 0);
  const before = text.slice(0, startBoundary);
  const after = text.slice(endAbsoluteIdx);
  const next = `${before}\n${newBlock}\n${after}`;
  return { changed: next !== text, text: next };
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

function renderHighLevelBlock(epics, rollup) {
  if (epics.length === 0) {
    return [
      "",
      "_No epic files in `backlog/epics/` yet — once `BACKLOG-MIGRATE-EPICS` (S080) runs, every roadmap row above becomes one JSON file rendered here._",
      ""
    ].join("\n");
  }
  const statusOrder = { active: 0, planned: 1, done: 2, parked: 3 };
  const sorted = [...epics].sort((a, b) => {
    const sa = statusOrder[a.status] ?? 9;
    const sb = statusOrder[b.status] ?? 9;
    if (sa !== sb) return sa - sb;
    return a.id.localeCompare(b.id);
  });

  const lines = [];
  lines.push("");
  lines.push("| Epic | Status | Category | Stories (impl / open / total) | Notes |");
  lines.push("|---|---|---|---|---|");
  for (const epic of sorted) {
    const r = rollup.get(epic.id) ?? { implemented: 0, open: 0, deferred: 0, total: 0, sprints: new Set() };
    const counts = `${r.implemented} / ${r.open} / ${r.total}`;
    const note = epic.targetMilestone ? `→ ${epic.targetMilestone}` : "";
    const linkedTitle = `[${epic.id}](backlog/epics/${epic.id}.epic.json)`;
    lines.push(`| **${linkedTitle}** — ${escapePipe(oneLine(epic.title))} | ${epic.status} | ${epic.category} | ${counts} | ${escapePipe(note)} |`);
  }
  lines.push("");
  // Quick "next-up" hint for the active sprint owner: epics whose
  // dependencies are all done but the epic itself is still `planned` —
  // these are the natural promotion candidates.
  const promotable = sorted.filter((e) => {
    if (e.status !== "planned") return false;
    const deps = e.dependsOn ?? [];
    if (deps.length === 0) return true;
    return deps.every((depId) => {
      const dep = epics.find((x) => x.id === depId);
      return dep !== undefined && dep.status === "done";
    });
  });
  if (promotable.length > 0) {
    lines.push("**Promotion candidates** (planned + dependencies satisfied): " + promotable.map((e) => e.id).join(", ") + ".");
    lines.push("");
  }
  return lines.join("\n");
}

function escapePipe(s) {
  return String(s).replace(/\|/g, "\\|");
}

function oneLine(text) {
  return text.replace(/\s+/g, " ").trim();
}
