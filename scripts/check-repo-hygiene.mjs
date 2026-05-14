#!/usr/bin/env node
// Local mirror of `.github/workflows/repo-hygiene.yml`'s Cyrillic check so
// `npm run preflight` catches violations before CI does. Walks `git ls-files`
// directly so it does not depend on ripgrep, and skips binary files the same
// way CI does (anything with NUL bytes in the first 8 KiB).
//
// Fail conditions match the workflow:
//  - any tracked, non-binary, non-ignored file contains a Cyrillic codepoint.

import { execSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";

const CYRILLIC = /\p{Script=Cyrillic}/u;

function listTrackedFiles() {
  const raw = execSync("git ls-files -z", { encoding: "buffer" });
  return raw
    .toString("utf8")
    .split("\0")
    .filter(Boolean);
}

function isBinary(filePath) {
  try {
    const stats = statSync(filePath);
    if (!stats.isFile() || stats.size === 0) return true;
    const sampleSize = Math.min(stats.size, 8192);
    const buf = Buffer.alloc(sampleSize);
    const fs = readFileSync(filePath);
    return fs.subarray(0, sampleSize).includes(0);
  } catch {
    return true;
  }
}

const tracked = listTrackedFiles();
const violations = [];

for (const file of tracked) {
  if (isBinary(file)) continue;
  let content;
  try {
    content = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  if (CYRILLIC.test(content)) {
    violations.push(file);
  }
}

if (violations.length > 0) {
  console.error(
    `[repo-hygiene] FAIL — ${violations.length} tracked file(s) contain Cyrillic characters:`
  );
  for (const file of violations) console.error(`  - ${file}`);
  console.error(
    "\nRepository content must stay English (see CLAUDE.md and AGENTS.md). Move personal notes to the gitignored Notes/ folder, or translate the file."
  );
  process.exit(1);
}

console.log(`[repo-hygiene] OK — scanned ${tracked.length} tracked file(s), no Cyrillic characters.`);
