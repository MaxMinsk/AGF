#!/usr/bin/env node
// S93 QA-INTAKE-NEW. Scaffold helper for the QA-agent terminal:
//
//   node scripts/backlog/qa-ticket.mjs new "<title>"
//                                      [--severity critical|major|minor|polish]
//                                      [--type bug|regression-needed|doc|ux]
//                                      [--found-in-pr <number>]
//                                      [--found-in-sprint <S0NN>]
//                                      [--regression-for QA-...]
//                                      [--into <dir>]   # default: backlog/qa-tickets
//
// Writes `<dir>/QA-YYYY-MM-DD-NNN.qa-ticket.json` with today's date
// (UTC) and the next free three-digit slot for that date. Pre-fills
// the required fields with sensible defaults; leaves freeform fields
// (repro, expected, actual, summary) empty so the agent fills them.
//
// Refuses to clobber an existing file. Prints the absolute path of
// the created file to stdout so callers can pipe to $EDITOR.

import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const defaultTicketsDir = resolve(repoRoot, "backlog/qa-tickets");

const [, , subcommand, ...rest] = process.argv;
if (subcommand !== "new") {
  exit(2, "usage: qa-ticket new \"<title>\" [--severity ...] [--type ...] [--found-in-pr N]");
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

const severity = flags.severity ?? "TODO";
const type = flags.type ?? "TODO";
const foundInPr = flags["found-in-pr"] !== undefined ? Number(flags["found-in-pr"]) : undefined;
const foundInSprint = flags["found-in-sprint"];
const regressionFor = flags["regression-for"];
const targetDir = flags.into !== undefined ? resolve(repoRoot, flags.into) : defaultTicketsDir;

// Build the date prefix in UTC so two agents in different timezones
// agree on the YYYY-MM-DD bucket.
const now = new Date();
const yyyy = now.getUTCFullYear().toString().padStart(4, "0");
const mm = (now.getUTCMonth() + 1).toString().padStart(2, "0");
const dd = now.getUTCDate().toString().padStart(2, "0");
const datePrefix = `${yyyy}-${mm}-${dd}`;
const idPrefix = `QA-${datePrefix}`;

// Allocate the next free NNN slot.
let next = 1;
if (existsSync(targetDir)) {
  const used = readdirSync(targetDir)
    .filter((name) => name.startsWith(idPrefix) && name.endsWith(".qa-ticket.json"))
    .map((name) => Number(name.slice(idPrefix.length + 1, idPrefix.length + 4))) // "QA-YYYY-MM-DD-" + "NNN"
    .filter((n) => Number.isFinite(n));
  if (used.length > 0) next = Math.max(...used) + 1;
}
if (next > 999) exit(1, `999 tickets filed on ${datePrefix} already — change the date or rotate the directory.`);

const id = `${idPrefix}-${next.toString().padStart(3, "0")}`;
const filename = `${id}.qa-ticket.json`;
const file = resolve(targetDir, filename);

if (existsSync(file)) exit(1, `refusing to clobber existing file: ${file}`);

// Build the body.
const body = {
  agfFormatVersion: 1,
  id,
  title,
  filedAt: now.toISOString()
};
if (foundInPr !== undefined && Number.isFinite(foundInPr)) body.foundInPr = foundInPr;
if (foundInSprint !== undefined) body.foundInSprint = foundInSprint;
body.severity = severity;
body.type = type;
// Placeholder strings include the literal "TODO:" prefix so a quick
// `grep -rn "TODO:" backlog/qa-tickets/` lists every unfinished ticket.
// Each placeholder is long enough to pass schema minLength validation.
body.summary = "TODO: one-paragraph context for the bug";
body.repro = ["TODO: describe repro step 1 in user-facing language"];
body.expected = "TODO: describe the expected behaviour";
body.actual = "TODO: describe what actually happened";
if (regressionFor !== undefined) body.regressionFor = regressionFor;

// Ensure target dir exists (idempotent).
mkdirSync(targetDir, { recursive: true });

writeFileSync(file, JSON.stringify(body, null, 2) + "\n", "utf8");

const todo = [];
if (severity === "TODO") todo.push("--severity");
if (type === "TODO") todo.push("--type");
if (todo.length > 0) {
  console.error(`[qa-ticket] created ${file}`);
  console.error(`[qa-ticket] WARNING — fill in: ${todo.join(", ")} + repro[]`);
  console.error("[qa-ticket] (this file will NOT pass backlog:check until severity + type are valid enums)");
} else {
  console.error(`[qa-ticket] created ${file}`);
}

// S94 QA-INTAKE-LABEL-CONVENTION. Remind the agent that the
// auto-merge GitHub Action keys on the `qa-intake` label. Without
// it the PR sits open until dev's manual relay.
const isoWeek = (() => {
  // Approx ISO-week: just use UTC week-of-year for the suggested branch name.
  const tmp = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  tmp.setUTCDate(tmp.getUTCDate() + 4 - (tmp.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((tmp.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${tmp.getUTCFullYear()}-${week.toString().padStart(2, "0")}`;
})();
console.error("");
console.error("[qa-ticket] When ready to push the batch, the canonical commands are:");
console.error(`[qa-ticket]   git checkout -B qa-intake/${isoWeek}`);
console.error(`[qa-ticket]   git add backlog/qa-tickets/ examples/*/playtests/qa-proposed/ qa-artifacts/`);
console.error(`[qa-ticket]   git commit -m "qa-intake: <one-line summary>"`);
console.error(`[qa-ticket]   git push -u origin qa-intake/${isoWeek}`);
console.error(`[qa-ticket]   gh pr create --base main --label qa-intake --title "qa-intake: ${datePrefix}" --body "<list of tickets>"`);
console.error("[qa-ticket] The --label qa-intake is REQUIRED — the qa-intake auto-merge action keys on it.");

process.stdout.write(file + "\n");

function exit(code, message) {
  console.error(`[qa-ticket] ${message}`);
  process.exit(code);
}
