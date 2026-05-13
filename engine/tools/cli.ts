import { checkProject, formatDiagnostics } from "./check/project-check";
import {
  formatInspection,
  inspectProject,
  type InspectOptions
} from "./inspect/project-inspect";
import {
  diffSnapshots,
  formatDiff,
  readInspectSnapshot,
  type SnapshotDiffResult
} from "./inspect/snapshot-diff";

type ParsedArgs = {
  command: string | undefined;
  projectDir: string;
  json: boolean;
  components: string[];
  entityIds: string[];
  diffPaths: [string, string] | undefined;
  positional: string[];
};

const parsedArgs = parseArgs(process.argv.slice(2));

if (parsedArgs.command === "check") {
  const result = checkProject(parsedArgs.projectDir);

  if (parsedArgs.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(formatDiagnostics(result));
  }

  process.exitCode = result.ok ? 0 : 1;
} else if (parsedArgs.command === "inspect") {
  if (parsedArgs.diffPaths !== undefined) {
    const [previousPath, nextPath] = parsedArgs.diffPaths;
    const previous = readInspectSnapshot(previousPath);
    const next = readInspectSnapshot(nextPath);
    const changes = diffSnapshots(previous, next);
    const result: SnapshotDiffResult = {
      ok: true,
      previousPath,
      nextPath,
      changeCount: changes.length,
      changes
    };
    if (parsedArgs.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(formatDiff(result));
    }
    process.exitCode = 0;
  } else {
    const options: InspectOptions = {};
    if (parsedArgs.components.length > 0) {
      options.components = parsedArgs.components;
    }
    if (parsedArgs.entityIds.length > 0) {
      options.entityIds = parsedArgs.entityIds;
    }
    const result = inspectProject(parsedArgs.projectDir, options);

    if (parsedArgs.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(formatInspection(result));
    }

    process.exitCode = result.ok ? 0 : 1;
  }
} else {
  printUsage();
  process.exitCode = 2;
}

function parseArgs(args: string[]): ParsedArgs {
  const result: ParsedArgs = {
    command: args[0],
    projectDir: ".",
    json: false,
    components: [],
    entityIds: [],
    diffPaths: undefined,
    positional: []
  };

  for (let index = 1; index < args.length; index += 1) {
    const current = args[index];
    if (current === undefined) {
      continue;
    }
    if (current === "--json") {
      result.json = true;
      continue;
    }
    if (current === "--component") {
      const value = args[++index];
      if (value !== undefined && value.length > 0) {
        result.components.push(value);
      }
      continue;
    }
    if (current === "--query") {
      const value = args[++index];
      if (value !== undefined && value.length > 0) {
        for (const piece of value.split(",")) {
          const trimmed = piece.trim();
          if (trimmed.length > 0) {
            result.components.push(trimmed);
          }
        }
      }
      continue;
    }
    if (current === "--entity") {
      const value = args[++index];
      if (value !== undefined && value.length > 0) {
        result.entityIds.push(value);
      }
      continue;
    }
    if (current === "--diff") {
      const a = args[++index];
      const b = args[++index];
      if (a !== undefined && b !== undefined) {
        result.diffPaths = [a, b];
      }
      continue;
    }
    if (current.startsWith("--")) {
      continue;
    }
    result.positional.push(current);
  }

  const firstPositional = result.positional[0];
  if (firstPositional !== undefined) {
    result.projectDir = firstPositional;
  }

  return result;
}

function printUsage(): void {
  console.error(
    [
      "Usage:",
      "  engine check <projectDir> [--json]",
      "  engine inspect <projectDir> [--component <Name>] [--query A,B] [--entity <id>] [--json]",
      "  engine inspect --diff <previous.json> <next.json> [--json]"
    ].join("\n")
  );
}
