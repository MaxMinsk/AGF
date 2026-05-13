import { checkProject, formatDiagnostics } from "./check/project-check";

type ParsedArgs = {
  command: string | undefined;
  projectDir: string;
  json: boolean;
};

const parsedArgs = parseArgs(process.argv.slice(2));

if (parsedArgs.command !== "check") {
  printUsage();
  process.exitCode = 2;
} else {
  const result = checkProject(parsedArgs.projectDir);

  if (parsedArgs.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(formatDiagnostics(result));
  }

  process.exitCode = result.ok ? 0 : 1;
}

function parseArgs(args: string[]): ParsedArgs {
  const command = args[0];
  const rest = args.slice(1);
  const json = rest.includes("--json");
  const positional = rest.filter((arg) => arg !== "--json");

  return {
    command,
    projectDir: positional[0] ?? ".",
    json
  };
}

function printUsage(): void {
  console.error("Usage: engine check <projectDir> [--json]");
}
