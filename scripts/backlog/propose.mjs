#!/usr/bin/env node
// S97 GAME-DESIGN-PROPOSE-SCAFFOLD. Scaffold helper for the
// game-design-agent terminal:
//
//   node scripts/backlog/propose.mjs new "<title>"
//                                      [--kind feature|mechanic|balance|content]
//                                      [--priority must|should|could]
//                                      [--epic <EPIC-ID>]
//                                      [--into <dir>]   # default: backlog/proposed-stories
//
// Writes `<dir>/GDP-YYYY-MM-DD-NNN.story-proposal.json` with today's
// date (UTC) and the next free three-digit slot for that date.
// Pre-fills the required fields with sensible defaults; leaves
// freeform fields (intent, rationale, acceptanceHints) as TODO
// placeholders so the agent fills them in.
//
// Refuses to clobber an existing file. Prints the absolute path of
// the created file to stdout so callers can pipe to $EDITOR.

import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const defaultProposedDir = resolve(repoRoot, "backlog/proposed-stories");

// Run the CLI body only when invoked as a script — tests can import
// the named exports (computeDatePrefix, nextFreeSlot) without
// triggering process.exit.
const invokedAsScript = process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (invokedAsScript) main();

function main() {
  const [, , subcommand, ...rest] = process.argv;
  if (subcommand !== "new") {
    exit(2, "usage: propose new \"<title>\" [--kind feature|mechanic|balance|content] [--priority must|should|could] [--epic <ID>]");
  }

const positional = [];
const flags = {};
for (let i = 0; i < rest.length; i += 1) {
  const token = rest[i];
  if (token.startsWith("--")) {
    flags[token.slice(2)] = rest[i + 1];
    i += 1;
  } else {
    positional.push(token);
  }
}

const title = positional.join(" ").trim();
if (title.length < 5) {
  exit(2, "title must be at least 5 characters; pass it as one quoted argument");
}

const kind = flags.kind ?? "TODO";
const priority = flags.priority ?? "TODO";
const epic = flags.epic;
const targetDir = flags.into !== undefined ? resolve(repoRoot, flags.into) : defaultProposedDir;

// UTC date prefix so two agents in different timezones agree on the
// YYYY-MM-DD bucket.
const now = new Date();
const datePrefix = computeDatePrefix(now);
const idPrefix = `GDP-${datePrefix}`;

// Allocate the next free NNN slot.
const next = nextFreeSlot(targetDir, idPrefix);
if (next > 999) exit(1, `999 proposals filed on ${datePrefix} already — change the date or rotate the directory.`);

const id = `${idPrefix}-${next.toString().padStart(3, "0")}`;
const filename = `${id}.story-proposal.json`;
const file = resolve(targetDir, filename);

if (existsSync(file)) exit(1, `refusing to clobber existing file: ${file}`);

// Build the body. Placeholder strings start with "TODO:" so an agent
// can `grep -rn "TODO:" backlog/proposed-stories/` to list every
// unfinished proposal. Each placeholder is long enough to clear the
// schema's minLength check.
const body = {
  agfFormatVersion: 1,
  id,
  title,
  createdAt: now.toISOString(),
  kind,
  intent: "TODO: describe what the player should experience and why (markdown ok, minLength 20).",
  priority
};
if (epic !== undefined) body.epic = epic;
body.rationale = "TODO: why does this matter now? Cite playtest finding, market reference, or GDD section.";
body.acceptanceHints = ["TODO: one-line description of the visible acceptance case"];

mkdirSync(targetDir, { recursive: true });
writeFileSync(file, JSON.stringify(body, null, 2) + "\n", "utf8");

const todo = [];
if (kind === "TODO") todo.push("--kind");
if (priority === "TODO") todo.push("--priority");
if (todo.length > 0) {
  console.error(`[propose] created ${file}`);
  console.error(`[propose] WARNING — fill in: ${todo.join(", ")} + intent body + acceptanceHints`);
  console.error("[propose] (this file will NOT pass backlog:check until kind + priority are valid enums)");
} else {
  console.error(`[propose] created ${file}`);
  console.error("[propose] Next: open the file, replace TODO: lines with real content; intent must be > 20 chars.");
}

process.stdout.write(file + "\n");
}

// --- helpers ----------------------------------------------------------------

export function computeDatePrefix(date) {
  const yyyy = date.getUTCFullYear().toString().padStart(4, "0");
  const mm = (date.getUTCMonth() + 1).toString().padStart(2, "0");
  const dd = date.getUTCDate().toString().padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function nextFreeSlot(dir, idPrefix) {
  if (!existsSync(dir)) return 1;
  const used = readdirSync(dir)
    .filter((name) => name.startsWith(idPrefix) && name.endsWith(".story-proposal.json"))
    .map((name) => Number(name.slice(idPrefix.length + 1, idPrefix.length + 4)))
    .filter((n) => Number.isFinite(n));
  if (used.length === 0) return 1;
  return Math.max(...used) + 1;
}

function exit(code, message) {
  console.error(`[propose] ${message}`);
  process.exit(code);
}
