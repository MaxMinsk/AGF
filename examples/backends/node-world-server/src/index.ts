// Node + TypeScript reference backend skeleton.
//
// v0: load schemas/protocol.schema.json, compile it with AJV, validate a small
// set of representative messages, and exit cleanly. No transport yet — picking
// SignalR / WebSocket is the next deliverable when a real client wants to
// connect.

import Ajv, { type AnySchema, type ValidateFunction } from "ajv";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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
console.log("[node-world-server] protocol schema loaded; awaiting client transport implementation.");
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
