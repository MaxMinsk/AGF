#!/usr/bin/env node
// S80 BACKLOG-MIGRATE-EPICS. One-shot parser: read the hand-written
// roadmap tables in `HIGH_LEVEL_BACKLOG.md` and emit one
// `backlog/epics/<ID>.epic.json` per recognisable row.
//
// Tables consumed:
//   - `## Roadmap Epics`               → category derived heuristically
//   - `## Must-Have Engine Gaps ...`   → category: "engine"
//   - `## AI-Native Ideas ...`         → category: "infra"
//
// Strategy (best-effort, idempotent — never overwrites an existing file):
//   1. Walk the file line-by-line, track the current `## <heading>`.
//   2. For lines that look like a Markdown table data row (`| ... |`),
//      split on `|` and inspect the first two-or-three cells.
//   3. Derive an epic id from the first cell — prefer an inline-bolded
//      `**<ID>**` that matches `^[A-Z][A-Z0-9-]*$`, otherwise slugify the
//      cell text.
//   4. Map the Status cell to one of the schema's four statuses.
//   5. Use the Notes cell as the epic `summary` (truncated for sanity).
//   6. Skip header rows (`| Epic | Status | Notes |`) and the
//      Markdown alignment row (`|---|---|---|`).
//
// Modes:
//   node scripts/backlog/migrate-epics.mjs            # write the files
//   node scripts/backlog/migrate-epics.mjs --dry-run  # print summary only

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const sourcePath = resolve(repoRoot, "HIGH_LEVEL_BACKLOG.md");
const targetDir = resolve(repoRoot, "backlog/epics");
const dryRun = process.argv.includes("--dry-run");

const source = readFileSync(sourcePath, "utf8");
const lines = source.split("\n");

let currentHeading = "";
const seen = new Set(); // epic id → already emitted in this run
const summary = [];
let written = 0;
let skipped = 0;
let parsed = 0;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const headingMatch = /^##\s+(.+?)\s*$/.exec(line);
  if (headingMatch !== null) {
    currentHeading = headingMatch[1];
    continue;
  }
  if (!line.startsWith("|")) continue;
  if (line.startsWith("|---") || line.startsWith("| ---")) continue;
  // Split row into cells; first + last entries are empty strings due to the leading/trailing `|`.
  const rawCells = line.split("|").slice(1, -1).map((c) => c.trim());
  if (rawCells.length < 2) continue;
  // Skip the header row when the first cell is literally "Epic" / "Idea".
  const first = rawCells[0];
  if (/^(epic|idea)$/i.test(first.replace(/\*\*/g, ""))) continue;

  const tableCategory = headingCategory(currentHeading);
  if (tableCategory === undefined) continue; // not a table we care about

  parsed += 1;

  const idCandidate = extractEpicId(first);
  if (idCandidate === undefined) {
    summary.push(`  skip   (no id) — ${truncate(first, 60)}`);
    skipped += 1;
    continue;
  }
  if (seen.has(idCandidate)) {
    summary.push(`  skip   ${idCandidate} — duplicate row in markdown`);
    skipped += 1;
    continue;
  }
  seen.add(idCandidate);

  const filePath = resolve(targetDir, `${idCandidate}.epic.json`);
  if (existsSync(filePath)) {
    summary.push(`  skip   ${idCandidate} — file already exists`);
    skipped += 1;
    continue;
  }

  const titleSource = stripMarkdown(first).replace(/^\*\*.+?\*\*\s*/, "").trim() || stripMarkdown(first);
  const title = ensureTitleLength(deriveTitle(idCandidate, titleSource));
  const statusCell = rawCells[1] ?? "";
  const status = mapStatus(statusCell);
  const notesCell = rawCells[rawCells.length - 1] ?? "";
  const summaryText = stripMarkdown(notesCell) || `Migrated from HIGH_LEVEL_BACKLOG.md (${currentHeading}).`;
  const sourceDoc = extractSourceDoc(notesCell);

  const epic = {
    agfFormatVersion: 1,
    id: idCandidate,
    title,
    status,
    category: tableCategory,
    summary: truncate(summaryText, 1200),
    ...(sourceDoc ? { sourceDoc } : {}),
    notes: [`Auto-migrated from HIGH_LEVEL_BACKLOG.md → "${currentHeading}" table on 2026-05-18.`]
  };

  if (!dryRun) {
    writeFileSync(filePath, JSON.stringify(epic, null, 2) + "\n");
  }
  written += 1;
  summary.push(`  ${dryRun ? "would " : ""}write ${idCandidate} (${status}, ${tableCategory}) — ${truncate(title, 60)}`);
}

process.stdout.write(summary.join("\n") + "\n");
process.stdout.write(`\n[backlog:migrate-epics] parsed ${parsed} row(s); ${dryRun ? "would write" : "wrote"} ${written}; skipped ${skipped}.\n`);

if (!dryRun && written > 0) {
  const check = spawnSync("node", [resolve(repoRoot, "scripts/backlog/check.mjs")], { encoding: "utf8" });
  process.stdout.write(check.stdout);
  process.stderr.write(check.stderr);
  if (check.status !== 0) {
    process.stderr.write("[backlog:migrate-epics] backlog:check FAILED after import — inspect generated files.\n");
    process.exit(1);
  }
}

// --- helpers ---

function headingCategory(heading) {
  // Map the source-table heading to an epic category.
  if (/^Roadmap Epics/i.test(heading)) return "engine"; // mixed, but mostly engine
  if (/^Must-Have Engine Gaps/i.test(heading)) return "engine";
  if (/^AI-Native Ideas/i.test(heading)) return "infra";
  if (/^From `?Notes.*kenji/i.test(heading)) return "research";
  return undefined;
}

function extractEpicId(cellText) {
  // Prefer an inline `**ID**` that matches the schema regex.
  const bold = /\*\*\s*`?([A-Z][A-Z0-9-]*)`?\s*\*\*/.exec(cellText);
  if (bold !== null) return bold[1];
  // Backticked inline code: `\`M17\``
  const code = /`([A-Z][A-Z0-9-]*)`/.exec(cellText);
  if (code !== null) return code[1];
  // Bare prefix like "M17 Renderer batching" → "M17"
  const bare = /^\s*([A-Z][A-Z0-9-]*)\s/.exec(cellText);
  if (bare !== null) return bare[1];
  // Fallback: slugify the entire cell, drop punctuation. If the result
  // is too short or has no uppercase start, give up.
  const slug = cellText
    .replace(/[`*]/g, "")
    .replace(/[^A-Za-z0-9 -]/g, " ")
    .trim()
    .replace(/\s+/g, "-")
    .toUpperCase();
  if (slug.length >= 3 && /^[A-Z]/.test(slug)) {
    // Drop overly long slugs (>50 chars) — they signal the row is freeform prose, not a real epic.
    if (slug.length > 50) return undefined;
    return slug;
  }
  return undefined;
}

function deriveTitle(id, fallback) {
  if (fallback.length > 0) return fallback;
  return id.replace(/-/g, " ").toLowerCase();
}

function mapStatus(statusCell) {
  const clean = stripMarkdown(statusCell).toLowerCase();
  if (/(^|[^a-z])(archived|done|complete|shipped)/.test(clean)) return "done";
  if (/(^|[^a-z])(parked|deferred indefinitely)/.test(clean)) return "parked";
  if (/(^|[^a-z])(active|high priority|in flight|in progress|in-flight)/.test(clean)) return "active";
  if (/(^|[^a-z])(planned|later|future|low priority|next)/.test(clean)) return "planned";
  // Default conservatively to `planned` — the agent can flip after review.
  return "planned";
}

function stripMarkdown(s) {
  return s.replace(/\*\*/g, "").replace(/`/g, "").replace(/\s+/g, " ").trim();
}

function extractSourceDoc(cellText) {
  // Look for `notes/<file>.md` or `docs/<file>.md` patterns.
  const m = /`(notes\/[^`]+\.md|docs\/[^`]+\.md|Notes\/[^`]+\.md)`/.exec(cellText);
  return m !== null ? m[1] : undefined;
}

function ensureTitleLength(s) {
  return s.length >= 5 ? truncate(s, 100) : s + " (migrated)";
}

function truncate(s, max) {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}
