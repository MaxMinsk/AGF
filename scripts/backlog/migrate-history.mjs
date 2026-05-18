#!/usr/bin/env node
// S79 BACKLOG-MIGRATE-HISTORY. One-shot parser: turn the hand-written
// S0–S77 prelude in `BACKLOG_ARCHIVE.md` into per-sprint JSON files at
// `backlog/sprints/S<NNN>.sprint.json`.
//
// Strategy (best-effort, not lossy):
//
//   1. Slice everything ABOVE the `<!-- backlog:render:start -->` marker.
//   2. Split by `## Sprint <N>` headings. Accept either `-` or `—` between
//      the sprint number and the title.
//   3. For each sprint section, walk `### <subsection>` blocks:
//        - `### Completed Work` → stories[] (one per top-level bullet)
//        - `### Deliverables`   → notes:  "Deliverables: …"
//        - `### Verification`   → notes:  "Verification: …"
//        - `### Follow-Ups`     → followUps[]
//        - any other heading    → notes:  "<heading>: …"
//   4. Story IDs are synthesised as `S<NNN>-<index>` (regex-safe, unique).
//   5. Each story gets a placeholder verification entry so the schema's
//      "implemented requires non-empty verification[]" rule passes — the
//      authoritative verification text is preserved in sprint notes[].
//   6. Files for sprint IDs that already exist (e.g. S078, S079) are
//      skipped — we never clobber hand-authored sprint JSON.
//   7. `backlog:check` runs at the end; any AGF_BACKLOG_* error is fatal.
//
// Modes:
//
//   node scripts/backlog/migrate-history.mjs            # write the files
//   node scripts/backlog/migrate-history.mjs --dry-run  # print summary only

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const archivePath = resolve(repoRoot, "BACKLOG_ARCHIVE.md");
const sprintsDir = resolve(repoRoot, "backlog/sprints");
const dryRun = process.argv.includes("--dry-run");

const startMarker = "<!-- backlog:render:start -->";

const archive = readFileSync(archivePath, "utf8");
const markerIdx = archive.indexOf(startMarker);
const prelude = markerIdx >= 0 ? archive.slice(0, markerIdx) : archive;

const sprintBlocks = splitSprintBlocks(prelude);
if (sprintBlocks.length === 0) {
  console.error("[backlog:migrate-history] no `## Sprint <N>` sections found in the prelude.");
  process.exit(1);
}

const placeholderVerification = "legacy import — see sprint notes[] for the original sprint-level verification";

const summary = [];
let writtenCount = 0;
let skippedCount = 0;

for (const block of sprintBlocks) {
  const sprintId = `S${String(block.number).padStart(3, "0")}`;
  const filePath = resolve(sprintsDir, `${sprintId}.sprint.json`);
  if (existsSync(filePath)) {
    skippedCount += 1;
    summary.push(`  skip   ${sprintId} — ${block.title} (file exists)`);
    continue;
  }
  const parsed = parseSprintBody(block.body);
  const stories = parsed.completedWork.map((entry, i) => {
    const idx = i + 1;
    return {
      id: `${sprintId}-${idx}`,
      title: entry.title,
      status: "implemented",
      ...(entry.summary !== undefined ? { summary: entry.summary } : {}),
      verification: [placeholderVerification]
    };
  });

  const notes = [];
  if (parsed.deliverables.length > 0) {
    notes.push(`Deliverables: ${parsed.deliverables.map(oneLine).join("; ")}`);
  }
  if (parsed.verification.length > 0) {
    notes.push(`Verification: ${parsed.verification.map(oneLine).join("; ")}`);
  }
  for (const extra of parsed.otherSections) {
    notes.push(`${extra.heading}: ${extra.items.map(oneLine).join("; ")}`);
  }

  const followUps = parsed.followUps.map(oneLine).filter((s) => s.length >= 3);

  const sprintJson = {
    agfFormatVersion: 1,
    id: sprintId,
    title: trimTitle(block.title),
    status: "archived",
    startedAt: null,
    archivedAt: null,
    stories,
    ...(followUps.length > 0 ? { followUps } : {}),
    ...(notes.length > 0 ? { notes } : {})
  };

  if (!dryRun) {
    writeFileSync(filePath, JSON.stringify(sprintJson, null, 2) + "\n");
  }
  writtenCount += 1;
  summary.push(`  ${dryRun ? "would " : ""}write ${sprintId} — ${block.title} (${stories.length} stories, ${followUps.length} follow-ups, ${notes.length} notes)`);
}

process.stdout.write(summary.join("\n") + "\n");
process.stdout.write(`\n[backlog:migrate-history] ${dryRun ? "(dry-run) would write" : "wrote"} ${writtenCount} sprint file(s); skipped ${skippedCount}.\n`);

if (!dryRun && writtenCount > 0) {
  const check = spawnSync(
    "node",
    [resolve(repoRoot, "scripts/backlog/check.mjs")],
    { encoding: "utf8" }
  );
  process.stdout.write(check.stdout);
  process.stderr.write(check.stderr);
  if (check.status !== 0) {
    process.stderr.write("[backlog:migrate-history] backlog:check FAILED after import. Inspect the generated files.\n");
    process.exit(1);
  }
}

// --- parsing helpers ---

function splitSprintBlocks(text) {
  const headingRe = /^##\s+Sprint\s+(\d+)\s*[-–—]\s*(.+?)\s*$/gm;
  const matches = [];
  let m;
  while ((m = headingRe.exec(text)) !== null) {
    matches.push({ index: m.index, end: m.index + m[0].length, number: Number(m[1]), title: m[2] });
  }
  const blocks = [];
  for (let i = 0; i < matches.length; i++) {
    const startBody = matches[i].end;
    const endBody = i + 1 < matches.length ? matches[i + 1].index : text.length;
    const body = text.slice(startBody, endBody);
    blocks.push({ number: matches[i].number, title: matches[i].title, body });
  }
  return blocks;
}

function parseSprintBody(body) {
  // Split into `### <heading>` subsections.
  const subRe = /^###\s+(.+?)\s*$/gm;
  const subs = [];
  let m;
  while ((m = subRe.exec(body)) !== null) {
    subs.push({ heading: m[1], index: m.index, headerEnd: m.index + m[0].length });
  }
  const sections = [];
  for (let i = 0; i < subs.length; i++) {
    const sectionStart = subs[i].headerEnd;
    const sectionEnd = i + 1 < subs.length ? subs[i + 1].index : body.length;
    sections.push({ heading: subs[i].heading, text: body.slice(sectionStart, sectionEnd) });
  }

  const completedWork = [];
  const deliverables = [];
  const verification = [];
  const followUps = [];
  const otherSections = [];

  for (const section of sections) {
    const items = extractBullets(section.text);
    const h = section.heading.toLowerCase();
    if (h.startsWith("completed work")) {
      for (const raw of items) {
        const { title, summary } = splitTitleSummary(raw);
        completedWork.push({ title, summary });
      }
    } else if (h.startsWith("deliverables")) {
      deliverables.push(...items);
    } else if (h.startsWith("verification")) {
      verification.push(...items);
    } else if (h.startsWith("follow-ups") || h.startsWith("follow ups") || h.startsWith("followups")) {
      followUps.push(...items);
    } else if (h.startsWith("status")) {
      // "Status: Completed and archived." — drop, it's already implied.
    } else {
      otherSections.push({ heading: section.heading, items });
    }
  }
  return { completedWork, deliverables, verification, followUps, otherSections };
}

function extractBullets(text) {
  // Top-level bullets: lines starting with "- " or "<digits>. ". The
  // legacy archive mixes both styles. Continuation lines start with at
  // least 2 spaces of indent and are appended to the previous bullet.
  const lines = text.split("\n");
  const items = [];
  let current;
  for (const line of lines) {
    const dashMatch = /^- (.*)$/.exec(line);
    const numMatch = /^\d+\.\s+(.*)$/.exec(line);
    if (dashMatch !== null) {
      if (current !== undefined) items.push(current);
      current = dashMatch[1].trim();
    } else if (numMatch !== null) {
      if (current !== undefined) items.push(current);
      current = numMatch[1].trim();
    } else if (current !== undefined && /^\s{2,}\S/.test(line)) {
      current += "\n" + line.trim();
    } else if (current !== undefined && /^\s*$/.test(line)) {
      // blank line — keep current open in case there's more
    } else if (current !== undefined) {
      // non-indented non-bullet — close current
      items.push(current);
      current = undefined;
    }
  }
  if (current !== undefined) items.push(current);
  return items.filter((s) => s.length > 0);
}

function splitTitleSummary(raw) {
  // The first line is the title; everything after a blank line / newline
  // becomes the summary. Cap the title at ~140 chars; overflow goes to
  // summary. Schema requires title minLength:5.
  const collapsed = raw.replace(/\s+/g, " ").trim();
  if (collapsed.length <= 140) {
    return { title: ensureMinLength(collapsed), summary: undefined };
  }
  const firstSentence = collapsed.match(/^(.{40,140}?[.!?])(\s|$)/);
  if (firstSentence !== null) {
    return {
      title: ensureMinLength(firstSentence[1]),
      summary: collapsed.slice(firstSentence[1].length).trim() || undefined
    };
  }
  const cut = collapsed.lastIndexOf(" ", 140);
  const title = cut > 40 ? collapsed.slice(0, cut) : collapsed.slice(0, 140);
  return {
    title: ensureMinLength(title.trim()) + "…",
    summary: collapsed
  };
}

function ensureMinLength(s) {
  return s.length >= 5 ? s : s + " (legacy)";
}

function trimTitle(s) {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length >= 5 ? t : t + " (legacy)";
}

function oneLine(s) {
  return String(s).replace(/\s+/g, " ").trim();
}
