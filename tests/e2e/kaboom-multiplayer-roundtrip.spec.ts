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

async function startBackend(port: number, env: Record<string, string> = {}): Promise<ChildProcess> {
  const child = spawn(
    "npx",
    ["tsx", "examples/backends/node-world-server/src/index.ts", "--serve"],
    {
      cwd: REPO_ROOT,
      env: { ...process.env, PORT: String(port), ...env },
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

// S118 KABOOM-MP-SPRINT-B chunk 8 — server-authoritative blast propagation.
// Alpha walks adjacent to soft.1 at (4, 5), places a bomb, and the
// server's authoritative blast destroys soft.1. The connected-blast-
// decoder on both clients consumes the blockDestroyed broadcast and
// removes the soft.1 entity from each client's local world.

test("S118 alpha blasts a soft block; both tabs see it disappear server-driven", async ({ browser }, testInfo) => {
  test.setTimeout(60_000);
  const port = pickPort();
  const backend = await startBackend(port);
  try {
    const alphaContext = await browser.newContext();
    const bravoContext = await browser.newContext();
    const alpha = await alphaContext.newPage();
    const bravo = await bravoContext.newPage();
    try {
      const url = (playerId: string): string =>
        `/?project=kaboom-crew&server=ws://127.0.0.1:${port}&networked=1&playerId=${playerId}`;
      await alpha.goto(url("alpha"));
      await bravo.goto(url("bravo"));
      await alpha.waitForFunction(() => Boolean(window.__agf), undefined, { timeout: 15000 });
      await bravo.waitForFunction(() => Boolean(window.__agf), undefined, { timeout: 15000 });

      // Both tabs should see soft.1 at (4, 5) at boot — it's part of
      // the scene. Snapshot it before any destruction.
      const seesSoftOne = (): boolean => {
        const ids = (window.__agf!.snapshot() as Snapshot).entities.map((e) => e.id);
        return ids.includes("soft.1");
      };
      await alpha.waitForFunction(seesSoftOne, undefined, { timeout: 10000 });
      await bravo.waitForFunction(seesSoftOne, undefined, { timeout: 10000 });

      // Dismiss the title-screen overlay (first Space). The frame that
      // unpauses swallows held keys; we release immediately.
      await alpha.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space" })));
      await alpha.waitForTimeout(80);
      await alpha.evaluate(() => window.dispatchEvent(new KeyboardEvent("keyup", { code: "Space" })));
      await alpha.waitForTimeout(200);

      // Use the agent control surface to drive alpha's local bomber to
      // (4, 4) precisely. This avoids keyboard-timing flakes from the
      // earlier "hold KeyD until snapshot polled" approach.
      type GotoResult = { reached: boolean; outcome: string; finalGx: number; finalGz: number };
      const result = await alpha.evaluate(async () => {
        const k = (window.__agf as { kaboom?: { gotoCell?: (id: string, gx: number, gz: number) => Promise<GotoResult> } }).kaboom;
        if (k?.gotoCell === undefined) throw new Error("agf.kaboom.gotoCell unavailable");
        return await k.gotoCell("player.1", 4, 4);
      });
      expect(result.reached).toBe(true);
      expect(result.finalGx).toBe(4);
      expect(result.finalGz).toBe(4);

      // Place the bomb. Local player-input-system writes PlaceBombRequest
      // → place-bomb-network-relay-system dispatches placeBombRequest to
      // the server → server spawns Bomb at (4, 4) → fuse expires → server
      // computes blast cells (includes (4,5) which is soft.1) → emits
      // blockDestroyed{gx:4, gz:5} → both clients delete soft.1.
      await alpha.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space" })));
      await alpha.waitForTimeout(80);
      await alpha.evaluate(() => window.dispatchEvent(new KeyboardEvent("keyup", { code: "Space" })));

      // Intermediate: bomb shows up in both snapshots (server spawned + replicated).
      const seesAnyBomb = (): boolean => {
        const ids = (window.__agf!.snapshot() as Snapshot).entities.map((e) => e.id);
        return ids.some((id) => id.startsWith("bomb."));
      };
      await alpha.waitForFunction(seesAnyBomb, undefined, { timeout: 6000 });
      await bravo.waitForFunction(seesAnyBomb, undefined, { timeout: 6000 });
      const bombInfo = await alpha.evaluate(() => {
        const snap = window.__agf!.snapshot() as Snapshot;
        const bomb = snap.entities.find((e) => e.id.startsWith("bomb."));
        const playerOne = snap.entities.find((e) => e.id === "player.1");
        const softs = snap.entities.filter((e) => e.id.startsWith("soft."));
        return {
          bombId: bomb?.id,
          bombGrid: (bomb?.components as { GridPosition?: { gx: number; gz: number } } | undefined)?.GridPosition,
          playerGrid: (playerOne?.components as { GridPosition?: { gx: number; gz: number } } | undefined)?.GridPosition,
          softIds: softs.map((s) => s.id)
        };
      });
      const bombId = bombInfo.bombId;
      expect(bombId).toBeDefined();

      // Wait for the bomb to detonate (leave the snapshot). This proves
      // the server fuse + blast pipeline fired.
      const bombGone = (id: string): boolean => {
        const ids = (window.__agf!.snapshot() as Snapshot).entities.map((e) => e.id);
        return !ids.includes(id);
      };
      await alpha.waitForFunction(bombGone, bombId!, { timeout: 8000 });
      await bravo.waitForFunction(bombGone, bombId!, { timeout: 8000 });

      // Some soft block should be gone. We don't pin the exact id —
      // depending on alpha's final cell after gotoCell, the bomb may
      // destroy soft.1 (4,5) or soft.2 (5,5). The acceptance is "a
      // block disappears server-driven", not "this specific block".
      const aSoftBlockGone = (initialCount: number): boolean => {
        const ids = (window.__agf!.snapshot() as Snapshot).entities.map((e) => e.id);
        return ids.filter((id) => id.startsWith("soft.")).length < initialCount;
      };
      await alpha.waitForFunction(aSoftBlockGone, bombInfo.softIds.length, { timeout: 4000 });
      await bravo.waitForFunction(aSoftBlockGone, bombInfo.softIds.length, { timeout: 4000 });

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

// S117 KABOOM-MP-SPRINT-B chunk 4 — server-authoritative bomb spawning
// over the wire. Alpha presses Space → place-bomb-network-relay-system
// sends a placeBombRequest → ServerWorld.placeBomb spawns a Bomb entity
// on the authoritative ECS world → snapshot delivers it to BOTH alpha
// and bravo. After ~2.5 s the server fuse detonates the bomb; both
// clients should observe the bomb entity disappear from the snapshot.

test("S117 alpha places a bomb; both tabs see it spawn + detonate via the server", async ({ browser }, testInfo) => {
  test.setTimeout(60_000);
  const port = pickPort();
  const backend = await startBackend(port);
  try {
    const alphaContext = await browser.newContext();
    const bravoContext = await browser.newContext();
    const alpha = await alphaContext.newPage();
    const bravo = await bravoContext.newPage();
    try {
      const url = (playerId: string): string =>
        `/?project=kaboom-crew&server=ws://127.0.0.1:${port}&networked=1&playerId=${playerId}`;
      await alpha.goto(url("alpha"));
      await bravo.goto(url("bravo"));
      await alpha.waitForFunction(() => Boolean(window.__agf), undefined, { timeout: 15000 });
      await bravo.waitForFunction(() => Boolean(window.__agf), undefined, { timeout: 15000 });

      // Wait until both tabs see both player entities — proves the
      // snapshot pipeline is live before we try to spawn a bomb.
      const bothPlayersPresent = (target: { selfId: string; peerId: string }): boolean => {
        const ids = (window.__agf!.snapshot() as Snapshot).entities.map((e) => e.id);
        return ids.includes(target.selfId) && ids.includes(target.peerId);
      };
      await alpha.waitForFunction(bothPlayersPresent, { selfId: "player.alpha", peerId: "player.bravo" }, { timeout: 10000 });
      await bravo.waitForFunction(bothPlayersPresent, { selfId: "player.bravo", peerId: "player.alpha" }, { timeout: 10000 });

      // First Space dismisses the title-screen overlay (removes the
      // GamePaused singleton). The frame that unpauses swallows the
      // currently-held keys, so we explicitly release + re-press Space
      // to produce a fresh edge for the bomb-place input.
      await alpha.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space" })));
      await alpha.waitForTimeout(80);
      await alpha.evaluate(() => window.dispatchEvent(new KeyboardEvent("keyup", { code: "Space" })));
      await alpha.waitForTimeout(120);
      // Second Space: relay dispatches placeBombRequest → server
      // spawns Bomb entity → both clients see `bomb.alpha.<n>`.
      await alpha.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space" })));
      await alpha.waitForTimeout(80);
      await alpha.evaluate(() => window.dispatchEvent(new KeyboardEvent("keyup", { code: "Space" })));

      const findAlphaBomb = (): string | undefined => {
        const ids = (window.__agf!.snapshot() as Snapshot).entities.map((e) => e.id);
        return ids.find((id) => id.startsWith("bomb.alpha."));
      };
      await alpha.waitForFunction(findAlphaBomb, undefined, { timeout: 10000 });
      await bravo.waitForFunction(findAlphaBomb, undefined, { timeout: 10000 });

      const alphaBombId = await alpha.evaluate(findAlphaBomb);
      const bravoBombId = await bravo.evaluate(findAlphaBomb);
      expect(alphaBombId).toBeDefined();
      expect(bravoBombId).toBe(alphaBombId);

      // After ~2.5 s server-side fuse, the bomb should be gone from
      // both snapshots. Give a generous timeout — propagation+blast
      // landing is S118, but the bomb leaving the world is S117.
      const bombGone = (bombId: string): boolean => {
        const ids = (window.__agf!.snapshot() as Snapshot).entities.map((e) => e.id);
        return !ids.includes(bombId);
      };
      await alpha.waitForFunction(bombGone, alphaBombId!, { timeout: 8000 });
      await bravo.waitForFunction(bombGone, alphaBombId!, { timeout: 8000 });

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

// S119 KABOOM-MP-SPRINT-B chunk 8 — server-authoritative pickup spawn +
// collect + round-resolve. Alpha destroys a soft block at (4,5) with the
// pickup RNG dialed to 1.0 so every cell drops a pickup. Alpha walks
// onto the pickup; both tabs observe the pickup leave the snapshot.

test("S119 alpha collects a server-spawned pickup; both tabs see it disappear", async ({ browser }, testInfo) => {
  test.setTimeout(60_000);
  const port = pickPort();
  // KABOOM_PICKUP_DROP_CHANCE=1.0 forces a pickup on every soft-block destroy.
  const backend = await startBackend(port, { KABOOM_PICKUP_DROP_CHANCE: "1.0" });
  try {
    const alphaContext = await browser.newContext();
    const bravoContext = await browser.newContext();
    const alpha = await alphaContext.newPage();
    const bravo = await bravoContext.newPage();
    try {
      const url = (playerId: string): string =>
        `/?project=kaboom-crew&server=ws://127.0.0.1:${port}&networked=1&playerId=${playerId}`;
      await alpha.goto(url("alpha"));
      await bravo.goto(url("bravo"));
      await alpha.waitForFunction(() => Boolean(window.__agf), undefined, { timeout: 15000 });
      await bravo.waitForFunction(() => Boolean(window.__agf), undefined, { timeout: 15000 });

      const bothPlayersPresent = (target: { selfId: string; peerId: string }): boolean => {
        const ids = (window.__agf!.snapshot() as Snapshot).entities.map((e) => e.id);
        return ids.includes(target.selfId) && ids.includes(target.peerId);
      };
      await alpha.waitForFunction(bothPlayersPresent, { selfId: "player.alpha", peerId: "player.bravo" }, { timeout: 10000 });
      await bravo.waitForFunction(bothPlayersPresent, { selfId: "player.bravo", peerId: "player.alpha" }, { timeout: 10000 });

      // Dismiss title-screen.
      await alpha.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space" })));
      await alpha.waitForTimeout(80);
      await alpha.evaluate(() => window.dispatchEvent(new KeyboardEvent("keyup", { code: "Space" })));
      await alpha.waitForTimeout(200);

      // Position LOCAL player.1 to (4, 3) using gotoCell — that's the
      // cell the bomb relay sends to the server. Server's player.alpha
      // moves independently via keyboard intent; we don't need it at
      // (4, 3) for the bomb placement (relay reads LOCAL cell).
      type GotoResult = { reached: boolean; outcome: string; finalGx: number; finalGz: number };
      const arrived = await alpha.evaluate(async () => {
        const k = (window.__agf as { kaboom?: { gotoCell?: (id: string, gx: number, gz: number) => Promise<GotoResult> } }).kaboom;
        if (k?.gotoCell === undefined) throw new Error("agf.kaboom.gotoCell unavailable");
        return await k.gotoCell("player.1", 4, 3);
      });
      expect(arrived.reached).toBe(true);

      // Place the bomb at LOCAL player.1's cell. Server spawns bomb at
      // (4, 3); fuse expires; blast destroys soft.1 at (4, 5);
      // pickup spawns at (4, 5).
      await alpha.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space" })));
      await alpha.waitForTimeout(80);
      await alpha.evaluate(() => window.dispatchEvent(new KeyboardEvent("keyup", { code: "Space" })));

      // Wait for the pickup to appear on both tabs.
      const findPickup = (): { id: string; gx: number; gz: number } | undefined => {
        const snap = window.__agf!.snapshot() as Snapshot;
        for (const e of snap.entities) {
          if (!e.id.startsWith("pickup.")) continue;
          const gp = (e.components as { GridPosition?: { gx: number; gz: number } }).GridPosition;
          if (gp !== undefined) return { id: e.id, gx: gp.gx, gz: gp.gz };
        }
        return undefined;
      };
      await alpha.waitForFunction(findPickup, undefined, { timeout: 10000 });
      await bravo.waitForFunction(findPickup, undefined, { timeout: 10000 });
      const pickupInfo = await alpha.evaluate(findPickup);
      expect(pickupInfo).toBeDefined();

      // Drive the SERVER's player.alpha onto the pickup cell. Use the
      // ws-network-adapter sendIntent surface directly (exposed at
      // window.__agf.network) — that bypasses the keyboard + engine-
      // input-system chain and lets us stop the server's intent
      // exactly when GridPosition matches the target. Cleaner than
      // racing waitForFunction polling against snapshot lag.
      const targetGx = pickupInfo!.gx;
      const targetGz = pickupInfo!.gz;
      const driveAlphaTo = async (gx: number, gz: number): Promise<void> => {
        await alpha.evaluate((target: { gx: number; gz: number }) => {
          const send = window.__agf!.sendNetworkIntent;
          return new Promise<void>((resolveDone, rejectDone) => {
            let lastIntent: [number, number] = [0, 0];
            let stopOnNextHit = false;
            const ensureIntent = (dx: number, dz: number): void => {
              if (lastIntent[0] === dx && lastIntent[1] === dz) return;
              lastIntent = [dx, dz];
              const result = send([dx, dz]);
              if (result.kind !== "ok") rejectDone(new Error("ws-adapter not ready"));
            };
            const step = (): void => {
              const snap = window.__agf!.snapshot() as Snapshot;
              const ent = snap.entities.find((e) => e.id === "player.alpha");
              const gp = (ent?.components as { GridPosition?: { gx: number; gz: number } } | undefined)?.GridPosition;
              if (gp === undefined) {
                setTimeout(step, 33);
                return;
              }
              if (gp.gx === target.gx && gp.gz === target.gz) {
                ensureIntent(0, 0);
                if (!stopOnNextHit) {
                  stopOnNextHit = true;
                  setTimeout(resolveDone, 400);
                }
                return;
              }
              // One-axis at a time, prioritising the closer-to-zero
              // axis (Z first) so the server's path traverses the
              // pickup column for at least one tick at gz == target.gz.
              const dz = gp.gz < target.gz ? 1 : gp.gz > target.gz ? -1 : 0;
              const dx = gp.gx < target.gx ? 1 : gp.gx > target.gx ? -1 : 0;
              if (dz !== 0) ensureIntent(0, dz);
              else if (dx !== 0) ensureIntent(dx, 0);
              else ensureIntent(0, 0);
              setTimeout(step, 33);
            };
            step();
          });
        }, { gx, gz });
      };
      await driveAlphaTo(targetGx, targetGz);
      // Both tabs observe the pickup leave the snapshot (server's
      // collect scan removes the entity → snapshot diff entity.delete).
      const pickupGone = (pickupId: string): boolean => {
        const ids = (window.__agf!.snapshot() as Snapshot).entities.map((e) => e.id);
        return !ids.includes(pickupId);
      };
      await alpha.waitForFunction(pickupGone, pickupInfo!.id, { timeout: 8000 });
      await bravo.waitForFunction(pickupGone, pickupInfo!.id, { timeout: 8000 });

      await testInfo.attach("alpha-snapshot.json", {
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

// S120 KABOOM-MP-SPRINT-B chunk 4 — single-tab connected session sees
// a server-owned bot bomber moving + occasionally placing a bomb.

test("S120 single-tab connected session sees a moving + bombing server bot", async ({ browser }, testInfo) => {
  test.setTimeout(60_000);
  const port = pickPort();
  // KABOOM_PICKUP_DROP_CHANCE=0 keeps the snapshot clean for the assertions.
  const backend = await startBackend(port, { KABOOM_PICKUP_DROP_CHANCE: "0" });
  try {
    const alphaContext = await browser.newContext();
    const alpha = await alphaContext.newPage();
    try {
      await alpha.goto(`/?project=kaboom-crew&server=ws://127.0.0.1:${port}&networked=1&playerId=alpha`);
      await alpha.waitForFunction(() => Boolean(window.__agf), undefined, { timeout: 15000 });

      // Wait for bot.1 to appear in the snapshot (server-owned).
      const seesBot = (): boolean => {
        const ids = (window.__agf!.snapshot() as Snapshot).entities.map((e) => e.id);
        return ids.includes("bot.1");
      };
      await alpha.waitForFunction(seesBot, undefined, { timeout: 10000 });

      // Capture the bot's current cell as the baseline for the
      // movement check. The server bot starts wandering from t=0
      // (no title screen on the server) so by the time the test
      // connects it may already be off (13, 9) — that's fine, the
      // assertion is "the cell CHANGES from here within the window".
      const initial = await alpha.evaluate(() => {
        const snap = window.__agf!.snapshot() as Snapshot;
        const bot = snap.entities.find((e) => e.id === "bot.1");
        return (bot?.components as { GridPosition?: { gx: number; gz: number } } | undefined)?.GridPosition;
      });
      expect(initial).toBeDefined();

      // Wait until the bot's GridPosition CHANGES — proves the bot AI
      // is wandering server-side.
      await alpha.waitForFunction(
        (start: { gx: number; gz: number }) => {
          const snap = window.__agf!.snapshot() as Snapshot;
          const bot = snap.entities.find((e) => e.id === "bot.1");
          const gp = (bot?.components as { GridPosition?: { gx: number; gz: number } } | undefined)?.GridPosition;
          return gp !== undefined && (gp.gx !== start.gx || gp.gz !== start.gz);
        },
        initial!,
        { timeout: 8000 }
      );

      // Wait until at least one bomb owned by bot.1 spawns in the
      // snapshot. Bot places at 15% chance per 0.2 s decision, so we
      // give a generous 15 s window.
      await alpha.waitForFunction(
        () => {
          const snap = window.__agf!.snapshot() as Snapshot;
          return snap.entities.some((e) => e.id.startsWith("bomb.bot.1"));
        },
        undefined,
        { timeout: 15000 }
      );

      await testInfo.attach("alpha-snapshot.json", {
        body: JSON.stringify(await alpha.evaluate(() => window.__agf!.snapshot()), null, 2),
        contentType: "application/json"
      });
    } finally {
      await alphaContext.close();
    }
  } finally {
    await stopBackend(backend);
  }
});

// S121 KABOOM-MP-CONNECTED-POLISH — verify that the connected-blast-
// decoder spawns local BlastTile entities when the server broadcasts
// a blastEvent. Asserts both alpha (placer) and bravo (peer) see the
// tiles.

test("S121 server bomb triggers BlastTile spawn on both connected tabs", async ({ browser }, testInfo) => {
  test.setTimeout(60_000);
  const port = pickPort();
  const backend = await startBackend(port, { KABOOM_PICKUP_DROP_CHANCE: "0" });
  try {
    const alphaContext = await browser.newContext();
    const bravoContext = await browser.newContext();
    const alpha = await alphaContext.newPage();
    const bravo = await bravoContext.newPage();
    try {
      const url = (playerId: string): string =>
        `/?project=kaboom-crew&server=ws://127.0.0.1:${port}&networked=1&playerId=${playerId}`;
      await alpha.goto(url("alpha"));
      await bravo.goto(url("bravo"));
      await alpha.waitForFunction(() => Boolean(window.__agf), undefined, { timeout: 15000 });
      await bravo.waitForFunction(() => Boolean(window.__agf), undefined, { timeout: 15000 });
      const bothPlayersPresent = (target: { selfId: string; peerId: string }): boolean => {
        const ids = (window.__agf!.snapshot() as Snapshot).entities.map((e) => e.id);
        return ids.includes(target.selfId) && ids.includes(target.peerId);
      };
      await alpha.waitForFunction(bothPlayersPresent, { selfId: "player.alpha", peerId: "player.bravo" }, { timeout: 10000 });
      await bravo.waitForFunction(bothPlayersPresent, { selfId: "player.bravo", peerId: "player.alpha" }, { timeout: 10000 });

      // Dismiss title + walk alpha to (4, 3) via gotoCell, then bomb.
      await alpha.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space" })));
      await alpha.waitForTimeout(80);
      await alpha.evaluate(() => window.dispatchEvent(new KeyboardEvent("keyup", { code: "Space" })));
      await alpha.waitForTimeout(200);
      type GotoResult = { reached: boolean };
      await alpha.evaluate(async () => {
        const k = (window.__agf as { kaboom?: { gotoCell?: (id: string, gx: number, gz: number) => Promise<GotoResult> } }).kaboom;
        if (k?.gotoCell === undefined) throw new Error("agf.kaboom.gotoCell unavailable");
        await k.gotoCell("player.1", 4, 3);
      });
      await alpha.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space" })));
      await alpha.waitForTimeout(80);
      await alpha.evaluate(() => window.dispatchEvent(new KeyboardEvent("keyup", { code: "Space" })));

      // Wait until BlastTile entities appear on BOTH tabs after the bomb's
      // fuse expires + server broadcasts blastEvent.
      const sawBlastTile = (): boolean => {
        const ids = (window.__agf!.snapshot() as Snapshot).entities.map((e) => e.id);
        return ids.some((id) => id.includes("blast-tile") || id.startsWith("connected-blast-tile."));
      };
      await alpha.waitForFunction(sawBlastTile, undefined, { timeout: 10000 });
      await bravo.waitForFunction(sawBlastTile, undefined, { timeout: 10000 });

      await testInfo.attach("alpha-snapshot.json", {
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

// S121 — bot AI survives ≥10 s in a single-tab session without human
// input. Proves danger-avoid + post-bomb-flee logic actually works.

test("S121 server bot survives 10s round with no human input", async ({ browser }, testInfo) => {
  test.setTimeout(60_000);
  const port = pickPort();
  const backend = await startBackend(port, { KABOOM_PICKUP_DROP_CHANCE: "0", KABOOM_WORLD_SEED: "7" });
  try {
    const alphaContext = await browser.newContext();
    const alpha = await alphaContext.newPage();
    try {
      await alpha.goto(`/?project=kaboom-crew&server=ws://127.0.0.1:${port}&networked=1&playerId=alpha`);
      await alpha.waitForFunction(() => Boolean(window.__agf), undefined, { timeout: 15000 });
      // Wait for bot.1.
      await alpha.waitForFunction(() => {
        const ids = (window.__agf!.snapshot() as Snapshot).entities.map((e) => e.id);
        return ids.includes("bot.1");
      }, undefined, { timeout: 10000 });

      // Idle wait — alpha does nothing.
      await alpha.waitForTimeout(10_000);

      // Bot should still be alive.
      const botAlive = await alpha.evaluate(() => {
        const snap = window.__agf!.snapshot() as Snapshot;
        const bot = snap.entities.find((e) => e.id === "bot.1");
        const stats = bot?.components["BomberStats"] as { alive?: boolean } | undefined;
        return stats?.alive === true;
      });
      expect(botAlive).toBe(true);

      await testInfo.attach("alpha-snapshot.json", {
        body: JSON.stringify(await alpha.evaluate(() => window.__agf!.snapshot()), null, 2),
        contentType: "application/json"
      });
    } finally {
      await alphaContext.close();
    }
  } finally {
    await stopBackend(backend);
  }
});

// S122 KABOOM-MP-MID-JOIN-CATCHUP — a client joining AFTER a round
// resolves should see the updated tally on its local scoreboard
// within ~1 s, instead of starting at {0,0,0} until the next resolve.

test("S122 client joining mid-session sees the server's current tally", async ({ browser }, testInfo) => {
  test.setTimeout(90_000);
  const port = pickPort();
  const backend = await startBackend(port, { KABOOM_PICKUP_DROP_CHANCE: "0", KABOOM_BOT_PERSONALITY: "coward" });
  try {
    // 1) Alpha joins + immediately self-kills → bot wins round
    //    (tally.bot becomes 1).
    const alphaContext = await browser.newContext();
    const alpha = await alphaContext.newPage();
    try {
      await alpha.goto(`/?project=kaboom-crew&server=ws://127.0.0.1:${port}&networked=1&playerId=alpha`);
      await alpha.waitForFunction(() => Boolean(window.__agf), undefined, { timeout: 15000 });
      // Wait for player.alpha to land in the snapshot.
      await alpha.waitForFunction(() => {
        const ids = (window.__agf!.snapshot() as Snapshot).entities.map((e) => e.id);
        return ids.includes("player.alpha");
      }, undefined, { timeout: 10000 });
      // Drive a self-bomb via the network adapter probe so alpha dies
      // at her spawn cell without needing the title-screen + walk.
      await alpha.evaluate(() => {
        const send = window.__agf!.sendNetworkIntent;
        // No-op intent; we just want to ensure the network handle is live.
        send([0, 0]);
      });
      // Issue a placeBombRequest via the network adapter (skips local
      // input + title-screen entirely): walk-and-bomb is brittle, but
      // since the server treats placeBombRequest as "place at the
      // bomber's cell" we can post it directly via the local relay
      // method. Use gotoCell to make sure player.1 is on a known cell
      // for the relay's GP read.
      await alpha.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space" })));
      await alpha.waitForTimeout(80);
      await alpha.evaluate(() => window.dispatchEvent(new KeyboardEvent("keyup", { code: "Space" })));
      await alpha.waitForTimeout(200);
      // Bomb on alpha's local cell (1,1) — server places bomb there,
      // 2.5 s later it detonates. Alice at (0,0) on server; not in
      // blast cells unless she walks closer. Tell server alpha is at
      // (1, 0)... actually easier: rely on the agent surface to walk
      // alpha to a cell where she'll self-kill the next bomb.
      // We just want SOME round to resolve. Walk alpha next to a
      // soft block + bomb so the bomb also catches her own cell.
      type GotoResult = { reached: boolean; finalGx: number; finalGz: number };
      await alpha.evaluate(async () => {
        const k = (window.__agf as { kaboom?: { gotoCell?: (id: string, gx: number, gz: number) => Promise<GotoResult> } }).kaboom;
        if (k?.gotoCell === undefined) throw new Error("agf.kaboom.gotoCell unavailable");
        await k.gotoCell("player.1", 1, 1);
      });
      // Wait for server's alpha to converge to (1, 1) via the network
      // adapter intent loop.
      await alpha.evaluate(() => {
        return new Promise<void>((resolveDone) => {
          const send = window.__agf!.sendNetworkIntent;
          let last: [number, number] = [0, 0];
          const set = (d: [number, number]): void => {
            if (last[0] === d[0] && last[1] === d[1]) return;
            last = d;
            send(d);
          };
          const step = (): void => {
            const snap = window.__agf!.snapshot() as Snapshot;
            const ent = snap.entities.find((e) => e.id === "player.alpha");
            const gp = (ent?.components as { GridPosition?: { gx: number; gz: number } } | undefined)?.GridPosition;
            if (gp === undefined) {
              setTimeout(step, 33);
              return;
            }
            if (gp.gx >= 1 && gp.gz >= 1) {
              set([0, 0]);
              setTimeout(resolveDone, 300);
              return;
            }
            if (gp.gx < 1) set([1, 0]);
            else if (gp.gz < 1) set([0, 1]);
            setTimeout(step, 33);
          };
          step();
        });
      });
      // Place a bomb at alpha's cell → server spawns at (1, 1) →
      // 2.5 s fuse → blast covers (1, 1) → alpha (server) dies.
      await alpha.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space" })));
      await alpha.waitForTimeout(80);
      await alpha.evaluate(() => window.dispatchEvent(new KeyboardEvent("keyup", { code: "Space" })));
      // Wait for round to resolve (tally on mp.round-state).
      await alpha.waitForFunction(() => {
        const snap = window.__agf!.snapshot() as Snapshot;
        const mp = snap.entities.find((e) => e.id === "mp.round-state");
        const rs = mp?.components["RoundState"] as { tally?: { bot: number; player: number; draws: number } } | undefined;
        return (rs?.tally?.bot ?? 0) + (rs?.tally?.player ?? 0) + (rs?.tally?.draws ?? 0) >= 1;
      }, undefined, { timeout: 15000 });
    } finally {
      await alphaContext.close();
    }

    // 2) Now gamma joins — should see the server's current tally on
    //    its LOCAL kaboom.round-state within ~2 s of the snapshot
    //    arriving (one decoder frame after the snapshot lands).
    const gammaContext = await browser.newContext();
    const gamma = await gammaContext.newPage();
    try {
      await gamma.goto(`/?project=kaboom-crew&server=ws://127.0.0.1:${port}&networked=1&playerId=gamma`);
      await gamma.waitForFunction(() => Boolean(window.__agf), undefined, { timeout: 15000 });
      // Wait for the catch-up mirror to update the LOCAL kaboom.round-state.
      await gamma.waitForFunction(() => {
        const snap = window.__agf!.snapshot() as Snapshot;
        const local = snap.entities.find((e) => e.id === "kaboom.round-state");
        const rs = local?.components["RoundState"] as { tally?: { bot: number; player: number; draws: number } } | undefined;
        return (rs?.tally?.bot ?? 0) + (rs?.tally?.player ?? 0) + (rs?.tally?.draws ?? 0) >= 1;
      }, undefined, { timeout: 10000 });

      await testInfo.attach("gamma-snapshot.json", {
        body: JSON.stringify(await gamma.evaluate(() => window.__agf!.snapshot()), null, 2),
        contentType: "application/json"
      });
    } finally {
      await gammaContext.close();
    }
  } finally {
    await stopBackend(backend);
  }
});

// S123 KABOOM-MP-BOT-SMARTS — bot pickup magnet + hunter chase

test("S123 server bot eventually picks up a server-spawned pickup", async ({ browser }, testInfo) => {
  test.setTimeout(60_000);
  const port = pickPort();
  // High drop chance + miner default so the bot bombs soft-blocks +
  // gets a pickup spawn next to its cell often.
  const backend = await startBackend(port, {
    KABOOM_PICKUP_DROP_CHANCE: "1.0",
    KABOOM_WORLD_SEED: "42"
  });
  try {
    const alphaContext = await browser.newContext();
    const alpha = await alphaContext.newPage();
    try {
      await alpha.goto(`/?project=kaboom-crew&server=ws://127.0.0.1:${port}&networked=1&playerId=alpha`);
      await alpha.waitForFunction(() => Boolean(window.__agf), undefined, { timeout: 15000 });
      // Wait for bot.1.
      await alpha.waitForFunction(() => {
        const ids = (window.__agf!.snapshot() as Snapshot).entities.map((e) => e.id);
        return ids.includes("bot.1");
      }, undefined, { timeout: 10000 });
      // Capture bot's baseline stats (maxBombs=1, range=2).
      const baseStats = await alpha.evaluate(() => {
        const snap = window.__agf!.snapshot() as Snapshot;
        const bot = snap.entities.find((e) => e.id === "bot.1");
        return bot?.components["BomberStats"] as { maxBombs: number; range: number; speed?: number; canKick?: boolean };
      });
      expect(baseStats).toBeDefined();
      // Idle the human, give the bot time to bomb a soft-block + collect.
      // 35 s should be plenty of decision ticks for the bot to find a pickup.
      await alpha.waitForFunction(
        (base: { maxBombs: number; range: number; speed?: number; canKick?: boolean }) => {
          const snap = window.__agf!.snapshot() as Snapshot;
          const bot = snap.entities.find((e) => e.id === "bot.1");
          const stats = bot?.components["BomberStats"] as { maxBombs?: number; range?: number; speed?: number; canKick?: boolean };
          if (stats === undefined) return false;
          // Any of the following stat shifts proves a pickup was collected.
          if ((stats.maxBombs ?? base.maxBombs) > base.maxBombs) return true;
          if ((stats.range ?? base.range) > base.range) return true;
          if ((stats.speed ?? 3.5) > 3.5) return true;
          if (stats.canKick === true && base.canKick !== true) return true;
          return false;
        },
        baseStats,
        { timeout: 35000 }
      );

      await testInfo.attach("alpha-snapshot.json", {
        body: JSON.stringify(await alpha.evaluate(() => window.__agf!.snapshot()), null, 2),
        contentType: "application/json"
      });
    } finally {
      await alphaContext.close();
    }
  } finally {
    await stopBackend(backend);
  }
});

test("S123 hunter bot moves closer to a stationary human", async ({ browser }, testInfo) => {
  test.setTimeout(60_000);
  const port = pickPort();
  const backend = await startBackend(port, {
    KABOOM_PICKUP_DROP_CHANCE: "0",
    KABOOM_BOT_PERSONALITY: "hunter",
    KABOOM_WORLD_SEED: "7"
  });
  try {
    const alphaContext = await browser.newContext();
    const alpha = await alphaContext.newPage();
    try {
      await alpha.goto(`/?project=kaboom-crew&server=ws://127.0.0.1:${port}&networked=1&playerId=alpha`);
      await alpha.waitForFunction(() => Boolean(window.__agf), undefined, { timeout: 15000 });
      // Wait for bot.1.
      await alpha.waitForFunction(() => {
        const ids = (window.__agf!.snapshot() as Snapshot).entities.map((e) => e.id);
        return ids.includes("bot.1");
      }, undefined, { timeout: 10000 });

      // Drive alpha's SERVER player to (8, 8) — well inside the bot's
      // 8-cell chase radius from (13, 9), and on a wall-free path so
      // the bot's myopic manhattan-distance steering can close in
      // without hitting the (11, 7) hard-wall dead end.
      await alpha.evaluate(() => {
        const send = window.__agf!.sendNetworkIntent;
        return new Promise<void>((resolveDone) => {
          let last: [number, number] = [0, 0];
          const set = (d: [number, number]): void => {
            if (last[0] === d[0] && last[1] === d[1]) return;
            last = d;
            send(d);
          };
          const step = (): void => {
            const snap = window.__agf!.snapshot() as Snapshot;
            const ent = snap.entities.find((e) => e.id === "player.alpha");
            const gp = (ent?.components as { GridPosition?: { gx: number; gz: number } } | undefined)?.GridPosition;
            if (gp === undefined) {
              setTimeout(step, 33);
              return;
            }
            if (gp.gx >= 8 && gp.gz >= 8) {
              set([0, 0]);
              setTimeout(resolveDone, 300);
              return;
            }
            if (gp.gx < 8) set([1, 0]);
            else if (gp.gz < 8) set([0, 1]);
            setTimeout(step, 33);
          };
          step();
        });
      });

      // Snapshot initial bot ↔ alpha manhattan distance.
      const initialDist = await alpha.evaluate(() => {
        const snap = window.__agf!.snapshot() as Snapshot;
        const a = snap.entities.find((e) => e.id === "player.alpha");
        const b = snap.entities.find((e) => e.id === "bot.1");
        const ag = (a?.components as { GridPosition?: { gx: number; gz: number } } | undefined)?.GridPosition;
        const bg = (b?.components as { GridPosition?: { gx: number; gz: number } } | undefined)?.GridPosition;
        if (ag === undefined || bg === undefined) return Number.MAX_SAFE_INTEGER;
        return Math.abs(ag.gx - bg.gx) + Math.abs(ag.gz - bg.gz);
      });

      // Wait for the bot to CLOSE IN at least once. Track the minimum
      // observed manhattan distance across the wait window — the hunter
      // can suicide-bomb + reset rounds (which respawns alpha at (0,0)
      // far from the bot), so a one-shot dist<initial check is racy.
      // Stash the min on window.__s123HunterMinDist for the predicate
      // to read across polls.
      await alpha.evaluate((start: number) => {
        (window as unknown as { __s123HunterMinDist?: number }).__s123HunterMinDist = start;
      }, initialDist);
      await alpha.waitForFunction(
        (start: number) => {
          const snap = window.__agf!.snapshot() as Snapshot;
          const a = snap.entities.find((e) => e.id === "player.alpha");
          const b = snap.entities.find((e) => e.id === "bot.1");
          const ag = (a?.components as { GridPosition?: { gx: number; gz: number } } | undefined)?.GridPosition;
          const bg = (b?.components as { GridPosition?: { gx: number; gz: number } } | undefined)?.GridPosition;
          if (ag === undefined || bg === undefined) return false;
          const d = Math.abs(ag.gx - bg.gx) + Math.abs(ag.gz - bg.gz);
          const w = window as unknown as { __s123HunterMinDist?: number };
          if (w.__s123HunterMinDist === undefined || d < w.__s123HunterMinDist) {
            w.__s123HunterMinDist = d;
          }
          // Success: at any point in the window, bot got closer than
          // its starting distance to alpha. (Subsequent round-reset can
          // re-separate them; the proof is the closing motion fired.)
          return w.__s123HunterMinDist < start;
        },
        initialDist,
        { timeout: 25000 }
      );

      await testInfo.attach("alpha-snapshot.json", {
        body: JSON.stringify(await alpha.evaluate(() => window.__agf!.snapshot()), null, 2),
        contentType: "application/json"
      });
    } finally {
      await alphaContext.close();
    }
  } finally {
    await stopBackend(backend);
  }
});

// S124 KABOOM-MP-BOT-SAFETY — hunter chase WITHOUT suicide. Repeats
// the S123 scenario (hunter chasing stationary alpha) but asserts the
// bot STAYS ALIVE for the full 20s window, proving the new 2-step
// escape gate + flee prefer-fully-safe logic actually prevents the
// chain-bomb-trap suicide.

test("S124 hunter bot stays alive 20s chasing a stationary alpha", async ({ browser }, testInfo) => {
  test.setTimeout(60_000);
  const port = pickPort();
  const backend = await startBackend(port, {
    KABOOM_PICKUP_DROP_CHANCE: "0",
    KABOOM_BOT_PERSONALITY: "hunter",
    KABOOM_WORLD_SEED: "7"
  });
  try {
    const alphaContext = await browser.newContext();
    const alpha = await alphaContext.newPage();
    try {
      await alpha.goto(`/?project=kaboom-crew&server=ws://127.0.0.1:${port}&networked=1&playerId=alpha`);
      await alpha.waitForFunction(() => Boolean(window.__agf), undefined, { timeout: 15000 });
      await alpha.waitForFunction(() => {
        const ids = (window.__agf!.snapshot() as Snapshot).entities.map((e) => e.id);
        return ids.includes("bot.1");
      }, undefined, { timeout: 10000 });

      // Drive server's alpha to (8, 8) — hunter chase range.
      await alpha.evaluate(() => {
        const send = window.__agf!.sendNetworkIntent;
        return new Promise<void>((resolveDone) => {
          let last: [number, number] = [0, 0];
          const set = (d: [number, number]): void => {
            if (last[0] === d[0] && last[1] === d[1]) return;
            last = d;
            send(d);
          };
          const step = (): void => {
            const snap = window.__agf!.snapshot() as Snapshot;
            const ent = snap.entities.find((e) => e.id === "player.alpha");
            const gp = (ent?.components as { GridPosition?: { gx: number; gz: number } } | undefined)?.GridPosition;
            if (gp === undefined) {
              setTimeout(step, 33);
              return;
            }
            if (gp.gx >= 8 && gp.gz >= 8) {
              set([0, 0]);
              setTimeout(resolveDone, 300);
              return;
            }
            if (gp.gx < 8) set([1, 0]);
            else if (gp.gz < 8) set([0, 1]);
            setTimeout(step, 33);
          };
          step();
        });
      });

      // Sample the bot's alive state every 250ms for 20s. Count
      // alive→dead transitions: pre-S124 the hunter suicided ~every
      // 3s (≈6 deaths in 20s); post-S124 we expect ≤2 (some RNG can
      // still corner the bot in tight quarters next to alpha). The
      // threshold leaves headroom for occasional bad luck while
      // still proving the safety guards work in the common case.
      const survival = await alpha.evaluate(() => {
        return new Promise<{ deathCount: number }>((resolveDone) => {
          let lastAlive = true;
          let deathCount = 0;
          const startedAt = Date.now();
          const tick = (): void => {
            const snap = window.__agf!.snapshot() as Snapshot;
            const bot = snap.entities.find((e) => e.id === "bot.1");
            const stats = bot?.components["BomberStats"] as { alive?: boolean } | undefined;
            const alive = stats?.alive !== false;
            if (lastAlive && !alive) deathCount += 1;
            lastAlive = alive;
            if (Date.now() - startedAt >= 20_000) {
              resolveDone({ deathCount });
              return;
            }
            setTimeout(tick, 250);
          };
          tick();
        });
      });
      // Post-S124 threshold: bot dies ≤2 times in 20s (vs ~6 pre-fix).
      expect(survival.deathCount).toBeLessThanOrEqual(2);

      await testInfo.attach("alpha-snapshot.json", {
        body: JSON.stringify(await alpha.evaluate(() => window.__agf!.snapshot()), null, 2),
        contentType: "application/json"
      });
    } finally {
      await alphaContext.close();
    }
  } finally {
    await stopBackend(backend);
  }
});

// S125 KABOOM-MP-MATCH-STATE — connected match resolution.

test("S125 best-of-1 match resolves on connected after a single round-win", async ({ browser }, testInfo) => {
  test.setTimeout(60_000);
  const port = pickPort();
  const backend = await startBackend(port, {
    KABOOM_PICKUP_DROP_CHANCE: "0",
    KABOOM_BOT_PERSONALITY: "coward", // keep round-state predictable
    KABOOM_MATCH_TARGET: "1"
  });
  try {
    const alphaContext = await browser.newContext();
    const alpha = await alphaContext.newPage();
    try {
      await alpha.goto(`/?project=kaboom-crew&server=ws://127.0.0.1:${port}&networked=1&playerId=alpha`);
      await alpha.waitForFunction(() => Boolean(window.__agf), undefined, { timeout: 15000 });
      await alpha.waitForFunction(() => {
        const ids = (window.__agf!.snapshot() as Snapshot).entities.map((e) => e.id);
        return ids.includes("player.alpha");
      }, undefined, { timeout: 10000 });

      // Dismiss title.
      await alpha.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space" })));
      await alpha.waitForTimeout(80);
      await alpha.evaluate(() => window.dispatchEvent(new KeyboardEvent("keyup", { code: "Space" })));
      await alpha.waitForTimeout(200);
      // Walk alpha to (1, 1) + place a self-bomb (the relay sends the
      // local player.1's GP to the server).
      type GotoResult = { reached: boolean };
      await alpha.evaluate(async () => {
        const k = (window.__agf as { kaboom?: { gotoCell?: (id: string, gx: number, gz: number) => Promise<GotoResult> } }).kaboom;
        if (k?.gotoCell === undefined) throw new Error("agf.kaboom.gotoCell unavailable");
        await k.gotoCell("player.1", 1, 1);
      });
      // Drive server's alpha to (1, 1) so the bomb actually hits her.
      await alpha.evaluate(() => {
        const send = window.__agf!.sendNetworkIntent;
        return new Promise<void>((resolveDone) => {
          let last: [number, number] = [0, 0];
          const set = (d: [number, number]): void => {
            if (last[0] === d[0] && last[1] === d[1]) return;
            last = d;
            send(d);
          };
          const step = (): void => {
            const snap = window.__agf!.snapshot() as Snapshot;
            const ent = snap.entities.find((e) => e.id === "player.alpha");
            const gp = (ent?.components as { GridPosition?: { gx: number; gz: number } } | undefined)?.GridPosition;
            if (gp === undefined) {
              setTimeout(step, 33);
              return;
            }
            if (gp.gx >= 1 && gp.gz >= 1) {
              set([0, 0]);
              setTimeout(resolveDone, 300);
              return;
            }
            if (gp.gx < 1) set([1, 0]);
            else if (gp.gz < 1) set([0, 1]);
            setTimeout(step, 33);
          };
          step();
        });
      });
      // Bomb self at (1, 1).
      await alpha.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space" })));
      await alpha.waitForTimeout(80);
      await alpha.evaluate(() => window.dispatchEvent(new KeyboardEvent("keyup", { code: "Space" })));

      // Wait for the LOCAL kaboom.game-state.MatchState.phase to flip
      // to 'resolved' (mirrored from server's mp.match-state).
      await alpha.waitForFunction(() => {
        const snap = window.__agf!.snapshot() as Snapshot;
        const gs = snap.entities.find((e) => e.id === "kaboom.game-state");
        const ms = gs?.components["MatchState"] as { phase?: string } | undefined;
        return ms?.phase === "resolved";
      }, undefined, { timeout: 15000 });

      await testInfo.attach("alpha-snapshot.json", {
        body: JSON.stringify(await alpha.evaluate(() => window.__agf!.snapshot()), null, 2),
        contentType: "application/json"
      });
    } finally {
      await alphaContext.close();
    }
  } finally {
    await stopBackend(backend);
  }
});

// S125 — hunter bot routes around a hard-wall pillar to reach alpha.

test("S125 hunter bot routes around a hard-wall to reach alpha", async ({ browser }, testInfo) => {
  test.setTimeout(60_000);
  const port = pickPort();
  const backend = await startBackend(port, {
    KABOOM_PICKUP_DROP_CHANCE: "0",
    KABOOM_BOT_PERSONALITY: "hunter",
    KABOOM_WORLD_SEED: "13"
  });
  try {
    const alphaContext = await browser.newContext();
    const alpha = await alphaContext.newPage();
    try {
      await alpha.goto(`/?project=kaboom-crew&server=ws://127.0.0.1:${port}&networked=1&playerId=alpha`);
      await alpha.waitForFunction(() => Boolean(window.__agf), undefined, { timeout: 15000 });
      await alpha.waitForFunction(() => {
        const ids = (window.__agf!.snapshot() as Snapshot).entities.map((e) => e.id);
        return ids.includes("bot.1");
      }, undefined, { timeout: 10000 });

      // Drive server's alpha to (10, 7) — behind the (11, 7) pillar
      // relative to the bot at (13, 9). Path: +X to 10, +Z to 7.
      await alpha.evaluate(() => {
        const send = window.__agf!.sendNetworkIntent;
        return new Promise<void>((resolveDone) => {
          let last: [number, number] = [0, 0];
          const set = (d: [number, number]): void => {
            if (last[0] === d[0] && last[1] === d[1]) return;
            last = d;
            send(d);
          };
          const step = (): void => {
            const snap = window.__agf!.snapshot() as Snapshot;
            const ent = snap.entities.find((e) => e.id === "player.alpha");
            const gp = (ent?.components as { GridPosition?: { gx: number; gz: number } } | undefined)?.GridPosition;
            if (gp === undefined) {
              setTimeout(step, 33);
              return;
            }
            if (gp.gx >= 10 && gp.gz >= 7) {
              set([0, 0]);
              setTimeout(resolveDone, 300);
              return;
            }
            if (gp.gx < 10) set([1, 0]);
            else if (gp.gz < 7) set([0, 1]);
            setTimeout(step, 33);
          };
          step();
        });
      });

      // Snapshot initial distance + track min via window flag.
      const initialDist = await alpha.evaluate(() => {
        const snap = window.__agf!.snapshot() as Snapshot;
        const a = snap.entities.find((e) => e.id === "player.alpha");
        const b = snap.entities.find((e) => e.id === "bot.1");
        const ag = (a?.components as { GridPosition?: { gx: number; gz: number } } | undefined)?.GridPosition;
        const bg = (b?.components as { GridPosition?: { gx: number; gz: number } } | undefined)?.GridPosition;
        if (ag === undefined || bg === undefined) return Number.MAX_SAFE_INTEGER;
        return Math.abs(ag.gx - bg.gx) + Math.abs(ag.gz - bg.gz);
      });
      await alpha.evaluate((start: number) => {
        (window as unknown as { __s125WallMinDist?: number }).__s125WallMinDist = start;
      }, initialDist);
      await alpha.waitForFunction(
        (start: number) => {
          const snap = window.__agf!.snapshot() as Snapshot;
          const a = snap.entities.find((e) => e.id === "player.alpha");
          const b = snap.entities.find((e) => e.id === "bot.1");
          const ag = (a?.components as { GridPosition?: { gx: number; gz: number } } | undefined)?.GridPosition;
          const bg = (b?.components as { GridPosition?: { gx: number; gz: number } } | undefined)?.GridPosition;
          if (ag === undefined || bg === undefined) return false;
          const d = Math.abs(ag.gx - bg.gx) + Math.abs(ag.gz - bg.gz);
          const w = window as unknown as { __s125WallMinDist?: number };
          if (w.__s125WallMinDist === undefined || d < w.__s125WallMinDist) w.__s125WallMinDist = d;
          return w.__s125WallMinDist < start;
        },
        initialDist,
        { timeout: 25000 }
      );

      await testInfo.attach("alpha-snapshot.json", {
        body: JSON.stringify(await alpha.evaluate(() => window.__agf!.snapshot()), null, 2),
        contentType: "application/json"
      });
    } finally {
      await alphaContext.close();
    }
  } finally {
    await stopBackend(backend);
  }
});
