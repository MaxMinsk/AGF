#!/usr/bin/env node
// S94 QA-NEXT-PR. Helper for the QA terminal: returns the most-recently-
// merged sprint PR that QA hasn't reviewed yet, plus the acceptance lines
// from the sprint's implemented stories so QA immediately sees what to
// verify.
//
//   node scripts/backlog/qa-next-pr.mjs           # human-readable
//   node scripts/backlog/qa-next-pr.mjs --json    # JSON output for tooling
//
// "Reviewed" = a qa-ticket (live or archived) in `backlog/qa-tickets/`
// references the PR via `foundInPr`. No external state file needed.
//
// Discovery:
//   1. `gh pr list --label sprint --state merged --limit 20 --json
//      number,title,mergedAt,headRefName` for label-tagged sprint PRs.
//   2. Filter: only PRs that don't appear in any qa-ticket's foundInPr.
//   3. Pick the newest unreviewed; if none, exit 0 with "caught up".
//   4. Read the matching `backlog/sprints/S<NN>.sprint.json` (sprint id
//      parsed from the PR title `^S(\d+):`). Extract every implemented
//      story's first verification entry that starts with `acceptance:`.
//   5. Print the PR + acceptance lines.

import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const sprintsDir = resolve(repoRoot, "backlog/sprints");
const qaTicketsDir = resolve(repoRoot, "backlog/qa-tickets");
const qaArchiveDir = resolve(qaTicketsDir, "archive");

const args = process.argv.slice(2);
const wantJson = args.includes("--json");

// ---- 1. Walk every qa-ticket (live + archived) and collect foundInPr.
const reviewedPrs = new Set();
function collectFoundInPr(dir) {
  try {
    if (!statSync(dir).isDirectory()) return;
  } catch {
    return;
  }
  for (const name of readdirSync(dir)) {
    const full = resolve(dir, name);
    try {
      const st = statSync(full);
      if (st.isDirectory()) {
        collectFoundInPr(full);
        continue;
      }
      if (!name.endsWith(".qa-ticket.json")) continue;
      const data = JSON.parse(readFileSync(full, "utf8"));
      if (typeof data.foundInPr === "number") reviewedPrs.add(data.foundInPr);
    } catch {
      // ignore malformed; backlog:check surfaces it elsewhere
    }
  }
}
collectFoundInPr(qaTicketsDir);
collectFoundInPr(qaArchiveDir);

// ---- 2. List merged sprint PRs (gh, label=sprint).
const ghResult = spawnSync(
  "gh",
  [
    "pr",
    "list",
    "--label",
    "sprint",
    "--state",
    "merged",
    "--limit",
    "20",
    "--json",
    "number,title,mergedAt,headRefName"
  ],
  { cwd: repoRoot, encoding: "utf8" }
);
if (ghResult.status !== 0) {
  console.error("[qa-next-pr] gh pr list failed:");
  console.error(ghResult.stderr || ghResult.stdout);
  process.exit(1);
}
let prs;
try {
  prs = JSON.parse(ghResult.stdout || "[]");
} catch (err) {
  console.error(`[qa-next-pr] gh output was not JSON: ${err.message}`);
  process.exit(1);
}

// ---- 3. Filter + pick the newest unreviewed.
const unreviewed = prs.filter((p) => !reviewedPrs.has(p.number));
unreviewed.sort((a, b) => String(b.mergedAt).localeCompare(String(a.mergedAt)));
const target = unreviewed[0];

if (target === undefined) {
  if (wantJson) {
    process.stdout.write(JSON.stringify({ status: "caught-up" }) + "\n");
  } else {
    console.log("[qa-next-pr] No unreviewed sprint PR. Caught up.");
  }
  process.exit(0);
}

// ---- 4. Read the matching sprint JSON, extract acceptance lines.
const sprintMatch = /^S(\d+):/.exec(target.title);
let sprintId;
let acceptance = [];
let sprintTitle;
if (sprintMatch !== null) {
  sprintId = "S" + sprintMatch[1].padStart(3, "0");
  const sprintFile = resolve(sprintsDir, `${sprintId}.sprint.json`);
  try {
    const sprintData = JSON.parse(readFileSync(sprintFile, "utf8"));
    sprintTitle = sprintData.title;
    for (const story of sprintData.stories ?? []) {
      if (story.status !== "implemented") continue;
      const first = Array.isArray(story.verification) ? story.verification[0] : undefined;
      if (typeof first === "string" && /^acceptance\s*:/i.test(first.trim())) {
        acceptance.push({ storyId: story.id, line: first.trim() });
      }
    }
  } catch {
    // sprint file missing — surface as a warning but still report the PR.
  }
}

// ---- 5. Render.
if (wantJson) {
  process.stdout.write(JSON.stringify({
    status: "review",
    pr: { number: target.number, title: target.title, mergedAt: target.mergedAt, branch: target.headRefName },
    sprintId,
    sprintTitle,
    acceptance
  }, null, 2) + "\n");
  process.exit(0);
}

console.log(`[qa-next-pr] Next unreviewed sprint PR:`);
console.log(`  #${target.number}: ${target.title}`);
console.log(`  merged: ${target.mergedAt}`);
console.log(`  branch: ${target.headRefName}`);
if (sprintId !== undefined) console.log(`  sprint: ${sprintId} — ${sprintTitle ?? "(title unknown)"}`);
if (acceptance.length > 0) {
  console.log(`  acceptance criteria (${acceptance.length}):`);
  for (const a of acceptance) {
    console.log(`    [${a.storyId}] ${a.line}`);
  }
} else {
  console.log(`  acceptance criteria: (none found — check the sprint JSON manually)`);
}
console.log(``);
console.log(`Next steps:`);
console.log(`  - Boot the affected project; walk each acceptance line.`);
console.log(`  - File tickets via \`npm run qa:ticket -- new "<title>" --found-in-pr ${target.number}\`.`);
console.log(`  - Push to qa-intake/YYYY-WW and open the PR with --label qa-intake.`);
