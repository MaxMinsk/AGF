import { startRuntime, type RuntimeHandle, type RuntimeOptions } from "../engine/runtime/start";
import { SystemScheduler } from "../engine/core/systems/scheduler";
import { createSpinSystem } from "../engine/core/systems/spin-system";
import { AssetRegistry } from "../engine/runtime/asset-registry";
import { createMaterialLoader } from "../engine/runtime/asset-loaders/material-loader";
import { createPlayerInputSystem } from "../engine/runtime/player-input-system";
import { createGlbLoader } from "../engine/render/glb-loader";
import {
  startWsNetworkAdapter,
  type WsNetworkAdapterHandle
} from "../engine/runtime/network/ws-network-adapter";
import { createPickupSystem as createBeaconPickupSystem } from "../examples/beacon-world/src/systems/pickup-system";
import { createHazardSystem as createBeaconHazardSystem } from "../examples/beacon-world/src/systems/hazard-system";
import { createWorldSignalSystem as createBeaconWorldSignalSystem } from "../examples/beacon-world/src/systems/world-signal-system";
import { createRoundSystem as createBeaconRoundSystem } from "../examples/beacon-world/src/systems/round-system";
import { createRoundAutoResetSystem as createBeaconRoundAutoResetSystem } from "../examples/beacon-world/src/systems/round-auto-reset-system";
import { createNetworkDroneSyncSystem as createBeaconNetworkDroneSyncSystem } from "../examples/beacon-world/src/systems/network-drone-sync-system";
import { createRemotePresenceDecoratorSystem as createBeaconRemotePresenceDecoratorSystem } from "../examples/beacon-world/src/systems/remote-presence-decorator-system";
import { createRemotePresenceInterpolatorSystem as createBeaconRemotePresenceInterpolatorSystem } from "../examples/beacon-world/src/systems/remote-presence-interpolator-system";
import { resetBeaconRound } from "../examples/beacon-world/src/round-reset";
import { createHealthHud as createBeaconHealthHud, type HealthHudHandle } from "../examples/beacon-world/src/ui/health-hud";
import type { EngineCommand } from "../engine/core/commands/types";
import type { SceneInput } from "../engine/core/ecs/types";
import type { WorldSnapshot } from "../engine/runtime/inspect";

export type ProjectMeta = {
  name: string;
  render?: { background?: string };
  /**
   * Profile names this project supports, mirroring `project.json.profiles`.
   * The runtime picks one active profile (defaults to `profiles[0]`) and gates
   * system registration on it.
   */
  profiles?: ReadonlyArray<string>;
};

export type AppOptions = {
  /** WebSocket URL of a node-world-server style backend, e.g. `ws://localhost:8787`. */
  serverUrl?: string;
  /** Player id used in the outbound `player.join`. Defaults to a stable random id. */
  playerId?: string;
  /**
   * When true AND `serverUrl` is set, the local PlayerControlled drone stops
   * moving locally; PlayerInputSystem forwards normalised directions through
   * `intent.move`. The server's `player.<playerId>` entity appears in the
   * snapshot as a separate authoritative entity.
   */
  networked?: boolean;
  /**
   * Active profile selected at boot. Must be present in `project.profiles`.
   * Defaults to `project.profiles[0]` or `"static"`.
   */
  activeProfile?: string;
};

export type AppHandle = {
  readonly canvas: HTMLCanvasElement;
  applyCommands(commands: ReadonlyArray<EngineCommand>): void;
  snapshot(): WorldSnapshot;
  reloadAsset(ref: string): void;
  /** Active WS adapter, if `?server=` was provided. Useful for tests. */
  readonly network: WsNetworkAdapterHandle | undefined;
  /**
   * Project-local action. For Beacon World, re-arms all beacons, respawns
   * all consumed pickups and resets `RoundState` to `"active"`. Returns
   * the number of mutations applied. For other projects, returns 0.
   */
  resetRound(): number;
  dispose(): void;
};

export function createApp(
  root: HTMLElement,
  project: ProjectMeta,
  scene: SceneInput,
  projectId: string,
  availableProjectIds: ReadonlyArray<string> = [projectId],
  options: AppOptions = {}
): AppHandle {
  root.textContent = "";

  const shell = document.createElement("main");
  shell.className = "app-shell";

  const canvas = document.createElement("canvas");
  canvas.className = "engine-canvas";
  canvas.setAttribute("data-testid", "engine-canvas");

  const status = document.createElement("section");
  status.className = "status-panel";
  status.setAttribute("aria-label", "Engine status");
  status.setAttribute("data-testid", "status-panel");

  const switcherLinks = availableProjectIds
    .map((id) =>
      id === projectId
        ? `<strong data-testid="project-link-active">${escapeText(id)}</strong>`
        : `<a href="?project=${encodeURIComponent(id)}" data-testid="project-link-${escapeText(id)}">${escapeText(id)}</a>`
    )
    .join(" · ");

  status.innerHTML = `
    <h1 class="status-title" data-testid="project-name">${escapeText(project.name)}</h1>
    <p class="status-copy">Three.js renderer running. Scene is loaded from JSON through the pragmatic ECS. Edit the scene file to hot-reload.</p>
    <p class="status-copy">Project: <code data-testid="project-id">${escapeText(projectId)}</code> · ${switcherLinks}</p>
    ${renderConnectivityHint(projectId, options)}
  `;

  shell.append(canvas, status);
  root.append(shell);

  const projectProfiles = project.profiles ?? ["static"];
  const networked = options.networked === true && options.serverUrl !== undefined;
  const requestedProfile =
    options.activeProfile !== undefined && projectProfiles.includes(options.activeProfile)
      ? options.activeProfile
      : undefined;
  const activeProfile =
    requestedProfile ??
    (networked && projectProfiles.includes("connected") ? "connected" : projectProfiles[0] ?? "static");
  const scheduler = new SystemScheduler({ activeProfiles: [activeProfile] });
  let network: WsNetworkAdapterHandle | undefined;
  const playerId = options.playerId ?? (networked ? randomPlayerId() : "local");
  const playerInputSystem = networked
    ? createPlayerInputSystem({
        onIntent: (direction) => network?.sendIntent(direction)
      })
    : createPlayerInputSystem();
  scheduler.register(playerInputSystem);
  scheduler.register(createSpinSystem());
  if (projectId === "beacon-world") {
    scheduler.register(createBeaconPickupSystem(), { profiles: ["static", "connected"] });
    scheduler.register(createBeaconHazardSystem(), { profiles: ["static", "connected"] });
    scheduler.register(createBeaconWorldSignalSystem(), { profiles: ["static", "connected"] });
    scheduler.register(createBeaconRoundSystem(), { profiles: ["static", "connected"] });
    scheduler.register(createBeaconRoundAutoResetSystem(), { profiles: ["static", "connected"] });
    if (networked) {
      scheduler.register(
        createBeaconNetworkDroneSyncSystem({
          playerId,
          getUnackedInputCount: (): number => {
            if (network === undefined) {
              return 0;
            }
            const acked = network.lastAckedFor(playerId);
            const highest = network.highestOutboundSequence();
            if (highest < 0) {
              return 0;
            }
            if (acked === undefined) {
              return highest + 1;
            }
            return Math.max(0, highest - acked);
          }
        }),
        { profiles: ["connected"] }
      );
      scheduler.register(
        createBeaconRemotePresenceDecoratorSystem({
          localPlayerId: playerId,
          mesh: "runtime/models/drone.glb",
          material: "runtime/materials/drone.material.json"
        }),
        { profiles: ["connected"] }
      );
      const interpolatorClock = (): number =>
        typeof performance !== "undefined" ? performance.now() / 1000 : Date.now() / 1000;
      scheduler.register(
        createBeaconRemotePresenceInterpolatorSystem({
          localPlayerId: playerId,
          getSnapshotBuffer: () => network?.getSnapshotBuffer() ?? new Map(),
          nowSeconds: interpolatorClock
        }),
        { profiles: ["connected"] }
      );
    }
  }

  const assetRegistry = new AssetRegistry({
    baseUrl: new URL(`examples/${projectId}/assets/`, window.location.href).href,
    loaders: [createMaterialLoader(), createGlbLoader()]
  });

  const runtimeOptions: RuntimeOptions = { canvas, scene, scheduler, assetRegistry };
  const background = project.render?.background;
  if (background !== undefined) {
    runtimeOptions.background = background;
  }
  if (import.meta.env.DEV) {
    runtimeOptions.devOverlay = true;
    runtimeOptions.devOverlayParent = shell;
  }

  const runtime: RuntimeHandle = startRuntime(runtimeOptions);

  let healthHud: HealthHudHandle | undefined;
  let keyboardResetHandler: ((event: KeyboardEvent) => void) | undefined;
  if (projectId === "beacon-world") {
    healthHud = createBeaconHealthHud(shell, runtime);
    keyboardResetHandler = (event: KeyboardEvent): void => {
      if (event.code !== "KeyR" || event.repeat) {
        return;
      }
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }
      resetBeaconRound(runtime.world);
    };
    window.addEventListener("keydown", keyboardResetHandler);
  }

  if (options.serverUrl !== undefined) {
    network = startWsNetworkAdapter({
      url: options.serverUrl,
      playerId,
      applyCommands: (commands) => runtime.applyCommands(commands),
      knownEntityIds: () => runtime.snapshot().entities.map((entity) => entity.id),
      reconnect: true
    });
  }

  return {
    canvas,
    applyCommands(commands): void {
      runtime.applyCommands(commands);
    },
    snapshot(): WorldSnapshot {
      return runtime.snapshot();
    },
    reloadAsset(ref): void {
      runtime.invalidateAsset(ref);
    },
    get network(): WsNetworkAdapterHandle | undefined {
      return network;
    },
    resetRound(): number {
      if (projectId !== "beacon-world") {
        return 0;
      }
      return resetBeaconRound(runtime.world);
    },
    dispose(): void {
      if (keyboardResetHandler !== undefined) {
        window.removeEventListener("keydown", keyboardResetHandler);
      }
      network?.dispose();
      healthHud?.dispose();
      runtime.stop();
      playerInputSystem.dispose();
      root.textContent = "";
    }
  };
}

function renderConnectivityHint(projectId: string, options: AppOptions): string {
  if (projectId !== "beacon-world") {
    return "";
  }
  if (options.serverUrl !== undefined && options.networked === true) {
    const safeUrl = escapeText(options.serverUrl);
    return `<p class="status-copy" data-testid="multiplayer-status">Multiplayer: connected to <code>${safeUrl}</code> as <code>${escapeText(options.playerId ?? "client")}</code>. Open this URL in another tab with a different <code>playerId</code> to share the world.</p>`;
  }
  const port = 8787;
  const base = "?project=beacon-world&server=" + encodeURIComponent(`ws://localhost:${port}`) + "&networked=1";
  const alphaUrl = `${base}&playerId=alpha`;
  const bravoUrl = `${base}&playerId=bravo`;
  return `<details class="status-copy" data-testid="multiplayer-hint" style="margin-top:8px;">
    <summary><strong>Play multiplayer</strong> — by default this tab is a local-only world.</summary>
    <p style="margin:6px 0 4px;">In a separate terminal:</p>
    <pre style="margin:0 0 6px; padding:6px 8px; background:rgba(255,255,255,0.05); border-radius:4px; font-size:11px;">npm run backend:node:serve</pre>
    <p style="margin:0 0 4px;">Then open two tabs (one per playerId):</p>
    <ul style="margin:0 0 0 1em; padding:0; font-size:11px;">
      <li><a href="${alphaUrl}" data-testid="multiplayer-link-alpha">Open as alpha</a></li>
      <li><a href="${bravoUrl}" data-testid="multiplayer-link-bravo">Open as bravo</a></li>
    </ul>
  </details>`;
}

function randomPlayerId(): string {
  const suffix = Math.random().toString(36).slice(2, 8);
  return `client-${suffix}`;
}

function escapeText(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return char;
    }
  });
}
