#!/usr/bin/env node
// S83 AGF-LOG-CI-GATE. Rejects raw `console.{log,warn,error,info,debug,trace}`
// in engine/** and examples/**/src/** per docs/diagnostics-policy.md.
// Allowlist: precede the call with `// agf-allow:console <reason>` on the
// same or previous non-blank line.
//
// Walks git-tracked files only (matches existing check-repo-hygiene.mjs
// pattern). Runs against .ts / .tsx / .mjs files in scope; skips test
// fixtures + tooling scripts.

import { execSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";

const SCOPE = [/^engine\//, /^examples\/[^/]+\/src\//, /^examples\/[^/]+\/bootstrap\.ts$/];
const SKIP = [/\.test\.ts$/, /\.spec\.ts$/, /\/tests?\//];
const EXTENSIONS = [".ts", ".tsx", ".mjs"];

// One regex covers all forbidden methods. Word boundary on the method
// name so `customConsole.log` doesn't trip the gate.
const CONSOLE_RE = /\bconsole\.(log|warn|error|info|debug|trace)\s*\(/g;
const ALLOW_MARKER = /\/\/\s*agf-allow:console\b/;
// File-level allowlist marker — must appear before the first import or
// non-comment statement. Used for CLI / tooling files where every
// console.* call is intentional terminal output (e.g. engine CLI
// commands). Requires a rationale after the marker, same as the
// per-line variant.
const FILE_MARKER = /\/\/\s*agf-allow:console-file\b/;

function listTrackedFiles() {
  const raw = execSync("git ls-files -z", { encoding: "buffer" });
  return raw.toString("utf8").split("\0").filter(Boolean);
}

function inScope(path) {
  if (!EXTENSIONS.some((ext) => path.endsWith(ext))) return false;
  if (SKIP.some((re) => re.test(path))) return false;
  return SCOPE.some((re) => re.test(path));
}

function safeRead(filePath) {
  try {
    const stats = statSync(filePath);
    if (!stats.isFile()) return undefined;
    return readFileSync(filePath, "utf8");
  } catch {
    return undefined;
  }
}

const allFiles = listTrackedFiles().filter(inScope);
const violations = [];

for (const file of allFiles) {
  const src = safeRead(file);
  if (src === undefined) continue;
  // File-level marker scan: any of the first 30 lines may carry the
  // allowlist. 30 is plenty for a banner + import block.
  const header = src.split("\n", 30).join("\n");
  if (FILE_MARKER.test(header)) continue;
  const lines = src.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line === undefined) continue;
    CONSOLE_RE.lastIndex = 0;
    let match;
    while ((match = CONSOLE_RE.exec(line)) !== null) {
      // Allow markers can sit on the same line, the previous non-blank
      // line, or up to 3 lines above (covers eslint-disable patterns).
      let allowed = ALLOW_MARKER.test(line);
      if (!allowed) {
        for (let look = i - 1; look >= Math.max(0, i - 3); look -= 1) {
          const prev = lines[look];
          if (prev === undefined) continue;
          if (prev.trim() === "") continue;
          if (ALLOW_MARKER.test(prev)) {
            allowed = true;
            break;
          }
          break;
        }
      }
      if (!allowed) {
        violations.push({ file, line: i + 1, method: match[1] ?? "log" });
      }
    }
  }
}

if (violations.length > 0) {
  console.error(`[check-no-console-log] FAIL — ${violations.length} disallowed console.* call(s):`);
  for (const v of violations.slice(0, 50)) {
    console.error(`  ${v.file}:${v.line}  console.${v.method}(`);
  }
  if (violations.length > 50) console.error(`  …and ${violations.length - 50} more.`);
  console.error("[check-no-console-log] See docs/diagnostics-policy.md.");
  console.error("[check-no-console-log] Replace with runtime.diagnostics.emit({...}) or createDebugLogger,");
  console.error("[check-no-console-log] or mark the call with `// agf-allow:console <reason>` on the prior line.");
  process.exit(1);
}

console.log(`[check-no-console-log] OK — ${allFiles.length} files in scope, no disallowed console.* calls.`);
