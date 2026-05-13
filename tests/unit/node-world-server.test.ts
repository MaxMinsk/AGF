import { describe, expect, it } from "vitest";
import Ajv from "ajv";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { WebSocket } from "ws";
import { ServerWorld } from "../../examples/backends/node-world-server/src/world.js";
import { startWsTransport } from "../../examples/backends/node-world-server/src/transport-ws.js";

type ProtocolMessage = { kind: string; sequence?: number; payload: unknown };

function createValidate(): import("ajv").ValidateFunction {
  const schemaPath = resolve(process.cwd(), "schemas/protocol.schema.json");
  const schema = JSON.parse(readFileSync(schemaPath, "utf8"));
  const ajv = new Ajv({ allErrors: true, strict: false });
  return ajv.compile(schema);
}

function pickFreePort(): number {
  return 18000 + Math.floor(Math.random() * 1000);
}

describe("node-world-server WebSocket transport", () => {
  it("joins a player, applies an intent and broadcasts a snapshot that moves the player", async () => {
    const world = new ServerWorld();
    const transport = await startWsTransport({
      port: pickFreePort(),
      world,
      validate: createValidate(),
      tickHz: 60,
      log: () => undefined
    });
    try {
      const client = new WebSocket(`ws://127.0.0.1:${transport.port}`);
      await new Promise<void>((resolve, reject) => {
        client.once("open", () => resolve());
        client.once("error", (error) => reject(error));
      });

      const inbound: ProtocolMessage[] = [];
      client.on("message", (data) => {
        inbound.push(JSON.parse(String(data)));
      });

      client.send(
        JSON.stringify({ kind: "player.join", payload: { playerId: "alpha" } })
      );
      client.send(
        JSON.stringify({
          kind: "intent.move",
          sequence: 0,
          payload: { playerId: "alpha", direction: [1, 0] }
        })
      );

      await waitFor(() => {
        const last = inbound.at(-1);
        if (last === undefined || last.kind !== "world.snapshot") {
          return false;
        }
        const payload = last.payload as {
          entities: Array<{ id: string; components: Record<string, unknown> }>;
        };
        const player = payload.entities.find((entity) => entity.id === "player.alpha");
        if (player === undefined) {
          return false;
        }
        const transform = player.components["Transform"] as { position: [number, number, number] };
        return transform.position[0] > 0;
      });

      const last = inbound.at(-1) as ProtocolMessage;
      const player = (last.payload as {
        entities: Array<{ id: string; components: Record<string, unknown> }>;
      }).entities.find((entity) => entity.id === "player.alpha");
      expect(player).toBeDefined();
      const transform = player!.components["Transform"] as { position: [number, number, number] };
      expect(transform.position[0]).toBeGreaterThan(0);
      expect(transform.position[2]).toBe(0);

      client.close();
    } finally {
      await transport.close();
    }
  }, 5000);

  it("drops a player whose intent.move has not arrived within playerTimeoutSeconds", async () => {
    const world = new ServerWorld();
    const log: string[] = [];
    const transport = await startWsTransport({
      port: pickFreePort(),
      world,
      validate: createValidate(),
      tickHz: 120,
      playerTimeoutSeconds: 0.2,
      log: (line) => log.push(line)
    });
    try {
      const client = new WebSocket(`ws://127.0.0.1:${transport.port}`);
      await new Promise<void>((resolve) => client.once("open", () => resolve()));

      client.send(JSON.stringify({ kind: "player.join", payload: { playerId: "idle" } }));
      await waitFor(() => world.playerCount() === 1);

      await waitFor(() => world.playerCount() === 0, 3000);
      expect(world.playerCount()).toBe(0);
      expect(log.some((line) => line.includes("timeout playerId=idle"))).toBe(true);
      client.close();
    } finally {
      await transport.close();
    }
  }, 5000);

  it("drops a frame that fails AJV validation without crashing", async () => {
    const world = new ServerWorld();
    const log: string[] = [];
    const transport = await startWsTransport({
      port: pickFreePort(),
      world,
      validate: createValidate(),
      tickHz: 30,
      log: (line) => log.push(line)
    });
    try {
      const client = new WebSocket(`ws://127.0.0.1:${transport.port}`);
      await new Promise<void>((resolve) => client.once("open", () => resolve()));
      client.send(JSON.stringify({ kind: "intent.move", payload: { wrong: true } }));
      await waitFor(() => log.some((line) => line.includes("dropping invalid frame")));
      expect(world.playerCount()).toBe(0);
      client.close();
    } finally {
      await transport.close();
    }
  }, 5000);
});

async function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("waitFor timed out");
}
