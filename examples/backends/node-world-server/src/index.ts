// Node + TypeScript reference backend.
//
// Two modes:
//   * default: smoke-test mode. Load schemas/protocol.schema.json, compile it
//     with AJV, validate a small set of representative messages, exit cleanly.
//   * --serve: long-running mode. Opens a WebSocket transport on PORT (default
//     8787) and runs the authoritative ServerWorld.

import Ajv, { type AnySchema, type ValidateFunction } from "ajv";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ServerWorld } from "./world.js";
import { startWsTransport } from "./transport-ws.js";

type Sample = {
  label: string;
  message: unknown;
};

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..", "..", "..");
const schemaPath = resolve(repoRoot, "schemas/protocol.schema.json");

const schema = JSON.parse(readFileSync(schemaPath, "utf8")) as AnySchema;
const ajv = new Ajv({ allErrors: true, strict: false });
const validate: ValidateFunction = ajv.compile(schema);

const args = new Set(process.argv.slice(2));
const serveMode = args.has("--serve");

if (serveMode) {
  await runServe();
} else {
  runSmoke();
}

function runSmoke(): void {
  const samples: ReadonlyArray<Sample> = [
    {
      label: "player.join",
      message: { kind: "player.join", payload: { playerId: "alpha" } }
    },
    {
      label: "player.leave",
      message: {
        kind: "player.leave",
        payload: { playerId: "alpha", reason: "disconnect" }
      }
    },
    {
      label: "intent.move",
      message: {
        kind: "intent.move",
        sequence: 0,
        payload: { playerId: "alpha", direction: [1, 0] }
      }
    },
    {
      label: "world.snapshot",
      message: {
        kind: "world.snapshot",
        sequence: 0,
        payload: {
          elapsed: 0,
          entities: [
            {
              id: "player.alpha",
              components: { Transform: { position: [0, 0, 0] } }
            }
          ]
        }
      }
    }
  ];

  console.log("[node-world-server] starting...");
  console.log("[node-world-server] protocol schema loaded; smoke-test mode (no transport).");
  console.log("");
  console.log("Smoke test:");

  let failures = 0;
  for (const sample of samples) {
    const ok = validate(sample.message);
    if (ok) {
      console.log(`  ${sample.label}: valid`);
    } else {
      failures += 1;
      console.log(`  ${sample.label}: INVALID — ${ajv.errorsText(validate.errors)}`);
    }
  }

  if (failures > 0) {
    console.error(`\n${failures} sample message(s) failed validation. Aborting.`);
    process.exit(1);
  }
}

async function runServe(): Promise<void> {
  const port = Number.parseInt(process.env["PORT"] ?? "8787", 10);
  const world = new ServerWorld();
  const transport = await startWsTransport({ port, world, validate });
  console.log("[node-world-server] serve mode running. Ctrl-C to stop.");

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`[node-world-server] received ${signal}, closing transport...`);
    await transport.close();
    process.exit(0);
  };
  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
}
