// S114 KABOOM-MP-TWO-TAB-PLAYWRIGHT — live verification that two browser
// tabs share a Kaboom Crew arena via the Node reference world server.
//
// Covers:
//   - both tabs connect + see each other's player.<id> entity (S109).
//   - alpha presses WASD → bravo sees alpha's Transform.position update
//     (server integrates intent.move + echoes via snapshot).
//   - the local recipe in alpha propagates to a CharacterRecipe
//     component on the player.alpha entity visible in bravo (S112).
//   - the HUD's S114 "Multiplayer: N peer(s) online" line appears on
//     alpha once bravo connects (queryable via DOM textContent).

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

test("S114 two Kaboom Crew tabs see each other + recipe sync over the wire", async ({ browser }, testInfo) => {
  test.setTimeout(60_000);
  const port = pickPort();
  const backend = await startBackend(port);
  try {
    const alphaContext = await browser.newContext();
    const bravoContext = await browser.newContext();
    const alpha = await alphaContext.newPage();
    const bravo = await bravoContext.newPage();
    try {
      // Encode tiny distinct recipes — same seed produces identical
      // resolveRecipeFromSeed output, so we use different seeds.
      // base64-url-safe encoding of {"seed":"alpha"} and {"seed":"bravo"}.
      // Computed once + hard-coded so the test stays hermetic without
      // pulling in encodeRecipe at test time.
      const ALPHA_RECIPE = Buffer.from(JSON.stringify({ seed: "alpha" }), "utf8")
        .toString("base64")
        .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
      const BRAVO_RECIPE = Buffer.from(JSON.stringify({ seed: "bravo" }), "utf8")
        .toString("base64")
        .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

      const url = (playerId: string, recipe: string): string =>
        `/?project=kaboom-crew&server=ws://127.0.0.1:${port}&networked=1&playerId=${playerId}&recipe=${recipe}`;

      await alpha.goto(url("alpha", ALPHA_RECIPE));
      await bravo.goto(url("bravo", BRAVO_RECIPE));
      await alpha.waitForFunction(() => Boolean(window.__agf), undefined, { timeout: 15000 });
      await bravo.waitForFunction(() => Boolean(window.__agf), undefined, { timeout: 15000 });

      // 1. Both tabs see each other's player.<id> entity.
      await alpha.waitForFunction(
        (target: { selfId: string; peerId: string }) => {
          const ids = (window.__agf!.snapshot() as Snapshot).entities.map((e) => e.id);
          return ids.includes(target.selfId) && ids.includes(target.peerId);
        },
        { selfId: "player.alpha", peerId: "player.bravo" },
        { timeout: 10000 }
      );
      await bravo.waitForFunction(
        (target: { selfId: string; peerId: string }) => {
          const ids = (window.__agf!.snapshot() as Snapshot).entities.map((e) => e.id);
          return ids.includes(target.selfId) && ids.includes(target.peerId);
        },
        { selfId: "player.bravo", peerId: "player.alpha" },
        { timeout: 10000 }
      );

      // 2. S112 recipe sync — bravo sees alpha's CharacterRecipe in the
      //    snapshot entity. The server stored ALPHA_RECIPE and echoes
      //    it back.
      await bravo.waitForFunction(
        (expected: string) => {
          const snapshot = window.__agf!.snapshot() as Snapshot;
          const alphaEntity = snapshot.entities.find((e) => e.id === "player.alpha");
          const recipe = alphaEntity?.components["CharacterRecipe"] as { recipe?: string } | undefined;
          return recipe?.recipe === expected;
        },
        ALPHA_RECIPE,
        { timeout: 10000 }
      );

      // 3. Alpha presses KeyD, bravo sees alpha.Transform.position.x advance.
      await alpha.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyD" })));
      await alpha.waitForTimeout(600);
      await alpha.evaluate(() => window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyD" })));

      await bravo.waitForFunction(
        () => {
          const snapshot = window.__agf!.snapshot() as Snapshot;
          const alphaEntity = snapshot.entities.find((e) => e.id === "player.alpha");
          const transform = alphaEntity?.components["Transform"] as { position?: [number, number, number] } | undefined;
          return (transform?.position?.[0] ?? 0) > 0.1;
        },
        undefined,
        { timeout: 10000 }
      );

      // 4. S114 HUD line — alpha's stats panel should mention "1 peer(s) online".
      //    The kaboom-crew HUD writes plain text DOM; query for it.
      await alpha.waitForFunction(
        () => {
          const text = document.body.textContent ?? "";
          return /Multiplayer: 1 peer\(s\) online/.test(text);
        },
        undefined,
        { timeout: 10000 }
      );

      await testInfo.attach("alpha-snapshot.json", {
        body: JSON.stringify(await alpha.evaluate(() => window.__agf!.snapshot()), null, 2),
        contentType: "application/json"
      });
      await testInfo.attach("bravo-snapshot.json", {
        body: JSON.stringify(await bravo.evaluate(() => window.__agf!.snapshot()), null, 2),
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
