import { test, expect } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type Snapshot = {
  entities: Array<{
    id: string;
    components: Record<string, unknown>;
  }>;
};

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function pickPort(): number {
  return 28000 + Math.floor(Math.random() * 2000);
}

async function startBackend(port: number): Promise<ChildProcess> {
  const child = spawn(
    "npx",
    ["tsx", "examples/backends/node-world-server/src/index.ts", "--serve"],
    {
      cwd: REPO_ROOT,
      env: { ...process.env, PORT: String(port) },
      stdio: ["ignore", "pipe", "pipe"]
    }
  );
  await new Promise<void>((resolveReady, rejectReady) => {
    const timer = setTimeout(() => rejectReady(new Error("backend boot timeout")), 15000);
    const onData = (chunk: Buffer): void => {
      const text = chunk.toString();
      if (text.includes("websocket listening")) {
        clearTimeout(timer);
        child.stdout?.off("data", onData);
        resolveReady();
      }
    };
    child.stdout?.on("data", onData);
    child.once("exit", (code) => {
      clearTimeout(timer);
      rejectReady(new Error(`backend exited early code=${code}`));
    });
  });
  return child;
}

async function stopBackend(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) {
    return;
  }
  child.kill("SIGTERM");
  await new Promise<void>((resolveExit) => {
    child.once("exit", () => resolveExit());
    setTimeout(() => {
      if (child.exitCode === null) {
        child.kill("SIGKILL");
      }
      resolveExit();
    }, 3000);
  });
}

test("two browser clients see each other's server-owned entities", async ({ browser }, testInfo) => {
  const port = pickPort();
  const backend = await startBackend(port);
  try {
    const alphaContext = await browser.newContext();
    const bravoContext = await browser.newContext();
    const alpha = await alphaContext.newPage();
    const bravo = await bravoContext.newPage();
    try {
      const url = (playerId: string): string =>
        `/?project=beacon-world&server=ws://127.0.0.1:${port}&networked=1&playerId=${playerId}`;

      await alpha.goto(url("alpha"));
      await bravo.goto(url("bravo"));
      await alpha.waitForFunction(() => Boolean(window.__agf));
      await bravo.waitForFunction(() => Boolean(window.__agf));

      const hasPlayer = async (page: typeof alpha, id: string): Promise<boolean> => {
        const snapshot = (await page.evaluate(() => window.__agf!.snapshot())) as Snapshot;
        return snapshot.entities.some((entity) => entity.id === id);
      };

      await alpha.waitForFunction(
        (target: { selfId: string; peerId: string }) => {
          const ids = (window.__agf!.snapshot() as Snapshot).entities.map((entity) => entity.id);
          return ids.includes(target.selfId) && ids.includes(target.peerId);
        },
        { selfId: "player.alpha", peerId: "player.bravo" },
        { timeout: 5000 }
      );
      await bravo.waitForFunction(
        (target: { selfId: string; peerId: string }) => {
          const ids = (window.__agf!.snapshot() as Snapshot).entities.map((entity) => entity.id);
          return ids.includes(target.selfId) && ids.includes(target.peerId);
        },
        { selfId: "player.bravo", peerId: "player.alpha" },
        { timeout: 5000 }
      );

      expect(await hasPlayer(alpha, "player.alpha")).toBe(true);
      expect(await hasPlayer(alpha, "player.bravo")).toBe(true);
      expect(await hasPlayer(bravo, "player.bravo")).toBe(true);
      expect(await hasPlayer(bravo, "player.alpha")).toBe(true);

      await alpha.evaluate(() => {
        window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyD" }));
      });
      await alpha.waitForTimeout(400);
      await alpha.evaluate(() => {
        window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyD" }));
      });

      await bravo.waitForFunction(
        () => {
          const snapshot = window.__agf!.snapshot() as Snapshot;
          const alphaEntity = snapshot.entities.find((entity) => entity.id === "player.alpha");
          if (alphaEntity === undefined) {
            return false;
          }
          const transform = alphaEntity.components["Transform"] as
            | { position: [number, number, number] }
            | undefined;
          return transform !== undefined && transform.position[0] > 0.1;
        },
        undefined,
        { timeout: 5000 }
      );

      const alphaOnBravo = (await bravo.evaluate(() => {
        const snapshot = window.__agf!.snapshot() as Snapshot;
        return snapshot.entities.find((entity) => entity.id === "player.alpha");
      })) as { components: Record<string, { position: [number, number, number] }> };
      expect(alphaOnBravo.components["Transform"]?.position[0]).toBeGreaterThan(0.1);

      await testInfo.attach("alpha-snapshot", {
        body: JSON.stringify(await alpha.evaluate(() => window.__agf!.snapshot()), null, 2),
        contentType: "application/json"
      });
    } finally {
      await alphaContext.close();
      await bravoContext.close();
    }
  } finally {
    await stopBackend(backend);
  }
});
