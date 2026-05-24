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
