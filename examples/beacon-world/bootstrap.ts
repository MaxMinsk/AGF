import { createPickupSystem } from "./src/systems/pickup-system";
import { createHazardSystem } from "./src/systems/hazard-system";
import { createWorldSignalSystem } from "./src/systems/world-signal-system";
import { createRoundSystem } from "./src/systems/round-system";
import { createRoundAutoResetSystem } from "./src/systems/round-auto-reset-system";
import { createNetworkDroneSyncSystem } from "./src/systems/network-drone-sync-system";
import { createRemotePresenceDecoratorSystem } from "./src/systems/remote-presence-decorator-system";
import { createRemotePresenceInterpolatorSystem } from "./src/systems/remote-presence-interpolator-system";
import { resetBeaconRound } from "./src/round-reset";
import { createHealthHud, type HealthHudHandle } from "./src/ui/health-hud";
import type {
  ProjectBootstrap,
  ProjectBootstrapContext,
  ProjectConnectivityHintInput,
  ProjectUiContext,
  ProjectUiHandle
} from "../../engine/runtime/project-bootstrap";
import type { RuntimeHandle } from "../../engine/runtime/start";

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

export const beaconWorldBootstrap: ProjectBootstrap = {
  registerSystems({ scheduler, playerId, networked, getNetwork }: ProjectBootstrapContext): void {
    scheduler.register(createPickupSystem(), { profiles: ["static", "connected"] });
    scheduler.register(createHazardSystem(), { profiles: ["static", "connected"] });
    scheduler.register(createWorldSignalSystem(), { profiles: ["static", "connected"] });
    scheduler.register(createRoundSystem(), { profiles: ["static", "connected"] });
    scheduler.register(createRoundAutoResetSystem(), { profiles: ["static", "connected"] });
    if (!networked) {
      return;
    }

    const PLAYER_SPEED_FALLBACK = 3.5;
    const droneSyncClock = (): number =>
      typeof performance !== "undefined" ? performance.now() / 1000 : Date.now() / 1000;
    scheduler.register(
      createNetworkDroneSyncSystem({
        playerId,
        playerSpeed: PLAYER_SPEED_FALLBACK,
        getPlayerSpeed: (): number =>
          getNetwork()?.lastServerPlayerSpeed() ?? PLAYER_SPEED_FALLBACK,
        nowSeconds: droneSyncClock,
        getUnackedInputCount: (): number => {
          const network = getNetwork();
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
        },
        getUnackedIntents: () => getNetwork()?.getUnackedIntents() ?? []
      }),
      { profiles: ["connected"] }
    );
    scheduler.register(
      createRemotePresenceDecoratorSystem({
        localPlayerId: playerId,
        mesh: "runtime/models/drone.glb",
        material: "runtime/materials/drone.material.json"
      }),
      { profiles: ["connected"] }
    );
    const interpolatorClock = (): number =>
      typeof performance !== "undefined" ? performance.now() / 1000 : Date.now() / 1000;
    scheduler.register(
      createRemotePresenceInterpolatorSystem({
        localPlayerId: playerId,
        getSnapshotBuffer: () => getNetwork()?.getSnapshotBuffer() ?? new Map(),
        nowSeconds: interpolatorClock
      }),
      { profiles: ["connected"] }
    );
  },

  attachUi({ shell, runtime }: ProjectUiContext): ProjectUiHandle {
    const healthHud: HealthHudHandle = createHealthHud(shell, runtime);
    const keyboardHandler = (event: KeyboardEvent): void => {
      if (event.code !== "KeyR" || event.repeat) {
        return;
      }
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }
      resetBeaconRound(runtime.world);
    };
    window.addEventListener("keydown", keyboardHandler);
    return {
      dispose(): void {
        window.removeEventListener("keydown", keyboardHandler);
        healthHud.dispose();
      }
    };
  },

  resetRound(runtime: RuntimeHandle): number {
    return resetBeaconRound(runtime.world);
  },

  renderConnectivityHint({ serverUrl, playerId, networked }: ProjectConnectivityHintInput): string {
    if (serverUrl !== undefined && networked) {
      const safeUrl = escapeText(serverUrl);
      const safePlayer = escapeText(playerId ?? "client");
      return `<p class="status-copy" data-testid="multiplayer-status">Multiplayer: connected to <code>${safeUrl}</code> as <code>${safePlayer}</code>. Open this URL in another tab with a different <code>playerId</code> to share the world.</p>`;
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
};
