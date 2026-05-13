import { describe, expect, it } from "vitest";
import Ajv from "ajv";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { WebSocket } from "ws";
import { ServerWorld } from "../../examples/backends/node-world-server/src/world.js";
import { startWsTransport } from "../../examples/backends/node-world-server/src/transport-ws.js";
import { startWsNetworkAdapter } from "../../engine/runtime/network/ws-network-adapter";
import { World } from "../../engine/core/ecs/world";
import { applyCommand } from "../../engine/core/commands/command-queue";
import type { EngineCommand } from "../../engine/core/commands/types";

type ValidateFn = import("ajv").ValidateFunction;

function createValidate(): ValidateFn {
  const schemaPath = resolve(process.cwd(), "schemas/protocol.schema.json");
  const schema = JSON.parse(readFileSync(schemaPath, "utf8"));
  return new Ajv({ allErrors: true, strict: false }).compile(schema);
}

function pickFreePort(): number {
  return 19000 + Math.floor(Math.random() * 1000);
}

function applyAll(world: World, commands: ReadonlyArray<EngineCommand>): void {
  for (const command of commands) {
    applyCommand(world, command);
  }
}

async function waitFor(predicate: () => boolean, timeoutMs = 3000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("waitFor timed out");
}

describe("WsNetworkAdapter ↔ node-world-server", () => {
  it("creates a server-owned entity in the local world and updates its Transform from inbound snapshots", async () => {
    const serverWorld = new ServerWorld();
    const transport = await startWsTransport({
      port: pickFreePort(),
      world: serverWorld,
      validate: createValidate(),
      tickHz: 60,
      log: () => undefined
    });
    try {
      const clientWorld = new World();
      clientWorld.addEntity("local.thing");

      const adapter = startWsNetworkAdapter({
        url: `ws://127.0.0.1:${transport.port}`,
        playerId: "alpha",
        applyCommands: (commands) => applyAll(clientWorld, commands),
        knownEntityIds: () => clientWorld.entityIds(),
        log: () => undefined,
        WebSocketCtor: WebSocket as unknown as typeof globalThis.WebSocket
      });

      try {
        await waitFor(() => clientWorld.hasEntity("player.alpha"));

        adapter.sendIntent([1, 0]);

        await waitFor(() => {
          const transform = clientWorld.getComponent<{
            position: [number, number, number];
          }>("player.alpha", "Transform");
          return transform !== undefined && transform.position[0] > 0;
        });

        const transform = clientWorld.getComponent<{
          position: [number, number, number];
        }>("player.alpha", "Transform");
        expect(transform?.position[0]).toBeGreaterThan(0);
        expect(adapter.lastSnapshotSequence()).toBeTypeOf("number");
        expect(clientWorld.hasEntity("local.thing")).toBe(true);
      } finally {
        adapter.dispose();
      }
    } finally {
      await transport.close();
    }
  }, 5000);

  it("reconnects on unexpected close and rejoins the server with the same playerId", async () => {
    const port = pickFreePort();
    const validate = createValidate();
    const world1 = new ServerWorld();
    let transport = await startWsTransport({
      port,
      world: world1,
      validate,
      tickHz: 60,
      log: () => undefined
    });

    const clientWorld = new World();
    const logLines: string[] = [];
    const adapter = startWsNetworkAdapter({
      url: `ws://127.0.0.1:${port}`,
      playerId: "gamma",
      applyCommands: (commands) => applyAll(clientWorld, commands),
      knownEntityIds: () => clientWorld.entityIds(),
      reconnect: { initialDelayMs: 30, maxDelayMs: 100 },
      log: (line) => logLines.push(line),
      WebSocketCtor: WebSocket as unknown as typeof globalThis.WebSocket
    });

    try {
      await waitFor(() => clientWorld.hasEntity("player.gamma"));
      const initialCount = adapter.reconnectCount();

      await transport.close();
      await waitFor(() => !clientWorld.hasEntity("player.gamma"));

      const world2 = new ServerWorld();
      transport = await startWsTransport({
        port,
        world: world2,
        validate,
        tickHz: 60,
        log: () => undefined
      });

      await waitFor(() => clientWorld.hasEntity("player.gamma"), 4000);
      expect(adapter.reconnectCount()).toBeGreaterThan(initialCount);
    } finally {
      adapter.dispose();
      await transport.close();
    }
  }, 8000);

  it("dispose() removes server-owned entities without touching local ones", async () => {
    const serverWorld = new ServerWorld();
    const transport = await startWsTransport({
      port: pickFreePort(),
      world: serverWorld,
      validate: createValidate(),
      tickHz: 60,
      log: () => undefined
    });
    try {
      const clientWorld = new World();
      clientWorld.addEntity("local.thing");

      const adapter = startWsNetworkAdapter({
        url: `ws://127.0.0.1:${transport.port}`,
        playerId: "beta",
        applyCommands: (commands) => applyAll(clientWorld, commands),
        knownEntityIds: () => clientWorld.entityIds(),
        log: () => undefined,
        WebSocketCtor: WebSocket as unknown as typeof globalThis.WebSocket
      });
      await waitFor(() => clientWorld.hasEntity("player.beta"));
      adapter.dispose();
      expect(clientWorld.hasEntity("player.beta")).toBe(false);
      expect(clientWorld.hasEntity("local.thing")).toBe(true);
    } finally {
      await transport.close();
    }
  }, 5000);
});
