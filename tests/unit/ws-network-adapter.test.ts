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

  it("detects a sequence gap, resyncs by deleting server-owned entities and rebuilds from the next snapshot", async () => {
    type Listener = (event: { data: string }) => void;
    class FakeSocket {
      readyState = 1;
      messageListeners: Listener[] = [];
      openListeners: Array<() => void> = [];
      constructor(public url: string) {
        setTimeout(() => {
          for (const handler of this.openListeners) {
            handler();
          }
        }, 0);
      }
      addEventListener(type: string, handler: () => void): void {
        if (type === "open") {
          this.openListeners.push(handler);
        } else if (type === "message") {
          this.messageListeners.push(handler as Listener);
        }
      }
      send(): void {}
      close(): void {}
      emit(payload: unknown): void {
        const event = { data: JSON.stringify(payload) };
        for (const listener of this.messageListeners) {
          listener(event);
        }
      }
    }

    const sockets: FakeSocket[] = [];
    const factory = function (url: string) {
      const socket = new FakeSocket(url);
      sockets.push(socket);
      return socket;
    } as unknown as typeof globalThis.WebSocket;

    const clientWorld = new World();
    const logLines: string[] = [];
    const adapter = startWsNetworkAdapter({
      url: "ws://fake",
      playerId: "delta",
      applyCommands: (commands) => applyAll(clientWorld, commands),
      knownEntityIds: () => clientWorld.entityIds(),
      log: (line) => logLines.push(line),
      WebSocketCtor: factory
    });
    try {
      await new Promise((resolve) => setTimeout(resolve, 5));
      const socket = sockets[0]!;

      socket.emit({
        kind: "world.snapshot",
        sequence: 0,
        payload: {
          entities: [
            { id: "player.delta", components: { Transform: { position: [0, 0, 0] } } },
            { id: "player.echo", components: { Transform: { position: [1, 0, 0] } } }
          ]
        }
      });
      socket.emit({
        kind: "world.snapshot",
        sequence: 1,
        payload: {
          entities: [
            { id: "player.delta", components: { Transform: { position: [0, 0, 0] } } },
            { id: "player.echo", components: { Transform: { position: [1.1, 0, 0] } } }
          ]
        }
      });

      expect(clientWorld.hasEntity("player.echo")).toBe(true);
      expect(adapter.snapshotGapCount()).toBe(0);

      socket.emit({
        kind: "world.snapshot",
        sequence: 5,
        payload: {
          entities: [
            { id: "player.delta", components: { Transform: { position: [0, 0, 0] } } }
          ]
        }
      });

      expect(adapter.snapshotGapCount()).toBe(1);
      expect(clientWorld.hasEntity("player.echo")).toBe(false);
      expect(clientWorld.hasEntity("player.delta")).toBe(true);
      expect(logLines.some((line) => line.includes("snapshot gap"))).toBe(true);

      socket.emit({
        kind: "world.snapshot",
        sequence: 6,
        payload: {
          entities: [
            { id: "player.delta", components: { Transform: { position: [0, 0, 0] } } },
            { id: "player.echo", components: { Transform: { position: [2, 0, 0] } } }
          ]
        }
      });
      expect(clientWorld.hasEntity("player.echo")).toBe(true);
      expect(adapter.snapshotGapCount()).toBe(1);
    } finally {
      adapter.dispose();
    }
  });

  it("drops a snapshot entity whose id collides with a local entity, leaving the local one intact", async () => {
    type Listener = (event: { data: string }) => void;
    class FakeSocket {
      readyState = 1;
      messageListeners: Listener[] = [];
      openListeners: Array<() => void> = [];
      constructor(public url: string) {
        setTimeout(() => {
          for (const handler of this.openListeners) {
            handler();
          }
        }, 0);
      }
      addEventListener(type: string, handler: () => void): void {
        if (type === "open") {
          this.openListeners.push(handler);
        } else if (type === "message") {
          this.messageListeners.push(handler as Listener);
        }
      }
      send(): void {}
      close(): void {}
      emit(payload: unknown): void {
        const event = { data: JSON.stringify(payload) };
        for (const listener of this.messageListeners) {
          listener(event);
        }
      }
    }

    const sockets: FakeSocket[] = [];
    const factory = function (url: string) {
      const socket = new FakeSocket(url);
      sockets.push(socket);
      return socket;
    } as unknown as typeof globalThis.WebSocket;

    const clientWorld = new World();
    clientWorld.addEntity("player.drone");
    clientWorld.setComponent("player.drone", "Transform", { position: [9, 9, 9] });

    const logLines: string[] = [];
    const adapter = startWsNetworkAdapter({
      url: "ws://fake",
      playerId: "echo",
      applyCommands: (commands) => applyAll(clientWorld, commands),
      knownEntityIds: () => clientWorld.entityIds(),
      log: (line) => logLines.push(line),
      WebSocketCtor: factory
    });

    try {
      await new Promise((resolve) => setTimeout(resolve, 5));
      const socket = sockets[0]!;

      socket.emit({
        kind: "world.snapshot",
        sequence: 0,
        payload: {
          entities: [
            { id: "player.drone", components: { Transform: { position: [0, 0, 0] } } },
            { id: "player.echo", components: { Transform: { position: [1, 0, 0] } } }
          ]
        }
      });

      expect(clientWorld.hasEntity("player.drone")).toBe(true);
      const droneTransform = clientWorld.getComponent<{
        position: [number, number, number];
      }>("player.drone", "Transform");
      expect(droneTransform?.position).toEqual([9, 9, 9]);
      expect(clientWorld.hasEntity("player.echo")).toBe(true);
      expect(logLines.some((line) => line.includes('dropping snapshot entity "player.drone"'))).toBe(
        true
      );
    } finally {
      adapter.dispose();
      expect(clientWorld.hasEntity("player.drone")).toBe(true);
    }
  });

  it("drops an inbound frame that fails protocol schema validation", async () => {
    type Listener = (event: { data: string }) => void;
    class FakeSocket {
      readyState = 1;
      messageListeners: Listener[] = [];
      openListeners: Array<() => void> = [];
      constructor(public url: string) {
        setTimeout(() => {
          for (const handler of this.openListeners) {
            handler();
          }
        }, 0);
      }
      addEventListener(type: string, handler: () => void): void {
        if (type === "open") {
          this.openListeners.push(handler);
        } else if (type === "message") {
          this.messageListeners.push(handler as Listener);
        }
      }
      send(): void {}
      close(): void {}
      emit(payload: unknown): void {
        const event = { data: JSON.stringify(payload) };
        for (const listener of this.messageListeners) {
          listener(event);
        }
      }
    }

    const sockets: FakeSocket[] = [];
    const factory = function (url: string) {
      const socket = new FakeSocket(url);
      sockets.push(socket);
      return socket;
    } as unknown as typeof globalThis.WebSocket;

    const clientWorld = new World();
    const logLines: string[] = [];
    const adapter = startWsNetworkAdapter({
      url: "ws://fake",
      playerId: "zeta",
      applyCommands: (commands) => applyAll(clientWorld, commands),
      log: (line) => logLines.push(line),
      WebSocketCtor: factory
    });

    try {
      await new Promise((resolve) => setTimeout(resolve, 5));
      const socket = sockets[0]!;

      socket.emit({ kind: "intent.move", payload: { wrong: true } });
      expect(logLines.some((line) => line.includes("dropping invalid frame"))).toBe(true);
      expect(clientWorld.entityIds()).toEqual([]);
    } finally {
      adapter.dispose();
    }
  });

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
