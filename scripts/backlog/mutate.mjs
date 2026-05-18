#!/usr/bin/env node
// S79 BACKLOG-CLI-MUTATE. Single dispatch point for the three write
// commands that flip a story's status inside the active sprint:
//
//   node scripts/backlog/mutate.mjs claim <story-id>
//     → status "pending" → "in_progress"
//
//   node scripts/backlog/mutate.mjs done  <story-id>
//                                    [--verification "<text>" ...]
//                                    [--deliverable "<path>" ...]
//                                    [--summary "<text>"]
//     → status → "implemented". `--verification` is REQUIRED (the schema
//       enforces it); repeat the flag to add more entries. `--deliverable`
//       and `--summary` are optional.
//
//   node scripts/backlog/mutate.mjs defer <story-id> --reason "<text>"
//     → status → "deferred". `--reason` is REQUIRED.
//
// After every successful mutation:
//   1. The sprint JSON is rewritten with stable 2-space indentation.
//   2. `backlog:check` is run inline; if it fails, the original file
//      content is restored and the command exits non-zero.
//   3. The caller can follow with `npm run backlog:render` to update
//      the Markdown views (not done here so the mutate command stays
//      one focused write).
//
// All commands accept a `--sprint <id>` override; default is the
// active sprint.

import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const sprintsDir = resolve(repoRoot, "backlog/sprints");

const [, , subcommand, ...rest] = process.argv;
if (subcommand === undefined || !["claim", "done", "defer"].includes(subcommand)) {
  exit(2, `usage: backlog:claim | backlog:done | backlog:defer <story-id> [...flags]`);
}

const positionals = [];
/** @type {Record<string, string[]>} */
const flags = {};
for (let i = 0; i < rest.length; i++) {
  const token = rest[i];
  if (token.startsWith("--")) {
    const key = token.slice(2);
    const value = rest[i + 1];
    if (value === undefined || value.startsWith("--")) {
      // boolean flag — not used today, but tolerate
      (flags[key] ||= []).push("");
    } else {
      (flags[key] ||= []).push(value);
      i += 1;
    }
  } else {
    positionals.push(token);
  }
}

const storyId = positionals[0];
if (storyId === undefined) exit(2, `${subcommand}: story id is required`);

const overrideSprint = flags["sprint"]?.[0];

const sprintFiles = readdirSync(sprintsDir)
  .filter((n) => n.endsWith(".sprint.json"))
  .map((name) => resolve(sprintsDir, name));

/** @type {{ file: string; data: any } | undefined} */
let target;
for (const file of sprintFiles) {
  const data = JSON.parse(readFileSync(file, "utf8"));
  if (overrideSprint !== undefined) {
    if (data.id === overrideSprint) {
      target = { file, data };
      break;
    }
  } else if (data.status === "active") {
    target = { file, data };
    break;
  }
}

if (target === undefined) {
  exit(1, overrideSprint
    ? `no sprint with id "${overrideSprint}"`
    : `no active sprint (use --sprint <id> to target an archived sprint)`);
}

const story = (target.data.stories ?? []).find((s) => s.id === storyId);
if (story === undefined) {
  exit(1, `sprint ${target.data.id} has no story "${storyId}"`);
}

const beforeSerialized = JSON.stringify(target.data, null, 2);

switch (subcommand) {
  case "claim": {
    if (story.status !== "pending") {
      exit(1, `claim: story ${storyId} is "${story.status}", not "pending"`);
    }
    story.status = "in_progress";
    break;
  }
  case "done": {
    if (story.status === "implemented") {
      exit(1, `done: story ${storyId} is already implemented`);
    }
    const verifications = (flags["verification"] ?? []).filter((v) => v.length > 0);
    if (verifications.length === 0 && (story.verification ?? []).length === 0) {
      exit(1, `done: --verification "..." is required (schema rejects implemented stories with empty verification[])`);
    }
    if (verifications.length > 0) {
      story.verification = [...(story.verification ?? []), ...verifications];
    }
    const deliverables = (flags["deliverable"] ?? []).filter((v) => v.length > 0);
    if (deliverables.length > 0) {
      story.deliverables = [...(story.deliverables ?? []), ...deliverables];
    }
    const summary = flags["summary"]?.[0];
    if (summary !== undefined && summary.length > 0) story.summary = summary;
    story.status = "implemented";
    break;
  }
  case "defer": {
    if (story.status === "deferred") {
      exit(1, `defer: story ${storyId} is already deferred`);
    }
    const reason = flags["reason"]?.[0];
    if (reason === undefined || reason.length === 0) {
      exit(1, `defer: --reason "..." is required`);
    }
    story.status = "deferred";
    story.deferredReason = reason;
    break;
  }
}

writeFileSync(target.file, JSON.stringify(target.data, null, 2) + "\n");

const check = spawnSync(
  "node",
  [resolve(repoRoot, "scripts/backlog/check.mjs")],
  { encoding: "utf8" }
);
if (check.status !== 0) {
  // Roll the change back so the JSON file always passes check.
  writeFileSync(target.file, beforeSerialized + "\n");
  process.stderr.write(check.stdout + check.stderr);
  exit(1, `${subcommand}: write reverted because backlog:check failed.`);
}

process.stdout.write(`${subcommand} ${storyId} → ${story.status}` + (story.deferredReason ? ` (${story.deferredReason})` : "") + "\n");

function exit(code, message) {
  process.stderr.write(`[backlog:${subcommand ?? "mutate"}] ${message}\n`);
  process.exit(code);
}
