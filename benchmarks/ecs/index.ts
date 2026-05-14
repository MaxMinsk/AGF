// CLI entry for `npm run bench:ecs`.
//
// Each *.bench.ts file exports a single `runXxxBench(): Promise<SuiteResult>`.
// Run them serially so timings don't compete for the same JIT slot. Output:
//
//   npm run bench:ecs                  # human table
//   npm run bench:ecs -- --json        # machine-readable JSON (agent path)
//   npm run bench:ecs -- --suite query # filter to a single suite
//
// Add a new bench:
//   1. Create benchmarks/ecs/<name>.bench.ts exporting runXxxBench.
//   2. Register it in the SUITES array below.
//   3. `npm run bench:ecs -- --suite <name>` to dev it in isolation.

import { formatJson, formatTable, type SuiteResult } from "./runner";
import { runSnapshotBench } from "./snapshot.bench";
import { runQueryBench } from "./query.bench";
import { runHierarchyBench } from "./hierarchy.bench";

type SuiteEntry = {
  key: string;
  run: () => Promise<SuiteResult>;
};

const SUITES: ReadonlyArray<SuiteEntry> = [
  { key: "snapshot", run: runSnapshotBench },
  { key: "query", run: runQueryBench },
  { key: "hierarchy", run: runHierarchyBench }
];

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const wantsJson = args.includes("--json");
  const suiteIndex = args.indexOf("--suite");
  const onlySuite = suiteIndex >= 0 ? args[suiteIndex + 1] : undefined;

  const matched = onlySuite === undefined
    ? SUITES
    : SUITES.filter((s) => s.key === onlySuite);
  if (matched.length === 0) {
    console.error(`No suite matches "${onlySuite ?? ""}". Known: ${SUITES.map((s) => s.key).join(", ")}`);
    process.exitCode = 1;
    return;
  }

  const results: SuiteResult[] = [];
  for (const suite of matched) {
    const r = await suite.run();
    results.push(r);
    if (!wantsJson) {
      console.log(formatTable(r));
      console.log("");
    }
  }

  if (wantsJson) {
    console.log(formatJson(results));
  }
}

void main();
