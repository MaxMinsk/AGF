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
import type {
  ProjectBootstrap,
  ProjectUiHandle
} from "../engine/runtime/project-bootstrap";
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
  /**
   * Project-specific bootstrap that registers systems, mounts UI, handles
   * restart, etc. Each example project ships its own bootstrap; the root app
   * does not import from `examples/`.
   */
  bootstrap?: ProjectBootstrap;
};

export type AppHandle = {
  readonly canvas: HTMLCanvasElement;
  applyCommands(commands: ReadonlyArray<EngineCommand>): void;
  snapshot(): WorldSnapshot;
  reloadAsset(ref: string): void;
  /** Active WS adapter, if `?server=` was provided. Useful for tests. */
  readonly network: WsNetworkAdapterHandle | undefined;
  /**
   * Delegates to the active bootstrap's `resetRound`, if it implements one.
   * Returns the number of mutations applied (`0` for projects without a
   * round concept).
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

  const projectProfiles = project.profiles ?? ["static"];
  const networked = options.networked === true && options.serverUrl !== undefined;
  const playerId = options.playerId ?? (networked ? randomPlayerId() : "local");
  const requestedProfile =
    options.activeProfile !== undefined && projectProfiles.includes(options.activeProfile)
      ? options.activeProfile
      : undefined;
  const activeProfile =
    requestedProfile ??
    (networked && projectProfiles.includes("connected") ? "connected" : projectProfiles[0] ?? "static");

  const bootstrap = options.bootstrap;
  const connectivityHint = bootstrap?.renderConnectivityHint?.({
    serverUrl: options.serverUrl,
    playerId: options.playerId,
    networked
  }) ?? "";

  status.innerHTML = `
    <h1 class="status-title" data-testid="project-name">${escapeText(project.name)}</h1>
    <p class="status-copy">Three.js renderer running. Scene is loaded from JSON through the pragmatic ECS. Edit the scene file to hot-reload.</p>
    <p class="status-copy">Project: <code data-testid="project-id">${escapeText(projectId)}</code> · ${switcherLinks}</p>
    ${connectivityHint}
  `;

  shell.append(canvas, status);
  root.append(shell);

  const scheduler = new SystemScheduler({ activeProfiles: [activeProfile] });
  let network: WsNetworkAdapterHandle | undefined;
  const playerInputSystem = networked
    ? createPlayerInputSystem({
        onIntent: (direction) => network?.sendIntent(direction)
      })
    : createPlayerInputSystem();
  scheduler.register(playerInputSystem);
  scheduler.register(createSpinSystem());

  bootstrap?.registerSystems({
    scheduler,
    playerId,
    networked,
    getNetwork: () => network
  });

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

  const projectUi: ProjectUiHandle | undefined = bootstrap?.attachUi?.({
    shell,
    runtime,
    playerId,
    networked
  });

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
      return bootstrap?.resetRound?.(runtime) ?? 0;
    },
    dispose(): void {
      projectUi?.dispose();
      network?.dispose();
      runtime.stop();
      playerInputSystem.dispose();
      root.textContent = "";
    }
  };
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
